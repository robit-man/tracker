const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto:crypto}=require('node:crypto');
const {fixture}=require('./v4-helper.cjs');
test('canonical byte vector has sorted UTF-16 keys, ECMAScript numbers and unchanged Unicode',async()=>{
 const c=await fixture(),value={z:[true,null,-0,1e30],a:{'é':'日本','😀':'x'},n:0.002};
 assert.equal(Buffer.from(c.canonicalEncodeV4(value)).toString(),''+ '{"a":{"é":"日本","😀":"x"},"n":0.002,"z":[true,null,0,1e+30]}');
 assert.throws(()=>c.canonicalEncodeV4({x:NaN}),/Invalid number/);assert.throws(()=>c.canonicalEncodeV4('\ud800'),/Invalid Unicode/);
 assert.throws(()=>c.canonicalEncodeV4(JSON.parse('{"__proto__":{}}')),/Unsafe property/);
});
test('Ed25519 identity validates its non-extractable key and deterministic ID',async()=>{
 const c=await fixture();assert.equal(await c.validateNodeIdentity(c.nodeIdentity),c.nodeIdentity);
 await assert.rejects(crypto.subtle.exportKey('pkcs8',c.nodeIdentity.privateKey));
 await assert.rejects(c.validateNodeIdentity({...c.nodeIdentity,nodeId:'n-'+ '0'.repeat(64)}),/invalid/);
 const other=await fixture();await assert.rejects(c.validateNodeIdentity({...c.nodeIdentity,privateKey:other.nodeIdentity.privateKey}),/self-test failed/);
});
test('controls verify across nodes and reject tampering, replay and unsigned downgrades',async()=>{
 const sender=await fixture(),receiver=await fixture('actor-b');
 const input={v:2,actor:sender.actor,type:'catalog',mid:crypto.randomUUID(),ts:Date.now(),to:'actor-b',entries:[{id:'r-1',name:'file',parent:null,contentId:'f-'+ '0'.repeat(64)}]};
 const signed=await sender.signControlV4(input);assert.equal((await receiver.verifyControlV4(signed)).status,'verified');
 await assert.rejects(receiver.verifyControlV4(signed),/replay/);
 await assert.rejects(receiver.verifyControlV4(input),/downgrade/);
 for(const change of [m=>m.actor='forged',m=>m.to='forged',m=>m.mid='forged',m=>m.entries[0].name='forged',m=>m.entries[0].parent='forged',m=>m.auth.roomHash='b'.repeat(64),m=>m.auth.nodeId='n-'+ '0'.repeat(64)]){
  const m=JSON.parse(JSON.stringify(signed));change(m);await assert.rejects(receiver.verifyControlV4(m));
 }
});
test('valid rival key cannot usurp a pinned actor; simultaneous deliveries dispatch once',async()=>{
 const a=await fixture(),b=await fixture(),r=await fixture('receiver');
 const one=await a.signControlV4({v:2,actor:a.actor,type:'hello',mid:'hello-one'});await r.verifyControlV4(one);
 await assert.rejects(r.verifyControlV4(await b.signControlV4({v:2,actor:b.actor,type:'hello',mid:'hello-two'})),/collision/);
 const fresh=await a.signControlV4({v:2,actor:a.actor,type:'availability',mid:'racing',ids:[]});
 const results=await Promise.allSettled([r.verifyControlV4(fresh),r.verifyControlV4(fresh)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
});
test('only unknown legacy actors have the explicit unverified compatibility path',async()=>{
 const r=await fixture('receiver');assert.equal((await r.verifyControlV4({v:2,actor:'old-peer',type:'hello'})).status,'legacy-unverified');
 await assert.rejects(r.verifyControlV4({v:2,actor:'old-peer',type:'hello',auth:{protocol:4}}));
});
