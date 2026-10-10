// QR images are decoded by a separate scanner to verify the exact private URL.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||process.cwd(),'package.json'));
const {chromium}=require('playwright'),jsQR=require('jsqr'),{PNG}=require('pngjs');
const site='https://robit-man.github.io/tracker/';
const html=process.env.TRACKER_HTML&&fs.readFileSync(process.env.TRACKER_HTML,'utf8');
const resultPath=process.env.RESULT||'/tmp/tracker-room-share-results.json';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu']});
const errors=[],result={htmlOverride:!!html,errors};
function decode(buffer){const png=PNG.sync.read(buffer),qr=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);assert.ok(qr,'the rendered QR image is scannable');return qr.data}
try{
 const context=await browser.newContext({viewport:{width:1200,height:800},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
 if(html)await context.route(site,r=>r.fulfill({contentType:'text/html',body:html}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(site,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('sideActor').textContent!=='—');result.url=page.url();assert.ok(new URL(result.url).hash.length>20);
 await context.setOffline(true); // Generation must work without any QR provider or CDN.
 await page.locator('#shareBtn').click();await page.locator('#roomShareModal.show').waitFor();
 assert.equal(await page.locator('#roomShareUrl').inputValue(),result.url);assert.equal(await page.locator('#shareBtn').getAttribute('aria-expanded'),'true');
 await page.waitForFunction(()=>document.getElementById('roomQrImage').naturalWidth>0);
 const data=await page.locator('#roomQrImage').getAttribute('src');assert.ok(data.startsWith('data:image/png;base64,'));
 result.decoded=decode(Buffer.from(data.split(',')[1],'base64'));assert.equal(result.decoded,result.url);
 assert.equal(decode(await page.locator('#roomQrFrame').screenshot()),result.url,'the displayed QR code also scans');
 await page.locator('#roomShareCopy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),result.url);
 assert.equal(await page.locator('#roomShareStatus').textContent(),'Room link copied.');
 const downloading=page.waitForEvent('download');await page.locator('#roomShareDownload').click();const download=await downloading;
 assert.match(download.suggestedFilename(),/^room-[a-f0-9]+-qr\.png$/);assert.equal(decode(fs.readFileSync(await download.path())),result.url);result.download=download.suggestedFilename();
 // Modal keyboard navigation stays inside it and Escape returns focus to its trigger.
 await page.locator('#roomShareClose').focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'roomShareDownload');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'roomShareClose');await page.keyboard.press('Escape');
 assert.equal(await page.locator('#shareBtn').getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.activeElement.id),'shareBtn');
 await page.setViewportSize({width:320,height:700});
 await page.evaluate(()=>history.replaceState(null,'',location.pathname+'?label='+encodeURIComponent('日光 & café')+location.hash));result.updatedUrl=page.url();
 await page.locator('#shareBtn').click();await page.waitForFunction(()=>document.getElementById('roomQrImage').complete&&document.getElementById('roomQrImage').naturalWidth>0);
 const currentData=await page.locator('#roomQrImage').getAttribute('src');assert.equal(decode(Buffer.from(currentData.split(',')[1],'base64')),result.updatedUrl,'reopening refreshes the whole URL, including query and fragment');
 assert.equal(decode(await page.locator('#roomQrFrame').screenshot()),result.updatedUrl,'mobile QR remains scannable');
 const bounds=await page.locator('#roomQrFrame').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=320);
 assert.ok(await page.locator('#roomShareCopy').isVisible());assert.ok(await page.locator('#roomShareDownload').isVisible());
 await page.screenshot({path:resultPath+'.mobile.png'});
 // Clipboard restrictions still leave a selectable room link and working legacy copy.
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new DOMException('Denied','NotAllowedError')}});
 await page.locator('#roomShareCopy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),result.updatedUrl);assert.equal(await page.locator('#roomShareStatus').textContent(),'Room link copied.');
 await page.locator('#roomShareClose').click();await page.setViewportSize({width:1200,height:800});await page.locator('#shareBtn').click();await page.screenshot({path:resultPath+'.desktop.png'});
 await page.locator('#roomShareModal').click({position:{x:10,y:10}});assert.equal(await page.locator('#shareBtn').getAttribute('aria-expanded'),'false');
 assert.deepEqual(errors,[]);result.passed=true;console.log(JSON.stringify(result,null,2));
}catch(e){result.failure=e.message;throw e}finally{fs.writeFileSync(resultPath,JSON.stringify(result,null,2));await browser.close()}
