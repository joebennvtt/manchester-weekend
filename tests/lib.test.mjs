import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { isOpenAt, filterPlaces, bookAhead, isCentral, distanceKm, formatDistance, sortByDistance, tripNow, openStatus, walkMinutes, formatWalk, DEFAULT_BASE, startPoint, inBounds, splitByView, isIndoor } = createRequire(import.meta.url)('../lib.js');

const closedWeek = { fri: [], sat: [], sun: [], mon: [] };
const mk = (over = {}) => ({
  id: 'x', name: 'X', type: 'cafe', tags: [], meals: [], cuisine: null, userNote: null, blurb: '', neighbourhood: '',
  booking: 'walk-in', lat: 53.48, lng: -2.24, kitchenHours: null, hours: { ...closedWeek }, ...over,
});

describe('isOpenAt', () => {
  test('returns true inside a simple range and false at the close time', () => {
    const p = mk({ hours: { ...closedWeek, fri: [['09:00', '17:00']] } });
    assert.equal(isOpenAt(p, 'fri', '09:00'), true);
    assert.equal(isOpenAt(p, 'fri', '16:59'), true);
    assert.equal(isOpenAt(p, 'fri', '17:00'), false);
    assert.equal(isOpenAt(p, 'fri', '08:59'), false);
  });

  test('stays open after midnight on the next day when the previous day spills over', () => {
    const p = mk({ hours: { ...closedWeek, fri: [['17:00', '02:00']] } });
    assert.equal(isOpenAt(p, 'fri', '23:30'), true);
    assert.equal(isOpenAt(p, 'sat', '01:00'), true);
    assert.equal(isOpenAt(p, 'sat', '02:00'), false);
  });

  test('does not treat friday early hours as open because thursday is unknown', () => {
    const p = mk({ hours: { ...closedWeek, fri: [['17:00', '02:00']] } });
    assert.equal(isOpenAt(p, 'fri', '01:00'), false);
  });

  test('returns false all day when hours are empty', () => {
    assert.equal(isOpenAt(mk(), 'sat', '12:00'), false);
  });

  test('handles split shifts with a gap between ranges', () => {
    const p = mk({ hours: { ...closedWeek, sat: [['10:00', '13:00'], ['14:00', '18:00']] } });
    assert.equal(isOpenAt(p, 'sat', '12:59'), true);
    assert.equal(isOpenAt(p, 'sat', '13:30'), false);
    assert.equal(isOpenAt(p, 'sat', '14:00'), true);
  });

  test('treats 00:00-24:00 as always open including 23:59', () => {
    const p = mk({ hours: { fri: [['00:00', '24:00']], sat: [['00:00', '24:00']], sun: [], mon: [] } });
    assert.equal(isOpenAt(p, 'fri', '00:00'), true);
    assert.equal(isOpenAt(p, 'sat', '23:59'), true);
  });

  test('uses kitchen hours only when kitchen option is set', () => {
    const p = mk({
      hours: { ...closedWeek, sat: [['12:00', '23:00']] },
      kitchenHours: { ...closedWeek, sat: [['12:00', '21:00']] },
    });
    assert.equal(isOpenAt(p, 'sat', '22:00'), true);
    assert.equal(isOpenAt(p, 'sat', '22:00', { kitchen: true }), false);
    assert.equal(isOpenAt(p, 'sat', '20:00', { kitchen: true }), true);
  });

  test('falls back to opening hours when kitchen requested but kitchenHours is null', () => {
    const p = mk({ hours: { ...closedWeek, sat: [['12:00', '23:00']] } });
    assert.equal(isOpenAt(p, 'sat', '22:00', { kitchen: true }), true);
  });

  test('returns false for an unknown day', () => {
    assert.equal(isOpenAt(mk(), 'tue', '12:00'), false);
  });
});

