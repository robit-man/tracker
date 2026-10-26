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
  commandPublicationTail:Promise.resolve(),commandPublicationOwner:null,commandPublicationPending:0,commandPendingCids:new Set(),localHave:new Set(),sourceClaims:new Set(),sourceNeedsAuth:new Set(),sourceMissing:new Set(),sourceVerifying:new Set(),selectedSeeds:new Set(),cachedComplete:new Set(),
  unlockedKeys:new Map(),unlockedMeta:new Map(),unlockRows:new Set(),selectedId:null,seedMode:'selected',window:{},
  sha256Bytes:async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value)),
  concatBytes:(a,b)=>{const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out},
  bytesToHex:bytes=>Buffer.from(bytes).toString('hex'),b64ToBytes:s=>new Uint8Array(Buffer.from(s,'base64')),
  aesEncryptKey:async(key,plain,iv,aad)=>new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad)},key,plain)),
  verificationYield:async()=>{},setTimeout:()=>1,scheduleDownloadRowRender:()=>{},renderDetails:()=>{},renderTree:()=>{},renderAll:()=>{},
  fmtBytes:n=>String(n),fmtRate:n=>String(n),esc:s=>s,visibleName:e=>e.name,toast:s=>messages.push(s),
  idbPut:async(store,cid,handle)=>{c.sourceHandles.set(cid,handle);writes.push(['handle',cid,handle])},idbDel:async(store,cid)=>writes.push(['delete',store,cid]),idbGet:async()=>null,
  persistHandle:async(cid,h)=>{c.sourceHandles.set(cid,h);writes.push(['handle',cid,h])},
  saveState:async()=>writes.push(['save']),seedSaltFor:cid=>writes.push(['salt',cid]),
  broadcastAvailability:async()=>writes.push(['advertise',[...c.localHave].filter(cid=>c.seedEnabled(cid))])
 });
 for(const name of ['commandWithPublication','swarmInit','swarmStep','hashFileStreamingMain','hashLockedFileStreamingMain','sourceStamp','seedEnabled','sourceLinkActions','sourceVerificationMarkup','verifySourceCandidate','linkVerifiedSource','pickSourceFile','reauthorizeSource','relinkSource'])vm.runInContext(source(name),c);
 c.hashFileStreaming=c.hashFileStreamingMain;c.hashLockedFileStreaming=c.hashLockedFileStreamingMain;
 // The picker is now a semantic adapter; retain real hashing/persistence in this unit fixture.
 c.submitSourceLink=(cid,file,handle)=>c.linkVerifiedSource(cid,file,handle);
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
 c.sourceClaims.add('orphan');c.sourceMissing.add('orphan');assert.match(c.sourceLinkActions('orphan'),/data-relink/);assert.match(c.sourceLinkActions('orphan'),/resumeAvailable/);
 c.sourceNeedsAuth.add('permission');const actions=c.sourceLinkActions('permission');assert.match(actions,/data-reauth/);assert.match(actions,/data-relink/);
 c.localHave.add('local');c.sourceClaims.add('local');assert.match(c.sourceLinkActions('local'),/data-relink/);assert.doesNotMatch(c.sourceLinkActions('local'),/resumeAvailable/);
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
test('relink opens each source in its own previous directory with a stable bounded picker ID',async()=>{
 const c=fixture(),a='f-'+'a'.repeat(64),b='f-'+'b'.repeat(64),previousA={kind:'file',name:'a.avi'},previousB={kind:'file',name:'b.mp4'},picked=file('chosen source');
 const chosen={getFile:async()=>picked},calls=[];c.sourceHandles.set(a,previousA);c.sourceHandles.set(b,previousB);
 c.window.showOpenFilePicker=async options=>{calls.push({...options});return[chosen]};
 assert.equal((await c.pickSourceFile(a)).file,picked);await c.pickSourceFile(b);await c.pickSourceFile(a);
 assert.equal(calls[0].startIn,previousA);assert.equal(calls[1].startIn,previousB);assert.equal(calls[2].startIn,previousA);
 assert.equal(calls[0].id,calls[2].id);assert.notEqual(calls[0].id,calls[1].id);assert.match(calls[0].id,/^[A-Za-z0-9_-]{1,32}$/);assert.equal(calls[0].multiple,false);
});
test('relink restores the directory hint from the persisted handle after reload',async()=>{
 const c=fixture(),previous={kind:'file',name:'saved.avi'},calls=[];
 c.idbGet=async(store,cid)=>{assert.equal(store,'handles');assert.equal(cid,'saved-source');return previous};
 c.window.showOpenFilePicker=async options=>{calls.push(options);return[]};
 assert.equal(await c.pickSourceFile('saved-source'),null);assert.equal(calls[0].startIn,previous);
});
test('an unavailable source directory retries the picker using only that source ID',async()=>{
 for(const name of ['TypeError','NotFoundError']){
  const c=fixture(),previous={kind:'file'},calls=[];c.sourceHandles.set('moved',previous);
  c.window.showOpenFilePicker=async options=>{calls.push({...options});if(calls.length===1)throw Object.assign(Error('source directory unavailable'),{name});return[]};
  assert.equal(await c.pickSourceFile('moved'),null);assert.equal(calls.length,2);assert.equal(calls[0].startIn,previous);assert.equal(calls[1].startIn,undefined);assert.equal(calls[0].id,calls[1].id);
 }
});
test('cancelling a remembered-directory picker does not open a second dialog',async()=>{
 const c=fixture();let calls=0;c.sourceHandles.set('cancelled',{kind:'file'});
 c.window.showOpenFilePicker=async()=>{calls++;throw Object.assign(Error('cancelled'),{name:'AbortError'})};
 await assert.rejects(c.pickSourceFile('cancelled'),{name:'AbortError'});assert.equal(calls,1);
});
function recoveryFixture(){
 const c=fixture();Object.assign(c,{automaticSourceFailures:new Map(),automaticSourceRecovery:false,downloadJobs:new Map(),roomLocalReady:Promise.resolve(),db:{},document:{hidden:false},cacheHasCompleteContent:async()=>false});
 for(const name of ['stampMatches','recoverPersistedSource','retryPersistedSources'])vm.runInContext(source(name),c);return c;
}
test('saved handles recover automatically without prompting; changed metadata requires the complete hash',async()=>{
 const c=recoveryFixture(),good=file('correct bytes'),cid=await addContent(c,good),copy=file('correct bytes','renamed.bin',999);let prompts=0;
 const handle={queryPermission:async()=>'granted',requestPermission:async()=>{prompts++;return 'granted'},getFile:async()=>copy};
 c.idbGet=async store=>store==='handles'?handle:null;c.sourceClaims.add(cid);c.sourceStamps.set(cid,c.sourceStamp(good));c.sourceMissing.add(cid);c.selectedSeeds.add(cid);
 const original=JSON.stringify([...c.catalog]);await c.retryPersistedSources();
 assert.equal(c.sourceFiles.get(cid),copy);assert.equal(c.seedEnabled(cid),true);assert.equal(c.sourceMissing.has(cid),false);assert.equal(c.sourceNeedsAuth.has(cid),false);assert.equal(prompts,0);assert.equal(JSON.stringify([...c.catalog]),original);assert.ok(c.writes.some(x=>x[0]==='advertise'));
});
test('automatic recovery leaves permission fallback available and rejects a changed incorrect source',async()=>{
 const c=recoveryFixture(),good=file('correct bytes'),cid=await addContent(c,good);let permission='prompt',prompts=0;
 const handle={queryPermission:async()=>permission,requestPermission:async()=>{prompts++;return 'granted'},getFile:async()=>file('corrupt bytes','copy.bin',999)};
 c.idbGet=async store=>store==='handles'?handle:null;c.sourceClaims.add(cid);c.sourceStamps.set(cid,c.sourceStamp(good));
 await c.retryPersistedSources();assert.equal(c.localHave.has(cid),false);assert.equal(c.sourceNeedsAuth.has(cid),true);assert.match(c.sourceLinkActions(cid),/resumeAvailable/);
 permission='granted';await c.retryPersistedSources();assert.equal(c.localHave.has(cid),false);assert.equal(c.sourceMissing.has(cid),true);assert.equal(c.sourceVerifying.has(cid),false);assert.equal(prompts,0);
 handle.getFile=async()=>file('correct bytes','copy.bin',1000);c.seedMode='off';await c.retryPersistedSources();assert.equal(c.localHave.has(cid),true);assert.equal(c.seedEnabled(cid),false);assert.doesNotMatch(c.sourceLinkActions(cid),/resumeAvailable/);
});
test('automatic cache recovery preserves seed selection and never claims an unfinished download',async()=>{
 const c=recoveryFixture(),good=file('correct bytes'),cid=await addContent(c,good);c.cacheHasCompleteContent=async()=>true;c.sourceClaims.add(cid);c.sourceMissing.add(cid);
 c.downloadJobs.set(cid,{state:'queued'});await c.retryPersistedSources();assert.equal(c.localHave.has(cid),false);
 c.downloadJobs.delete(cid);await c.retryPersistedSources();assert.equal(c.localHave.has(cid),true);assert.equal(c.cachedComplete.has(cid),true);assert.equal(c.selectedSeeds.has(cid),false);assert.equal(c.seedEnabled(cid),false);
});

