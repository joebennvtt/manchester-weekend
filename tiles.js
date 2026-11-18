/* Slippy-map tile maths for saving the map offline. No DOM.
   Service worker: importScripts('tiles.js') → self.TripTiles. Browser: window.TripTiles. Node: module.exports. */
(function (root, factory) {
  const tiles = factory();
  if (typeof module === 'object' && module.exports) module.exports = tiles;
  else root.TripTiles = tiles;
})(typeof self !== 'undefined' ? self : this, function () {
  const KM_PER_DEG_LAT = 111.32;

  function tileXY(lat, lng, z) {
    const n = 2 ** z;
    const r = (lat * Math.PI) / 180;
    return {
      x: Math.floor(((lng + 180) / 360) * n),
      y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
    };
  }

  /* template: 'https://…/{z}/{x}/{y}.pbf'. bounds: {south, west, north, east}. */
  function tileUrls(template, bounds, zooms) {
    return zooms.flatMap((z) => {
      const nw = tileXY(bounds.north, bounds.west, z);
      const se = tileXY(bounds.south, bounds.east, z);
      const urls = [];
      for (let x = nw.x; x <= se.x; x += 1) {
        for (let y = nw.y; y <= se.y; y += 1) urls.push(template.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      }
      return urls;
    });
  }

  /* Box around the points, padded by padKm on every side. */
  function boundsAround(points, padKm) {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const dLat = padKm / KM_PER_DEG_LAT;
    const dLng = padKm / (KM_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180));
    return { south: Math.min(...lats) - dLat, north: Math.max(...lats) + dLat, west: Math.min(...lngs) - dLng, east: Math.max(...lngs) + dLng };
  }

  return { tileXY, tileUrls, boundsAround };
});
