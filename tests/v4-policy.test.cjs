const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fixture,source}=require('./v4-helper.cjs');
async function policyPeer(actor){const c=await fixture(actor);Object.assign(c,{policyHistory:new Map(),pendingPolicies:new Map()});for(const f of ['recordBodyV4','signRecordV4','verifyRecordV4','hasPermissionV4','acceptPolicyV4'])vm.runInContext(source(f),c);return c}
async function policy(owner,epoch=1,previous=null,grants=[]){return owner.signRecordV4({protocol:4,roomHash:owner.roomHash,ownerNodeId:owner.nodeIdentity.nodeId,actor:owner.actor,epoch,revisionId:'revision-'+epoch,previousRevision:previous,createdAt:Date.now(),grants},'robit-tracker-policy-v4')}
test('peer genesis claims never protect an open room and cannot replace an invite anchor',async()=>{
 const owner=await policyPeer('owner'),rogue=await policyPeer('rogue'),r=await policyPeer('reader');
 assert.equal(await r.acceptPolicyV4(await policy(rogue)),false);assert.equal(r.ownerAnchor,'');
 r.ownerAnchor=owner.nodeIdentity.nodeId;assert.equal(await r.acceptPolicyV4(await policy(rogue)),false);
 assert.equal(await r.acceptPolicyV4(await policy(owner)),true);assert.equal(r.roomPolicy.ownerNodeId,owner.nodeIdentity.nodeId);
});
test('protected signatures do not grant writing; owner grants, expiry and revocation are enforced',async()=>{
 const owner=await policyPeer('owner'),writer=await policyPeer('writer'),r=await policyPeer('reader');r.ownerAnchor=owner.nodeIdentity.nodeId;
 await r.acceptPolicyV4(await policy(owner));assert.equal(r.hasPermissionV4(writer.nodeIdentity.nodeId,'write'),false);
 await assert.rejects(r.verifyControlV4({v:2,actor:'old',type:'catalog'}),/downgrade/);
 const grant={subjectNodeId:writer.nodeIdentity.nodeId,permissions:['read','write'],expiresAt:Date.now()+60000,nonce:'grant-1'};
 await r.acceptPolicyV4(await policy(owner,2,'revision-1',[grant]));assert.equal(r.hasPermissionV4(writer.nodeIdentity.nodeId,'write'),true);
 const manifest=await writer.signRecordV4({originActor:'writer',root:'a'.repeat(64)},'robit-tracker-manifest-v4');assert.equal(await r.verifyRecordV4(manifest,'robit-tracker-manifest-v4','writer'),true);
 await r.acceptPolicyV4(await policy(owner,3,'revision-2',[]));assert.equal(r.hasPermissionV4(writer.nodeIdentity.nodeId,'write'),false);
 await assert.rejects(r.verifyRecordV4(manifest,'robit-tracker-manifest-v4','writer'),/not authorized/);
 await r.acceptPolicyV4(await policy(owner,2,'revision-1',[grant]));assert.equal(r.roomPolicy.epoch,3);
});
test('policy chains wait for predecessors and reject forks, tampered grants and expired permissions',async()=>{
 const owner=await policyPeer('owner'),r=await policyPeer('reader');r.ownerAnchor=owner.nodeIdentity.nodeId;
 const genesis=await policy(owner),grant={subjectNodeId:r.nodeIdentity.nodeId,permissions:['write'],expiresAt:Date.now()-1,nonce:'expired'},two=await policy(owner,2,'revision-1',[grant]);
 assert.equal(await r.acceptPolicyV4(two),false);assert.equal(r.roomPolicy,null);await r.acceptPolicyV4(genesis);assert.equal(r.roomPolicy.epoch,2);assert.equal(r.hasPermissionV4(r.nodeIdentity.nodeId,'write'),false);
 const fork=await policy(owner,2,'revision-1',[]);assert.equal(await r.acceptPolicyV4(fork),false);
 const tampered=JSON.parse(JSON.stringify(two));tampered.grants[0].expiresAt=Date.now()+60000;assert.equal(await r.acceptPolicyV4(tampered),false);
});
