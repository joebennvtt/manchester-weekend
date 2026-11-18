import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lib = require('../lib.js');
const { emptyPlans, addStop, removeStop, moveStop, setStay, setStart, planTimeline, encodeShare, decodeShare, mergeShared } = require('../plan.js');

const week = (ranges) => ({ fri: ranges, sat: ranges, sun: ranges, mon: ranges });
const place = (id, over = {}) => ({ id, type: 'see', lat: 53.4808, lng: -2.2426, hours: week([['09:00', '17:00']]), ...over });
const A = place('a');
const B = place('b', { lat: 53.4844, lng: -2.2426, type: 'cafe' }); // ~400 m north
const FAR = place('far', { lat: 53.2266, lng: -2.8838, type: 'trip' });
const byId = new Map([A, B, FAR].map((p) => [p.id, p]));
const from = { lat: 53.4808, lng: -2.2426 };

describe('plan edits are immutable', () => {
  test('addStop appends with a default stay by type and ignores duplicates', () => {
    const p0 = emptyPlans();
    const p1 = addStop(p0, 'sat', B);
    assert.deepEqual(p0.sat.stops, []);
    assert.deepEqual(p1.sat.stops, [{ id: 'b', stay: 45 }]);
    assert.equal(addStop(p1, 'sat', B), p1);
  });

  test('moveStop, setStay, removeStop and setStart', () => {
    let p = addStop(addStop(emptyPlans(), 'sat', A), 'sat', B);
    p = moveStop(p, 'sat', 1, -1);
    assert.deepEqual(p.sat.stops.map((s) => s.id), ['b', 'a']);
    assert.equal(moveStop(p, 'sat', 0, -1), p);
    p = setStay(p, 'sat', 0, 90);
    assert.equal(p.sat.stops[0].stay, 90);
    p = removeStop(p, 'sat', 0);
    assert.deepEqual(p.sat.stops.map((s) => s.id), ['a']);
    assert.equal(setStart(p, 'sat', '11:30').sat.start, '11:30');
  });
});

describe('planTimeline', () => {
  test('chains walk legs and stays from the start time', () => {
    const p = addStop(addStop(setStart(emptyPlans(), 'sat', '10:00'), 'sat', A), 'sat', B);
    const t = planTimeline(p.sat, 'sat', from, byId, lib);
    assert.equal(t.stops[0].legMin, 0);
    assert.equal(t.stops[0].arrive, 600);
    assert.equal(t.stops[0].leave, 600 + 90);
    assert.equal(t.stops[1].legMode, 'walk');
    assert.equal(t.stops[1].arrive, 690 + t.stops[1].legMin);
    assert.equal(t.end, t.stops[1].leave);
  });

  test('flags a stop that is closed when you arrive', () => {
    const p = addStop(setStart(emptyPlans(), 'sat', '08:00'), 'sat', A);
    const t = planTimeline(p.sat, 'sat', from, byId, lib);
    assert.equal(t.stops[0].problem.kind, 'closed');
    assert.match(t.stops[0].problem.text, /Opens 09:00/);
  });

  test('flags a stop that closes before you leave', () => {
    const p = addStop(setStart(emptyPlans(), 'sat', '16:30'), 'sat', A);
    const t = planTimeline(p.sat, 'sat', from, byId, lib);
    assert.equal(t.stops[0].problem.kind, 'closes');
  });

  test('uses transport for legs too long to walk', () => {
    const p = addStop(addStop(emptyPlans(), 'sat', A), 'sat', FAR);
    const t = planTimeline(p.sat, 'sat', from, byId, lib);
    assert.equal(t.stops[1].legMode, 'transport');
  });

  test('skips stops whose place no longer exists', () => {
    const p = addStop(emptyPlans(), 'sat', place('gone'));
    assert.deepEqual(planTimeline(p.sat, 'sat', from, byId, lib).stops, []);
  });
});

describe('share links', () => {
  const known = new Set(['a', 'b', 'far']);

  test('round-trips shortlist and plans', () => {
    const plans = addStop(setStart(emptyPlans(), 'fri', '18:00'), 'fri', B);
    const code = encodeShare({ shortlist: ['a', 'b'], plans });
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    const back = decodeShare(code, known);
    assert.deepEqual(back.shortlist, ['a', 'b']);
    assert.deepEqual(back.plans.fri, { start: '18:00', stops: [{ id: 'b', stay: 45 }] });
    assert.deepEqual(back.plans.sat, { start: '10:00', stops: [] });
  });

  test('drops unknown ids and rejects garbage', () => {
    const code = encodeShare({ shortlist: ['a', 'nope'], plans: addStop(emptyPlans(), 'sat', place('nope')) });
    const back = decodeShare(code, known);
    assert.deepEqual(back.shortlist, ['a']);
    assert.deepEqual(back.plans.sat.stops, []);
    assert.equal(decodeShare('!!!', known), null);
    assert.equal(decodeShare('', known), null);
  });

  test('mergeShared adds their places without removing mine', () => {
    const mine = { shortlist: ['a'], plans: addStop(emptyPlans(), 'sat', A) };
    const theirs = { shortlist: ['b'], plans: addStop(addStop(emptyPlans(), 'sat', B), 'fri', A) };
    const merged = mergeShared(mine, theirs);
    assert.deepEqual(merged.shortlist, ['a', 'b']);
    assert.deepEqual(merged.plans.sat.stops.map((s) => s.id), ['a', 'b']);
    assert.deepEqual(merged.plans.fri.stops.map((s) => s.id), ['a']);
  });
});

describe('normalisePlans', () => {
  const { normalisePlans } = require('../plan.js');
  test('keeps valid stops, drops unknown ids and bad stays, fills missing days', () => {
    const raw = { sat: { start: '09:30', stops: [{ id: 'a', stay: 60 }, { id: 'zz', stay: 60 }, { id: 'b', stay: 0 }] }, fri: 'junk' };
    const p = normalisePlans(raw, new Set(['a', 'b']));
    assert.deepEqual(p.sat, { start: '09:30', stops: [{ id: 'a', stay: 60 }] });
    assert.deepEqual(p.fri, { start: '10:00', stops: [] });
    assert.deepEqual(Object.keys(p), ['fri', 'sat', 'sun', 'mon']);
  });
  test('returns empty plans for anything that is not an object', () => {
    assert.deepEqual(normalisePlans(null, new Set()), emptyPlans());
  });
});

test('normalisePlans removes a repeated stop within a day', () => {
  const { normalisePlans } = require('../plan.js');
  const p = normalisePlans({ sat: { start: '10:00', stops: [{ id: 'a', stay: 60 }, { id: 'a', stay: 30 }] } }, new Set(['a']));
  assert.deepEqual(p.sat.stops, [{ id: 'a', stay: 60 }]);
});
