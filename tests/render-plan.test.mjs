import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { planHtml, stopHtml, legHtml, homeHtml, homeShort, addToPlanHtml, planButtonHtml, shareBannerHtml } = require('../render-plan.js');
const { homeOptions, toMin } = require('../home.js');
const HOME = require('../data/getting-home.js');

const EMOJI = /\p{Extended_Pictographic}/u;
const place = (over = {}) => ({ id: 'p1', name: 'Cafe One', type: 'cafe', ...over });
const stop = (over = {}) => ({ place: place(), arrive: 600, leave: 660, stay: 60, index: 0, legMin: 0, legMode: 'walk', legKm: 0, problem: null, ...over });
const emptyPlans = () => ({ fri: { start: '10:00', stops: [] }, sat: { start: '10:00', stops: [{ id: 'p1', stay: 60 }] }, sun: { start: '10:00', stops: [] }, mon: { start: '10:00', stops: [] } });
const dis = (html, attr) => new RegExp(`${attr}[^>]*disabled`).test(html);
const noEmoji = (html) => assert.doesNotMatch(html, EMOJI);

describe('stopHtml', () => {
  test('escapes the place name and problem text', () => {
    const html = stopHtml(stop({ place: place({ name: '<img src=x onerror=1>' }), problem: { text: '"<b>&' } }), 1, 1);
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<b>&/);
    assert.match(html, /&lt;img src=x onerror=1&gt;/);
    assert.match(html, /&lt;b&gt;&amp;/);
  });

  test('has no emoji and keeps the data hooks', () => {
    const html = stopHtml(stop({ problem: { text: 'Closed' } }), 2, 3);
    noEmoji(html);
    for (const hook of ['data-open="p1"', 'data-stay="0"', 'data-move="0"', 'data-delta="-1"', 'data-delta="1"', 'data-remove="0"', 'callout stop-warn']) assert.ok(html.includes(hook), hook);
  });

  test('disables move up for the first stop and move down for the last', () => {
    const first = stopHtml(stop(), 1, 3);
    assert.ok(dis(first, 'data-delta="-1"'));
    assert.ok(!dis(first, 'data-delta="1"'));
    const last = stopHtml(stop(), 3, 3);
    assert.ok(dis(last, 'data-delta="1"'));
    assert.ok(!dis(last, 'data-delta="-1"'));
    const only = stopHtml(stop(), 1, 1);
    assert.ok(dis(only, 'data-delta="-1"') && dis(only, 'data-delta="1"'));
  });

  test('keeps the aria-labels', () => {
    const html = stopHtml(stop(), 2, 3);
    for (const l of ['Time at Cafe One', 'Move Cafe One earlier', 'Move Cafe One later', 'Remove Cafe One']) assert.ok(html.includes(`aria-label="${l}"`), l);
  });
});

describe('legHtml', () => {
  test('is empty when there is no leg', () => assert.equal(legHtml(stop()), ''));
  test('walk leg', () => {
    const html = legHtml(stop({ legMin: 7, legMode: 'walk', legKm: 0.5 }));
    assert.match(html, /7 min walk/);
    noEmoji(html);
  });
  test('transport leg shows minutes and km', () => {
    const html = legHtml(stop({ legMin: 25, legMode: 'transport', legKm: 3.14 }));
    assert.match(html, /~25 min by tram, train or taxi · 3\.1 km/);
    noEmoji(html);
  });
});

