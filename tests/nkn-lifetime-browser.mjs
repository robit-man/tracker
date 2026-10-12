// Actual pinned browser SDK, two isolated contexts, real NKN delivery.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const project=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require=createRequire(path.join(process.env.TRACKER_TEST_DEPS||project,'package.json'));
const {source}=createRequire(import.meta.url)('./v4-helper.cjs');
const guard=source('installNknLifetimeGuards');
const browser=await require('playwright').chromium.launch({args:['--disable-gpu']});
const site='https://robit-man.github.io/tracker/qa-nkn-lifetime-'+randomBytes(4).toString('hex')+'/';
const result={errors:[],checks:[],config:{numSubClients:1,originalClient:true,webrtc:true,tls:true,responseTimeout:5000,reconnectIntervalMin:1800,reconnectIntervalMax:30000}},pages=[];
const output=process.env.RESULT||'/tmp/tracker-nkn-lifetime-browser.json';
try{
  for(let i=0;i<2;i++){
    const context=await browser.newContext();
    await context.route(site,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><script src="https://cdn.jsdelivr.net/npm/nkn-sdk@1.3.6/dist/nkn.min.js"></script><script>'+guard+'</script>'}));
    const page=await context.newPage();pages.push(page);
    page.on('pageerror',e=>result.errors.push({message:e.message,stack:e.stack}));
    await page.goto(site);await page.waitForFunction(()=>!!window.nkn);
    await page.evaluate(config=>{window.testState={connected:false,received:[]};window.testClient=new nkn.MultiClient(config);window.testLifetime=installNknLifetimeGuards(testClient);testClient.onConnect(()=>testState.connected=true);testClient.onMessage(m=>{testState.received.push({src:m.src,payload:String(m.payload)});return null})},result.config);
  }
  await Promise.all(pages.map(p=>p.waitForFunction(()=>testState.connected,null,{timeout:120000})));
  result.checks.push('two guarded pinned SDK MultiClients connect through the existing NKN WebRTC transport');
  const ready=await Promise.all(pages.map(p=>p.evaluate(()=>testClient.readyClientIDs()))),common=ready[0].find(id=>ready[1].includes(id));
  assert.notEqual(common,undefined,'the two independent clients need a common connected SDK child index for delivery');result.readyChildren=ready;
  const destination=await pages[1].evaluate(()=>testClient.addr),message='nkn-lifetime-'+randomBytes(12).toString('hex');
  await pages[0].evaluate(async({destination,message,common})=>{await testClient.sendWithClient(common,destination,message,{responseTimeout:30000})},{destination,message,common});
  await pages[1].waitForFunction(message=>testState.received.some(m=>m.payload===message),message,{timeout:30000});
  result.checks.push('an encrypted NKN message reaches the independent browser context');
  result.states=await Promise.all(pages.map(p=>p.evaluate(()=>({connected:testState.connected,received:testState.received.length,children:Object.values(testClient.clients).map(c=>({ready:c.isReady,failed:c.isFailed,closed:c.isClosed,rtc:c.peer?.pc?.connectionState}))}))));
  await Promise.all(pages.map(p=>p.evaluate(async()=>{await testClient.close();for(const c of Object.values(testClient.clients))await c._connect()})));
  assert.ok((await Promise.all(pages.map(p=>p.evaluate(()=>Object.values(testClient.clients).every(c=>c.isClosed&&c.peer.pc.signalingState==='closed'))))).every(Boolean));
  result.checks.push('explicit SDK close retires each actual peer and rejects reconnect attempts');
  assert.deepEqual(result.errors,[]);result.passed=true;
}catch(error){result.passed=false;result.failure=error.stack;result.states=await Promise.all(pages.map(p=>p.evaluate(()=>({ready:testClient?.readyClientIDs(),state:testState})).catch(()=>null)));process.exitCode=1}
finally{for(const page of pages)await page.evaluate(()=>testClient?.close()).catch(()=>{});await browser.close();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))}
