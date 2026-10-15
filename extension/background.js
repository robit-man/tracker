/* Tracker Distributed Storage — background service worker / background script.
 * Persistent background contributor for global / room-based storage.
 * Firefox: persistent background page keeps IndexedDB/provider presence alive.
 * Chrome: service worker wakes on alarms + messages (event-driven, not 24/7).
 */

const DEFAULTS = {
  enabled: false,
  scope: 'room', // 'room' | 'global'
  roomCapacityGB: 25,
  globalCapacityGB: 25,
  shard: '',
  anonymous: true,
  trackerOrigins: [],
};

const HEARTBEAT_MINUTES = 1;
const PRESENCE_TTL_MS = 5 * 60 * 1000;

const extApi = (typeof chrome !== 'undefined' && chrome.runtime ? chrome : null)
  || (typeof browser !== 'undefined' && browser.runtime ? browser : null);

async function getStore() {
  const data = await extApi.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...data };
}

async function setStore(patch) {
  await extApi.storage.local.set(patch);
}

async function heartbeat(reason) {
  const cfg = await getStore();
  const now = Date.now();
  await extApi.storage.local.set({
    lastHeartbeat: now,
    lastHeartbeatReason: reason || 'alarm',
    backgroundAlive: true,
  });
  // Presence record consumed by tracker tabs via content script.
  // Tabs remain the data plane; the extension is the persistence/presence plane.
  try {
    const tabs = await extApi.tabs.query({});
    for (const t of tabs) {
      if (!t.id || !t.url) continue;
      if (!/^https?:\/\//.test(t.url)) continue;
      extApi.tabs.sendMessage(t.id, {
        type: 'TRACKER_STORAGE_HEARTBEAT',
        at: now,
        enabled: cfg.enabled,
        scope: cfg.scope,
      }).catch(() => {});
    }
  } catch (_) {
    // Tabs permission may be absent; heartbeat state remains in storage.
  }
}

function ensureAlarm() {
  try {
    if (extApi.alarms && extApi.alarms.create) {
      extApi.alarms.create('tracker-storage-heartbeat', {
        periodInMinutes: HEARTBEAT_MINUTES,
      });
    }
  } catch (_) {}
}

extApi.runtime.onInstalled.addListener(async () => {
  const existing = await extApi.storage.local.get(null);
  await extApi.storage.local.set({ ...DEFAULTS, ...existing });
  ensureAlarm();
  heartbeat('installed');
});

extApi.runtime.onStartup.addListener(() => {
  ensureAlarm();
  heartbeat('startup');
});

if (extApi.alarms && extApi.alarms.onAlarm) {
  extApi.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'tracker-storage-heartbeat') heartbeat('alarm');
  });
}

extApi.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'TRACKER_STORAGE_GET') {
      const cfg = await getStore();
      const state = await extApi.storage.local.get(['lastHeartbeat']);
      sendResponse({ ok: true, config: cfg, lastHeartbeat: state.lastHeartbeat || 0 });
    } else if (msg.type === 'TRACKER_STORAGE_SET') {
      await setStore(msg.patch || {});
      const cfg = await getStore();
      heartbeat('config');
      sendResponse({ ok: true, config: cfg });
    } else if (msg.type === 'TRACKER_STORAGE_PING') {
      heartbeat('ping');
      sendResponse({ ok: true, at: Date.now(), ttlMs: PRESENCE_TTL_MS });
    }
  })();
  return true;
});

ensureAlarm();
heartbeat('init');
