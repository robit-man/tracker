// Actual encrypted IndexedDB migration, public relay delivery, provider reload,
// and cold recovery from two unrelated rooms. No application state hooks.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';

const require=createRequire((process.env.TRACKER_TEST_DEPS||'/tmp/tracker-test-deps')+'/package.json');
const name=process.env.BROWSER||'chromium',html=fs.readFileSync(process.env.TRACKER_HTML||'index.html','utf8');
const output=process.env.RESULT||'/tmp/tracker-global-legacy.json';
const site=(process.env.TRACKER_SITE||'https://robit-man.github.io/tracker/')+'qa-legacy-'+randomBytes(8).toString('hex')+'/';
const result={browser:name,appSha256:createHash('sha256').update(html).digest('hex'),checks:[],errors:[]};
const browser=await require('playwright')[name].launch({args:name==='chromium'?['--disable-gpu']:[],firefoxUserPrefs:{'layers.acceleration.disabled':true}});
const pages=[],state=p=>p.evaluate(()=>PrivateTrackerMesh.globalStorage());
const check=s=>{result.checks.push(s);console.log('PASS',s)};
async function peer(role,url=site){
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.route(site+'**',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:html}):r.continue());
  await context.addInitScript(()=>{localStorage.setItem('private-tracker-deep-privacy-v1','1');window.showSaveFilePicker=undefined;window.showOpenFilePicker=undefined});
  const p=await context.newPage();pages.push(p);p.setDefaultTimeout(90000);p.on('pageerror',e=>result.errors.push({role,error:e.message}));
  await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>PrivateTrackerMesh.globalStorage().catalog?.ready&&PrivateTrackerMesh.globalStorage().planes.includes('nats'));
  console.log('READY',role);
  return p;
}
async function view(p,v){if(await p.locator('#menu-button').isVisible())await p.locator('#menu-button').click();await p.locator(`#side-nav [data-view="${v}"]`).click()}
async function legacyMetadata(p){
  return p.evaluate(async()=>{
    const enc=new TextEncoder(),dec=new TextDecoder(),hash=document.querySelector('#roomHash').textContent,secret=decodeURIComponent(location.hash.slice(1));
    const base=await crypto.subtle.importKey('raw',enc.encode(secret),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:enc.encode('private-tracker-v2|'+hash),iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('robit-private-tracker-'+hash,4);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    const read=async name=>{const raw=await new Promise((resolve,reject)=>{const r=db.transaction('kv').objectStore('kv').get(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}),bytes=new Uint8Array(raw);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:enc.encode('local:'+name)},key,bytes.slice(12))))};
    const contents=await read('contents'),entries=await read('catalog');
    for(const c of contents){delete c.proof;c.originActor='legacy-file-author'}
    for(const e of entries){for(const k of ['proof','operationId','previousRevision','operationAt'])delete e[k];e.v={c:4,a:'legacy-file-author'};e.parent='legacy-folder'}
    entries.push({id:'legacy-folder',kind:'folder',name:'Legacy folder',parent:null,v:{c:3,a:'legacy-folder-author'},deleted:false});
    const rows=[];for(const [name,value] of [['contents',contents],['catalog',entries],['catalogOperations',[]]]){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('local:'+name)},key,enc.encode(JSON.stringify(value)))),bytes=new Uint8Array(12+cipher.length);bytes.set(iv);bytes.set(cipher,12);rows.push([name,bytes.buffer])}
    await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');for(const [name,bytes]of rows)tx.objectStore('kv').put(bytes,name);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();return contents[0].id;
  });
}
try{
  const provider=await peer('provider');await view(provider,'storage');await provider.locator('#storage-scope').selectOption('global');await provider.locator('#global-enabled').check();await provider.locator('#global-save').click();await provider.waitForFunction(()=>PrivateTrackerMesh.globalStorage().leader&&PrivateTrackerMesh.globalStorage().config.enabled);
  const retained=[];
  for(let i=0;i<2;i++){
    const source=await peer('legacy-source-'+i),room=source.url(),bytes=randomBytes(650000);await source.waitForFunction(()=>PrivateTrackerMesh.globalStorage().offers.length>0);
    await source.locator('#fileInput').setInputFiles({name:'legacy-'+i+'.bin',mimeType:'application/octet-stream',buffer:bytes});await source.locator('.row[data-cid] [data-seed][aria-pressed="true"]').waitFor();
    const cid=await legacyMetadata(source);await source.reload();await source.locator('.row[data-id="legacy-folder"] [data-toggle]').click();
    const chooser=source.waitForEvent('filechooser');await source.locator(`.row[data-cid="${cid}"] [data-relink]`).click();await (await chooser).setFiles({name:'legacy-'+i+'.bin',mimeType:'application/octet-stream',buffer:bytes});
    await source.waitForFunction(cid=>document.querySelector(`.row[data-cid="${cid}"] [data-seed][aria-pressed="true"]`)&&PrivateTrackerMesh.globalStorage().offers.length>0,cid);console.log('VERIFIED LEGACY SOURCE',i);
    const row=source.locator(`.row[data-cid="${cid}"]`);await row.locator('[data-keep]').click();await source.locator('#pinScope').selectOption('global');await source.locator('#pinProfile').selectOption('volunteer');await source.locator('#pinSubmit').click();
    if(process.env.EXPECT_LEGACY_REJECTION){await source.waitForFunction(()=>document.querySelector('#pinStatus').textContent.includes('Signed room metadata is required'));result.rejection=await source.locator('#pinStatus').textContent();check('released v106 reproduces the reported rejection for persisted legacy file and folder metadata');result.passed=true;break}
    await source.waitForFunction(cid=>PrivateTrackerMesh.globalStorage().records.some(r=>r.cid===cid),cid,{timeout:150000});await source.locator('#pinModal').waitFor({state:'hidden'});
    retained.push({room,cid,sha256:createHash('sha256').update(bytes).digest('hex')});await source.context().close();
  }
  if(!process.env.EXPECT_LEGACY_REJECTION){
    check('two unrelated rooms retain legacy files after signing their manifests and folder revisions locally');
    const before=await state(provider);assert.equal(before.objects.length,2);for(const o of before.objects){assert.ok(o.ready&&o.catalogHash);for(const {cid,room}of retained){assert.equal(JSON.stringify(o).includes(cid),false);assert.equal(JSON.stringify(o).includes(new URL(room).hash.slice(1)),false)}}
    check('provider descriptors contain neither room secrets nor plaintext file identities');
    // Reopen into a new unrelated room: deployment storage must not depend on a room cache.
    const nextSecret=randomBytes(24).toString('hex'),nextHash=createHash('sha256').update('private-tracker-room|'+nextSecret).digest('hex');await provider.goto(site+'#'+nextSecret);await provider.waitForFunction(hash=>document.querySelector('#roomHash').textContent===hash&&PrivateTrackerMesh.globalStorage().leader&&PrivateTrackerMesh.globalStorage().objects.length===2,nextHash);
    await view(provider,'storage');await provider.locator('#storage-scope').selectOption('global');
    assert.equal((await state(provider)).used,before.used);assert.equal((await state(provider)).config.enabled,true);assert.equal(await provider.locator('#globalInventory [data-global-object]').count(),2);assert.match(await provider.locator('#globalInventorySummary').textContent(),/^2 stored · 2 available/);assert.equal(await provider.locator('.row[data-cid]').count(),0);
    for(const o of before.objects)assert.equal((await state(provider)).objects.find(v=>v.id===o.id).catalogHash,o.catalogHash);
    await provider.reload();await provider.waitForFunction(()=>PrivateTrackerMesh.globalStorage().leader&&PrivateTrackerMesh.globalStorage().objects.length===2);await view(provider,'storage');await provider.locator('#storage-scope').selectOption('global');assert.equal(await provider.locator('#globalInventory [data-global-object]').count(),2);
    check('all blobs and ciphertext accounting survive room changes and page reload with contribution still enabled');
    await provider.locator('#global-enabled').uncheck();await provider.waitForFunction(()=>!PrivateTrackerMesh.globalStorage().config.enabled);await provider.reload();await provider.waitForFunction(()=>PrivateTrackerMesh.globalStorage().id);await view(provider,'storage');await provider.locator('#storage-scope').selectOption('global');assert.equal(await provider.locator('#globalInventory [data-global-object]').count(),2);assert.equal((await state(provider)).config.enabled,false);await provider.locator('#global-enabled').check();await provider.waitForFunction(()=>PrivateTrackerMesh.globalStorage().config.enabled);
    check('pausing contribution and reloading preserves the complete encrypted inventory');
    await provider.setViewportSize({width:390,height:844});assert.equal(await provider.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await provider.screenshot({path:output+'.mobile.png',animations:'disabled',fullPage:true});check('encrypted inventory fits a mobile viewport');
    for(const item of retained){const receiver=await peer('cold-receiver',item.room);await receiver.waitForFunction(cid=>PrivateTrackerMesh.globalStorage().catalog.recovered>0&&PrivateTrackerMesh.globalStorage().records.some(r=>r.cid===cid),item.cid);await receiver.locator('.row[data-id="legacy-folder"] [data-toggle]').click();await receiver.locator(`.row[data-cid="${item.cid}"]`).waitFor();assert.ok(await receiver.locator('.row.folder').count());const download=receiver.waitForEvent('download');await receiver.locator(`.row[data-cid="${item.cid}"] [data-download]`).click();const saved=await download;assert.equal(createHash('sha256').update(fs.readFileSync(await saved.path())).digest('hex'),item.sha256);await receiver.context().close()}
    check('fresh visitors recover both rooms’ folder listings and byte-identical files with every uploader offline');result.retained=retained;assert.deepEqual(result.errors,[]);result.passed=true;
  }
}catch(e){result.failure=e.stack;result.states=await Promise.all(pages.filter(p=>!p.isClosed()).map(p=>state(p).catch(()=>null)));throw e}
finally{fs.writeFileSync(output,JSON.stringify(result,null,2));await browser.close()}
