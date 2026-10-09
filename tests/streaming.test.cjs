const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function functionSource(name) {
  const start = html.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.notEqual(start, -1, `function ${name} exists`);
  const next = html.slice(start + 1).search(/^(?:async )?function /m);
  return html.slice(start, next < 0 ? undefined : start + 1 + next);
}
function context(names) {
  let now = 1000;
  const c = vm.createContext({
    performance: { now: () => now },
    CHUNK_SIZE: 512 * 1024, SCHEDULER_TICK_MS: 180,
    MP4_MSE_TARGET_BUDGET_BYTES: 384 * 1024 * 1024,
    MP4_RAM_QUEUE_BUDGET_BYTES: 64 * 1024 * 1024,
    MP4_QUEUE_HIGH_BYTES: 48 * 1024 * 1024, MP4_QUEUE_HIGH_SEGMENTS: 48,
    STREAM_STARTUP_LANES: 12, STREAM_MIN_PER_SOURCE: 8, IS_MOBILEISH: false,
    SAFE_HOT_BATCH_CHUNKS: 24, SAFE_CRITICAL_WINDOW: 32, DECODER_HEAD_HEDGE_WIDTH: 3,
    streamLargeTier: () => 0,
    mp4ProgressiveCursor: s => s.head || 0,
    mp4QueuePressure: p => p.queue || { bytes: 0, segments: 0 },
    streamBufferedAhead: p => p.ahead,
    streamAverageMediaBytesPerSecond: p => p.c.size / p.originalDurationSeconds,
    mediaOriginalDuration: p => p.originalDurationSeconds || 0,
  });
  for (const name of names) vm.runInContext(functionSource(name), c);
  c.advance = ms => { now += ms; };
  return c;
}
const controlFunctions = ['contentChunkSize', 'mp4SafeRamHorizon', 'streamSafeBand', 'safeBufferCritical', 'updateSafeRateController', 'noteStreamDelivery', 'streamRefillWindowCaps', 'streamPendingCap', 'streamTargetSeconds'];
function plant() {
  const p = { c: { size: 300000000 }, originalDurationSeconds: 1000, media: { currentTime: 0, playbackRate: 1, seeking: false }, ahead: 4 };
  const s = { mode: 'stream', total: 600, chunkSize: 512 * 1024, inflight: new Map(), holders: new Set(['seed']), deliveryLatency: .2, deliveryJitter: .01 };
  p.session = s;
  return { p, s };
}
test('fetch planning preserves MP4 segment state on buffered seeks and gap heals', () => {
  const c = context(['contentChunkSize', 'mp4ChunkForTime', 'streamChunkForTime']);
  let seekCalls = 0;
  const tracks = new Map([
    [1, [{ cts: 0, timescale: 1000, offset: 1000, is_sync: true }, { cts: 2000, timescale: 1000, offset: 1800000, is_sync: true }, { cts: 3000, timescale: 1000, offset: 3000000, is_sync: false }]],
    [2, [{ cts: 0, timescale: 48000, offset: 2000 }, { cts: 144000, timescale: 48000, offset: 2200000 }]],
  ]);
  const parser = { nextSample: 900, getTrackSamplesInfo: id => tracks.get(id), seek() { seekCalls++; this.nextSample = 0; return { offset: 0 }; } };
  const p = { mode: 'mp4box', mp4boxReady: true, mp4box: parser, c: { chunkSize: 512 * 1024 }, mp4TrackBuffers: new Map([[1, { __trackKind: 'V' }], [2, { __trackKind: 'A' }]]) };
  const s = { total: 100 };
  assert.equal(c.streamChunkForTime(p, s, 3, true), 3); // preceding video RAP, not the non-RAP at 3s
  assert.equal(c.streamChunkForTime(p, s, .015, true), 0);
  assert.equal(parser.nextSample, 900);
  assert.equal(seekCalls, 0);
  p.c.locked = true; p.c.plainChunkSize = 65536;
  assert.equal(c.streamChunkForTime(p, s, 3, true), 27);
});
test('SAFE target and request horizon adapt to delivery latency, jitter and playback consumption', () => {
  const c = context(controlFunctions), { p, s } = plant();
  const initial = c.streamSafeBand(s, p);
  c.updateSafeRateController(p, s, p.ahead);
  const initialHorizon = c.streamTargetSeconds(p, s);
  s.deliveryLatency = 2; s.deliveryJitter = .6; p.media.playbackRate = 4;
  c.advance(500); p.media.currentTime = 2; p.ahead = 2;
  c.updateSafeRateController(p, s, p.ahead);
  const changed = c.streamSafeBand(s, p);
  assert.ok(changed.high > initial.high);
  assert.ok(c.streamTargetSeconds(p, s) > initialHorizon);
  assert.ok(s.safeSupplyRate > p.media.playbackRate);
  assert.ok(s.safeSlopeEma < 0);
  assert.ok(s.safeRequestChunks > 1);
  assert.ok(c.streamPendingCap(s) <= c.MP4_RAM_QUEUE_BUDGET_BYTES / s.chunkSize);
});
test('falling SAFE increases acquisition even when bulk throughput remains positive', () => {
  const c = context(controlFunctions), { p, s } = plant();
  p.ahead = 3; c.updateSafeRateController(p, s, p.ahead);
  const before = s.safeSupplyRate;
  c.advance(1000); p.media.currentTime = 1; p.ahead = 1;
  c.updateSafeRateController(p, s, p.ahead);
  assert.ok(s.safeSupplyRate > before);
  assert.ok(s.safePlantPressure > 0);
  assert.ok(c.safeBufferCritical(p, s));
});
test('duplicate callback bursts do not create fictitious PID samples', () => {
  const c = context(controlFunctions), { p, s } = plant();
  const first = c.updateSafeRateController(p, s, p.ahead);
  c.advance(1);
  assert.equal(c.updateSafeRateController(p, s, p.ahead + 20), first);
  assert.equal(s.safeCtlAhead, p.ahead);
});
test('queue saturation prevents integral windup and memory is a byte bound', () => {
  const c = context(controlFunctions), { p, s } = plant();
  p.queue = { segments: 48, bytes: 0 }; p.ahead = 0;
  c.updateSafeRateController(p, s, 0);
  c.advance(1000); c.updateSafeRateController(p, s, 0);
  assert.equal(s.safeIntegral, 0);
  const firstCeiling = c.mp4SafeRamHorizon(p);
  p.c.size *= 2;
  assert.equal(c.mp4SafeRamHorizon(p), firstCeiling / 2);
});
test('delivery measurement includes the original request across retries', () => {
  const c = context(controlFunctions), { s } = plant();
  s.requestedAt = new Map([[10, 1000]]);
  c.advance(1500); c.noteStreamDelivery(s, 10);
  assert.ok(s.deliveryLatency > .2);
  assert.ok(s.deliveryJitter > .01);
  assert.equal(s.requestedAt.has(10), false);
});
test('decoder admission follows the moving horizon and independently reopens as playback consumes it', () => {
  const c = context([...controlFunctions, 'mp4DecoderSupplyGate']), { p, s } = plant();
  c.drainMp4SourceBuffers = () => {};
  c.previewDebugEvent = () => {};
  p.mode = 'mp4box'; p.mp4boxReady = true;
  p.mp4TrackBuffers = new Map([[1, { __queuedMediaEnd: 100 }], [2, { __queuedMediaEnd: 100 }]]);
  assert.equal(c.mp4DecoderSupplyGate(p, s), false);
  p.media.currentTime = 98; p.ahead = 2; c.advance(1000);
  assert.equal(c.mp4DecoderSupplyGate(p, s), true);
});
test('a leading video queue cannot suppress input needed by the audio track', () => {
  const c = context([...controlFunctions, 'mp4DecoderSupplyGate']), { p, s } = plant();
  c.drainMp4SourceBuffers = () => {};
  c.previewDebugEvent = () => {};
  p.mode = 'mp4box'; p.mp4boxReady = true; p.ahead = 0;
  p.mp4TrackBuffers = new Map([[1, { __queuedMediaEnd: 100 }], [2, { __queuedMediaEnd: 0 }]]);
  assert.equal(c.mp4DecoderSupplyGate(p, s), true);
});
test('plant callbacks preserve the moving request window and reclaim only on changed demand', () => {
  const c = context([...controlFunctions, 'preemptForDecoderUrgent', 'driveSafePlant']);
  const { p, s } = plant();
  p.mode = 'mp4box'; p.mp4boxReady = true;
  s.state = 'downloading'; s.safeRequestChunks = 40;
  s.retry = []; s.inflightByPeer = new Map([['seed', 3]]);
  s.inflight = new Map([[0, { actor: 'seed', ts: 1000 }], [80, { actor: 'seed', ts: 1000 }], [200, { actor: 'seed', ts: 1000 }]]);
  c.activePreview = p;
  c.updateSafeRateController = () => ({ deficit: 1, pressure: 2 });
  c.bitHas = () => false;
  for (const name of ['drainMp4SourceBuffers', 'requestDecoderUrgent', 'hedgeDecoderHead', 'scheduleSession', 'ensureDecoderFrontier', 'previewDebugEvent']) c[name] = () => {};
  c.driveSafePlant(p);
  assert.ok(s.inflight.has(80), 'useful reservation inside the dynamic window survives');
  assert.ok(!s.inflight.has(200), 'distant reservation yields to decoder demand');
  // Simulate background prefetch between callbacks at the same head/pressure.
  s.inflight.set(201, { actor: 'seed', ts: 1000 });
  c.driveSafePlant(p);
  assert.ok(s.inflight.has(201), 'identical callbacks do not churn reservations');
  s.head = 1;
  c.driveSafePlant(p);
  assert.ok(!s.inflight.has(201), 'advancing the head can reclaim capacity again');
});

