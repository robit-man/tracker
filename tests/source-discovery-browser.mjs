// Real public-relay regression: an orphaned persisted download must not turn
// negative availability into a query/reply storm. A returning source must wake it.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes,createHash} from 'node:crypto';
const require=createRequire((process.env.TRACKER_TEST_DEPS||'/tmp/tracker-test-deps')+'/package.json');
const pw=require('playwright'),name=process.env.BROWSER||'chromium',out=process.env.OUT||'/tmp/tracker-source-discovery/'+name;
fs.mkdirSync(out,{recursive:true});
const raw=fs.readFileSync(process.env.TRACKER_HTML||'index.html','utf8'),site='https://robit-man.github.io/tracker/';
const hook=`
const discoveryCounts={};const originalMsg=msg;msg=function(type,data){discoveryCounts[type]=(discoveryCounts[type]||0)+1;return originalMsg(type,data)};
window.__sourceDiscovery={sample:()=>({counts:{...discoveryCounts},files:contents.size,operations:catalogOperations.size,replay:authenticatedReplay.size,seen:seen.size,intake:typeof controlIntake==='undefined'?null:{...controlIntake},transfers:[...sessions.values()].map(s=>({cid:s.cid,state:s.state,received:s.receivedCount,total:s.total,holders:s.holders.size,round:s.sourceDiscoveryRounds})),memory:performance.memory?.usedJSHeapSize}),orphan:async cid=>{const c=contents.get(cid),entry=resourceEntry(cid);await putKV('downloadJobs',[{cid,entryId:entry.id,name:visibleName(entry),total:contentTotal(c),chunkSize:contentChunkSize(c),receivedCount:0,bytesReceived:0,state:'downloading',updatedAt:Date.now()}])},bytes:async cid=>{const c=contents.get(cid);let all=new Uint8Array(c.size);for(let i=0;i<contentTotal(c);i++)all.set(await readLocalChunk(cid,i),i*contentChunkSize(c));return sha256Hex(all)}};
`;
const marker='(async()=>{try{if(!crypto?.subtle||!indexedDB)';assert.equal(raw.split(marker).length,2);
const html=raw.replace(marker,hook+'\n'+marker),result={browser:name,sha256:createHash('sha256').update(raw).digest('hex'),checks:[],errors:[],samples:[]};
let context,browser;const pages=[];
async function peer(url){const c=await browser.newContext();await c.addInitScript(()=>{localStorage.setItem('private-tracker-deep-privacy-v1','1');window.showSaveFilePicker=undefined;window.showOpenFilePicker=undefined});await c.route(site+'**',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:html}):r.continue());const p=await c.newPage();pages.push(p);p.on('pageerror',e=>result.errors.push(e.message));p.on('crash',()=>result.errors.push('renderer crash'));await p.goto(url||site,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>PrivateTrackerMesh.status().nats==='ready'&&PrivateTrackerMesh.globalStorage().catalog.ready);return p}
const check=s=>{result.checks.push(s);console.log('PASS',s)};
const sample=p=>p.evaluate(()=>__sourceDiscovery.sample());
try{
 if(process.env.PROFILE){
  context=await pw.chromium.launchPersistentContext(process.env.PROFILE,{executablePath:'/snap/chromium/3554/usr/lib/chromium-browser/chrome',headless:true,args:['--no-sandbox','--disable-gpu']});
  await context.route(site+'**',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:html}):r.continue());
  const p=context.pages()[0]||await context.newPage();pages.push(p);p.on('pageerror',e=>result.errors.push(e.message));p.on('crash',()=>result.errors.push('renderer crash'));
  const room=JSON.parse(fs.readFileSync(process.env.ROOM_STATE,'utf8')).url;await p.goto(room,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>PrivateTrackerMesh.status().nats==='ready'&&__sourceDiscovery.sample().files===17);
  const cdp=await context.newCDPSession(p);check('actual Chromium 155 profile snapshot restores all 17 files and encrypted cached chunks');
  for(let i=0;i<12;i++){await p.waitForTimeout(5000);const before=await sample(p);result.samples.push({cycle:i,...before,heap:await cdp.send('Runtime.getHeapUsage'),dom:await cdp.send('Memory.getDOMCounters')});await p.reload({waitUntil:'domcontentloaded',timeout:30000});await p.waitForFunction(()=>__sourceDiscovery.sample().files===17&&__sourceDiscovery.sample().transfers.length>0&&PrivateTrackerMesh.status().nats==='ready',null,{timeout:30000});}
  check('12 reloads of the real persisted profile complete with the incomplete download intact');
  await p.locator('#side-nav [data-view="browser-storage"]').click();await p.waitForFunction(()=>!document.querySelector('#browserStorageRefresh').disabled&&document.querySelector('#browserStorageStatus').textContent.startsWith('Scanned'),null,{timeout:120000});result.inventory=await p.evaluate(()=>({bytes:document.querySelector('#browserStorageBytes').textContent,summary:document.querySelector('#browserStorageSummary').textContent,rows:document.querySelectorAll('.browser-storage-item').length}));assert.ok(!result.inventory.bytes.startsWith('0 '));check('the actual 1.9 GB cache is scanned in bounded batches without hanging or changing stored data');await cdp.send('HeapProfiler.collectGarbage');result.final={...await sample(p),heap:await cdp.send('Runtime.getHeapUsage'),dom:await cdp.send('Memory.getDOMCounters')};assert.ok(result.final.heap.usedSize<512*1024*1024);assert.ok(result.final.dom.nodes<50000);check('retained JavaScript heap and DOM stay bounded after repeated reloads');
 }else{
  browser=await pw[name].launch({headless:true,args:name==='chromium'?['--disable-gpu']:[]});
  const source=await peer(),room=source.url(),bytes=randomBytes(650000);await source.locator('#fileInput').setInputFiles({name:'missing.bin',mimeType:'application/octet-stream',buffer:bytes});await source.locator('.row[data-cid] [data-seed]').waitFor();const cid=await source.locator('.row[data-cid]').first().getAttribute('data-cid');
  const receiver=await peer(room),bystander=await peer(room);for(const p of [receiver,bystander])await p.locator(`.row[data-cid="${cid}"]`).waitFor({timeout:90000});
  await bystander.locator('#fileInput').setInputFiles({name:'different.bin',mimeType:'application/octet-stream',buffer:randomBytes(123456)});await bystander.locator('.row[data-cid] [data-seed]').waitFor();
  await receiver.evaluate(cid=>__sourceDiscovery.orphan(cid),cid);await source.context().close();await receiver.reload({waitUntil:'domcontentloaded'});await receiver.waitForFunction(cid=>__sourceDiscovery.sample().transfers.some(s=>s.cid===cid),cid);
  check('an actual encrypted IndexedDB download job resumes with no source while another file has a live seeder');
  result.initialReplies=(await sample(bystander)).counts.availability||0;
  const start=Date.now(),duration=Number(process.env.OBSERVE_SECONDS||40)*1000;
  while(Date.now()-start<duration){await receiver.waitForTimeout(1000);const r=await sample(receiver),b=await sample(bystander);result.samples.push({at:Date.now()-start,receiver:r,bystander:b});if(process.env.EXPECT_STORM&&(r.counts['seed-query']||0)>100){result.reproduced=true;break}}
  const last=result.samples.at(-1);result.queries=last.receiver.counts['seed-query']||0;result.replies=last.bystander.counts.availability||0;
  if(process.env.EXPECT_STORM){assert.ok(result.queries>100,'released baseline must reproduce the query loop');check('released v107 reproduces more than 100 self-amplified source queries');}
  else{
   assert.ok(result.queries<=10,JSON.stringify({queries:result.queries,replies:result.replies}));assert.ok(result.replies-result.initialReplies<=10,'background availability remains bounded after startup');check('source discovery stays bounded and nonholders do not amplify it');
   const returned=await peer(room);await returned.locator(`.row[data-cid="${cid}"]`).waitFor({timeout:90000});await returned.locator('#fileInput').setInputFiles({name:'missing.bin',mimeType:'application/octet-stream',buffer:bytes});
   await receiver.waitForFunction(cid=>__sourceDiscovery.sample().transfers.some(s=>s.cid===cid&&s.state==='complete'),cid,{timeout:90000});assert.equal(await receiver.evaluate(cid=>__sourceDiscovery.bytes(cid),cid),createHash('sha256').update(bytes).digest('hex'));check('a returning source immediately resumes the orphaned download and produces byte-identical verified content');
  }
 }
 assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=e.stack;process.exitCode=1;console.error(e)}
finally{if(context)await context.close();if(browser)await browser.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,queries:result.queries,replies:result.replies,checks:result.checks,errors:result.errors,failure:result.failure},null,2))}
