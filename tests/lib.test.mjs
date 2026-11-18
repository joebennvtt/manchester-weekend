import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { isOpenAt, filterPlaces, bookAhead, isCentral, distanceKm, formatDistance, sortByDistance } = createRequire(import.meta.url)('../lib.js');

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
