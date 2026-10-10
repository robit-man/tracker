// Real desktop capture in a private virtual display; no camera or user desktop is recorded.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||process.cwd(),'package.json'));
const {chromium}=require('playwright');
const site='https://robit-man.github.io/tracker/';
const html=process.env.TRACKER_HTML&&fs.readFileSync(process.env.TRACKER_HTML,'utf8');
const resultPath=process.env.RESULT||'/tmp/tracker-live-media-results.json';
const display=String(200+process.pid%1000),xvfb=spawn('Xvfb',[':'+display,'-screen','0','1280x720x24','-nolisten','tcp'],{stdio:'ignore'});
const errors=[],result={htmlOverride:!!html,relayOnly:process.env.RELAY_ONLY==='1',errors};let browser,source,viewer,progressTimer;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function icons(page){
 const failures=await page.locator('button').evaluateAll(buttons=>buttons.filter(b=>b.getClientRects().length).flatMap(b=>{
  const svg=b.querySelector('svg'),r=b.getBoundingClientRect(),s=svg?.getBoundingClientRect();
  return !b.getAttribute('aria-label')||!b.dataset.tooltip||!s||!s.width||Math.abs(r.left+r.width/2-s.left-s.width/2)>1||Math.abs(r.top+r.height/2-s.top-s.height/2)>1?[b.outerHTML]:[];
 }));assert.deepEqual(failures,[],'every visible action has a centered icon, accessible name and tooltip');
}
try{
 for(let i=0;i<100&&!fs.existsSync('/tmp/.X11-unix/X'+display);i++)await delay(100);
 browser=await chromium.launch({headless:false,env:{...process.env,DISPLAY:':'+display},args:['--no-sandbox','--disable-gpu','--auto-select-desktop-capture-source=screen','--enable-usermedia-screen-capturing','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const sourceContext=await browser.newContext({viewport:{width:1280,height:720}}),viewerContext=await browser.newContext({viewport:{width:1000,height:720}});
 for(const c of [sourceContext,viewerContext]){
  if(html)await c.route(site,r=>r.fulfill({contentType:'text/html',body:html}));
  if(result.relayOnly)await c.addInitScript(()=>{const Native=window.RTCPeerConnection;window.RTCPeerConnection=new Proxy(Native,{construct(target,args){return new target({...args[0],iceTransportPolicy:'relay',iceServers:[]})}})});
 }
 source=await sourceContext.newPage();viewer=await viewerContext.newPage();
 for(const [role,p]of [['source',source],['viewer',viewer]])p.on('pageerror',e=>errors.push({role,message:e.message}));
 await source.goto(site,{waitUntil:'domcontentloaded'});await source.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—');result.url=source.url();await icons(source);
 await source.locator('#screenShareBtn').hover();await source.locator('#actionTooltip').waitFor({state:'visible'});assert.equal(await source.locator('#actionTooltip').textContent(),'Share screen');
 await source.screenshot({path:resultPath+'.desktop.png'});
 await source.locator('#liveMediaBtn').click();await icons(source);assert.equal(await source.locator('[data-live-mode]').count(),4);await source.locator('#liveSetupClose').click();
 // Retain a real, changing virtual-desktop capture through the actual browser API.
 await source.locator('#screenShareBtn').click();await source.locator('#liveViewerModal.show').waitFor({timeout:20000});
 result.capture=await source.locator('#liveViewerStage video').evaluate(v=>v.srcObject.getTracks().map(t=>({kind:t.kind,settings:t.getSettings()})));
 assert.equal(result.capture[0].settings.displaySurface,'monitor');await icons(source);assert.equal(await source.locator('#screenShareBtn').getAttribute('aria-pressed'),'true');await source.locator('#liveViewerClose').click();
 await viewer.goto(result.url,{waitUntil:'domcontentloaded'});await viewer.locator('[data-live-watch]').waitFor({timeout:90000});await icons(viewer);await viewer.locator('[data-live-watch]').click();
 progressTimer=setInterval(async()=>{try{const states=await Promise.all([source,viewer].map(p=>p.evaluate(()=>({debug:window.__liveTest?.(),route:document.querySelector('#liveViewerRoute')?.textContent,media:Array.from(document.querySelectorAll('video'),v=>({time:v.currentTime,ready:v.readyState,paused:v.paused,error:v.error?.message,buffered:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)])}))}))));console.log('LIVE',JSON.stringify(states))}catch(_){}},10000);
 await viewer.waitForFunction(()=>{const v=document.querySelector('#liveViewerStage video');return v?.videoWidth>0&&v.currentTime>1&&!v.paused},null,{timeout:90000});
 result.start=await viewer.locator('#liveViewerStage video').evaluate(v=>({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,route:document.querySelector('#liveViewerRoute').textContent,error:v.error?.message}));
 await delay(6000);result.end=await viewer.locator('#liveViewerStage video').evaluate(v=>({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,route:document.querySelector('#liveViewerRoute').textContent,error:v.error?.message}));assert.ok(result.end.time>result.start.time+3);assert.equal(result.end.error,undefined);
 await viewer.screenshot({path:resultPath+'.screen-viewer.png'});
 await source.locator('[data-live-stop]').click();await viewer.locator('#liveViewerModal').waitFor({state:'hidden',timeout:20000});assert.equal(await source.locator('#screenShareBtn').getAttribute('aria-pressed'),'false');
 // Exercise dynamic file actions and preview controls without network dependencies.
 await source.locator('#fileInput').setInputFiles({name:'icon-check.txt',mimeType:'text/plain',buffer:Buffer.from('Icon controls and screen capture validation.')});await source.locator('[data-seed]').waitFor();await icons(source);await source.locator('[data-stream]').click();await source.locator('#previewModal.show').waitFor();await icons(source);await source.locator('#previewDebugToggle').focus();assert.equal(await source.locator('#actionTooltip').textContent(),'Toggle debug panel');await source.locator('#previewClose').click();
 await source.setViewportSize({width:320,height:700});await icons(source);
 result.mobileHeader=await source.locator('.headerActions button').evaluateAll(bs=>bs.map(b=>({name:b.getAttribute('aria-label'),left:b.getBoundingClientRect().left,right:b.getBoundingClientRect().right,visible:b.getClientRects().length>0})));
 assert.ok(result.mobileHeader.every(b=>b.visible&&b.left>=0&&b.right<=320),'all seven top actions fit at 320px');
 await source.locator('#filesBtn').hover();await source.locator('#actionTooltip').waitFor({state:'visible'});const tooltip=await source.locator('#actionTooltip').boundingBox();assert.ok(tooltip.x>=0&&tooltip.x+tooltip.width<=320&&tooltip.height<40,'short tooltips stay readable after resizing');await source.screenshot({path:resultPath+'.mobile.png'});
 assert.deepEqual(errors,[]);result.passed=true;console.log(JSON.stringify(result,null,2));
}catch(e){result.failure=e.message;for(const [role,p]of [['source',source],['viewer',viewer]])if(p)result[role+'Failure']=await p.evaluate(()=>({status:document.querySelector('#liveViewerStatus')?.textContent,route:document.querySelector('#liveViewerRoute')?.textContent,body:document.querySelector('#tree')?.textContent,media:Array.from(document.querySelectorAll('video'),v=>({time:v.currentTime,paused:v.paused,ready:v.readyState,error:v.error?.message,src:v.currentSrc,buffered:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)])})),mesh:window.PrivateTrackerMesh?.status()})).catch(()=>null);throw e
}finally{clearInterval(progressTimer);fs.writeFileSync(resultPath,JSON.stringify(result,null,2));await browser?.close();xvfb.kill()}
