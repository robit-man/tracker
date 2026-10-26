// Sustained native File playback. No peers or network transfer sessions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(new URL('..',import.meta.url).pathname),work=fs.mkdtempSync(path.join(os.tmpdir(),'tracker-avi-local-'));
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||path.join(root,'agent/mcp'),'package.json'));
const browserName=process.env.BROWSER||'chromium',seconds=Number(process.env.DURATION_SECONDS)||70;
const fixture=process.argv[2]||path.join(work,'long-local.avi');
if(!process.argv[2])execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=720x304:rate=24000/1001','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','300','-c:v','mpeg4','-bf','2','-q:v','4','-vtag','XVID','-c:a','ac3','-ac','6','-b:a','384k',fixture],{stdio:'pipe'});
const original=fs.readFileSync(process.env.TRACKER_HTML||path.join(root,'index.html'),'utf8');
const result={browser:browserName,appSha256:createHash('sha256').update(original).digest('hex'),fixtureSize:fs.statSync(fixture).size,seconds,errors:[],samples:[],checks:[]};
let hook=fs.readFileSync(path.join(root,'tests/streaming-hook.js'),'utf8');
hook+=`
initGlobalStorage=async()=>{};__tracker.cleanup=cleanupPreview;
window.__nativePause=()=>{const p=activePreview;p.media.pause();wakeCompatTranscode(p);playbackWatchdogTick();return p.media.paused};
window.__localState=()=>{const p=activePreview,e=p?.compatProgressive,m=p?.media;return {
 time:m?.currentTime,duration:m?.duration,paused:m?.paused,frames:m?.getVideoPlaybackQuality?.().totalVideoFrames,error:m?.error?.message,ahead:streamBufferedAhead(p),next:e?.nextTime,sections:e?.sectionsEncoded,task:!!e?.task,failed:e?.failed,failure:e?.failureMessage,speed:e?.encodeServicePerSecond?1/e.encodeServicePerSecond:0,localInput:e?.localInput?.size,session:!!p?.session,src:m?.src
}};
`;
const html=original.replace('const trackerMaintenanceTimer=',hook+'\nconst trackerMaintenanceTimer=').replace('await startMesh();','await startMesh();window.__ready=true;');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await require('playwright')[browserName].launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:browserName==='chromium'?['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required']:[],firefoxUserPrefs:{'media.autoplay.default':0}});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let page;
function check(label){result.checks.push(label);console.log('PASS',label)}
try{
 page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/#local-avi-buffer`);await page.waitForFunction(()=>window.__ready);
 await page.locator('#harnessFile').setInputFiles(fixture);const cid=await page.evaluate(()=>__tracker.seed()),opened=Date.now();
 await page.evaluate(cid=>{__tracker.openPreview(__tracker.catalog.get(cid))},cid);
 await page.waitForFunction(()=>__localState().time>.1&&!__localState().paused,null,{timeout:90000});result.startupSeconds=(Date.now()-opened)/1000;
 for(let attempt=0;attempt<3;attempt++){
  assert.equal(await page.evaluate(()=>__nativePause()),true,'a native pause must survive an immediate watchdog tick');
  await page.waitForFunction(()=>!__localState().task);const held=await page.evaluate(()=>__localState());await delay(800);const still=await page.evaluate(()=>__localState());assert.equal(still.paused,true);assert.equal(still.time,held.time);assert.equal(still.sections,held.sections);
  await page.evaluate(()=>__tracker.p.media.play());await page.waitForFunction(t=>__localState().time>t+.2,held.time);
 }
 check('native pause stays paused through watchdog ticks and conversion completion');
 const first=await page.evaluate(()=>__localState()),started=Date.now();assert.ok(first.duration>seconds+40,'use an AVI longer than the observation and its future buffer');
 while(Date.now()-started<seconds*1000){await delay(1000);const s=await page.evaluate(()=>__localState());s.wall=(Date.now()-started)/1000;result.samples.push(s);if(result.samples.length%10===0)console.log(JSON.stringify({wall:s.wall,time:s.time,ahead:s.ahead,speed:s.speed,sections:s.sections}));assert.equal(s.session,false);assert.equal(s.localInput,result.fixtureSize);assert.ok(!s.error&&!s.failed,s.failure||s.error)}
 const last=result.samples.at(-1),steady=result.samples.filter(s=>s.wall>=10);
 result.minimumAhead=Math.min(...steady.map(s=>s.ahead));const speeds=steady.map(s=>s.speed).sort((a,b)=>a-b);result.medianConversionSpeed=speeds[Math.floor(speeds.length/2)];
 assert.ok(last.time-first.time>=last.wall-2,'local playback must keep advancing across the whole observation');assert.ok(last.frames>first.frames+seconds*15);
 assert.ok(result.minimumAhead>=12,'the converter must maintain a future playable horizon');assert.ok(result.medianConversionSpeed>1.1,'measured conversion must be faster than realtime');check('sustained local playback maintains a future buffer and converts faster than realtime');
 await page.evaluate(()=>__tracker.p.media.currentTime=120);await page.waitForFunction(()=>__localState().time>121&&!__localState().paused);
 const sought=await page.evaluate(()=>__localState());assert.ok(sought.next<160);assert.equal(sought.src,first.src);check('an unbuffered seek converts the selected window in the same local player');
 await page.evaluate(()=>__tracker.p.media.currentTime=30);await page.waitForFunction(()=>__localState().time>31&&!__localState().paused);assert.ok((await page.evaluate(()=>__localState())).next<70);check('backwards seeking resumes local playback without repeated decoder resets');
 await page.evaluate(()=>__tracker.closePreview());await page.waitForFunction(()=>!__localState().task);const held=await page.evaluate(()=>__localState());await delay(1000);const paused=await page.evaluate(()=>__localState());assert.equal(paused.time,held.time);assert.equal(paused.sections,held.sections);
 await page.evaluate(cid=>__tracker.openPreview(__tracker.catalog.get(cid)),cid);await page.waitForFunction(t=>__localState().time>t+.5,held.time);assert.equal((await page.evaluate(()=>__localState())).src,first.src);check('pause and Resume preserve the local player and restart its converter');
 await page.evaluate(()=>__tracker.cleanup());assert.deepEqual(result.errors,[]);result.passed=true;
}catch(error){result.failure=error.stack;if(page)result.state=await page.evaluate(()=>__localState()).catch(()=>null);throw error}
finally{fs.writeFileSync(process.env.RESULT||path.join(work,'result.json'),JSON.stringify(result,null,2));console.log('Evidence:',process.env.RESULT||path.join(work,'result.json'));await browser.close();server.close()}
