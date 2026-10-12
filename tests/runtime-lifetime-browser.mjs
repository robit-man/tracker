// Real browser lifecycle regression. Test response exposes state/probes only;
// application networking and source verification remain unchanged.
// TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML=index.html \
// OUT=/tmp/tracker-long-haul/runtime node tests/runtime-lifetime-browser.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||root,'package.json'));
const pw=require('playwright'),site=process.env.SITE||'https://robit-man.github.io/tracker/';
const output=process.env.OUT||'/tmp/tracker-long-haul/runtime';fs.mkdirSync(output,{recursive:true});
const snapshot=fs.readFileSync(process.env.TRACKER_HTML||path.join(root,'index.html'),'utf8');
const hooks=`
const __runtimeIds=new WeakMap();let __runtimeNext=0;const __runtimeId=o=>{if(!o)return 0;if(!__runtimeIds.has(o))__runtimeIds.set(o,++__runtimeNext);return __runtimeIds.get(o)};
window.__runtimeLifetime={
 status(){return {boot:window.__runtimeNative.boot,pageSuspended,meshStopped,networkReady,room:{nc:__runtimeId(natsState.nc),bc:__runtimeId(bc),supervisor:meshSupervisorTimer,rapid:rapidDiscoveryTimer,natsTimer:natsState.timer,subscriptions:[natsState.presence,natsState.signal,natsState.relay,natsState.binary].filter(Boolean).length,starting:!!meshStartPromise},global:{nc:__runtimeId(globalMesh.nc),bc:__runtimeId(globalMesh.bc),timer:globalMesh.timer,suspended:!!globalMesh.suspended,lease:__runtimeId(globalMesh.providerLease),leader:globalMesh.leader,subscriptions:globalMesh.natsSubscriptions?.length||0,starting:!!globalMesh.starting},local:[...localHave],sources:[...sourceFiles.keys()],native:window.__runtimeNative.sample(),locks:!!navigator.locks?.request}},
 async sourceHash(cid){const bytes=await readLocalChunk(cid,0);return bytes?sha256Hex(bytes):null},
 async roomProbe(){const channel=bc;if(!channel||typeof channel.onmessage!=='function')throw Error('Room channel is unavailable');const other=new BroadcastChannel(channel.name),previous=channel.onmessage,tag='runtime-probe-'+crypto.randomUUID();let timer;
  try{return await new Promise(async(resolve,reject)=>{timer=setTimeout(()=>reject(Error('Room BroadcastChannel round trip timed out')),3000);
   channel.onmessage=e=>{previous(e);if(e.data?.from===tag)resolve(true)};other.onmessage=async e=>{try{const decoded=await openSeal(e.data.packet);if(decoded.probe===tag)other.postMessage({...e.data,to:actor,from:tag})}catch(err){reject(err)}};
   try{await broadcastChannelPacket(await seal(msg('hello',{probe:tag,reply:true})));}catch(err){reject(err)}
  })}finally{clearTimeout(timer);if(bc===channel)channel.onmessage=previous;other.close()}
 }
};
`;
const marker=snapshot.lastIndexOf('\n})();');if(marker<0)throw Error('Application closure not found');
const html=snapshot.slice(0,marker)+hooks+snapshot.slice(marker);
const browsers=(process.env.BROWSERS||'chromium,firefox').split(',');
const cycles=Math.min(2,Math.max(1,Number(process.env.CYCLES)||2));
const report={htmlSha256:createHash('sha256').update(snapshot).digest('hex'),started:new Date().toISOString(),browsers:[],passed:false};
function save(){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2))}
async function instrumentation(context){await context.addInitScript(()=>{
 localStorage.setItem('private-tracker-deep-privacy-v1','1');window.showOpenFilePicker=undefined;window.showSaveFilePicker=undefined;
 const intervals=new Map(),sockets=new Set(),events=[],boot=crypto.randomUUID(),NativeSocket=window.WebSocket,nativeSet=window.setInterval,nativeClear=window.clearInterval;
 window.WebSocket=new Proxy(NativeSocket,{construct(target,args){const socket=new target(...args);sockets.add(new WeakRef(socket));return socket}});
 window.setInterval=function(callback,...rest){const id=nativeSet.call(this,callback,...rest);intervals.set(id,String(callback).slice(0,240));return id};window.clearInterval=function(id){intervals.delete(id);return nativeClear.call(this,id)};
 for(const type of ['pagehide','pageshow'])window.addEventListener(type,e=>{events.push({type,persisted:e.persisted,trusted:e.isTrusted,at:Date.now()});if(events.length>40)events.shift()});
 window.__runtimeNative={boot,sample(){const byCallback={},activeSockets=[];for(const callback of intervals.values())byCallback[callback]=(byCallback[callback]||0)+1;for(const ref of sockets){const socket=ref.deref();if(!socket){sockets.delete(ref);continue}if(socket.readyState<2)activeSockets.push(socket.url)}return{intervals:intervals.size,byCallback,sockets:activeSockets,events:[...events]}}};
})}
async function settled(page){await page.waitForFunction(()=>{const s=window.__runtimeLifetime?.status();return s&&!s.pageSuspended&&!s.meshStopped&&s.room.nc&&s.global.nc&&s.room.supervisor&&s.global.timer&&s.global.leader&&!s.room.starting&&!s.global.starting},undefined,{timeout:90000});return page.evaluate(()=>__runtimeLifetime.status())}
function healthy(state){
 assert.equal(state.room.subscriptions,4);assert.equal(state.global.subscriptions,2);assert.ok(state.room.bc&&state.global.bc);assert.ok(state.room.supervisor&&state.room.natsTimer&&state.global.timer);assert.ok(state.global.leader);if(state.locks)assert.ok(state.global.lease);
 for(const [callback,count]of Object.entries(state.native.byCallback))if(/meshSupervisorTick|globalStorageMaintenance|publishNatsPresence/.test(callback))assert.equal(count,1,`duplicate managed heartbeat: ${callback}`);
 const nats=state.native.sockets.filter(url=>new URL(url).hostname==='demo.nats.io');assert.equal(nats.length,2,'one room and one global NATS socket');
}
try{
 for(const name of browsers){const result={browser:name,checks:[],states:[],errors:[]};report.browsers.push(result);save();let browser;
  try{
   browser=await pw[name].launch({headless:true,ignoreDefaultArgs:name==='chromium'?['--disable-back-forward-cache']:undefined,args:name==='chromium'?['--no-sandbox','--disable-gpu']:[]});
   const context=await browser.newContext();await instrumentation(context);await context.route(site,r=>r.fulfill({contentType:'text/html',body:html}));const away=site+'__runtime-away.html';await context.route(away,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Lifecycle navigation target</title><p>Navigation target</p>'}));
   const page=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>result.errors.push(e.message));page.on('crash',()=>result.errors.push('Browser tab crashed'));await page.goto(site,{waitUntil:'domcontentloaded'});
   let state=await settled(page);healthy(state);result.states.push({stage:'initial',state});result.url=page.url();result.checks.push('room/global real NATS connections, provider lease and single managed heartbeat established');
   const bytes=randomBytes(65536),hash=createHash('sha256').update(bytes).digest('hex');await page.locator('#fileInput').setInputFiles({name:'runtime-lifetime-source.bin',mimeType:'application/octet-stream',buffer:bytes});await page.locator('.row[data-cid] [data-seed][aria-pressed="true"]').waitFor();const cid=await page.locator('.row[data-cid]').getAttribute('data-cid');result.cid=cid;assert.equal(await page.evaluate(cid=>__runtimeLifetime.sourceHash(cid),cid),hash);assert.equal(await page.evaluate(()=>__runtimeLifetime.roomProbe()),true);
   result.checks.push('verified local source and encrypted room BroadcastChannel round trip available');
   for(let cycle=1;cycle<=cycles;cycle++){
    const before=state,stopped=await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));return __runtimeLifetime.status()});
    assert.ok(stopped.pageSuspended&&stopped.meshStopped&&stopped.global.suspended);assert.equal(stopped.room.nc,0);assert.equal(stopped.room.bc,0);assert.equal(stopped.room.supervisor,0);assert.equal(stopped.room.natsTimer,null);assert.equal(stopped.global.nc,0);assert.equal(stopped.global.bc,0);assert.equal(stopped.global.timer,0);assert.equal(stopped.global.leader,false);assert.equal(stopped.global.lease,0);assert.ok(stopped.sources.includes(cid));
    result.states.push({stage:'synthetic-stop-'+cycle,state:stopped});
    await page.evaluate(()=>{for(let duplicate=0;duplicate<4;duplicate++)window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))});state=await settled(page);healthy(state);assert.notEqual(state.room.nc,before.room.nc);assert.notEqual(state.global.nc,before.global.nc);assert.notEqual(state.room.bc,before.room.bc);assert.notEqual(state.global.bc,before.global.bc);assert.equal(state.boot,before.boot);assert.ok(state.sources.includes(cid));assert.equal(await page.evaluate(cid=>__runtimeLifetime.sourceHash(cid),cid),hash);assert.equal(await page.evaluate(()=>__runtimeLifetime.roomProbe()),true);result.states.push({stage:'synthetic-restore-'+cycle,state});
    result.checks.push(`synthetic persisted lifecycle cycle ${cycle} closes/recreates runtimes without losing source or duplicating heartbeats/sockets`);save();
   }
   const before=state;await page.goto(away,{waitUntil:'domcontentloaded'});await page.goBack({waitUntil:'commit'});state=await settled(page);healthy(state);const restored=state.boot===before.boot&&state.native.events.some(e=>e.type==='pageshow'&&e.persisted&&e.trusted);result.actualNavigation={bfcacheRestored:restored,sameDocument:state.boot===before.boot,events:state.native.events,navigation:await page.evaluate(()=>{const entry=performance.getEntriesByType('navigation')[0];return{type:entry?.type,notRestoredReasons:entry?.notRestoredReasons?.toJSON?.()||null}})};
   if(restored){assert.ok(state.sources.includes(cid));assert.equal(await page.evaluate(cid=>__runtimeLifetime.sourceHash(cid),cid),hash);result.checks.push('actual browser back/forward cache restore keeps linked source and recreates networking')}
   else{await page.locator(`.row[data-cid="${cid}"] [data-relink].resumeAvailable`).waitFor();result.checks.push('actual back navigation used document reload; persisted catalog offers source recovery (BFCache unavailable in this run)')}
   assert.equal(await page.evaluate(()=>__runtimeLifetime.roomProbe()),true);result.states.push({stage:'actual-navigation-return',state});assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify({browser:name,passed:true,checks:result.checks,actualNavigation:result.actualNavigation}));
  }catch(error){result.failure=error.stack;console.error(name+': '+error.stack);process.exitCode=1}
  finally{await browser?.close();save()}
 }
 report.passed=report.browsers.length===browsers.length&&report.browsers.every(x=>x.passed);
}finally{report.finished=new Date().toISOString();save()}
