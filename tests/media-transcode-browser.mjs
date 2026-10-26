// Real FFmpeg/WASM + native media decoders, using owned localhost contexts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||path.join(root,'agent/mcp'),'package.json'));
const browserName=process.env.BROWSER||'chromium',work=fs.mkdtempSync(path.join(os.tmpdir(),'tracker-transcode-'));
const result={browser:browserName,checks:[],errors:[],fixtures:[]},delay=ms=>new Promise(r=>setTimeout(r,ms));
const original=fs.readFileSync(process.env.TRACKER_HTML||path.join(root,'index.html'),'utf8');result.appSha256=createHash('sha256').update(original).digest('hex');
const fixtures=[
  ['mpeg4-mp3.avi','mpeg4','libmp3lame'],
  ['h264-mp3.avi','libx264','libmp3lame'],
  ['odd-ffv1-pcm.avi','ffv1','pcm_s16le','testsrc=size=321x181:rate=24'],
  ['surround-ac3.avi','mpeg4','ac3','testsrc2=size=720x304:rate=24000/1001',{delay:.5,channels:6}],
  ['mpeg4-aac.mp4','mpeg4','aac'],
  ['h264-alac.mp4','libx264','alac'],
  ['mpeg2-mp2.mpg','mpeg2video','mp2'],
  ['native.mp4','libx264','aac'],
  ['song.wma',null,'wmav2'],
  ['song.aiff',null,'pcm_s16be'],
  ['adpcm.wav',null,'adpcm_ima_wav']
];
for(const [name,video,audio,source,options]of fixtures){
  const args=['-hide_banner','-loglevel','error','-y'];
  if(video)args.push('-f','lavfi','-i',source||'testsrc2=size=320x180:rate=24');
  if(options?.delay)args.push('-itsoffset',String(options.delay));
  args.push('-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8');
  if(video){args.push('-c:v',video);if(video==='libx264')args.push('-preset','ultrafast')}
  args.push('-c:a',audio);if(options?.channels)args.push('-ac',String(options.channels));args.push(path.join(work,name));execFileSync('ffmpeg',args,{stdio:'pipe'});
}
let hook=fs.readFileSync(path.join(root,'tests/streaming-hook.js'),'utf8');
hook+=`
initGlobalStorage=async()=>{};
window.__mediaTest={cleanup:cleanupPreview,dropCodec:async()=>{if(trackerFfmpegPromise){const ff=await trackerFfmpegPromise;ff.terminate();for(const url of ff.__trackerUrls||[])URL.revokeObjectURL(url);trackerFfmpegPromise=null}},full:()=>{compatProgressiveMime=()=>''},rejectMp4:()=>{const set=setCompatPlaybackBlob;setCompatPlaybackBlob=async(p,blob,mime)=>{if(mime==='video/mp4')throw Error('test: MP4 decoder unavailable');return set(p,blob,mime)}},state:()=>{
 const p=activePreview,e=p?.compatProgressive,m=p?.media;
 return {name:p?.name,mode:p?.mode,ready:p?.compatPlaybackReady,transcoded:p?.compatTranscoded,sections:e?.sectionsEncoded,failed:e?.failed,logs:e?.job?.logs,time:m?.currentTime,duration:m?.duration,paused:m?.paused,width:m?.videoWidth,height:m?.videoHeight,frames:m?.getVideoPlaybackQuality?.().totalVideoFrames,error:m?.error?.message,ranges:m?Array.from({length:m.buffered.length},(_,i)=>[m.buffered.start(i),m.buffered.end(i)]):[],stage:document.querySelector('#previewStage').textContent,src:m?.src};
}};
`;
const html=original.replace('const trackerMaintenanceTimer=',hook+'\nconst trackerMaintenanceTimer=').replace('await startMesh();','await startMesh();window.__ready=true;');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await require('playwright')[browserName].launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:browserName==='chromium'?['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required']:[],firefoxUserPrefs:{'media.autoplay.default':0}});
let page;
function check(label){result.checks.push(label);console.log('PASS',label)}
async function open(name){
  await page.locator('#harnessFile').setInputFiles(path.join(work,name));const cid=await page.evaluate(()=>__tracker.seed());
  await page.evaluate(cid=>{__tracker.openPreview(__tracker.catalog.get(cid))},cid);
  await page.waitForFunction(()=>{const s=__mediaTest.state();return s.time>1&&!s.paused&&!s.error&&(s.name.endsWith('.wma')||s.name.endsWith('.aiff')||s.name.endsWith('.wav')||s.frames>10)},null,{timeout:90000});
  const before=await page.evaluate(()=>__mediaTest.state());await delay(500);const after=await page.evaluate(()=>__mediaTest.state());assert.ok(after.time>before.time+.1);
  if(after.frames!==undefined)assert.ok(after.frames>before.frames);result.fixtures.push(after);return {cid,state:after};
}
try{
  page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/#media-transcode-test`);await page.waitForFunction(()=>window.__ready);
  for(const [name]of fixtures){
    const {cid,state}=await open(name);
    if(name==='native.mp4')assert.equal(state.mode,'buffer');
    else if(!['h264-alac.mp4','adpcm.wav'].includes(name))assert.equal(state.mode,'compat');
    if(name==='mpeg4-mp3.avi'){
      await page.evaluate(()=>__tracker.closePreview());await delay(500);const held=await page.evaluate(()=>__mediaTest.state());await delay(500);assert.equal((await page.evaluate(()=>__mediaTest.state())).time,held.time);
      await page.evaluate(cid=>__tracker.openPreview(__tracker.catalog.get(cid)),cid);await page.waitForFunction(t=>__mediaTest.state().time>t+.25,held.time);
      await page.evaluate(()=>__tracker.p.media.currentTime=5);await page.waitForFunction(()=>__mediaTest.state().time>5.25&&!__mediaTest.state().paused);
      check('AVI pauses, resumes the same player and seeks into unconverted media');
    }
    if(name==='surround-ac3.avi'){
      await page.waitForFunction(()=>__mediaTest.state().time>3.25&&!__mediaTest.state().paused);
      const continuous=await page.evaluate(()=>__mediaTest.state());assert.equal(continuous.ranges.length,1);assert.ok(continuous.frames>60);
      check('delayed 5.1 AC-3 input stays continuous across converted section boundaries');
    }
    const rms=await page.evaluate(async()=>{
      const context=new AudioContext(),source=context.createMediaElementSource(__tracker.p.media),analyser=context.createAnalyser();source.connect(analyser);analyser.connect(context.destination);await context.resume();
      const wave=new Float32Array(analyser.fftSize);let max=0;
      for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,20));analyser.getFloatTimeDomainData(wave);max=Math.max(max,Math.sqrt(wave.reduce((n,v)=>n+v*v,0)/wave.length))}
      source.disconnect();await context.close();return max;
    });
    result.fixtures.at(-1).audioRms=rms;assert.ok(rms>.01,name+' must include audible decoded audio');
    check(name+' produces advancing decoded playback and audible audio');await page.evaluate(()=>__mediaTest.cleanup());
  }
  // The fallback must retry when encoding works but this browser rejects the output.
  await page.evaluate(()=>{__mediaTest.full();__mediaTest.rejectMp4()});
  const full=await open('odd-ffv1-pcm.avi');assert.equal(full.state.transcoded,true);assert.equal(await page.evaluate(async()=>(await fetch(__tracker.p.compatObjectUrl)).headers.get('content-type')),'video/webm');check('full conversion retries WebM after MP4 decoder rejection');await page.evaluate(()=>__mediaTest.cleanup());
  // Fail the primary core asset while allowing the independent pinned mirror.
  await page.evaluate(()=>__mediaTest.dropCodec());let blocked=0,mirror=0;
  page.on('request',r=>{if(r.url().startsWith('https://unpkg.com/@ffmpeg/'))mirror++});
  await page.route('https://cdn.jsdelivr.net/npm/@ffmpeg/**',r=>{blocked++;return r.fulfill({status:503,body:'test: primary CDN unavailable'})});
  const failover=await open('song.wma');assert.equal(failover.state.transcoded,true);assert.ok(blocked>0);assert.ok(mirror>0);check('codec loading recovers through the alternate CDN');
  assert.deepEqual(result.errors,[]);result.passed=true;
}catch(error){result.failure=error.stack;if(page)result.state=await page.evaluate(()=>__mediaTest?.state()).catch(()=>null);throw error}
finally{fs.writeFileSync(process.env.RESULT||path.join(work,'result.json'),JSON.stringify(result,null,2));console.log('Evidence:',process.env.RESULT||path.join(work,'result.json'));await browser.close();server.close()}