test('remote viewers and queued uploads keep seeder transports active until demand expires', () => {
  const c=context(['pruneStreamDemands','meshHasActiveTransfer']);
  Object.assign(c,{remoteStreamDemands:new Map(),serveQueues:new Map(),sessions:new Map(),activePreview:null,localLive:null,activeLiveViewer:null});
  assert.equal(c.meshHasActiveTransfer(),false);
  c.remoteStreamDemands.set('movie',new Map([['viewer',{expires:Date.now()+10000}]]));
  assert.equal(c.meshHasActiveTransfer(),true);
  c.remoteStreamDemands.get('movie').get('viewer').expires=0;
  assert.equal(c.meshHasActiveTransfer(),false);
  c.serveQueues.set('upload',Promise.resolve());
  assert.equal(c.meshHasActiveTransfer(),true);
});

test('an obsolete NATS close callback cannot close the replacement session', () => {
  const c=context(['closeNatsPeer']);let closed=0;
  const old={closed:false},live={closed:false,pc:{close(){closed++}},dc:{close(){closed++}}};
  Object.assign(c,{natsState:{sessions:new Map([['viewer',live]])},wrappers:new Map(),updateMeshState(){},untrack(){}});
  c.closeNatsPeer('viewer',old);
  assert.equal(c.natsState.sessions.get('viewer'),live);assert.equal(closed,0);
  // close() may synchronously dispatch another callback; deletion must precede it.
  live.pc.close=()=>{closed++;c.closeNatsPeer('viewer',live)};
  c.closeNatsPeer('viewer',live);
  assert.equal(closed,2);assert.equal(c.natsState.sessions.size,0);
});

