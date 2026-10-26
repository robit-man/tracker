const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(process.env.TRACKER_HTML||require('node:path').join(__dirname,'..','index.html'),'utf8');
function source(name){const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1,`missing ${name}`);const next=html.slice(start+1).search(/^(?:async )?function /m);return html.slice(start,next<0?undefined:start+1+next)}
function context(names,extras={}){const c=vm.createContext({File,Blob,Date,Set,Map,Uint8Array,DataView,performance,setTimeout,clearTimeout,clearInterval,MP4_RAM_QUEUE_BUDGET_BYTES:1024*1024,SCHEDULER_TICK_MS:180,CHUNK_SIZE:256,...extras});for(const name of names)vm.runInContext(source(name),c);return c}
const turn=()=>new Promise(r=>setImmediate(r));
function engine(){const p={c:{id:'avi',size:4096},name:'film.avi',mime:'video/x-msvideo',media:{playbackRate:1,currentTime:0},wantPlayback:true};const e={preview:p,id:'owner',fps:24,duration:300,ready:true,generation:0,nextTime:0,sectionsEncoded:0,sourceComplete:true,inputComplete:true,inputChunkSize:256,ff:{},job:{},mount:'/mount'};p.compatProgressive=e;return e}
test('conversion batches amortize startup and maintain a future buffer without exceeding the byte budget',()=>{
 const e=engine(),c=context(['compatSectionPlan']);assert.ok(c.compatSectionPlan(e).quantum>.9);
 e.sectionsEncoded=1;e.encodeServicePerSecond=.8;const p=c.compatSectionPlan(e);assert.ok(p.quantum>=4);assert.equal(p.quantum*48000/1024,Math.round(p.quantum*48000/1024));assert.ok(p.target>=24);assert.ok(p.startup>=2);
 for(let i=0;i<30;i++){e.encodeServicePerSecond=.8;assert.equal(c.compatSectionPlan(e).quantum,p.quantum)}
 e.encodeServicePerSecond=8;assert.ok(c.compatSectionPlan(e).quantum>=p.quantum,'slow work must not collapse into single-frame jobs');
 e.encodedBytesPerSecond=1024*1024;const limited=c.compatSectionPlan(e);assert.ok(limited.quantum<=.25);assert.ok(limited.target<=.5);
});
test('fractional video rates keep complete audio packets at every conversion boundary',()=>{
 const e=engine(),c=context(['compatSectionPlan']);
 for(const fps of [23.976,24,25,29.97,30,50,59.94])for(const n of [0,1,25]){e.fps=fps;e.sectionsEncoded=n;const plan=c.compatSectionPlan(e);assert.ok(Math.abs(plan.quantum*48000/1024-Math.round(plan.quantum*48000/1024))<1e-8)}
});
test('a seek inside the supply tolerance still lands on a real decoded range',()=>{
 const e=engine(),m=e.preview.media;e.playbackStarted=true;m.currentTime=75;m.paused=false;m.seeking=true;m.play=()=>Promise.resolve();
 const c=context(['compatProgressiveCurrent','compatProgressivePaused','maintainCompatPlayback'],{activePreview:e.preview,streamBufferedState:()=>({inRange:true,ahead:4,ranges:[[75.028,79]]}),compatSectionPlan:()=>({startup:2}),STREAM_MICRO_GAP_MAX_SECONDS:.45});
 c.maintainCompatPlayback(e);assert.ok(m.currentTime>75.028&&m.currentTime<75.04);
});
test('a native local File prebuffers before play and recovers without a transfer session',()=>{
 const e=engine();e.preview.kind='video';e.preview.mode='compat';e.preview.compatPlaybackReady=true;e.preview.sourceBuffer={};e.duration=300;e.ready=true;
 let now=0,ahead=1,plays=0;Object.assign(e.preview.media,{readyState:4,paused:true,play(){plays++;return Promise.resolve()}});
 const c=context(['compatProgressiveCurrent','compatProgressivePaused','maintainCompatPlayback'],{activePreview:e.preview,performance:{now:()=>now},streamBufferedState:()=>({ahead,inRange:true,nextStart:Infinity}),compatSectionPlan:()=>({startup:4}),STREAM_MICRO_GAP_MAX_SECONDS:.45});
 c.maintainCompatPlayback(e);assert.equal(plays,0);assert.equal(e.buffering,true);ahead=12;c.maintainCompatPlayback(e);assert.equal(plays,1);assert.equal(e.buffering,false);
 e.preview.media.currentTime=2;e.preview.media.paused=false;now=1000;c.maintainCompatPlayback(e);now=4000;c.maintainCompatPlayback(e);assert.ok(e.preview.media.currentTime>2,'stalled buffered local decoder is nudged forward');assert.equal(e.preview.session,undefined);
 e.preview.media.currentTime=.5;now=7000;c.maintainCompatPlayback(e);assert.equal(e.preview.media.currentTime,.5,'a backwards seek is progress rather than a stalled decoder');
 e.preview.wantPlayback=false;const before=plays;c.maintainCompatPlayback(e);assert.equal(plays,before,'explicit pause must remain paused');
});
test('the playback watchdog maintains a fully converted local file without any network session',()=>{
 const e=engine();e.done=true;e.preview.mode='compat';let maintained=0,rendered=0;
 const c=context(['playbackWatchdogTick'],{activePreview:e.preview,document:{hidden:false},maintainCompatPlayback:x=>{assert.equal(x,e);maintained++},renderCompatStatus:x=>{assert.equal(x,e.preview);rendered++}});
 c.playbackWatchdogTick();assert.equal(maintained,1);assert.equal(rendered,1);c.document.hidden=true;c.playbackWatchdogTick();assert.equal(maintained,1);
});
test('native pause blocks recovery before its queued event changes playback intent',()=>{
 const e=engine();e.playbackStarted=true;e.preview.media.paused=true;e.preview.wantPlayback=true;e.preview.media.play=()=>assert.fail('native pause was overridden');
 const c=context(['compatProgressiveCurrent','compatProgressivePaused','maintainCompatPlayback'],{activePreview:e.preview});
 assert.equal(c.compatProgressivePaused(e),true);c.maintainCompatPlayback(e);assert.equal(e.preview.media.paused,true);
});
test('native pause during a seek is respected and stale play events cannot undo it',()=>{
 const listeners={},e=engine(),p=e.preview,el=p.media;p.wantPlayback=true;el.paused=true;el.seeking=true;el.addEventListener=(name,fn)=>{(listeners[name]??=[]).push(fn)};
 const c=context(['attachStreamDemandHandlers'],{activePreview:p,startPlaybackWatchdog(){}});c.attachStreamDemandHandlers(el);
 for(const fn of listeners.pause)fn();assert.equal(p.wantPlayback,false);
 for(const fn of [...listeners.play,...listeners.playing])fn();assert.equal(p.wantPlayback,false);
});
test('AVI header preserves the full timeline when ffprobe can only see a received prefix',async()=>{
 const bytes=new Uint8Array(80),v=new DataView(bytes.buffer),tag=(i,s)=>bytes.set(Buffer.from(s),i);tag(0,'RIFF');v.setUint32(4,32000000,true);tag(8,'AVI ');tag(12,'LIST');v.setUint32(16,60,true);tag(20,'hdrl');tag(24,'avih');v.setUint32(28,48,true);v.setUint32(32,41667,true);v.setUint32(48,7201,true);
 const c=context(['compatAviDuration']),duration=await c.compatAviDuration(new File([bytes],'prefix.avi'));assert.ok(Math.abs(duration-300.044067)<.001);assert.equal(await c.compatAviDuration(new File(['invalid'],'bad.avi')),0);
});
test('actual AVC decoder configuration and AAC profile determine the native MIME',()=>{
 const c=context(['compatEncodedMime']),data=new Uint8Array(40);data.set([97,118,99,67,1,66,192,42],8);assert.equal(c.compatEncodedMime(data,{streams:[{codec_type:'audio',codec_name:'aac',profile:'LC'}]}),'video/mp4; codecs="avc1.42c02a,mp4a.40.2"');assert.throws(()=>c.compatEncodedMime(data,{streams:[{codec_type:'audio',codec_name:'aac',profile:'HE-AAC'}]}),/unsupported/);
});
test('valid structured ffprobe output survives the pinned core stale exit slot, and temporary reports are always removed',async()=>{
 const calls=[],e={id:'owner',ff:{ffprobe:async()=>-1,readFile:async()=>'{"format":{"duration":"2"},"streams":[]}',deleteFile:async f=>calls.push(f)}},c=context(['compatProbe']);assert.equal((await c.compatProbe(e,'input','source')).format.duration,'2');assert.deepEqual(calls,['probe-owner.json']);e.ff.readFile=async()=>'{invalid';await assert.rejects(c.compatProbe(e,'input','source'));assert.equal(calls.length,2);
});
function runHarness(){
 const e=engine(),execs=[],appends=[],deletes=[],resolvers=[];let now=0,current;
 e.ff={mount:async()=>{},unmount:async()=>{},deleteFile:async f=>deletes.push(f),readFile:async()=>new Uint8Array(64),exec:args=>{const n={start:Number(args[args.indexOf('-ss')+1]),duration:Number(args[args.indexOf('-t')+1])};execs.push(n);current=n;return new Promise(r=>resolvers.push(()=>{now+=20;r(0)}))}};
 const c=context(['compatProgressiveCurrent','compatProgressivePaused','runCompatSections'],{activePreview:e.preview,performance:{now:()=>now},compatSectionPlan:()=>({quantum:1,target:2}),streamBufferedAhead:()=>0,sourceBufferNativeHorizon:()=>Infinity,materializeCompatPrefix:async()=>new File(['AVI'],'input.avi'),compatProbe:async()=>({format:{duration:current.duration+.021333},streams:[{codec_type:'video',duration:current.duration}]}),appendCompatSection:async(_e,_data,_meta,start,end)=>{appends.push({start,end});return true},$:()=>null,previewDebugEvent(){}});return{e,c,execs,appends,deletes,resolvers};
}
test('first section is playable while the next exec is unfinished; closing permits only the current bounded section to settle',async()=>{
 const h=runHarness(),task=h.c.runCompatSections(h.e);await turn();assert.equal(h.execs.length,1);h.resolvers.shift()();await turn();assert.equal(h.appends.length,1);assert.equal(h.execs.length,2);assert.equal(h.e.nextTime,1);assert.ok(h.deletes.length>=1);
 h.e.preview.wantPlayback=false;h.resolvers.shift()();await task;assert.equal(h.execs.length,2);assert.equal(h.appends.length,2);assert.equal(h.e.nextTime,2,'AAC padding must not accumulate in the source cursor');
});
test('seeking during a conversion drops its old output and directly starts the requested source window',async()=>{
 const h=runHarness(),task=h.c.runCompatSections(h.e);await turn();h.e.generation++;h.e.nextTime=120;h.resolvers.shift()();await turn();assert.equal(h.appends.length,0);assert.equal(h.execs[1].start,120);h.e.preview.wantPlayback=false;h.resolvers.shift()();await task;assert.equal(h.appends[0].start,120);assert.equal(h.e.nextTime,121);
});
function storageMock(){
 const held=new Set(),writes=[],removed=[];
 function makeDir(){
  const entries=new Map();return{
   entries:async function*(){yield*entries.entries()},
   getDirectoryHandle:async(name,options={})=>{if(!entries.has(name)){if(!options.create)throw Error('missing');entries.set(name,makeDir())}return entries.get(name)},
   getFileHandle:async name=>{if(!entries.has(name)){let data=new Blob();entries.set(name,{createWritable:async options=>{assert.equal(options?.keepExistingData,undefined);return{write:async b=>{writes.push(name);data=new Blob([b])},close:async()=>{}}},getFile:async()=>new File([data],name)})}return entries.get(name)},
   removeEntry:async(name,options)=>{removed.push([name,options?.recursive]);entries.delete(name)}
  };
 }
 const root=makeDir(),navigator={storage:{getDirectory:async()=>root},locks:{request:async(name,options,callback)=>{if(typeof options==='function'){callback=options;options={}}if(held.has(name)&&options.ifAvailable)return callback(null);held.add(name);try{return await callback({name})}finally{held.delete(name)}}}};return{navigator,root,held,writes,removed};
}
test('received prefix snapshots append immutable native chunks once and startup cleanup protects another active tab',async()=>{
 const s=storageMock(),e=engine();e.preview.session={rxPrefix:2,total:4,decoderHot:new Map([[0,new Uint8Array([1,2])],[1,new Uint8Array([3,4])],[2,new Uint8Array([5,6])]])};
 const c=context(['compatProgressiveCurrent','compatProgressivePaused','compatTemporaryInput','cleanupCompatTemporaryInputs','materializeCompatPrefix'],{activePreview:e.preview,navigator:s.navigator,getReadableFile:async()=>null,contentChunkSize:()=>2,extOf:()=> 'avi',loadStreamCachedChunk:async()=>null,readLocalChunk:async()=>null,canonicalToPlain:async(_c,_i,b)=>b});
 const first=await c.materializeCompatPrefix(e);e.preview.session.rxPrefix=3;const second=await c.materializeCompatPrefix(e);assert.equal(first.size,4);assert.equal(second.size,6);assert.deepEqual(s.writes,['0','1','2']);
 const dir=await s.root.getDirectoryHandle('tracker-compat-temporary-v1');await dir.getDirectoryHandle('input-orphan',{create:true});await c.cleanupCompatTemporaryInputs();assert.ok(s.removed.some(([n,r])=>n==='input-orphan'&&r));assert.ok(!s.removed.some(([n])=>n==='input-owner'));e.releaseInputLock();await turn();await c.cleanupCompatTemporaryInputs();assert.ok(s.removed.some(([n,r])=>n==='input-owner'&&r));
});
test('password-locked and OPFS-unavailable input stays within the bounded RAM prefix and never writes plaintext to disk',async()=>{
 for(const locked of[false,true]){let diskCalls=0;const e=engine();e.preview.c.locked=locked;e.preview.c.plainChunkSize=256;e.preview.session={rxPrefix:8,total:8,decoderHot:new Map(Array.from({length:8},(_,i)=>[i,new Uint8Array(256)]))};const c=context(['compatProgressiveCurrent','compatProgressivePaused','compatTemporaryInput','materializeCompatPrefix'],{MP4_RAM_QUEUE_BUDGET_BYTES:1024,activePreview:e.preview,navigator:{storage:{getDirectory:async()=>{diskCalls++;throw Error('unavailable')}},locks:{request(){}}},getReadableFile:async()=>null,contentChunkSize:()=>256,extOf:()=> 'avi',loadStreamCachedChunk:async()=>null,readLocalChunk:async()=>null,canonicalToPlain:async(_c,_i,b)=>b});const input=await c.materializeCompatPrefix(e);assert.equal(input.size,1024);assert.equal(e.inputChunks,4);assert.equal(e.memoryLimited,true);assert.equal(diskCalls,locked?0:1)}
});
test('temporary directory creation failure releases its lock and cannot deadlock or retry on later prefix growth',async()=>{
 let acquisitions=0,releases=0,creates=0;const e=engine(),navigator={storage:{getDirectory:async()=>({getDirectoryHandle:async()=>({getDirectoryHandle:async()=>{creates++;throw Error('quota')}})})},locks:{request:async(_name,callback)=>{acquisitions++;try{return await callback({})}finally{releases++}}}};const c=context(['compatTemporaryInput'],{navigator});assert.equal(await c.compatTemporaryInput(e),false);await turn();assert.equal(await c.compatTemporaryInput(e),false);assert.equal(acquisitions,1);assert.equal(creates,1);assert.equal(releases,1);assert.equal(e.tempUnavailable,true);
});
test('later compatibility failure keeps already decoded playback and stops its scheduling interval',()=>{
 const e=engine();e.preview.compatPlaybackReady=true;e.timer=7;let clears=0,errors=0,releases=0;const tag={};const c=context(['compatProgressiveCurrent','compatProgressiveFailure'],{activePreview:e.preview,clearInterval:t=>{assert.equal(t,7);clears++},previewDebugEvent(){},$:()=>tag,showPreviewError:()=>errors++,releaseCompatResources:()=>releases++});c.compatProgressiveFailure(e,Error('Download then link local source'));assert.equal(errors,0);assert.equal(clears,1);assert.equal(releases,1);assert.equal(e.timer,0);assert.match(tag.textContent,/Download/);
});
test('a completely received source with a bounded input prefix reports how to continue without treating the prefix as EOF',async()=>{
 const h=runHarness();h.e.inputComplete=false;h.e.memoryLimited=true;h.e.inputChunks=4096;h.e.preview.c.size=4000000;h.e.inputChunkSize=256;h.c.compatInputLimitError=()=>Error('Download this video, then link the local source');await assert.rejects(h.c.runCompatSections(h.e),/Download.*link/);assert.equal(h.execs.length,0);
});
test('failed conversion releases only its owned worker and temporary files after current work settles',async()=>{
 const e=engine();let settle,terminations=0,removed=0,released=0;e.task=new Promise(r=>settle=r);e.ff={terminate:()=>terminations++,__trackerUrls:[]};e.tempDirectory={removeEntry:async(_n,o)=>{assert.equal(o.recursive,true);removed++}};e.tempName='input-owner';e.releaseInputLock=()=>released++;
 const c=context(['releaseCompatResources'],{trackerFfmpegActiveJob:e.job,trackerFfmpegPromise:Promise.resolve(e.ff),URL:{revokeObjectURL(){}}});const cleanup=c.releaseCompatResources(e);assert.equal(terminations,1);assert.equal(removed,0);assert.equal(c.releaseCompatResources(e),cleanup);settle();await cleanup;assert.equal(removed,1);assert.equal(released,1);assert.equal(c.trackerFfmpegActiveJob,null);
 const old=engine(),replacement={};old.ff={terminate(){throw Error('replacement worker must survive')},__trackerUrls:[]};c.trackerFfmpegActiveJob=replacement;await c.releaseCompatResources(old);assert.equal(c.trackerFfmpegActiveJob,replacement);
});
test('all initial writes may finish before any RX prefix accounting without stranding compatibility startup',async()=>{
 const e=engine(),s={cid:'avi',sid:'sid',mode:'stream',state:'downloading',total:8,chunkSize:2,receivedBits:new Uint8Array(1),receivedCount:0,bytesReceived:0,rxPrefix:0,inflight:new Map(),providerStarted:new Map(),providerBytes:new Map(),dataProven:new Set()},p=e.preview;p.session=s;p.mode='compat';p.compatNeedsTranscode=true;delete p.compatProgressive;let arrived=0,starts=0;const waiters=[],observed=[];
 const c=context(['handleBinary','wakeCompatInput','pumpCompatMedia'],{activePreview:p,routeActors:new Map(),sessionBySid:new Map([['sid',s]]),contents:new Map([['avi',{size:16}]]),verifyBinaryV4:async()=>true,decryptBytes:async b=>b,bitHas:(b,i)=>!!(b[i>>3]&(1<<(i&7))),bitSet:(b,i)=>b[i>>3]|=1<<(i&7),storeReceivedChunk:async()=>{observed.push(s.rxPrefix);if(++arrived===4)waiters.forEach(r=>r());else await new Promise(r=>waiters.push(r))},rewardProviderPath:()=>({}),previewDebugNoteProtocol(){},noteStreamDelivery(){},noteFileTraffic(){},queueVerification:async()=>{},refreshPreviewStats(){},scheduleSession(){},failSession:(_s,e)=>{throw e},extOf:()=> 'avi',compatProgressiveMime:()=>true,compatTranscodePlayback:async()=>{starts++;p.compatProgressive={}},wakeCompatTranscode(){}});
 await Promise.all([0,1,2,3].map(i=>c.handleBinary(new Uint8Array([i,i]),{metadata:{kind:'chunk',id:'avi',sid:'sid',idx:i,relayActor:'source'}},null)));await turn();assert.deepEqual(observed,[0,0,0,0]);assert.equal(s.rxPrefix,4);assert.equal(starts,1);
});
test('a verified native plaintext File can play a locked entry without decrypting or writing a temporary copy',async()=>{
 const e=engine(),file=new File(['plain AVI'],'film.avi');e.preview.c.locked=true;e.preview.session={};const c=context(['materializeCompatPrefix'],{getReadableFile:async()=>file,extOf:()=> 'avi'});const input=await c.materializeCompatPrefix(e);assert.equal(input.size,file.size);assert.equal(e.inputComplete,true);assert.equal(e.sourceComplete,true);assert.equal(e.tempHandle,undefined);
});
test('Play after linking a local source exits the failed warm engine and lets normal preview setup preserve its bookmark',async()=>{
 const e=engine(),p=e.preview;p.c.id='avi';p.hiddenAt=1;e.failed=true;let saved=0,cleaned=0;const c=context(['reopenWarmPreview'],{activePreview:p,getReadableFile:async()=>new File(['AVI'],'local.avi'),savePreviewPosition:q=>{assert.equal(q,p);saved++},cleanupPreview:()=>cleaned++});assert.equal(await c.reopenWarmPreview({},p.c),false);assert.equal(saved,1);assert.equal(cleaned,1);
});
