/* State, map and wiring. Uses window.PLACES, TripLib, TripRender, Leaflet. */
(function () {
  const { filterPlaces, bookAhead, isOpenAt, isCentral, distanceKm, sortByDistance, hasMoved, tripNow, openStatus, formatWalk } = window.TripLib;
  const { TYPES, FOOD_TYPES, MEALS, BOOKINGS, esc, clockLabel, detailsHtml, cardHtml, previewHtml, bookItemHtml } = window.TripRender;
  const MOVE_THRESHOLD_M = 15;
  const PRICE_ORDER = ['free', '£', '££', '£££', '££££'];
  const AREA_TOP = 8;
  const AREA_COLLAPSE_MAX = 10;
  const FOOD_TOP = 8;
  const KNOWN_TYPES = new Set(['cafe', 'restaurant', 'bar', 'pub', 'see', 'do', 'trip', 'vintage', 'music']);
  const isUsable = (p) => Boolean(p) && KNOWN_TYPES.has(p.type) && Array.isArray(p.meals) && Array.isArray(p.events) &&
    p.hours && typeof p.hours === 'object' && Number.isFinite(p.lat) && Number.isFinite(p.lng);
  const PLACES = Object.freeze((window.PLACES || []).filter((p) => {
    if (isUsable(p)) return true;
    console.warn('Skipping malformed place:', p && p.id);
    return false;
  }));
  const RATING_STEPS = [4.5, 4.0, 3.5];
  const presentPrices = PRICE_ORDER.filter((v) => PLACES.some((p) => p.price === v));
  const areaCounts = PLACES.reduce((m, p) => (p.neighbourhood ? m.set(p.neighbourhood, (m.get(p.neighbourhood) || 0) + 1) : m), new Map());
  const AREAS = [...areaCounts.keys()].sort((a, b) => areaCounts.get(b) - areaCounts.get(a) || a.localeCompare(b));
  const foodCount = (f) => PLACES.filter((p) => (p.foodTypes || []).includes(f)).length;
  // Most common first (ties keep FOOD_TYPES order) so the collapsed top 8 are the useful ones.
  const FOODS = FOOD_TYPES.filter((f) => foodCount(f) > 0).sort((a, b) => foodCount(b) - foodCount(a));
  const byId = new Map(PLACES.map((p) => [p.id, p]));
  const $ = (id) => document.getElementById(id);
  const QUICK_TYPES = { food: ['cafe', 'restaurant'], drinks: ['bar', 'pub'], sights: ['see', 'do'], shops: ['vintage', 'music'] };
  const CLOCK_REFRESH_MS = 60000;
  const PREVIEW_PAD_PX = 200;
  const DETAIL_ZOOM = 17;
  const STORE_KEY = 'manchester-trip-v1';

  const loadStore = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  };
  const saved = loadStore();
  const emptyFilters = () => ({ types: new Set(), meals: new Set(), booking: new Set(), prices: new Set(), areas: new Set(), foodTypes: new Set(), minRating: null, query: '', openOn: false, hideClosed: false, shortlistOnly: false });
  const trip = tripNow();
  // During the trip, start on the real day/time with "Open now" on; otherwise the Sat 12:00 default.
  let state = {
    ...emptyFilters(), showAllAreas: false, showAllFood: false, day: trip ? trip.day : 'sat', time: trip ? trip.time : '12:00',
    openOn: Boolean(trip), hideClosed: Boolean(trip), live: Boolean(trip),
    shortlist: new Set(saved.shortlist || []), visited: new Set(saved.visited || []),
    tab: 'explore', sheet: 'split', selected: null, active: null, preview: null, me: null, sortNearest: false,
  };
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ shortlist: [...state.shortlist], visited: [...state.visited] })); } catch (e) { /* storage unavailable */ }
  }
  function setState(patch) { state = { ...state, ...patch }; update(); }
  const toggled = (set, v) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  /* ---- map ---- */
  // markercluster needs a map-level maxZoom; the MapLibre vector layer doesn't provide one.
  const map = L.map('map', { zoomControl: true, maxZoom: 19 });
  window.TripBasemap.add(map);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clusterLayer = L.markerClusterGroup({
    maxClusterRadius: 40, disableClusteringAtZoom: 17, spiderfyOnMaxZoom: true, showCoverageOnHover: false, animate: !reducedMotion,
    iconCreateFunction: (c) => L.divIcon({ className: '', iconSize: [36, 36], html: `<div class="cluster">${c.getChildCount()}</div>` }),
  }).addTo(map);
  const markers = new Map();
  const inCluster = new Set();
  const pinIcon = (p, dim, active) => L.divIcon({
    className: '', iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<div class="pin t-${p.type}${dim ? ' dim' : ''}${active ? ' active' : ''}">${TYPES[p.type].icon}</div>`,
  });
  PLACES.forEach((p) => {
    const m = L.marker([p.lat, p.lng], { title: p.name, icon: pinIcon(p, false, false) });
    m.on('click', () => {
      setState({ active: p.id, preview: p.id, tab: 'explore', selected: null });
      map.panInside(m.getLatLng(), { paddingTopLeft: [40, 60], paddingBottomRight: [40, PREVIEW_PAD_PX] });
    });
    markers.set(p.id, m);
  });
  map.on('click', () => { if (state.preview) setState({ preview: null, active: null }); });
  const fit = (places) => {
    if (places.length === 0) return;
    map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 16 });
  };
  const fitCentre = () => fit(PLACES.filter(isCentral));

  /* ---- derived ---- */
  const openAtState = () => (state.openOn ? { day: state.day, time: state.time } : null);
  const visiblePlaces = () => {
    const filtered = filterPlaces(PLACES, { ...state, openAt: state.hideClosed ? openAtState() : null });
    return state.me && state.sortNearest ? sortByDistance(filtered, state.me) : filtered;
  };
  const distanceText = (p) => (state.me ? formatWalk(distanceKm(state.me, p)) : null);
  const statusOf = (p) => openStatus(p, state.day, state.time);
  const filterCount = () => [
    state.types.size, state.foodTypes.size, state.meals.size, state.prices.size, state.areas.size, state.booking.size,
    state.minRating !== null, state.openOn || state.hideClosed, state.shortlistOnly,
  ].filter(Boolean).length;
  const sameSet = (set, values) => set.size === values.length && values.every((v) => set.has(v));
  const isClosedNow = (p) => state.openOn && !isOpenAt(p, state.day, state.time);

  /* ---- render ---- */
  function chip(label, pressed, attrs, cls = '') {
    return `<button class="chip ${cls}" aria-pressed="${pressed}" ${attrs}>${label}</button>`;
  }
  function renderFilters() {
    $('type-chips').innerHTML = Object.entries(TYPES).map(([k, t]) =>
      chip(`${t.icon} ${esc(t.label)}`, state.types.has(k), `data-type="${k}"`, 't-' + k)).join('');
    $('meal-chips').innerHTML = MEALS.map((m) => chip(esc(m), state.meals.has(m), `data-meal="${m}"`)).join('');
    $('booking-chips').innerHTML = Object.entries(BOOKINGS).map(([k, l]) => chip(esc(l), state.booking.has(k), `data-booking="${k}"`)).join('');
    $('price-group').hidden = presentPrices.length === 0;
    $('price-chips').innerHTML = presentPrices.map((v) => chip(esc(v), state.prices.has(v), `data-price="${esc(v)}"`)).join('');
    $('rating-chips').innerHTML = RATING_STEPS.map((v) => chip(`${v.toFixed(1)}+`, state.minRating === v, `data-rating="${v}"`)).join('');
    $('food-group').hidden = FOODS.length === 0;
    const foodCollapsible = FOODS.length > AREA_COLLAPSE_MAX;
    const shownFoods = foodCollapsible && !state.showAllFood ? FOODS.filter((f, i) => i < FOOD_TOP || state.foodTypes.has(f)) : FOODS;
    $('food-chips').innerHTML = shownFoods.map((f) => chip(esc(f), state.foodTypes.has(f), `data-food="${esc(f)}"`)).join('') +
      (foodCollapsible ? chip(state.showAllFood ? 'Fewer' : 'More…', state.showAllFood, 'data-food-more="1"') : '');
    $('area-group').hidden = AREAS.length === 0;
    const collapsible = AREAS.length > AREA_COLLAPSE_MAX;
    const shownAreas = collapsible && !state.showAllAreas ? AREAS.filter((a, i) => i < AREA_TOP || state.areas.has(a)) : AREAS;
    $('area-chips').innerHTML = shownAreas.map((a) => chip(esc(a), state.areas.has(a), `data-area="${esc(a)}"`)).join('') +
      (collapsible ? chip(state.showAllAreas ? 'Fewer' : 'More…', state.showAllAreas, 'data-area-more="1"') : '');
    $('shortlist-only').setAttribute('aria-pressed', state.shortlistOnly);
  }
  function renderToolbar(shown) {
    const n = filterCount();
    $('filters-btn').textContent = n ? `Filters · ${n}` : 'Filters';
    $('toolbar').hidden = state.tab !== 'explore' || Boolean(state.selected);
    $('clock').textContent = `Showing ${clockLabel(state.day, state.time)}`;
    $('sheet-done').textContent = `Show ${shown.length} place${shown.length === 1 ? '' : 's'}`;
    document.querySelectorAll('[data-quick]').forEach((b) => {
      const k = b.dataset.quick;
      const on = k === 'open' ? state.openOn && state.hideClosed : k === 'shortlist' ? state.shortlistOnly : sameSet(state.types, QUICK_TYPES[k]);
      b.setAttribute('aria-pressed', on);
    });
  }
  function renderPreview(shown) {
    const p = state.preview && shown.find((x) => x.id === state.preview);
    const html = p ? previewHtml(p, { status: statusOf(p), distance: distanceText(p) }) : '';
    $('preview').hidden = !p;
    if ($('preview').dataset.html !== html) { $('preview').innerHTML = html; $('preview').dataset.html = html; }
  }
  function renderList(shown) {
    $('count').textContent = `${shown.length} of ${PLACES.length} places`;
    $('list').innerHTML = shown.length === 0 ? '<p class="empty">No places match these filters.</p>' :
      shown.map((p) => cardHtml(p, { status: statusOf(p), distance: distanceText(p), dim: isClosedNow(p), starred: state.shortlist.has(p.id), visited: state.visited.has(p.id), active: state.active === p.id })).join('');
  }
  function renderMarkers(shown) {
    const shownIds = new Set(shown.map((p) => p.id));
    const gone = [...inCluster].filter((id) => !shownIds.has(id));
    const added = [...shownIds].filter((id) => !inCluster.has(id));
    clusterLayer.removeLayers(gone.map((id) => markers.get(id)));
    gone.forEach((id) => inCluster.delete(id));
    shownIds.forEach((id) => {
      const m = markers.get(id);
      m.setIcon(pinIcon(byId.get(id), isClosedNow(byId.get(id)), state.active === id));
      m.setZIndexOffset(state.active === id ? 1000 : 0);
    });
    clusterLayer.addLayers(added.map((id) => markers.get(id)));
    added.forEach((id) => inCluster.add(id));
  }
  function renderBook() {
    const items = bookAhead(PLACES);
    $('book-count').textContent = items.length;
    $('view-book').innerHTML = `<h2>Book before you go</h2><p class="small">Essential first, then recommended, then ticketed.</p>` +
      items.map(bookItemHtml).join('');
  }
  function renderDetails() {
    const p = state.selected && byId.get(state.selected);
    const showDetails = Boolean(p);
    $('details').hidden = !showDetails;
    $('view-explore').hidden = showDetails || state.tab !== 'explore';
    $('view-book').hidden = showDetails || state.tab !== 'book';
    if (!p) return;
    $('details').innerHTML = detailsHtml(p, {
      distance: distanceText(p), status: statusOf(p),
      day: state.openOn ? state.day : null, starred: state.shortlist.has(p.id), visited: state.visited.has(p.id),
      openState: state.openOn ? isOpenAt(p, state.day, state.time) : null,
    });
  }
  // Filter chips are re-rendered on every change; keep keyboard focus on the same chip inside the sheet.
  function sheetFocusKey() {
    const el = document.activeElement;
    if (!el || !$('filters').contains(el) || !el.dataset) return null;
    const attr = Object.keys(el.dataset)[0];
    return attr ? { attr, value: el.dataset[attr] } : null;
  }
  function restoreSheetFocus(key) {
    if (!key) return;
    const next = [...$('filters').querySelectorAll('button')].find((b) => b.dataset[key.attr] === key.value);
    if (next && document.activeElement !== next) next.focus();
  }
  function update() {
    if (!drag) applySheet();
    const shown = visiblePlaces();
    $('sort-wrap').hidden = !state.me;
    $('open-on').checked = state.openOn;
    $('sort-nearest').checked = state.sortNearest;
    $('hide-closed').checked = state.hideClosed;
    $('open-day').value = state.day;
    $('open-time').value = state.time;
    const focusKey = sheetFocusKey();
    renderFilters(); renderToolbar(shown); renderList(shown); renderMarkers(shown); renderPreview(shown); renderDetails();
    restoreSheetFocus(focusKey);
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === state.tab;
      t.classList.toggle('active', on); t.setAttribute('aria-selected', on);
    });
    const activeCard = document.querySelector('.card.active');
    if (activeCard && activeCard.offsetParent !== null && state.lastScrolled !== state.active) {
      activeCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      state = { ...state, lastScrolled: state.active };
    }
  }

  let listScrollTop = 0;
  function openDetails(id, fly = true) {
    const p = byId.get(id);
    if (!p) return;
    if (fly) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), DETAIL_ZOOM), { duration: 0.6 });
    if (!state.selected) listScrollTop = $('panel').scrollTop;
    setState({ selected: id, active: id, preview: null, ...(state.sheet === 'map' && { sheet: 'split' }) });
    $('panel').scrollTop = 0;
  }

  /* ---- phone bottom-sheet split (map height via --map-h on .app) ---- */
  const phoneMq = window.matchMedia('(max-width: 767px)');
  const SHEET_ORDER = ['list', 'split', 'map'];
  const TAP_SLOP = 6;
  const grabber = $('grabber'), topEl = document.querySelector('header.top'), appEl = document.querySelector('.app'), mapWrap = document.querySelector('.map-wrap');
  const sheetHeights = () => {
    const vh = window.innerHeight;
    return { list: Math.max(120, Math.round(vh * 0.18)), split: Math.round(vh * 0.45), map: Math.max(120, vh - topEl.offsetHeight) };
  };
  let invalidatePending = false;
  function invalidateMap() {
    if (invalidatePending) return;
    invalidatePending = true;
    requestAnimationFrame(() => { invalidatePending = false; map.invalidateSize(); });
  }
  let appliedSheet = null;
  function applySheet() {
    const on = phoneMq.matches;
    if (!on) { appEl.style.removeProperty('--map-h'); appliedSheet = null; invalidateMap(); return; }
    appEl.classList.toggle('sheet-map', state.sheet === 'map');
    grabber.setAttribute('aria-expanded', state.sheet !== 'map');
    appEl.style.setProperty('--map-h', `${sheetHeights()[state.sheet]}px`);
    if (appliedSheet !== state.sheet) invalidateMap();
    appliedSheet = state.sheet;
  }
  const nextSheet = () => (state.sheet === 'map' ? 'split' : state.sheet === 'split' ? 'map' : 'split');
  const nearestSheet = (h) => { const hs = sheetHeights(); return SHEET_ORDER.reduce((b, k) => (Math.abs(hs[k] - h) < Math.abs(hs[b] - h) ? k : b)); };
  let drag = null;
  topEl.addEventListener('pointerdown', (e) => {
    if (!phoneMq.matches || (e.button > 0) || (e.target !== grabber && e.target.closest('input, button, select, a, [role="tab"]'))) return;
    drag = { y: e.clientY, h: mapWrap.getBoundingClientRect().height, moved: false, onGrabber: e.target === grabber, id: e.pointerId };
    topEl.setPointerCapture(e.pointerId);
  });
  topEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < TAP_SLOP) return;
    if (!drag.moved) appEl.classList.add('sheet-dragging');
    drag.moved = true;
    const hs = sheetHeights();
    appEl.style.setProperty('--map-h', `${Math.min(hs.map, Math.max(hs.list, drag.h + dy))}px`);
    invalidateMap();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, onGrabber } = drag;
    drag = null;
    appEl.classList.remove('sheet-dragging');
    if (moved && e.type === 'pointerup') setState({ sheet: nearestSheet(mapWrap.getBoundingClientRect().height) });
    else if (!moved && onGrabber && e.type === 'pointerup') setState({ sheet: nextSheet() });
    else applySheet();
  };
  topEl.addEventListener('pointerup', endDrag);
  topEl.addEventListener('pointercancel', endDrag);
  grabber.addEventListener('click', (e) => { if (e.detail === 0) setState({ sheet: nextSheet() }); });
  grabber.addEventListener('keydown', (e) => {
    const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = SHEET_ORDER.indexOf(state.sheet) + (e.key === 'ArrowDown' ? 1 : -1);
    setState({ sheet: SHEET_ORDER[Math.min(SHEET_ORDER.length - 1, Math.max(0, i))] });
  });
  mapWrap.addEventListener('transitionend', invalidateMap);
  window.addEventListener('resize', () => { applySheet(); invalidateMap(); });
  phoneMq.addEventListener('change', applySheet);
  if (window.ResizeObserver) new ResizeObserver(() => { if (state.sheet === 'map' && !drag) applySheet(); }).observe(topEl);

  /* ---- events ---- */
  function quickPatch(key) {
    if (key === 'open') return { openOn: !(state.openOn && state.hideClosed), hideClosed: !(state.openOn && state.hideClosed) };
    if (key === 'shortlist') return { shortlistOnly: !state.shortlistOnly };
    return { types: sameSet(state.types, QUICK_TYPES[key]) ? new Set() : new Set(QUICK_TYPES[key]) };
  }
  function quickFilter(key) {
    setState(quickPatch(key));
    fit(visiblePlaces());
  }
  const toggleIn = (key, v) => setState({ [key]: toggled(state[key], v) });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type],[data-meal],[data-booking],[data-price],[data-rating],[data-area],[data-area-more],[data-food],[data-food-more],[data-star],[data-visit],[data-open],[data-quick],[data-preview-close],.card,#back');
    if (!t) return;
    const d = t.dataset;
    if (d.type) return toggleIn('types', d.type);
    if (d.meal) return toggleIn('meals', d.meal);
    if (d.booking) return toggleIn('booking', d.booking);
    if (d.price) return toggleIn('prices', d.price);
    if (d.rating) return setState({ minRating: state.minRating === Number(d.rating) ? null : Number(d.rating) });
    if (d.area) return toggleIn('areas', d.area);
    if (d.food) return toggleIn('foodTypes', d.food);
    if (d.foodMore) return setState({ showAllFood: !state.showAllFood });
    if (d.areaMore) return setState({ showAllAreas: !state.showAllAreas });
    if (d.star) { e.stopPropagation(); const s = toggled(state.shortlist, d.star); state = { ...state, shortlist: s }; persist(); return update(); }
    if (d.visit) { const v = toggled(state.visited, d.visit); state = { ...state, visited: v }; persist(); return update(); }
    if (d.quick) return quickFilter(d.quick);
    if (d.previewClose) return setState({ preview: null, active: null });
    if (d.open) return openDetails(d.open);
    if (t.id === 'back') { setState({ selected: null }); $('panel').scrollTop = listScrollTop; return; }
    if (t.classList.contains('card')) return openDetails(d.id);
  });
  document.addEventListener('keydown', (e) => {
    const card = e.target.closest && e.target.closest('.card');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetails(card.dataset.id); }
  });
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setState({ tab: t.dataset.tab, selected: null })));
  $('q').addEventListener('input', (e) => setState({ query: e.target.value }));
  $('open-on').addEventListener('change', (e) => setState({ openOn: e.target.checked }));
  // Picking a day/time means "what's open then", so also hide closed places (untick Hide closed to see them).
  $('open-day').addEventListener('change', (e) => setState({ day: e.target.value, openOn: true, hideClosed: true, live: false }));
  $('open-time').addEventListener('change', (e) => e.target.value && setState({ time: e.target.value, openOn: true, hideClosed: true, live: false }));
  $('hide-closed').addEventListener('change', (e) => setState({ hideClosed: e.target.checked, openOn: e.target.checked || state.openOn }));
  $('shortlist-only').addEventListener('click', () => setState({ shortlistOnly: !state.shortlistOnly }));
  $('day-trips').addEventListener('click', () => { closeSheet(); fit(PLACES); });
  $('clear').addEventListener('click', () => {
    $('q').value = '';
    setState({ ...emptyFilters(), selected: null, active: null, preview: null });
    fitCentre();
  });

  /* ---- filters sheet (modal <dialog>: Esc, focus trap and focus return come from the platform) ---- */
  const sheet = $('sheet');
  function openSheet(focusId) {
    if (sheet.open) return;
    sheet.showModal();
    if (focusId) $(focusId).focus();
  }
  function closeSheet() { if (sheet.open) sheet.close(); }
  sheet.addEventListener('close', () => $('filters-btn').focus());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  $('filters-btn').addEventListener('click', () => openSheet());
  $('clock').addEventListener('click', () => openSheet('open-day'));
  $('sheet-close').addEventListener('click', closeSheet);
  $('sheet-done').addEventListener('click', () => { closeSheet(); fit(visiblePlaces()); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.open && state.preview) setState({ preview: null, active: null });
  });

  const toast = (text) => { $('toast').textContent = text; $('toast').hidden = !text; };
  window.TripLocate.create(map, (me) => {
    if (me && state.me) {
      if (!hasMoved(state.me, me, MOVE_THRESHOLD_M)) return;
      state = { ...state, me };
      renderList(visiblePlaces()); renderDetails();
      return;
    }
    state = { ...state, me, sortNearest: Boolean(me) };
    update();
  }, toast);
  $('sort-nearest').addEventListener('change', (e) => setState({ sortNearest: e.target.checked }));

  setInterval(() => {
    const now = tripNow();
    if (state.live && now && (now.day !== state.day || now.time !== state.time)) setState({ day: now.day, time: now.time });
  }, CLOCK_REFRESH_MS);

  renderBook();
  update();
  fitCentre();
})();
