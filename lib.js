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

  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtClock = (min) => `${pad2(Math.floor((min % 1440) / 60))}:${pad2(min % 60)}`;
  const CLOSING_SOON_MIN = 60;

  /* Latest close (minutes from today 00:00, may exceed 1440) of any range open at t, else null. */
  function closeAfter(schedule, day, t) {
    const dayIdx = DAYS.indexOf(day);
    const ends = [];
    (schedule[day] || []).forEach(([open, close]) => {
      const o = toMinutes(open);
      const c = toMinutes(close);
      if (c <= o ? t >= o : t >= o && t < c) ends.push(c <= o ? c + 1440 : c);
    });
    (dayIdx > 0 ? schedule[DAYS[dayIdx - 1]] || [] : []).forEach(([open, close]) => {
      const c = toMinutes(close);
      if (c <= toMinutes(open) && t < c) ends.push(c);
    });
    return ends.length ? Math.max(...ends) : null;
  }

  function openStatus(place, day, time) {
    const schedule = place.hours || {};
    const t = toMinutes(time);
    if ((schedule[day] || []).some(([o, c]) => o === '00:00' && c === '24:00')) return { state: 'open', text: 'Open 24h' };
    const end = closeAfter(schedule, day, t);
    if (end !== null) {
      const left = end - t;
      return left <= CLOSING_SOON_MIN ?
        { state: 'closing', text: `Closes in ${left} min` } :
        { state: 'open', text: `Open · until ${fmtClock(end)}` };
    }
    const next = (schedule[day] || []).map(([o]) => toMinutes(o)).filter((o) => o > t).sort((a, b) => a - b)[0];
    return next === undefined ? { state: 'closed', text: 'Closed today' } : { state: 'later', text: `Opens ${fmtClock(next)}` };
  }

  const TRIP_DAYS = { '2026-11-20': 'fri', '2026-11-21': 'sat', '2026-11-22': 'sun', '2026-11-23': 'mon' };
  const londonClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  /* {day, time} in Europe/London if the date is within the trip, else null. */
  function tripNow(date = new Date()) {
    if (Number.isNaN(date.getTime())) return null;
    const p = Object.fromEntries(londonClock.formatToParts(date).map(({ type, value }) => [type, value]));
    const day = TRIP_DAYS[`${p.year}-${p.month}-${p.day}`];
    return day ? { day, time: `${p.hour}:${p.minute}` } : null;
  }

  function matchesQuery(place, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const hay = [place.name, place.cuisine, place.neighbourhood, place.blurb, place.userNote, place.address,
      ...(place.foodTypes || []), ...(place.tags || [])].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }

  const passesSet = (set, ok) => !set || set.size === 0 || ok;

  // Food, drink and shops are indoors; sights, activities and trips say so in `setting`.
  const INDOOR_TYPES = new Set(['cafe', 'restaurant', 'bar', 'pub', 'vintage', 'music']);
  const isIndoor = (place) => (place.setting ? place.setting === 'indoor' : INDOOR_TYPES.has(place.type));

  function filterPlaces(places, state) {
    const s = state || {};
    return places.filter((p) => {
      if (!passesSet(s.types, s.types && s.types.has(p.type))) return false;
      if (!passesSet(s.meals, s.meals && (p.meals || []).some((m) => s.meals.has(m)))) return false;
      if (!passesSet(s.prices, s.prices && s.prices.has(p.price))) return false;
      if (typeof s.minRating === 'number' && !(typeof p.googleRating === 'number' && p.googleRating >= s.minRating)) return false;
      if (!passesSet(s.areas, s.areas && s.areas.has(p.neighbourhood))) return false;
      if (!passesSet(s.foodTypes, s.foodTypes && (p.foodTypes || []).some((f) => s.foodTypes.has(f)))) return false;
      if (!passesSet(s.booking, s.booking && s.booking.has(p.booking))) return false;
      if (s.openAt && !isOpenAt(p, s.openAt.day, s.openAt.time, { kitchen: !!s.openAt.kitchen })) return false;
      if (!matchesQuery(p, s.query)) return false;
      if (s.shortlistOnly && !(s.shortlist && s.shortlist.has(p.id))) return false;
      if (s.indoorOnly && !isIndoor(p)) return false;
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

  const WALK_DETOUR = 1.3;
  const WALK_KMH = 4.8;
  const WALK_LONG_MIN = 40;
  const walkMinutes = (km) => Math.round((km * WALK_DETOUR / WALK_KMH) * 60);

  function formatWalk(km) {
    const min = walkMinutes(km);
    return min > WALK_LONG_MIN ? `${km.toFixed(1)} km` : `${Math.max(1, min)} min walk`;
  }

  const DEFAULT_BASE = Object.freeze({ lat: 53.48085, lng: -2.23676, label: 'Piccadilly Gardens' });

  /* Walking start: live location if known, else the saved base (else default). */
  function startPoint(me, base) {
    if (me) return { lat: me.lat, lng: me.lng, label: 'you', live: true };
    const b = base && Number.isFinite(base.lat) && Number.isFinite(base.lng) ? base : DEFAULT_BASE;
    return { lat: b.lat, lng: b.lng, label: b.label || DEFAULT_BASE.label, live: false };
  }

  function hasMoved(prev, next, thresholdMetres) {
    if (!prev || !next) return prev !== next;
    return distanceKm(prev, next) * 1000 > thresholdMetres;
  }

  /* bounds: {south, west, north, east}. No bounds yet means everything counts as in view. */
  function inBounds(place, bounds) {
    if (!bounds) return true;
    return place.lat >= bounds.south && place.lat <= bounds.north && place.lng >= bounds.west && place.lng <= bounds.east;
  }

  /* Split places into those inside the map view and those outside it, keeping order. */
  function splitByView(places, bounds) {
    return {
      inView: places.filter((p) => inBounds(p, bounds)),
      outside: places.filter((p) => !inBounds(p, bounds)),
    };
  }

  function sortByDistance(places, from) {
    return places
      .map((p) => ({ p, d: distanceKm(from, p) }))
      .sort((x, y) => x.d - y.d)
      .map((x) => x.p);
  }

  return { DAYS, isOpenAt, filterPlaces, bookAhead, isCentral, matchesQuery, distanceKm, formatDistance, sortByDistance, hasMoved, tripNow, openStatus, walkMinutes, formatWalk, DEFAULT_BASE, startPoint, inBounds, splitByView, isIndoor };
});
