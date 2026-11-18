/* State, map and wiring. Uses window.PLACES, TripLib, TripRender, Leaflet. */
(function () {
  const { filterPlaces, bookAhead, isOpenAt, isCentral, distanceKm, formatDistance, sortByDistance, hasMoved } = window.TripLib;
  const { TYPES, FOOD_TYPES, MEALS, BOOKINGS, esc, detailsHtml, cardHtml, bookItemHtml } = window.TripRender;
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
  const STORE_KEY = 'manchester-trip-v1';

  const loadStore = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  };
  const saved = loadStore();
  const emptyFilters = () => ({ types: new Set(), meals: new Set(), booking: new Set(), prices: new Set(), areas: new Set(), foodTypes: new Set(), minRating: null, query: '', openOn: false, hideClosed: false, shortlistOnly: false });
  let state = {
    ...emptyFilters(), showAllAreas: false, showAllFood: false, day: 'sat', time: '12:00',
    shortlist: new Set(saved.shortlist || []), visited: new Set(saved.visited || []),
    tab: 'explore', selected: null, active: null, me: null, sortNearest: false,
  };
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ shortlist: [...state.shortlist], visited: [...state.visited] })); } catch (e) { /* storage unavailable */ }
  }
  function setState(patch) { state = { ...state, ...patch }; update(); }
  const toggled = (set, v) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  /* ---- map ---- */
  const map = L.map('map', { zoomControl: true });
  window.TripBasemap.add(map);
  const markerLayer = L.layerGroup().addTo(map);
  const markers = new Map();
  const pinIcon = (p, dim, active) => L.divIcon({
    className: '', iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<div class="pin t-${p.type}${dim ? ' dim' : ''}${active ? ' active' : ''}">${TYPES[p.type].icon}</div>`,
  });
  PLACES.forEach((p) => {
    const m = L.marker([p.lat, p.lng], { title: p.name, icon: pinIcon(p, false, false) });
    m.bindPopup(() => {
      const wrap = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = p.name;
      const btn = document.createElement('button');
      btn.textContent = 'Details';
      btn.addEventListener('click', () => openDetails(p.id, false));
      wrap.append(title, document.createElement('br'), btn);
      return wrap;
    });
    m.on('click', () => setState({ active: p.id, tab: 'explore', selected: null }));
    markers.set(p.id, m);
  });
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
  const distanceText = (p) => (state.me ? formatDistance(distanceKm(state.me, p)) : null);
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
  function renderList(shown) {
    $('count').textContent = `${shown.length} of ${PLACES.length} places`;
    $('list').innerHTML = shown.length === 0 ? '<p class="empty">No places match these filters.</p>' :
      shown.map((p) => cardHtml(p, { distance: distanceText(p), dim: isClosedNow(p), starred: state.shortlist.has(p.id), visited: state.visited.has(p.id), active: state.active === p.id })).join('');
  }
  function renderMarkers(shown) {
    const shownIds = new Set(shown.map((p) => p.id));
    markers.forEach((m, id) => {
      const p = byId.get(id);
      if (!shownIds.has(id)) { markerLayer.removeLayer(m); return; }
      m.setIcon(pinIcon(p, isClosedNow(p), state.active === id));
      m.setZIndexOffset(state.active === id ? 1000 : 0);
      markerLayer.addLayer(m);
    });
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
      distance: distanceText(p),
      day: state.openOn ? state.day : null, starred: state.shortlist.has(p.id), visited: state.visited.has(p.id),
      openState: state.openOn ? isOpenAt(p, state.day, state.time) : null,
    });
  }
  function update() {
    const shown = visiblePlaces();
    $('sort-wrap').hidden = !state.me;
    $('open-on').checked = state.openOn;
    $('hide-closed').checked = state.hideClosed;
    renderFilters(); renderList(shown); renderMarkers(shown); renderDetails();
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
    if (fly) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    markers.get(id).openPopup();
    if (!state.selected) listScrollTop = $('panel').scrollTop;
    setState({ selected: id, active: id });
    $('panel').scrollTop = 0;
  }

  /* ---- events ---- */
  const toggleIn = (key, v) => setState({ [key]: toggled(state[key], v) });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type],[data-meal],[data-booking],[data-price],[data-rating],[data-area],[data-area-more],[data-food],[data-food-more],[data-star],[data-visit],[data-open],.card,#back');
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
  $('open-day').addEventListener('change', (e) => setState({ day: e.target.value, openOn: true }));
  $('open-time').addEventListener('change', (e) => e.target.value && setState({ time: e.target.value, openOn: true }));
  $('hide-closed').addEventListener('change', (e) => setState({ hideClosed: e.target.checked, openOn: e.target.checked || state.openOn }));
  $('shortlist-only').addEventListener('click', () => setState({ shortlistOnly: !state.shortlistOnly }));
  $('day-trips').addEventListener('click', () => fit(PLACES));
  $('clear').addEventListener('click', () => {
    ['q'].forEach((id) => { $(id).value = ''; });
    setState({ ...emptyFilters(), selected: null, active: null });
    fitCentre();
  });

  const toast = (text) => { $('toast').textContent = text; $('toast').hidden = !text; };
  window.TripLocate.create(map, (me) => {
    if (me && state.me) {
      if (!hasMoved(state.me, me, MOVE_THRESHOLD_M)) return;
      state = { ...state, me };
      renderList(visiblePlaces()); renderDetails();
      return;
    }
    state = { ...state, me, ...(me ? {} : { sortNearest: false }) };
    if (!me) $('sort-nearest').checked = false;
    update();
  }, toast);
  $('sort-nearest').addEventListener('change', (e) => setState({ sortNearest: e.target.checked }));

  $('open-day').value = state.day;
  renderBook();
  update();
  fitCentre();
})();
