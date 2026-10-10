const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto:crypto}=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function source(name){
 const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
 assert.notEqual(start,-1);const next=html.slice(start+1).search(/^(?:async )?function /m);
 return html.slice(start,next<0?undefined:start+1+next);
}
function fixture(){
 const writes=[],messages=[],c=vm.createContext({crypto,Uint8Array,TextEncoder,performance,enc:new TextEncoder(),CHUNK_SIZE:512*1024,
  contents:new Map(),catalog:new Map(),sourceFiles:new Map(),sourceHandles:new Map(),sourceStamps:new Map(),sourceVerifyProgress:new Map(),
  localHave:new Set(),sourceClaims:new Set(),sourceNeedsAuth:new Set(),sourceMissing:new Set(),sourceVerifying:new Set(),selectedSeeds:new Set(),cachedComplete:new Set(),
  unlockedKeys:new Map(),unlockedMeta:new Map(),unlockRows:new Set(),selectedId:null,seedMode:'selected',window:{},
  sha256Bytes:async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value)),
  concatBytes:(a,b)=>{const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out},
  bytesToHex:bytes=>Buffer.from(bytes).toString('hex'),b64ToBytes:s=>new Uint8Array(Buffer.from(s,'base64')),
  aesEncryptKey:async(key,plain,iv,aad)=>new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad)},key,plain)),
  verificationYield:async()=>{},setTimeout:()=>1,scheduleDownloadRowRender:()=>{},renderDetails:()=>{},renderTree:()=>{},renderAll:()=>{},
  fmtBytes:n=>String(n),fmtRate:n=>String(n),esc:s=>s,visibleName:e=>e.name,toast:s=>messages.push(s),
  idbDel:async(store,cid)=>writes.push(['delete',store,cid]),idbGet:async()=>null,
  persistHandle:async(cid,h)=>{c.sourceHandles.set(cid,h);writes.push(['handle',cid,h])},
  saveState:async()=>writes.push(['save']),seedSaltFor:cid=>writes.push(['salt',cid]),
  broadcastAvailability:async()=>writes.push(['advertise',[...c.localHave].filter(cid=>c.seedEnabled(cid))])
 });
 for(const name of ['swarmInit','swarmStep','hashFileStreamingMain','hashLockedFileStreamingMain','sourceStamp','seedEnabled','sourceLinkActions','verifySourceCandidate','linkVerifiedSource','pickSourceFile','reauthorizeSource','relinkSource'])vm.runInContext(source(name),c);
 c.hashFileStreaming=c.hashFileStreamingMain;c.hashLockedFileStreaming=c.hashLockedFileStreamingMain;
 c.writes=writes;c.messages=messages;
 return c;
}
function file(data,name='copy.bin',lastModified=123){const blob=new Blob([data]);return Object.assign(blob,{name,lastModified})}
async function addContent(c,f){
 const h=await c.hashFileStreaming(f),cid='f-'+h.root,content={id:cid,root:h.root,size:f.size,originActor:'original-uploader'};
 c.contents.set(cid,content);c.catalog.set('original-entry',{id:'original-entry',contentId:cid,name:'original-name.bin',originActor:'original-uploader'});return cid;
}
test('any member can link remote, orphaned, locked and already-local listings',()=>{
 const c=fixture();assert.match(c.sourceLinkActions('remote'),/data-relink/);
 c.sourceClaims.add('orphan');c.sourceMissing.add('orphan');assert.match(c.sourceLinkActions('orphan'),/data-relink/);
 c.sourceNeedsAuth.add('permission');const actions=c.sourceLinkActions('permission');assert.match(actions,/data-reauth/);assert.match(actions,/data-relink/);
 c.localHave.add('local');assert.match(c.sourceLinkActions('local'),/data-relink/);
 c.sourceVerifying.add('remote');assert.match(c.sourceLinkActions('remote'),/disabled/);assert.doesNotMatch(c.sourceLinkActions('remote'),/data-relink/);
});
test('full multi-chunk hash accepts a renamed copy and advertises it without modifying the catalog',async()=>{
 const c=fixture(),bytes=Buffer.alloc(1100000);for(let i=0;i<bytes.length;i++)bytes[i]=(i*17)%251;
 const original=file(bytes,'original-name.bin'),cid=await addContent(c,original),catalog=JSON.stringify([...c.catalog]),content=JSON.stringify([...c.contents]);
 c.sourceNeedsAuth.add(cid);c.sourceMissing.add(cid);const copy=file(bytes,'different-name.bin',999);
 await c.linkVerifiedSource(cid,copy);
 assert.equal(c.sourceFiles.get(cid),copy);assert.equal(c.sourceClaims.has(cid),true);assert.equal(c.selectedSeeds.has(cid),true);assert.equal(c.seedEnabled(cid),true);
 assert.equal(c.sourceNeedsAuth.has(cid),false);assert.equal(c.sourceMissing.has(cid),false);
 assert.deepEqual(c.writes.at(-1),['advertise',[cid]]);assert.equal(JSON.stringify([...c.catalog]),catalog);assert.equal(JSON.stringify([...c.contents]),content);
});
test('same size and modification time never substitute for the content hash, and rejection preserves a good source',async()=>{
 const c=fixture(),good=file('correct bytes'),cid=await addContent(c,good);await c.linkVerifiedSource(cid,good);c.writes.length=0;
 const bad=file('corrupt bytes',good.name,good.lastModified);
 await assert.rejects(c.linkVerifiedSource(cid,bad),/does not match/);
 assert.equal(c.sourceFiles.get(cid),good);assert.equal(c.seedEnabled(cid),true);assert.deepEqual(c.writes,[]);
 await assert.rejects(c.linkVerifiedSource(cid,file('short')),/size mismatch/);assert.deepEqual(c.writes,[]);
});
test('locked copies require their password key and the original canonical encrypted hash',async()=>{
 const c=fixture(),good=file('password protected original'),bad=file('password protected modified');
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt']),lock={id:'lock-id',ivSalt:Buffer.alloc(16,7).toString('base64')};
 const h=await c.hashLockedFileStreaming(good,key,lock),cid='f-'+h.root;
 c.contents.set(cid,{id:cid,locked:true,lock,root:h.root,size:h.cipherSize});c.unlockedMeta.set(cid,{plainSize:good.size});
 await assert.rejects(c.linkVerifiedSource(cid,good),/unlock this file first/);assert.equal(c.localHave.has(cid),false);
 c.unlockedKeys.set(cid,key);await assert.rejects(c.linkVerifiedSource(cid,bad),/does not match/);assert.equal(c.localHave.has(cid),false);
 await c.linkVerifiedSource(cid,good);assert.equal(c.seedEnabled(cid),true);
});
test('linking respects the global seeding-off setting and replaces stale disk handles only after verification',async()=>{
 const c=fixture(),good=file('correct bytes'),cid=await addContent(c,good),old={name:'missing-on-disk'},handle={name:'matching-on-disk'};
 c.seedMode='off';c.sourceHandles.set(cid,old);
 await assert.rejects(c.linkVerifiedSource(cid,file('corrupt bytes')),/does not match/);assert.equal(c.sourceHandles.get(cid),old);
 await c.linkVerifiedSource(cid,good,handle);assert.equal(c.sourceHandles.get(cid),handle);assert.equal(c.localHave.has(cid),true);assert.equal(c.seedEnabled(cid),false);
 assert.deepEqual(c.writes.at(-1),['advertise',[]]);
 await c.linkVerifiedSource(cid,good);assert.equal(c.sourceHandles.has(cid),false);assert.ok(c.writes.some(x=>x[0]==='delete'&&x[1]==='handles'));
});
test('permission reauthorization verifies bytes even when an old metadata stamp matches',async()=>{
 const c=fixture(),good=file('correct bytes'),cid=await addContent(c,good),bad=file('corrupt bytes');
 c.sourceStamps.set(cid,c.sourceStamp(good));const handle={requestPermission:async()=>'granted',getFile:async()=>bad};c.sourceHandles.set(cid,handle);
 await c.reauthorizeSource(cid);assert.equal(c.localHave.has(cid),false);assert.ok(c.messages.some(x=>x.includes('does not match')));assert.deepEqual(c.writes,[]);
 handle.getFile=async()=>good;await c.reauthorizeSource(cid);assert.equal(c.seedEnabled(cid),true);assert.equal(c.sourceVerifying.has(cid),false);
});
test('cancelled input pickers remove their input and release the source action; duplicate clicks cannot race attachment',async()=>{
 const c=fixture(),good=file('correct bytes'),cid=await addContent(c,good);let input,removed=0,clicks=0;
 c.document={createElement:()=>input={style:{},remove:()=>removed++,click:()=>clicks++},body:{append:()=>{}}};
 const pending=c.relinkSource(cid);await c.relinkSource(cid);assert.equal(clicks,1);input.oncancel();await pending;
 assert.equal(removed,1);assert.equal(c.sourceVerifying.has(cid),false);assert.equal(c.localHave.has(cid),false);
 const linked=c.relinkSource(cid);input.files=[good];input.onchange();await linked;
 assert.equal(c.seedEnabled(cid),true);assert.equal(removed,2);
});