test('a late NATS data channel cannot overwrite the current peer record', () => {
  const c=context(['attachNatsChannel']);let rejected=0;
  const live={session:'new',pc:{},closed:false};c.natsState={sessions:new Map([['viewer',live]])};
  c.attachNatsChannel('viewer','old',{}, {close(){rejected++}});
  assert.equal(rejected,1);assert.equal(c.natsState.sessions.get('viewer'),live);assert.equal(live.dc,undefined);
});

test('an offer superseded while awaiting SDP cannot publish or close the replacement', async () => {
  const c=context(['closeNatsPeer','makeNatsOffer']);let resolveOffer,localDescriptions=0,signals=0;
  const pc={createDataChannel:()=>({}),createOffer:()=>new Promise(r=>{resolveOffer=r}),setLocalDescription(){localDescriptions++},close(){}};
  Object.assign(c,{actor:'seed',privacyRtcAvailable:()=>true,crypto:{randomUUID:()=> 'old'},RTCPeerConnection:function(){return pc},rtcConfig:()=>({}),attachNatsChannel(){},natsState:{sessions:new Map()},wrappers:new Map(),updateMeshState(){},untrack(){},waitIce:async()=>{},natsSignal:async()=>{signals++}});
  const pending=c.makeNatsOffer('viewer'),old=c.natsState.sessions.get('viewer');
  c.closeNatsPeer('viewer',old);const live={session:'new',closed:false};c.natsState.sessions.set('viewer',live);
  resolveOffer({type:'offer',sdp:'obsolete'});await pending;
  assert.equal(localDescriptions,0);assert.equal(signals,0);assert.equal(c.natsState.sessions.get('viewer'),live);
});

