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
