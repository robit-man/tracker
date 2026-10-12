const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {source}=require('./v4-helper.cjs'),html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const functions=['timeRangesList','sourceBufferAhead','sourceBufferNativeUsage','sourceBufferNativeHorizon','sourceBufferQuotaBlocked','mp4SafeRamHorizon','trimPreviewBehind','drainSourceBuffer'];
function fixture(){let now=1000,timers=0,events=0;const p={mode:'mp4box',media:{currentTime:15},session:{seekEpoch:0},mp4TrackBuffers:new Map()},c=vm.createContext({performance:{now:()=>now},activePreview:p,MP4_MSE_TARGET_BUDGET_BYTES:384000000,STREAM_KEEP_BEHIND_SECONDS:15,streamAverageMediaBytesPerSecond:()=>1000,previewDebugEvent:()=>events++,console:{warn(){}},setTimeout:()=>{timers++;return timers},drainMp4SourceBuffers:()=>{}});
 for(const name of functions)if(html.includes('function '+name+'('))vm.runInContext(source(name),c);return{c,p,advance:x=>now+=x,counts:()=>({events,timers})}
}
function buffer(p,{start=0,end=100,bytes=10000,kind='V',quota=true}={}){const head=new Uint8Array(200).buffer;head.__mseStart=end;head.__mseEnd=end+2;const sb={__preview:p,__trackKind:kind,__q:[head],__qBytes:200,__mseJournal:[{start,end,bytes,pending:false}],__mseFragmentBytes:200,__nativeInitBytes:0,updating:false,start,end,attempts:0,quota,buffered:{length:1,start:()=>sb.start,end:()=>sb.end},appendBuffer(){this.attempts++;if(this.quota)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});this.end+=2;this.updating=true},remove(a,b){this.start=b;this.updating=true}};p.mp4TrackBuffers.set(kind,sb);return sb}
test('one native quota failure suppresses repeated unchanged drain callbacks and timers',()=>{
 const{c,p,counts}=fixture(),sb=buffer(p);for(let i=0;i<1000;i++)c.drainSourceBuffer(sb);assert.equal(sb.attempts,1);assert.equal(sb.__q.length,1);assert.equal(sb.__qBytes,200);assert.equal(counts().events,1);assert.equal(counts().timers,0);
});
test('successful audio append cannot clear the video buffer quota ownership',()=>{
 const{c,p}=fixture(),video=buffer(p),audio=buffer(p,{kind:'A',quota:false,bytes:1000});c.drainSourceBuffer(video);assert.equal(p.mseQuotaBlocked,true);c.drainSourceBuffer(audio);assert.equal(audio.attempts,1);assert.equal(p.mseQuotaBlocked,true);assert.equal(video.__q.length,1);
});
test('real eviction admits the exact rejected fragment without a periodic retry or sticky hold',()=>{
 const{c,p,counts}=fixture(),sb=buffer(p);c.drainSourceBuffer(sb);for(let i=0;i<100;i++)c.drainSourceBuffer(sb);assert.equal(sb.attempts,1);const head=sb.__q[0];p.media.currentTime=25;sb.start=10;sb.updating=false;sb.quota=false;c.drainSourceBuffer(sb);assert.equal(sb.attempts,2);assert.equal(sb.__q.length,0);assert.equal(sb.__lastAppendBytes,head.byteLength);assert.equal(p.mseQuotaBlocked,false);assert.equal(counts().timers,0);
});
test('native capacity follows track density and subtracts history plus disjoint residency',()=>{
 const{c,p}=fixture(),sb=buffer(p);c.drainSourceBuffer(sb);const first=c.mp4SafeRamHorizon(p);assert.ok(first<100,'measured native quota replaces the much larger configured budget');sb.__mseJournal[0].bytes*=2;sb.__nativeUsageKey=null;const second=c.mp4SafeRamHorizon(p);assert.ok(second<first*.6,'denser encoded media reduces the learned byte capacity horizon');
 sb.__mseJournal=[{start:0,end:40,bytes:4000},{start:100,end:140,bytes:4000}];sb.buffered={length:2,start:i=>i?100:0,end:i=>i?140:40};p.media.currentTime=20;const fragmented=c.mp4SafeRamHorizon(p);assert.ok(fragmented<first,'other retained ranges consume the same native capacity');
});
test('a changed seek epoch discards old rejection ownership and admission wakes after ranges are released',()=>{
 const{c,p}=fixture(),sb=buffer(p);c.drainSourceBuffer(sb);p.session.seekEpoch++;p.media.currentTime=500;sb.__q[0].__mseStart=500;sb.__q[0].__mseEnd=502;sb.buffered={length:0,start(){},end(){}};sb.quota=false;c.drainSourceBuffer(sb);assert.equal(sb.attempts,2);assert.equal(sb.__q.length,0);assert.equal(p.mseQuotaBlocked,false);
});
test('playback clocks and eviction smaller than the rejected fragment cannot trigger native retries',()=>{
 const{c,p}=fixture(),sb=buffer(p);c.drainSourceBuffer(sb);sb.quota=false;p.media.currentTime=15.5;
 for(let i=0;i<100;i++)c.drainSourceBuffer(sb);assert.equal(sb.attempts,1,'clock movement alone does not free native bytes');
 sb.start=.1;for(let i=0;i<100;i++)c.drainSourceBuffer(sb);assert.equal(sb.attempts,1,'ten bytes of eviction cannot pay for a two-hundred-byte fragment');
 sb.start=10;c.drainSourceBuffer(sb);assert.equal(sb.attempts,2);assert.equal(sb.__q.length,0);
});
test('the native journal retains only fragments overlapping actual buffered ranges',()=>{
 const{c,p}=fixture(),sb=buffer(p,{start:0,end:0,bytes:0,quota:false});sb.__q=[];sb.__qBytes=0;sb.__mseJournal=[];sb.__mseFragmentBytes=0;
 for(let i=0;i<4000;i++){
  const head=new Uint8Array(200).buffer;head.__mseStart=i*2;head.__mseEnd=i*2+2;sb.__q.push(head);sb.__qBytes=200;c.drainSourceBuffer(sb);sb.updating=false;sb.start=Math.max(0,sb.end-20);c.sourceBufferNativeUsage(sb);
  assert.ok(sb.__mseJournal.length<=10,'native history eviction also prunes JavaScript metadata');
 }
 assert.equal(sb.attempts,4000);assert.equal(sb.__mseJournal.reduce((n,x)=>n+x.bytes,0),2000);
});
test('an in-progress append remains accounted until native updateend exposes its range',()=>{
 const{c,p}=fixture(),sb=buffer(p,{quota:false});const resident=c.sourceBufferNativeUsage(sb).bytes;c.drainSourceBuffer(sb);const end=sb.end;sb.end-=2;
 assert.equal(c.sourceBufferNativeUsage(sb).bytes,resident+200,'accepted bytes remain resident while append is pending');sb.end=end;sb.updating=false;
 assert.equal(c.sourceBufferNativeUsage(sb).bytes,resident+200);assert.equal(sb.__mseJournal.at(-1).pending,false);
});
test('a header-only quota cannot become a permanent media ceiling and probes remain paced',()=>{
 const{c,p,advance,counts}=fixture(),sb=buffer(p,{start:0,end:0,bytes:0});sb.__mseJournal=[];sb.__nativeInitBytes=50;
 c.drainSourceBuffer(sb);assert.equal(sb.attempts,1);assert.equal(Number(sb.__nativeCapacityBytes)||0,0,'initialization headers do not measure native media capacity');
 for(let i=0;i<1000;i++)c.drainSourceBuffer(sb);assert.equal(sb.attempts,1);assert.equal(counts().timers,0);
 advance(1999);c.drainSourceBuffer(sb);assert.equal(sb.attempts,1);advance(1);sb.quota=false;c.drainSourceBuffer(sb);
 assert.equal(sb.attempts,2);assert.equal(sb.__q.length,0);assert.equal(p.mseQuotaBlocked,false);assert.equal(sb.__quotaProbeFailures,0);
});
test('an emptied native range permits the exact head despite a stale smaller learned capacity',()=>{
 const{c,p}=fixture(),sb=buffer(p,{start:0,end:0,bytes:0,quota:false});sb.__mseJournal=[];sb.__nativeInitBytes=50;sb.__nativeCapacityBytes=100;
 const head=sb.__q[0];c.drainSourceBuffer(sb);assert.equal(sb.attempts,1);assert.equal(sb.__lastAppendBytes,head.byteLength);assert.equal(sb.__q.length,0);assert.equal(sb.__nativeCapacityBytes,0,'obsolete header-sized capacity is discarded after actual native success');
});
test('measured playback eviction permits one bounded capacity recovery probe',()=>{
 const{c,p}=fixture(),sb=buffer(p,{quota:false});sb.__nativeCapacityBytes=10000;c.sourceBufferNativeUsage(sb);sb.start=4;c.sourceBufferNativeUsage(sb);
 assert.equal(sb.__nativeEvictionCredit,400);const first=sb.__q[0];c.drainSourceBuffer(sb);assert.equal(sb.attempts,1);assert.equal(sb.__q.length,0);sb.updating=false;
 for(let i=0;i<2;i++){const next=new Uint8Array(200).buffer;next.__mseStart=102+i*2;next.__mseEnd=104+i*2;sb.__q=[next];sb.__qBytes=200;c.drainSourceBuffer(sb);sb.updating=false}
 assert.equal(sb.attempts,3,'one paid probe can use native capacity beyond the previously learned byte count');assert.equal(sb.__nativeCapacityBytes,10200);assert.equal(sb.__nativeEvictionCredit,0);assert.equal(first.byteLength,200);
});