describe('filterPlaces', () => {
  const a = mk({ id: 'a', name: 'Alpha Cafe', type: 'cafe', meals: ['breakfast'], booking: 'walk-in', tags: ['coffee'],
    hours: { ...closedWeek, sat: [['08:00', '12:00']] } });
  const b = mk({ id: 'b', name: 'Beta Pub', type: 'pub', meals: ['dinner', 'drinks'], booking: 'recommended',
    neighbourhood: 'Ancoats', hours: { ...closedWeek, sat: [['12:00', '23:00']] } });
  const c = mk({ id: 'c', name: 'Gamma Theatre', type: 'do', meals: [], booking: 'tickets' });
  const all = [a, b, c];
  const base = { types: new Set(), meals: new Set(), openAt: null, booking: new Set(), query: '', shortlistOnly: false, shortlist: new Set() };
  const ids = (r) => r.map((p) => p.id);

  test('returns everything when no filter is active', () => {
    assert.deepEqual(ids(filterPlaces(all, base)), ['a', 'b', 'c']);
  });

  test('filters by type', () => {
    assert.deepEqual(ids(filterPlaces(all, { ...base, types: new Set(['pub', 'do']) })), ['b', 'c']);
  });

  test('filters by meal', () => {
    assert.deepEqual(ids(filterPlaces(all, { ...base, meals: new Set(['drinks']) })), ['b']);
  });

  test('filters by price and never matches a null price', () => {
    const priced = [mk({ id: 'p1', price: '£' }), mk({ id: 'p2', price: '££' }), mk({ id: 'p3', price: 'free' }), mk({ id: 'p4', price: null })];
    assert.deepEqual(ids(filterPlaces(priced, { ...base, prices: new Set(['£', 'free']) })), ['p1', 'p3']);
    assert.deepEqual(ids(filterPlaces(priced, { ...base, prices: new Set() })), ['p1', 'p2', 'p3', 'p4']);
  });

  test('filters by area (neighbourhood) and combines with other filters', () => {
    assert.deepEqual(ids(filterPlaces(all, { ...base, areas: new Set(['Ancoats']) })), ['b']);
    assert.deepEqual(ids(filterPlaces(all, { ...base, areas: new Set(['Ancoats']), types: new Set(['cafe']) })), []);
  });

  test('filters by open-at time', () => {
    assert.deepEqual(ids(filterPlaces(all, { ...base, openAt: { day: 'sat', time: '09:00' } })), ['a']);
    assert.deepEqual(ids(filterPlaces(all, { ...base, openAt: { day: 'sat', time: '13:00' } })), ['b']);
  });

  test('filters by booking', () => {
    assert.deepEqual(ids(filterPlaces(all, { ...base, booking: new Set(['tickets']) })), ['c']);
  });

  test('filters by query across name, tags and neighbourhood case-insensitively', () => {
    assert.deepEqual(ids(filterPlaces(all, { ...base, query: 'ALPHA' })), ['a']);
    assert.deepEqual(ids(filterPlaces(all, { ...base, query: 'coffee' })), ['a']);
    assert.deepEqual(ids(filterPlaces(all, { ...base, query: 'ancoats' })), ['b']);
  });

  test('filters by shortlist only', () => {
    assert.deepEqual(ids(filterPlaces(all, { ...base, shortlistOnly: true, shortlist: new Set(['c']) })), ['c']);
  });

  test('ignores shortlist when shortlistOnly is false', () => {
    assert.equal(filterPlaces(all, { ...base, shortlist: new Set(['c']) }).length, 3);
  });

  test('combines filters with AND semantics', () => {
    const r = filterPlaces(all, { ...base, types: new Set(['cafe', 'pub']), openAt: { day: 'sat', time: '13:00' }, query: 'beta' });
    assert.deepEqual(ids(r), ['b']);
  });

  test('returns a new array and does not mutate inputs', () => {
    const input = [...all];
    const state = { ...base, types: new Set(['cafe']) };
    const snapshot = JSON.stringify(all);
    const result = filterPlaces(input, state);
    assert.notEqual(result, input);
    assert.equal(JSON.stringify(all), snapshot);
    assert.deepEqual([...state.types], ['cafe']);
    assert.equal(input.length, 3);
  });
});

