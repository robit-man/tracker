import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{source}=require('./v4-helper.cjs');
const deps=process.env.TRACKER_NETWORK_DEPS||'/tmp/tracker-network-deps/node_modules';
const {Dialer}=await import(pathToFileURL(path.join(deps,'@waku/core/dist/lib/connection_manager/dialer.js')));
const {KeepAliveManager}=await import(pathToFileURL(path.join(deps,'@waku/core/dist/lib/connection_manager/keep_alive_manager.js')));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}},flush=()=>new Promise(r=>setImmediate(r));
const peer=id=>({toString:()=>id,equals:x=>String(x)===id}),dialGate=deferred(),pingGate=deferred();let actualDials=0,actualPings=0;
const libp2p={getPeers:()=>[],dial:()=>{actualDials++;return dialGate.promise},services:{ping:{ping:()=>{actualPings++;return pingGate.promise}}},peerStore:{merge:async()=>{}}};
const dialer=new Dialer({libp2p,shardReader:{hasShardInfo:async()=>false},options:{maxDialingPeers:3,dialCooldown:0,failedDialCooldown:60}});
const keepAliveManager=new KeepAliveManager({libp2p,options:{pingKeepAlive:300,relayKeepAlive:300},networkConfig:{}}),node={connectionManager:{dialer,keepAliveManager}};
const c=vm.createContext({Date,Set,Map,Math,Error,String});vm.runInContext(source('installWakuLifetimeGuards'),c);const state=c.installWakuLifetimeGuards(node),checks=[];
try{
 const duplicate=Array.from({length:10000},()=>dialer.dial(peer('same-peer')));await flush();assert.equal(actualDials,1);assert.equal(dialer.dialingQueue.length,0);assert.equal(state.pending.size,1);assert.equal(state.duplicates,9999);checks.push('10,000 duplicate attempts own one actual dial and no duplicate queue');
 const unique=Array.from({length:10000},(_,i)=>dialer.dial(peer('other-'+i)));await flush();assert.equal(state.pending.size,32);assert.equal(dialer.dialingQueue.length,31);assert.equal(state.active.size,1);checks.push('10,000 slow unique peers share a 32-peer pending ceiling');
 dialer.stop();assert.equal(dialer.dialingQueue.length,0);assert.equal(state.pending.size,1);assert.equal(state.active.size,1);checks.push('stop clears queued jobs and preserves the actual active dial credit');
 dialGate.resolve();await Promise.all([...duplicate,...unique]);assert.equal(state.pending.size,0);assert.equal(state.active.size,0);
 dialer.start();await dialer.dial(peer('same-peer'));assert.equal(actualDials,2);assert.equal(state.pending.size,0);checks.push('a settled peer can be dialed again after restart');
 const pings=Array.from({length:10000},()=>keepAliveManager.pingLibp2p(peer('same-peer')));await flush();assert.equal(actualPings,1);assert.equal(state.pings.size,1);pingGate.resolve(12);await Promise.all(pings);assert.equal(state.pings.size,0);checks.push('10,000 timer firings share one actual ping until it settles');
 assert.throws(()=>c.installWakuLifetimeGuards({connectionManager:{}}),/incompatible/);checks.push('an incompatible pinned dependency fails closed before discovery starts');
 const preflightGate=deferred();let preflightDials=0;const delayedDialer=new Dialer({libp2p:{getPeers:()=>[],dial:async()=>{preflightDials++}},shardReader:{hasShardInfo:()=>preflightGate.promise},options:{maxDialingPeers:3,dialCooldown:0,failedDialCooldown:60}}),delayed=c.installWakuLifetimeGuards({connectionManager:{dialer:delayedDialer,keepAliveManager:{pingLibp2p(){}}}}),preflights=Array.from({length:32},(_,i)=>delayedDialer.dial(peer('preflight-'+i)));await flush();delayedDialer.stop();assert.equal(delayed.pending.size,32);assert.equal(delayed.admitting.size,32);assert.equal(delayedDialer.dialingQueue.length,0);delayedDialer.start();preflightGate.resolve(false);await Promise.all(preflights);assert.equal(delayedDialer.dialingQueue.length,0);assert.equal(preflightDials,0);assert.equal(delayed.pending.size,0);assert.equal(delayed.admitting.size,0);await delayedDialer.dial(peer('preflight-0'));assert.equal(preflightDials,1);delayedDialer.stop();checks.push('stop/restart rejects delayed preflight generations and holds their credits until true settlement');
 console.log(JSON.stringify({passed:true,checks,actualDials,actualPings,dropped:state.dropped,duplicates:state.duplicates,queued:dialer.dialingQueue.length,pending:state.pending.size},null,2));
}finally{dialer.stop();dialGate.resolve();pingGate.resolve(12)}
