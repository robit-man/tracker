// Install test tools outside the monofile repository:
// npm install --prefix /tmp/tracker-test-deps playwright mp4box@2.4.1
// TRACKER_TEST_DEPS=/tmp/tracker-test-deps node tests/streaming-decoder.mjs /path/movie.mp4
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
const repo=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||repo,'package.json'));
const {chromium}=require('playwright');
const mp4Dist=path.dirname(require.resolve('mp4box'));
const fixture=process.argv[2];
if(!fixture)throw Error('Pass a local MP4 path');
const resultPath=process.env.RESULT||path.join(os.tmpdir(),'tracker-stream-results.json');
let html=fs.readFileSync(process.env.TRACKER_HTML||repo+'/index.html','utf8');
html=html.replace('const trackerMaintenanceTimer=',fs.readFileSync(new URL('./streaming-hook.js',import.meta.url),'utf8')+'\nconst trackerMaintenanceTimer=').replace('await startMesh();','await startMesh();window.__ready=true;');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-gpu']});
const traces=[],errors=[];
async function scenario(allBlocked){
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 try{
 if(!allBlocked)await contexts[1].addInitScript(()=>{window.ManagedMediaSource=window.MediaSource;delete window.MediaSource});
 const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));
 for(const p of [a,b]){
  p.on('pageerror',e=>errors.push(e.message));
  // Fail the primary distribution. The alternate serves the exact npm package
  // locally, including its relative imports, to isolate this regression from CDN uptime.
  await p.route('https://cdn.jsdelivr.net/npm/mp4box@*/+esm',r=>r.abort('failed'));
  await p.route('https://unpkg.com/mp4box@*/dist/**',r=>allBlocked?r.abort('failed'):r.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(path.join(mp4Dist,path.basename(new URL(r.request().url()).pathname)))}));
  await p.goto(`http://127.0.0.1:${server.address().port}/#test-secret`,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.__ready);
 }
 const actors=await Promise.all([a,b].map(p=>p.evaluate(()=>__tracker.actor)));
 await b.evaluate(remote=>__tracker.rtc(remote,false),actors[0]);
 const offer=await a.evaluate(remote=>__tracker.rtc(remote,true),actors[1]);
 const answer=await b.evaluate(async offer=>{await __pc.setRemoteDescription(offer);await __pc.setLocalDescription(await __pc.createAnswer());await new Promise(r=>{if(__pc.iceGatheringState==='complete')r();else __pc.addEventListener('icegatheringstatechange',()=>{if(__pc.iceGatheringState==='complete')r()})});return __pc.localDescription.toJSON()},offer);
 await a.evaluate(answer=>__pc.setRemoteDescription(answer),answer);
 await Promise.all([a,b].map(p=>p.waitForFunction(()=>window.__rtcReady)));
 console.log(allBlocked?'All decoder CDNs blocked':'Primary decoder CDN blocked');
 await a.locator('#harnessFile').setInputFiles(fixture);
 const cid=await a.evaluate(()=>__tracker.seed());await b.waitForFunction(cid=>__tracker.catalog.has(cid),cid);
 await a.evaluate(blocked=>{__link.bps=blocked?2*1024*1024:1024*1024;__link.dropIndex=-1},allBlocked);
 await b.evaluate(cid=>__tracker.openPreview(__tracker.catalog.get(cid)),cid);
 const trace={allBlocked,samples:[]};traces.push(trace);
 const collect=async()=>{const x=await b.evaluate(()=>({...__tracker.stats(),src:__tracker.p.media.getAttribute('src'),compatReady:!!__tracker.p.compatPlaybackReady,moduleUrl:__tracker.p.mp4ModuleUrl}));trace.samples.push(x);return x};
 if(!allBlocked){
  await b.waitForFunction(()=>__tracker.p.media.currentTime>1,null,{timeout:90000});
  assert.match((await collect()).moduleUrl,/unpkg/);
  assert.ok(await b.evaluate(()=>!window.MediaSource&&__tracker.p.media.disableRemotePlayback),'managed-only API path is configured for local playback');
  for(let i=0;i<110;i++){await new Promise(r=>setTimeout(r,1000));const x=await collect();if(i%10===0)console.log('alternate',i,x.time.toFixed(2),x.safe.toFixed(2))}
  const last=trace.samples.at(-1),steady=trace.samples.slice(-40);
  assert.equal(last.mode,'mp4box');assert.ok(last.time>100,'past the reported 1:29 failure');
  assert.ok(steady.every(s=>s.safe>0&&!s.mediaError));
  assert.ok(steady.every((s,i)=>!i||s.time>steady[i-1].time+.5),'continuous playback through 1:29');
 }else{
  await b.waitForFunction(()=>__tracker.p.session.receivedCount>=8);
  await a.evaluate(()=>{__link.pause=true});
  for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,1000));const x=await collect();assert.equal(x.mode,'compat');assert.equal(x.safe,0);assert.equal(x.compatReady,false);assert.equal(x.src,null,'partial native Blob must never load')}
  await a.evaluate(()=>{__link.bps=32*1024*1024;__link.pause=false});
  await b.waitForFunction(()=>__tracker.p.compatPlaybackReady&&__tracker.p.media.currentTime>1,null,{timeout:180000});
  const before=await collect();assert.equal(before.rx,before.total);assert.ok(before.safe>0);
  await new Promise(r=>setTimeout(r,5000));const after=await collect();
  assert.equal(after.src,before.src,'complete native file is loaded once');assert.ok(after.time>before.time+3);
 }
 assert.ok(trace.samples.every(x=>!x.mediaError&&x.state!=='error'));
 }finally{await Promise.all(contexts.map(c=>c.close()))}
}
try{
 const which=process.env.DECODER_CASE;assert.ok(!which||['alternate','compat'].includes(which));
 if(!which||which==='alternate')await scenario(false);if(!which||which==='compat')await scenario(true);assert.deepEqual(errors,[]);
 console.log('PASS: decoder failure scenarios '+(which||'alternate + compat'));
}finally{
 fs.writeFileSync(resultPath,JSON.stringify({fixture,errors,traces},null,2));
 await browser.close();server.close();
}
