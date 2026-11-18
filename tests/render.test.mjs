import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const load = createRequire(import.meta.url);
const { TYPES, BOOKINGS, bookGroups, bookViewHtml, bookItemHtml, cardHtml, detailsHtml, previewHtml, clockLabel } = load('../render.js');
const { NAMES } = load('../icons.js');

const EVIL = '<img src=x onerror=alert(1)>"&\'';
const EMOJI = /\p{Extended_Pictographic}/u;
const CLOSED_WEEK = { fri: [], sat: [], sun: [], mon: [] };

const mk = (over = {}) => ({
  id: 'test-place', name: 'Test Place', type: 'cafe', neighbourhood: 'Ancoats', address: '1 Test Street, Manchester M4 1AA',
  blurb: 'A test blurb.', tip: null, userNote: null, tags: [], meals: [], events: [],
  hours: { fri: [['09:00', '17:00']], sat: [['10:00', '18:00']], sun: [['10:00', '16:00']], mon: [['09:00', '17:00']] },
  kitchenHours: null, booking: 'walk-in', bookingUrl: null, bookingNote: null, website: 'https://example.com', menuUrl: null,
  price: '££', priceNote: null, googleRating: 4.5, googleReviews: 1200, ratingSource: null, confidence: 'high', tripNote: null,
  hoursNote: null, travel: null, sources: [], checked: '2026-11-18', foodTypes: [], lat: 53.48, lng: -2.24, ...over,
});

const FULL_CTX = {
  status: { state: 'open', text: 'Open now' }, distance: '12 min walk', km: '1.0 km', from: 'Piccadilly',
  home: { icon: 'tram', text: 'leave by 23:10' }, starred: true, visited: true, active: true, dim: false,
  day: 'sat', live: true, planHtml: '', planButton: '', extraHtml: '',
};

const BUILDERS = [
  ['cardHtml', (place, ctx) => cardHtml(place, ctx)],
  ['detailsHtml', (place, ctx) => detailsHtml(place, ctx)],
  ['previewHtml', (place, ctx) => previewHtml(place, ctx)],
  ['bookItemHtml', (place) => bookItemHtml(place)],
];

const classesOf = (html) => html.match(/<article class="([^"]*)"/)[1].split(' ');
const bookGroupPairs = (html) => [...html.matchAll(/<h3 class="book-group-title">([^<]*) <span class="badge badge-muted">(\d+)<\/span><\/h3>/g)].map((m) => [m[1], Number(m[2])]);

describe('render escaping', () => {
  test('all builders escape hostile text and never emit a raw img tag', () => {
    // Arrange
    const place = mk({ name: EVIL, blurb: EVIL, neighbourhood: EVIL, address: EVIL, tip: EVIL, userNote: EVIL, tripNote: EVIL, bookingNote: EVIL });
    for (const [name, build] of BUILDERS) {
      // Act
      const html = build(place, FULL_CTX);
      // Assert
      assert.ok(!html.includes('<img'), name);
      assert.ok(html.includes('&lt;img'), name);
    }
  });

  test('javascript: booking url produces no href and no Book link in all builders', () => {
    // Arrange
    const place = mk({ bookingUrl: 'javascript:alert(1)' });
    for (const [name, build] of BUILDERS) {
      // Act
      const html = build(place, FULL_CTX);
      // Assert
      assert.ok(!html.includes('href="javascript'), name);
      assert.ok(!html.includes('Book</a>'), name);
    }
  });
});

describe('render output shape', () => {
  test('all builders produce emoji-free markup for a normal place', () => {
    // Arrange
    const place = mk({ bookingUrl: 'https://book.example.com/x', foodTypes: ['Brunch'], googleRating: 4.5 });
    for (const [name, build] of BUILDERS) {
      // Act
      const html = build(place, FULL_CTX);
      // Assert
      assert.ok(!EMOJI.test(html), name);
    }
  });

  test('all builders render svg icons with a 24 viewBox', () => {
    // Arrange
    const place = mk({ bookingUrl: 'https://book.example.com/x' });
    for (const [name, build] of BUILDERS) {
      // Act
      const html = build(place, FULL_CTX);
      // Assert
      assert.ok(html.includes('<svg'), name);
      assert.ok(html.includes('viewBox="0 0 24 24"'), name);
    }
  });
});

