/* Base map: OpenFreeMap vector styles (no API key), light/dark following the theme.
   Falls back to OSM raster tiles when WebGL or MapLibre is unavailable. window.TripBasemap. */
(function () {
  const STYLES = {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark',
  };
  const ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> '
    + '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OMT</a> '
    + '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>';
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const isDark = () => {
    const theme = document.documentElement.dataset.theme;
    return theme ? theme === 'dark' : darkQuery.matches;
  };
  const styleUrl = () => (isDark() ? STYLES.dark : STYLES.light);

  function hasWebGL() {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  function addRaster(map) {
    // Dark mode darkens these via the .base-tiles CSS filter.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'base-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  }

  function add(map) {
    if (!L.maplibreGL || !window.maplibregl || !hasWebGL()) {
      addRaster(map);
      return;
    }
    const layer = L.maplibreGL({ style: styleUrl(), attribution: ATTRIBUTION }).addTo(map);
    const restyle = () => {
      const gl = layer.getMaplibreMap();
      if (gl) gl.setStyle(styleUrl());
    };
    if (darkQuery.addEventListener) darkQuery.addEventListener('change', restyle);
    new MutationObserver(restyle).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.TripBasemap = { add };
})();
