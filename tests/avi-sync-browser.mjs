// Compare clocks embedded in decoded pixels and audio, rather than player time.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(new URL('..',import.meta.url).pathname),work=fs.mkdtempSync(path.join(os.tmpdir(),'tracker-avi-sync-'));
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||path.join(root,'agent/mcp'),'package.json'));
const browserName=process.env.BROWSER||'chromium',seconds=Number(process.env.DURATION_SECONDS)||120,fixture=process.argv[2]||path.join(work,'clock.avi'),control=path.join(work,'control.mp4');
if(!process.argv[2]){
 const filters=['drawbox=x=0:y=0:w=720:h=32:color=black:t=fill'];
 for(let bit=0;bit<16;bit++)filters.push(`drawbox=x=${bit*45}:y=0:w=45:h=32:color=white:t=fill:enable='bitand(floor(mod(t,60)*1000),${2**bit})'`);
 const chirp="aevalsrc='0.15*sin(2*PI*(440*mod(t,60)+128*mod(t,60)*mod(t,60)))':s=48000";
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=720x304:rate=24000/1001','-f','lavfi','-i',chirp,'-t',String(Math.max(150,seconds+30)),'-vf',filters.join(','),'-c:v','mpeg4','-bf','2','-q:v','4','-vtag','XVID','-c:a','ac3','-ac','6','-b:a','384k',fixture],{stdio:'pipe'});
}
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',fixture,'-t','8','-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-ar','48000','-b:a','160k','-movflags','+faststart',control],{stdio:'pipe'});
const original=fs.readFileSync(process.env.TRACKER_HTML||path.join(root,'index.html'),'utf8');
const result={browser:browserName,appSha256:createHash('sha256').update(original).digest('hex'),seconds,checks:[],errors:[],phases:[]};
let hook=fs.readFileSync(path.join(root,'tests/streaming-hook.js'),'utf8');hook+='\ninitGlobalStorage=async()=>{};';
const html=original.replace('const trackerMaintenanceTimer=',hook+'\nconst trackerMaintenanceTimer=').replace('await startMesh();','await startMesh();window.__ready=true;');
const server=http.createServer((req,res)=>{if(req.url==='/control.mp4'){res.setHeader('Content-Type','video/mp4');res.end(fs.readFileSync(control))}else{res.setHeader('Content-Type','text/html');res.end(html)}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await require('playwright')[browserName].launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:browserName==='chromium'?['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required']:[],firefoxUserPrefs:{'media.autoplay.default':0}});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),median=a=>{const s=a.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)]};
let page;
async function startMeter(selector){await page.evaluate(async selector=>{
 const media=document.querySelector(selector);if(window.__syncMeter)await __syncMeter.context.close();
 // The clock chirp reaches 16 kHz. A host's 8 kHz headset default removes it
 // after 14 seconds, so measurement must use the fixture's 48 kHz sample rate.
 const context=new AudioContext({sampleRate:48000}),source=context.createMediaElementSource(media),analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0;source.connect(analyser);analyser.connect(context.destination);await context.resume();
 const canvas=document.createElement('canvas');canvas.width=720;canvas.height=32;const g=canvas.getContext('2d',{willReadFrequently:true}),frequencies=new Float32Array(analyser.frequencyBinCount);
 const meter=window.__syncMeter={context,media,rows:[],started:performance.now(),active:true};
 const frame=(_now,metadata)=>{
  if(!meter.active)return;g.drawImage(media,0,0,media.videoWidth,32,0,0,720,32);const pixels=g.getImageData(0,16,720,1).data;let clock=0;
  for(let bit=0;bit<16;bit++)if(pixels[(bit*45+22)*4]>128)clock+=2**bit;
  analyser.getFloatFrequencyData(frequencies);let peak=1;for(let i=2;i<frequencies.length-1;i++)if(frequencies[i]>frequencies[peak])peak=i;
  const left=frequencies[peak-1],mid=frequencies[peak],right=frequencies[peak+1],d=(left-right)/(2*(left-2*mid+right)),hz=(peak+(Number.isFinite(d)?Math.max(-.5,Math.min(.5,d)):0))*context.sampleRate/analyser.fftSize;
  const video=clock/1000,audio=(hz-440)/256,delta=((audio-video+90)%60)-30;
  meter.rows.push({wall:(performance.now()-meter.started)/1000,time:media.currentTime,pts:metadata.mediaTime,video,audio,delta,db:mid});media.requestVideoFrameCallback(frame);
 };media.requestVideoFrameCallback(frame);
},selector)}
async function phase(label,duration){
 await page.evaluate(()=>{__syncMeter.rows=[];__syncMeter.started=performance.now()});await delay(duration*1000);
 const rows=await page.evaluate(()=>__syncMeter.rows),valid=rows.filter(x=>x.wall>1&&x.video>.5&&x.video<59.5&&x.audio>.1&&x.audio<59.9&&x.db>-60);
 assert.ok(valid.length>duration*8,label+' must provide decoded video and audible clock samples');
 const bins=[];for(let at=0;at<duration;at+=10){const a=valid.filter(x=>x.wall>=at&&x.wall<at+10);if(a.length>10)bins.push({wall:at,offset:median(a.map(x=>x.delta))})}
 const summary={label,medianOffset:median(valid.map(x=>x.delta)),bins,rows};result.phases.push(summary);console.log(label,JSON.stringify({medianOffset:summary.medianOffset,bins}));return summary;
}
function aligned(phase,reference){
 const maxError=Math.max(...phase.bins.map(x=>Math.abs(x.offset-reference))),drift=phase.bins.at(-1).offset-phase.bins[0].offset;
 phase.maximumOffsetFromControl=maxError;phase.drift=drift;assert.ok(maxError<.12,phase.label+' must preserve A/V alignment within 120 ms of the native control');assert.ok(Math.abs(drift)<.08,phase.label+' must not accumulate more than 80 ms of drift');
}
try{
 page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/#avi-sync-test`);await page.waitForFunction(()=>window.__ready);
 await page.evaluate(async()=>{const video=document.createElement('video');video.id='syncControl';video.src='/control.mp4';document.body.append(video);await video.play()});await startMeter('#syncControl');const controlPhase=await phase('native control',5);await page.evaluate(()=>{__syncMeter.active=false;document.querySelector('#syncControl').pause()});
 await page.locator('#harnessFile').setInputFiles(fixture);const cid=await page.evaluate(()=>__tracker.seed());await page.evaluate(cid=>{__tracker.openPreview(__tracker.catalog.get(cid))},cid);
 await page.waitForFunction(()=>__tracker.p.media.currentTime>1&&!__tracker.p.media.paused);assert.equal(await page.evaluate(()=>!!__tracker.p.session),false);await startMeter('#previewStage video');
 aligned(await phase('uninterrupted AVI',seconds),controlPhase.medianOffset);result.checks.push('decoded audio and visual clocks stay aligned during uninterrupted local playback');
 for(const time of [75,15]){await page.evaluate(time=>__tracker.p.media.currentTime=time,time);await page.waitForFunction(time=>__tracker.p.media.currentTime>time+1&&!__tracker.p.media.paused,time);aligned(await phase('seek '+time,8),controlPhase.medianOffset)}
 result.checks.push('forward and backward seeks retain the original A/V alignment');assert.deepEqual(result.errors,[]);result.passed=true;
}catch(error){result.failure=error.stack;if(page)result.state=await page.evaluate(()=>{const p=__tracker.p,m=p?.media,e=p?.compatProgressive;return{time:m?.currentTime,paused:m?.paused,seeking:m?.seeking,ready:m?.readyState,failed:e?.failed,failure:e?.failureMessage,working:!!e?.task,next:e?.nextTime,done:e?.done,ranges:m?Array.from({length:m.buffered.length},(_,i)=>[m.buffered.start(i),m.buffered.end(i)]):[]}}).catch(()=>null);throw error}
finally{if(page)await page.evaluate(()=>{if(window.__syncMeter)__syncMeter.active=false}).catch(()=>{});fs.writeFileSync(process.env.RESULT||path.join(work,'result.json'),JSON.stringify(result,null,2));console.log('Evidence:',process.env.RESULT||path.join(work,'result.json'));await browser.close();server.close()}