describe('filterPlaces foodTypes', () => {
  const k = mk({ id: 'k', foodTypes: ['Korean', 'Japanese'] });
  const i = mk({ id: 'i', foodTypes: ['Italian & pizza'] });
  const n = mk({ id: 'n' });
  const all = [k, i, n];
  const ids = (r) => r.map((p) => p.id);
  test('keeps places whose foodTypes intersect, excludes missing', () => {
    assert.deepEqual(ids(filterPlaces(all, { foodTypes: new Set(['Japanese', 'Italian & pizza']) })), ['k', 'i']);
  });
  test('empty set keeps all', () => {
    assert.equal(filterPlaces(all, { foodTypes: new Set() }).length, 3);
  });
  test('search matches food types', () => {
    assert.deepEqual(ids(filterPlaces(all, { query: 'korean' })), ['k']);
  });
});

describe('bookAhead', () => {
  test('lists essential before recommended before tickets, stable within group, excluding others', () => {
    const places = [
      mk({ id: 't1', booking: 'tickets' }), mk({ id: 'w', booking: 'walk-in' }), mk({ id: 'r1', booking: 'recommended' }),
      mk({ id: 'e1', booking: 'essential' }), mk({ id: 'f', booking: 'free-entry' }), mk({ id: 'e2', booking: 'essential' }),
    ];
    assert.deepEqual(bookAhead(places).map((p) => p.id), ['e1', 'e2', 'r1', 't1']);
  });

  test('does not mutate the input array', () => {
    const places = [mk({ id: 'r', booking: 'recommended' }), mk({ id: 'e', booking: 'essential' })];
    bookAhead(places);
    assert.deepEqual(places.map((p) => p.id), ['r', 'e']);
  });
});

describe('isCentral', () => {
  test('is true for city centre and false for Chester', () => {
    assert.equal(isCentral({ lat: 53.4839, lng: -2.2350 }), true);
    assert.equal(isCentral({ lat: 53.19, lng: -2.891 }), false);
  });
});

describe('distance helpers', () => {
  const piccadilly = { lat: 53.4770, lng: -2.2309 };
  const albertSquare = { lat: 53.4794, lng: -2.2453 };

  test('computes Piccadilly to Albert Square as roughly 0.9 km', () => {
    const km = distanceKm(piccadilly, albertSquare);
    assert.ok(km > 0.8 && km < 1.1, `got ${km}`);
  });

  test('returns zero for identical points', () => {
    assert.equal(distanceKm(piccadilly, piccadilly), 0);
  });

  test('formats short distances in metres with walking minutes', () => {
    assert.equal(formatDistance(0.35), '350 m (~4 min walk)');
  });

  test('formats kilometres with walking time under 3 km', () => {
    assert.equal(formatDistance(1.2), '1.2 km (~15 min walk)');
  });

  test('omits walking time at 3 km or more', () => {
    assert.equal(formatDistance(3.4), '3.4 km');
  });

  test('sortByDistance returns a nearest-first copy without mutating the input', () => {
    const far = { id: 'far', lat: 53.19, lng: -2.89 };
    const near = { id: 'near', ...albertSquare };
    const input = [far, near];
    const out = sortByDistance(input, piccadilly);
    assert.deepEqual(out.map((p) => p.id), ['near', 'far']);
    assert.deepEqual(input.map((p) => p.id), ['far', 'near']);
  });
});

describe('hasMoved', () => {
  const { hasMoved } = createRequire(import.meta.url)('../lib.js');
  const here = { lat: 53.4770, lng: -2.2309 };

  test('is false for a jitter of about 5 m', () => {
    assert.equal(hasMoved(here, { lat: here.lat + 0.00004, lng: here.lng }, 15), false);
  });

  test('is true for a move of about 30 m', () => {
    assert.equal(hasMoved(here, { lat: here.lat + 0.00027, lng: here.lng }, 15), true);
  });

  test('is true when there is no previous position', () => {
    assert.equal(hasMoved(null, here, 15), true);
  });
});

