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
const legacyHtml=process.env.LEGACY_VIEWER_HTML&&fs.readFileSync(process.env.LEGACY_VIEWER_HTML,'utf8');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding',...(process.env.DEBUG_PORT?['--remote-debugging-port='+process.env.DEBUG_PORT]:[])]});
const errors=[],samples=[];let url;
async function snapshot(page){return page.evaluate(()=>{
 const get=id=>document.getElementById(id)?.textContent,v=document.querySelector('#previewStage video');
 const ranges=v?Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)]):[],time=v?.currentTime||0;
 const range=ranges.find(([a,b])=>time>=a-.05&&time<=b+.05);
 const data=document.getElementById('previewDebugMetrics')?.dataset;
 return {at:new Date().toISOString(),time,safe:range?Math.max(0,range[1]-time):0,band:data&&{low:Number(data.safeLow),high:Number(data.safeHigh),recovery:Number(data.safeRecovery)},audit:window.__reserveAudit,paused:v?.paused,ready:v?.readyState,error:v?.error?.message,state:get('previewState'),metrics:get('previewDebugMetrics'),events:get('previewDebugEvents'),paths:get('previewDiagRoutes'),routes:PrivateTrackerMesh.routes(),nats:PrivateTrackerMesh.nats(),mqtt:PrivateTrackerMesh.mqtt(),mesh:PrivateTrackerMesh.status(),served:get('servedBytes'),writeBacklog:PrivateTrackerMesh.writeBacklog?.()};
})}
try {
 const mobile=process.env.MOBILE_VIEWER==='1';
 const viewerOptions=mobile?{viewport:{width:393,height:851},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{};
 const contexts=await Promise.all([browser.newContext(),browser.newContext(viewerOptions),...(process.env.EXTRA_VIEWER==='1'?[browser.newContext(viewerOptions)]:[])]);
 for(const [i,c] of contexts.entries()){
  if(process.env.DECODER_PRIMARY_BLOCKED==='1')await c.route('https://cdn.jsdelivr.net/npm/mp4box@*/+esm',r=>r.abort('failed'));
  if(i>0&&process.env.MANAGED_API_ONLY==='1')await c.addInitScript(()=>{window.ManagedMediaSource=window.MediaSource;delete window.MediaSource});
  const contextHtml=i===2&&legacyHtml?legacyHtml:html;
  if(contextHtml)await c.route('https://robit-man.github.io/tracker/',r=>r.fulfill({contentType:'text/html',body:contextHtml}));
  if(process.env.RELAY_ONLY==='1')await c.addInitScript(()=>{
   // Force failed direct ICE without replacing any transport or application code.
   const Native=window.RTCPeerConnection;
   window.RTCPeerConnection=new Proxy(Native,{construct(target,args){return new target({...args[0],iceTransportPolicy:'relay',iceServers:[]})}});
  });
 }
 const [source,viewer,competitor]=await Promise.all(contexts.map(c=>c.newPage()));
 for(const [role,p]of[['source',source],['viewer',viewer],...(competitor?[['competitor',competitor]]:[])])p.on('pageerror',e=>{errors.push({role,message:e.message});console.log('PAGEERROR',role,e.message)});
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
 if(competitor){await competitor.goto(url,{waitUntil:'domcontentloaded'});await competitor.locator('.row').filter({hasText:path.basename(fixture)}).locator('[data-stream]').click({timeout:180000})}
 async function collect(label){const [a,b,c]=await Promise.all([snapshot(source),snapshot(viewer),competitor?snapshot(competitor):null]);const x={label,source:a,viewer:b,competitor:c};samples.push(x);fs.writeFileSync(resultPath,JSON.stringify({fixture,url,htmlOverride:!!html,relayOnly:process.env.RELAY_ONLY==='1',mobileViewer:mobile,extraViewer:!!competitor,errors,samples},null,2));console.log(JSON.stringify({label,time:b.time,safe:b.safe,paths:b.paths,metrics:b.metrics}));assert.ok(!b.error,'no media error');return x}
 for(const target of (process.env.SEEK_TARGETS?process.env.SEEK_TARGETS.split(',').map(Number):[6000,1200,9000])){
  await viewer.evaluate(t=>document.querySelector('#previewStage video').currentTime=t,target);
  let recovered=false;
  for(let i=0;i<120;i++){await new Promise(r=>setTimeout(r,1000));const x=await collect('seek '+target);if(x.viewer.time>target+3&&x.viewer.safe>0&&!x.viewer.paused){recovered=true;break}}
  assert.ok(recovered,'public relay seek resumes at '+target);
 }
 if(process.env.RESERVE_GUARD==='1'){
  let armed=false;
  for(let i=0;i<180;i++){const x=await collect('reserve kickoff');if(x.viewer.safe>=x.viewer.band.high&&x.viewer.band.high>0){armed=true;break}await new Promise(r=>setTimeout(r,1000))}
  assert.ok(armed,'public relay reserve reaches its measured upper band');
 }
 const before=await collect('sustain start');
 if(process.env.RESERVE_GUARD==='1')await viewer.evaluate(()=>{
  const v=document.querySelector('#previewStage video');
  window.__reserveAudit={samples:0,crossings:[],waiting:[],minMargin:Infinity};
  v.addEventListener('waiting',()=>__reserveAudit.waiting.push(v.currentTime));
  setInterval(()=>{
   const time=v.currentTime,low=Number(document.getElementById('previewDebugMetrics').dataset.safeLow);let safe=0;
   for(let i=0;i<v.buffered.length;i++)if(time>=v.buffered.start(i)-.05&&time<=v.buffered.end(i)+.05){safe=Math.max(0,v.buffered.end(i)-time);break}
   const margin=safe-low;__reserveAudit.samples++;__reserveAudit.minMargin=Math.min(__reserveAudit.minMargin,margin);
   if(margin<0&&__reserveAudit.crossings.length<100)__reserveAudit.crossings.push({time,safe,low});
  },100);
 });
 const sustained=[];
 for(let i=0;i<Number(process.env.SUSTAIN_TICKS||60);i++){await new Promise(r=>setTimeout(r,1000));sustained.push(await collect('sustain'))}
 const elapsed=(Date.parse(samples.at(-1).viewer.at)-Date.parse(before.viewer.at))/1000;
 assert.ok(samples.at(-1).viewer.time>before.viewer.time+elapsed*.9,'public relay playback continues without repeated stalls');
 const steady=samples.slice(-20);
 assert.ok(steady.every((x,i)=>!i||x.viewer.time>steady[i-1].viewer.time+.5),'every final observation advances playback');
 if(process.env.RESERVE_GUARD==='1'){
  const violations=sustained.filter(x=>x.viewer.safe<x.viewer.band.low);
  assert.equal(violations.length,0,'every public relay post-kickoff SAFE sample stays above its dynamic lower band: '+JSON.stringify(violations.map(x=>({time:x.viewer.time,safe:x.viewer.safe,low:x.viewer.band.low}))));
  assert.ok(sustained.every((x,i)=>!i||x.viewer.time>sustained[i-1].viewer.time+.5),'every protected observation advances without a stall');
  const audit=samples.at(-1).viewer.audit;
  assert.ok(audit.samples>=Number(process.env.SUSTAIN_TICKS||60)*8,'the ten-per-second audit runs throughout sustain');
  assert.deepEqual(audit.crossings,[],'the ten-per-second audit preserves the lower band');
  assert.deepEqual(audit.waiting,[],'no rebuffering events occur after reserve buildup');
 }else assert.ok(samples.at(-1).viewer.safe>before.viewer.safe,'reserve grows during sustained refill');
 if(competitor)assert.ok((await snapshot(competitor)).time>10,'the competing viewer also plays');
 assert.ok(samples.at(-1).viewer.safe>0,'playable reserve survives');
 assert.equal(errors.length,0,'no browser runtime errors');
 assert.ok(samples.every(s=>!s.source.writeBacklog||Math.max(s.source.writeBacklog.nats,...Object.values(s.source.writeBacklog.mqtt))<8*1024*1024),'source WebSocket queues remain bounded');
 console.log('PASS public relay forward/backward uncached seeks and continued playback:',resultPath);
}finally{
 fs.writeFileSync(resultPath,JSON.stringify({fixture,url,htmlOverride:!!html,relayOnly:process.env.RELAY_ONLY==='1',mobileViewer:process.env.MOBILE_VIEWER==='1',extraViewer:process.env.EXTRA_VIEWER==='1',errors,samples},null,2));
 await browser.close();
}
