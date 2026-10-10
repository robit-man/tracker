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
const samples=[];const ticks=Number(process.env.TICKS||120);
const reserveGuard=process.env.RESERVE_GUARD==='1';
for(let i=0;i<ticks;i++){
 await new Promise(r=>setTimeout(r,1000));
 if(i===20){await a.evaluate(()=>{__link.bps=768*1024});console.log('LINK slower: 768 KiB/s')}
 if(!reserveGuard&&i===35){await b.evaluate(()=>{__tracker.p.media.playbackRate=4});console.log('PLAYBACK consumption: 4x')}
 if(!reserveGuard&&i===50){await a.evaluate(()=>{__link.pause=true});console.log('LINK outage')}
 if(i===65){await a.evaluate(()=>{__link.pause=false;__link.bps=8*1024*1024});console.log('LINK restored: 8 MiB/s')}
 if(!reserveGuard&&i===85){await b.evaluate(()=>{const p=__tracker.p;p.media.currentTime=Math.max(0,p.media.currentTime-3)});console.log('BUFFERED SEEK back 3s')}
 const stats=await b.evaluate(()=>__tracker.stats());samples.push({tick:i,...stats});console.log(JSON.stringify({tick:i,...stats}));if(stats.state==='error')break;
}
fs.writeFileSync(resultPath,JSON.stringify({fixture,errors,samples},null,2));
assert.equal(errors.length,0,'no browser runtime errors');
if(reserveGuard){
 const armed=samples.findIndex(s=>s.time>0&&s.band&&s.safe>=s.band.high);
 assert.ok(armed>=0,'reserve reaches its measured upper band');
 const guarded=samples.slice(armed);
 const violations=guarded.filter(s=>s.safe<s.band.low);
 assert.equal(violations.length,0,'every post-kickoff SAFE sample stays above the dynamic lower band: '+JSON.stringify(violations.map(s=>({tick:s.tick,safe:s.safe,low:s.band.low}))));
 assert.ok(guarded.every((s,i)=>!i||s.time>guarded[i-1].time+.5),'each observation advances without a stall');
 assert.ok(samples.at(-1).time>ticks*.8,'sustained playback advances at real time');
 assert.ok(samples.every(s=>s.state!=='error'&&!s.mediaError),'no transport/parser/media errors');
 console.log('PASS: every post-kickoff observation preserves the dynamic lower band under changing adequate bandwidth. Trace: '+resultPath);
}else{
if(process.env.MIN_PLAY_TIME){
 assert.ok(samples.at(-1).time>Number(process.env.MIN_PLAY_TIME),'playback passes the reported later-stream failure');
 const steady=samples.slice(-20);
 assert.ok(steady.every(s=>s.safe>=s.target),'playable reserve remains above its measured recovery band');
 assert.ok(steady.every((s,i)=>!i||s.time>steady[i-1].time+2),'final observations advance continuously at 4x');
}
assert.ok(samples.every(s=>s.state!=='error'&&!s.mediaError),'no transport/parser/media errors');
assert.ok(samples.some(s=>s.head>10&&s.time>0),'dropped chunk recovered and playback started');
assert.ok(samples[45].time>samples[30].time,'playback advances during the bandwidth/consumption change');
const restored=samples.filter(s=>s.tick>=70&&s.tick<85);
assert.ok(restored.at(-1).time>restored[0].time,'playback resumes after the outage');
assert.ok(restored.at(-1).segBytes>restored[0].segBytes,'fragment generation resumes after the outage');
const sought=samples.filter(s=>s.tick>=86);
assert.ok(sought.at(-1).time>sought[0].time,'buffered seek preserves playback');
assert.ok(sought.at(-1).segBytes>sought[0].segBytes,'buffered seek preserves subsequent fragments');
assert.ok(new Set(samples.filter(s=>s.ready).map(s=>Math.round(s.target*10))).size>10,'reserve adapts dynamically');
assert.ok(new Set(samples.filter(s=>s.ready).map(s=>s.requestChunks)).size>3,'request window adapts dynamically');
console.log('PASS: bandwidth change, dropped head, outage recovery, buffered seek and adaptive controller. Trace: '+resultPath);
}
}finally{await browser.close();server.close();}