describe('cardHtml', () => {
  test('renders ids, star button aria state and starred or unstarred icon', () => {
    // Arrange
    const place = mk();
    // Act
    const starred = cardHtml(place, { ...FULL_CTX, starred: true });
    const unstarred = cardHtml(place, { ...FULL_CTX, starred: false });
    const starBtn = (html) => html.match(/<button class="star"[\s\S]*?<\/button>/)[0];
    // Assert
    assert.ok(starred.includes('data-id="test-place"'));
    assert.ok(starred.includes('data-star="test-place"'));
    assert.ok(starBtn(starred).includes('aria-pressed="true"'));
    assert.ok(starBtn(starred).includes('fill="currentColor"'));
    assert.ok(starBtn(unstarred).includes('aria-pressed="false"'));
    assert.ok(starBtn(unstarred).includes('fill="none"'));
    assert.ok(!starBtn(unstarred).includes('fill="currentColor"'));
  });

  test('renders home text only when home is given', () => {
    // Arrange
    const place = mk();
    // Act
    const withHome = cardHtml(place, { ...FULL_CTX, home: { icon: 'tram', text: 'leave by 23:10' } });
    const noHome = cardHtml(place, { ...FULL_CTX, home: null });
    const undefinedHome = cardHtml(place, { ...FULL_CTX, home: undefined });
    // Assert
    assert.ok(withHome.includes('home-text'));
    assert.ok(withHome.includes('leave by 23:10'));
    assert.ok(!noHome.includes('home-text'));
    assert.ok(!undefinedHome.includes('home-text'));
  });

  test('adds visited badge and visited class only when visited', () => {
    // Arrange
    const place = mk();
    // Act
    const visited = cardHtml(place, { ...FULL_CTX, visited: true });
    const notVisited = cardHtml(place, { ...FULL_CTX, visited: false });
    // Assert
    assert.ok(visited.includes('visited-badge'));
    assert.ok(classesOf(visited).includes('visited'));
    assert.ok(!notVisited.includes('visited-badge'));
    assert.ok(!classesOf(notVisited).includes('visited'));
  });

  test('adds dim and active classes only when the context asks for them', () => {
    // Arrange
    const place = mk();
    // Act
    const dimActive = classesOf(cardHtml(place, { ...FULL_CTX, dim: true, active: true }));
    const plain = classesOf(cardHtml(place, { ...FULL_CTX, dim: false, active: false }));
    // Assert
    assert.ok(dimActive.includes('dim'));
    assert.ok(dimActive.includes('active'));
    assert.ok(!plain.includes('dim'));
    assert.ok(!plain.includes('active'));
  });

  test('pub type gets the t-pub class and the Pub label', () => {
    // Arrange
    const place = mk({ type: 'pub' });
    // Act
    const html = cardHtml(place, {});
    // Assert
    assert.ok(classesOf(html).includes('t-pub'));
    assert.ok(html.includes('Pub</span>'));
  });

  test('omits the rating when the place has no numeric googleRating', () => {
    // Arrange
    const place = mk({ googleRating: null });
    // Act
    const html = cardHtml(place, {});
    // Assert
    assert.ok(!html.includes('class="rating"'));
  });
});

