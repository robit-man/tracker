/* Tracker Storage popup */
(async () => {
  const $ = (id) => document.getElementById(id);
  const enabledEl = $('enabled');
  const scopeEl = $('scope');
  const presenceEl = $('presence');
  const heartbeatEl = $('heartbeat');
  const statusEl = $('status');

  const extApi = (typeof chrome !== 'undefined' && chrome.runtime ? chrome : null)
    || (typeof browser !== 'undefined' && browser.runtime ? browser : null);
  async function load() {
    try {
      const res = await extApi.runtime.sendMessage({ type: 'TRACKER_STORAGE_GET' });
      if (!res || !res.ok) throw new Error('no response');
      enabledEl.checked = !!res.config.enabled;
      scopeEl.value = res.config.scope || 'room';
      presenceEl.textContent = 'Background worker: active';
      heartbeatEl.textContent = res.lastHeartbeat
        ? new Date(res.lastHeartbeat).toLocaleTimeString()
        : '—';
    } catch (_) {
      presenceEl.textContent = 'Background worker: unavailable';
    }
  }

  $('save').addEventListener('click', async () => {
    statusEl.textContent = 'Saving…';
    try {
      await extApi.runtime.sendMessage({
        type: 'TRACKER_STORAGE_SET',
        patch: { enabled: enabledEl.checked, scope: scopeEl.value },
      });
      statusEl.textContent = enabledEl.checked
        ? 'Background contribution on. Keep a tracker tab open for data serving; the extension keeps presence alive.'
        : 'Background contribution off.';
      load();
    } catch (_) {
      statusEl.textContent = 'Save failed.';
    }
  });

  load();
})();
