// Actual pinned Waku bundle, public filter/lightpush, and application envelopes.
// Original room carriers are disabled so authenticated peer discovery proves Waku.
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const require=createRequire((process.env.TRACKER_TEST_DEPS||'/tmp/tracker-test-deps')+'/package.json');
const site='https://robit-man.github.io/tracker/qa-waku-'+randomBytes(6).toString('hex')+'/';
const output=process.env.RESULT||'/tmp/tracker-waku-lifetime.json';
const hook=`window.WakuLifetimeHarness={state:()=>{const node=wakuPlane.node,s=node?.trackerLifetime;return {ready:wakuPlane.ready,error:wakuPlane.lastError,sent:wakuPlane.sent,received:wakuPlane.received,connections:node?.libp2p?.getConnections().length,authenticatedPeers:[...relayActors.values()].filter(p=>p.planes?.waku).length,guard:s?{pending:s.pending.size,active:s.active.size,admitting:s.admitting.size,pings:s.pings.size,limit:s.limit,dropped:s.dropped,duplicates:s.duplicates,queued:node.connectionManager.dialer.dialingQueue.length,history:node.connectionManager.dialer.dialHistory.size,failed:node.connectionManager.dialer.failedDials.size}:null}}};\n`;
let html=fs.readFileSync(process.env.TRACKER_HTML||'index.html','utf8');
html=html.replace('async function startNkn(){','async function startNkn(){return false;')
  .replace('async function startNats(){','async function startNats(){return false;')
  .replace('async function joinStrategy(','async function disabledJoinStrategy(')
  .replace('function initDialogNavigation(){','async function joinStrategy(){return false}\nfunction initDialogNavigation(){')
  .replace("async function publishRelayPacket(packet,to='',except='',sourceActor=actor,nknAddr=privacyPublicNknAddr()){","async function publishRelayPacket(packet,to='',except='',sourceActor=actor,nknAddr=privacyPublicNknAddr()){return false;")
  .replace('async function publishRelayBinaryPacket(','async function disabledPublishRelayBinaryPacket(')
  .replace('function initDialogNavigation(){','async function publishRelayBinaryPacket(){return false}\nfunction initDialogNavigation(){')
  .replace('initInterface();\nconst storageRoute=',hook+'initInterface();\nconst storageRoute=');
const browser=await require('playwright').chromium.launch({args:['--disable-gpu']}),pages=[],result={checks:[],errors:[]};
let timer,collecting=false;
async function state(page){return page.evaluate(()=>WakuLifetimeHarness.state()).catch(()=>null)}
async function peer(url){
  const context=await browser.newContext();
  await context.route(site,r=>r.fulfill({body:html,contentType:'text/html'}));
  await context.addInitScript(()=>{localStorage.setItem('private-tracker-deep-privacy-v1','0');window.BroadcastChannel=class extends EventTarget{postMessage(){}close(){}}});
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(url||site,{waitUntil:'domcontentloaded'});return page;
}
try{
  const source=await peer(),receiver=await peer(source.url());
  timer=setInterval(async()=>{if(collecting)return;collecting=true;try{console.log('STATE',JSON.stringify(await Promise.all(pages.map(state))))}finally{collecting=false}},15000);
  await Promise.all(pages.map(page=>page.waitForFunction(()=>WakuLifetimeHarness.state().ready,null,{timeout:150000})));
  await Promise.any(pages.map(page=>page.waitForFunction(()=>WakuLifetimeHarness.state().authenticatedPeers>0,null,{timeout:150000})));
  result.states=await Promise.all(pages.map(state));
  for(const s of result.states){assert.ok(s?.ready);assert.ok(s.guard);assert.ok(s.guard.pending<=s.guard.limit);assert.ok(s.guard.queued<=s.guard.limit)}
  result.checks.push('actual pinned browser SDK startup retains bounded dial admission');
  assert.ok(result.states.some(s=>s.sent>0));assert.ok(result.states.some(s=>s.received>0&&s.authenticatedPeers>0));
  result.checks.push('public lightpush acknowledgement and filter delivery authenticate a separate room peer');
  assert.deepEqual(result.errors,[]);result.passed=true;console.log('PASS',result.checks.join('; '));
}catch(e){result.failure=e.stack;result.states=await Promise.all(pages.map(state));throw e}
finally{clearInterval(timer);fs.writeFileSync(output,JSON.stringify(result,null,2));await browser.close()}
