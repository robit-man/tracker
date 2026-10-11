const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto:crypto}=require('node:crypto');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function source(name){const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1);const next=html.slice(start+1).search(/^(?:async )?function /m);return html.slice(start,next<0?undefined:start+next+1)}
async function fixture(actor='actor-a'){
 const c=vm.createContext({crypto,Uint8Array,TextEncoder,enc:new TextEncoder(),btoa,atob,Date,actor,roomHash:'a'.repeat(64),nodeIdentity:null,
  actorKeys:new Map(),verifiedPublicKeys:new Map(),authenticatedReplay:new Map(),securityPinsWrite:Promise.resolve(),putKV:async()=>{}});
 for(const name of ['randomBytes','bytesToB64','b64ToBytes','bytesToHex','concatBytes','sha256Bytes','sha256Hex','nodeIdFor','validateNodeIdentity'])vm.runInContext(source(name),c);
 vm.runInContext(html.slice(html.indexOf('function canonicalStringV4('),html.indexOf('/* End V4 authentication. */')),c);
 const keys=await crypto.subtle.generateKey('Ed25519',false,['sign','verify']),raw=new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey));
 c.nodeIdentity={version:1,algorithm:'Ed25519',privateKey:keys.privateKey,publicKeyRaw:raw,nodeId:await c.nodeIdFor(raw),createdAt:Date.now()};return c;
}
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
module.exports={fixture,source,html};
