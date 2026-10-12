// Exercise the pinned SDK's real Client/MultiClient/Peer code with controlled
// node-discovery replies and RTC failures. Dependencies stay outside the repo.
// TRACKER_NKN_DEPS=/path/node_modules node tests/nkn-sdk-lifetime.cjs
// NKN_BASELINE=1 demonstrates the unguarded SDK's ignored SDP rejection.
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {source}=require('./v4-helper.cjs');
const deps=process.env.TRACKER_NKN_DEPS||process.env.TRACKER_NETWORK_DEPS||'/tmp/tracker-network-deps/node_modules';
const sdk=require(path.join(deps,'nkn-sdk')),rpc=require(path.join(deps,'nkn-sdk/lib/common/rpc.js'));
const baseline=process.env.NKN_BASELINE==='1',flush=()=>new Promise(resolve=>setImmediate(resolve));
const requests=[],pcs=[],clients=[],timers=new Map(),errors=[],checks=[];let serial=0,remoteCalls=0;
const originalRpc=rpc.getPeerAddr,originalRtc=global.RTCPeerConnection,originalTimeout=global.setTimeout;
const unhandled=error=>errors.push(String(error));process.on('unhandledRejection',unhandled);
class Channel{
  constructor(){this.readyState='connecting';this.listeners=new Map()}
  addEventListener(name,fn){this.listeners.set(name,fn)}
  close(){if(this.readyState==='closed')return;this.readyState='closed';queueMicrotask(()=>this.listeners.get('close')?.({target:this}))}
  send(){if(this.readyState!=='open')throw Error('Data channel is not open')}
}
class Rtc{
  constructor(){this.signalingState='stable';this.channels=[];pcs.push(this)}
  createDataChannel(){const dc=new Channel();this.channels.push(dc);return dc}
  async createOffer(){return{type:'offer',sdp:'fixture-offer'}}
  async setLocalDescription(){this.localDescription={type:'offer',sdp:'fixture-offer'};this.signalingState='have-local-offer'}
  setRemoteDescription(){remoteCalls++;if(this.signalingState==='closed'||this.failRemote)return Promise.reject(Error("Failed to execute 'setRemoteDescription': signalingState closed"));this.signalingState='stable';return Promise.resolve()}
  close(){if(this.signalingState==='closed')return;this.signalingState='closed';this.channels.forEach(dc=>dc.close())}
}
global.RTCPeerConnection=Rtc;
// SDK connect/challenge timeouts should not keep this standalone fixture alive.
global.setTimeout=(...args)=>{const timer=originalTimeout(...args);timer.unref?.();return timer};
rpc.getPeerAddr=(addr,options)=>new Promise(resolve=>requests.push({addr,options,resolve}));
const c=vm.createContext({Promise,Error,Number,Object,Math,setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)});
vm.runInContext(source('installNknLifetimeGuards'),c);
function create(){const client=new sdk.MultiClient({numSubClients:1,originalClient:true,webrtc:true,tls:false,worker:false,connectTimeout:60000,reconnectIntervalMin:1800,reconnectIntervalMax:30000});clients.push(client);let active=true;const state=baseline?null:c.installNknLifetimeGuards(client,()=>active);return{client,state,retire(){active=false},children:Object.values(client.clients)}}
const reply=request=>request.resolve({addr:'fixture-node',rpcAddr:'',sdp:btoa(JSON.stringify({type:'answer',sdp:'fixture-answer'}))});
async function closeAll(){await Promise.all(clients.map(client=>client.close()));await flush()}
(async()=>{try{
  const first=create();await flush();assert.equal(requests.length,2);first.children.forEach(child=>child.peer.pc.close());requests.splice(0).forEach(reply);await flush();await flush();
  assert.equal(errors.length,0,`the actual SDK leaked ignored SDP rejections: ${errors.join('; ')}`);
  assert.equal(remoteCalls,0,'a closed initial PC must never receive a late SDP answer');assert.ok(first.children.every(child=>child.isFailed));checks.push('closed constructor PCs reject late answers without an unhandled SDK promise');await first.client.close();

  const late=create();await flush();const before=pcs.length,initialAttempts=Array.from({length:10000},(_,i)=>late.children[i%late.children.length]._connect());await flush();assert.equal(requests.length,2);assert.equal(pcs.length,before);late.retire();await late.client.close();assert.ok(late.children.every(child=>child.peer.pc.signalingState==='closed'));requests.splice(0).forEach(reply);await Promise.all(initialAttempts);await flush();assert.equal(remoteCalls,0);assert.equal(pcs.length,before);assert.ok(late.state.children.every(s=>s.pending===null));checks.push('10,000 constructor-time connect calls share two physical SDK children and retirement closes initial PCs');

  const recovery=create();await flush();const child=recovery.children[0],other=recovery.children[1],oldPc=child.peer.pc;child.shouldReconnect=true;oldPc.failRemote=true;requests.splice(0).forEach(reply);await flush();await flush();assert.equal(errors.length,0);assert.equal(oldPc.signalingState,'closed');assert.equal(timers.size,1,'one owned SDK backoff must handle the SDP failure and channel-close callback');assert.equal([...timers.values()][0].ms,1800);assert.equal(other.peer.pc.signalingState,'stable');checks.push('an asynchronous SDP rejection retires only its failed child and schedules one existing SDK backoff');
  const [timerId,timer]=[...timers][0];timers.delete(timerId);timer.fn();await flush();const retryCalls=Array.from({length:10000},()=>child._connect());await flush();assert.equal(requests.length,1);const freshPc=child.peer.pc;assert.notEqual(freshPc,oldPc);requests.splice(0).forEach(reply);await Promise.all(retryCalls);await flush();assert.equal(freshPc.signalingState,'stable');assert.notEqual(child.peer.dc.readyState,'closed');assert.equal(child.ws,child.peer);checks.push('10,000 retry calls share one actual reconnect and the reused SDK Peer does not close its replacement PC');

  const openCallback=child.peer.onopen,messageCallback=child.peer.onmessage;recovery.retire();await recovery.client.close();await openCallback();await messageCallback({data:'not-json'});await child._connect();await child._newWsAddr({addr:'stale',sdp:'stale'});assert.equal(requests.length,0);assert.equal(timers.size,0);assert.equal(freshPc.signalingState,'closed');assert.equal(errors.length,0);checks.push('retired open/message callbacks and queued SDK reconnects cannot revive a closed owner');
  assert.throws(()=>c.installNknLifetimeGuards({clients:{bad:{}},close(){}}),/incompatible/);checks.push('a changed pinned SDK shape degrades explicitly instead of installing unsafe guards');
  console.log(JSON.stringify({passed:true,sdk:'nkn-sdk@1.3.6',checks,ignoredRejections:errors.length,physicalPcs:pcs.length,remoteCalls},null,2));
}finally{await closeAll();rpc.getPeerAddr=originalRpc;global.RTCPeerConnection=originalRtc;global.setTimeout=originalTimeout;process.removeListener('unhandledRejection',unhandled)}})().catch(error=>{console.error(error);process.exitCode=1});
