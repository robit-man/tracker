// Exercise native background hashing and inline progress with a real local file.
// Use a large file so intermediate progress can be observed before hashing ends.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||process.cwd(),'package.json'));
const pw=require('playwright');
const project=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const site='https://robit-man.github.io/tracker/',browserName=process.env.BROWSER||'chromium',file=process.env.FILE;
if(!file)throw Error('Set FILE to a large local file (for example an MP4) before running this harness');
const out=process.env.RESULT||`/tmp/tracker-source-verification-${browserName}.json`;
let html=fs.readFileSync(process.env.TRACKER_HTML||path.join(project,'index.html'),'utf8');
const hook=html.lastIndexOf('\n})();');assert.ok(hook>0);
html=html.slice(0,hook)+`\nwindow.__sourceVerificationTest={state:cid=>({local:localHave.has(cid),seeding:seedEnabled(cid),verifying:sourceVerifying.has(cid),progress:sourceVerifyProgress.get(cid)||null,root:contents.get(cid)?.root,readable:sourceFiles.get(cid)?.size||0})};\n`+html.slice(hook);
(async()=>{
 const report={browser:browserName,htmlOverride:true,fileBytes:fs.statSync(file).size,errors:[],samples:[]};
 const browser=await pw[browserName].launch({args:browserName==='chromium'?['--no-sandbox','--disable-gpu']:[]});
 try{
  const context=await browser.newContext();await context.route(site,r=>r.fulfill({contentType:'text/html',body:html}));
  await context.addInitScript(()=>{window.showOpenFilePicker=undefined;localStorage.setItem('private-tracker-deep-privacy-v1','1')});
  const page=await context.newPage();if(process.env.MOBILE)await page.setViewportSize({width:390,height:844});page.setDefaultTimeout(180000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(site,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—');
  const indexed=Date.now();await page.locator('#fileInput').setInputFiles(file);await page.locator('.row[data-cid] [data-seed][aria-pressed="true"]').waitFor();report.indexMs=Date.now()-indexed;
  const cid=await page.locator('.row[data-cid]').getAttribute('data-cid');report.cid=cid;report.original=await page.evaluate(cid=>__sourceVerificationTest.state(cid),cid);
  await page.reload({waitUntil:'domcontentloaded'});const row=page.locator(`.row[data-cid="${cid}"]`);await row.locator('[data-relink].resumeAvailable').waitFor();await row.locator('.nameText').click();
  const chooser=page.waitForEvent('filechooser');await row.locator('[data-relink]').click();const start=Date.now();await(await chooser).setFiles(file);
  for(;;){
   const sample=await page.evaluate(cid=>{const state=__sourceVerificationTest.state(cid),box=document.querySelector(`[data-source-verification="${cid}"]`),bar=box?.querySelector('[role="progressbar"]');return{...state,inline:box?.textContent||null,percent:bar?Number(bar.getAttribute('aria-valuenow')):null}},cid);
   report.samples.push({ms:Date.now()-start,...sample});
   if(sample.percent>=5&&sample.percent<95&&!report.screenshots){
    report.screenshots=[];
    for(const theme of ['dark','light']){
     await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
     await page.waitForTimeout(180);
     const geometry=await row.locator('[data-source-verification]').evaluate(box=>{const r=box.getBoundingClientRect(),row=box.parentElement.getBoundingClientRect(),s=getComputedStyle(box);return{left:r.left,right:r.right,rowLeft:row.left,rowRight:row.right,scroll:box.scrollWidth,width:box.clientWidth,padding:s.padding,background:s.backgroundColor}});
     assert.ok(geometry.left>=geometry.rowLeft&&geometry.right<=geometry.rowRight+1);assert.ok(geometry.scroll<=geometry.width+1);
     const screenshot=out+'.'+theme+'.png';await page.screenshot({path:screenshot});report.screenshots.push({theme,screenshot,geometry});
    }
   }
   if(sample.local&&!sample.verifying){report.final=sample;break}
   if(Date.now()-start>180000)throw Error('Relink exceeded test deadline');
   await page.waitForTimeout(150);
  }
  report.relinkMs=Date.now()-start;
  assert.equal(report.final.root,report.original.root);assert.equal(report.final.readable,report.fileBytes);assert.equal(report.final.seeding,true);
  {const shown=report.samples.filter(s=>s.percent!==null);assert.ok(shown.length>=2,'inline progress appears under file');assert.ok(shown.some(s=>s.percent>0&&s.percent<100),'intermediate progress visible');assert.ok(shown.every((s,i)=>!i||s.percent>=shown[i-1].percent),'progress monotonic');assert.ok(shown.some(s=>s.inline.includes('/s')),'verification rate visible');assert.equal(await row.locator('[data-source-verification]').count(),0);}
  assert.equal(await page.locator('[data-file-expiry]').count(),0);assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({browser:browserName,indexMs:report.indexMs,relinkMs:report.relinkMs,progressSamples:report.samples.filter(s=>s.percent!==null).length,passed:true}));
 }catch(e){report.failure=e.message;throw e}finally{fs.writeFileSync(out,JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
