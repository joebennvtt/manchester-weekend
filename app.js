/* State, map and wiring. Uses window.PLACES, TripLib, TripRender, Leaflet. */
(function () {
  const { filterPlaces, bookAhead, isOpenAt, isCentral, distanceKm, sortByDistance, hasMoved, tripNow, openStatus, formatWalk, walkMinutes, startPoint, DEFAULT_BASE, splitByView } = window.TripLib;
  const { TYPES, FOOD_TYPES, MEALS, BOOKINGS, DAY_LABELS, esc, detailsHtml, cardHtml, previewHtml, bookViewHtml } = window.TripRender;
  const { svg } = window.TripIcons;
  const { normalisePlans, addStop, removeStop, moveStop, setStay, setStart, planTimeline, encodeShare, decodeShare, mergeShared, sharedCount } = window.TripPlan;
  const { planHtml, homeHtml, homeShort, addToPlanHtml, planButtonHtml, shareBannerHtml } = window.TripRenderPlan;
  const { homeOptions, nightOf } = window.TripHome;
  const HOME = window.GETTING_HOME;
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
  // index.html holds <span data-icon="name" data-size="16" data-cls="x"> placeholders; swap them for inline SVG.
  const ICON_DEFAULT_SIZE = 20;
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.outerHTML = svg(el.dataset.icon, { size: Number(el.dataset.size) || ICON_DEFAULT_SIZE, cls: el.dataset.cls });
  });
  const QUICK_TYPES = { food: ['cafe', 'restaurant'], drinks: ['bar', 'pub'], sights: ['see', 'do'], shops: ['vintage', 'music'] };
  const CLOCK_REFRESH_MS = 60000;
  const PREVIEW_PAD_PX = 200;
  const DETAIL_ZOOM = 17;
  const STORE_KEY = 'manchester-trip-v1';
  const LATE_FROM_MIN = 21 * 60;
  const TOAST_MS = 6000;
  const MAP_SAVE_PAD_KM = 1.5;
  const SHARE_PREFIX = '#share=';
  const knownIds = new Set(PLACES.map((p) => p.id));

  const loadStore = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  };
  const saved = loadStore();
  const validBase = (b) => Boolean(b) && Number.isFinite(b.lat) && Number.isFinite(b.lng) && typeof b.label === 'string' && b.label !== '';
  const emptyFilters = () => ({ types: new Set(), meals: new Set(), booking: new Set(), prices: new Set(), areas: new Set(), foodTypes: new Set(), minRating: null, query: '', openOn: false, hideClosed: false, shortlistOnly: false, indoorOnly: false });
  const trip = tripNow();
  // During the trip, start on the real day/time with "Open now" on; otherwise the Sat 12:00 default.
  let state = {
    ...emptyFilters(), showAllAreas: false, showAllFood: false, day: trip ? trip.day : 'sat', time: trip ? trip.time : '12:00',
    openOn: Boolean(trip), hideClosed: Boolean(trip), live: Boolean(trip),
    shortlist: new Set(saved.shortlist || []), visited: new Set(saved.visited || []),
    base: validBase(saved.base) ? saved.base : DEFAULT_BASE,
    plans: normalisePlans(saved.plans, knownIds), planDay: trip ? trip.day : 'sat', shared: null, net: null,
    tab: 'explore', sheet: 'split', selected: null, active: null, preview: null, me: null, sortNearest: false, view: null,
  };
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ shortlist: [...state.shortlist], visited: [...state.visited], base: state.base, plans: state.plans })); } catch (e) { /* storage unavailable */ }
  }
  // Any change other than moving the map: if nothing that matches is in view, bring the matches into view.
  function setState(patch) {
    state = { ...state, ...patch };
    update();
    const { inView, outside } = splitByView(visiblePlaces(), state.view);
    if (inView.length === 0 && outside.length > 0) fit(outside);
  }
  const toggled = (set, v) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  /* ---- map ---- */
  // markercluster needs a map-level maxZoom; the MapLibre vector layer doesn't provide one.
  const map = L.map('map', { zoomControl: true, maxZoom: 19 });
  window.TripBasemap.add(map);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const moveTo = (center, zoom) => (reducedMotion ? map.setView(center, zoom) : map.flyTo(center, zoom, { duration: 0.6 }));
  const clusterLayer = L.markerClusterGroup({
    maxClusterRadius: 40, disableClusteringAtZoom: 17, spiderfyOnMaxZoom: true, showCoverageOnHover: false, animate: !reducedMotion,
    iconCreateFunction: (c) => L.divIcon({ className: '', iconSize: [36, 36], html: `<div class="cluster">${c.getChildCount()}</div>` }),
  }).addTo(map);
  const markers = new Map();
  const inCluster = new Set();
  const pinIcon = (p, dim, active) => L.divIcon({
    className: '', iconSize: [32, 32], iconAnchor: [16, 16],
    html: `<div class="pin t-${p.type}${dim ? ' dim' : ''}${active ? ' active' : ''}">${svg(TYPES[p.type].icon, { size: 16 })}</div>`,
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
  const boundsOf = (b) => ({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
  const sameView = (a, b) => Boolean(a) && Boolean(b) && ['south', 'west', 'north', 'east'].every((k) => a[k] === b[k]);
  // The list shows what's in the map view. On phones, a collapsed map strip keeps the last real view.
  map.on('moveend', () => {
    if (drag || (phoneMq.matches && state.sheet === 'list')) return;
    const view = boundsOf(map.getBounds());
    if (sameView(view, state.view)) return;
    state = { ...state, view };
    update();
  });

  /* ---- derived ---- */
  const openAtState = () => (state.openOn ? { day: state.day, time: state.time } : null);
  const visiblePlaces = () => {
    const filtered = filterPlaces(PLACES, { ...state, openAt: state.hideClosed ? openAtState() : null });
    return state.sortNearest ? sortByDistance(filtered, origin()) : filtered;
  };
  const origin = () => startPoint(state.me, state.base);
  const distanceText = (p) => formatWalk(distanceKm(origin(), p));
  const statusOf = (p) => openStatus(p, state.day, state.time);
  const walkToHub = (p) => walkMinutes(distanceKm(p, HOME.hub));
  const homeFor = (p, day, readyMin) => homeOptions(HOME, day, readyMin, walkToHub(p));
  // Late in the evening, cards say when to leave to get home.
  const homeText = (p) => {
    const night = nightOf(state.day, state.time);
    return night.min >= LATE_FROM_MIN ? homeShort(homeFor(p, night.day, night.min)) : null;
  };
  const filterCount = () => [
    state.types.size, state.foodTypes.size, state.meals.size, state.prices.size, state.areas.size, state.booking.size,
    state.minRating !== null, state.openOn || state.hideClosed, state.shortlistOnly, state.indoorOnly,
  ].filter(Boolean).length;
  const sameSet = (set, values) => set.size === values.length && values.every((v) => set.has(v));
  const isClosedNow = (p) => state.openOn && !isOpenAt(p, state.day, state.time);

  /* ---- render ---- */
  function chip(label, pressed, attrs, cls = '', icon = '') {
    const lead = icon ? svg(icon, { size: 16 }) : '';
    return `<button class="chip ${cls}" aria-pressed="${pressed}" ${attrs}>${lead}<span>${label}</span>${svg('check', { size: 16, cls: 'chip-check' })}</button>`;
  }
  function renderFilters() {
    $('type-chips').innerHTML = Object.entries(TYPES).map(([k, t]) =>
      chip(esc(t.label), state.types.has(k), `data-type="${k}"`, 't-' + k, t.icon)).join('');
    $('meal-chips').innerHTML = MEALS.map((m) => chip(esc(m), state.meals.has(m), `data-meal="${m}"`)).join('');
    $('booking-chips').innerHTML = Object.entries(BOOKINGS).map(([k, l]) => chip(esc(l), state.booking.has(k), `data-booking="${k}"`)).join('');
    $('price-group').hidden = presentPrices.length === 0;
    $('price-chips').innerHTML = presentPrices.map((v) => chip(esc(v), state.prices.has(v), `data-price="${esc(v)}"`)).join('');
    $('rating-chips').innerHTML = RATING_STEPS.map((v) => chip(`${v.toFixed(1)}+`, state.minRating === v, `data-rating="${v}"`, '', 'star')).join('');
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
    $('indoor-only').setAttribute('aria-pressed', state.indoorOnly);
  }
  function renderToolbar(shown) {
    const n = filterCount();
    $('filters-count').textContent = n || '';
    $('filters-count').hidden = !n;
    $('filters-btn').setAttribute('aria-label', n ? `Filters, ${n} active` : 'Filters');
    $('toolbar').hidden = state.tab !== 'explore' || Boolean(state.selected);
    $('clock').innerHTML = `${state.live ? '<span class="live-dot"></span>' : svg('clock', { size: 16 })}<span class="clock-text">${esc(DAY_LABELS[state.day])} · ${esc(state.time)}</span>${svg('chevron-down', { size: 16 })}`;
    $('clock').setAttribute('aria-label', `${DAY_LABELS[state.day]} · ${state.time}${state.live ? ', live' : ''}. Change day and time`);
    $('sheet-done').textContent = `Show ${shown.length} place${shown.length === 1 ? '' : 's'}`;
    document.querySelectorAll('[data-quick]').forEach((b) => {
      const k = b.dataset.quick;
      const on = k === 'open' ? state.openOn && state.hideClosed : k === 'shortlist' ? state.shortlistOnly :
        k === 'indoors' ? state.indoorOnly : sameSet(state.types, QUICK_TYPES[k]);
      b.setAttribute('aria-pressed', on);
    });
  }
  function renderPreview(shown) {
    const p = state.preview && shown.find((x) => x.id === state.preview);
    const html = p ? previewHtml(p, { status: statusOf(p), distance: distanceText(p), home: homeText(p), planButton: planButtonHtml(p.id, state.planDay, state.plans) }) : '';
    $('preview').hidden = !p;
    if ($('preview').dataset.html !== html) { $('preview').innerHTML = html; $('preview').dataset.html = html; }
  }
  function outsideHtml(n) {
    if (n === 0) return '';
    return `<button class="outside" data-fit-all="1">${n} more outside this map view · <span>Show all</span></button>`;
  }
  function renderList(shown) {
    const { inView, outside } = splitByView(shown, state.view);
    $('count').textContent = `${inView.length} place${inView.length === 1 ? '' : 's'} on the map`;
    const empty = shown.length === 0 ? '<p class="empty">No places match these filters.</p>' :
      inView.length === 0 ? '<p class="empty">Nothing that matches is in this part of the map.</p>' : '';
    $('list').innerHTML = empty + inView.map((p) => cardHtml(p, { status: statusOf(p), distance: distanceText(p), home: homeText(p), dim: isClosedNow(p), starred: state.shortlist.has(p.id), visited: state.visited.has(p.id), active: state.active === p.id })).join('') +
      outsideHtml(outside.length);
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
  function renderWalkFrom() {
    const o = origin();
    const isDefault = state.base.label === DEFAULT_BASE.label && state.base.lat === DEFAULT_BASE.lat && state.base.lng === DEFAULT_BASE.lng;
    const action = o.live ? '' : isDefault ? ' · <button data-base-hint="1">change</button>' : ` · <button data-base-reset="1">reset to ${esc(DEFAULT_BASE.label)}</button>`;
    $('walk-from').innerHTML = `${svg('map-pin', { size: 16 })}<span>Walking from ${o.live ? 'your location' : esc(o.label)}${action}</span>`;
  }
  function renderBook() {
    const items = bookAhead(PLACES);
    $('book-count').textContent = items.length;
    $('view-book').innerHTML = bookViewHtml(items);
  }
  const dayTimeline = () => planTimeline(state.plans[state.planDay], state.planDay, HOME.hub, byId, window.TripLib);
  function renderPlan() {
    $('plan-count').textContent = Object.values(state.plans).reduce((n, d) => n + d.stops.length, 0) || '';
    if (state.tab !== 'plan') return;
    const day = state.planDay;
    const timeline = dayTimeline();
    const last = timeline.stops[timeline.stops.length - 1];
    const homeBlock = last ? homeHtml(homeFor(last.place, day, timeline.end), HOME, walkToHub(last.place), `${DAY_LABELS[day]}, leaving ${last.place.name}`) : '';
    const inPlan = new Set(state.plans[day].stops.map((s) => s.id));
    const extras = [...state.shortlist].filter((id) => byId.has(id) && !inPlan.has(id)).map((id) => byId.get(id));
    $('view-plan').innerHTML = planHtml({ day, plans: state.plans, timeline, homeBlock, extras, startLabel: HOME.hub.label });
  }
  let routeLayer = null;
  function renderRoute() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    if (state.tab !== 'plan') return;
    const stops = dayTimeline().stops;
    if (stops.length === 0) return;
    const points = [HOME.hub, ...stops.map((s) => s.place)].map((p) => [p.lat, p.lng]);
    const numbers = stops.map((s, i) => L.marker([s.place.lat, s.place.lng], { interactive: false, keyboard: false, zIndexOffset: 1500,
      icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [-6, 26], html: `<div class="route-num">${i + 1}</div>` }) }));
    routeLayer = L.layerGroup([L.polyline(points, { className: 'route-line', interactive: false }), ...numbers]).addTo(map);
  }
  function renderShareBanner() {
    $('share-banner').hidden = !state.shared;
    if (state.shared) $('share-banner').innerHTML = shareBannerHtml(state.shared, sharedCount(state.shared));
  }
  function renderNet() {
    const n = state.net;
    $('net').hidden = !(n && n.offline);
    $('net').innerHTML = `${svg('wifi-off', { size: 20 })}<span>Offline: showing saved places and the city-centre map. Map detail outside the centre may be missing.</span>`;
  }
  function renderDetails() {
    const p = state.selected && byId.get(state.selected);
    const showDetails = Boolean(p);
    $('details').hidden = !showDetails;
    $('view-explore').hidden = showDetails || state.tab !== 'explore';
    $('view-book').hidden = showDetails || state.tab !== 'book';
    $('view-plan').hidden = showDetails || state.tab !== 'plan';
    if (!p) return;
    const night = nightOf(state.day, state.time);
    const addPlan = addToPlanHtml(p.id, state.plans);
    const extraHtml = homeHtml(homeFor(p, night.day, night.min), HOME, walkToHub(p), `${DAY_LABELS[night.day]}, leaving ${state.time}`);
    $('details').innerHTML = detailsHtml(p, {
      distance: distanceText(p), km: `${distanceKm(origin(), p).toFixed(1)} km`, from: origin().label === 'you' ? 'you' : origin().label, status: statusOf(p),
      day: state.openOn ? state.day : null, starred: state.shortlist.has(p.id), visited: state.visited.has(p.id), live: state.live,
      openState: state.openOn ? isOpenAt(p, state.day, state.time) : null, planHtml: addPlan, extraHtml,
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
    $('open-on').checked = state.openOn;
    $('sort-nearest').checked = state.sortNearest;
    $('hide-closed').checked = state.hideClosed;
    $('open-day').value = state.day;
    $('open-time').value = state.time;
    const focusKey = sheetFocusKey();
    renderFilters(); renderToolbar(shown); renderWalkFrom(); renderList(shown); renderMarkers(shown); renderPreview(shown); renderDetails();
    renderPlan(); renderRoute(); renderShareBanner(); renderNet();
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
  let listMapView = null;
  function openDetails(id, fly = true) {
    const p = byId.get(id);
    if (!p) return;
    if (!state.selected) listMapView = { center: map.getCenter(), zoom: map.getZoom() };
    if (fly) moveTo([p.lat, p.lng], Math.max(map.getZoom(), DETAIL_ZOOM));
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
    if (key === 'indoors') return { indoorOnly: !state.indoorOnly };
    return { types: sameSet(state.types, QUICK_TYPES[key]) ? new Set() : new Set(QUICK_TYPES[key]) };
  }
  function quickFilter(key) {
    setState(quickPatch(key));
    fit(visiblePlaces());
  }
  const toggleIn = (key, v) => setState({ [key]: toggled(state[key], v) });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type],[data-meal],[data-booking],[data-price],[data-rating],[data-area],[data-area-more],[data-food],[data-food-more],[data-star],[data-visit],[data-open],[data-quick],[data-preview-close],[data-base-set],[data-base-reset],[data-base-hint],[data-fit-all],[data-plan-day],[data-move],[data-remove],[data-plan-add],[data-plan-toggle],[data-plan-map],[data-share],[data-share-accept],[data-share-dismiss],.card,#back');
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
    if (d.baseSet) { const p = byId.get(d.baseSet); return p && (setState({ base: { lat: p.lat, lng: p.lng, label: p.name } }), persist(), toast(`Walk times now from ${p.name}`)); }
    if (d.baseReset) { setState({ base: DEFAULT_BASE }); return persist(); }
    if (d.baseHint) return toast('Open a place and tap "Walk times from here"');
    if (d.quick) return quickFilter(d.quick);
    if (d.previewClose) return setState({ preview: null, active: null });
    if (d.open) return openDetails(d.open);
    if (d.fitAll) return fit(visiblePlaces());
    if (d.planDay) return setState({ planDay: d.planDay });
    if (d.move) return setPlans(moveStop(state.plans, state.planDay, Number(d.move), Number(d.delta)));
    if (d.remove) return setPlans(removeStop(state.plans, state.planDay, Number(d.remove)));
    if (d.planAdd) return byId.has(d.planAdd) && setPlans(addStop(state.plans, state.planDay, byId.get(d.planAdd)));
    if (d.planToggle) return togglePlanStop(d.planToggle, d.id);
    if (d.planMap) return showDayOnMap();
    if (d.share) return sharePlan();
    if (d.shareAccept) return acceptShared();
    if (d.shareDismiss) return setState({ shared: null });
    if (t.id === 'back') {
      if (listMapView) moveTo(listMapView.center, listMapView.zoom);
      listMapView = null;
      setState({ selected: null }); $('panel').scrollTop = listScrollTop; return;
    }
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
  $('indoor-only').addEventListener('click', () => setState({ indoorOnly: !state.indoorOnly }));
  $('day-trips').addEventListener('click', () => { closeSheet(); fit(PLACES); });
  $('clear').addEventListener('click', () => {
    $('q').value = '';
    setState({ ...emptyFilters(), selected: null, active: null, preview: null });
    fitCentre();
  });

  /* ---- plan and share ---- */
  function setPlans(plans) { setState({ plans }); persist(); }
  function togglePlanStop(day, id) {
    const p = byId.get(id);
    if (!p) return;
    const index = state.plans[day].stops.findIndex((s) => s.id === id);
    setPlans(index >= 0 ? removeStop(state.plans, day, index) : addStop(state.plans, day, p));
    if (index < 0) toast(`Added to ${DAY_LABELS[day]} plan`);
  }
  function showDayOnMap() {
    const stops = dayTimeline().stops.map((s) => s.place);
    if (stops.length === 0) return;
    if (phoneMq.matches && state.sheet === 'list') setState({ sheet: 'split' });
    fit([HOME.hub, ...stops]);
  }
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'plan-start' && /^\d{2}:\d{2}$/.test(t.value)) setPlans(setStart(state.plans, state.planDay, t.value));
    if (t.dataset && t.dataset.stay !== undefined) setPlans(setStay(state.plans, state.planDay, Number(t.dataset.stay), Number(t.value)));
  });
  const shareUrl = () => `${location.origin}${location.pathname}${SHARE_PREFIX}${encodeShare({ shortlist: [...state.shortlist], plans: state.plans })}`;
  async function sharePlan() {
    const url = shareUrl();
    try {
      if (navigator.share) await navigator.share({ title: 'Manchester Weekend plan', url });
      else { await navigator.clipboard.writeText(url); toast('Link copied. Send it to whoever you\'re travelling with.'); }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('Share failed:', e);
      window.prompt('Copy this link to share your plan:', url);
    }
  }
  function readSharedFromHash() {
    if (!location.hash.startsWith(SHARE_PREFIX)) return;
    const shared = decodeShare(location.hash.slice(SHARE_PREFIX.length), knownIds);
    history.replaceState(null, '', location.pathname + location.search);
    if (shared) setState({ shared, selected: null });
    else toast('That share link is broken or out of date.');
  }
  function acceptShared() {
    const merged = mergeShared({ shortlist: [...state.shortlist], plans: state.plans }, state.shared);
    setState({ shortlist: new Set(merged.shortlist), plans: merged.plans, shared: null, tab: 'plan' });
    persist();
    toast('Added to your shortlist and plan.');
  }
  window.addEventListener('hashchange', readSharedFromHash);

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

  let toastTimer = null;
  const toast = (text) => {
    $('toast').textContent = text; $('toast').hidden = !text;
    clearTimeout(toastTimer);
    if (text) toastTimer = setTimeout(() => { $('toast').hidden = true; }, TOAST_MS);
  };
  window.TripLocate.create(map, (me) => {
    if (me && state.me) {
      if (!hasMoved(state.me, me, MOVE_THRESHOLD_M)) return;
      state = { ...state, me };
      renderWalkFrom(); renderList(visiblePlaces()); renderPreview(visiblePlaces()); renderDetails();
      return;
    }
    state = { ...state, me, sortNearest: me ? true : state.sortNearest };
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
  readSharedFromHash();
  window.TripOffline.start(window.TripTiles.boundsAround(PLACES.filter(isCentral), MAP_SAVE_PAD_KM), (net) => {
    const fresh = net.saved && net.fresh && !(state.net && state.net.saved);
    state = { ...state, net };
    renderNet();
    if (fresh) toast('Saved for offline: all places and the city-centre map.');
  });
})();
