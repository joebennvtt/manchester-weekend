/* Base map: OpenFreeMap Positron vector style (no API key). The app is light only.
   Falls back to OSM raster tiles when WebGL or MapLibre is unavailable. window.TripBasemap.
   Vector tiles are requested through the "ofm" protocol so MapLibre fetches them on the page's
   main thread, where the service worker (sw.js) can serve them offline; worker fetches may bypass it. */
(function () {
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
  const TILE_PREFIX = 'https://tiles.openfreemap.org/';
  const PROTOCOL = 'ofm';
  const HTTP_NO_CONTENT = 204;
  const ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> '
    + '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OMT</a> '
    + '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>';

  function hasWebGL() {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  function addRaster(map) {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  }

  function registerProtocol() {
    window.maplibregl.addProtocol(PROTOCOL, async (params, abortController) => {
      const response = await fetch(params.url.replace(`${PROTOCOL}://`, 'https://'), { signal: abortController.signal });
      if (response.status === HTTP_NO_CONTENT) return { data: new ArrayBuffer(0) };
      if (!response.ok) throw new Error(`Map tile HTTP ${response.status}`);
      return { data: await response.arrayBuffer() };
    });
  }

  const isVectorTile = (url, type) => type === 'Tile' && url.startsWith(TILE_PREFIX) && url.endsWith('.pbf');
  const transformRequest = (url, type) => (isVectorTile(url, type) ? { url: `${PROTOCOL}://${url.slice('https://'.length)}` } : { url });

  function add(map) {
    if (!L.maplibreGL || !window.maplibregl || !hasWebGL()) {
      addRaster(map);
      return;
    }
    registerProtocol();
    L.maplibreGL({ style: STYLE_URL, attribution: ATTRIBUTION, transformRequest }).addTo(map);
  }

  window.TripBasemap = { add };
})();