test('a direct sender returning false permits fallback to the next route', async () => {
  const c=context(['sendDirectBinaryActor']);let failures=0,fallback=0;
  const routes=[{strategy:'nats',routeId:'closed',wrapper:{bin:{send:async()=>false}}},{strategy:'torrent',routeId:'live',wrapper:{bin:{send:async()=>{fallback++;return true}}}}];
  Object.assign(c,{bulkRoutesFor:()=>routes,markRouteFailure:()=>{failures++}});
  assert.equal(await c.sendDirectBinaryActor('viewer',new Uint8Array()),true);
  assert.equal(failures,1);assert.equal(fallback,1);
});

test('a control sender returning false is reported as failure', async () => {
  const c=context(['sendPacketVia']);let failures=0;
  Object.assign(c,{routeActors:new Map([['route','viewer']]),peerRoutes:new Map([['viewer',new Map([['route',{}]])]]),routeKey:()=> 'route',markRouteFailure:()=>{failures++}});
  assert.equal(await c.sendPacketVia({ctl:{send:async()=>false}},'packet','peer'),false);
  assert.equal(failures,1);
});

test('one hung carrier cannot delay a successful independent send', async () => {
  const c=context(['firstSuccessfulSend']);
  assert.equal(await c.firstSuccessfulSend([new Promise(()=>{}),Promise.resolve(true)]),true);
  assert.equal(await c.firstSuccessfulSend([Promise.reject(Error('closed')),Promise.resolve(false)]),false);
  assert.equal(await c.firstSuccessfulSend([]),false);
});

