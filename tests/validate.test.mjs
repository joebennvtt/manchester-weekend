import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateFiles, defaultFiles } from '../scripts/validate.mjs';

const base = JSON.parse(readFileSync(defaultFiles()[0], 'utf8'))[0];
const run = (over) => {
  const f = join(mkdtempSync(join(tmpdir(), 'val-')), 'p.json');
  writeFileSync(f, JSON.stringify([{ ...base, ...over }]));
  const log = console.error; console.error = () => {};
  try { return validateFiles([f]).errorCount; } finally { console.error = log; }
};

test('accepts valid rating fields and missing ones', () => {
  assert.equal(run({ googleRating: 4.6, googleReviews: 1234, ratingSource: 'https://g.co/x' }), 0);
  assert.equal(run({ googleRating: null, googleReviews: null, ratingSource: null }), 0);
});
test('rejects out-of-range googleRating', () => {
  assert.ok(run({ googleRating: 5.5 }) > 0);
  assert.ok(run({ googleRating: 0.5 }) > 0);
  assert.ok(run({ googleRating: '4.5' }) > 0);
});
test('rejects googleRating without ratingSource', () => {
  assert.ok(run({ googleRating: 4.5, ratingSource: undefined }) > 0);
  assert.ok(run({ googleRating: 4.5, ratingSource: null }) > 0);
});
test('rejects bad googleReviews and ratingSource', () => {
  assert.ok(run({ googleReviews: -1 }) > 0);
  assert.ok(run({ googleReviews: 1.5 }) > 0);
  assert.ok(run({ ratingSource: 'http://x.com' }) > 0);
});
