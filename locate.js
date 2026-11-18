/* Live location control. Only requests location from a click (iOS needs a user gesture). window.TripLocate. */
(function () {
  const WATCH_OPTS = { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 };
  const FIRST_FIX_ZOOM = 16;
  const MESSAGES = {
    1: 'Location permission denied: enable it in Settings › Privacy › Location Services › Safari / your browser.',
    2: 'Location unavailable here: try opening the page directly in Safari/Chrome.',
    3: 'Location timed out: check your signal and try again.',
  };
  const LABELS = { off: '📍 Locate me', on: '📍 Locating (tap: follow)', follow: '📍 Following (tap: stop)' };

  function unsupportedReason() {
    if (!('geolocation' in navigator)) return 'Location is not supported by this browser.';
    if (window.isSecureContext === false) return 'Location needs a secure (https) page.';
    return null;
  }

  /* map: Leaflet map. onChange(me|null): called with {lat,lng,accuracy} or null. onMessage(text). */
  function create(map, onChange, onMessage) {
    let mode = 'off';
    let watchId = null;
    let dot = null;
    let ring = null;
    let hasFix = false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'locate-ctl';

    function paint() {
      button.textContent = LABELS[mode];
      button.setAttribute('aria-pressed', String(mode !== 'off'));
      const why = unsupportedReason();
      button.disabled = Boolean(why);
      button.title = why || 'Show and follow your location';
    }

    function onPosition(pos) {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      const ll = [lat, lng];
      if (!dot) {
        dot = L.marker(ll, { interactive: false, keyboard: false, zIndexOffset: 2000,
          icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="me-dot"></div>' }) }).addTo(map);
        ring = L.circle(ll, { radius: accuracy, className: 'me-ring', weight: 1, interactive: false }).addTo(map);
      } else {
        dot.setLatLng(ll);
        ring.setLatLng(ll).setRadius(accuracy);
      }
      if (!hasFix) { hasFix = true; map.flyTo(ll, FIRST_FIX_ZOOM, { duration: 0.8 }); }
      else if (mode === 'follow') map.panTo(ll);
      onMessage('');
      onChange({ lat, lng, accuracy });
    }

    function onError(err) {
      onMessage(MESSAGES[err.code] || 'Could not get your location.');
      if (err.code === 1 || err.code === 2) stop();
    }

    function start() {
      watchId = navigator.geolocation.watchPosition(onPosition, onError, WATCH_OPTS);
      mode = 'on';
    }

    function stop() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null; hasFix = false; mode = 'off';
      [dot, ring].forEach((l) => l && map.removeLayer(l));
      dot = null; ring = null;
      onChange(null);
      paint();
    }

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (unsupportedReason()) return;
      if (mode === 'off') { onMessage(''); start(); }
      else if (mode === 'on') mode = 'follow';
      else stop();
      paint();
    });

    const phoneQuery = window.matchMedia('(max-width: 767px)');
    const Control = L.Control.extend({
      // Top-right on phones, clear of the zoom buttons; matches the 768px layout breakpoint in styles.css.
      options: { position: phoneQuery.matches ? 'topright' : 'topleft' },
      onAdd() {
        const wrap = L.DomUtil.create('div', 'leaflet-bar');
        wrap.appendChild(button);
        L.DomEvent.disableClickPropagation(wrap);
        return wrap;
      },
    });
    const control = new Control();
    map.addControl(control);
    const place = () => control.setPosition(phoneQuery.matches ? 'topright' : 'topleft');
    if (phoneQuery.addEventListener) phoneQuery.addEventListener('change', place);
    paint();
  }

  window.TripLocate = { create, unsupportedReason, MESSAGES };
})();
