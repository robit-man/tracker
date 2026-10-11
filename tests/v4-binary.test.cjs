const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fixture,source}=require('./v4-helper.cjs');
async function node(actor){const c=await fixture(actor);Object.assign(c,{peerBinarySessions:new Map(),latestBinarySession:new Map()});for(const name of ['initBinaryIdentityV4','bindBinarySessionV4','binaryMetadataV4','binaryAuthBytesV4','authenticateBinaryV4','verifyBinaryV4'])vm.runInContext(source(name),c);await c.initBinaryIdentityV4();return c}
async function pair(fallback=false){const a=await node('sender'),b=await node('recipient');if(fallback){delete a.binaryIdentity.pairs.X25519;delete a.binaryIdentity.descriptor.keys.X25519}for(const [x,y]of [[a,b],[b,a]])await y.verifyControlV4(await x.signControlV4({v:2,actor:x.actor,type:'hello',mid:x.actor}));return[a,b]}
const packet=new Uint8Array([1,2,3,4]),meta={kind:'chunk',id:'f-'+ '0'.repeat(64),sid:'transfer',idx:2,total:10,mode:'stream'};
test('signed ephemeral key agreement yields directional binary authentication with native P-256 fallback',async()=>{
 for(const fallback of [false,true]){const[a,b]=await pair(fallback),m=await a.authenticateBinaryV4(b.actor,packet,meta);assert.equal(await b.verifyBinaryV4(packet,m,a.actor),true);assert.equal(await b.verifyBinaryV4(packet,m,a.actor),false);const back=await b.authenticateBinaryV4(a.actor,packet,meta);assert.equal(await a.verifyBinaryV4(packet,back,b.actor),true);assert.equal(await a.verifyBinaryV4(packet,m,b.actor),false)}
});
test('binary MAC binds payload, content, transfer, recipient, epoch and sequence before replay bookkeeping',async()=>{
 const[a,b]=await pair(),original=await a.authenticateBinaryV4(b.actor,packet,{...meta,seekEpoch:2});
 for(const mutate of [m=>m.idx++,m=>m.id='f-'+ '1'.repeat(64),m=>m.sid='other',m=>m.seekEpoch++,m=>m.nodeAuth.seq++,m=>m.nodeAuth.to='other',m=>m.nodeAuth.senderSession='other',m=>m.nodeAuth.mac='A'.repeat(43)]){const m=JSON.parse(JSON.stringify(original));mutate(m);assert.equal(await b.verifyBinaryV4(packet,m,a.actor),false)}
 assert.equal(await b.verifyBinaryV4(new Uint8Array([4,3,2,1]),original,a.actor),false);assert.equal(await b.verifyBinaryV4(packet,original,a.actor),true);
});
test('multipath replay dispatches once, admits out of order packets and excludes transport annotations',async()=>{
 const[a,b]=await pair(),one=await a.authenticateBinaryV4(b.actor,packet,meta),two=await a.authenticateBinaryV4(b.actor,packet,meta);
 assert.equal(await b.verifyBinaryV4(packet,{...two,txPath:'direct:test',relayActor:a.actor,relayPlane:'mqtt'},a.actor),true);
 const results=await Promise.all([b.verifyBinaryV4(packet,one,a.actor),b.verifyBinaryV4(packet,one,a.actor)]);assert.equal(results.filter(Boolean).length,1);
 const late=await a.authenticateBinaryV4(b.actor,packet,meta),session=await b.peerBinarySessions.get(b.latestBinarySession.get(a.actor));session.highest=late.nodeAuth.seq+2048;assert.equal(await b.verifyBinaryV4(packet,late,a.actor),false);
});
test('binary legacy compatibility cannot downgrade a pinned actor or enter a protected room',async()=>{
 const[a,b]=await pair();assert.equal(await b.verifyBinaryV4(packet,meta,'old-peer'),true);assert.equal(await b.verifyBinaryV4(packet,meta,a.actor),false);
 b.ownerAnchor=b.nodeIdentity.nodeId;assert.equal(await b.verifyBinaryV4(packet,meta,'old-peer'),false);await assert.rejects(b.authenticateBinaryV4('old-peer',packet,meta),/Unauthenticated/);
});
test('a replaced runtime cannot reuse an old recipient session; signed handshake forks are rejected',async()=>{
 const[a,b]=await pair(),old=await a.authenticateBinaryV4(b.actor,packet,meta);await b.initBinaryIdentityV4();assert.equal(await b.verifyBinaryV4(packet,old,a.actor),false);
 const session=await a.peerBinarySessions.get(a.latestBinarySession.get(b.actor)),fork=JSON.parse(JSON.stringify(session.descriptor));fork.keys['ECDH-P256']='A'.repeat(87);await assert.rejects(a.bindBinarySessionV4({actor:b.actor,nodeId:b.nodeIdentity.nodeId},fork),/fork/);
});