function relayContext(){
  const c=context(['firstSuccessfulSend','relayWriteBacklog','reserveRelayWrite','publishRelayBinaryFrames']);
  Object.assign(c,{relayWriteReservations:new WeakMap(),natsState:{nc:null},mqttRelayState:{ready:new Set(),clients:new Map(),topic:'room'},natsSubjects:()=>({relay:'room'}),enc:new TextEncoder()});
  return c;
}
test('relay admission retains actual pending writes and reserves room for the frontier', () => {
  const c=relayContext(),client={protocol:{transport:{socket:{bufferedAmount:0}}}},chunk=900000;
  const release=c.reserveRelayWrite(client,chunk);
  assert.equal(typeof release,'function');
  assert.equal(c.reserveRelayWrite(client,chunk),null,'ordinary bulk cannot grow the wire queue');
  const emergency=c.reserveRelayWrite(client,chunk,true);
  assert.equal(typeof emergency,'function','frontier has independent reserved capacity');
  release();release();emergency();assert.equal(c.relayWriteReservations.get(client).bytes,0);
  client.protocol.transport.socket.bufferedAmount=10*1024*1024;
  assert.equal(c.reserveRelayWrite(client,chunk,true),null,'underlying socket backlog also counts');
});
test('NATS admits whole chunks and holds capacity until broker flush completes', async () => {
  const c=relayContext();let published=0,flush;
  const nc={publish(){published++},flush:()=>new Promise(r=>{flush=r})};c.natsState.nc=nc;
  const frames=['x'.repeat(450000),'y'.repeat(450000)];
  const first=c.publishRelayBinaryFrames('nats',frames);
  assert.equal(published,2);
  assert.equal(await c.publishRelayBinaryFrames('nats',frames),false);
  assert.equal(published,2,'no fragments of an unadmitted chunk are published');
  flush();assert.equal(await first,true);assert.equal(c.relayWriteReservations.get(nc).bytes,0);
});
test('MQTT requires acknowledgement of every fragment and ignores a hung alternate broker', async () => {
  const c=relayContext();
  const hung={connected:true,publish(){}},live={connected:true,publish(t,raw,opts,cb){cb()}};
  c.mqttRelayState.clients=new Map([['hung',hung],['live',live]]);c.mqttRelayState.ready=new Set(['hung','live']);
  assert.equal(await c.publishRelayBinaryFrames('mqtt',['one','two']),true);
  live.publish=(t,raw,opts,cb)=>cb(raw==='two'?Error('rejected'):null);
  c.mqttRelayState.ready=new Set(['live']);
  assert.equal(await c.publishRelayBinaryFrames('mqtt',['one','two']),false);
});

test('stream dispatch exploits the proven path instead of striping onto an unproven carrier', async () => {
  const c=context(['firstSuccessfulSend','chooseReinforcedPath','sendBinaryMultipathActor']);
  const paths=[{path:'relay:nats',bps:2000000,score:500},{path:'relay:mqtt',bps:0,score:18}],sent=[];
  Object.assign(c,{STREAM_PATH_STRONG_SCORE:100,STREAM_PATH_EXPLORE_EVERY:16,streamDataCandidates:()=>paths,boundedStreamPathSend:async(remote,p)=>{sent.push(p.path);return true}});
  for(let idx=1;idx<16;idx++)await c.sendBinaryMultipathActor('viewer',new Uint8Array(),{idx});
  assert.deepEqual(sent,Array(15).fill('relay:nats'));
  sent.length=0;await c.sendBinaryMultipathActor('viewer',new Uint8Array(),{idx:16});
  assert.deepEqual(sent,['relay:mqtt'],'bounded exploration remains available');
  sent.length=0;await c.sendBinaryMultipathActor('viewer',new Uint8Array(),{idx:17,decoderHead:true});
  assert.deepEqual(sent,['relay:nats'],'ordinary decoder lookahead does not duplicate every chunk');
  sent.length=0;await c.sendBinaryMultipathActor('viewer',new Uint8Array(),{idx:17,decoderHead:true,frontierRescue:true});
  assert.deepEqual(sent,['relay:nats','relay:mqtt'],'the irreplaceable missing head still races independent carriers');
});

