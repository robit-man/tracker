// Real file import and rendered layout, including long names and folder depth.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||process.cwd(),'package.json')),{chromium}=require('playwright');
const site='https://robit-man.github.io/tracker/',html=process.env.TRACKER_HTML&&fs.readFileSync(process.env.TRACKER_HTML,'utf8'),result={htmlOverride:!!html,sizes:[],errors:[]},out=process.env.RESULT||'/tmp/mobile-cards.json';
const browser=await chromium.launch({args:['--disable-gpu']});
try{
 const context=await browser.newContext();if(html)await context.route(site,r=>r.fulfill({contentType:'text/html',body:html}));const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 await page.goto(site,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—');
 const name='Very long filename with spaces — '+ 'unbrokenfilename'.repeat(10)+'.mp4';
 await page.locator('#fileInput').setInputFiles([{name,mimeType:'video/mp4',buffer:Buffer.from('test fixture')},{name:'small.txt',mimeType:'text/plain',buffer:Buffer.from('small')}]);await page.locator('.row[data-cid]').first().waitFor();
 for(const width of [320,360,390,640,1280]){
  await page.setViewportSize({width,height:800});await page.waitForTimeout(100);
  const layout=await page.locator('.row[data-cid]').evaluateAll(rows=>rows.map(r=>({name:r.querySelector('.nameText').textContent,height:r.offsetHeight,width:r.offsetWidth,overflow:r.scrollWidth>r.clientWidth,bounds:[...r.querySelectorAll(':scope > div,button,.nameText,.ownerName')].map(e=>{const b=e.getBoundingClientRect();return{left:b.left,right:b.right,width:b.width,scroll:e.scrollWidth,client:e.clientWidth,name:e.className}}),labels:[...r.querySelectorAll('[data-label]')].map(e=>getComputedStyle(e,'::before').content),actions:[...r.querySelectorAll('button')].map(e=>({label:e.getAttribute('aria-label'),width:e.offsetWidth,height:e.offsetHeight}))})));
  if(width<=640)for(const r of layout){assert.equal(r.overflow,false);assert.ok(r.bounds.every(b=>b.left>=0&&b.right<=width+.5),JSON.stringify({width,row:r}));assert.ok(r.actions.every(a=>a.width>=40&&a.height>=40));assert.ok(r.labels.length>=4);assert.ok(r.height>100)}
  else assert.ok(layout.every(r=>r.height<60),'desktop retains compact rows');result.sizes.push({width,layout});await page.screenshot({path:out+'.'+width+'.png'});
 }
 assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=e.message;throw e}finally{fs.writeFileSync(out,JSON.stringify(result,null,2));await browser.close()}
