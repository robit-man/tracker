// Real local File + FFmpeg WASM + native MSE. Force asynchronous remove/append
// overlap: Firefox used to show "An attempt was made to use an object ...".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const root=path.resolve(new URL('..',import.meta.url).pathname),work=fs.mkdtempSync(path.join(os.tmpdir(),'tracker-avi-buffer-'));
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||path.join(root,'agent/mcp'),'package.json'));
const name=process.env.BROWSER||'firefox',fixture=process.argv[2]||path.join(work,'local.avi');
if(!process.argv[2])execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=720x304:rate=24000/1001','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','150','-c:v','mpeg4','-bf','2','-q:v','4','-vtag','XVID','-c:a','ac3','-ac','6','-b:a','384k',fixture],{stdio:'pipe'});
const original=fs.readFileSync(process.env.TRACKER_HTML||path.join(root,'index.html'),'utf8');
const result={browser:name,appSha256:createHash('sha256').update(original).digest('hex'),errors:[],checks:[]};
let hook=fs.readFileSync(path.join(root,'tests/streaming-hook.js'),'utf8');
hook+=`
initGlobalStorage=async()=>{};__tracker.cleanup=cleanupPreview;
window.__bufferPause=()=>{const p=activePreview;p.media.pause();wakeCompatTranscode(p);playbackWatchdogTick()};
window.__race={overlaps:0,limit:4,seek:0,close:false,cancellations:0};
{
 const originalAppend=appendCompatSection;
 appendCompatSection=async(e,...args)=>{
  const p=e.preview,sb=p.sourceBuffer,r=__race;
  if(sb&&!sb.updating&&p.mediaSource.readyState==='open'&&(r.overlaps<r.limit||r.seek||r.close)){
   const at=sb.buffered.length?sb.buffered.end(sb.buffered.length-1)+1:1;
   sb.remove(at,at+.001);if(!sb.updating)throw Error('Test removal did not start');r.overlaps++;
   const pending=originalAppend(e,...args);
   if(r.seek){if(e.bufferWaiters?.size)r.cancellations++;p.media.currentTime=r.seek;r.seek=0;seekCompatSections(e)}
   if(r.close){if(e.bufferWaiters?.size)r.cancellations++;r.close=false;r.old=e;cleanupPreview()}
   return pending;
  }
  return originalAppend(e,...args);
 };
}
window.__bufferState=()=>{const p=activePreview,e=p?.compatProgressive,m=p?.media;return{
 time:m?.currentTime,paused:m?.paused,ahead:p?streamBufferedAhead(p):0,sections:e?.sectionsEncoded,
 failed:e?.failed,failure:e?.failureMessage,error:m?.error?.message,generation:e?.generation,
 readyState:p?.mediaSource?.readyState,task:!!e?.task,waiters:e?.bufferWaiters?.size||0,
 session:!!p?.session,localInput:e?.localInput?.size,overlaps:__race.overlaps,cancellations:__race.cancellations
}};
`;
const html=original.replace('const trackerMaintenanceTimer=',hook+'\nconst trackerMaintenanceTimer=').replace('await startMesh();','await startMesh();window.__ready=true;');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const browser=await require('playwright')[name].launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:name==='chromium'?['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required']:[],firefoxUserPrefs:{'media.autoplay.default':0}});
let page;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function check(label){result.checks.push(label);console.log('PASS',label)}
async function progressing(after){
 await page.waitForFunction(after=>{const s=__bufferState();return s.failed||s.error||s.time>after&&!s.paused&&s.localInput},after,{timeout:90000});
 const state=await page.evaluate(()=>__bufferState());assert.ok(!state.failed&&!state.error,state.failure||state.error);assert.equal(state.session,false);assert.equal(state.localInput,fs.statSync(fixture).size);return state;
}
try{
 page=await browser.newPage();page.on('pageerror',error=>result.errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/#local-buffer-lifetime`);await page.waitForFunction(()=>window.__ready);
 await page.locator('#harnessFile').setInputFiles(fixture);const cid=await page.evaluate(()=>__tracker.seed());
 await page.evaluate(cid=>{__tracker.openPreview(__tracker.catalog.get(cid))},cid);
 await progressing(3);let state=await page.evaluate(()=>__bufferState());assert.ok(state.overlaps>=4);check('local playback survives four native trim/converted-append overlaps');
 await progressing(20);state=await page.evaluate(()=>__bufferState());assert.ok(state.ahead>12);check('local playback continues through normal history eviction with a future buffer');
 await page.evaluate(()=>__bufferPause());await page.waitForFunction(()=>!__bufferState().task);
 const paused=await page.evaluate(()=>__bufferState());await delay(700);state=await page.evaluate(()=>__bufferState());assert.equal(state.paused,true);assert.equal(state.time,paused.time);await page.evaluate(()=>__tracker.p.media.play());await progressing(paused.time+.3);check('native pause remains effective after overlapping removals');
 await page.evaluate(()=>{__race.seek=80;__tracker.p.media.currentTime=60});await progressing(81);state=await page.evaluate(()=>__bufferState());assert.ok(state.cancellations>=1);assert.equal(state.waiters,0);check('seeking while removal is pending discards the obsolete converted section');
 await page.evaluate(()=>{__race.close=true;__tracker.p.media.currentTime=110});await page.waitForFunction(()=>!!__race.old);
 assert.equal(await page.evaluate(async()=>{await __race.old.releasePromise;return __race.old.bufferWaiters.size}),0);check('closing while removal is pending releases the worker and buffer waiters');
 await page.evaluate(cid=>{__tracker.openPreview(__tracker.catalog.get(cid))},cid);await progressing(1);
 await page.evaluate(()=>{const e=__tracker.p.compatProgressive;__tracker.p.media.currentTime=e.duration-6});
 await page.waitForFunction(()=>__bufferState().failed||__bufferState().readyState==='ended',null,{timeout:90000});state=await page.evaluate(()=>__bufferState());assert.ok(!state.failed,state.failure);assert.equal(state.readyState,'ended');
 await page.evaluate(()=>__tracker.p.media.currentTime=30);await progressing(31);check('endOfStream completes and a backwards seek reopens the local timeline');
 result.state=await page.evaluate(()=>__bufferState());assert.deepEqual(result.errors,[]);result.passed=true;await page.evaluate(()=>__tracker.cleanup());
}catch(error){result.failure=error.stack;if(page)result.state=await page.evaluate(()=>__bufferState()).catch(()=>null);throw error}
finally{const destination=process.env.RESULT||path.join(work,'result.json');fs.writeFileSync(destination,JSON.stringify(result,null,2));console.log('Evidence:',destination);await browser.close();server.close()}
