const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {source}=require('./v4-helper.cjs');
function legacyHarness(names){
 const sent=[],nodes=new Map();let id=0;
 const c=vm.createContext({console,Map,Set,Uint8Array,Promise,Date,performance,actor:'publisher',CHUNK_SIZE:16,MP4_RAM_QUEUE_BUDGET_BYTES:64,STREAM_KEEP_BEHIND_SECONDS:10,localLive:null,activeLiveViewer:null,crypto:{randomUUID:()=>String(++id)},msg:(type,data)=>({type,...data}),sendActorIngress:async(to,m)=>sent.push({to,...m}),clearTimeout:()=>{},setTimeout:()=>1,SCHEDULER_TICK_MS:180,liveRecorderMime:()=> 'video/webm',encryptBytes:async x=>x,decryptBytes:async x=>x,sendBinaryMultipathActor:async()=>true,window:{},URL:{createObjectURL:()=>`blob:${++id}`,revokeObjectURL:()=>{}},$:q=>{if(!nodes.has(q))nodes.set(q,{textContent:''});return nodes.get(q)},MediaRecorder:class{constructor(){this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive'}}});
 for(const name of names)vm.runInContext(source(name),c)
 return{c,sent,nodes};
}
const publishFunctions=['stopLiveRelayRecorder','legacyLiveByteBudget','drainLegacyLiveRecorder','restartLegacyLiveRecorder','startLiveRelayRecorder'];
const viewerFunctions=['legacyLiveByteBudget','resetLegacyLivePlayer','requestLegacyLiveResync','ensureLiveRelayPlayer','pumpLiveRelayPlayer','handleLiveBinary'];
function viewer(c){const v={id:'live',publisher:'publisher',el:{readyState:2,currentTime:100,play:async()=>{},pause(){},load(){},removeAttribute(){}},relayPending:new Map(),relayNextSeq:0,retryTimer:0};c.activeLiveViewer=v;return v}
test('legacy capture stays within its byte budget while a transport send never settles',async()=>{
 const{c}=legacyHarness(publishFunctions);let release,read=0;c.sendBinaryMultipathActor=()=>new Promise(r=>release=r);const x={pc:null},live={id:'live',mode:'screen',stream:{},watchers:new Set(['viewer']),peers:new Map([['viewer',x]])};c.localLive=live;
 await c.startLiveRelayRecorder('viewer');const first=x.relay;
 first.recorder.ondataavailable({data:{size:16,arrayBuffer:async()=>{read++;return new Uint8Array(16).buffer}}});await new Promise(r=>setImmediate(r));
 for(let i=0;i<1000;i++)first.recorder.ondataavailable({data:{size:16,arrayBuffer:async()=>{read++;return new Uint8Array(16).buffer}}});
 await new Promise(r=>setImmediate(r));assert.ok(Number.isFinite(first.queuedBytes)&&first.queuedBytes<=64);assert.equal(first.stopped,true);assert.equal(read,1);assert.equal(x.relay,first,'never launch another encoder behind a stuck send');
 release(true);await first.sending;await new Promise(r=>setImmediate(r));assert.notEqual(x.relay,first);assert.equal(x.relay.seq,0);assert.ok(x.relay.epoch>first.epoch);
});
test('legacy missing initialization cannot grow pending packets beyond the receiver budget',async()=>{
 const{c,sent}=legacyHarness(viewerFunctions),v=viewer(c);c.ensureLiveRelayPlayer=()=>true;c.pumpLiveRelayPlayer=()=>{};
 for(let seq=1;seq<=1000;seq++)await c.handleLiveBinary(new Uint8Array(16),{metadata:{liveId:'live',seq,mime:'video/webm'}});
 const bytes=[...v.relayPending.values()].reduce((n,x)=>n+x.length,0);assert.ok(bytes<=64);assert.ok(sent.some(m=>m.relayResync));assert.ok(sent.length<=1,'one recovery request stays in flight rather than creating another backlog');
});
test('late legacy decrypt cannot replace a viewer closed during verification',async()=>{
 const{c}=legacyHarness(viewerFunctions),v=viewer(c);let finish,opened=0;c.decryptBytes=()=>new Promise(r=>finish=r);c.ensureLiveRelayPlayer=()=>{opened++;return true};c.pumpLiveRelayPlayer=()=>{};
 const receive=c.handleLiveBinary(new Uint8Array(16),{metadata:{liveId:'live',seq:0,mime:'video/webm'}});c.activeLiveViewer=null;finish(new Uint8Array(16));await receive;assert.equal(opened,0);assert.equal(v.relayPending.size,0);
});
test('legacy MSE quota retry keeps the exact append frontier until updateend',()=>{
 const{c}=legacyHarness(viewerFunctions),v=viewer(c),part=new Uint8Array(16);v.relayPending.set(0,part);v.pendingBytes=16;v.relaySourceBuffer={updating:false,buffered:{length:0},appendBuffer(){throw Object.assign(Error('quota'),{name:'QuotaExceededError'})}};
 c.pumpLiveRelayPlayer(v);assert.equal(v.relayNextSeq,0);assert.equal(v.relayPending.get(0),part);assert.equal(v.pendingBytes,16);
});
test('legacy MSE evicts playback history and acknowledges only successful appends',()=>{
 const{c}=legacyHarness(viewerFunctions),v=viewer(c);let onopen,onupdate,appends=0,removals=[];const sb={updating:false,buffered:{length:1,start:()=>0,end:()=>120},appendBuffer(){appends++},remove(a,b){removals.push([a,b]);this.updating=true},addEventListener(name,fn){if(name==='updateend')onupdate=fn}};
 c.MediaSource=class{static isTypeSupported(){return true}constructor(){this.readyState='open'}addEventListener(name,fn){if(name==='sourceopen')onopen=fn}addSourceBuffer(){return sb}};c.window.MediaSource=c.MediaSource;
 assert.equal(c.ensureLiveRelayPlayer(v,'video/webm'),true);v.relayPending.set(0,new Uint8Array(16));v.pendingBytes=16;onopen();assert.deepEqual(removals,[[0,90]]);assert.equal(appends,0);sb.updating=false;sb.buffered.start=()=>90;onupdate();assert.equal(appends,1);assert.equal(v.relayNextSeq,0);onupdate();assert.equal(v.relayNextSeq,1);assert.equal(v.pendingBytes,0);
});
test('missing modern initialization requests the observed epoch and rejects retired encoder packets',async()=>{
 const{c,sent}=legacyHarness(viewerFunctions),v=viewer(c);let opened=0;c.ensureLiveRelayPlayer=()=>{opened++;return true};c.pumpLiveRelayPlayer=()=>{};
 const receive=(epoch,seq)=>c.handleLiveBinary(new Uint8Array(16),{metadata:{liveId:'live',relayEpoch:epoch,seq,mime:'video/webm'}});
 await receive(3,1);assert.equal(sent[0].relayEpoch,3);assert.equal(v.legacyMinimumEpoch,4);await receive(3,0);assert.equal(opened,0);
 await receive(4,0);assert.equal(opened,1);assert.equal(v.legacyEpoch,4);assert.equal(v.legacyResyncPending,false);await receive(3,0);assert.equal(opened,1);assert.equal(v.relayPending.size,1);
});
test('duplicate legacy resync controls cannot reset a replacement encoder',async()=>{
 const{c}=legacyHarness([...publishFunctions,'handleLiveWatch']);const x={pc:null},live={id:'live',mode:'screen',stream:{},watchers:new Set(['viewer']),peers:new Map([['viewer',x]])};c.localLive=live;await c.startLiveRelayRecorder('viewer');const first=x.relay;
 await c.handleLiveWatch({id:'live',actor:'viewer',relayResync:true,relayEpoch:first.epoch});const replacement=x.relay;assert.notEqual(replacement,first);
 await c.handleLiveWatch({id:'live',actor:'viewer',relayResync:true,relayEpoch:first.epoch});assert.equal(x.relay,replacement);await c.handleLiveWatch({id:'live',actor:'stranger',relayResync:true,relayEpoch:replacement.epoch});assert.equal(x.relay,replacement);
});
