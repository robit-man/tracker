// Real hash worker, persisted room catalog and encrypted public relay transfer.
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||process.cwd(),'package.json'));
const browserName=process.env.BROWSER||'chromium',browserType=require('playwright')[browserName];
const site='https://robit-man.github.io/tracker/',html=process.env.TRACKER_HTML&&fs.readFileSync(process.env.TRACKER_HTML,'utf8'),out=process.env.RESULT||'/tmp/tracker-source-link.json';
const result={htmlOverride:!!html,browser:browserName,relayOnly:true,checks:[],errors:[]};
const browser=await browserType.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:browserName==='chromium'?['--no-sandbox','--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']:[]});
async function peer(role){
 const context=await browser.newContext({acceptDownloads:true});if(html)await context.route(site,r=>r.fulfill({contentType:'text/html',body:html}));
 await context.addInitScript(()=>{
  // Use the cross-browser input picker; direct ICE cannot mask relay failures.
  localStorage.setItem('private-tracker-deep-privacy-v1','1');
  window.showOpenFilePicker=undefined;window.showSaveFilePicker=undefined;
  const Native=window.RTCPeerConnection;window.RTCPeerConnection=new Proxy(Native,{construct(target,args){return new target({...args[0],iceTransportPolicy:'relay',iceServers:[]})}});
 });
 const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>result.errors.push({role,error:e.message}));
 return {page,context};
}
async function ready(page,url){await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—')}
async function link(page,row,buffer,name){const choose=page.waitForEvent('filechooser');await row.locator('[data-relink]').click();await(await choose).setFiles({name,mimeType:'application/octet-stream',buffer})}
try{
 const source=await peer('original'),member=await peer('member');await ready(source.page,site);result.url=source.page.url();
 const bytes=randomBytes(1100000),originalName='source-link-original.bin';
 await source.page.locator('#fileInput').setInputFiles({name:originalName,mimeType:'application/octet-stream',buffer:bytes});
 const sourceRow=source.page.locator('.row[data-cid]');await sourceRow.locator('[data-seed][aria-pressed="true"]').waitFor();
 result.cid=await sourceRow.getAttribute('data-cid');const originalPublisher=await sourceRow.locator('.ownerName').textContent();
 await ready(member.page,result.url);const row=member.page.locator(`.row[data-cid="${result.cid}"]`);
 await row.locator('[data-relink]').waitFor();assert.equal(await row.locator('[data-seed]').count(),0);result.checks.push('unrelated room member has link action');
 const wrong=Buffer.from(bytes);wrong[bytes.length-1]^=1;
 await link(member.page,row,wrong,'same-size-wrong.bin');await member.page.getByText('Link rejected.',{exact:false}).waitFor();
 await row.locator('[data-relink]').waitFor();assert.equal(await row.locator('[data-seed]').count(),0);result.checks.push('same-size wrong content rejected by full hash');
 await link(member.page,row,bytes,'different-local-name.bin');await row.locator('[data-seed][aria-pressed="true"]').waitFor();
 assert.equal(await row.locator('.nameText').textContent(),originalName);assert.equal(await row.locator('.ownerName').textContent(),originalPublisher);assert.equal(await member.page.locator('.row[data-cid]').count(),1);
 result.checks.push('matching renamed copy seeds the original listing without changing publisher');
 await member.page.reload({waitUntil:'domcontentloaded'});await member.page.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—');
 await row.locator('[data-relink]').waitFor();assert.equal(await row.locator('[data-seed]').count(),0);assert.equal(await row.locator('[data-relink]').evaluate(b=>b.classList.contains('resumeAvailable')),true);result.checks.push('returning browser sees a blinking relink cue on its orphaned listing');
 await link(member.page,row,bytes,'recovered-copy.bin');await row.locator('[data-seed][aria-pressed="true"]').waitFor();assert.equal(await row.locator('[data-relink]').evaluate(b=>b.classList.contains('resumeAvailable')),false);
 // Stop the uploader and remove it before the new downloader joins. Only the
 // member's verified linked copy can supply these chunks.
 await sourceRow.locator('[data-seed]').click();await sourceRow.locator('[data-seed][aria-pressed="false"]').waitFor();await source.context.close();
 const downloader=await peer('downloader');await ready(downloader.page,result.url);
 const target=downloader.page.locator(`.row[data-cid="${result.cid}"]`);await target.locator('[data-download]').waitFor();
 await downloader.page.waitForFunction(cid=>document.querySelector(`.row[data-cid="${cid}"] [data-source-stat]`)?.textContent.trim().endsWith('1'),result.cid);
 await target.locator('[data-download]').click();await target.locator('[data-download][aria-label="Save file"]').waitFor({timeout:120000});
 if(await downloader.page.locator('#transferModal.show').count())await downloader.page.locator('#transferClose').click();
 const downloading=downloader.page.waitForEvent('download');await target.locator('[data-download]').click();const download=await downloading,received=fs.readFileSync(await download.path());
 assert.deepEqual(received,bytes);result.sha256=createHash('sha256').update(received).digest('hex');result.receivedBytes=received.length;
 assert.notEqual(await member.page.locator('#servedBytes').textContent(),'0 B');result.served=await member.page.locator('#servedBytes').textContent();
 result.checks.push('third peer receives identical bytes over encrypted relays with original uploader closed');
 if(browserName==='chromium'){
  // Supply a real origin-private FileSystemFileHandle through the native-picker
  // branch. IndexedDB must clone it and reload must recover its verified copy.
  await member.page.evaluate(async encoded=>{
   const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle('persisted-copy.bin',{create:true}),writable=await handle.createWritable();
   await writable.write(Uint8Array.from(atob(encoded),x=>x.charCodeAt(0)));await writable.close();
   window.showOpenFilePicker=async()=>[handle];
  },bytes.toString('base64'));
  await row.locator('[data-relink]').click();await row.locator('[data-relink]').waitFor();
  await member.page.reload({waitUntil:'domcontentloaded'});await row.locator('[data-seed][aria-pressed="true"]').waitFor();
  result.checks.push('native file handle persists and restores seeding after reload');
  await member.context.addInitScript(()=>{
   const native=FileSystemHandle.prototype.queryPermission;
   FileSystemHandle.prototype.queryPermission=function(options){return localStorage.getItem('test-source-permission')==='prompt'?Promise.resolve('prompt'):native.call(this,options)};
  });
  await member.page.evaluate(()=>localStorage.setItem('test-source-permission','prompt'));await member.page.reload({waitUntil:'domcontentloaded'});
  await row.locator('[data-relink].resumeAvailable').waitFor();assert.equal(await row.locator('[data-seed]').count(),0);
  await member.page.evaluate(()=>{localStorage.removeItem('test-source-permission');window.dispatchEvent(new Event('focus'))});
  await row.locator('[data-seed][aria-pressed="true"]').waitFor();assert.equal(await row.locator('[data-relink].resumeAvailable').count(),0);
  result.checks.push('returning to the tab automatically restores an accessible saved handle and clears its blinking fallback');
 }
 assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result,null,2));
}catch(e){result.failure=e.message;result.states=await Promise.all(browser.contexts().flatMap(c=>c.pages()).map(p=>p.evaluate(()=>({net:PrivateTrackerMesh.status(),nats:PrivateTrackerMesh.nats(),relayActors:PrivateTrackerMesh.relayActors(),routes:PrivateTrackerMesh.routes(),files:PrivateTrackerMesh.cleanup(),extra:PrivateTrackerMesh.decentralized()})).catch(()=>null)));throw e}finally{fs.writeFileSync(out,JSON.stringify(result,null,2));await browser.close()}
