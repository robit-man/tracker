// Real display capture plus synthetic camera/microphone input, through public
// room brokers. Fault injection touches receiver admission, never the carriers.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||process.cwd(),'package.json')),{chromium,firefox}=require('playwright');
const site='https://robit-man.github.io/tracker/',resultPath=process.env.RESULT||'/tmp/live-stream-routes.json',result={htmlOverride:!!process.env.TRACKER_HTML,relayOnly:process.env.RELAY_ONLY==='1',directHarness:process.env.DIRECT_HARNESS==='1',firefoxViewer:process.env.FIREFOX_VIEWER==='1',firefoxSource:process.env.FIREFOX_SOURCE==='1',mp4Only:process.env.MP4_ONLY==='1',errors:[],modes:[]};
let html=process.env.TRACKER_HTML&&fs.readFileSync(process.env.TRACKER_HTML,'utf8');
if(html)html=html.replace('const trackerMaintenanceTimer=',`
window.__liveFault={drop:null,blocked:false,rescues:0};
const originalLiveReceive=handleLiveChunkBinary,originalLiveRequest=liveChunkRequest;
handleLiveChunkBinary=async function(packet,context,w){const f=window.__liveFault;if(context.metadata.idx===f.drop&&!f.rescues){f.blocked=true;return}return originalLiveReceive(packet,context,w)};
liveChunkRequest=function(v,indexes,rescue){if(rescue&&indexes.includes(window.__liveFault.drop))window.__liveFault.rescues++;return originalLiveRequest(v,indexes,rescue)};
const trackerMaintenanceTimer=`);
if(result.mp4Only){assert.ok(html,'codec negotiation test requires TRACKER_HTML');html=html.replace('relayMimes:liveRecorderMimes(localLive.mode,localLive.stream)','relayMimes:liveRecorderMimes(localLive.mode,localLive.stream).filter(m=>m.includes("/mp4"))')}
if(result.directHarness){assert.ok(html,'direct harness requires TRACKER_HTML');html=html.replace('const trackerMaintenanceTimer=',fs.readFileSync(new URL('./streaming-hook.js',import.meta.url),'utf8')+'\nstartNats=startNkn=startMqttRelay=startNostrRelay=async()=>false;\nconst trackerMaintenanceTimer=').replace('await startMesh();','await startMesh();window.__ready=true;')}
const delay=ms=>new Promise(r=>setTimeout(r,ms)),display=String(200+process.pid%1000),xvfb=spawn('Xvfb',[':'+display,'-screen','0','1280x720x24','-nolisten','tcp'],{stdio:'ignore'});let browser,receiverBrowser,captureBrowser,source,viewer,progressTimer;
// Produce a known non-silent 440 Hz microphone fixture without another package.
const rate=48000,n=rate*2,wav=Buffer.alloc(44+n*2);wav.write('RIFF');wav.writeUInt32LE(36+n*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)wav.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*440*i/rate)),44+i*2);fs.writeFileSync(resultPath+'.wav',wav);
async function snapshot(p){return p.evaluate(()=>{const el=document.querySelector('#liveViewerStage video,audio');return{live:PrivateTrackerMesh.live(),route:document.querySelector('#liveViewerRoute').textContent,time:el?.currentTime,paused:el?.paused,ready:el?.readyState,width:el?.videoWidth,error:el?.error?.message,fault:window.__liveFault,backlog:PrivateTrackerMesh.writeBacklog(),buffered:el?Array.from({length:el.buffered.length},(_,i)=>[el.buffered.start(i),el.buffered.end(i)]):[]}})}
try{
 for(let i=0;i<100&&!fs.existsSync('/tmp/.X11-unix/X'+display);i++)await delay(100);
 browser=await chromium.launch({headless:false,env:{...process.env,DISPLAY:':'+display},args:['--no-sandbox','--disable-gpu','--auto-select-desktop-capture-source=screen','--enable-usermedia-screen-capturing','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+resultPath+'.wav','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 if(result.firefoxViewer)receiverBrowser=await firefox.launch({headless:true,...(process.env.FIREFOX_BINARY?{executablePath:process.env.FIREFOX_BINARY}:{}),firefoxUserPrefs:{'media.autoplay.default':0,'media.autoplay.block-webaudio':false,'layers.acceleration.disabled':true}});
 if(result.firefoxSource)captureBrowser=await firefox.launch({headless:false,env:{...process.env,DISPLAY:':'+display},...(process.env.FIREFOX_BINARY?{executablePath:process.env.FIREFOX_BINARY}:{}),firefoxUserPrefs:{'media.navigator.streams.fake':true,'media.navigator.permission.disabled':true,'media.autoplay.default':0,'layers.acceleration.disabled':true}});
 const contexts=await Promise.all([(captureBrowser||browser).newContext(result.firefoxSource?{}:{permissions:['camera','microphone']}),(receiverBrowser||browser).newContext()]);
 // Keep the calibration tone intact; real browser capture/encoding is used,
 // with microphone processing disabled only for this synthetic test device.
 await contexts[0].addInitScript(()=>{const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=c=>get({...c,audio:c.audio?{...(typeof c.audio==='object'?c.audio:{}),echoCancellation:false,noiseSuppression:false,autoGainControl:false}:false})});
 for(const c of contexts){if(html)await c.route(site,r=>r.fulfill({contentType:'text/html',body:html}));if(result.relayOnly)await c.addInitScript(()=>{const Native=window.RTCPeerConnection;window.RTCPeerConnection=new Proxy(Native,{construct(target,args){return new target({...args[0],iceTransportPolicy:'relay',iceServers:[]})}})})}
 [source,viewer]=await Promise.all(contexts.map(c=>c.newPage()));for(const[role,p]of[['source',source],['viewer',viewer]])p.on('pageerror',e=>result.errors.push({role,message:e.message}));
 await source.goto(site,{waitUntil:'domcontentloaded'});await source.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—');result.url=source.url();await viewer.goto(result.url,{waitUntil:'domcontentloaded'});
 if(result.directHarness){
  await Promise.all([source,viewer].map(p=>p.waitForFunction(()=>window.__ready)));
  const actors=await Promise.all([source,viewer].map(p=>p.evaluate(()=>__tracker.actor)));
  await viewer.evaluate(remote=>__tracker.rtc(remote,false),actors[0]);const offer=await source.evaluate(remote=>__tracker.rtc(remote,true),actors[1]);
  const answer=await viewer.evaluate(async offer=>{await __pc.setRemoteDescription(offer);await __pc.setLocalDescription(await __pc.createAnswer());await new Promise(r=>{if(__pc.iceGatheringState==='complete')r();else __pc.addEventListener('icegatheringstatechange',()=>{if(__pc.iceGatheringState==='complete')r()})});return __pc.localDescription.toJSON()},offer);await source.evaluate(answer=>__pc.setRemoteDescription(answer),answer);await Promise.all([source,viewer].map(p=>p.waitForFunction(()=>window.__rtcReady)));
  await source.locator('#harnessFile').setInputFiles(process.env.FIXTURE||'/tmp/tracker-stream-test/faststart.mp4');const cid=await source.evaluate(()=>__tracker.seed());await viewer.waitForFunction(cid=>__tracker.catalog.has(cid),cid);await viewer.evaluate(cid=>__tracker.openPreview(__tracker.catalog.get(cid)),cid);
  await viewer.waitForFunction(()=>__tracker.p?.media?.currentTime>3,null,{timeout:90000});result.fileBefore=await viewer.evaluate(()=>{__tracker.p.media.muted=true;return __tracker.stats()});
 }

 progressTimer=setInterval(async()=>{try{console.log('STATE',JSON.stringify({source:await snapshot(source),viewer:await snapshot(viewer)}))}catch(_){}},10000);
 for(const mode of (process.env.MODES||'screen,av,audio').split(',')){
  const report={mode,samples:[]};result.modes.push(report);console.log('START',mode);
  if(mode==='screen')await source.locator('#screenShareBtn').click();else{await source.locator('#liveMediaBtn').click();await source.locator(`[data-live-mode="${mode}"]`).click()}
  await source.locator('#liveViewerModal.show').waitFor({timeout:20000});report.capture=await source.locator('#liveViewerStage video,audio').evaluate(v=>v.srcObject.getTracks().map(t=>({kind:t.kind,settings:t.getSettings()})));if(mode==='screen')assert.equal(report.capture[0].settings.displaySurface,'monitor');await source.locator('#liveViewerClose').click();
  await viewer.locator('[data-live-watch]').waitFor({timeout:90000});if(result.directHarness)await viewer.locator('[data-live-watch]').evaluate(b=>b.click());else await viewer.locator('[data-live-watch]').click();await viewer.waitForFunction(()=>{const e=document.querySelector('#liveViewerStage video,audio');return e?.currentTime>1&&!e.paused},null,{timeout:90000});report.start=await snapshot(viewer);assert.equal(report.start.live.viewer.chunked,true);assert.equal(report.start.live.viewer.mediaPc,false);const relayId=report.start.live.viewer.relayId;
  await delay(4500);
  if(html){await viewer.evaluate(()=>{__liveFault.drop=PrivateTrackerMesh.live().viewer.head+1;__liveFault.rescues=0;__liveFault.blocked=false});await viewer.waitForFunction(()=>__liveFault.blocked&&__liveFault.rescues>0&&PrivateTrackerMesh.live().viewer.next>__liveFault.drop,null,{timeout:30000});report.repair=await snapshot(viewer);assert.equal(report.repair.live.viewer.relayId,relayId,'missing chunk is repaired without encoder/MSE restart');}
  const before=await snapshot(viewer);await delay(5000);const after=await snapshot(viewer);assert.ok(after.time>before.time+3,'steady playback advances');assert.ok(!after.error);report.steady={before,after};
  if(mode==='av'||mode==='audio'){
   report.audio=await viewer.evaluate(async()=>{const e=document.querySelector('#liveViewerStage video,audio'),ctx=new AudioContext(),input=ctx.createMediaElementSource(e),an=ctx.createAnalyser();input.connect(an);an.connect(ctx.destination);await ctx.resume();let peak=0;for(let i=0;i<20;i++){const a=new Float32Array(an.fftSize);an.getFloatTimeDomainData(a);peak=Math.max(peak,...a.map(Math.abs));await new Promise(r=>setTimeout(r,50))}await ctx.close();return{peak}});assert.ok(report.audio.peak>.01,'known microphone tone is decoded at the receiver');
  }
  // A complete network outage cannot preserve a live buffer indefinitely; the
  // requirement here is recovery over the SAME byte stream after reconnecting.
  if(mode==='screen'&&!result.directHarness){
   await contexts[1].setOffline(true);await delay(Number(process.env.OUTAGE_MS)||6000);report.outage=await snapshot(viewer);await contexts[1].setOffline(false);const old=report.outage.time;
   await viewer.waitForFunction(old=>{const e=document.querySelector('#liveViewerStage video');return e.currentTime>old+3&&!e.paused},old,{timeout:60000});report.recovered=await snapshot(viewer);assert.equal(report.recovered.live.viewer.relayId,relayId,'disconnect recovery preserves the recorder and stream generation');
  }
  report.publisher=await snapshot(source);assert.ok(report.publisher.live.publisher.viewers.every(x=>x.chunked&&!x.mediaPc),'no live media PeerConnection on the source');assert.ok(report.publisher.live.publisher.viewers.every(x=>x.retainedBytes+x.queuedBytes<=64*1024*1024));report.end=await snapshot(viewer);report.passed=true;console.log('PASS',mode,JSON.stringify({start:report.start.time,end:report.end.time,path:report.end.route,repair:report.repair?.fault,audio:report.audio}));
  await source.locator('[data-live-stop]').click();await viewer.locator('#liveViewerModal').waitFor({state:'hidden',timeout:20000});await delay(500);
 }
 if(result.directHarness){result.fileAfter=await viewer.evaluate(()=>__tracker.stats());assert.ok(result.fileAfter.time>result.fileBefore.time+10,'file playback continues alongside all live modes');assert.ok(!result.fileAfter.mediaError);assert.ok(result.modes.every(m=>m.end.live.viewer.paths.some(p=>p.path==='direct:harness-rtc'&&p.strong)),'live capture uses the file-proven data route')}assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=e.message;result.sourceFailure=await snapshot(source).catch(()=>null);result.viewerFailure=await snapshot(viewer).catch(()=>null);throw e}finally{clearInterval(progressTimer);fs.writeFileSync(resultPath,JSON.stringify(result,null,2));await captureBrowser?.close();await receiverBrowser?.close();await browser?.close();xvfb.kill()}
