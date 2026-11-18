/* Registers the service worker, asks it to save the city-centre map, and reports online/offline. window.TripOffline. */
(function () {
  const CAN_REGISTER = 'serviceWorker' in navigator &&
    (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname));

  /* bounds: {south, west, north, east} to save. onStatus({ offline, saved, error }) is called on every change. */
  function start(bounds, onStatus) {
    let status = { offline: !navigator.onLine, saved: false, error: null, supported: CAN_REGISTER };
    const emit = (patch) => { status = { ...status, ...patch }; onStatus(status); };
    window.addEventListener('online', () => emit({ offline: false }));
    window.addEventListener('offline', () => emit({ offline: true }));
    emit({});
    if (!CAN_REGISTER) return;

    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== 'map-saved') return;
      if (e.data.error) console.warn('Saving the map for offline failed:', e.data.error);
      emit({ saved: !e.data.error && !e.data.failed, fresh: !e.data.already, error: e.data.error || (e.data.failed ? `${e.data.failed} map files failed` : null) });
    });
    navigator.serviceWorker.register('sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        if (navigator.onLine && reg.active) reg.active.postMessage({ type: 'save-map', bounds });
      })
      .catch((e) => {
        console.warn('Service worker registration failed:', e);
        emit({ error: 'Offline mode unavailable' });
      });
  }

  window.TripOffline = { start };
})();
