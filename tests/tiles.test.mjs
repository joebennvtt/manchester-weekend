import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { tileXY, tileUrls, boundsAround } = createRequire(import.meta.url)('../tiles.js');

test('tileXY matches the standard slippy-map scheme', () => {
  assert.deepEqual(tileXY(53.4808, -2.2426, 0), { x: 0, y: 0 });
  assert.deepEqual(tileXY(53.4808, -2.2426, 1), { x: 0, y: 0 });
  assert.deepEqual(tileXY(53.4808, -2.2426, 14), { x: 8089, y: 5300 });
});

test('tileUrls covers the bounds at each zoom, without duplicates', () => {
  const bounds = { south: 53.47, west: -2.26, north: 53.49, east: -2.22 };
  const urls = tileUrls('https://t.example/{z}/{x}/{y}.pbf', bounds, [12, 13, 14]);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.includes('https://t.example/14/8089/5300.pbf'));
  assert.ok(urls.every((u) => /\/1[234]\/\d+\/\d+\.pbf$/.test(u)));
  assert.ok(urls.length < 40);
});

test('boundsAround pads the box around the points', () => {
  const b = boundsAround([{ lat: 53.48, lng: -2.24 }, { lat: 53.49, lng: -2.23 }], 1);
  assert.ok(b.south < 53.48 && b.north > 53.49 && b.west < -2.24 && b.east > -2.23);
  assert.ok(Math.abs((b.north - 53.49) * 111 - 1) < 0.05);
});