describe('filterPlaces minRating', () => {
  const rated = [mk({ id: 'a', googleRating: 4.6 }), mk({ id: 'b', googleRating: 4.0 }), mk({ id: 'c', googleRating: null }), mk({ id: 'd' })];
  const ids = (s) => filterPlaces(rated, s).map((p) => p.id);
  test('keeps places at or above the threshold', () => assert.deepEqual(ids({ minRating: 4.5 }), ['a']));
  test('includes places exactly at the threshold', () => assert.deepEqual(ids({ minRating: 4.0 }), ['a', 'b']));
  test('excludes places with null or missing rating', () => {
    const got = ids({ minRating: 3.5 });
    assert.equal(got.includes('c'), false);
    assert.equal(got.includes('d'), false);
  });
  test('keeps everything when minRating is null', () => assert.equal(ids({ minRating: null }).length, 4));
});

describe('tripNow', () => {
  test('returns the trip day and London time inside the window', () => {
    assert.deepEqual(tripNow(new Date('2026-11-21T12:05:00Z')), { day: 'sat', time: '12:05' });
    assert.deepEqual(tripNow(new Date('2026-11-23T23:30:00Z')), { day: 'mon', time: '23:30' });
  });

  test('returns null before and after the trip', () => {
    assert.equal(tripNow(new Date('2026-11-19T12:00:00Z')), null);
    assert.equal(tripNow(new Date('2026-11-24T00:30:00Z')), null);
  });

  test('uses the Europe/London date at the window edges', () => {
    assert.equal(tripNow(new Date('2026-11-19T23:30:00Z')), null);
    assert.deepEqual(tripNow(new Date('2026-11-20T00:30:00Z')), { day: 'fri', time: '00:30' });
  });

  test('follows BST in summer rather than UTC', () => {
    assert.equal(tripNow(new Date('2026-06-20T12:00:00Z')), null);
  });
});

describe('openStatus', () => {
  const week = (over) => mk({ hours: { ...closedWeek, ...over } });

  test('reports open with the closing time when more than an hour remains', () => {
    const p = week({ sat: [['09:00', '22:00']] });
    assert.deepEqual(openStatus(p, 'sat', '12:00'), { state: 'open', text: 'Open · until 22:00' });
  });

  test('reports closing with minutes left within the last 60 minutes', () => {
    const p = week({ sat: [['09:00', '22:00']] });
    assert.deepEqual(openStatus(p, 'sat', '21:35'), { state: 'closing', text: 'Closes in 25 min' });
    assert.equal(openStatus(p, 'sat', '21:00').state, 'closing');
    assert.equal(openStatus(p, 'sat', '20:59').state, 'open');
  });

  test('reports the next opening later today', () => {
    const p = week({ sat: [['10:00', '13:00'], ['17:00', '23:00']] });
    assert.deepEqual(openStatus(p, 'sat', '14:00'), { state: 'later', text: 'Opens 17:00' });
    assert.deepEqual(openStatus(p, 'sat', '08:00'), { state: 'later', text: 'Opens 10:00' });
  });

  test('reports closed today when nothing opens again', () => {
    const p = week({ sat: [['10:00', '13:00']] });
    assert.deepEqual(openStatus(p, 'sat', '14:00'), { state: 'closed', text: 'Closed today' });
    assert.deepEqual(openStatus(p, 'sun', '12:00'), { state: 'closed', text: 'Closed today' });
  });

  test('counts a range spilling past midnight from the previous day', () => {
    const p = week({ fri: [['17:00', '02:00']] });
    assert.deepEqual(openStatus(p, 'sat', '00:30'), { state: 'open', text: 'Open · until 02:00' });
    assert.deepEqual(openStatus(p, 'sat', '01:30'), { state: 'closing', text: 'Closes in 30 min' });
    assert.equal(openStatus(p, 'sat', '02:00').state, 'closed');
  });

  test('shows the after-midnight close time for a range opened today', () => {
    const p = week({ fri: [['17:00', '02:00']] });
    assert.deepEqual(openStatus(p, 'fri', '20:00'), { state: 'open', text: 'Open · until 02:00' });
    assert.equal(openStatus(p, 'fri', '01:00').state, 'later');
  });

  test('agrees with isOpenAt', () => {
    const p = week({ sat: [['09:00', '17:00']], fri: [['18:00', '03:00']] });
    for (const t of ['00:00', '02:59', '03:00', '09:00', '16:59', '17:00', '23:59']) {
      const open = ['open', 'closing'].includes(openStatus(p, 'sat', t).state);
      assert.equal(open, isOpenAt(p, 'sat', t), t);
    }
  });
});