describe('detailsHtml', () => {
  test('places the actions block before the hours table', () => {
    // Arrange
    const place = mk({ bookingUrl: 'https://book.example.com/x' });
    // Act
    const html = detailsHtml(place, FULL_CTX);
    // Assert
    assert.ok(html.indexOf('d-actions') < html.indexOf('class="hours"'));
  });

  test('contains the back button and a safe Directions link', () => {
    // Arrange
    const place = mk();
    // Act
    const html = detailsHtml(place, FULL_CTX);
    // Assert
    assert.ok(html.includes('id="back"'));
    assert.match(html, /<a class="btn btn-primary" href="https:\/\/www\.google\.com\/maps\/dir\/[^"]*" target="_blank" rel="noopener noreferrer">/);
  });

  test('renders the Book link only when bookingUrl is an https url', () => {
    // Arrange
    const withUrl = mk({ bookingUrl: 'https://book.example.com/x' });
    const withoutUrl = mk({ bookingUrl: null });
    // Act
    const yes = detailsHtml(withUrl, FULL_CTX);
    const no = detailsHtml(withoutUrl, FULL_CTX);
    // Assert
    assert.ok(yes.includes('href="https://book.example.com/x"'));
    assert.ok(yes.includes('Book</a>'));
    assert.ok(!no.includes('Book</a>'));
  });

  test('inserts planHtml and extraHtml verbatim', () => {
    // Arrange
    const planHtml = '<button data-plan-test="1">Plan it</button>';
    const extraHtml = '<section class="extra-x">Extra block</section>';
    // Act
    const html = detailsHtml(mk(), { ...FULL_CTX, planHtml, extraHtml });
    // Assert
    assert.ok(html.includes(planHtml));
    assert.ok(html.includes(extraHtml));
  });

  test('renders star, visit and walk-time toggles with aria-pressed on the first two', () => {
    // Arrange
    const place = mk();
    // Act
    const html = detailsHtml(place, { ...FULL_CTX, starred: false, visited: true });
    // Assert
    assert.ok(html.includes('data-star="test-place" aria-pressed="false"'));
    assert.ok(html.includes('data-visit="test-place" aria-pressed="true"'));
    assert.ok(html.includes('data-base-set="test-place"'));
  });

  test('marks only the selected day row and no row when day is null', () => {
    // Arrange
    const place = mk();
    // Act
    const sat = detailsHtml(place, { ...FULL_CTX, day: 'sat' });
    const none = detailsHtml(place, { ...FULL_CTX, day: null });
    // Assert
    assert.equal(sat.split('<tr class="sel">').length - 1, 1);
    assert.match(sat, /<tr class="sel"><th scope="row">Sat 21/);
    assert.ok(!none.includes('<tr class="sel">'));
  });

  test('shows Today marker when live and Selected marker when not live', () => {
    // Arrange
    const place = mk();
    // Act
    const live = detailsHtml(place, { ...FULL_CTX, live: true });
    const notLive = detailsHtml(place, { ...FULL_CTX, live: false });
    // Assert
    assert.ok(live.includes('badge badge-accent">Today</span>'));
    assert.ok(!live.includes('badge badge-accent">Selected</span>'));
    assert.ok(notLive.includes('badge badge-accent">Selected</span>'));
    assert.ok(!notLive.includes('badge badge-accent">Today</span>'));
  });

  test('shows an Unverified callout for low confidence and none for high', () => {
    // Arrange
    const low = mk({ confidence: 'low' });
    const high = mk({ confidence: 'high' });
    // Act
    const lowHtml = detailsHtml(low, FULL_CTX);
    const highHtml = detailsHtml(high, FULL_CTX);
    // Assert
    assert.match(lowHtml, /<div class="callout">[\s\S]*?Unverified, check before going<\/span>/);
    assert.ok(!highHtml.includes('Unverified'));
  });

  test('renders Closed, Open 24h and multi-range hours', () => {
    // Arrange
    const place = mk({ hours: { fri: [], sat: [['00:00', '24:00']], sun: [['09:00', '12:00'], ['13:00', '17:00']], mon: [] } });
    // Act
    const html = detailsHtml(place, FULL_CTX);
    // Assert
    assert.ok(html.includes('<td>Closed</td>'));
    assert.ok(html.includes('<td>Open 24h</td>'));
    assert.ok(html.includes('<td>09:00–12:00, 13:00–17:00</td>'));
  });

  test('adds a Kitchen column only when kitchenHours is set', () => {
    // Arrange
    const withKitchen = mk({ kitchenHours: { ...CLOSED_WEEK, sat: [['12:00', '21:00']] } });
    const withoutKitchen = mk({ kitchenHours: null });
    // Act
    const yes = detailsHtml(withKitchen, FULL_CTX);
    const no = detailsHtml(withoutKitchen, FULL_CTX);
    // Assert
    assert.ok(yes.includes('<th>Kitchen</th>'));
    assert.ok(!no.includes('<th>Kitchen</th>'));
  });

  test('renders the EVIL tripNote as an escaped callout', () => {
    // Arrange
    const place = mk({ tripNote: EVIL });
    // Act
    const html = detailsHtml(place, FULL_CTX);
    // Assert
    assert.ok(html.includes('<div class="callout">'));
    assert.ok(html.includes('&lt;img'));
    assert.ok(!html.includes('<img'));
  });
});

