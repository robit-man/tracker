const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function source(name){const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1);const next=html.slice(start+1).search(/^(?:async )?function /m);return html.slice(start,next<0?undefined:start+1+next)}
function track(kind){return {kind,readyState:'live',listeners:[],stop(){this.readyState='ended';this.stopped=true},addEventListener(name,fn){if(name==='ended')this.listeners.push(fn)},end(){this.readyState='ended';this.listeners.forEach(fn=>fn())}}}
function stream(...tracks){return {getTracks:()=>tracks,getVideoTracks:()=>tracks.filter(t=>t.kind==='video')}}
function harness(){
 const nodes=new Map(),sent=[],toasts=[];let nextId=0;
 const c=vm.createContext({localLive:null,liveCaptureRequest:0,liveLowLatency:false,actor:'source',liveMedia:new Map(),navigator:{mediaDevices:{}},crypto:{randomUUID:()=>String(++nextId)},Date,console,
  LIVE_HEARTBEAT_MS:4000,setInterval:()=>1,clearInterval:()=>{},
  $:q=>{if(!nodes.has(q))nodes.set(q,{textContent:'',dataset:{},classList:{add(){},remove(){}}});return nodes.get(q)},
  liveCaptureConstraints:mode=>({audio:mode!=='video',video:mode!=='audio'}),liveRecorderMime:()=> 'video/webm',
  liveEntryFromLocal:()=>({id:c.localLive.id,mode:c.localLive.mode}),closeLivePublisherPeer:()=>{},closeLiveViewer:()=>{},renderAll:()=>{},renderTree:()=>{},openLocalLivePreview:()=>{},wakeTransferTransports:()=>{},
  sendLiveAnnouncement:async()=>sent.push({type:'live-announce',id:c.localLive.id,mode:c.localLive.mode}),msg:(type,data)=>({type,...data}),broadcast:async m=>sent.push(m),toast:(...args)=>toasts.push(args),esc:s=>String(s)});
 for(const name of ['liveModeLabel','captureLiveStream','startLiveMedia','stopLiveMedia'])vm.runInContext(source(name),c);
 return {c,nodes,sent,toasts};
}
test('screen capture invokes the browser picker immediately and requests optional surface audio',async()=>{
 const {c,sent}=harness();const video=track('video'),audio=track('audio');let called=false,options;
 c.navigator.mediaDevices.getDisplayMedia=o=>{called=true;options=o;return Promise.resolve(stream(video,audio))};
 const starting=c.startLiveMedia('screen');assert.ok(called,'picker invocation stays within the click call stack');await starting;
 assert.equal(options.audio,true);assert.equal(options.video.frameRate.max,30);assert.equal(c.localLive.mode,'screen');assert.equal(c.localLive.name,'LIVE · SCREEN');assert.equal(sent[0].mode,'screen');
 audio.end();assert.ok(c.localLive,'ending optional surface audio does not end the video broadcast');
 video.end();assert.equal(c.localLive,null);assert.ok(audio.stopped);assert.ok(sent.some(m=>m.type==='live-end'));
});
test('canceling the screen picker preserves an active camera broadcast',async()=>{
 const {c,sent}=harness();const video=track('video');c.navigator.mediaDevices.getUserMedia=async()=>stream(video);await c.startLiveMedia('video');const previous=c.localLive;
 c.navigator.mediaDevices.getDisplayMedia=async()=>{throw Object.assign(new Error('Canceled'),{name:'NotAllowedError'})};await c.startLiveMedia('screen');
 assert.equal(c.localLive,previous);assert.equal(video.readyState,'live');assert.equal(sent.filter(m=>m.type==='live-end').length,0);
});
test('replacing camera with screen releases old capture without waiting for end signaling',async()=>{
 const {c}=harness();const camera=track('video'),screen=track('video');c.navigator.mediaDevices.getUserMedia=async()=>stream(camera);await c.startLiveMedia('video');
 c.broadcast=()=>new Promise(()=>{});c.navigator.mediaDevices.getDisplayMedia=async()=>stream(screen);await c.startLiveMedia('screen');
 assert.equal(camera.stopped,true);assert.equal(c.localLive.mode,'screen');camera.end();assert.equal(c.localLive.mode,'screen','an old track cannot stop the replacement');
});
test('stopping while the picker is open releases a late capture without publishing it',async()=>{
 const {c,sent}=harness();let resolve;c.navigator.mediaDevices.getDisplayMedia=()=>new Promise(r=>resolve=r);const starting=c.startLiveMedia('screen');await c.stopLiveMedia();
 const video=track('video');resolve(stream(video));await starting;assert.equal(video.stopped,true);assert.equal(c.localLive,null);assert.equal(sent.length,0);
});
test('a superseded picker cannot overwrite a newer capture',async()=>{
 const {c}=harness();let resolve;c.navigator.mediaDevices.getDisplayMedia=()=>new Promise(r=>resolve=r);const first=c.startLiveMedia('screen');const mic=track('audio');c.navigator.mediaDevices.getUserMedia=async()=>stream(mic);await c.startLiveMedia('audio');
 const video=track('video');resolve(stream(video));await first;assert.equal(video.stopped,true);assert.equal(c.localLive.mode,'audio');
});
test('unavailable screen capture leaves current broadcast intact and reports the limitation',async()=>{
 const {c,toasts}=harness();c.console={warn:()=>{}};const video=track('video');c.navigator.mediaDevices.getUserMedia=async()=>stream(video);await c.startLiveMedia('video');const old=c.localLive;await c.startLiveMedia('screen');
 assert.equal(c.localLive,old);assert.ok(toasts.at(-1)[0].includes('unavailable in this browser'));
});
test('video-only screen relay advertises only the tracks present in the capture',()=>{
 const {c}=harness();c.window={MediaRecorder:{}};c.MediaRecorder={isTypeSupported:()=>true};vm.runInContext(source('liveRecorderMime'),c);
 assert.equal(c.liveRecorderMime('screen',{getAudioTracks:()=>[]}), 'video/webm;codecs=vp8');
 assert.equal(c.liveRecorderMime('video',{getAudioTracks:()=>[]}), 'video/webm;codecs=vp8');
 assert.equal(c.liveRecorderMime('screen',{getAudioTracks:()=>[track('audio')]}), 'video/webm;codecs=vp8,opus');
 assert.equal(c.liveRecorderMime('audio',{getAudioTracks:()=>[track('audio')]}), 'audio/webm;codecs=opus');
});
test('duplicate watch requests preserve a connected peer or running relay encoder',async()=>{
 const {c}=harness();let closed=0;c.closeLivePublisherPeer=()=>closed++;vm.runInContext(source('handleLiveWatch'),c);
 for(const state of [{pc:{connectionState:'connected'}},{pc:{connectionState:'failed'},relay:{stopped:false}}]){
  c.localLive={id:'live',peers:new Map([['viewer',state]])};await c.handleLiveWatch({id:'live',actor:'viewer'});assert.equal(c.localLive.peers.get('viewer'),state);
 }
 assert.equal(closed,0);
});
test('late relay packets cannot replace a playing direct screen stream',async()=>{
 const {c}=harness();vm.runInContext(source('handleLiveBinary'),c);let decoded=0;c.decryptBytes=async()=>{decoded++;throw Error('unexpected relay takeover')};
 c.activeLiveViewer={id:'live',pc:{connectionState:'connected'},el:{srcObject:{},readyState:2}};await c.handleLiveBinary(new Uint8Array(),{metadata:{liveId:'live',seq:0}});assert.equal(decoded,0);
});
test('relay kickoff is armed before signaling completes and repeated watches reuse the pending peer',async()=>{
 const {c}=harness();const timers=[];let closed=0;
 c.localLive={id:'live',mode:'screen',name:'Screen',stream:stream(track('video')),peers:new Map(),watchers:new Set()};
 c.RTCPeerConnection=class{constructor(){this.connectionState='new'}addTrack(){}async createOffer(){return {type:'offer',sdp:'test'}}async setLocalDescription(sdp){this.localDescription=sdp}};
 c.rtcConfig=()=>({});c.setTimeout=fn=>{timers.push(fn);return timers.length};c.LIVE_RTC_FALLBACK_MS=2400;c.sendActorIngress=()=>new Promise(()=>{});c.closeLivePublisherPeer=()=>closed++;
 vm.runInContext(source('handleLiveWatch'),c);c.handleLiveWatch({id:'live',actor:'viewer'});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(timers.length,1,'relay fallback starts independently of pending broker signaling');const first=c.localLive.peers.get('viewer');await c.handleLiveWatch({id:'live',actor:'viewer'});assert.equal(c.localLive.peers.get('viewer'),first);assert.equal(closed,1,'only initial setup closes a previous peer');
});
test('a closed old peer cannot tear down its replacement',async()=>{
 const {c}=harness();let closed=0;
 c.localLive={id:'live',mode:'screen',stream:stream(track('video')),peers:new Map(),watchers:new Set()};c.rtcConfig=()=>({});c.setTimeout=()=>1;c.LIVE_RTC_FALLBACK_MS=2400;c.sendActorIngress=async()=>{};c.closeLivePublisherPeer=()=>closed++;
 c.RTCPeerConnection=class{constructor(){this.connectionState='new'}addTrack(){}async createOffer(){return {type:'offer'}}async setLocalDescription(sdp){this.localDescription=sdp}};
 vm.runInContext(source('handleLiveWatch'),c);await c.handleLiveWatch({id:'live',actor:'viewer'});const old=c.localLive.peers.get('viewer'),replacement={pc:{connectionState:'connected'}};c.localLive.peers.set('viewer',replacement);old.pc.connectionState='closed';old.pc.onconnectionstatechange();assert.equal(closed,1);assert.equal(c.localLive.peers.get('viewer'),replacement);
});

