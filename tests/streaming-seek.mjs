// Install test tools outside the monofile repository:
// npm install --prefix /tmp/tracker-test-deps playwright mp4box@2.4.1
// TRACKER_TEST_DEPS=/tmp/tracker-test-deps node tests/streaming-browser.mjs /path/movie.mp4
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
html=html.replace('const trackerMaintenanceTimer=',fs.readFileSync(new URL('./streaming-hook.js',import.meta.url),'utf8')+'\nconst trackerMaintenanceTimer=').replace('await startMesh();','await startMesh();window.__ready=true;').replace('https://cdn.jsdelivr.net/npm/mp4box@${MP4BOX_VERSION}/+esm','/mp4box/mp4box.all.mjs');
const server=http.createServer((req,res)=>{if(req.url.startsWith('/mp4box/')){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(mp4Dist,path.basename(req.url))))}else{res.setHeader('Content-Type','text/html');res.end(html)}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-gpu',...(process.env.DEBUG_PORT?['--remote-debugging-port='+process.env.DEBUG_PORT]:[])]});
try{
const contexts=await Promise.all([browser.newContext(),browser.newContext()]);const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));
const errors=[];for(const [i,p]of[a,b].entries()){p.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',i,e.message)});p.on('console',m=>{if(m.type()==='error')console.log('ERROR',i,m.text().slice(0,300))});await p.goto(`http://127.0.0.1:${server.address().port}/#test-secret`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__ready)}
const actors=await Promise.all([a,b].map(p=>p.evaluate(()=>window.__tracker.actor)));
await b.evaluate(remote=>window.__tracker.rtc(remote,false),actors[0]);const offer=await a.evaluate(remote=>window.__tracker.rtc(remote,true),actors[1]);
const answer=await b.evaluate(async offer=>{await __pc.setRemoteDescription(offer);await __pc.setLocalDescription(await __pc.createAnswer());await new Promise(r=>{if(__pc.iceGatheringState==='complete')r();else __pc.addEventListener('icegatheringstatechange',()=>{if(__pc.iceGatheringState==='complete')r()})});return __pc.localDescription.toJSON()},offer);await a.evaluate(answer=>__pc.setRemoteDescription(answer),answer);
await Promise.all([a,b].map(p=>p.waitForFunction(()=>window.__rtcReady)));
console.log('RTC connected; indexing file');await a.locator('#harnessFile').setInputFiles(fixture);
const cid=await a.evaluate(()=>window.__tracker.seed());console.log('Seed indexed',cid);await b.waitForFunction(cid=>window.__tracker.catalog.has(cid),cid);
await b.evaluate(cid=>window.__tracker.openPreview(window.__tracker.catalog.get(cid)),cid);
const samples=[],seeks=[];
async function sample(label){const stats=await b.evaluate(()=>__tracker.stats());samples.push({at:new Date().toISOString(),label,...stats});fs.writeFileSync(resultPath,JSON.stringify({fixture,errors,seeks,samples},null,2));console.log(JSON.stringify({label,...stats}));assert.ok(!stats.mediaError&&stats.state!=='error','no media/parser errors');return stats}
async function waitPlaying(target,label){for(let i=0;i<120;i++){await new Promise(r=>setTimeout(r,1000));const x=await sample(label);if(x.time>target+3&&x.safe>0&&!x.paused)return x}assert.fail('seek failed to resume: '+label)}
await waitPlaying(0,'startup');
for(const target of [6000,1200,9000,0]){
 if(target===0)await b.evaluate(async()=>{for(let i=0;i<300;i++){__tracker.trimBehind();if([...__tracker.p.mp4TrackBuffers.values()].every(sb=>!sb.updating&&(!sb.buffered.length||sb.buffered.start(0)>60)))return;await new Promise(r=>setTimeout(r,20))}throw Error('initial MSE range was not evicted')});
 const before=await b.evaluate(()=>__tracker.stats());
 assert.ok(!before.ranges.some(([a,z])=>target>=a&&target<z),'target is outside decoded ranges');
 await b.evaluate(t=>{__tracker.p.media.currentTime=t},target);
 const after=await waitPlaying(target,'seek '+target);
 assert.ok(after.seekEpoch>before.seekEpoch,'new seek epoch');
 if(target>1000){assert.ok(after.head>500,'decoder jumped beyond the missing file prefix');assert.ok(after.fed<128,'does not feed the intervening file');assert.ok(after.prefix<after.head,'plays with the original file prefix still missing')}
 assert.ok(after.netBytes-before.netBytes<128*512*1024,'seek fetches a bounded target range');
 seeks.push({target,before,after});
}
// A later scrub supersedes both earlier requests and a cache read in progress.
await b.evaluate(async()=>{const m=__tracker.p.media;m.currentTime=7000;await new Promise(r=>setTimeout(r,80));m.currentTime=1800;await new Promise(r=>setTimeout(r,80));m.currentTime=4200});
await waitPlaying(4200,'rapid seek final 4200');
const before=await sample('sustain start');
for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,1000));await sample('sustain')}
const after=samples.at(-1);
assert.ok(after.time>before.time+20,'playback continues after seeks');
assert.ok(after.segBytes>before.segBytes,'fragment production continues after seeks');
assert.equal(errors.length,0,'no browser runtime errors');
console.log('PASS: forward/backward uncached seeks, released cached samples, rapid scrubs and continued ETV playback. Trace: '+resultPath);
}finally{await browser.close();server.close();}
