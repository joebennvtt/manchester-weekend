import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { nightOf, homeOptions, fmtTime, toMin } = require('../home.js');
const HOME = require('../data/getting-home.js');

describe('nightOf', () => {
  test('small hours belong to the previous night', () => {
    assert.deepEqual(nightOf('sat', '01:30'), { day: 'fri', min: 25 * 60 + 30 });
  });
  test('daytime stays on the same day', () => {
    assert.deepEqual(nightOf('sat', '12:00'), { day: 'sat', min: 720 });
  });
  test('small hours on the first day have no previous night', () => {
    assert.deepEqual(nightOf('fri', '01:30'), { day: 'fri', min: 90 });
  });
});

describe('fmtTime and toMin', () => {
  test('round-trip service-day times past midnight', () => {
    assert.equal(toMin('24:43'), 1483);
    assert.equal(fmtTime(1483), '00:43');
    assert.equal(fmtTime(toMin('21:05')), '21:05');
  });
});

describe('homeOptions', () => {
  test('picks whichever gets you home first, after walking to Victoria', () => {
    const o = homeOptions(HOME, 'fri', toMin('23:50'), 10);
    assert.equal(o.best.mode, 'tram');
    assert.equal(fmtTime(o.best.dep), '00:13');
    assert.equal(fmtTime(o.best.homeAt), '00:42');
  });

  test('falls back to the bus once the last tram has gone', () => {
    const o = homeOptions(HOME, 'sun', toMin('23:45'), 5);
    assert.equal(o.best.mode, 'bus');
    assert.equal(fmtTime(o.best.dep), '00:00');
  });

  test('returns no option when everything has gone', () => {
    assert.equal(homeOptions(HOME, 'sun', toMin('24:30'), 5).best, null);
  });

  test('gives leave-by times for the last tram and last bus', () => {
    const o = homeOptions(HOME, 'fri', toMin('22:00'), 10);
    assert.equal(fmtTime(o.lastTram.dep), '00:43');
    assert.equal(fmtTime(o.lastTram.leaveBy), '00:30');
    assert.equal(fmtTime(o.lastBus.dep), '04:19');
  });

  test('marks early evening as frequent service', () => {
    const o = homeOptions(HOME, 'sat', toMin('15:00'), 10);
    assert.equal(o.frequent, true);
    assert.equal(o.best, null);
  });

  test('handles a day with no data', () => {
    const o = homeOptions(HOME, 'tue', toMin('23:00'), 10);
    assert.equal(o.best, null);
    assert.equal(o.lastTram, null);
  });

  test('reports the next tram and bus separately', () => {
    const o = homeOptions(HOME, 'sun', toMin('23:00'), 11);
    assert.equal(fmtTime(o.next.tram.dep), '23:28');
    assert.equal(fmtTime(o.next.bus.dep), '23:20');
    assert.equal(homeOptions(HOME, 'sun', toMin('23:40'), 11).next.tram, null);
  });
});
