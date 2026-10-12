const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {webcrypto:crypto}=require('node:crypto');
const {source}=require('./v4-helper.cjs');
const cid='f-'+'a'.repeat(64);
function fixture(){
 const messages=[],writes=[];
 const c=vm.createContext({crypto,Date,Uint8Array,TextEncoder,enc:new TextEncoder(),db:{},actor:'self',seedMode:'selected',localLive:null,activeLiveViewer:null,activePreview:null,retentionWorking:false,retentionRepairWorking:false,
  storageConfig:{enabled:false,allocationGB:5,mode:'Balanced',profile:'volunteer',retentionDays:30},storageQuota:{quota:0,usage:0,persisted:false},contents:new Map([[cid,{id:cid,size:1e6}]]),catalog:new Map(),catalogOperations:new Map(),retainedFiles:new Map(),retentionRequests:new Map(),peerStorageOffers:new Map(),sessions:new Map(),sessionBySid:new Map(),selectedSeeds:new Set(),cachedComplete:new Set(),localHave:new Set(),sourceClaims:new Set(),
  navigator:{storage:{}},renderInterface:()=>{},renderAll:()=>{},renderTree:()=>{},renderStorageHealth:()=>{},recordResourceEvent:()=>{},syncStorageControls:()=>{},refreshStorageQuota:async()=>{},broadcastAvailability:async()=>{},publishStorageOffer:async()=>{},saveState:async()=>{},processRetentionQueue:async()=>{},sendActorIngress:async(a,m)=>messages.push([a,m]),msg:(type,data)=>({type,...data}),putKV:async(k,v)=>writes.push([k,v]),profileFor:a=>({alias:a}),resourceEntry:id=>({id,contentId:id})});
 for(const n of ['retentionTarget','validStorageConfig','retainedBytes','retainedStoredBytes','storageEffectiveBytes','storageProviderAvailable','liveStorageOffers','persistStoragePreferences','handleStorageOffer','sendRetentionStatus','queueRetainedFile','handleStoragePin','retentionPinMessage','handleStorageStatus','saveStorageControls','maintainRetentionRequests'])vm.runInContext(source(n),c);
 c.messages=messages;c.writes=writes;return c;
}
test('free contribution defaults off and stored settings have bounded valid values',()=>{
 const c=fixture();assert.equal(c.storageProviderAvailable(),false);const cfg=c.validStorageConfig({enabled:true,allocationGB:9999,mode:'unknown',profile:'paid',retentionDays:2});
 assert.equal(cfg.enabled,true);assert.equal(cfg.allocationGB,100);assert.equal(cfg.mode,'Balanced');assert.equal(cfg.profile,'volunteer');assert.equal(cfg.retentionDays,30);
 c.storageConfig.enabled=true;c.seedMode='off';assert.equal(c.storageProviderAvailable(),false);
});
test('retention refuses unconsented writes and reserves against real quota before acquisition',async()=>{
 const c=fixture();await assert.rejects(c.queueRetainedFile(cid),/Enable storage/);assert.equal(c.retainedFiles.size,0);
 c.storageConfig.enabled=true;c.storageQuota={quota:2e6,usage:1.5e6};await assert.rejects(c.queueRetainedFile(cid),/exceeds/);assert.equal(c.retainedFiles.size,0);
 c.storageQuota={quota:2e6,usage:0};await c.queueRetainedFile(cid);assert.equal(c.retainedBytes(),1e6);const second='f-'+'b'.repeat(64);c.contents.set(second,{id:second,size:1.1e6});await assert.rejects(c.queueRetainedFile(second),/exceeds/);
});
test('repeated signed pins preserve active work and only ready verified copies become seeds',async()=>{
 const c=fixture();c.storageConfig.enabled=true;await c.handleStoragePin({auth:true,actor:'requester',id:cid,days:7});assert.equal(c.retainedFiles.get(cid).state,'queued');assert.equal(c.selectedSeeds.has(cid),false);
 c.retainedFiles.get(cid).state='fetching';await c.handleStoragePin({auth:true,actor:'requester',id:cid,days:7});assert.equal(c.retainedFiles.get(cid).state,'fetching');assert.equal(c.retainedFiles.get(cid).requesters.length,1);
 c.cachedComplete.add(cid);await c.handleStoragePin({auth:true,actor:'requester',id:cid,days:30});assert.equal(c.retainedFiles.get(cid).state,'ready');assert.equal(c.selectedSeeds.has(cid),true);assert.equal(c.messages.at(-1)[1].status,'ready');
});
test('provider offers and status updates require authentication and bounded credible fields',()=>{
 const c=fixture(),valid={auth:true,actor:'provider',enabled:true,free:true,capacityBytes:5e9,freeBytes:5e9,retained:[cid,'malformed'],expires:Date.now()+60000};
 c.handleStorageOffer({...valid,auth:false});c.handleStorageOffer({...valid,freeBytes:6e9});c.handleStorageOffer({...valid,expires:Date.now()+1e6});assert.equal(c.peerStorageOffers.size,0);
 c.handleStorageOffer(valid);assert.equal(c.peerStorageOffers.get('provider').retained.length,1);
 c.retentionRequests.set(cid,{providers:['provider'],statuses:{}});c.handleStorageStatus({auth:true,actor:'other',id:cid,status:'ready'});assert.equal(Object.keys(c.retentionRequests.get(cid).statuses).length,0);
 c.handleStorageStatus({auth:true,actor:'provider',id:cid,status:'ready'});assert.equal(c.retentionRequests.get(cid).statuses.provider.status,'ready');
});
test('retention controls fit the authenticated control envelope without using peer profile fields',async()=>{
 const c=await require('./v4-helper.cjs').fixture();
 for(const m of [{type:'storage-pin',id:cid,days:30,storageProfile:'standard'},{type:'storage-offer',enabled:true,capacityBytes:5e9,freeBytes:5e9,retained:[cid],expires:Date.now()+60000,free:true},{type:'storage-status',id:cid,status:'ready'}])assert.doesNotThrow(()=>c.controlShapeV4({v:2,actor:'peer',...m}));
});
test('turning contribution off queues paused retention for a later enable and respects manual seeds',async()=>{
 const c=fixture();c.storageConfig.enabled=true;c.retainedFiles.set(cid,{cid,state:'fetching'});c.sessions.set(cid,{state:'downloading',retention:true});const selected='f-'+'c'.repeat(64),automatic='f-'+'d'.repeat(64);c.selectedSeeds.add(selected);c.selectedSeeds.add(automatic);c.retainedFiles.set(selected,{cid:selected,state:'ready',seedWasSelected:true});c.retainedFiles.set(automatic,{cid:automatic,state:'ready',seedWasSelected:false});
 c.$=selector=>({'#storage-enabled':{checked:false},'#storage-capacity':{value:'5'},'input[name="storage-mode"]:checked':{value:'Balanced'},'#storageSaveStatus':{}}[selector]);c.document={querySelector:()=>({value:'Balanced'})};c.pauseTransfer=s=>{s.state='paused'};
 await c.saveStorageControls();assert.equal(c.retainedFiles.get(cid).state,'queued');assert.equal(c.sessions.get(cid).state,'paused');assert.equal(c.selectedSeeds.has(selected),true);assert.equal(c.selectedSeeds.has(automatic),false);
});
test('active free placement recruits a replacement without extending expired requests',async()=>{
 const c=fixture();c.storageConfig.enabled=true;c.retentionRequests.set(cid,{cid,days:7,target:1,providers:['departed'],statuses:{departed:{status:'ready'}},createdAt:Date.now(),expiresAt:Date.now()+1e5});c.peerStorageOffers.set('replacement',{actor:'replacement',enabled:true,freeBytes:2e6,retained:[],expires:Date.now()+60000});
 await c.maintainRetentionRequests();assert.equal(c.messages.length,1);assert.equal(c.messages[0][0],'replacement');assert.equal(c.messages[0][1].type,'storage-pin');await c.maintainRetentionRequests();assert.equal(c.messages.length,1);
 c.retentionRequests.get(cid).expiresAt=Date.now()-1;c.peerStorageOffers.clear();c.peerStorageOffers.set('another',{actor:'another',enabled:true,freeBytes:2e6,retained:[],expires:Date.now()+60000});await c.maintainRetentionRequests();assert.equal(c.messages.length,1);
});
test('background retention never resumes as an ordinary download on reload',async()=>{
 const c=fixture();vm.runInContext(source('resumePersistedDownloadJob'),c);
 assert.equal(await c.resumePersistedDownloadJob({cid,retention:true}),null);assert.equal(c.sessions.size,0);
});
test('early placement carries a manifest through normal record verification before reserving storage',async()=>{
 const c=fixture();const manifest=c.contents.get(cid);c.contents.clear();c.storageConfig.enabled=true;let verified=false;
 c.mergeState=async(entries,rows)=>{verified=true;for(const r of rows)c.contents.set(r.id,r)};
 await c.handleStoragePin({auth:true,actor:'requester',id:cid,days:7,contents:[manifest,{id:'unrelated'}]});assert.equal(verified,true);assert.equal(c.contents.has('unrelated'),false);assert.equal(c.retainedFiles.get(cid).state,'queued');assert.equal(c.messages.at(-1)[1].status,'queued');
});
