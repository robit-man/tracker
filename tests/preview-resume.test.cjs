const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function source(name){const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1);const next=html.slice(start+1).search(/^(?:async )?function /m);return html.slice(start,next<0?undefined:start+1+next)}
function harness(names=[]){
 const messages=[],writes=[],events=[],el={currentTime:129.25,playbackRate:1.5,readyState:4,paused:false,pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}},s={sid:'original',cid:'movie',mode:'stream',state:'downloading',seekEpoch:2,total:4,receivedBits:new Uint8Array([1]),inflight:new Map([[1,{actor:'seed'}]]),inflightByPeer:new Map([['seed',1]]),retry:[],holders:new Set(['seed']),requestedAt:new Map([[1,1]]),timer:1,decoderHot:new Map([[0,new Uint8Array([7])]])},p={kind:'video',c:{id:'movie'},name:'movie.mp4',mime:'video/mp4',media:el,session:s,playbackWatchdog:1,decoderPump:1};
 const c=vm.createContext({activePreview:p,previewBookmarks:new Map(),sessionBySid:new Map([[s.sid,s]]),putKV:async(k,v)=>writes.push([k,v]),Date,performance,crypto:{randomUUID:()=> 'resumed'},
  clearTimeout:()=>{},clearInterval:()=>{},$:()=>({textContent:'',classList:{remove(){},add(){}}}),setPreviewTheater:()=>{},renderTree:()=>{},syncVisualViewport:()=>{},refreshPreviewStats:()=>{},
  bitHas:(bits,idx)=>!!(bits[idx>>3]&(1<<(idx&7))),msg:(type,data)=>({type,...data}),broadcast:async m=>messages.push(m),visibleSize:()=>1,fmtBytes:()=> '1 B',seedCount:()=>1,advertisedRemoteSeeders:()=>['seed'],
  startPlaybackWatchdog:()=>events.push('watchdog'),ensureStreamHorizon:()=>events.push('horizon'),scheduleDecoderPromotion:()=>events.push('decoder'),wakeTransferTransports:()=>events.push('transports'),announceStreamDemand:async()=>events.push('demand'),scheduleSession:()=>events.push('scheduler'),
  mediaOriginalDuration:()=>1000,seekMp4Stream:(p,time)=>events.push(['seek',time]),cleanupPreview:()=>{throw Error('retained media must not be destroyed')}
 });
 for(const name of ['previewPositionLabel','previewPlayButton','savePreviewPosition','restorePreviewPosition','previewCanStayWarm','closePreview','reopenWarmPreview',...names])vm.runInContext(source(name),c);
 return {c,p,s,el,messages,writes,events};
}
test('X pauses playback and chunk scheduling, retains the decoder and advertises a resumable position',async()=>{
 const {c,p,s,el,messages,writes}=harness(),hot=s.decoderHot;await c.closePreview();
 assert.equal(c.activePreview,p);assert.equal(p.media,el);assert.equal(s.decoderHot,hot);assert.equal(s.state,'paused');assert.equal(el.paused,true);assert.equal(s.timer,0);assert.equal(s.inflight.size,0);assert.equal(s.requestedAt.size,0);assert.deepEqual(s.retry,[1]);assert.equal(c.sessionBySid.has('original'),false);
 assert.equal(messages[0].type,'stream-end');assert.equal(messages[0].sid,'original');assert.equal(c.previewBookmarks.get('movie').time,129.25);assert.equal(c.previewBookmarks.get('movie').paused,true);assert.ok(writes.some(x=>x[0]==='previewBookmarks'));
 assert.match(c.previewPlayButton('movie'),/resumeAvailable/);assert.match(c.previewPlayButton('movie'),/Resume file at 2:09/);
});
test('resume retains the exact media time and cache but renews the retired network session and restarts acquisition',async()=>{
 const {c,p,s,el,events}=harness();await c.closePreview();await c.reopenWarmPreview({contentId:'movie'},p.c);
 assert.equal(c.activePreview,p);assert.equal(p.media,el);assert.equal(el.currentTime,129.25);assert.equal(el.playbackRate,1.5);assert.equal(el.paused,false);assert.equal(s.state,'downloading');assert.equal(s.sid,'resumed');assert.equal(s.cacheSid,'original');assert.equal(c.sessionBySid.get('resumed'),s);assert.equal(p.hiddenAt,0);assert.ok(events.includes('scheduler'));assert.ok(events.includes('demand'));
 assert.equal(c.previewBookmarks.get('movie').paused,false);assert.doesNotMatch(c.previewPlayButton('movie'),/resumeAvailable/);
});
test('bookmarks for multiple files remain independently resumable and finished media clears its marker',()=>{
 const {c,p}=harness();c.savePreviewPosition(p,true);c.savePreviewPosition({...p,c:{id:'second'},media:{currentTime:5401,playbackRate:1}},true);
 assert.match(c.previewPlayButton('movie'),/2:09/);assert.match(c.previewPlayButton('second'),/1:30:01/);c.savePreviewPosition({...p,media:{ended:true}},false);
 assert.equal(c.previewBookmarks.has('movie'),false);assert.equal(c.previewBookmarks.has('second'),true);
});
test('cold MP4 resume requests the saved keyframe range once metadata exists, without replaying its prefix',()=>{
 const {c,p,el,events}=harness();p.mode='mp4box';p.mp4boxReady=false;p.resumeTime=6000;el.currentTime=0;c.mediaOriginalDuration=()=>9661;
 assert.equal(c.restorePreviewPosition(p),false);assert.equal(events.length,0);p.mp4boxReady=true;el.readyState=0;assert.equal(c.restorePreviewPosition(p),false);assert.equal(events.length,0);el.readyState=1;assert.equal(c.restorePreviewPosition(p),true);
 assert.equal(el.currentTime,6000);assert.equal(p.resumeTime,null);assert.deepEqual(events,[['seek',6000]]);assert.equal(c.restorePreviewPosition(p),false);
});
test('encrypted cached bytes remain readable across repeated network-session renewals',async()=>{
 const {c,s}=harness(['streamCacheKey','cacheStreamChunk','loadStreamCachedChunk']),records=new Map();
 Object.assign(c,{Uint8Array,encryptBytes:async(bytes,aad)=>({bytes,aad}),decryptBytes:async(packet,aad)=>{assert.equal(packet.aad,aad);return packet.bytes},idbPut:async(store,key,value)=>records.set(key,value),idbGet:async(store,key)=>records.get(key),mp4ProgressiveCursor:()=>0});
 const bytes=new Uint8Array([1,2,3]);await c.cacheStreamChunk(s,2,bytes);s.cacheSid=s.sid;s.sid='new-network-id';assert.deepEqual(await c.loadStreamCachedChunk(s,2),bytes);
 await c.cacheStreamChunk(s,3,new Uint8Array([4]));s.sid='another-network-id';assert.deepEqual(await c.loadStreamCachedChunk(s,3),new Uint8Array([4]));assert.ok([...records.keys()].every(k=>k.startsWith('original:')));
});
test('retiring a stream during asynchronous packet authentication prevents a new carrier dispatch',async()=>{
 const {c}=harness(['streamRequestCurrent','sendBinaryMultipathActor']);let authenticated,sends=0;
 Object.assign(c,{streamServeEpochs:new Map(),authenticateBinaryV4:(remote,packet,metadata)=>new Promise(resolve=>authenticated=()=>resolve(metadata)),streamDataCandidates:()=>{sends++;return[]}});
 const metadata={id:'movie',sid:'original',seekEpoch:2,mode:'stream'},sending=c.sendBinaryMultipathActor('viewer',new Uint8Array(),metadata);
 c.streamServeEpochs.set('viewer|movie|original',Infinity);authenticated();assert.equal(await sending,false);assert.equal(sends,0);
});
