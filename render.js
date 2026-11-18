/* HTML string builders. All data text goes through esc(). Exposes window.TripRender. */
(function () {
  const TYPES = {
    cafe: { label: 'Cafe', icon: '☕' }, restaurant: { label: 'Restaurant', icon: '🍽' }, bar: { label: 'Bar', icon: '🍸' },
    pub: { label: 'Pub', icon: '🍺' }, see: { label: 'See', icon: '🏛' }, do: { label: 'Do', icon: '🎭' },
    trip: { label: 'Trip', icon: '🚗' }, vintage: { label: 'Vintage', icon: '👗' }, music: { label: 'Music', icon: '💿' },
  };
  const MEALS = ['breakfast', 'lunch', 'dinner', 'drinks'];
  const BOOKINGS = { 'walk-in': 'Walk-in', recommended: 'Book recommended', essential: 'Book essential', tickets: 'Tickets', 'free-entry': 'Free entry' };
  const DAY_LABELS = { fri: 'Fri 20', sat: 'Sat 21', sun: 'Sun 22', mon: 'Mon 23' };

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const link = (url, text, cls = 'btn') => {
    const u = safeUrl(url);
    return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : '';
  };

  const fmtRanges = (ranges) => {
    if (!ranges || ranges.length === 0) return 'Closed';
    return ranges.map(([o, c]) => (o === '00:00' && c === '24:00' ? 'Open 24h' : `${o}–${c}`)).join(', ');
  };

  function hoursTable(place, selDay) {
    const rows = ['fri', 'sat', 'sun', 'mon'].map((d) => {
      const kitchen = place.kitchenHours ? `<td>${esc(fmtRanges(place.kitchenHours[d]))}</td>` : '';
      return `<tr class="${d === selDay ? 'sel' : ''}"><th scope="row">${DAY_LABELS[d]}</th><td>${esc(fmtRanges(place.hours[d]))}</td>${kitchen}</tr>`;
    }).join('');
    const kHead = place.kitchenHours ? '<th>Kitchen</th>' : '';
    return `<table class="hours"><thead><tr><th>Day</th><th>Open</th>${kHead}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function badges(place, openState) {
    const out = [`<span class="badge">${esc(BOOKINGS[place.booking] || place.booking)}</span>`];
    if (place.price) out.push(`<span class="badge">${esc(place.price)}${place.priceNote ? ' · ' + esc(place.priceNote) : ''}</span>`);
    place.meals.forEach((m) => out.push(`<span class="badge">${esc(m)}</span>`));
    if (openState === true) out.push('<span class="badge ok">Open now at chosen time</span>');
    if (openState === false) out.push('<span class="badge bad">Closed</span>');
    return `<div class="badges">${out.join('')}</div>`;
  }

  const eventsHtml = (events) => (events.length === 0 ? '' :
    `<h3>Events</h3><ul>${events.map((e) => `<li>${esc(e.date)} ${esc(e.time)} · ${esc(e.name)} ${link(e.url, 'Tickets', 'tk')}</li>`).join('')}</ul>`);

  const travelHtml = (t) => (t ? `<h3>Getting there</h3><p>From ${esc(t.from)}: ${esc(t.car)} by car, ${esc(t.transit)} by public transport.</p>` : '');

  function ratingHtml(place) {
    if (typeof place.googleRating !== 'number') return '';
    const reviews = typeof place.googleReviews === 'number' ? ` · ${place.googleReviews.toLocaleString('en-GB')} reviews` : '';
    const src = link(place.ratingSource, '(source)', 'src');
    return `<p class="small">${esc(`★ ${place.googleRating.toFixed(1)} Google rating${reviews}`)}${src ? ` ${src}` : ''}</p>`;
  }

  function detailsHtml(place, ctx) {
    const dir = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
    const src = (place.sources || []).map((s, i) => link(s, `source ${i + 1}`, 'src')).join(' ');
    return `<button class="back" id="back">← Back</button>
      <div class="meta small">${esc(TYPES[place.type].label)} · ${esc(place.neighbourhood)} · ${esc(place.address)}</div>
      <h2>${TYPES[place.type].icon} ${esc(place.name)}</h2>
      ${ctx.distance ? `<div class="dist">📍 ${esc(ctx.distance)} from you</div>` : ''}
      ${place.confidence === 'low' ? '<div class="warn">⚠ unverified, check before going</div>' : ''}
      <p>${esc(place.blurb)}</p>
      ${place.userNote ? `<p class="note">Your note: ${esc(place.userNote)}</p>` : ''}
      ${place.tip ? `<p>Tip: ${esc(place.tip)}</p>` : ''}
      ${ratingHtml(place)}
      ${badges(place, ctx.openState)}
      ${place.tripNote ? `<div class="warn">${esc(place.tripNote)}</div>` : ''}
      ${place.bookingNote ? `<p class="small">Booking: ${esc(place.bookingNote)}</p>` : ''}
      <h3>Hours</h3>${hoursTable(place, ctx.day)}
      ${place.hoursNote ? `<p class="small">${esc(place.hoursNote)}</p>` : ''}
      ${eventsHtml(place.events)}${travelHtml(place.travel)}
      <div class="links">${link(place.bookingUrl, 'Book')}${link(dir, 'Directions', place.bookingUrl ? 'btn secondary' : 'btn')}${link(place.website, 'Website', 'btn secondary')}${link(place.menuUrl, 'Menu', 'btn secondary')}</div>
      <p class="small">Sources: ${src || 'none'} · checked ${esc(place.checked)}</p>
      <button class="chip" data-star="${esc(place.id)}" aria-pressed="${ctx.starred}">★ Shortlist</button>
      <button class="chip" data-visit="${esc(place.id)}" aria-pressed="${ctx.visited}">✓ Visited</button>`;
  }

  function cardHtml(place, ctx) {
    const cls = ['card', 't-' + place.type, ctx.dim ? 'dim' : '', ctx.visited ? 'visited' : '', ctx.active ? 'active' : ''].join(' ');
    return `<article class="${cls}" data-id="${esc(place.id)}" tabindex="0" role="button">
      <div class="name">${TYPES[place.type].icon} ${esc(place.name)}</div>
      <div class="meta">${esc(TYPES[place.type].label)} · ${esc(place.neighbourhood)}${place.price ? ' · ' + esc(place.price) : ''}${typeof place.googleRating === 'number' ? ' · ★ ' + esc(place.googleRating.toFixed(1)) : ''}${ctx.distance ? ' · <span class="dist">' + esc(ctx.distance) + '</span>' : ''}</div>
      <p class="blurb">${esc(place.blurb)}</p>
      <button class="star" data-star="${esc(place.id)}" aria-pressed="${ctx.starred}" aria-label="Shortlist ${esc(place.name)}">${ctx.starred ? '★' : '☆'}</button>
    </article>`;
  }

  function bookItemHtml(place) {
    return `<div class="book-item t-${esc(place.type)}"><strong>${esc(place.name)}</strong>
      <span class="badge">${esc(BOOKINGS[place.booking])}</span>
      <div class="small">${esc(place.neighbourhood)}${place.bookingNote ? ' · ' + esc(place.bookingNote) : ''}</div>
      ${place.tripNote ? `<div class="small">${esc(place.tripNote)}</div>` : ''}
      <div class="links">${link(place.bookingUrl || place.website, place.bookingUrl ? 'Book' : 'Website')}
      <button class="chip" data-open="${esc(place.id)}">Details</button></div></div>`;
  }

  window.TripRender = { TYPES, MEALS, BOOKINGS, esc, detailsHtml, cardHtml, bookItemHtml };
})();
