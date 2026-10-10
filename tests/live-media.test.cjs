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
 const c=vm.createContext({localLive:null,liveCaptureRequest:0,actor:'source',liveMedia:new Map(),navigator:{mediaDevices:{}},crypto:{randomUUID:()=>String(++nextId)},Date,console,
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
