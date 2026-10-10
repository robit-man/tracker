// Glass-to-glass timing: a clock barcode is captured through getDisplayMedia,
// encoded, sent through real public brokers, decoded and read from video pixels.
// Both browsers use the host clock, so no cross-device clock offset is inferred.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||process.cwd(),'package.json')),{chromium,firefox}=require('playwright');
const site='https://robit-man.github.io/tracker/',out=process.env.RESULT||'/tmp/live-latency.json',result={htmlOverride:!!process.env.TRACKER_HTML,firefoxViewer:process.env.FIREFOX_VIEWER==='1',errors:[]};
let html=process.env.TRACKER_HTML&&fs.readFileSync(process.env.TRACKER_HTML,'utf8');
// A serial receiver admission gate models a constrained last mile while using
// actual encrypted relay payloads. Each epoch has its own obsolete-work guard.
if(html)html=html.replace('const trackerMaintenanceTimer=',`window.__liveLink={bps:Infinity,until:0,epoch:0,pending:new Set()};const realLiveBinary=handleLiveChunkBinary;handleLiveChunkBinary=async function(packet,c,w){const l=window.__liveLink,epoch=c.metadata.seekEpoch;if(c.metadata.id!==activeLiveViewer?.relayId)return;if(epoch!==l.epoch){l.epoch=epoch;l.until=performance.now();l.pending.clear()}const key=c.metadata.idx;if(l.pending.has(key))return;l.pending.add(key);if(Number.isFinite(l.bps)){const at=performance.now();l.until=Math.max(at,l.until)+packet.byteLength/l.bps*1000;await new Promise(r=>setTimeout(r,Math.max(0,l.until-at)));if(l.epoch!==epoch)return}l.pending.delete(key);return realLiveBinary(packet,c,w)};const trackerMaintenanceTimer=`);
const display=String(200+process.pid%1000),xvfb=spawn('Xvfb',[':'+display,'-screen','0','1280x720x24','-nolisten','tcp'],{stdio:'ignore'}),delay=ms=>new Promise(r=>setTimeout(r,ms));let publisherBrowser,receiverBrowser,source,viewer,clock;
async function status(p){return p.evaluate(()=>PrivateTrackerMesh.live())}
async function readDelay(){return viewer.evaluate(()=>{
 const v=document.querySelector('#liveViewerStage video');if(!v?.videoWidth||v.paused)return null;
 const c=window.__clockRead||(window.__clockRead=document.createElement('canvas'));c.width=v.videoWidth;c.height=v.videoHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(v,0,0);
 const y=Math.floor(v.videoHeight/3),a=x.getImageData(0,y,c.width,1).data;let start=-1;
 for(let i=0;i<c.width;i++)if(a[i*4]>180&&a[i*4+1]<80&&a[i*4+2]>180){start=i;break}const scale=v.videoWidth/1280;if(start<0||start+1000*scale>c.width)return null;
 let tick=0;for(let i=0;i<24;i++){const k=(start+Math.floor((60+i*40)*scale))*4;tick=tick*2+(a[k]+a[k+1]+a[k+2]>384?1:0)}
 const now=Math.floor(Date.now()/10)%2**24,ms=((now-tick+2**24)%2**24)*10;return{ms,start,tick,now,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,playbackRate:v.playbackRate,live:PrivateTrackerMesh.live().viewer};
})}
async function sample(name,seconds){const samples=[],until=Date.now()+seconds*1000;while(Date.now()<until){const s=await readDelay();if(s&&s.ms<60000)samples.push(s);else if(samples.length===0)console.log('CLOCK_READ',JSON.stringify(s));await delay(250)}assert.ok(samples.length>seconds,'clock pixels are decoded');const sorted=samples.map(x=>x.ms).sort((a,b)=>a-b),report={samples,median:sorted[Math.floor(sorted.length/2)],p90:sorted[Math.floor(sorted.length*.9)],publisher:await status(source)};result[name]=report;console.log(name,JSON.stringify({median:report.median,p90:report.p90,publisher:report.publisher}));return report}
try{
 for(let i=0;i<100&&!fs.existsSync('/tmp/.X11-unix/X'+display);i++)await delay(100);
 publisherBrowser=await chromium.launch({headless:false,env:{...process.env,DISPLAY:':'+display},args:['--no-sandbox','--disable-gpu','--window-size=1280,720','--window-position=0,0','--auto-select-desktop-capture-source=screen','--enable-usermedia-screen-capturing','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 receiverBrowser=await (result.firefoxViewer?firefox:chromium).launch({headless:true,...(result.firefoxViewer?{executablePath:process.env.FIREFOX_BINARY||'/home/roko/.cache/ms-playwright/firefox-1532/firefox/firefox',firefoxUserPrefs:{'media.autoplay.default':0,'layers.acceleration.disabled':true}}:{args:['--disable-gpu','--autoplay-policy=no-user-gesture-required']})});
 const contexts=await Promise.all([publisherBrowser.newContext({viewport:{width:1280,height:620}}),receiverBrowser.newContext()]);
 for(const c of contexts){if(html)await c.route(site,r=>r.fulfill({contentType:'text/html',body:html}));await c.addInitScript(()=>{const RTC=window.RTCPeerConnection;window.RTCPeerConnection=new Proxy(RTC,{construct(t,a){return new t({...a[0],iceTransportPolicy:'relay',iceServers:[]})}})})}
 [source,viewer]=await Promise.all(contexts.map(c=>c.newPage()));for(const [role,p]of [['source',source],['viewer',viewer]])p.on('pageerror',e=>result.errors.push({role,message:e.message}));
 await source.goto(site,{waitUntil:'domcontentloaded'});await source.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—');result.url=source.url();await viewer.goto(result.url,{waitUntil:'domcontentloaded'});
 await source.locator('#screenShareBtn').click();await source.locator('#liveViewerModal.show').waitFor();
 clock=await contexts[0].newPage();await clock.setContent('<style>body{margin:0;background:#000}canvas{display:block}</style><canvas width="1280" height="620"></canvas>');
 await clock.evaluate(()=>{const c=document.querySelector('canvas'),x=c.getContext('2d'),w=128,h=32,noise=x.createImageData(w,h);let seed=1;function draw(){const tick=Math.floor(Date.now()/10)%2**24;x.fillStyle='#ff00ff';x.fillRect(0,0,40,300);for(let i=0;i<24;i++){x.fillStyle=tick&2**(23-i)?'#fff':'#000';x.fillRect(40+i*40,0,40,300)}for(let i=0;i<noise.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;noise.data[i]=seed&255;noise.data[i+1]=seed>>>8&255;noise.data[i+2]=seed>>>16&255;noise.data[i+3]=255}const n=window.__noise||(window.__noise=document.createElement('canvas'));n.width=w;n.height=h;n.getContext('2d').putImageData(noise,0,0);x.imageSmoothingEnabled=false;x.drawImage(n,0,300,1280,320);requestAnimationFrame(draw)}draw()});await clock.bringToFront();
 await viewer.locator('[data-live-watch]').waitFor({timeout:90000});await viewer.locator('[data-live-watch]').click();await viewer.waitForFunction(()=>document.querySelector('#liveViewerStage video')?.currentTime>1,null,{timeout:90000});await delay(2000);
 const stable=await sample('stable',8);await source.evaluate(()=>document.querySelector('#liveLatencyToggle').click());await viewer.waitForFunction(()=>PrivateTrackerMesh.live().viewer?.lowLatency===true);await viewer.waitForFunction(()=>{const v=document.querySelector('#liveViewerStage video');return v.currentTime>2&&!v.paused},null,{timeout:60000});
 const low=await sample('low',12);assert.ok(low.median<stable.median*.8,`LIVE latency ${low.median}ms improves on stable ${stable.median}ms`);assert.ok(low.median<1500,'LIVE median remains below 1.5s in this broker harness');
 if(html&&process.env.CONGESTION!=='0'){
  const before=low.publisher.publisher.viewers[0].videoBitrate;await viewer.evaluate(()=>{__liveLink.bps=40000});await sample('congested',35);const after=result.congested.publisher.publisher.viewers[0].videoBitrate;assert.ok(after<before*.85,'encoder compresses after sustained measured delivery debt');assert.deepEqual(result.congested.publisher.publisher.captureSettings,low.publisher.publisher.captureSettings,'slow-viewer compression preserves the original capture');
  await viewer.evaluate(()=>{__liveLink.bps=Infinity;__liveLink.until=performance.now();__liveLink.epoch=-1});await delay(4000);await sample('recovered',10);assert.ok(result.recovered.median<1500,'playback returns to the live edge after bandwidth recovery');
 }
 await source.evaluate(()=>document.querySelector('#liveLatencyToggle').click());await viewer.waitForFunction(()=>PrivateTrackerMesh.live().viewer?.lowLatency===false);await viewer.waitForFunction(()=>document.querySelector('#liveViewerStage video')?.currentTime>1,null,{timeout:60000});result.disabled=await status(viewer);assert.equal(result.disabled.viewer.playbackRate,1);
 assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=e.message;result.sourceFailure=await status(source).catch(()=>null);result.viewerFailure=await status(viewer).catch(()=>null);await viewer?.screenshot({path:out+'.failure.png'}).catch(()=>{});throw e}finally{fs.writeFileSync(out,JSON.stringify(result,null,2));await receiverBrowser?.close();await publisherBrowser?.close();xvfb.kill()}