test('relink exposes per-file verification progress until the verified source is attached',async()=>{
 const c=fixture(),good=file(Buffer.alloc(1024*1024,7)),cid=await addContent(c,good);let progress,release,started,saved,saving;const timers=[];
 const hashing=new Promise(resolve=>{started=resolve}),persisting=new Promise(resolve=>{saving=resolve});
 c.setTimeout=fn=>timers.push(fn);c.saveState=()=>new Promise(resolve=>{saved=resolve;saving()});
 c.pickSourceFile=async()=>({file:good,handle:null});
 c.hashFileStreaming=(_file,onProgress)=>new Promise(resolve=>{progress=onProgress;release=resolve;started()});
 const linking=c.relinkSource(cid);await hashing;
 progress(.25,good.size/4,2000);
 assert.equal(c.sourceVerifyProgress.get(cid).fraction,.25);assert.equal(c.sourceVerifyProgress.get(cid).total,good.size);
 const markup=c.sourceVerificationMarkup(cid);assert.match(markup,/Verifying source · 25%/);assert.match(markup,/aria-valuenow="25"/);assert.match(markup,/262144 \/ 1048576 · 131072/);
 assert.equal(c.sourceVerificationMarkup('another-file'),'');assert.equal(c.localHave.has(cid),false);
 progress(1,good.size,4000);assert.doesNotMatch(c.sourceVerificationMarkup(cid),/Verification complete/);
 release({root:c.contents.get(cid).root});await persisting;
 assert.match(c.sourceVerificationMarkup(cid),/Verification complete/);timers[0]();assert.match(c.sourceVerificationMarkup(cid),/Verification complete/);
 saved();await linking;
 assert.equal(c.seedEnabled(cid),true);assert.equal(c.sourceVerifying.has(cid),false);assert.equal(c.sourceVerificationMarkup(cid),'');
});
test('a pending peer announcement cannot keep a verified relink spinning',async()=>{
 const c=fixture(),good=file('correct bytes'),cid=await addContent(c,good);let announcements=0;
 c.pickSourceFile=async()=>({file:good,handle:null});c.broadcastAvailability=()=>{announcements++;return new Promise(()=>{})};
 const completed=await Promise.race([c.relinkSource(cid).then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),200))]);
 assert.equal(completed,true);assert.equal(announcements,1);assert.equal(c.seedEnabled(cid),true);assert.equal(c.sourceVerifying.has(cid),false);
 assert.ok(c.messages.some(s=>s.includes('Source linked.')));
});
test('completion cleanup from an earlier attempt cannot erase a new verification progress record',async()=>{
 const c=fixture(),good=file('correct bytes'),cid=await addContent(c,good),timers=[];c.setTimeout=fn=>timers.push(fn);
 await c.verifySourceCandidate(cid,good);assert.equal(timers.length,1);
 const fresh={fraction:.1,done:1,total:good.size,started:performance.now()+1};c.sourceVerifyProgress.set(cid,fresh);
 timers[0]();assert.equal(c.sourceVerifyProgress.get(cid),fresh);
});

// WO-01: committed availability must not race a pending metadata transaction.
test('an upload awaiting catalog commit cannot advertise its source',()=>{const c=fixture();c.localHave.add('pending');c.selectedSeeds.add('pending');c.commandPendingCids.add('pending');assert.equal(c.seedEnabled('pending'),false);c.commandPendingCids.delete('pending');assert.equal(c.seedEnabled('pending'),true)});
