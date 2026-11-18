/* HTML for the Plan tab, getting home and share banner. All data text goes through esc(). Browser: window.TripRenderPlan. Node: module.exports. */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports
    ? { render: require('./render.js'), plan: require('./plan.js'), icons: require('./icons.js') }
    : { render: root.TripRender, plan: root.TripPlan, icons: root.TripIcons };
  const lib = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.TripRenderPlan = lib;
})(typeof self !== 'undefined' ? self : this, function ({ render, plan, icons }) {
  const { TYPES, DAY_LABELS, esc } = render;
  const { fmtTime, DAYS } = plan;
  const { svg } = icons;
  const STAY_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];
  const ICON_SM = 16;
  const ICON_MD = 20;

  const stayLabel = (m) => (m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', '½ h'));
  const shortDay = (d) => DAY_LABELS[d].split(' ')[0];

  function dayChipsHtml(planDay, plans) {
    return DAYS.map((d) => {
      const n = plans[d].stops.length;
      return `<button class="seg" data-plan-day="${d}" aria-pressed="${d === planDay}">${esc(DAY_LABELS[d])}${n ? ` <span class="seg-count tnum">${n}</span>` : ''}</button>`;
    }).join('');
  }

  function legHtml(stop) {
    if (stop.legMin === 0) return '';
    const walk = stop.legMode === 'walk';
    const text = walk ? `${stop.legMin} min walk` : `~${stop.legMin} min by tram, train or taxi · ${stop.legKm.toFixed(1)} km`;
    return `<li class="leg">${svg(walk ? 'walk' : 'tram', { size: ICON_SM })}<span class="leg-text">${esc(text)}</span></li>`;
  }

  function stopHtml(stop, n, count) {
    const p = stop.place;
    const stays = [...new Set([...STAY_OPTIONS, stop.stay])].sort((a, b) => a - b)
      .map((m) => `<option value="${m}"${m === stop.stay ? ' selected' : ''}>${esc(stayLabel(m))}</option>`).join('');
    const iconBtn = (attrs, label, icon, off) => `<button class="btn btn-secondary btn-icon" ${attrs} aria-label="${label}" ${off ? 'disabled' : ''}>${svg(icon, { size: ICON_MD })}</button>`;
    return `${legHtml(stop)}<li class="stop t-${esc(p.type)}">
      <div class="stop-time"><span class="stop-arrive tnum">${esc(fmtTime(stop.arrive))}</span><span class="stop-leave tnum">–${esc(fmtTime(stop.leave))}</span></div>
      <span class="stop-node tnum" aria-hidden="true">${n}</span>
      <div class="stop-body">
        <button class="stop-name display" data-open="${esc(p.id)}">${svg(TYPES[p.type].icon, { size: ICON_SM })}<span>${esc(p.name)}</span></button>
        ${stop.problem ? `<div class="callout stop-warn">${svg('alert', { size: ICON_SM })}<span>${esc(stop.problem.text)}</span></div>` : ''}
        <div class="stop-controls">
          <select data-stay="${stop.index}" aria-label="Time at ${esc(p.name)}">${stays}</select>
          ${iconBtn(`data-move="${stop.index}" data-delta="-1"`, `Move ${esc(p.name)} earlier`, 'arrow-up', n === 1)}
          ${iconBtn(`data-move="${stop.index}" data-delta="1"`, `Move ${esc(p.name)} later`, 'arrow-down', n === count)}
          ${iconBtn(`data-remove="${stop.index}"`, `Remove ${esc(p.name)}`, 'x', false)}
        </div>
      </div>
    </li>`;
  }

  /* opts: TripHome.homeOptions result. home: GETTING_HOME. walkMin: walk from the place to the hub. Rows: { mode, time?, text }. */
  function homeRows(opts, home, walkMin) {
    const rows = [{ mode: 'walk', text: `${walkMin} min walk to ${home.hub.label}` }];
    const leaveBy = (o) => `(leave by ${fmtTime(o.leaveBy)})`;
    if (opts.frequent) {
      rows.push({ mode: 'tram', text: 'Trams to Bury every 12–15 min' });
      if (opts.lastTram) rows.push({ mode: 'tram', time: fmtTime(opts.lastTram.dep), text: `last tram ${leaveBy(opts.lastTram)}` });
    } else if (opts.best) {
      const b = opts.best;
      const via = home[b.mode];
      rows.push({ mode: b.mode, time: fmtTime(b.dep), text: `${via.label} → ${via.stop} ${fmtTime(b.arr)}, home ~${fmtTime(b.homeAt)}` });
      if (b.mode === 'tram' && opts.lastTram) rows.push({ mode: 'tram', time: fmtTime(opts.lastTram.dep), text: `last tram ${leaveBy(opts.lastTram)}` });
    }
    if (opts.lastBus && !opts.frequent) rows.push({ mode: 'bus', time: fmtTime(opts.lastBus.dep), text: `${home.bus.label} from ${home.hub.label}: last bus ${leaveBy(opts.lastBus)}` });
    return rows;
  }

  function homeRowHtml(r) {
    return `<li class="home-row"><span class="home-mode mode-${r.mode}">${svg(r.mode, { size: ICON_MD })}</span>
      ${r.time ? `<span class="home-time tnum">${esc(r.time)}</span>` : ''}<span class="home-detail">${esc(r.text)}</span></li>`;
  }

  function homeHtml(opts, home, walkMin, dayLabel) {
    const none = !opts.frequent && !opts.best;
    const rows = homeRows(opts, home, walkMin).map(homeRowHtml).join('');
    return `<section class="home-card">
      <h3 class="home-title">Getting home · ${esc(dayLabel)}</h3>
      ${none ? `<div class="callout callout-danger">${svg('taxi', { size: ICON_MD })}<span>No tram or bus home after this. Book a taxi.</span></div>` : ''}
      <ul class="home-rows">${rows}</ul>
      <p class="home-source">Times from TfGM's timetable, checked ${esc(home.checked)}. Check live times in the Bee Network app on the night.</p>
    </section>`;
  }

  /* One short line for cards: how long you can stay for the last tram, then what's left. */
  function homeShort(opts) {
    if (opts.frequent) return opts.lastTram ? { icon: 'tram', text: `last tram ${fmtTime(opts.lastTram.dep)}` } : null;
    if (opts.next.tram && opts.lastTram) return { icon: 'tram', text: `leave by ${fmtTime(opts.lastTram.leaveBy)}` };
    if (opts.next.bus) return { icon: 'bus', text: `last tram gone · bus ${fmtTime(opts.next.bus.dep)}` };
    return { icon: 'taxi', text: 'no tram or bus home' };
  }

  function planHtml(ctx) {
    const { day, plans, timeline, homeBlock, extras, startLabel } = ctx;
    const count = timeline.stops.length;
    const stops = timeline.stops.map((s, i) => stopHtml(s, i + 1, count)).join('');
    const extrasHtml = extras.length === 0 ? '' : `<section class="plan-extras"><h3>From your shortlist</h3><div class="plan-extras-chips">${
      extras.map((p) => `<button class="chip" data-plan-add="${esc(p.id)}">${svg('plus', { size: ICON_SM })}${esc(p.name)}</button>`).join('')}</div></section>`;
    const empty = `<div class="plan-empty"><span class="plan-empty-icon">${svg('map', { size: 24 })}</span>
      <p class="plan-empty-title display">No stops yet</p>
      <p class="plan-empty-hint">Open a place and tap Add to plan, or add from your shortlist below.</p></div>`;
    return `<div class="plan-days" role="group" aria-label="Day">${dayChipsHtml(day, plans)}</div>
      <label class="plan-start">${svg('home', { size: ICON_MD })}<span>Start at ${esc(startLabel)} at</span><input type="time" id="plan-start" value="${esc(plans[day].start)}"></label>
      ${count === 0 ? empty : `<ol class="timeline">${stops}</ol>${homeBlock}`}
      ${extrasHtml}
      <div class="links">
        <button class="btn btn-secondary" data-plan-map="1" ${count === 0 ? 'disabled' : ''}>${svg('map', { size: ICON_MD })}Show day on map</button>
        <button class="btn btn-secondary" data-share="1">${svg('share', { size: ICON_MD })}Share plan &amp; shortlist</button>
      </div>`;
  }

  function addToPlanHtml(placeId, plans) {
    const chips = DAYS.map((d) => {
      const on = plans[d].stops.some((s) => s.id === placeId);
      return `<button class="chip" data-plan-toggle="${d}" data-id="${esc(placeId)}" aria-pressed="${on}">${svg(on ? 'check' : 'plus', { size: ICON_SM })}${esc(DAY_LABELS[d])}</button>`;
    }).join('');
    return `<div class="add-plan"><span class="add-plan-label">Add to plan</span><div class="add-plan-chips">${chips}</div></div>`;
  }

  /* Map pop-up: one button for the day shown in the Plan tab. */
  function planButtonHtml(placeId, day, plans) {
    const on = plans[day].stops.some((s) => s.id === placeId);
    return `<button class="btn btn-secondary pbtn" data-plan-toggle="${day}" data-id="${esc(placeId)}" aria-pressed="${on}">${svg(on ? 'check' : 'plus', { size: ICON_SM })}${on ? 'In' : 'Add to'} ${esc(shortDay(day))} plan</button>`;
  }

  function shareBannerHtml(shared, stopCount) {
    const parts = [];
    if (shared.shortlist.length) parts.push(`${shared.shortlist.length} shortlisted place${shared.shortlist.length === 1 ? '' : 's'}`);
    if (stopCount) parts.push(`${stopCount} planned stop${stopCount === 1 ? '' : 's'}`);
    return `<div class="share-card"><p class="share-text">${svg('share', { size: ICON_MD })}<span><strong>Shared with you:</strong> ${esc(parts.join(' and ') || 'nothing we recognise')}.</span></p>
      <div class="share-actions"><button class="btn btn-primary" data-share-accept="1" ${parts.length ? '' : 'disabled'}>Add to mine</button>
      <button class="btn btn-secondary" data-share-dismiss="1">Dismiss</button></div></div>`;
  }

  return { planHtml, stopHtml, legHtml, homeHtml, homeShort, addToPlanHtml, planButtonHtml, shareBannerHtml };
});
