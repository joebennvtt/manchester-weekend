// Validates Place JSON files. Usage: node scripts/validate.mjs [file.json ...]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const defaultFiles = () =>
  readdirSync(dataDir).filter((f) => f.endsWith('.json') && f !== 'sample.json').sort().map((f) => join(dataDir, f));

const ENUMS = {
  type: ['cafe', 'restaurant', 'bar', 'pub', 'see', 'do', 'trip', 'vintage', 'music'],
  booking: ['walk-in', 'recommended', 'essential', 'tickets', 'free-entry'],
  price: ['free', '£', '££', '£££', '££££'],
  addedBy: ['user', 'claude'],
  confidence: ['high', 'medium', 'low'],
};
const FOOD_TYPES = ["Brunch","Bakery & sweets","Sandwiches","British & roasts","American","Italian & pizza","Mexican","Mediterranean & Middle Eastern","Indian & Pakistani","Chinese","Japanese","Korean","Thai & Vietnamese","Pan-Asian","Steak & grill","Seafood","Food halls & buffets"];
const MEALS = ['breakfast', 'lunch', 'dinner', 'drinks'];
const DAYS = ['fri', 'sat', 'sun', 'mon'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrOrNull = (v) => v === null || isStr(v);
const isHttps = (v) => { try { return new URL(v).protocol === 'https:'; } catch { return false; } };
const isHttpsOrNull = (v) => v === null || isHttps(v);

function checkSchedule(sched, label, errs) {
  if (!sched || typeof sched !== 'object') return errs.push(`${label} must be an object`);
  for (const d of DAYS) {
    if (!Array.isArray(sched[d])) { errs.push(`${label}.${d} must be an array`); continue; }
    sched[d].forEach((r, i) => {
      const ok = Array.isArray(r) && r.length === 2 && r.every((t) => typeof t === 'string' && HHMM.test(t));
      if (!ok) errs.push(`${label}.${d}[${i}] must be ["HH:MM","HH:MM"], got ${JSON.stringify(r)}`);
    });
  }
}

function validatePlace(p, warnings) {
  const errs = [];
  const need = (key, ok, msg) => { if (!(key in p)) errs.push(`missing key "${key}"`); else if (!ok) errs.push(`${key}: ${msg}`); };
  need('id', isStr(p.id) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id), 'must be kebab-case string');
  need('name', isStr(p.name), 'must be non-empty string');
  need('type', ENUMS.type.includes(p.type), `must be one of ${ENUMS.type.join('|')}`);
  need('tags', Array.isArray(p.tags) && p.tags.every(isStr), 'must be array of strings');
  need('meals', Array.isArray(p.meals) && p.meals.every((m) => MEALS.includes(m)), `must be subset of ${MEALS.join('|')}`);
  for (const k of ['cuisine', 'userNote', 'tip', 'hoursNote', 'tripNote', 'bookingNote', 'priceNote']) {
    need(k, isStrOrNull(p[k]), 'must be string or null');
  }
  need('blurb', isStr(p.blurb), 'must be non-empty string');
  need('address', isStr(p.address), 'must be non-empty string');
  need('neighbourhood', isStr(p.neighbourhood), 'must be non-empty string');
  need('lat', typeof p.lat === 'number' && p.lat >= 53.0 && p.lat <= 53.7, 'must be number in 53.0-53.7');
  need('lng', typeof p.lng === 'number' && p.lng >= -3.0 && p.lng <= -2.0, 'must be number in -3.0 to -2.0');
  for (const k of ['website', 'menuUrl', 'bookingUrl']) need(k, isHttpsOrNull(p[k]), 'must be https URL or null');
  for (const k of ['booking', 'addedBy', 'confidence']) need(k, ENUMS[k].includes(p[k]), `must be one of ${ENUMS[k].join('|')}`);
  need('price', p.price === null || ENUMS.price.includes(p.price), `must be null or one of ${ENUMS.price.join('|')}`);
  const optional = (key, ok, msg) => { if (p[key] != null && !ok) errs.push(`${key}: ${msg}`); };
  optional('foodTypes', Array.isArray(p.foodTypes) && p.foodTypes.every((f) => FOOD_TYPES.includes(f)), 'must be array of known food types');
  optional('googleRating', typeof p.googleRating === 'number' && p.googleRating >= 1 && p.googleRating <= 5, 'must be number 1.0-5.0 or null');
  optional('googleReviews', Number.isInteger(p.googleReviews) && p.googleReviews >= 0, 'must be non-negative integer or null');
  optional('ratingSource', isHttps(p.ratingSource), 'must be https URL or null');
  if (typeof p.googleRating === 'number' && p.ratingSource == null) errs.push('ratingSource: required when googleRating is set');
  if ('hours' in p) checkSchedule(p.hours, 'hours', errs); else errs.push('missing key "hours"');
  if (!('kitchenHours' in p)) errs.push('missing key "kitchenHours"');
  else if (p.kitchenHours !== null) checkSchedule(p.kitchenHours, 'kitchenHours', errs);
  need('events', Array.isArray(p.events), 'must be array');
  (p.events || []).forEach((e, i) => {
    const ok = e && isStr(e.name) && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && HHMM.test(e.time) && isHttpsOrNull(e.url ?? null);
    if (!ok) errs.push(`events[${i}] needs name, date YYYY-MM-DD, time HH:MM, https url`);
  });
  const t = p.travel;
  need('travel', t === null || (t && typeof t === 'object' && ['car', 'transit', 'from'].every((k) => isStr(t[k]))),
    'must be null or {car, transit, from} strings');
  need('sources', Array.isArray(p.sources) && p.sources.length > 0 && p.sources.every(isHttps), 'must be non-empty array of https URLs');
  need('checked', typeof p.checked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.checked), 'must be YYYY-MM-DD');
  if (p.confidence === 'low') warnings.push('confidence is low');
  if (p.website === null) warnings.push('website is null');
  return errs;
}

export function validateFiles(files) {
  let errorCount = 0;
  let warnCount = 0;
  let total = 0;
  const seen = new Map();
  for (const file of files) {
    let arr;
    try { arr = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
      console.error(`ERROR ${file}: ${e.message}`); errorCount++; continue;
    }
    if (!Array.isArray(arr)) { console.error(`ERROR ${file}: top level must be an array`); errorCount++; continue; }
    arr.forEach((p, i) => {
      total++;
      const label = `${file} #${i} (${p && p.id ? p.id : '?'})`;
      if (!p || typeof p !== 'object') { console.error(`ERROR ${label}: not an object`); errorCount++; return; }
      const warnings = [];
      const errs = validatePlace(p, warnings);
      if (p.id && seen.has(p.id)) errs.push(`duplicate id, also in ${seen.get(p.id)}`);
      else if (p.id) seen.set(p.id, file);
      errs.forEach((m) => console.error(`ERROR ${label}: ${m}`));
      warnings.forEach((m) => console.warn(`WARN  ${label}: ${m}`));
      errorCount += errs.length;
      warnCount += warnings.length;
    });
  }

  return { total, errorCount, warnCount };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const files = args.length ? args : defaultFiles();
  const { total, errorCount, warnCount } = validateFiles(files);
  console.log(`${total} places in ${files.length} file(s): ${errorCount} error(s), ${warnCount} warning(s)`);
  process.exit(errorCount > 0 ? 1 : 0);
}