describe('walkMinutes', () => {
  test('converts km to minutes at 4.8 km/h with a 1.3 detour factor', () => {
    assert.equal(walkMinutes(1), 16);
    assert.equal(walkMinutes(0), 0);
    assert.equal(walkMinutes(3.4), 55);
  });

  test('formatWalk shows minutes up to 40 and km beyond', () => {
    assert.equal(formatWalk(0.8), '13 min walk');
    assert.equal(formatWalk(0.001), '1 min walk');
    assert.equal(formatWalk(3.4), '3.4 km');
  });

  test('startPoint prefers live location, then base, then default', () => {
    const me = { lat: 53.5, lng: -2.2 };
    const base = { lat: 53.47, lng: -2.25, label: 'Home' };
    assert.deepEqual(startPoint(me, base), { lat: 53.5, lng: -2.2, label: 'you', live: true });
    assert.deepEqual(startPoint(null, base), { lat: 53.47, lng: -2.25, label: 'Home', live: false });
    assert.equal(startPoint(null, null).label, 'Piccadilly Gardens');
    assert.equal(startPoint(null, { lat: 'x' }).lat, DEFAULT_BASE.lat);
  });
});

describe('map view', () => {
  const view = { south: 53.47, west: -2.26, north: 53.49, east: -2.22 };
  const centre = { id: 'c', lat: 53.48, lng: -2.24 };
  const zoo = { id: 'z', lat: 53.2266, lng: -2.8838 };
  const edge = { id: 'e', lat: 53.49, lng: -2.22 };

  test('inBounds includes places inside and on the edge, excludes outside', () => {
    assert.equal(inBounds(centre, view), true);
    assert.equal(inBounds(edge, view), true);
    assert.equal(inBounds(zoo, view), false);
  });

  test('inBounds treats missing bounds as everything in view', () => {
    assert.equal(inBounds(zoo, null), true);
  });

  test('splitByView partitions places and keeps their order', () => {
    const { inView, outside } = splitByView([zoo, edge, centre], view);
    assert.deepEqual(inView.map((p) => p.id), ['e', 'c']);
    assert.deepEqual(outside.map((p) => p.id), ['z']);
  });
});

describe('indoors', () => {
  test('isIndoor uses setting when present, else the type', () => {
    assert.equal(isIndoor(mk({ type: 'see', setting: 'outdoor' })), false);
    assert.equal(isIndoor(mk({ type: 'see', setting: 'mixed' })), false);
    assert.equal(isIndoor(mk({ type: 'do', setting: 'indoor' })), true);
    assert.equal(isIndoor(mk({ type: 'pub' })), true);
    assert.equal(isIndoor(mk({ type: 'see' })), false);
  });

  test('filterPlaces with indoorOnly keeps only indoor places', () => {
    const places = [mk({ id: 'a', type: 'pub' }), mk({ id: 'b', type: 'see', setting: 'outdoor' }), mk({ id: 'c', type: 'see', setting: 'indoor' })];
    assert.deepEqual(filterPlaces(places, { indoorOnly: true }).map((p) => p.id), ['a', 'c']);
    assert.equal(filterPlaces(places, { indoorOnly: false }).length, 3);
  });
});