test('mobile kickoff opens relay paths while asynchronous media setup has no session yet', () => {
  const c=context(['wakeTransferTransports']),calls=[],timers=[];
  Object.assign(c,{IS_MOBILEISH:true,meshStopped:false,document:{hidden:false},activePreview:{hiddenAt:0,session:null},natsState:{nc:{}},mqttRelayState:{ready:new Set()},nostrRelayState:{pool:null},wrappers:new Map(),nknState:{client:null,starting:null},meshHasActiveTransfer:()=>false,privacyEnabled:()=>false,meshEpochNow:()=>0,startMqttRelay:async()=>calls.push('mqtt'),startNostrRelay:async()=>calls.push('nostr'),startNkn:async()=>calls.push('nkn'),joinStrategy:async()=>calls.push('rtc'),setTimeout:(fn,ms)=>timers.push([fn,ms]),TRANSFER_ALT_PLANE_WAKE_MS:350});
  c.wakeTransferTransports();
  assert.deepEqual(calls,['mqtt','nostr','rtc','nkn']);assert.equal(timers.length,0);
  calls.length=0;c.IS_MOBILEISH=false;c.wakeTransferTransports();
  assert.equal(calls.length,0);assert.equal(timers.length,2);
  c.activePreview=null;for(const [fn]of timers)fn();
  assert.equal(calls.length,0,'closing an idle preview cancels its deferred wake');
});

test('unproven mobile startup races brokers instead of a merely advertised overlay route', async () => {
  const c=context(['firstSuccessfulSend','chooseReinforcedPath','sendBinaryMultipathActor']);
  const paths=[{path:'direct:nkn:advertised',bps:0,score:575},{path:'relay:nats',bps:0,score:18},{path:'relay:mqtt',bps:0,score:18}],sent=[];
  Object.assign(c,{STREAM_PATH_STRONG_SCORE:100,STREAM_PATH_EXPLORE_EVERY:32,streamDataCandidates:()=>paths,boundedStreamPathSend:async(remote,p)=>{sent.push(p.path);return true}});
  await c.sendBinaryMultipathActor('viewer',new Uint8Array(),{idx:0,mobileStartup:true,decoderHead:true,frontierRescue:true});
  assert.deepEqual(sent,['relay:nats','relay:mqtt']);
  // Delivery evidence ends the special bootstrap race, even before playback.
  sent.length=0;paths.splice(0,paths.length,{path:'relay:nats',bps:2000000,score:500},{path:'relay:mqtt',bps:0,score:18});
  await c.sendBinaryMultipathActor('viewer',new Uint8Array(),{idx:3,mobileStartup:true,decoderHead:true},0,[{path:'relay:nats',strong:true,bps:2000000}]);
  assert.deepEqual(sent,['relay:nats']);
});

test('mobile relay reservations follow PID demand and the byte budget through recovery', () => {
  const c=context(['streamPendingCap','streamPeerWindow']);
  Object.assign(c,{IS_MOBILEISH:true,STREAM_MIN_PER_SOURCE:4,STREAM_STARTUP_LANES:8,MP4_RAM_QUEUE_BUDGET_BYTES:24*1024*1024,RELAY_PER_SEEDER_WINDOW:2,PER_SEEDER_WINDOW:6,bulkRoutesFor:()=>[]});
  const s={mode:'stream',total:500,chunkSize:512*1024,holders:new Set(['seed']),safeRequestChunks:8};
  assert.equal(c.streamPeerWindow(s,'seed'),8);
  s.safeRequestChunks=40;assert.equal(c.streamPeerWindow(s,'seed'),40,'latency and SAFE pressure can use the requested pipeline');
  s.safeRequestChunks=200;assert.equal(c.streamPeerWindow(s,'seed'),48,'RAM remains a physical byte bound');
  assert.equal(c.streamPeerWindow(s,'seed',['seed','other']),24,'independent sources retain a fair share');
  s.safeRequestChunks=6;assert.equal(c.streamPeerWindow(s,'seed'),6,'the window shrinks with recovered demand');
  Object.assign(c,{streamUrgency:()=>20,streamPeerSuccessfulPathCount:()=>1,STREAM_BOOST_RELAY_PER_SEEDER:12,STREAM_BOOST_PER_SEEDER:24});
  c.IS_MOBILEISH=false;s.safeRequestChunks=200;
  assert.equal(c.streamPeerWindow(s,'seed'),12,'desktop keeps its existing relay pipeline');
  c.IS_MOBILEISH=true;c.bulkRoutesFor=()=>[{}];
  assert.equal(c.streamPeerWindow(s,'seed'),24,'direct delivery keeps its existing pipeline');
  c.bulkRoutesFor=()=>[];
  s.mode='download';assert.equal(c.streamPeerWindow(s,'seed'),2);
});

