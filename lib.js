/* Pure trip logic. No DOM. Browser: window.TripLib. Node: module.exports. */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.TripLib = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  const DAYS = ['fri', 'sat', 'sun', 'mon'];
  const BOOK_RANK = { essential: 0, recommended: 1, tickets: 2 };
  const CENTRE = { lat: 53.4808, lng: -2.2426 };
  const CENTRAL_RADIUS_KM = 3;

  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  function inRanges(ranges, t, spillOnly) {
    return (ranges || []).some(([open, close]) => {
      const o = toMinutes(open);
      const c = toMinutes(close);
      const spills = c <= o;
      if (spillOnly) return spills && t < c;
      return spills ? t >= o : t >= o && t < c;
    });
  }

  function isOpenAt(place, day, time, opts = {}) {
    const dayIdx = DAYS.indexOf(day);
    if (dayIdx < 0) return false;
    const schedule = opts.kitchen && place.kitchenHours ? place.kitchenHours : place.hours;
    if (!schedule) return false;
    const t = toMinutes(time);
    if (inRanges(schedule[day], t, false)) return true;
    const prev = dayIdx > 0 ? DAYS[dayIdx - 1] : null;
    return prev ? inRanges(schedule[prev], t, true) : false;
  }

  function matchesQuery(place, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const hay = [place.name, place.cuisine, place.neighbourhood, place.blurb, place.userNote, place.address,
      ...(place.tags || [])].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }

  const passesSet = (set, ok) => !set || set.size === 0 || ok;

  function filterPlaces(places, state) {
    const s = state || {};
    return places.filter((p) => {
      if (!passesSet(s.types, s.types && s.types.has(p.type))) return false;
      if (!passesSet(s.meals, s.meals && (p.meals || []).some((m) => s.meals.has(m)))) return false;
      if (!passesSet(s.prices, s.prices && s.prices.has(p.price))) return false;
      if (typeof s.minRating === 'number' && !(typeof p.googleRating === 'number' && p.googleRating >= s.minRating)) return false;
      if (!passesSet(s.areas, s.areas && s.areas.has(p.neighbourhood))) return false;
      if (!passesSet(s.booking, s.booking && s.booking.has(p.booking))) return false;
      if (s.openAt && !isOpenAt(p, s.openAt.day, s.openAt.time, { kitchen: !!s.openAt.kitchen })) return false;
      if (!matchesQuery(p, s.query)) return false;
      if (s.shortlistOnly && !(s.shortlist && s.shortlist.has(p.id))) return false;
      return true;
    });
  }

  function bookAhead(places) {
    return places
      .filter((p) => p.booking in BOOK_RANK)
      .map((p, i) => ({ p, i }))
      .sort((a, b) => BOOK_RANK[a.p.booking] - BOOK_RANK[b.p.booking] || a.i - b.i)
      .map((x) => x.p);
  }

  function isCentral(place) {
    const rad = Math.PI / 180;
    const dLat = (place.lat - CENTRE.lat) * rad;
    const dLng = (place.lng - CENTRE.lng) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(CENTRE.lat * rad) * Math.cos(place.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a)) <= CENTRAL_RADIUS_KM;
  }

  const EARTH_KM = 6371;
  const WALK_M_PER_MIN = 80;
  const WALK_MAX_KM = 3;

  function distanceKm(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return EARTH_KM * 2 * Math.asin(Math.sqrt(h));
  }

  function formatDistance(km) {
    const m = km * 1000;
    const text = m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(km).toFixed(1)} km`;
    if (km >= WALK_MAX_KM) return text;
    return `${text} (~${Math.max(1, Math.round(m / WALK_M_PER_MIN))} min walk)`;
  }

  function hasMoved(prev, next, thresholdMetres) {
    if (!prev || !next) return prev !== next;
    return distanceKm(prev, next) * 1000 > thresholdMetres;
  }

  function sortByDistance(places, from) {
    return places
      .map((p) => ({ p, d: distanceKm(from, p) }))
      .sort((x, y) => x.d - y.d)
      .map((x) => x.p);
  }

  return { DAYS, isOpenAt, filterPlaces, bookAhead, isCentral, matchesQuery, distanceKm, formatDistance, sortByDistance, hasMoved };
});