describe('homeHtml', () => {
  const day = 'fri';
  const render = (o) => homeHtml(o, HOME, 10, 'Fri 20');
  test('frequent tram', () => {
    const html = render(homeOptions(HOME, day, toMin('18:00'), 10));
    assert.match(html, /Trams to Bury every 12–15 min/);
    assert.match(html, /home-card/);
    noEmoji(html);
  });
  test('frequent tram: the departure time sits on the last-tram row, not the frequency row', () => {
    const o = homeOptions(HOME, day, toMin('18:00'), 10);
    const html = render(o);
    assert.ok(o.frequent && o.lastTram, 'fixture expects frequent trams with a last tram at 18:00');
    assert.match(html, /<span class="home-detail">Trams to Bury every 12–15 min<\/span>/);
    assert.doesNotMatch(html, /home-time[^<]*<\/span><span class="home-detail">Trams to Bury/);
    assert.match(html, /home-time tnum">\d{2}:\d{2}<\/span><span class="home-detail">last tram \(leave by/);
  });
  test('best option is a tram', () => {
    const o = homeOptions(HOME, 'fri', toMin('23:50'), 10);
    const html = render(o);
    assert.equal(o.best.mode, 'tram');
    assert.match(html, /mode-tram/);
    assert.doesNotMatch(html, /callout-danger/);
    noEmoji(html);
  });
  test('best option is a bus', () => {
    const o = homeOptions(HOME, 'sun', toMin('23:45'), 5);
    const html = render(o);
    assert.equal(o.best.mode, 'bus');
    assert.match(html, /mode-bus/);
    noEmoji(html);
  });
  test('no service shows the taxi callout', () => {
    const html = render({ frequent: false, best: null, lastTram: null, lastBus: null, next: {} });
    assert.match(html, /callout-danger/);
    assert.match(html, /Book a taxi/);
    assert.match(html, /home-source/);
    noEmoji(html);
  });
  test('escapes the day label', () => {
    assert.doesNotMatch(homeHtml({ frequent: false, best: null }, HOME, 5, '<i>'), /<i>/);
  });
});

describe('homeShort', () => {
  const t = { dep: toMin('23:13'), leaveBy: toMin('23:03') };
  test('frequent with last tram', () => assert.deepEqual(homeShort({ frequent: true, lastTram: t, next: {} }), { icon: 'tram', text: 'last tram 23:13' }));
  test('frequent without last tram', () => assert.equal(homeShort({ frequent: true, lastTram: null, next: {} }), null));
  test('leave by', () => assert.deepEqual(homeShort({ frequent: false, lastTram: t, next: { tram: t } }), { icon: 'tram', text: 'leave by 23:03' }));
  test('bus fallback', () => assert.deepEqual(homeShort({ frequent: false, lastTram: null, next: { bus: { dep: toMin('24:00') } } }), { icon: 'bus', text: 'last tram gone · bus 00:00' }));
  test('nothing', () => assert.deepEqual(homeShort({ frequent: false, lastTram: null, next: {} }), { icon: 'taxi', text: 'no tram or bus home' }));
});

describe('planHtml', () => {
  const base = { day: 'sat', plans: emptyPlans(), homeBlock: '<section class="home-card"></section>', extras: [], startLabel: 'Victoria' };
  test('with stops: timeline, home block, hooks, no emoji', () => {
    const html = planHtml({ ...base, timeline: { stops: [stop(), stop({ index: 1, place: place({ id: 'p2', name: 'B' }) })] } });
    for (const hook of ['id="plan-start"', 'data-plan-day="fri"', 'data-plan-day="sat"', 'aria-pressed="true"', 'class="timeline"', 'home-card', 'data-plan-map', 'data-share="1"', 'seg-count']) assert.ok(html.includes(hook), hook);
    assert.ok(!dis(html, 'data-plan-map'));
    noEmoji(html);
  });
  test('without stops: empty state, no timeline, map button disabled', () => {
    const html = planHtml({ ...base, timeline: { stops: [] } });
    assert.match(html, /plan-empty/);
    assert.match(html, /No stops yet/);
    assert.doesNotMatch(html, /class="timeline"/);
    assert.ok(dis(html, 'data-plan-map'));
    noEmoji(html);
  });
  test('extras render add chips with escaped names', () => {
    const html = planHtml({ ...base, timeline: { stops: [] }, extras: [place({ id: 'e1', name: '<b>x' })] });
    assert.match(html, /data-plan-add="e1"/);
    assert.doesNotMatch(html, /<b>x/);
    noEmoji(html);
  });
});

describe('addToPlanHtml and planButtonHtml', () => {
  test('add-to-plan chips reflect membership', () => {
    const html = addToPlanHtml('p1', emptyPlans());
    assert.match(html, /data-plan-toggle="sat" data-id="p1" aria-pressed="true"/);
    assert.match(html, /data-plan-toggle="fri" data-id="p1" aria-pressed="false"/);
    assert.match(html, /Add to plan/);
    noEmoji(html);
  });
  test('plan button labels by state', () => {
    const on = planButtonHtml('p1', 'sat', emptyPlans());
    const off = planButtonHtml('p1', 'fri', emptyPlans());
    assert.match(on, /In Sat plan/);
    assert.match(off, /Add to Fri plan/);
    assert.match(on, /data-plan-toggle="sat" data-id="p1" aria-pressed="true"/);
    noEmoji(on + off);
  });
});

describe('shareBannerHtml', () => {
  test('offers accept and dismiss', () => {
    const html = shareBannerHtml({ shortlist: ['a', 'b'] }, 1);
    assert.match(html, /2 shortlisted places and 1 planned stop/);
    assert.match(html, /data-share-accept="1" >/);
    assert.match(html, /data-share-dismiss/);
    noEmoji(html);
  });
  test('disables accept when nothing is recognised', () => {
    const html = shareBannerHtml({ shortlist: [] }, 0);
    assert.ok(dis(html, 'data-share-accept'));
    assert.match(html, /nothing we recognise/);
  });
});
