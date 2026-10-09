// Public signaling/relay integration test. Dependencies live outside the repo.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const repo=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||repo,'package.json'));
const {chromium}=require('playwright');
const fixture=process.argv[2];if(!fixture)throw Error('Pass a local MP4 path');
const resultPath=process.env.RESULT||'/tmp/tracker-public-results.json';
const html=process.env.TRACKER_HTML&&fs.readFileSync(process.env.TRACKER_HTML,'utf8');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding',...(process.env.DEBUG_PORT?['--remote-debugging-port='+process.env.DEBUG_PORT]:[])]});
const errors=[],samples=[];let url;
async function snapshot(page){return page.evaluate(()=>{
 const get=id=>document.getElementById(id)?.textContent,v=document.querySelector('#previewStage video');
 const ranges=v?Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)]):[],time=v?.currentTime||0;
 const range=ranges.find(([a,b])=>time>=a-.05&&time<=b+.05);
 return {at:new Date().toISOString(),time,safe:range?Math.max(0,range[1]-time):0,paused:v?.paused,ready:v?.readyState,error:v?.error?.message,state:get('previewState'),metrics:get('previewDebugMetrics'),events:get('previewDebugEvents'),paths:get('previewDiagRoutes'),routes:PrivateTrackerMesh.routes(),nats:PrivateTrackerMesh.nats(),mqtt:PrivateTrackerMesh.mqtt(),mesh:PrivateTrackerMesh.status(),served:get('servedBytes'),writeBacklog:PrivateTrackerMesh.writeBacklog?.()};
})}
try {
 const mobile=process.env.MOBILE_VIEWER==='1';
 const contexts=await Promise.all([browser.newContext(),browser.newContext(mobile?{viewport:{width:393,height:851},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{})]);
 for(const c of contexts){
  if(html)await c.route('https://robit-man.github.io/tracker/',r=>r.fulfill({contentType:'text/html',body:html}));
  if(process.env.RELAY_ONLY==='1')await c.addInitScript(()=>{
   // Force failed direct ICE without replacing any transport or application code.
   const Native=window.RTCPeerConnection;
   window.RTCPeerConnection=new Proxy(Native,{construct(target,args){return new target({...args[0],iceTransportPolicy:'relay',iceServers:[]})}});
  });
 }
 const [source,viewer]=await Promise.all(contexts.map(c=>c.newPage()));
 for(const [role,p]of[['source',source],['viewer',viewer]])p.on('pageerror',e=>{errors.push({role,message:e.message});console.log('PAGEERROR',role,e.message)});
 await source.goto('https://robit-man.github.io/tracker/',{waitUntil:'domcontentloaded'});
 await source.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—');url=source.url();
 await source.locator('#fileInput').setInputFiles(fixture);
 await source.locator('.row').filter({hasText:path.basename(fixture)}).locator('[data-seed]').waitFor({timeout:180000});
 await viewer.goto(url,{waitUntil:'domcontentloaded'});
 const row=viewer.locator('.row').filter({hasText:path.basename(fixture)});
 await row.locator('[data-stream]').waitFor({timeout:180000});await row.locator('[data-stream]').click();
 await viewer.locator('#previewDebugToggle').click();
 let started=false;
 for(let i=0;i<180;i++){
  const [a,b]=await Promise.all([snapshot(source),snapshot(viewer)]);
  fs.writeFileSync(resultPath+'.startup',JSON.stringify({url,source:a,viewer:b},null,2));
  if(b.time>3&&!b.paused&&!b.error){started=true;break}
  if(i%10===0)console.log('STARTUP',JSON.stringify({i,time:b.time,safe:b.safe,state:b.state,paths:b.paths,sourceMesh:a.mesh}));
  await new Promise(r=>setTimeout(r,1000));
 }
 assert.ok(started,'public relay playback starts');
 console.log('PLAYING',url);
 const ticks=Number(process.env.TICKS||150);
 for(let i=0;i<ticks;i++){
  if(i===30)await viewer.evaluate(()=>document.querySelector('#previewStage video').playbackRate=4);
  if(i===50){await contexts[1].setOffline(true);console.log('RECEIVER OFFLINE')}
  if(i===65){await viewer.evaluate(()=>document.querySelector('#previewStage video').playbackRate=1);await contexts[1].setOffline(false);console.log('RECEIVER ONLINE, PLAYBACK 1x')}
  await new Promise(r=>setTimeout(r,1000));
  const [a,b]=await Promise.all([snapshot(source),snapshot(viewer)]);samples.push({tick:i,source:a,viewer:b});
  fs.writeFileSync(resultPath,JSON.stringify({fixture,url,htmlOverride:!!html,relayOnly:process.env.RELAY_ONLY==='1',mobileViewer:process.env.MOBILE_VIEWER==='1',errors,samples},null,2));
  if(i%5===0)console.log(JSON.stringify({tick:i,time:b.time,safe:b.safe,state:b.state,paths:b.paths,sourceMesh:a.mesh}));
 }
 assert.equal(errors.length,0,'no browser runtime errors');
 assert.ok(samples.every(s=>!s.source.writeBacklog||Math.max(s.source.writeBacklog.nats,...Object.values(s.source.writeBacklog.mqtt))<8*1024*1024),'source WebSocket queues remain bounded');
 assert.ok(samples.every(s=>!s.viewer.error),'no media errors');
 assert.ok(samples[45].viewer.time>samples[30].viewer.time,'playback advances under higher consumption');
 assert.ok(samples.at(-1).viewer.time>samples[100].viewer.time+20,'playback and SAFE recover after receiver disconnection');
 assert.ok(samples.at(-1).viewer.safe>0,'decoder has playable media after recovery');
 console.log('PASS public discovery, streaming, consumption change and disconnected receiver recovery:',resultPath);
}finally{
 fs.writeFileSync(resultPath,JSON.stringify({fixture,url,htmlOverride:!!html,relayOnly:process.env.RELAY_ONLY==='1',mobileViewer:process.env.MOBILE_VIEWER==='1',errors,samples},null,2));
 await browser.close();
}
