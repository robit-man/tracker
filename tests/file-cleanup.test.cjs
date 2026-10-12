const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {source}=require('./v4-helper.cjs');
const cid='f-'+'a'.repeat(64),TTL=7*86400000;
function fixture(){
 let now=2e12,clock=0;
 const writes=[],sent=[],entry={id:'entry',kind:'file',name:'test.bin',contentId:cid,v:{c:1,a:'publisher'},deleted:false};
 const c=vm.createContext({Date:{now:()=>now},FILE_ORPHAN_TTL_MS:TTL,FILE_EXPIRY_WARNING_MS:86400000,FILE_EXPIRY_PROBE_MS:15000,fileLastSourceAt:new Map(),fileExpiryProbes:new Map(),fileCleanupWorking:false,fileCleanupLoaded:true,db:{},nodeIdentity:{nodeId:'n-self'},ownerAnchor:'',networkReady:true,meshStopped:false,navigator:{onLine:true},
 decentralized:{pins:new Map()},catalog:new Map([[entry.id,entry]]),contents:new Map([[cid,{id:cid}]]),catalogOperations:new Map(),revisionSlots:new Map(),retainedFiles:new Map(),retentionRequests:new Map(),cachedComplete:new Set(),localHave:new Set(),sourceVerifying:new Set(),invalidRecordProofs:new Set(),seeds:0,offers:[],
 seedCount:()=>c.seeds,peerStorageOffers:{values:()=>c.offers},liveStorageOffers:()=>c.offers,hasPermissionV4:()=>true,nextV:()=>({c:++clock+1,a:'self'}),signCatalogOperationV4:async e=>({...e,operationId:'op-'+clock}),saveCatalogStateV4:async()=>writes.push('catalog'),broadcast:async m=>sent.push(m),msg:(type,data={})=>({type,...data}),putKV:async(k,v)=>writes.push([k,v]),getKV:async(k,f)=>f,renderAll:()=>{},renderTree:()=>{},esc:String});
 for(const n of ['fileCleanupData','fileRetainedUntil','fileCleanupProtected','fileExpiryState','loadFileCleanup','writeFileCleanup','maintainFileCleanup'])vm.runInContext(source(n),c);
 c.advance=ms=>now+=ms;c.now=()=>now;c.writes=writes;c.sent=sent;c.entry=()=>c.catalog.get('entry');return c;
}
test('an unavailable entry keeps one replicated seven-day deadline',async()=>{
 const c=fixture();await c.maintainFileCleanup();const d=c.entry().cleanup;assert.equal(d.orphanedAt,c.now());assert.equal(d.expiresAt-d.orphanedAt,TTL);assert.equal(c.sent[0].type,'catalog');
 c.advance(5*86400000);await c.maintainFileCleanup();assert.equal(c.entry().cleanup.expiresAt,d.expiresAt);assert.equal(c.fileExpiryState(c.entry()).urgent,false);
 c.advance(86400000+1);assert.equal(c.fileExpiryState(c.entry()).urgent,true);
 assert.equal(c.entry().deleted,false);assert.equal(c.entry().cleanup.expiresAt,d.expiresAt);
});
test('expiry probes sources, waits for responses, and broadcasts a tombstone only after a full week',async()=>{
 const c=fixture();await c.maintainFileCleanup();c.advance(TTL-1);await c.maintainFileCleanup();assert.equal(c.entry().deleted,false);
 c.advance(1);await c.maintainFileCleanup();assert.equal(c.entry().deleted,false);assert.ok(c.sent.some(m=>m.type==='seed-query'));assert.ok(c.sent.some(m=>m.type==='storage-query'));
 c.advance(14999);await c.maintainFileCleanup();assert.equal(c.entry().deleted,false);c.advance(1);await c.maintainFileCleanup();assert.equal(c.entry().deleted,true);assert.equal(c.sent.at(-1).entries[0].cleanup.expired,true);
});
test('a returning source or verified local cache cancels pending deletion, including a stale expiry revision',async()=>{
 for(const mode of ['seed','cache']){const c=fixture();await c.maintainFileCleanup();c.advance(TTL);await c.maintainFileCleanup();c.advance(15000);if(mode==='seed')c.seeds=1;else{c.cachedComplete.add(cid);c.localHave.add(cid)}await c.maintainFileCleanup();assert.equal(c.entry().deleted,false);assert.equal(c.entry().cleanup.orphanedAt,0);assert.equal(c.fileExpiryState(c.entry()),null)}
 const c=fixture();await c.maintainFileCleanup();c.advance(TTL);await c.maintainFileCleanup();c.advance(15000);await c.maintainFileCleanup();assert.equal(c.entry().deleted,true);c.seeds=1;await c.maintainFileCleanup();assert.equal(c.entry().deleted,false);
});
test('a confirmed retained lease protects an entry after its provider disconnects',async()=>{
 const c=fixture(),until=c.now()+30*86400000;c.offers=[{actor:'provider',retained:[cid],retainedUntil:{[cid]:until},expires:c.now()+60000}];await c.maintainFileCleanup();assert.equal(c.entry().cleanup.retainedUntil,until);
 c.offers=[];c.advance(8*86400000);await c.maintainFileCleanup();assert.equal(c.entry().cleanup.orphanedAt,0);assert.equal(c.entry().deleted,false);
 c.advance(22*86400000+1);await c.maintainFileCleanup();assert.equal(c.entry().cleanup.orphanedAt,until);assert.equal(c.entry().cleanup.expiresAt,until+TTL);
});
test('offline, discovery-unready, read-only and in-progress verification states cannot erase an entry',async()=>{
 for(const mode of ['offline','unready','stopped','readonly','verifying']){const c=fixture();await c.maintainFileCleanup();c.advance(TTL);await c.maintainFileCleanup();c.advance(15000);if(mode==='offline')c.navigator.onLine=false;if(mode==='unready')c.networkReady=false;if(mode==='stopped')c.meshStopped=true;if(mode==='readonly'){c.ownerAnchor='n-other';c.hasPermissionV4=()=>false}if(mode==='verifying')c.sourceVerifying.add(cid);await c.maintainFileCleanup();assert.equal(c.entry().deleted,false,mode)}
});
test('malformed or shortened deadlines are ignored and a source arriving while signing vetoes deletion',async()=>{
 const c=fixture();c.entry().cleanup={orphanedAt:c.now()-TTL,expiresAt:c.now()-TTL+1,retainedUntil:0};assert.equal(c.fileCleanupData(c.entry()),null);await c.maintainFileCleanup();assert.equal(c.entry().cleanup.expiresAt,c.now()+TTL);
 const entry=c.entry();c.signCatalogOperationV4=async e=>{c.seeds=1;return{...e,operationId:'race'}};assert.equal(await c.writeFileCleanup(entry,{...entry.cleanup,expired:true},true),false);assert.equal(c.entry().deleted,false);
});

test('confirmed global retention protects a room listing through its private locator deadline',()=>{const c=fixture();c.globalMesh={records:new Map([[cid,{placements:[{until:c.now()+86400000}]}]])};assert.equal(c.fileCleanupProtected(cid),true);assert.equal(c.fileRetainedUntil(cid),c.now()+86400000);c.advance(86400001);assert.equal(c.fileCleanupProtected(cid),false)});
