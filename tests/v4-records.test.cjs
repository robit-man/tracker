const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fixture,source}=require('./v4-helper.cjs');
async function records(actor){
 const c=await fixture(actor);Object.assign(c,{catalog:new Map(),contents:new Map(),catalogOperations:new Map(),pendingCatalogOperations:new Map(),revisionSlots:new Map(),HASH_ALG:'sha256-chain-v1',saveState:async()=>{},renderAll:()=>{},clock:0});
 for(const name of ['recordBodyV4','signRecordV4','verifyRecordV4','catalogShapeV4','signCatalogOperationV4','catalogParentSafeV4','validContentShape','absorbV','cmpV','mergeState'])vm.runInContext(source(name),c);return c;
}
const content={id:'f-'+ '1'.repeat(64),root:'1'.repeat(64),sha:'1'.repeat(64),hashAlg:'sha256-chain-v1',size:5,chunkSize:524288,totalChunks:1,type:'text/plain',originActor:'author',originAt:1};
function entry(c=1){return{id:'r-example',kind:'file',name:'file.txt',parent:null,contentId:content.id,v:{c,a:'author'},deleted:false}}
test('original manifests and operations verify independently of a forwarding snapshot',async()=>{
 const a=await records('author'),r=await records('receiver');const manifest=await a.signRecordV4(content,'robit-tracker-manifest-v4'),one=await a.signCatalogOperationV4(entry());
 await r.mergeState([one],[manifest],{actor:'forwarder'});assert.equal(r.catalog.get(one.id).proof.nodeId,a.nodeIdentity.nodeId);assert.equal(r.contents.get(content.id).proof.nodeId,a.nodeIdentity.nodeId);
 for(const change of [x=>x.name='fake',x=>x.parent='evil',x=>x.deleted=true,x=>x.v.c=999]){
  const forged=JSON.parse(JSON.stringify(one));change(forged);await r.mergeState([forged],[]);assert.equal(r.catalog.get(one.id).operationId,one.operationId);
 }
 const bad=JSON.parse(JSON.stringify(manifest));bad.root='2'.repeat(64);await r.mergeState([],[bad]);assert.equal(r.contents.get(content.id).root,content.root);
});
test('out-of-order signed revisions wait for predecessors; deletes and forks cannot replay over the head',async()=>{
 const a=await records('author'),r=await records('receiver'),one=await a.signCatalogOperationV4(entry()),two=await a.signCatalogOperationV4({...entry(2),deleted:true},one);
 await r.mergeState([two],[]);assert.equal(r.catalog.size,0);await r.mergeState([one],[]);assert.equal(r.catalog.get(one.id).deleted,true);
 await r.mergeState([one],[]);assert.equal(r.catalog.get(one.id).operationId,two.operationId);
 const fork=await a.signCatalogOperationV4({...entry(2),name:'fork'},one);await r.mergeState([fork],[]);assert.equal(r.catalog.get(one.id).operationId,two.operationId);
});
test('unsigned snapshots cannot override signed entries or mint publisher provenance',async()=>{
 const a=await records('author'),r=await records('receiver'),one=await a.signCatalogOperationV4(entry());await r.mergeState([one],[]);
 await r.mergeState([{...entry(999),name:'legacy spoof'}],[]);assert.equal(r.catalog.get(one.id).name,'file.txt');
 const legacy={...content,originActor:'legacy'};await r.mergeState([],[legacy]);assert.equal(r.contents.get(legacy.id).proof,undefined);
});
test('cyclic folder graphs and invalid content dimensions never enter the catalog',async()=>{
 const a=await records('author'),r=await records('receiver');const folder=(id,parent)=>({id,parent,kind:'folder',name:id,v:{a:'author',c:1}});
 await r.mergeState([await a.signCatalogOperationV4(folder('a','b')),await a.signCatalogOperationV4(folder('b','a'))],[]);assert.equal(r.catalog.size,1);
 for(const bad of [{...content,totalChunks:2},{...content,chunkSize:Infinity},{...content,size:-1}])assert.equal(r.validContentShape(bad),false);
});
