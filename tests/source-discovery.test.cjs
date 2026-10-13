const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {source,fixture}=require('./v4-helper.cjs');
function discovery(){
 let now=1000;const wakes=[],queries=[],s={cid:'missing',mode:'download',state:'downloading',holders:new Set(),inflight:new Map(),started:1000};
 const c=vm.createContext({Set,Map,Number,Math,performance:{now:()=>now},sessions:new Map([['missing',s]]),activePreview:null,SCHEDULER_TICK_MS:180,TRANSFER_PROBE_TIMEOUT_MS:900,MESH_RENDEZVOUS_MS:12000,TRANSFER_FAILOVER_NO_BYTE_MS:900,
  advertisedRemoteSeeders:()=>[],scheduleSession:(s,delay)=>wakes.push(delay),msg:(type,data)=>({type,...data}),broadcast:async m=>queries.push(m)});
 for(const n of ['updateSessionSeeder','downloadSourceDiscoveryDelay','schedulerTickBody'])vm.runInContext(source(n),c);
 return{c,s,wakes,queries,advance:ms=>now+=ms};
}
test('repeated negative or unchanged availability cannot rearm a missing-file download',()=>{
 const h=discovery();for(let i=0;i<10000;i++)h.c.updateSessionSeeder('peer-'+i%4,['other-file']);assert.deepEqual(h.wakes,[]);assert.equal(h.s.holders.size,0);
 h.c.updateSessionSeeder('source',['missing']);assert.deepEqual(h.wakes,[0]);h.s.sourceDiscoveryRounds=10;
 for(let i=0;i<10000;i++)h.c.updateSessionSeeder('source',['missing']);assert.deepEqual(h.wakes,[0]);assert.equal(h.s.sourceDiscoveryRounds,10);
 h.c.updateSessionSeeder('source',[]);assert.deepEqual(h.wakes,[0,0]);assert.equal(h.s.sourceDiscoveryRounds,0);
 h.s.state='paused';h.c.updateSessionSeeder('source',['missing']);assert.equal(h.wakes.length,2);
});
test('an availability reply round cannot recursively trigger another source query',async()=>{
 const h=discovery();h.c.broadcast=async m=>{h.queries.push(m);for(let i=0;i<4;i++)h.c.updateSessionSeeder('peer-'+i,['other-file'])};
 await h.c.schedulerTickBody(h.s);assert.equal(h.queries.length,1);assert.equal(h.wakes.length,1);assert.ok(h.wakes[0]>0,'only the future discovery timer remains');
 for(let i=0;i<100;i++)await h.c.schedulerTickBody(h.s);assert.equal(h.queries.length,1,'unrelated wakeups cannot bypass discovery backpressure');
 h.advance(h.wakes[0]);await h.c.schedulerTickBody(h.s);assert.equal(h.queries.length,2);assert.ok(h.wakes.at(-1)>h.wakes[0]);
});
test('download discovery backs off to the mesh cadence and new sources wake immediately',()=>{
 const h=discovery(),delays=Array.from({length:100},()=>h.c.downloadSourceDiscoveryDelay(h.s));assert.equal(delays[0],900);assert.equal(delays.at(-1),12000);assert.ok(delays[1]>delays[0]);
 h.s.sourceDiscoveryDueAt=1e9;h.c.updateSessionSeeder('new-source',['missing']);assert.equal(h.wakes.at(-1),0);assert.equal(h.s.sourceDiscoveryDueAt,0);assert.equal(h.s.sourceDiscoveryRounds,0);
 const stream={cid:'movie',mode:'stream',state:'downloading',holders:new Set()};h.c.activePreview={session:stream};h.c.updateSessionSeeder('source',['movie']);assert.equal(stream.holders.size,1);assert.equal(h.wakes.at(-1),0);
});
function responder(){const calls=[],have=new Set(['other']),c=vm.createContext({Set,seedEnabled:id=>have.has(id),readLocalChunk:async id=>{calls.push(['read',id]);return new Uint8Array([1])},markUnreadableSeed:async id=>have.delete(id),advertisedSeeds:()=>[...have],advertisedSeedSalts:()=>({}),msg:(type,data)=>({type,...data}),sendActorIngress:async(a,m)=>{calls.push(['send',a,m]);return true}});vm.runInContext(source('answerSeedQuery'),c);return{c,calls,have}}
test('nonholders stay silent while a readable matching source answers discovery',async()=>{
 const h=responder();for(let i=0;i<100;i++)assert.equal(await h.c.answerSeedQuery({actor:'requester',ids:['missing']}),false);assert.equal(h.calls.length,0);
 h.have.add('missing');assert.equal(await h.c.answerSeedQuery({actor:'requester',ids:['missing','missing']}),true);assert.equal(h.calls.filter(x=>x[0]==='read').length,1);assert.equal(h.calls.filter(x=>x[0]==='send').length,1);
});
test('a vanished local source withdraws without advertising another file as an answer',async()=>{
 const h=responder();h.have.add('missing');h.c.readLocalChunk=async()=>null;assert.equal(await h.c.answerSeedQuery({actor:'requester',ids:['missing']}),false);assert.equal(h.have.has('missing'),false);assert.equal(h.calls.length,0);
});
function intake(mobile=false){let release;const gate=new Promise(r=>release=r),c=vm.createContext({IS_MOBILEISH:mobile,pageSuspended:false,controlIntake:{active:0,bytes:0,rejected:0,peakActive:0,peakBytes:0},Math,JSON,Error,dec:new TextDecoder(),b64ToBytes:()=>new Uint8Array(),decryptBytes:()=>gate,verifyControlV4:async()=>{}});vm.runInContext(source('openSeal'),c);return{c,release:()=>release(new TextEncoder().encode('{}'))}}
test('control bursts retain only a bounded number of asynchronous decrypt/verify jobs',async()=>{
 for(const mobile of [false,true]){const h=intake(mobile),jobs=Array.from({length:200},()=>h.c.openSeal('AAAA').then(()=>true,()=>false));const cap=mobile?8:16;assert.equal(h.c.controlIntake.active,cap);assert.equal(h.c.controlIntake.rejected,200-cap);h.release();const results=await Promise.all(jobs);assert.equal(results.filter(Boolean).length,cap);assert.equal(h.c.controlIntake.active,0);assert.equal(h.c.controlIntake.bytes,0);
 h.c.pageSuspended=true;await assert.rejects(h.c.openSeal('AAAA'),/capacity/);assert.equal(h.c.controlIntake.active,0);}
});
test('control byte admission and failed decryptions release their accounting',async()=>{
 const h=intake(),large='A'.repeat(8*1024*1024),jobs=[h.c.openSeal(large),h.c.openSeal(large)];await assert.rejects(h.c.openSeal(large),/capacity/);assert.equal(h.c.controlIntake.peakBytes,32*1024*1024);h.release();await Promise.all(jobs);assert.equal(h.c.controlIntake.bytes,0);
 h.c.decryptBytes=async()=>{throw Error('bad tag')};await assert.rejects(h.c.openSeal('AAAA'),/bad tag/);assert.equal(h.c.controlIntake.active,0);assert.equal(h.c.controlIntake.bytes,0);
});
test('authenticated duplicates are rejected before canonicalization and signature verification',async()=>{
 const sender=await fixture(),receiver=await fixture('receiver'),m=await sender.signControlV4({v:2,type:'hello',actor:sender.actor,mid:'duplicate'});await receiver.verifyControlV4(m);
 receiver.controlShapeV4=()=>{throw Error('expensive shape work repeated')};for(let i=0;i<1000;i++)await assert.rejects(receiver.verifyControlV4(m),/replay/);
});
