// Real AVI decoding locally and after an encrypted transfer through public brokers.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||process.cwd(),'package.json'));
const browserName=process.env.BROWSER||'chromium',site='https://robit-man.github.io/tracker/';
const fixtures=process.argv.slice(2);assert.ok(fixtures.length,'Supply real AVI fixtures');
const html=process.env.TRACKER_HTML&&fs.readFileSync(process.env.TRACKER_HTML,'utf8');
const result={browser:browserName,htmlOverride:!!html,fixtures,checks:[],errors:[]};
const browser=await require('playwright')[browserName].launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:browserName==='chromium'?['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required']:[],firefoxUserPrefs:{'media.autoplay.default':0,'layers.acceleration.disabled':true}});
const pages=[];let timer;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function check(label){result.checks.push(label);console.log('PASS',label)}
async function peer(role,url){
  const context=await browser.newContext();if(html)await context.route(site,r=>r.fulfill({contentType:'text/html',body:html}));
  await context.addInitScript(()=>localStorage.setItem('private-tracker-deep-privacy-v1','1'));
  const page=await context.newPage();pages.push(page);page.setDefaultTimeout(45000);
  page.on('pageerror',e=>result.errors.push({role,error:e.message}));
  page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',role,m.text())});
  await page.goto(url||site,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#sideActor')?.textContent!=='—');return page;
}
async function media(page){return page.evaluate(()=>{const v=document.querySelector('#previewStage video');return{url:location.href,actor:document.querySelector('#sideActor').textContent,room:document.querySelector('#roomCode').textContent,peers:PrivateTrackerMesh.relayActors(),preview:PrivateTrackerMesh.preview(),state:document.querySelector('#previewState').textContent,stage:document.querySelector('#previewStage').textContent,video:v&&{time:v.currentTime,duration:v.duration,paused:v.paused,ready:v.readyState,width:v.videoWidth,height:v.videoHeight,error:v.error?.message,frames:v.getVideoPlaybackQuality?.().totalVideoFrames,audioDecoded:v.webkitAudioDecodedByteCount},routes:PrivateTrackerMesh.status(),privacy:PrivateTrackerMesh.privacy()}})}
async function playing(page){
  await page.waitForFunction(()=>{const v=document.querySelector('#previewStage video');return v?.currentTime>1&&v.readyState>=2&&v.videoWidth>0&&!v.paused&&!v.error},null,{timeout:180000});
  const before=await media(page);await delay(1500);const after=await media(page);
  assert.ok(after.video.time>before.video.time+.5);assert.ok(after.video.frames>before.video.frames);assert.ok(after.video.duration>10);return after;
}
try{
  const source=await peer('source');result.url=source.url();const viewer=await peer('viewer',result.url);
  timer=setInterval(async()=>{for(const [i,p]of pages.entries())console.log('STATE',i,JSON.stringify(await media(p).catch(()=>null)))},10000);
  for(const [i,fixture]of fixtures.entries()){
    await source.locator('#fileInput').setInputFiles(fixture);
    const sourceRow=source.locator('.row[data-cid]').filter({hasText:path.basename(fixture)});await sourceRow.locator('[data-seed][aria-pressed="true"]').waitFor({timeout:120000});
    const cid=await sourceRow.getAttribute('data-cid');await sourceRow.locator('[data-stream]').click();
    if(i===0){
      await source.locator('#previewClose').click();
      await delay(1500);const paused=await media(source);await delay(1500);assert.equal((await media(source)).video.time,paused.video.time);assert.equal(paused.video.paused,true);
      await sourceRow.locator('[data-stream].resumeAvailable').click();check('closing AVI before its first section keeps playback and further conversion paused until Resume');
    }
    result[`local${i}`]=await playing(source);check(`${path.basename(fixture)} decodes video locally`);
    await source.locator('#previewClose').click();
    const row=viewer.locator(`.row[data-cid="${cid}"]`);await row.locator('[data-stream]').waitFor({timeout:90000});await row.locator('[data-stream]').click();
    result[`remote${i}`]=await playing(viewer);assert.ok(result[`remote${i}`].preview.received>0);assert.equal(result[`remote${i}`].privacy.policy,'relay');
    check(`${path.basename(fixture)} transfers through encrypted relays and decodes on the receiving peer`);
    const v=viewer.locator('#previewStage video');await v.evaluate(el=>el.currentTime=7);
    await viewer.waitForFunction(()=>document.querySelector('#previewStage video').currentTime>8,null,{timeout:30000});await viewer.locator('#previewClose').click();
    const held=await media(viewer);await delay(1000);assert.equal((await media(viewer)).video.time,held.video.time);await row.locator('[data-stream].resumeAvailable').click();
    await viewer.waitForFunction(t=>document.querySelector('#previewStage video').currentTime>t+.5,held.video.time,{timeout:30000});await viewer.locator('#previewClose').click();check('media seeks and resumes at its saved position');
  }
  // Render the same downloading SVG and CSS as the file action, without affecting transfers.
  result.spinner=await source.evaluate(()=>{const b=document.querySelector('[data-download]').cloneNode(true);b.classList.add('downloading');document.body.append(b);const icon=b.querySelector('svg');const style=getComputedStyle(icon);const x={animation:style.animationName,direction:style.animationDirection};b.remove();return x});
  assert.equal(result.spinner.direction,'reverse');check('download SVG rotates counterclockwise with its arrowheads');
  assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=e.message;result.states=await Promise.all(pages.map(p=>media(p).catch(()=>null)));throw e}
finally{clearInterval(timer);fs.writeFileSync(process.env.RESULT||'/tmp/tracker-avi-browser.json',JSON.stringify(result,null,2));await browser.close()}