test('received relay bytes outrank a connected overlay with no payload evidence', () => {
  const c=context(['streamDataCandidates']);
  Object.assign(c,{healthyRoutesFor:()=>[{wrapper:{key:'nkn'}}],streamPathIdFromRoute:r=>'direct:'+r.wrapper.key,localRelayPlanes:()=>['nats','mqtt'],remoteRelayPlanes:()=>['nats','mqtt'],relayPlaneName:x=>x,peerIngress:new Map(),relayActors:new Map(),RELAY_PLANES:['nats','mqtt'],routeScore:()=>2000,bc:null});
  const candidates=c.streamDataCandidates('seed',[{path:'relay:nats',bps:500000,chunks:1,score:300}]);
  assert.equal(candidates[0].path,'relay:nats','actual delivery wins before the strong-path threshold');
  assert.equal(candidates[1].path,'direct:nkn','unproven paths remain available as fallbacks');
});

test('decoder progress retires queued copies delivered by rescue and rejects late stale requests', async () => {
  const c=context(['queueServeChunks']),sent=[],pending=[];
  Object.assign(c,{serveQueues:new Map(),bulkRoutesFor:()=>[],serveChunksNow:async m=>{sent.push(m.indexes[0]);await new Promise(r=>pending.push(r))}});
  const m={mode:'stream',id:'movie',sid:'session',decoderHead:true,decoderCursor:0,indexes:[0,1,2,3,4,5,6,7,8,9]};
  await c.queueServeChunks(m,'viewer');
  assert.deepEqual(sent,[0,1]);
  await c.queueServeChunks({...m,decoderCursor:8,indexes:[8,9]},'viewer');
  await c.queueServeChunks({mode:'stream',id:'movie',sid:'session',indexes:[40],demandPush:true},'viewer');
  assert.equal(c.serveQueues.get('viewer|movie').decoderCursor,8,'a speculative demand push cannot acknowledge decoder input');
  await c.queueServeChunks({...m,decoderCursor:8,indexes:[8,9],safeCritical:true,focusChunks:2},'viewer');
  await c.queueServeChunks({...m,indexes:[2,3,4]},'viewer');
  const q=c.serveQueues.get('viewer|movie');
  assert.deepEqual([...q.hot.keys()],[8,9]);
  for(const done of pending.splice(0))done();
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(sent,[0,1,8,9],'already-consumed input does not compete with the new frontier');
  for(const done of pending.splice(0))done();
  await new Promise(r=>setImmediate(r));
  assert.equal(c.serveQueues.size,0);
});

test('normal decoder lookahead can use reserved relay capacity before it becomes a rescue', async () => {
  const c=context(['publishRelayBinaryPacket']),admissions=[];
  Object.assign(c,{actor:'source',localRelayPlanes:()=>['nats'],relayBinaryFrameChars:()=>48000,relayBinaryFrames:async()=>['frame'],publishRelayBinaryFrames:async(plane,frames,critical)=>{admissions.push(critical);return true},firstSuccessfulSend:async jobs=>(await Promise.all(jobs)).some(Boolean)});
  await c.publishRelayBinaryPacket(new Uint8Array(),{decoderHead:true},'viewer');
  await c.publishRelayBinaryPacket(new Uint8Array(),{},'viewer');
  assert.deepEqual(admissions,[true,false]);
});