describe('previewHtml', () => {
  test('contains the close button, open button and verbatim plan button', () => {
    // Arrange
    const place = mk({ id: 'pv-1' });
    const planButton = '<button data-plan-test="2">Add</button>';
    // Act
    const html = previewHtml(place, { ...FULL_CTX, planButton });
    // Assert
    assert.ok(html.includes('data-preview-close="1"'));
    assert.ok(html.includes('data-open="pv-1"'));
    assert.ok(html.includes(planButton));
  });
});

describe('bookGroups and bookViewHtml', () => {
  const A = mk({ id: 'a', name: 'Ticket Place', booking: 'tickets' });
  const B = mk({ id: 'b', name: 'Essential Bee', booking: 'essential' });
  const C = mk({ id: 'c', name: 'Recommended Cee', booking: 'recommended' });
  const D = mk({ id: 'd', name: 'Essential Dee', booking: 'essential' });
  const E = mk({ id: 'e', name: 'Walk In Eee', booking: 'walk-in' });
  const ITEMS = [A, B, C, D, E];

  test('groups essential, recommended, tickets in fixed order keeping item order and dropping walk-in', () => {
    // Arrange / Act
    const groups = bookGroups(ITEMS);
    // Assert
    assert.deepEqual(groups.map((g) => g.key), ['essential', 'recommended', 'tickets']);
    assert.deepEqual(groups.map((g) => g.items.map((p) => p.id)), [['b', 'd'], ['c'], ['a']]);
    assert.deepEqual(groups.map((g) => g.label), ['Book essential', 'Book recommended', 'Tickets']);
  });

  test('returns no groups for empty input', () => {
    // Arrange / Act / Assert
    assert.deepEqual(bookGroups([]), []);
  });

  test('bookViewHtml shows headings with counts in group order and one item per grouped place', () => {
    // Arrange / Act
    const html = bookViewHtml(ITEMS);
    // Assert
    assert.deepEqual(bookGroupPairs(html), [['Book essential', 2], ['Book recommended', 1], ['Tickets', 1]]);
    assert.ok(html.indexOf('Book essential') < html.indexOf('Book recommended'));
    assert.ok(html.indexOf('Book recommended') < html.indexOf('Tickets'));
    assert.equal(html.match(/class="book-item /g).length, 4);
    assert.ok(!html.includes('Walk In Eee'));
  });

  test('bookViewHtml places each item inside its own group section', () => {
    // Arrange / Act
    const sections = bookViewHtml(ITEMS).split('<div class="book-group">').slice(1);
    const namesIn = (section) => [...section.matchAll(/<strong class="name">([^<]*)<\/strong>/g)].map((m) => m[1]);
    // Assert
    assert.deepEqual(sections.map(namesIn), [['Essential Bee', 'Essential Dee'], ['Recommended Cee'], ['Ticket Place']]);
  });

  test('bookViewHtml with no items renders the heading and no throw', () => {
    // Arrange / Act
    const html = bookViewHtml([]);
    // Assert
    assert.ok(html.includes('<h2>Book before you go</h2>'));
    assert.ok(!html.includes('book-group'));
  });
});

describe('TYPES', () => {
  const TYPE_KEYS = ['cafe', 'restaurant', 'bar', 'pub', 'see', 'do', 'trip', 'vintage', 'music'];

  test('every type has a label and an icon name that icons.js knows', () => {
    // Arrange / Act / Assert
    assert.deepEqual(Object.keys(TYPES).sort(), [...TYPE_KEYS].sort());
    for (const key of TYPE_KEYS) {
      assert.equal(typeof TYPES[key].label, 'string', key);
      assert.ok(TYPES[key].label.length > 0, key);
      assert.ok([...NAMES].includes(TYPES[key].icon), key);
    }
  });
});

describe('small helpers', () => {
  test('clockLabel formats day key and time', () => {
    // Arrange / Act / Assert
    assert.equal(clockLabel('sat', '12:00'), 'Sat 21 Nov, 12:00');
  });

  test('BOOKINGS labels cover every booking value used by places', () => {
    // Arrange / Act / Assert
    assert.equal(BOOKINGS.essential, 'Book essential');
    assert.equal(BOOKINGS.recommended, 'Book recommended');
    assert.equal(BOOKINGS.tickets, 'Tickets');
    assert.equal(BOOKINGS['walk-in'], 'Walk-in');
  });
});
