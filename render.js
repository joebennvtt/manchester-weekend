/* HTML string builders. All data text goes through esc(). Browser: window.TripRender. Node: module.exports. */
(function (root, factory) {
  const render = factory(typeof module === 'object' && module.exports ? require('./icons.js') : root.TripIcons);
  if (typeof module === 'object' && module.exports) module.exports = render;
  else root.TripRender = render;
})(typeof self !== 'undefined' ? self : this, function (Icons) {
  const TYPES = {
    cafe: { label: 'Cafe', icon: 'coffee' }, restaurant: { label: 'Restaurant', icon: 'utensils' }, bar: { label: 'Bar', icon: 'martini' },
    pub: { label: 'Pub', icon: 'beer' }, see: { label: 'See', icon: 'landmark' }, do: { label: 'Do', icon: 'drama' },
    trip: { label: 'Trip', icon: 'car' }, vintage: { label: 'Vintage', icon: 'shirt' }, music: { label: 'Music', icon: 'disc' },
  };
  const FOOD_TYPES = ["Brunch","Bakery & sweets","Sandwiches","British & roasts","American","Italian & pizza","Mexican","Mediterranean & Middle Eastern","Indian & Pakistani","Chinese","Japanese","Korean","Thai & Vietnamese","Pan-Asian","Steak & grill","Seafood","Food halls & buffets"];
  const MEALS = ['breakfast', 'lunch', 'dinner', 'drinks'];
  const BOOKINGS = { 'walk-in': 'Walk-in', recommended: 'Book recommended', essential: 'Book essential', tickets: 'Tickets', 'free-entry': 'Free entry' };
  const DAY_LABELS = { fri: 'Fri 20', sat: 'Sat 21', sun: 'Sun 22', mon: 'Mon 23' };
  const DAYS = ['fri', 'sat', 'sun', 'mon'];
  const BOOK_ORDER = ['essential', 'recommended', 'tickets'];
  const ICON_SM = 16;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const ic = (name, size = ICON_SM) => Icons.svg(name, { size });
  const link = (url, text, cls = 'btn', icon) => {
    const u = safeUrl(url);
    return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${icon ? ic(icon) : ''}${esc(text)}</a>` : '';
  };

  const typeOf = (place) => TYPES[place.type];
  const hasRating = (place) => typeof place.googleRating === 'number';
  const directionsUrl = (place) => `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`;
  const statusHtml = (status) => (status ? `<span class="status s-${esc(status.state)}">${esc(status.text)}</span>` : '');
  const clockLabel = (day, time) => `${DAY_LABELS[day]} Nov, ${time}`;
  const distHtml = (distance) => (distance ? `<span class="dist">${ic('walk')}${esc(distance)}</span>` : '');
  const homeHtml = (home) => (home ? `<span class="home-text">${ic(home.icon)}${esc(home.text)}</span>` : '');
  const sepJoin = (parts) => parts.filter(Boolean).join('<span class="sep" aria-hidden="true">·</span>');
  const calloutHtml = (text) => `<div class="callout">${ic('alert', 20)}<span>${esc(text)}</span></div>`;

  const fmtRanges = (ranges) => {
    if (!ranges || ranges.length === 0) return 'Closed';
    return ranges.map(([o, c]) => (o === '00:00' && c === '24:00' ? 'Open 24h' : `${o}–${c}`)).join(', ');
  };

  function hoursTable(place, selDay, live) {
    const marker = `<span class="badge badge-accent">${live ? 'Today' : 'Selected'}</span>`;
    const rows = DAYS.map((d) => {
      const kitchen = place.kitchenHours ? `<td>${esc(fmtRanges(place.kitchenHours[d]))}</td>` : '';
      return `<tr${d === selDay ? ' class="sel"' : ''}><th scope="row">${DAY_LABELS[d]}${d === selDay ? marker : ''}</th><td>${esc(fmtRanges(place.hours[d]))}</td>${kitchen}</tr>`;
    }).join('');
    const kHead = place.kitchenHours ? '<th>Kitchen</th>' : '';
    return `<table class="hours"><thead><tr><th>Day</th><th>Open</th>${kHead}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function tagsHtml(place) {
    const pill = (t) => `<span class="badge badge-muted">${esc(t)}</span>`;
    const tags = [pill(BOOKINGS[place.booking] || place.booking)];
    if (place.price) tags.push(pill(place.price + (place.priceNote ? ' · ' + place.priceNote : '')));
    (place.meals || []).forEach((m) => tags.push(pill(m)));
    return `<div class="tags">${tags.join('')}</div>`;
  }

  function eventsHtml(events) {
    if (!events || events.length === 0) return '';
    const items = events.map((e) => `<li><span class="ev-text">${esc(e.date)} ${esc(e.time)} · ${esc(e.name)}</span>${link(e.url, 'Tickets', 'tk', 'external')}</li>`).join('');
    return `<h3>Events</h3><ul class="events">${items}</ul>`;
  }

  const travelHtml = (t) => (t ? `<h3>Getting there</h3><p class="small">From ${esc(t.from)}: ${esc(t.car)} by car, ${esc(t.transit)} by public transport.</p>` : '');

  function ratingFact(place) {
    if (!hasRating(place)) return '';
    const reviews = typeof place.googleReviews === 'number' ? ` · ${place.googleReviews.toLocaleString('en-GB')} reviews` : '';
    return `<span class="fact">${ic('star-fill')}<span>${esc(place.googleRating.toFixed(1) + reviews)}</span>${link(place.ratingSource, 'source', 'src')}</span>`;
  }

  function factsHtml(place, ctx) {
    const facts = [];
    if (ctx.status) facts.push(`<span class="fact">${statusHtml(ctx.status)}</span>`);
    if (ctx.distance) {
      const text = `${ctx.distance}${ctx.km ? ' · ' + ctx.km : ''}${ctx.from ? ' from ' + ctx.from : ''}`;
      facts.push(`<span class="fact">${ic('walk')}<span>${esc(text)}</span></span>`);
    }
    facts.push(ratingFact(place));
    const body = facts.filter(Boolean).join('');
    return body ? `<div class="facts">${body}</div>` : '';
  }

  function actionsHtml(place, ctx) {
    const id = esc(place.id);
    const main = link(directionsUrl(place), 'Directions', 'btn btn-primary', 'external') + link(place.bookingUrl, 'Book', 'btn btn-secondary', 'external') + (ctx.planHtml || '');
    const toggles = `<button class="btn btn-ghost btn-sm" data-star="${id}" aria-pressed="${!!ctx.starred}">${ic(ctx.starred ? 'star-fill' : 'star')}Shortlist</button>`
      + `<button class="btn btn-ghost btn-sm" data-visit="${id}" aria-pressed="${!!ctx.visited}">${ic('check')}Visited</button>`
      + `<button class="btn btn-ghost btn-sm" data-base-set="${id}">${ic('map-pin')}Walk times from here</button>`;
    return `<div class="d-actions"><div class="d-actions-main">${main}</div><div class="d-toggles">${toggles}</div></div>`;
  }

  function headHtml(place) {
    const t = typeOf(place);
    const foods = (place.foodTypes || []).length ? `<p class="d-meta">${place.foodTypes.map(esc).join(' · ')}</p>` : '';
    return `<header class="d-head"><span class="type-tile t-${esc(place.type)}">${Icons.svg(t.icon, { size: 24 })}</span>
      <div><h2 class="d-title">${esc(place.name)}</h2><p class="d-meta">${esc(t.label)} · ${esc(place.neighbourhood)} · ${esc(place.address)}</p>${foods}</div></header>`;
  }

  function notesHtml(place) {
    return `<p class="d-blurb">${esc(place.blurb)}</p>`
      + (place.userNote ? `<p class="d-note">Your note: ${esc(place.userNote)}</p>` : '')
      + (place.tip ? `<p class="d-tip"><strong>Tip:</strong> ${esc(place.tip)}</p>` : '')
      + (place.confidence === 'low' ? calloutHtml('Unverified, check before going') : '')
      + (place.tripNote ? calloutHtml(place.tripNote) : '');
  }

  function detailsHtml(place, ctx) {
    const sources = (place.sources || []).map((s, i) => link(s, `source ${i + 1}`, 'src')).join(' ');
    return `<button class="btn btn-ghost back" id="back">${ic('chevron-left', 20)}Back</button>
      ${headHtml(place)}
      ${factsHtml(place, ctx)}
      ${actionsHtml(place, ctx)}
      ${notesHtml(place)}
      ${tagsHtml(place)}
      ${place.bookingNote ? `<p class="small">Booking: ${esc(place.bookingNote)}</p>` : ''}
      <h3>Hours</h3>${hoursTable(place, ctx.day, ctx.live)}
      ${place.hoursNote ? `<p class="small">${esc(place.hoursNote)}</p>` : ''}
      ${eventsHtml(place.events)}${travelHtml(place.travel)}
      ${ctx.extraHtml || ''}
      <div class="d-links">${link(place.website, 'Website', 'btn btn-secondary btn-sm', 'external')}${link(place.menuUrl, 'Menu', 'btn btn-secondary btn-sm', 'external')}</div>
      <p class="small d-sources">Sources: ${sources || 'none'} · checked ${esc(place.checked)}</p>`;
  }

  function cardHtml(place, ctx) {
    const cls = ['card', 't-' + place.type, ctx.dim ? 'dim' : '', ctx.visited ? 'visited' : '', ctx.active ? 'active' : ''].filter(Boolean).join(' ');
    const visited = ctx.visited ? `<span class="visited-badge">${ic('check', 14)}<span class="visually-hidden">Visited</span></span>` : '';
    const status = [statusHtml(ctx.status), distHtml(ctx.distance), homeHtml(ctx.home)].filter(Boolean).join('');
    const rating = hasRating(place) ? `<span class="rating">${ic('star-fill', 14)}${esc(place.googleRating.toFixed(1))}</span>` : '';
    const meta = sepJoin([`<span class="type-label"><span class="t-dot"></span>${esc(typeOf(place).label)}</span>`, place.neighbourhood && esc(place.neighbourhood), place.price && esc(place.price), rating]);
    return `<article class="${cls}" data-id="${esc(place.id)}" tabindex="0" role="button">
      <div class="card-top"><div class="name">${esc(place.name)}</div>${visited}</div>
      <button class="star" data-star="${esc(place.id)}" aria-pressed="${!!ctx.starred}" aria-label="Shortlist ${esc(place.name)}">${Icons.svg(ctx.starred ? 'star-fill' : 'star', { size: 22 })}</button>
      ${status ? `<div class="row-status">${status}</div>` : ''}
      <div class="row-meta">${meta}</div>
      <p class="blurb">${esc(place.blurb)}</p>
    </article>`;
  }

  function previewHtml(place, ctx) {
    const line = [statusHtml(ctx.status), distHtml(ctx.distance), homeHtml(ctx.home)].filter(Boolean).join('');
    return `<button class="preview-close btn btn-ghost btn-icon" data-preview-close="1" aria-label="Close preview">${ic('x', 20)}</button>
      <div class="preview-head"><span class="type-tile t-${esc(place.type)}">${Icons.svg(typeOf(place).icon, { size: 20 })}</span><div class="name">${esc(place.name)}</div></div>
      ${line ? `<div class="preview-line">${line}</div>` : ''}
      <div class="preview-actions"><button class="btn btn-primary btn-sm" data-open="${esc(place.id)}">Details</button>${link(directionsUrl(place), 'Directions', 'btn btn-secondary btn-sm', 'external')}${ctx.planButton || ''}</div>`;
  }

  function bookItemHtml(place) {
    const area = place.neighbourhood ? esc(place.neighbourhood) + (place.bookingNote ? ' · ' : '') : '';
    const main = link(safeUrl(place.bookingUrl) || place.website, safeUrl(place.bookingUrl) ? 'Book' : 'Website', 'btn btn-primary btn-sm', 'external');
    return `<article class="book-item t-${esc(place.type)}">
      <div class="book-head"><span class="t-dot"></span><strong class="name">${esc(place.name)}</strong></div>
      <p class="small">${area}${esc(place.bookingNote || '')}</p>
      ${place.tripNote ? `<p class="small">${esc(place.tripNote)}</p>` : ''}
      <div class="book-actions">${main}<button class="btn btn-secondary btn-sm" data-open="${esc(place.id)}">Details</button></div>
    </article>`;
  }

  const bookGroups = (items) => BOOK_ORDER
    .map((key) => ({ key, label: BOOKINGS[key], items: items.filter((p) => p.booking === key) }))
    .filter((g) => g.items.length > 0);

  const bookGroupHtml = (g) => `<div class="book-group"><h3 class="book-group-title">${esc(g.label)} <span class="badge badge-muted">${g.items.length}</span></h3>${g.items.map(bookItemHtml).join('')}</div>`;

  const bookViewHtml = (items) => `<h2>Book before you go</h2><p class="small">Tables and tickets worth sorting before you arrive.</p>${bookGroups(items).map(bookGroupHtml).join('')}`;

  return { TYPES, FOOD_TYPES, MEALS, BOOKINGS, DAY_LABELS, esc, clockLabel, link, safeUrl, detailsHtml, cardHtml, previewHtml, bookItemHtml, bookGroups, bookViewHtml };
});
