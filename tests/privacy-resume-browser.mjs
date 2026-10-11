// Real file streaming over public brokers, privacy transitions, X/pause and cold resume.
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||process.cwd(),'package.json'));
const browserName=process.env.BROWSER||'chromium',browserType=require('playwright')[browserName];
const site='https://robit-man.github.io/tracker/',html=process.env.TRACKER_HTML&&fs.readFileSync(process.env.TRACKER_HTML,'utf8'),fixture=process.env.FIXTURE||'/tmp/tracker-stream-test/faststart.mp4',out=process.env.RESULT||'/tmp/privacy-resume.json';
const result={browser:browserName,htmlOverride:!!html,fixture,checks:[],errors:[]};
const browser=await browserType.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:browserName==='chromium'?['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']:[],firefoxUserPrefs:{'media.autoplay.default':0,'layers.acceleration.disabled':true}});
let source,viewer,progressTimer;
const check=label=>{result.checks.push(label);console.log("PASS",label)};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function peer(role){
 const context=await browser.newContext({acceptDownloads:true});if(html)await context.route(site,r=>r.fulfill({contentType:'text/html',body:html}));
 await context.addInitScript(()=>{
  window.showSaveFilePicker=undefined;window.__privacyAudit={pcs:[],violations:[]};
  const Native=window.RTCPeerConnection;
  window.RTCPeerConnection=new Proxy(Native,{construct(target,args){
   const pc=new target(...args);window.__privacyAudit.pcs.push(pc);
   const create=pc.createDataChannel.bind(pc);pc.createDataChannel=(...args)=>{
    const dc=create(...args),send=dc.send.bind(dc);dc.send=data=>{
     if(localStorage.getItem('private-tracker-deep-privacy-v1')==='1'&&pc.getConfiguration().iceTransportPolicy!=='relay')window.__privacyAudit.violations.push('non-relay data send while private');return send(data)
    };return dc
   };return pc
  }});
 });
 const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>result.errors.push({role,error:e.message}));return page;
}
async function ready(page,url){await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—')}
async function state(page){return page.evaluate(()=>{const v=document.querySelector('#previewStage video,audio');return{privacy:PrivateTrackerMesh.privacy(),preview:PrivateTrackerMesh.preview(),served:document.querySelector('#servedBytes').textContent,video:v&&{time:v.currentTime,paused:v.paused,error:v.error?.message,duration:v.duration},pcs:__privacyAudit.pcs.map(pc=>({policy:pc.getConfiguration().iceTransportPolicy,state:pc.connectionState})),violations:__privacyAudit.violations,transfer:document.querySelector('#transferModal')?.textContent,rows:[...document.querySelectorAll('.row[data-cid]')].map(r=>({name:r.querySelector('.nameText')?.textContent,availability:r.querySelector('[data-source-stat]')?.textContent,action:r.querySelector('[data-download]')?.getAttribute('aria-label')}))}})}
async function toggle(page,on){if(await page.locator('#privacyBtn').getAttribute('aria-pressed')!==String(on))await page.locator('#privacyBtn').evaluate(b=>b.click());assert.equal(await page.locator('#privacyBtn').getAttribute('aria-pressed'),String(on))}
try{
 source=await peer('source');viewer=await peer('viewer');await ready(source,site);result.url=source.url();
 assert.equal(await source.locator('#privacyBtn').getAttribute('aria-pressed'),'false');await source.locator('#privacyBtn').click();
 assert.equal(await source.locator('#privacyBtn').getAttribute('aria-pressed'),'true');assert.ok(await source.locator('#privacyBtn').evaluate(b=>b.classList.contains('privacyOn')));
 await source.reload({waitUntil:'domcontentloaded'});await source.waitForFunction(()=>document.querySelector('#privacyBtn').getAttribute('aria-pressed')==='true');
 const config=await source.evaluate(()=>{const pc=new RTCPeerConnection({iceTransportPolicy:'all',iceServers:[{urls:'stun:stun.example.org'}]}),c=pc.getConfiguration();pc.close();return c});
 assert.equal(config.iceTransportPolicy,'relay');assert.equal(config.iceServers.length,0);check('physical toggle and reload persist privacy; constructor blocks STUN and direct ICE');
 await source.locator('#privacyBtn').click();assert.equal(await source.locator('#privacyBtn').getAttribute('aria-pressed'),'false');
 await source.locator('#fileInput').setInputFiles(fixture);const sourceRow=source.locator('.row[data-cid]').filter({hasText:path.basename(fixture)});
 await sourceRow.locator('[data-seed][aria-pressed="true"]').waitFor({timeout:180000});result.cid=await sourceRow.getAttribute('data-cid');
 await ready(viewer,result.url);progressTimer=setInterval(async()=>{try{const x=await state(viewer);console.log('STATE',JSON.stringify({preview:x.preview,transfer:x.transfer,rows:x.rows}))}catch(_){}},10000);const row=viewer.locator(`.row[data-cid="${result.cid}"]`);await row.locator('[data-stream]').waitFor({timeout:90000});await row.locator('[data-stream]').click();
 await viewer.waitForFunction(()=>document.querySelector('#previewStage video')?.currentTime>2,null,{timeout:120000});
 await Promise.all([source,viewer].map(p=>p.waitForFunction(()=>__privacyAudit.pcs.some(pc=>pc.connectionState==='connected'&&pc.getConfiguration().iceTransportPolicy!=='relay'),null,{timeout:45000})));
 result.beforePrivacy={source:await state(source),viewer:await state(viewer)};
 await toggle(source,true);await toggle(viewer,true);
 await Promise.all([source,viewer].map(p=>p.waitForFunction(()=>__privacyAudit.pcs.filter(pc=>pc.getConfiguration().iceTransportPolicy!=='relay').every(pc=>pc.connectionState==='closed'))));
 await viewer.waitForFunction(old=>document.querySelector('#previewStage video').currentTime>old+3,result.beforePrivacy.viewer.video.time,{timeout:30000});
 result.private={source:await state(source),viewer:await state(viewer)};assert.equal(result.private.viewer.privacy.rtc,false);check('active direct connections close and file playback continues in privacy mode');
 await viewer.evaluate(()=>window.__retainedMedia=document.querySelector('#previewStage video'));result.beforePause=await state(viewer);await viewer.locator('#previewClose').click();
 await row.locator('[data-stream].resumeAvailable').waitFor();await source.waitForFunction(()=>{const w=PrivateTrackerMesh.streamWork();return w.active===0&&w.queued===0&&PrivateTrackerMesh.writeBacklog().nats===0},null,{timeout:60000});result.paused=await state(viewer);const served=await source.evaluate(()=>PrivateTrackerMesh.streamWork().served);await delay(4000);result.held=await state(viewer);
 assert.equal(result.held.preview.state,'paused');assert.equal(result.held.preview.hidden,true);assert.equal(result.held.preview.received,result.paused.preview.received);assert.equal(result.held.video.time,result.paused.video.time);assert.equal(await source.evaluate(()=>PrivateTrackerMesh.streamWork().served),served,'source stops sending additional file chunks after its queued work retires');
 check('X holds playback and new chunks; paused entry displays a blinking resume action');
 // With file acquisition held, a fresh download proves the private session still moves new encrypted bytes,
 // rather than only playing a buffer filled before direct connections closed.
 const bytes=randomBytes(1100000);await source.locator('#fileInput').setInputFiles({name:'privacy-relay-probe.bin',mimeType:'application/octet-stream',buffer:bytes});
 const probe=viewer.locator('.row[data-cid]').filter({hasText:'privacy-relay-probe.bin'});await probe.locator('[data-download]').waitFor();await probe.locator('[data-source-stat]').filter({hasText:/1/}).waitFor();await probe.locator('[data-download]').evaluate(b=>b.click());
 await probe.locator('[data-download][aria-label="Save file"]').waitFor({timeout:90000});await viewer.locator('#transferClose').click();
 const downloading=viewer.waitForEvent('download');await probe.locator('[data-download]').evaluate(b=>b.click());const download=await downloading;assert.deepEqual(fs.readFileSync(await download.path()),bytes);
 check('new bytes download identically through public encrypted relays with both peers private');
 await row.locator('[data-stream]').click();assert.equal(await viewer.evaluate(()=>window.__retainedMedia===document.querySelector('#previewStage video')),true);
 const resumed=await state(viewer);assert.ok(Math.abs(resumed.video.time-result.held.video.time)<.6);assert.notEqual(resumed.preview.sid,result.held.preview.sid);assert.equal(resumed.preview.cacheSid,result.held.preview.cacheSid);
 await viewer.waitForFunction(old=>document.querySelector('#previewStage video').currentTime>old+2,result.held.video.time,{timeout:30000});result.warmResume=await state(viewer);check('resume retains the same decoder, exact position and cache with a fresh source request session');
 const duration=result.warmResume.video.duration,target=Number(process.env.SEEK_TIME)||(duration>6000?6000:90);await viewer.locator('#previewStage video').evaluate((v,t)=>v.currentTime=t,target);
 await viewer.waitForFunction(t=>{const v=document.querySelector('#previewStage video');return v.currentTime>t+2&&!v.paused},target,{timeout:90000});
 await viewer.locator('#previewClose').click();result.saved=await state(viewer);await delay(250);await viewer.reload({waitUntil:'domcontentloaded'});
 await row.locator('[data-stream].resumeAvailable').waitFor();assert.equal(await viewer.locator('#privacyBtn').getAttribute('aria-pressed'),'true');await row.locator('[data-stream]').click();
 await viewer.waitForFunction(t=>{const v=document.querySelector('#previewStage video');return v.currentTime>t+1&&!v.paused},result.saved.video.time,{timeout:120000});result.coldResume=await state(viewer);
 assert.ok(result.coldResume.video.time<result.saved.video.time+20);assert.ok(!result.coldResume.video.error);check('reload restores saved playback time and fetches its MP4 range');
 if(duration>6000){assert.ok(result.coldResume.preview.received<500,'cold resume does not fetch thousands of preceding chunks');check('full ETV resumes at 100 minutes without downloading its preceding file prefix')}
 await toggle(source,false);await toggle(viewer,false);await viewer.waitForFunction(t=>document.querySelector('#previewStage video').currentTime>t+2,result.coldResume.video.time,{timeout:30000});
 result.end={source:await state(source),viewer:await state(viewer)};assert.equal(result.end.viewer.privacy.policy,'all');assert.deepEqual(result.end.viewer.violations,[]);assert.deepEqual(result.end.source.violations,[]);assert.deepEqual(result.errors,[]);
 check('privacy switches off while playback continues');result.passed=true;console.log(JSON.stringify(result,null,2));
}catch(e){result.failure=e.message;result.sourceFailure=source&&await state(source).catch(()=>null);result.viewerFailure=viewer&&await state(viewer).catch(()=>null);throw e}finally{clearInterval(progressTimer);fs.writeFileSync(out,JSON.stringify(result,null,2));await browser.close()}
