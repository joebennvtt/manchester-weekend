/* Day plans and share links. No DOM. Browser: window.TripPlan. Node: module.exports.
   A plan per day: { start: 'HH:MM', stops: [{ id, stay }] }, stay in minutes. All edits return new objects. */
(function (root, factory) {
  const plan = factory();
  if (typeof module === 'object' && module.exports) module.exports = plan;
  else root.TripPlan = plan;
})(typeof self !== 'undefined' ? self : this, function () {
  const DAYS = ['fri', 'sat', 'sun', 'mon'];
  const DEFAULT_START = '10:00';
  const DEFAULT_STAY_MIN = { cafe: 45, restaurant: 90, bar: 60, pub: 60, see: 90, do: 120, trip: 240, vintage: 30, music: 30 };
  const FALLBACK_STAY_MIN = 60;
  const MIN_STAY = 5;
  const MAX_STAY = 600;
  const DAY_MIN = 1440;
  const WALK_LONG_MIN = 40;
  const ROAD_DETOUR = 1.3;
  const TRANSIT_KMH = 20;
  const TRANSIT_WAIT_MIN = 10;
  const MAX_SHARED_IDS = 200;
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtTime = (min) => `${pad2(Math.floor((min % DAY_MIN) / 60))}:${pad2(min % 60)}`;

  const emptyPlans = () => Object.fromEntries(DAYS.map((d) => [d, { start: DEFAULT_START, stops: [] }]));
  const withDay = (plans, day, fn) => ({ ...plans, [day]: fn(plans[day] || { start: DEFAULT_START, stops: [] }) });
  const withStops = (plans, day, fn) => withDay(plans, day, (p) => ({ ...p, stops: fn(p.stops) }));

  function addStop(plans, day, place) {
    if ((plans[day] || { stops: [] }).stops.some((s) => s.id === place.id)) return plans;
    return withStops(plans, day, (stops) => [...stops, { id: place.id, stay: DEFAULT_STAY_MIN[place.type] || FALLBACK_STAY_MIN }]);
  }
  const removeStop = (plans, day, index) => withStops(plans, day, (stops) => stops.filter((_, i) => i !== index));
  function moveStop(plans, day, index, delta) {
    const to = index + delta;
    const stops = plans[day].stops;
    if (to < 0 || to >= stops.length) return plans;
    return withStops(plans, day, (s) => s.map((x, i) => (i === index ? s[to] : i === to ? s[index] : x)));
  }
  const setStay = (plans, day, index, stay) => withStops(plans, day, (stops) => stops.map((s, i) => (i === index ? { ...s, stay } : s)));
  const setStart = (plans, day, start) => withDay(plans, day, (p) => ({ ...p, start }));

  /* Minutes may run past midnight; check those against the next day's hours. */
  function openAt(place, day, min, lib) {
    if (min < DAY_MIN) return lib.isOpenAt(place, day, fmtTime(min));
    const next = DAYS[DAYS.indexOf(day) + 1];
    return next ? lib.isOpenAt(place, next, fmtTime(min - DAY_MIN)) : true;
  }

  function problemAt(place, day, arrive, leave, lib) {
    if (!openAt(place, day, arrive, lib)) {
      const status = arrive < DAY_MIN ? lib.openStatus(place, day, fmtTime(arrive)).text : 'Closed';
      return { kind: 'closed', text: `Closed when you arrive at ${fmtTime(arrive)} (${status})` };
    }
    if (!openAt(place, day, leave - 1, lib)) return { kind: 'closes', text: `Closes before you'd leave at ${fmtTime(leave)}` };
    return null;
  }

  function leg(prev, place, lib) {
    if (!prev) return { legKm: 0, legMin: 0, legMode: 'walk' };
    const km = lib.distanceKm(prev, place);
    const walk = lib.walkMinutes(km);
    if (walk <= WALK_LONG_MIN) return { legKm: km, legMin: walk, legMode: 'walk' };
    return { legKm: km, legMin: Math.round((km * ROAD_DETOUR / TRANSIT_KMH) * 60) + TRANSIT_WAIT_MIN, legMode: 'transport' };
  }

  /* from: where the day starts ({lat, lng}); the first leg is from there. lib: TripLib. */
  function planTimeline(dayPlan, day, from, byId, lib) {
    let clock = toMin(dayPlan.start);
    let prev = from;
    const stops = dayPlan.stops.filter((s) => byId.has(s.id)).map((s, index) => {
      const place = byId.get(s.id);
      const l = leg(prev, place, lib);
      const arrive = clock + l.legMin;
      const leave = arrive + s.stay;
      clock = leave;
      prev = place;
      return { place, index: dayPlan.stops.indexOf(s), stay: s.stay, ...l, arrive, leave, problem: problemAt(place, day, arrive, leave, lib) };
    });
    return { stops, end: clock };
  }

  /* ---- share links: base64url JSON { v, s: [ids], p: { day: [start, [[id, stay]]] } } ---- */
  const toBase64Url = (text) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromBase64Url = (code) => atob(code.replace(/-/g, '+').replace(/_/g, '/'));

  function encodeShare({ shortlist, plans }) {
    const p = Object.fromEntries(DAYS.map((d) => [d, [plans[d].start, plans[d].stops.map((s) => [s.id, s.stay])]]));
    return toBase64Url(JSON.stringify({ v: 1, s: [...shortlist], p }));
  }

  const validStay = (n) => Number.isInteger(n) && n >= MIN_STAY && n <= MAX_STAY;

  /* Trust nothing from storage or a link: keep only known places, sane stays and HH:MM starts. */
  function normalisePlans(raw, knownIds) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return Object.fromEntries(DAYS.map((d) => {
      const day = src[d] && typeof src[d] === 'object' ? src[d] : {};
      const stops = (Array.isArray(day.stops) ? day.stops : []).slice(0, MAX_SHARED_IDS)
        .filter((s, i, all) => s && knownIds.has(s.id) && validStay(s.stay) && all.findIndex((o) => o && o.id === s.id) === i)
        .map(({ id, stay }) => ({ id, stay }));
      return [d, { start: HHMM.test(day.start) ? day.start : DEFAULT_START, stops }];
    }));
  }

  function decodeShare(code, knownIds) {
    let raw;
    try { raw = JSON.parse(fromBase64Url(String(code || ''))); } catch (e) { return null; }
    if (!raw || raw.v !== 1 || !Array.isArray(raw.s) || !raw.p || typeof raw.p !== 'object') return null;
    const shortlist = raw.s.slice(0, MAX_SHARED_IDS).filter((id) => knownIds.has(id));
    const asObjects = Object.fromEntries(DAYS.map((d) => {
      const [start, stops] = Array.isArray(raw.p[d]) ? raw.p[d] : [];
      return [d, { start, stops: (Array.isArray(stops) ? stops : []).filter(Array.isArray).map(([id, stay]) => ({ id, stay })) }];
    }));
    return { shortlist, plans: normalisePlans(asObjects, knownIds) };
  }

  /* Add their shortlist and stops to mine; never removes anything of mine. */
  function mergeShared(mine, theirs) {
    const shortlist = [...new Set([...mine.shortlist, ...theirs.shortlist])];
    const plans = Object.fromEntries(DAYS.map((d) => {
      const own = mine.plans[d] || { start: DEFAULT_START, stops: [] };
      const add = theirs.plans[d].stops.filter((s) => !own.stops.some((o) => o.id === s.id));
      const start = own.stops.length === 0 && add.length > 0 ? theirs.plans[d].start : own.start;
      return [d, { start, stops: [...own.stops, ...add] }];
    }));
    return { shortlist, plans };
  }

  const sharedCount = (shared) => DAYS.reduce((n, d) => n + shared.plans[d].stops.length, 0);

  return { DAYS, DEFAULT_STAY_MIN, emptyPlans, normalisePlans, addStop, removeStop, moveStop, setStay, setStart, planTimeline, encodeShare, decodeShare, mergeShared, sharedCount, fmtTime, toMin };
});
