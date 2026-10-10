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
    activePreview: null,
    SAFE_HOT_BATCH_CHUNKS: 24, SAFE_CRITICAL_WINDOW: 32, DECODER_HEAD_HEDGE_WIDTH: 3,
    streamLargeTier: () => 0,
    mp4ProgressiveCursor: s => s.head || 0,
    mp4QueuePressure: p => p.queue || { bytes: 0, segments: 0 },
    streamBufferedAhead: p => p.ahead,
    streamBufferedState: p => ({time:p.media.currentTime,ahead:p.ahead,inRange:p.ahead>0}),
    streamAverageMediaBytesPerSecond: p => p.c.size / p.originalDurationSeconds,
    mediaOriginalDuration: p => p.originalDurationSeconds || 0,
  });
  for (const name of names) vm.runInContext(functionSource(name), c);
  c.advance = ms => { now += ms; };
  return c;
}
const controlFunctions = ['contentChunkSize', 'mp4SafeRamHorizon', 'streamSafeBand', 'safeBufferCritical', 'updateSafeRateController', 'noteStreamDelivery', 'streamRefillWindowCaps', 'streamPendingCap', 'streamTargetSeconds'];
test('relay lookahead follows receiver pressure inside the complete-frame byte budget', () => {
  const c=context(['streamRelayDispatchWindow']),chunk=512*1024;
  assert.equal(c.streamRelayDispatchWindow(chunk,1),2);
  assert.equal(c.streamRelayDispatchWindow(chunk,2),3);
  assert.equal(c.streamRelayDispatchWindow(chunk,100),3);
  assert.equal(c.streamRelayDispatchWindow(chunk,1,true),3);
  c.MP4_RAM_QUEUE_BUDGET_BYTES=1024*1024;
  assert.equal(c.streamRelayDispatchWindow(chunk,100),1,'memory bound overrides pressure');
});
test('STREAM preserves explicit Play intent across asynchronous unlock and decoder setup', async () => {
  const c=context(['openPreview']);
  let unlock;c.requireUnlocked=()=>new Promise(r=>{unlock=r});
  c.navigator={userActivation:{isActive:true}};c.activePreview=null;
  c.contents=new Map([['movie',{id:'movie'}]]);c.localHave=new Set();
  c.cleanupPreview=()=>{};c.syncVisualViewport=()=>{};c.previewDebugState=()=>{};c.refreshPreviewStats=()=>{};
  c.previewKind=()=> 'video';c.visibleName=()=> 'movie.mp4';c.visibleType=()=> 'video/mp4';c.inferMime=()=> 'video/mp4';
  c.visibleSize=()=>1;c.fmtBytes=()=> '1 MB';c.seedCount=()=>1;c.getReadableFile=async()=>null;c.startRemotePreview=async()=>{};
  c.$=()=>({classList:{add(){}},style:{}});
  const entry={contentId:'movie'};
  const opening=c.openPreview(entry);
  c.navigator.userActivation.isActive=false;unlock(true);await opening;
  assert.equal(c.activePreview.userPlayRequested,true,'the STREAM gesture survives async setup');
  c.requireUnlocked=async()=>true;await c.openPreview(entry);
  assert.equal(c.activePreview.userPlayRequested,false,'background opens retain automatic buffering policy');
});
test('MP4 source detection supports managed-only browsers and retains classic MSE when available', () => {
  const c=context(['previewMediaSourceType']);
  const classic=function(){},managed=function(){};
  c.window={ManagedMediaSource:managed};assert.equal(c.previewMediaSourceType(),managed);
  c.window.MediaSource=classic;assert.equal(c.previewMediaSourceType(),classic);
  c.window={};assert.equal(c.previewMediaSourceType(),null);
});
test('MP4 decoder uses a valid alternate when the first CDN fails or hangs', async () => {
  const c = context(['loadMp4BoxModule']);
  c.MP4BOX_VERSION = '2.4.1'; c.mp4BoxModulePromise = null;
  const module = { createFile() {} }, calls = [];
  c.importMp4BoxModule = async url => {
    calls.push(url);
    if(url.includes('jsdelivr')) return new Promise(() => {});
    return { default: module };
  };
  const loaded = await c.loadMp4BoxModule();
  assert.equal(loaded.module, module);
  assert.match(loaded.url, /unpkg/);
  assert.equal(calls.length, 2);
  assert.equal((await c.loadMp4BoxModule()).module, module);
  assert.equal(calls.length, 2, 'successful decoder is reused');
  c.mp4BoxModulePromise = null;
  c.importMp4BoxModule = async url => {
    if(url.includes('jsdelivr')) throw Error('blocked');
    return module;
  };
  assert.equal((await c.loadMp4BoxModule()).module, module);
});
test('unavailable or invalid MP4 modules fail explicitly and allow a later retry', async () => {
  const c = context(['loadMp4BoxModule']);
  c.MP4BOX_VERSION='2.4.1'; c.mp4BoxModulePromise=null;
  c.importMp4BoxModule=async()=>({});
  await assert.rejects(c.loadMp4BoxModule(), /MP4 decoder could not load/);
  assert.equal(c.mp4BoxModulePromise, null);
  c.importMp4BoxModule=async()=>({createFile(){}});
  assert.equal(typeof (await c.loadMp4BoxModule()).module.createFile, 'function');
});
test('compatibility SAFE rejects a truncated Blob that advertises the whole movie', () => {
  const c = context(['timeRangesList', 'decoderBufferedRanges', 'streamBufferedAhead', 'streamBufferedState']);
  const p = { mode:'compat', media:{currentTime:89.7,buffered:{length:1,start:()=>0,end:()=>6472.54}} };
  assert.equal(c.streamBufferedAhead(p), 0);
  assert.equal(c.streamBufferedState(p).inRange, false);
  p.compatPlaybackReady=true; // only set when a complete verified source is loaded
  assert.ok(Math.abs(c.streamBufferedAhead(p)-6382.84)<.001);
});
test('native compatibility never replaces playback with partial file prefixes', async () => {
  const c = context(['pumpCompatMedia']);
  const s={total:1401,receivedCount:71,networkComplete:false};
  const p={mode:'compat',session:s,media:{},mime:'video/mp4'};
  c.activePreview=p;c.$=()=>({});let assemblies=0,loads=0;
  c.materializeCompatInput=async()=>{assemblies++;return{}};
  c.setCompatPlaybackBlob=async()=>{loads++;p.compatPlaybackReady=true};
  c.previewDebugEvent=()=>{};
  await c.pumpCompatMedia(true);
  assert.equal(assemblies,0);assert.equal(loads,0);
  s.receivedCount=s.total; // hash verification has not completed yet
  await c.pumpCompatMedia(true);assert.equal(loads,0);
  s.networkComplete=true;
  await Promise.all([c.pumpCompatMedia(true),c.pumpCompatMedia(true)]);
  await c.pumpCompatMedia(true);
  assert.equal(assemblies,1);assert.equal(loads,1);
});
test('compatibility acquisition continues to EOF without accumulating decoded parts', async () => {
  const c = context(['ensureStreamHorizon', 'consumePreviewChunk', 'streamDecoderShouldConsume', 'safeFocusActive']);
  const s={mode:'stream',state:'downloading',total:1401,decoderLimit:62,streamRequestLimit:787,decoderUrgent:new Set()};
  const p={kind:'video',mode:'compat',session:s,media:{currentTime:89},parts:[]};
  c.activePreview=p;let scheduled=0;
  c.scheduleSession=()=>scheduled++;c.pumpCompatMedia=async()=>{};
  c.ensureStreamHorizon('tick',true);
  assert.equal(s.streamRequestLimit,1401);assert.equal(s.decoderLimit,1401);
  assert.equal(c.safeFocusActive(s),false);
  assert.equal(c.streamDecoderShouldConsume(p,s,1000),true);
  assert.equal(await c.consumePreviewChunk(s,1000,new Uint8Array(1)),true);
  assert.equal(p.parts.length,0);assert.equal(scheduled,1);
});
test('native MSE removal does not skip a chunk and stale callbacks cannot restart a failed buffer', () => {
  const c=context(['nativeMseUpdateEnd']);
  let pumped=0;c.pumpMsePreview=()=>pumped++;c.markPreviewPlayable=()=>{};c.growStreamWindow=()=>{};
  const sb={},p={mode:'mse',sourceBuffer:sb,appendIndex:10,appending:false};
  c.nativeMseUpdateEnd(p,sb);assert.equal(p.appendIndex,10);
  p.appending=true;c.nativeMseUpdateEnd(p,sb);assert.equal(p.appendIndex,11);
  assert.equal(p.appending,false);
  p.mode='compat';p.sourceBuffer=null;
  c.nativeMseUpdateEnd(p,sb);assert.equal(pumped,2);assert.equal(p.appendIndex,11);
});
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
test('refill protects the lower band before a measured response can spend it', () => {
  const c=context(controlFunctions),{p,s}=plant();
  s.deliveryLatency=6;s.deliveryJitter=1;
  const band=c.streamSafeBand(s,p);
  p.ahead=band.low+band.recovery/2;
  assert.ok(p.ahead>band.low,'the actual lower band has not been crossed');
  assert.ok(c.safeBufferCritical(p,s),'decoder priority starts before crossing it');
  c.updateSafeRateController(p,s,p.ahead);
  assert.ok(s.safeSupplyRate>=1.5-1e-9,'acquisition covers the projected floor deficit');
  assert.ok(band.high>=band.low+band.rate*band.recovery,'upper reserve covers another measured response');
});
test('excess reserve cannot bank negative demand against the next refill', () => {
  const c=context(controlFunctions),{p,s}=plant();
  p.ahead=200;c.updateSafeRateController(p,s,p.ahead);
  for(let i=0;i<20;i++){c.advance(1000);p.media.currentTime++;p.ahead--;c.updateSafeRateController(p,s,p.ahead)}
  assert.equal(s.safeIntegral,0);
  s.safeIntegral=-10000;s.deliveryLatency=5;
  p.ahead=c.streamSafeBand(s,p).low+1;
  c.advance(1000);p.media.currentTime++;
  c.updateSafeRateController(p,s,p.ahead);
  assert.ok(s.safeIntegral>=0);
  assert.ok(s.safeSupplyRate>p.media.playbackRate);
});
test('a preceding production burst cannot dilute transport pressure below floor protection', () => {
  const c=context(controlFunctions),{p,s}=plant();
  s.safeProductionRate=50;s.deliveryLatency=5;p.ahead=2;
  c.updateSafeRateController(p,s,p.ahead);
  assert.ok(s.safePlantPressure>2,'carrier pressure follows required replacement, not stale burst throughput');
});
test('reserve recovery includes ordered decoding and A/V append, and remembers slow production', () => {
  const c=context(controlFunctions),{p,s}=plant();p.ahead=0;
  c.updateSafeRateController(p,s,0);
  c.advance(5000);p.ahead=2;
  c.updateSafeRateController(p,s,p.ahead);
  assert.equal(s.safeResponseTail,5);
  assert.ok(c.streamSafeBand(s,p).recovery>=5);
  c.advance(500);p.ahead=4;
  c.updateSafeRateController(p,s,p.ahead);
  assert.equal(s.safeResponseTail,5,'one quick fragment cannot erase a slow whole-plant response');
  p.ahead=100;s.safeSupplyHeld=true;c.advance(1000);c.updateSafeRateController(p,s,p.ahead);
  assert.equal(s.safeResponseWaitAt,0,'intentional reserve holds do not become delivery delays');
});
test('independently sampled playback clocks cannot masquerade as an A/V append', () => {
  const c=context(controlFunctions),{p,s}=plant();
  c.updateSafeRateController(p,s,p.ahead);s.safeResponseWaitAt=1000;
  c.advance(1000);p.media.currentTime=1;p.ahead=3;
  c.updateSafeRateController(p,s,3.0001);
  assert.equal(s.safeResponses,undefined,'unchanged buffered end is zero production');
  assert.equal(s.safeResponseWaitAt,1000);
});
test('first playable A/V after an uncached seek counts media produced, not the absolute timestamp', () => {
  const c=context(controlFunctions),{p,s}=plant();
  p.originalDurationSeconds=10000;p.c.size=3000000000;p.media.currentTime=1200;p.ahead=0;
  c.updateSafeRateController(p,s,0);
  c.advance(500);p.ahead=2;
  c.updateSafeRateController(p,s,p.ahead);
  assert.equal(s.safeGrowthQuantum,2,'two newly playable seconds do not become 1,202 seconds of production');
  assert.ok(c.streamSafeBand(s,p).low<10);
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
test('speculative queue age cannot inflate the decoder recovery band', () => {
  const c=context(controlFunctions),{p,s}=plant();
  p.mode='mp4box';p.mp4boxReady=true;c.activePreview=p;s.head=10;
  s.requestedAt=new Map([[10,1000],[400,1000]]);
  const before=c.streamSafeBand(s,p);
  c.advance(30000);c.noteStreamDelivery(s,400);
  assert.equal(s.deliveryQueueLatency,30);
  assert.equal(c.streamSafeBand(s,p).low,before.low,'tail queue residence is not a missing decoder response');
  s.safeWaitHead=10;s.safeWaitAt=29000;
  c.noteStreamDelivery(s,10);
  assert.ok(s.deliveryLatency<1,'only the actual contiguous input wait is measured');
  assert.ok(s.deliveryJitter<1);
});
test('a newly exposed decoder head does not inherit speculative reservation age', () => {
  const c=context(controlFunctions),{p,s}=plant();
  s.head=10;s.inflight.set(10,{ts:1000});
  const before=c.streamSafeBand(s,p);
  c.advance(30000);
  assert.equal(c.streamSafeBand(s,p).low,before.low);
  s.safeWaitHead=10;s.safeWaitAt=31000;
  c.advance(2000);
  assert.ok(c.streamSafeBand(s,p).low>before.low,'a real missing-frontier wait still raises protection');
});
test('verified decoder supply continues above the feedback horizon until the physical MSE budget', () => {
  const c = context([...controlFunctions, 'mp4DecoderSupplyGate']), { p, s } = plant();
  c.drainMp4SourceBuffers = () => {};
  c.previewDebugEvent = () => {};
  p.mode = 'mp4box'; p.mp4boxReady = true;
  p.mp4TrackBuffers = new Map([[1, { __queuedMediaEnd: 100 }], [2, { __queuedMediaEnd: 100 }]]);
  p.ahead=100;
  assert.equal(c.mp4DecoderSupplyGate(p, s), true,'a soft feedback target cannot strand ready cache bytes');
  p.ahead=c.mp4SafeRamHorizon(p);
  assert.equal(c.mp4DecoderSupplyGate(p,s),false,'physical media capacity still bounds decoder admission');
  p.media.currentTime=1;p.ahead--;c.advance(1000);
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
test('queued fragments do not end response measurement before A/V becomes playable', () => {
  const c=context([...controlFunctions,'mp4DecoderSupplyGate']),{p,s}=plant();
  c.drainMp4SourceBuffers=()=>{};c.previewDebugEvent=()=>{};
  p.mode='mp4box';p.mp4boxReady=true;p.ahead=0;
  p.queue={segments:48,bytes:0};
  p.mp4TrackBuffers=new Map([[1,{__queuedMediaEnd:100}],[2,{__queuedMediaEnd:100}]]);
  s.safeResponseWaitAt=1000;c.advance(2000);
  assert.equal(c.mp4DecoderSupplyGate(p,s),false,'pending fragments bound additional parser input');
  assert.ok(!s.safeSupplyHeld,'unappended fragments are not a healthy reserve hold');
  assert.equal(s.safeResponseWaitAt,1000,'the actual end-to-end response is still pending');
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
  const c=context(['retireStreamServe','pruneStreamDemands','meshHasActiveTransfer']);
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
  const c=context(['firstSuccessfulSend','relayWriteBacklog','reserveRelayWrite','acquireRelayWrite','publishRelayBinaryFrames']);
  Object.assign(c,{relayWriteReservations:new WeakMap(),natsState:{nc:null},mqttRelayState:{ready:new Set(),clients:new Map(),topic:'room'},natsSubjects:()=>({relay:'room'}),enc:new TextEncoder(),setTimeout,clearTimeout});
  return c;
}
test('common-broker frames deliver to their recipient without recruiting legacy bridge peers', async () => {
  const c=context(['relayBinaryFrames']);
  Object.assign(c,{actor:'source',RELAY_DATA_FRAME_CHARS:21000,bytesToB64:()=> 'AAAA',privacyPublicNknAddr:()=>'',seal:async x=>x});
  const direct=await c.relayBinaryFrames(new Uint8Array(3),{sid:'session'},'viewer','source',0,'rid',21000,true);
  assert.equal(direct[0].target,'viewer');
  assert.equal(direct[0].to,'','legacy clients consume ordinary room frames without entering their targeted-frame bridging path');
  const bridge=await c.relayBinaryFrames(new Uint8Array(3),{},'viewer','source',0,'rid',21000,false);
  assert.equal(bridge[0].to,'viewer','a cross-plane recipient retains bridge routing');
});
test('control fragments preserve their original targeted address', async () => {
  const c=context(['relayFrames']);
  Object.assign(c,{actor:'source',crypto:{randomUUID:()=> 'rid'},privacyPublicNknAddr:()=>'',seal:async x=>x});
  const frames=await c.relayFrames('control packet','viewer');
  assert.equal(frames[0].to,'viewer');assert.equal(frames[0].kind,'ctlfrag');
});
test('relay bridging is unnecessary for a shared carrier and preserves actual bridge provenance', async () => {
  const c=context(['consumeRelayFrame']),published=[],noted=[];
  const frame={v:9,kind:'binfrag',rid:'frame',from:'source',to:'viewer',i:0,n:1,d:'AAAA',ts:Date.now()};
  Object.assign(c,{actor:'bridge',RELAY_DATA_FRAME_CHARS:21000,RELAY_DATA_MAX_HOPS:2,RELAY_PLANES:['nats','mqtt','nostr'],relayBridgeSeen:new Map(),openSeal:async()=>frame,noteRelayActor:(...x)=>noted.push(x),meshHasActiveTransfer:()=>false,relayPlaneName:x=>x,remoteRelayPlanes:()=>['nats','mqtt'],seal:async x=>x,publishRelayRawOnPlane:async(...x)=>published.push(x)});
  await c.consumeRelayFrame('sealed','nats');assert.equal(published.length,0,'a second viewer cannot amplify media onto unused brokers');
  c.remoteRelayPlanes=()=>['mqtt'];frame.rid='cross-plane';
  await c.consumeRelayFrame('sealed','nats');assert.equal(published.length,1);assert.equal(published[0][0],'mqtt');
  await c.consumeRelayFrame('sealed','nats');assert.equal(published.length,1,'a cross-plane fragment is forwarded once');
  frame.hop=1;frame.via='actual-bridge';frame.target='another-viewer';frame.to='';noted.length=0;
  await c.consumeRelayFrame('sealed','mqtt');
  assert.ok(noted.some(x=>x[0]==='actual-bridge'&&x[2]==='mqtt'));
  assert.ok(!noted.some(x=>x[0]==='source'&&x[2]==='mqtt'),'forwarding does not falsely advertise the original source on the bridge carrier');
});
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
  await new Promise(r=>setImmediate(r));
  assert.equal(published,2);
  const second=c.publishRelayBinaryFrames('nats',frames);
  await new Promise(r=>setImmediate(r));
  assert.equal(published,2,'no fragments of an unadmitted chunk are published');
  flush();assert.equal(await first,true);await new Promise(r=>setImmediate(r));
  assert.equal(published,4,'queued work receives the released credit');
  flush();assert.equal(await second,true);assert.equal(c.relayWriteReservations.get(nc).bytes,0);
});
test('relay write credits rotate between viewers instead of making a starved viewer fall back', async () => {
  const c=relayContext(),client={},chunk=900000,held=[];
  for(let i=0;i<3;i++)held.push(await c.acquireRelayWrite(client,chunk,true,'A'));
  const order=[];
  const again=c.acquireRelayWrite(client,chunk,true,'A').then(release=>{order.push('A');return release});
  const other=c.acquireRelayWrite(client,chunk,true,'B').then(release=>{order.push('B');return release});
  held.shift()();const b=await other;
  assert.deepEqual(order,['B'],'a newcomer receives the next complete-frame credit');
  held.shift()();const a=await again;
  assert.deepEqual(order,['B','A']);
  for(const release of held)release();a();b();
  assert.equal(c.relayWriteReservations.get(client).bytes,0);
  assert.equal(c.relayWriteReservations.get(client).waitingBytes,0);
});
test('a superseded seek waiting for broker capacity sends no obsolete frames', async () => {
  const c=relayContext();let published=0,flush,current=true;
  c.streamRequestCurrent=()=>current;
  c.natsState.nc={publish(){published++},flush:()=>new Promise(r=>{flush=r})};
  const frames=['x'.repeat(900000)];
  const first=c.publishRelayBinaryFrames('nats',frames);
  await new Promise(r=>setImmediate(r));
  const old=c.publishRelayBinaryFrames('nats',frames,false,'viewer',{mode:'stream',sid:'s',seekEpoch:0});
  current=false;flush();assert.equal(await first,true);
  assert.equal(await old,false);assert.equal(published,1);
  assert.equal(c.relayWriteReservations.get(c.natsState.nc).bytes,0);
});
test('relay admission wakes after control-only backlog drains and releases closed-client waiters', async () => {
  const c=relayContext(),timers=[];
  c.setTimeout=fn=>{timers.push(fn);return timers.length};c.clearTimeout=()=>{};
  const socket={bufferedAmount:10*1024*1024},client={protocol:{transport:{socket}}};
  const pending=c.acquireRelayWrite(client,900000,true,'viewer');
  socket.bufferedAmount=0;timers.shift()();const release=await pending;
  assert.equal(typeof release,'function');release();
  socket.bufferedAmount=10*1024*1024;
  const closed=c.acquireRelayWrite(client,900000,true,'viewer');
  client.isClosed=()=>true;timers.shift()();assert.equal(await closed,null);
  assert.equal(c.relayWriteReservations.get(client).waitingBytes,0);
});
test('queued bulk cannot block an admissible frontier and queued frames obey the RAM bound', async () => {
  const c=relayContext(),client={},chunk=900000,held=[];
  c.MP4_RAM_QUEUE_BUDGET_BYTES=4*1024*1024;
  for(let i=0;i<3;i++)held.push(await c.acquireRelayWrite(client,chunk,true,'A'));
  const bulk=c.acquireRelayWrite(client,chunk,false,'bulk');
  assert.equal(await c.acquireRelayWrite(client,chunk,true,'over-budget'),null,'waiting whole frames count against RAM');
  c.MP4_RAM_QUEUE_BUDGET_BYTES=64*1024*1024;
  const frontier=c.acquireRelayWrite(client,chunk,true,'B');
  held.shift()();const urgent=await frontier;
  assert.equal(typeof urgent,'function','critical credit remains usable while bulk awaits a smaller budget');
  urgent();for(const release of held)release();(await bulk)();
  assert.equal(c.relayWriteReservations.get(client).bytes,0);
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
  const c=context(['streamRelayDispatchWindow','streamRequestCurrent','queueServeChunks']),sent=[],pending=[];
  Object.assign(c,{streamServeEpochs:new Map(),serveQueues:new Map(),bulkRoutesFor:()=>[],serveChunksNow:async m=>{sent.push(m.indexes[0]);await new Promise(r=>pending.push(r))}});
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
  Object.assign(c,{actor:'source',localRelayPlanes:()=>['nats'],remoteRelayPlanes:()=>[],relayBinaryFrameChars:()=>48000,relayBinaryFrames:async()=>['frame'],publishRelayBinaryFrames:async(plane,frames,critical)=>{admissions.push(critical);return true},firstSuccessfulSend:async jobs=>(await Promise.all(jobs)).some(Boolean)});
  await c.publishRelayBinaryPacket(new Uint8Array(),{decoderHead:true},'viewer');
  await c.publishRelayBinaryPacket(new Uint8Array(),{},'viewer');
  assert.deepEqual(admissions,[true,false]);
});

test('closed and expired viewers release queued upload work without retiring another session', async () => {
  const c=context(['streamRelayDispatchWindow','streamRequestCurrent','retireStreamServe','queueServeChunks']),sent=[],pending=[];
  Object.assign(c,{streamServeEpochs:new Map(),serveQueues:new Map(),bulkRoutesFor:()=>[],serveChunksNow:async m=>{sent.push(m.indexes[0]);await new Promise(r=>pending.push(r))}});
  const m={mode:'stream',id:'movie',sid:'session',decoderHead:true,decoderCursor:0,indexes:[0,1,2,3],supplyPressure:2};
  await c.queueServeChunks(m,'viewer');assert.deepEqual(sent,[0,1,2],'pressure recruits bounded relay lookahead');
  c.retireStreamServe({id:'movie',actor:'viewer',sid:'other'},true);
  assert.equal(c.serveQueues.get('viewer|movie').hot.size,1);
  c.retireStreamServe({id:'movie',actor:'viewer',sid:'session'},true);
  for(const done of pending.splice(0))done();await new Promise(r=>setImmediate(r));
  assert.deepEqual(sent,[0,1,2]);assert.equal(c.serveQueues.size,0);
  await c.queueServeChunks({...m,seekEpoch:99},'viewer');assert.deepEqual(sent,[0,1,2],'late requests cannot revive a closed SID');
  const resumed={...m,sid:'next',indexes:[3,4,5,6]};
  await c.queueServeChunks(resumed,'viewer');
  c.retireStreamServe({id:'movie',actor:'viewer',sid:'next'});
  for(const done of pending.splice(0))done();await new Promise(r=>setImmediate(r));
  assert.equal(c.streamRequestCurrent(resumed,'viewer'),true,'lease expiry allows the same live session to reconnect');
  assert.equal(c.serveQueues.size,0);
});


test('backward seek replaces the seeder frontier and rejects obsolete epochs after its queue drains', async () => {
  const c=context(['streamRelayDispatchWindow','streamRequestCurrent','queueServeChunks']),sent=[];
  Object.assign(c,{streamServeEpochs:new Map(),serveQueues:new Map(),bulkRoutesFor:()=>[],serveChunksNow:async m=>sent.push(m.indexes[0])});
  const m={mode:'stream',id:'movie',sid:'session',decoderHead:true,decoderCursor:900,indexes:[900],seekEpoch:1};
  await c.queueServeChunks(m,'viewer');await new Promise(r=>setImmediate(r));
  await c.queueServeChunks({...m,decoderCursor:100,indexes:[100],seekEpoch:2},'viewer');await new Promise(r=>setImmediate(r));
  await c.queueServeChunks({...m,indexes:[901]},'viewer');
  assert.deepEqual(sent,[900,100]);
  assert.equal(c.streamRequestCurrent(m,'viewer'),false);
});

test('an unbuffered seek jumps the parser and cancels old reservations without discarding verified cache', () => {
  const c=context(['seekMp4Stream']),{p,s}=plant(),calls=[];
  s.state='downloading';s.decoderFedBits=new Uint8Array([255]);s.decoderFedCount=8;s.decoderUrgent=new Set([0]);
  s.inflight.set(0,{actor:'seed'});s.inflightByPeer=new Map([['seed',1]]);s.requestedAt=new Map([[0,0]]);s.priority=[0];s.retry=[0];s.streamCached=new Set([0,200]);
  p.mode='mp4box';p.mp4boxReady=true;p.mp4box={stop:()=>calls.push('stop'),start:()=>calls.push('start'),seek:(t,rap)=>calls.push([t,rap]),releaseUsedSamples:()=>{},getTrackSamplesInfo:()=>[]};
  p.mp4TrackBuffers=new Map([[1,{__q:[new Uint8Array(10)],__qBytes:10}]]);
  Object.assign(c,{streamBufferedState:()=>({inRange:false,ahead:0}),mp4ChunkForTime:()=>200,streamRefillWindowCaps:()=>({min:8}),previewDebugEvent:()=>{},ensureStreamHorizon:()=>{},scheduleDecoderPromotion:()=>{}});
  assert.equal(c.seekMp4Stream(p,400),true);
  assert.equal(s.mp4SequentialCursor,200);assert.equal(s.cursor,200);assert.equal(s.seekEpoch,1);
  assert.equal(s.inflight.size,0);assert.equal(s.requestedAt.size,0);assert.equal(s.decoderFedBits[0],0);
  assert.deepEqual([...s.streamCached],[0,200]);assert.deepEqual(calls,['stop',[400,true],'start']);
  c.streamBufferedState=()=>({inRange:true,ahead:4});
  assert.equal(c.seekMp4Stream(p,402),false);assert.equal(s.seekEpoch,1);
});


test('an asynchronous decrypt from the old seek cannot append to the new parser range', async () => {
  const c=context(['consumePreviewChunk']);let resolve,appends=0;
  const s={seekEpoch:0,decoderUrgent:new Set()},p={session:s,c:{},mode:'mp4box',mp4box:{appendBuffer:()=>appends++}};
  Object.assign(c,{activePreview:p,canonicalToPlain:()=>new Promise(r=>resolve=r)});
  const task=c.consumePreviewChunk(s,0,new Uint8Array(1));
  s.seekEpoch=1;resolve(new Uint8Array(1));
  assert.equal(await task,false);assert.equal(appends,0);
});

test('send timeouts retain physical transport capacity and keep two slots for the missing frontier', async () => {
  const c=context(['streamRelayDispatchWindow','boundedStreamPathSend']),timers=[],pending=[];
  Object.assign(c,{streamPathDispatches:new Map(),setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{}});
  const path={path:'direct:slow',send:()=>new Promise(r=>pending.push(r))};
  const normal=Array.from({length:4},()=>c.boundedStreamPathSend('viewer',path,new Uint8Array(),{decoderHead:true},true));
  await new Promise(r=>setImmediate(r));
  for(const fire of timers.splice(0))fire();await Promise.all(normal);
  assert.equal(c.streamPathDispatches.get('viewer|direct:slow').active,4);
  assert.equal(await c.boundedStreamPathSend('viewer',path,new Uint8Array(),{decoderHead:true},true),false);
  const rescues=Array.from({length:2},()=>c.boundedStreamPathSend('viewer',path,new Uint8Array(),{frontierRescue:true},true));
  await new Promise(r=>setImmediate(r));
  for(const fire of timers.splice(0))fire();await Promise.all(rescues);
  assert.equal(pending.length,6);assert.equal(c.streamPathDispatches.get('viewer|direct:slow').active,6);
  assert.equal(await c.boundedStreamPathSend('viewer',path,new Uint8Array(),{frontierRescue:true},true),false);
  for(const resolve of pending)resolve(true);await new Promise(r=>setImmediate(r));
  assert.equal(c.streamPathDispatches.get('viewer|direct:slow').active,0);
});
test('frontier retries cannot clone a pending chunk onto the same carrier, even after timeout', async () => {
  const c=context(['streamRelayDispatchWindow','boundedStreamPathSend']),timers=[];let finish,sends=0;
  Object.assign(c,{streamPathDispatches:new Map(),setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{}});
  const path={path:'relay:nats',send:()=>{sends++;return new Promise(r=>{finish=r})}},metadata={id:'movie',sid:'session',idx:10,seekEpoch:0,decoderHead:true};
  const first=c.boundedStreamPathSend('viewer',path,new Uint8Array(512*1024),metadata,true);
  await new Promise(r=>setImmediate(r));
  const rescue={...metadata,frontierRescue:true};
  assert.equal(await c.boundedStreamPathSend('viewer',path,new Uint8Array(512*1024),rescue,true),false);
  assert.equal(sends,1);
  const independent={path:'relay:mqtt',send:async()=>true};
  assert.equal(await c.boundedStreamPathSend('viewer',independent,new Uint8Array(512*1024),rescue,true),true,'an independent repair carrier remains usable');
  timers[0]();assert.equal(await first,false);
  assert.equal(await c.boundedStreamPathSend('viewer',path,new Uint8Array(512*1024),rescue,true),false,'outer timeout did not cancel the physical frame');
  assert.equal(sends,1);finish(true);await new Promise(r=>setImmediate(r));
  assert.equal(c.streamPathDispatches.get('viewer|relay:nats').chunks.size,0,'actual completion releases the chunk');
});

test('frontier recovery follows playable runway and byte service instead of inflated retry latency', () => {
  const c=context([...controlFunctions,'decoderFrontierTiming']),{p,s}=plant();
  c.streamReceiveRate=()=>1024*1024;s.deliveryLatency=52;s.deliveryJitter=12;s.safePlantPressure=2;
  const low=c.decoderFrontierTiming(p,s,8,true),empty=c.decoderFrontierTiming(p,s,0,true),full=c.decoderFrontierTiming(p,s,150,true);
  assert.ok(low.response<3000);assert.ok(empty.response<=low.response);assert.ok(full.response>low.response);
  assert.equal(empty.interval,500);
  c.streamReceiveRate=()=>256*1024;
  assert.equal(c.decoderFrontierTiming(p,s,0,true).interval,2000,'probes slow down with physical byte supply');
});

test('busy transports retain useful upload work without waiting for a receiver timeout', async () => {
  const c=context(['streamRelayDispatchWindow','streamRequestCurrent','queueServeChunks']),sent=[];
  Object.assign(c,{streamServeEpochs:new Map(),serveQueues:new Map(),bulkRoutesFor:()=>[],seedEnabled:()=>true,sleep:async()=>{},serveChunksNow:async m=>{sent.push(m.indexes[0]);return sent.length>1}});
  await c.queueServeChunks({mode:'stream',id:'movie',sid:'session',decoderHead:true,decoderCursor:20,indexes:[20]},'viewer');
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(sent,[20,20]);assert.equal(c.serveQueues.size,0);
});

test('a late successful transport completion reopens its capacity after fallback', async () => {
  const c=context(['streamRelayDispatchWindow','boundedStreamPathSend']),timers=[],pending=[];
  Object.assign(c,{streamPathDispatches:new Map(),setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{}});
  const path={path:'direct:slow',send:()=>new Promise(r=>pending.push(r))};
  for(let i=0;i<2;i++){
    const task=c.boundedStreamPathSend('viewer',path,new Uint8Array(),{},false);
    await new Promise(r=>setImmediate(r));timers.shift()();await task;
  }
  const state=c.streamPathDispatches.get('viewer|direct:slow');assert.ok(state.blockedUntil>1000);
  pending.shift()(true);await new Promise(r=>setImmediate(r));
  assert.equal(state.blockedUntil,0);assert.equal(state.active,1);
  pending.shift()(true);await new Promise(r=>setImmediate(r));assert.equal(state.active,0);
});
