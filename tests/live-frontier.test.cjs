const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const{source}=require('./v4-helper.cjs');
function fixture(){let now=600000;const requests=[],s={started:0,total:51,chunkSize:512*1024,mp4SequentialCursor:10,requestedAt:new Map([[10,0],[40,0]]),deliveryLatency:1,deliveryJitter:0,safePlantPressure:2,safeRequestChunks:1},el={currentTime:0,paused:false,readyState:2,playbackRate:1},p={mode:'live',media:el,session:s},v={chunked:true,session:s,preview:p,el,publisher:'publisher',relayId:'live-bytes-test',relayNextSeq:10,head:50,relayPending:new Map(),receiving:new Set(),pendingBytes:0,startedPlayback:true,nextRequestAt:Infinity,lastManifestAt:now};
 const c=vm.createContext({performance:{now:()=>now},activePreview:null,activeLiveViewer:v,SCHEDULER_TICK_MS:180,SAFE_HEDGE_INTERVAL_MS:550,MP4_RAM_QUEUE_BUDGET_BYTES:64*1024*1024,streamBufferedAhead:()=>0,streamBufferedState:()=>({inRange:false}),streamSafeBand:()=>({low:5,high:10,rate:1,bps:512*1024}),streamReceiveRate:()=>512*1024,safeBufferCritical:()=>true,mp4ProgressiveCursor:s=>s.mp4SequentialCursor,streamPathHintsFor:()=>[],updateSafeRateController:()=>{},snapPlaybackToFirstBufferedRange:()=>{},followLiveEdge:()=>{},pumpLiveChunkPlayer:()=>{},trimPreviewBehind:()=>{},restartLiveChunkViewer:()=>{},sendLiveWatchRequest:()=>{},liveChunkRequest:(v,idx,rescue)=>requests.push({idx:[...idx],rescue}),$:()=>({textContent:''})});
 for(const name of ['noteStreamDelivery','decoderFrontierTiming','tickLiveChunkViewer'])vm.runInContext(source(name),c);return{c,p,s,v,requests,advance:x=>now+=x};
}
test('late speculative live bytes cannot inflate frontier latency or prevent immediate overdue rescue',()=>{
 const{c,s,v,requests}=fixture();c.noteStreamDelivery(s,40);assert.equal(s.deliveryQueueLatency,600);assert.equal(s.deliveryLatency,1);assert.equal(s.deliveryJitter,0);assert.equal(s.requestedAt.has(40),false);
 s.safeWaitHead=10;s.safeWaitAt=599000;c.tickLiveChunkViewer(v);assert.ok(requests.some(x=>x.rescue&&x.idx[0]===10),'a missing head with no playable runway uses the measured byte service');
});
test('a newly exposed live frontier measures its own genuine wait rather than old bulk reservation age',()=>{
 const{c,s,v,advance}=fixture();c.tickLiveChunkViewer(v);assert.equal(s.safeWaitHead,10);assert.equal(s.safeWaitAt,600000);advance(2000);c.noteStreamDelivery(s,10);
 assert.equal(s.deliveryQueueLatency,602);assert.equal(s.deliveryLatency,1.25);assert.equal(s.deliveryJitter,.25);
});
test('a fresh live request after head exposure retains its actual request-to-delivery latency',()=>{
 const{c,s,v,advance}=fixture();c.tickLiveChunkViewer(v);advance(1000);s.requestedAt.set(10,601000);advance(2000);c.noteStreamDelivery(s,10);assert.equal(s.deliveryLatency,1.25);assert.equal(s.deliveryJitter,.25);
});
test('an unpublished live frontier cannot accumulate a fictitious missing-input wait',()=>{
 const{c,s,v}=fixture();s.safeWaitHead=10;s.safeWaitAt=0;v.head=10;c.tickLiveChunkViewer(v);assert.equal(s.safeWaitHead,-1);assert.equal(s.safeWaitAt,0);
});
test('a genuine delayed live frontier still increases response protection but cannot delay rescue beyond runway',()=>{
 const{c,s,v,requests}=fixture();s.safeWaitHead=10;s.safeWaitAt=0;c.noteStreamDelivery(s,10);assert.ok(s.deliveryLatency>100);assert.ok(s.deliveryJitter>100);
 v.relayNextSeq=11;s.mp4SequentialCursor=11;s.requestedAt.set(11,0);s.safeWaitHead=11;s.safeWaitAt=599000;c.tickLiveChunkViewer(v);assert.ok(requests.some(x=>x.rescue&&x.idx[0]===11));
});
