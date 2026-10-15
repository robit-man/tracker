/* Tracker Distributed Storage — content bridge.
 * Runs on tracker tabs. Relays extension presence to the page and
 * surfaces page storage config to the background worker.
 * No room secrets, file bytes, or keys are handled here — only presence + config.
 */
(() => {
  if (window.__trackerStorageBridge) return;
  window.__trackerStorageBridge = true;

  const extApi = (typeof chrome !== 'undefined' && chrome.runtime ? chrome : null)
    || (typeof browser !== 'undefined' && browser.runtime ? browser : null);
  const EXT_AVAILABLE_EVENT = 'tracker:extension-available';
  const PAGE_CONFIG_EVENT = 'tracker:extension-config';

  function notifyPage(state) {
    window.dispatchEvent(
      new CustomEvent(EXT_AVAILABLE_EVENT, {
        detail: {
          available: true,
          at: Date.now(),
          enabled: !!(state && state.config && state.config.enabled),
          scope: state && state.config ? state.config.scope : undefined,
          lastHeartbeat: state ? state.lastHeartbeat : 0,
        },
      })
    );
    document.documentElement.setAttribute('data-tracker-extension', 'available');
  }

  async function queryBackground() {
    try {
      if (!extApi) return null;
      const res = await extApi.runtime.sendMessage({ type: 'TRACKER_STORAGE_GET' });
      if (res && res.ok) notifyPage(res);
      return res;
    } catch (_) {
      return null;
    }
  }

  // Page can push its contribution config down (scope, capacities, shard).
  window.addEventListener(PAGE_CONFIG_EVENT, (ev) => {
    try {
      const patch = (ev && ev.detail) || {};
      extApi.runtime.sendMessage({ type: 'TRACKER_STORAGE_SET', patch }).catch(() => {});
    } catch (_) {}
  });

  // Background heartbeats reach tabs here.
  if (extApi && extApi.runtime && extApi.runtime.onMessage) {
    extApi.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'TRACKER_STORAGE_HEARTBEAT') {
        document.documentElement.setAttribute('data-tracker-extension-heartbeat', String(msg.at));
        window.dispatchEvent(
          new CustomEvent('tracker:extension-heartbeat', { detail: msg })
        );
      }
    });
  }

  queryBackground();
  setInterval(queryBackground, 60 * 1000);
})();