function chunkHarness(names){
 let nextId=0;const sent=[],c=vm.createContext({console,Uint8Array,Map,Set,Date,performance:{now:()=>1000},actor:'source',window:{},localLive:null,activeLiveViewer:null,liveMedia:new Map(),liveChunkSources:new Map(),verifiedMediaPaths:new Map(),CHUNK_SIZE:16,MP4_RAM_QUEUE_BUDGET_BYTES:64,SCHEDULER_TICK_MS:180,crypto:{randomUUID:()=>String(++nextId)},msg:(type,data)=>({type,relayBinary:2,...data}),sendActorIngress:async(a,m)=>sent.push({a,...m}),retireStreamServe:()=>{},sendLiveAnnouncement:async()=>{},$ :()=>({textContent:''}),liveRecorderMimes:()=>['video/webm'],closeLivePublisherPeer:()=>{},MediaRecorder:class{constructor(){this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive'}},setInterval:()=>1,streamPathHintsFor:()=>[],seedLivePathEvidence:()=>{},normalizeLiveWebm:(_,raw)=>raw,previewMediaSourceType:()=>({isTypeSupported:()=>true}),ensureLiveChunkPlayer:()=>{},retireLiveViewerSource:()=>{},resetLiveChunkPlayer:()=>{},tickLiveChunkViewer:()=>{}});
 for(const name of ['liveEncoderPolicy',...names])vm.runInContext(source(name),c);return{c,sent};
}
test('modern viewers use a retained byte source and duplicate watches preserve its encoder',async()=>{
 const{c,sent}=chunkHarness(['disposeLiveChunkSource','stopLiveRelayRecorder','liveJournalBudget','sendLiveChunkManifest','startLiveChunkRecorder','handleLiveChunkWatch']);
 c.RTCPeerConnection=class{constructor(){throw Error('media negotiation must not run')}};
 const live={id:'live',mode:'screen',stream:{},watchers:new Set(),peers:new Map()};c.localLive=live;const m={sid:'session',mime:'video/webm'};
 await c.handleLiveChunkWatch(m,live,'viewer');const state=live.peers.get('viewer'),j=state.relay;await c.handleLiveChunkWatch(m,live,'viewer');assert.equal(state.relay,j);assert.equal(j.recorder.state,'recording');assert.equal(state.pc,null);assert.ok(sent.every(m=>m.relayChunks===2));
 // Encoding must continue while a transport/control send remains pending.
 c.sendActorIngress=()=>new Promise(()=>{});j.recorder.ondataavailable({data:{size:30,arrayBuffer:async()=>new Uint8Array(30).fill(7).buffer}});await j.encoding;assert.equal(j.seq,2);assert.equal(j.retainedBytes,30);
});
test('live acknowledgement prunes only confirmed appends, with owner/session/generation validation',()=>{
 const{c}=chunkHarness(['liveChunkSourceFor']);const j={id:'bytes',viewer:'viewer',sid:'session',epoch:2,liveId:'live',seq:3,ack:0,retainedBytes:30,chunks:new Map([[0,new Uint8Array(10)],[1,new Uint8Array(10)],[2,new Uint8Array(10)]])};c.localLive={id:'live'};c.liveChunkSources.set('bytes',j);const m={id:'bytes',liveId:'live',sid:'session',seekEpoch:2,decoderCursor:2};
 assert.equal(c.liveChunkSourceFor(m,'intruder'),null);assert.equal(j.retainedBytes,30);assert.equal(c.liveChunkSourceFor({...m,sid:'stale'},'viewer'),null);assert.equal(c.liveChunkSourceFor({...m,seekEpoch:1},'viewer'),null);assert.equal(c.liveChunkSourceFor({...m,decoderCursor:4},'viewer'),j);assert.equal(j.ack,0);
 assert.equal(c.liveChunkSourceFor(m,'viewer'),j);assert.equal(j.ack,2);assert.equal(j.retainedBytes,10);assert.deepEqual([...j.chunks.keys()],[2]);c.liveChunkSourceFor({...m,decoderCursor:1},'viewer');assert.equal(j.ack,2,'late feedback cannot rewind the decoder frontier');
});
test('byte capacity overflow replaces only the lagging journal with a fresh initialization',async()=>{
 const{c}=chunkHarness(['disposeLiveChunkSource','stopLiveRelayRecorder','liveJournalBudget','sendLiveChunkManifest','startLiveChunkRecorder']);const state={sid:'session',mime:'video/webm',epoch:0};c.localLive={id:'live',mode:'screen',stream:{},peers:new Map([['viewer',state]])};c.startLiveChunkRecorder(c.localLive,'viewer',state);const old=state.relay;old.retainedBytes=60;old.recorder.ondataavailable({data:{size:10}});
 assert.equal(old.stopped,true);assert.equal(old.recorder.state,'inactive');assert.equal(old.chunks.size,0);assert.notEqual(state.relay.id,old.id);assert.equal(state.relay.epoch,2);assert.equal(c.liveChunkSources.size,1);assert.equal(state.sid,'session');
});
test('out-of-order manifests cannot reset a running decoder or advance its source generation',()=>{
 const{c}=chunkHarness(['handleLiveChunkManifest']);let resets=0;c.resetLiveChunkPlayer=()=>resets++;
 const v={chunked:true,id:'live',sid:'session',publisher:'publisher',requestedMime:'video/webm',relayEpoch:2,relayId:'live-bytes-2',relayNextSeq:3,head:5,session:{},preview:{}};c.activeLiveViewer=v;
 const m={actor:'publisher',id:'live',sid:'session',mime:'video/webm',epoch:2,relayId:'live-bytes-2',head:6};c.handleLiveChunkManifest(m);assert.equal(v.head,6);c.handleLiveChunkManifest({...m,epoch:1,relayId:'live-bytes-1'});c.handleLiveChunkManifest({...m,relayId:'live-bytes-wrong'});c.handleLiveChunkManifest({...m,actor:'intruder',epoch:3});assert.equal(resets,0);assert.equal(v.relayId,'live-bytes-2');
});
test('quota rejection retains the exact missing append instead of advancing and losing it',()=>{
 const{c}=chunkHarness(['pumpLiveChunkPlayer']);let trims=0,restarts=0;const part=new Uint8Array(10),v={relayNextSeq:4,relayPending:new Map([[4,part]]),preview:{},relaySourceBuffer:{updating:false,appendBuffer(){throw Object.assign(Error('quota'),{name:'QuotaExceededError'})}}};c.activeLiveViewer=v;c.trimPreviewBehind=()=>trims++;c.restartLiveChunkViewer=()=>restarts++;
 c.pumpLiveChunkPlayer(v);assert.equal(v.relayNextSeq,4);assert.equal(v.relayPending.get(4),part);assert.equal(v.appendSeq,null);assert.equal(trims,1);assert.equal(restarts,0);
});
test('corrupt, stale and wrong-publisher bytes never earn path credit or enter the decoder',async()=>{
 const{c}=chunkHarness(['handleLiveChunkBinary']);let rewarded=0,decoded=0;c.decryptBytes=async()=>{decoded++;return new Uint8Array(3).buffer};c.rewardProviderPath=()=>rewarded++;c.noteStreamDelivery=()=>{};c.pumpLiveChunkPlayer=()=>{};c.relayPlaneName=x=>x;
 const v={chunked:true,id:'live',publisher:'publisher',sid:'session',relayId:'bytes',relayEpoch:1,relayNextSeq:0,relayPending:new Map(),receiving:new Set(),pendingBytes:0,session:{}};c.activeLiveViewer=v;
 const metadata={liveId:'live',id:'bytes',sid:'session',seekEpoch:1,idx:0,plainSize:4,relayActor:'publisher',relayPlane:'nats'};
 await c.handleLiveChunkBinary(null,{metadata:{...metadata,relayActor:'intruder'}});await c.handleLiveChunkBinary(null,{metadata:{...metadata,seekEpoch:0}});assert.equal(decoded,0);await c.handleLiveChunkBinary(null,{metadata});assert.equal(rewarded,0);assert.equal(v.relayPending.size,0);
 await c.handleLiveChunkBinary(null,{metadata:{...metadata,plainSize:3}});assert.equal(rewarded,1);assert.equal(v.pendingBytes,3);await c.handleLiveChunkBinary(null,{metadata:{...metadata,plainSize:3}});assert.equal(rewarded,1,'duplicate payload cannot bias route selection');
});
test('a decrypt completing after a source replacement cannot append into the new generation',async()=>{
 const{c}=chunkHarness(['handleLiveChunkBinary']);let finish;c.decryptBytes=()=>new Promise(r=>finish=r);const v={chunked:true,id:'live',publisher:'publisher',sid:'session',relayId:'bytes',relayEpoch:1,relayNextSeq:0,relayPending:new Map(),receiving:new Set(),pendingBytes:0};c.activeLiveViewer=v;
 const task=c.handleLiveChunkBinary(null,{metadata:{liveId:'live',id:'bytes',sid:'session',seekEpoch:1,idx:0,plainSize:3,relayActor:'publisher'}});v.relayId='replacement';finish(new Uint8Array(3).buffer);await task;assert.equal(v.relayPending.size,0);assert.equal(v.pendingBytes,0);
});
test('live chunks use the file serve pipeline, compact relay metadata and received-path hints',async()=>{
 const{c}=chunkHarness(['liveChunkSourceFor','serveChunksNow']);const hints=[{path:'relay:nats',bps:800000,score:900,strong:true,preferred:true}],part=new Uint8Array(8).fill(7),j={viewer:'viewer',sid:'session',epoch:2,liveId:'live',seq:1,ack:0,mime:'video/webm',retainedBytes:8,chunks:new Map([[0,part]])};c.localLive={id:'live'};c.liveChunkSources.set('bytes',j);let sent;
 Object.assign(c,{contents:new Map(),serveQueues:new Map(),serveRecentlySent:new Map(),streamRequestCurrent:()=>true,seedEnabled:()=>{throw Error('ephemeral media must not enter the file catalog')},readLocalChunk:()=>{throw Error('ephemeral media must not use file storage')},encryptBytes:async(raw,aad)=>{assert.equal(aad,'live-chunk:bytes:0');return raw},sendBinaryMultipathActor:async(remote,packet,metadata,hint,pathHints,aggressive)=>{sent={remote,packet,metadata,pathHints,aggressive};return true},RELAY_BOOTSTRAP_HEDGE_CHUNKS:3,IS_MOBILEISH:false,STREAM_SERVE_CONCURRENCY:8,served:0,noteFileTraffic:()=>{throw Error('do not record live chunks as file content')},scheduleHeaderRender:()=>{}});
 const ok=await c.serveChunksNow({id:'bytes',liveId:'live',sid:'session',seekEpoch:2,mode:'stream',indexes:[0],decoderCursor:0,decoderHead:true,relayBinary:2,pathHints:hints},'viewer');assert.equal(ok,true);assert.equal(sent.packet,part);assert.equal(sent.metadata.kind,'live-media');assert.equal(sent.metadata.relayChunks,2);assert.equal(sent.metadata.mode,'stream');assert.equal(sent.metadata.relayBinary,2);assert.equal(sent.metadata.plainSize,8);assert.equal(sent.pathHints,hints);assert.equal(sent.aggressive,false,'proven routes avoid broad racing');
});
test('a live missing-head request bypasses bulk dispatch through the same independent rescue lane',async()=>{
 const{c}=chunkHarness(['liveChunkSourceFor','queueServeChunks']);c.localLive={id:'live'};c.liveChunkSources.set('bytes',{viewer:'viewer',sid:'session',liveId:'live',epoch:1,seq:7,ack:0,chunks:new Map(),retainedBytes:0});let sent;
 Object.assign(c,{streamRequestCurrent:()=>true,serveQueues:new Map([['viewer|bytes',{sid:'session',seekEpoch:1,decoderCursor:5,active:new Set([5]),bulk:new Map([[6,{}]])}]]),seederFrontierAttempts:new Map(),SAFE_FRONTIER_RETRY_MS:550,serveChunksNow:async m=>{sent=m;return true}});
 await c.queueServeChunks({id:'bytes',liveId:'live',sid:'session',seekEpoch:1,mode:'stream',decoderCursor:5,indexes:[5],decoderHead:true,frontierRescue:true},'viewer');assert.equal(sent.indexes[0],5);assert.equal(sent.frontierRescue,true);assert.equal(sent.aggressive,false);assert.equal(sent.hedge,false);
});
test('successful updateend is the acknowledgement boundary, and stale MSE callbacks are ignored',()=>{
 const{c}=chunkHarness(['ensureLiveChunkPlayer','pumpLiveChunkPlayer']);let open,update,appends=0;const sb={mode:'',updating:false,appendBuffer(){appends++},addEventListener(name,fn){if(name==='updateend')update=fn}};
 c.previewMediaSourceType=()=>class{static isTypeSupported(){return true}addEventListener(name,fn){open=fn}addSourceBuffer(){return sb}};c.URL={createObjectURL:()=> 'blob:live'};
 const bytes=new Uint8Array(8),v={el:{srcObject:null},preview:{},session:{},relayPending:new Map([[0,bytes]]),pendingBytes:8,relayNextSeq:0};c.activeLiveViewer=v;c.ensureLiveChunkPlayer(v,'video/webm');open();assert.equal(appends,1);assert.equal(v.relayNextSeq,0);assert.equal(v.relayPending.size,1);assert.equal(sb.mode,'segments');update();assert.equal(v.relayNextSeq,1);assert.equal(v.pendingBytes,0);assert.equal(v.ackDirty,true);
 v.relaySourceBuffer={};v.appendSeq=5;update();assert.equal(v.relayNextSeq,1,'a replaced SourceBuffer cannot acknowledge newer data');
});

const webmFunctions=['liveEbmlElement','liveEbmlUnsigned','liveWebmVideoTracks','liveWebmCluster','normalizeLiveWebm'];
function webmFixture(){
 const join=(...a)=>new Uint8Array(a.flatMap(x=>Array.from(x))),element=(id,data)=>join(id,[0x80|data.length],data),cluster=t=>join([0x1f,0x43,0xb6,0x75,0xff,0xe7,0x81,t]);
 const tracks=element([0x16,0x54,0xae,0x6b],join(element([0xae],[0xd7,0x81,1,0x83,0x81,1]),element([0xae],[0xd7,0x81,2,0x83,0x81,2])));
 const block=(track,time,key,payload)=>element([0xa3],[0x80|track,time>>8&255,time&255,key?128:0,...payload]);
 return join(tracks,cluster(0),block(1,0,true,[10,11]),block(2,0,true,[20,21]),block(1,33,false,[12,13]),cluster(60),block(2,0,true,[22,23]),block(1,6,false,[14,15]),cluster(100),block(1,0,true,[16,17]),block(2,20,true,[24,25]));
}
function readWebmBlocks(c,bytes){let time=0;const blocks=[],clusters=[];for(let pos=0;pos<bytes.length;){const e=c.liveEbmlElement(bytes,pos);assert.ok(e);if(e.id===0x1f43b675){clusters.push(pos);pos=e.body;continue}assert.ok(e.end<=bytes.length);if(e.id===0xe7)time=c.liveEbmlUnsigned(bytes,e.body,e.end);if(e.id===0xa3){const at=e.body+1,rel=bytes[at]<<8|bytes[at+1];blocks.push({track:bytes[e.body]&127,time:time+(rel&32768?rel-65536:rel),key:!!(bytes[at+2]&128),payload:[...bytes.slice(at+3,e.end)]})}pos=e.end}return{blocks,clusters}}
test('WebM framing preserves every encoded A/V byte and timestamp, and splits only at video random access',()=>{
 const{c}=chunkHarness(webmFunctions),raw=webmFixture(),original=readWebmBlocks(c,raw),state={},normalized=c.normalizeLiveWebm(state,raw),result=readWebmBlocks(c,normalized);
 assert.equal(original.clusters.length,3);assert.equal(result.clusters.length,2,'a recorder timeslice between delta frames cannot recreate the video demuxer');assert.deepEqual(result.blocks,original.blocks.slice(0,-1),'container changes must not retime A/V or alter encoded frames');assert.equal(result.blocks.at(-1).key,true);assert.equal(state.pending.length,1,'hold the last audio packet until the video watermark catches up');assert.equal(state.pending[0].absolute,120);assert.deepEqual([...state.pending[0].bytes.slice(state.pending[0].relativeOffset+3)],[24,25]);
});
test('WebM parsing survives every possible input boundary, including inside block payloads and headers',()=>{
 const{c}=chunkHarness(webmFunctions),raw=webmFixture(),whole=c.normalizeLiveWebm({},raw),state={},pieces=[];
 for(const byte of raw)pieces.push(c.normalizeLiveWebm(state,new Uint8Array([byte])));assert.deepEqual(Buffer.concat(pieces),Buffer.from(whole));assert.equal(state.carry.length,0);
 assert.throws(()=>c.liveEbmlElement(new Uint8Array([0])),/Invalid/);assert.throws(()=>c.liveWebmCluster(-1),/Invalid/);
});
test('a late audio packet is muxed before a video keyframe without changing either timestamp',()=>{
 const{c}=chunkHarness(webmFunctions),raw=webmFixture(),key=[...raw].findIndex((_,i,a)=>a[i]===0xe7&&a[i+1]===0x81&&a[i+2]===100),part=new Uint8Array([0xa3,0x86,0x82,0xff,0xf6,0x80,30,31]),input=new Uint8Array(raw.length+part.length);
 // Insert an audio packet at timestamp 90 after the keyframe at timestamp 100,
 // before the later audio at 120. The muxer must wait for both track clocks.
 const at=key+3+8;input.set(raw.slice(0,at));input.set(part,at);input.set(raw.slice(at),at+part.length);const state={},result=readWebmBlocks(c,c.normalizeLiveWebm(state,input));assert.deepEqual(result.blocks.map(x=>x.time),[0,0,33,60,66,90,100]);assert.deepEqual(result.blocks.find(x=>x.time===90).payload,[30,31]);assert.equal(result.clusters.length,2);
});
test('late RTC media acknowledgements, ICE and old unwatch cannot tear down a chunk stream',()=>{
 const{c}=chunkHarness(['handleLivePath','handleLiveIce','handleLiveUnwatch']);let stopped=0,closed=0;c.stopLiveRelayRecorder=()=>stopped++;c.closeLivePublisherPeer=()=>closed++;c.renderTree=()=>{};c.queueLiveIce=()=>{throw Error('no stale media ICE in byte delivery')};
 const state={chunked:true,sid:'current',relay:{stopped:false}};c.localLive={id:'live',peers:new Map([['viewer',state]])};c.handleLivePath({id:'live',actor:'viewer',path:'webrtc-media-active'});c.handleLiveIce({id:'live',actor:'viewer',candidate:{}});c.handleLiveUnwatch({id:'live',actor:'viewer'});c.handleLiveUnwatch({id:'live',actor:'viewer',sid:'old'});assert.equal(stopped,0);assert.equal(closed,0);assert.equal(state.relay.stopped,false);c.handleLiveUnwatch({id:'live',actor:'viewer',sid:'current'});assert.equal(closed,1);
});
test('a growing live media duration cannot be mistaken for a completed file or cap its recovery reserve',()=>{
 const{c}=chunkHarness(['mediaOriginalDuration']);assert.equal(c.mediaOriginalDuration({mode:'live',media:{duration:4}}),0);assert.equal(c.mediaOriginalDuration({mode:'mp4box',media:{duration:4}}),4);
});
test('ManagedMediaSource live playback disables remote playback before attaching its media URL',()=>{
 const{c}=chunkHarness(['ensureLiveChunkPlayer']);const MS=class{static isTypeSupported(){return true}addEventListener(){}};c.window.ManagedMediaSource=MS;c.previewMediaSourceType=()=>MS;c.URL={createObjectURL:()=> 'blob:managed'};let attached=false;const el={set src(value){assert.equal(this.disableRemotePlayback,true);attached=value==='blob:managed'}};assert.equal(c.ensureLiveChunkPlayer({el},'video/mp4;codecs=avc1.42E01E'),true);assert.equal(attached,true);
});
test('an active chunk viewer survives missed heartbeats while idle and legacy listings still expire',()=>{
 const{c}=chunkHarness(['pruneLiveMedia']);c.LIVE_EXPIRE_MS=14000;let ended=0;c.closeLiveViewer=()=>ended++;
 const live={id:'live',actor:'publisher',lastSeen:0},idle={id:'idle',actor:'other',lastSeen:0};c.liveMedia.set('live',live);c.liveMedia.set('idle',idle);c.activeLiveViewer={id:'live',chunked:true};assert.equal(c.pruneLiveMedia(),true);assert.equal(c.liveMedia.get('live'),live);assert.equal(c.liveMedia.has('idle'),false);assert.equal(ended,0);
 c.activeLiveViewer.chunked=false;assert.equal(c.pruneLiveMedia(),true);assert.equal(c.liveMedia.has('live'),false);assert.equal(ended,1);
});

test('LIVE encoder batches follow capture cadence while stable policy stays unchanged',()=>{
 const{c}=chunkHarness([]),live={mode:'screen',stream:{getVideoTracks:()=>[{getSettings:()=>({width:1280,height:720,frameRate:60})}]}};
 const stable=c.liveEncoderPolicy(live,{});assert.equal(stable.video,1800000);assert.equal(stable.audio,128000);assert.equal(stable.batch,.36);
 live.lowLatency=true;const low=c.liveEncoderPolicy(live,{});assert.equal(low.batch,2/60);assert.equal(low.audio,64000);
 const compressed=c.liveEncoderPolicy(live,{liveBitrate:200000,liveRecovery:.4});assert.equal(compressed.video,200000);assert.ok(compressed.keyframe>=.4);
});
test('compression waits for sustained measured congestion and preserves an isolated repair',()=>{
 const{c}=chunkHarness(['updateLiveEncoderFeedback']);let at=1000,restarts=0;c.performance.now=()=>at;c.startLiveChunkRecorder=()=>restarts++;
 const state={},live={id:'live',lowLatency:true,peers:new Map([['viewer',state]])};c.localLive=live;
 const j={viewer:'viewer',lowLatency:true,batchSeconds:.05,videoBitrate:1200000,maxVideoBitrate:1200000,audioBitrate:64000,ackedBytes:0,producedBytes:10000,retainedBytes:10000,started:at};state.relay=j;
 const m={liveFeedback:{receivedBytes:9000,target:.2,delivery:.1,jitter:0}};c.updateLiveEncoderFeedback(j,m);
 const step=received=>{at+=500;j.producedBytes+=75000;m.liveFeedback.receivedBytes=received;c.updateLiveEncoderFeedback(j,m)};
 for(let i=0;i<3;i++)step(j.producedBytes+75000-1000);
 assert.equal(restarts,0);step(m.liveFeedback.receivedBytes+10000);assert.equal(restarts,0,'one delayed frontier is not sustained congestion');
 step(j.producedBytes+75000-1000);assert.equal(restarts,0);
 for(let i=0;i<5&&!restarts;i++)step(m.liveFeedback.receivedBytes+10000);
 assert.equal(restarts,1);assert.ok(state.liveBitrate<j.videoBitrate*.8);
});
test('live-edge controller adapts to jitter and seeks only within decoded media',()=>{
 const{c}=chunkHarness(['liveLatencyTarget','followLiveEdge']);let ranges=[[0,10]];
 c.decoderBufferedRanges=()=>ranges;c.streamBufferedAhead=p=>Math.max(0,ranges.at(-1)[1]-p.media.currentTime);
 const v={lowLatency:true,batchSeconds:.06,session:{deliveryLatency:.1,deliveryJitter:0},el:{currentTime:2,playbackRate:1},relayNextSeq:20,startedPlayback:true};v.preview={media:v.el,mseAppendLatency:.01};
 const quiet=c.liveLatencyTarget(v);v.session.deliveryJitter=.1;assert.ok(c.liveLatencyTarget(v)>quiet);c.followLiveEdge(v);assert.ok(v.el.currentTime<10&&v.el.currentTime>9);assert.ok(v.el.playbackRate>=1&&v.el.playbackRate<=1.12);assert.equal(v.liveJumps,1);
 const corrected=v.el.currentTime;c.followLiveEdge(v);assert.equal(v.el.currentTime,corrected,'same appended frontier cannot trigger repeated seeks');
 v.lowLatency=false;v.el.playbackRate=1.12;c.followLiveEdge(v);assert.equal(v.el.playbackRate,1);assert.equal(v.el.currentTime,corrected);assert.equal(v.latencyTarget,0);
});
test('compression recovery probes are bounded by the original capture quality',()=>{
 const{c}=chunkHarness(['updateLiveEncoderFeedback']);let at=1000,restarts=0;c.performance.now=()=>at;c.startLiveChunkRecorder=()=>restarts++;
 const state={feedbackSamples:11},j={viewer:'viewer',lowLatency:true,batchSeconds:.05,videoBitrate:500000,maxVideoBitrate:520000,audioBitrate:64000,ackedBytes:1,producedBytes:2,retainedBytes:0,started:at};state.relay=j;c.localLive={lowLatency:true,peers:new Map([['viewer',state]])};const m={liveFeedback:{target:.2,delivery:.1,jitter:0}};c.updateLiveEncoderFeedback(j,m);at+=500;j.ackedBytes=10000;j.producedBytes=10001;c.updateLiveEncoderFeedback(j,m);assert.equal(restarts,1);assert.equal(state.liveBitrate,520000);
});

test('video compression adapts a private capture track and releases it without stopping the broadcast',async()=>{
 const{c}=chunkHarness(['disposeLiveChunkSource','stopLiveRelayRecorder','liveJournalBudget','sendLiveChunkManifest','startLiveChunkRecorder']);
 const original={...track('video'),getSettings:()=>({width:1000,height:500,frameRate:20})},audio=track('audio');let clone;
 original.clone=()=>clone={...track('video'),settings:original.getSettings(),getSettings(){return this.settings},async applyConstraints(x){this.settings={width:x.width.max,height:x.height.max,frameRate:x.frameRate.max}}};
 c.MediaStream=class{constructor(tracks){this.tracks=tracks}};const state={sid:'session',mime:'video/webm',epoch:0,liveBitrate:100000},live={id:'live',mode:'screen',lowLatency:true,stream:{getVideoTracks:()=>[original],getAudioTracks:()=>[audio]},peers:new Map([['viewer',state]])};c.localLive=live;
 c.startLiveChunkRecorder(live,'viewer',state);await new Promise(r=>setImmediate(r));assert.equal(state.relay.encoderTrack,clone);assert.ok(clone.settings.width<original.getSettings().width);assert.ok(clone.settings.frameRate<20);assert.equal(original.getSettings().width,1000);
 c.stopLiveRelayRecorder(state.relay);assert.equal(clone.stopped,true);assert.equal(original.stopped,undefined);assert.equal(audio.stopped,undefined);
});
test('audio-only feedback cannot trigger video quality probes or encoder resets',()=>{
 const{c}=chunkHarness(['updateLiveEncoderFeedback']);let resets=0;c.startLiveChunkRecorder=()=>resets++;const j={lowLatency:true,videoBitrate:0,viewer:'viewer'},state={relay:j,feedbackSamples:100};c.localLive={lowLatency:true,peers:new Map([['viewer',state]])};c.updateLiveEncoderFeedback(j,{liveFeedback:{target:.1,delivery:.1,jitter:0}});assert.equal(resets,0);
});

test('out-of-order byte delivery does not become a false bandwidth shortage',()=>{
 const{c}=chunkHarness(['updateLiveEncoderFeedback']);let at=1000,resets=0;c.performance.now=()=>at;c.startLiveChunkRecorder=()=>resets++;
 const j={viewer:'viewer',lowLatency:true,batchSeconds:.05,videoBitrate:1000000,maxVideoBitrate:1000000,audioBitrate:64000,ackedBytes:0,producedBytes:10000,retainedBytes:10000,started:at},state={relay:j};c.localLive={lowLatency:true,peers:new Map([['viewer',state]])};
 for(let i=0;i<20;i++){at+=500;j.producedBytes+=50000;j.retainedBytes+=50000;c.updateLiveEncoderFeedback(j,{liveFeedback:{receivedBytes:j.producedBytes-1000,target:.2,delivery:.2,jitter:0}})}
 assert.equal(resets,0,'one missing decoder frontier must not hide healthy tail delivery');assert.ok(j.deliveryRate>90000);
});
