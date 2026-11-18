/* Offline support. App files: network first, cache fallback (so updates still arrive).
   CDN libraries and map tiles/fonts/sprites: cache first. On request from the page, saves the
   city-centre map (vector tiles, label fonts, sprites) so it works with no signal. */
importScripts('tiles.js');

const SHELL_CACHE = 'shell-v1';
const MAP_CACHE = 'map-v1';          // the saved city-centre map; never trimmed
const BROWSED_CACHE = 'browsed-v1';  // map files viewed while online; capped
const BROWSED_MAX_ENTRIES = 400;
const MAP_MARKER = 'saved-map.json';
const NETWORK_TIMEOUT_MS = 4000;
const SAVE_CONCURRENCY = 6;
const MAP_ZOOMS = [6, 7, 8, 9, 10, 11, 12, 13, 14];
const GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const MAP_HOST = 'tiles.openfreemap.org';
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'unpkg.com'];
const LOCAL_SHELL = [
  './', 'index.html', 'styles.css', 'data/places.js', 'data/getting-home.js', 'lib.js', 'home.js', 'plan.js', 'tiles.js',
  'render.js', 'render-plan.js', 'basemap.js', 'locate.js', 'offline.js', 'app.js',
];
const CDN_SHELL = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js',
];

// CDN files are best effort: a slow CDN must not stop offline mode installing (they're also cached on first use).
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE)
    .then((c) => Promise.all([
      c.addAll(LOCAL_SHELL.map((u) => new Request(u, { cache: 'reload' }))),
      Promise.allSettled(CDN_SHELL.map((u) => c.add(u))),
    ]))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, MAP_CACHE, BROWSED_CACHE]);
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

async function cachedFallback(cache, request) {
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  return request.mode === 'navigate' ? cache.match('index.html') : undefined;
}

/* Skips the browser's HTTP cache so a fresh deploy shows up at once; any network failure or error status uses the saved copy. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request, { cache: 'no-cache' }), NETWORK_TIMEOUT_MS);
    if (response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
    return (await cachedFallback(cache, request)) || response;
  } catch (e) {
    const cached = await cachedFallback(cache, request);
    if (cached) return cached;
    throw e;
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((k) => cache.delete(k)));
}

async function cacheFirst(event, cacheName, maxEntries) {
  const { request } = event;
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    event.waitUntil(caches.open(cacheName)
      .then((c) => c.put(request, copy))
      .then(() => (maxEntries ? trimCache(cacheName, maxEntries) : undefined)));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(request, SHELL_CACHE));
  else if (CDN_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(event, SHELL_CACHE));
  else if (url.hostname === MAP_HOST && (url.pathname.startsWith('/styles/') || url.pathname === '/planet')) event.respondWith(networkFirst(request, MAP_CACHE));
  else if (url.hostname === MAP_HOST) event.respondWith(cacheFirst(event, BROWSED_CACHE, BROWSED_MAX_ENTRIES));
});

/* ---- saving the map for offline ---- */
async function getJson(url) {
  const response = await networkFirst(new Request(url), MAP_CACHE);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function mapUrls(style, template, bounds) {
  const fontStacks = new Set(style.layers.map((l) => l.layout && l.layout['text-font']).filter(Array.isArray).map((f) => f.join(',')));
  const glyphs = [...fontStacks].flatMap((stack) => GLYPH_RANGES.map((range) =>
    style.glyphs.replace('{fontstack}', encodeURIComponent(stack)).replace('{range}', range)));
  const sprites = [style.sprite].flat().map((s) => (typeof s === 'string' ? s : s.url))
    .flatMap((s) => [`${s}.json`, `${s}.png`, `${s}@2x.json`, `${s}@2x.png`]);
  return [...self.TripTiles.tileUrls(template, bounds, MAP_ZOOMS), ...glyphs, ...sprites];
}

async function saveAll(cache, urls) {
  let saved = 0;
  let failed = 0;
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        if (await cache.match(url)) { saved += 1; continue; }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await cache.put(url, response);
        saved += 1;
      } catch (e) {
        failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: SAVE_CONCURRENCY }, worker));
  return { saved, failed };
}

/* Drop tiles from an older map build once a new one is saved. */
async function pruneOldTiles(cache, template) {
  const current = template.slice(0, template.indexOf('{z}'));
  const keys = await cache.keys();
  await Promise.all(keys.filter((r) => r.url.includes('/planet/') && !r.url.startsWith(current)).map((r) => cache.delete(r)));
}

async function saveMap(bounds) {
  const cache = await caches.open(MAP_CACHE);
  const style = await getJson(STYLE_URL);
  const tilejson = await getJson(style.sources.openmaptiles.url);
  const template = tilejson.tiles[0];
  const key = JSON.stringify({ template, bounds });
  const marker = await cache.match(MAP_MARKER);
  if (marker && (await marker.text()) === key) return { already: true };
  const urls = mapUrls(style, template, bounds);
  const result = await saveAll(cache, urls);
  if (result.failed === 0) {
    await cache.put(MAP_MARKER, new Response(key));
    await pruneOldTiles(cache, template);
  }
  return { ...result, total: urls.length };
}

const isBounds = (b) => Boolean(b) && ['south', 'west', 'north', 'east'].every((k) => Number.isFinite(b[k]));

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'save-map' || !isBounds(event.data.bounds)) return;
  const reply = (msg) => event.source && event.source.postMessage({ type: 'map-saved', ...msg });
  event.waitUntil(saveMap(event.data.bounds).then(reply, (e) => reply({ error: String(e && e.message || e) })));
});
