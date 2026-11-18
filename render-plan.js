/* HTML for the Plan tab, getting home and share banner. All data text goes through esc(). window.TripRenderPlan. */
(function () {
  const { TYPES, DAY_LABELS, esc } = window.TripRender;
  const { fmtTime, DAYS } = window.TripPlan;
  const STAY_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];
  const MODE_ICON = { tram: '🚋', bus: '🚌' };

  const stayLabel = (m) => (m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', '½ h'));

  function dayChipsHtml(planDay, plans) {
    return DAYS.map((d) => {
      const n = plans[d].stops.length;
      return `<button class="chip" data-plan-day="${d}" aria-pressed="${d === planDay}">${esc(DAY_LABELS[d])}${n ? ` · ${n}` : ''}</button>`;
    }).join('');
  }

  function legHtml(stop) {
    if (stop.legMin === 0) return '';
    const text = stop.legMode === 'walk' ? `🚶 ${stop.legMin} min walk` : `🚋 ~${stop.legMin} min by tram, train or taxi · ${stop.legKm.toFixed(1)} km`;
    return `<li class="leg">${esc(text)}</li>`;
  }

  function stopHtml(stop, n, count) {
    const p = stop.place;
    const stays = [...new Set([...STAY_OPTIONS, stop.stay])].sort((a, b) => a - b)
      .map((m) => `<option value="${m}"${m === stop.stay ? ' selected' : ''}>${esc(stayLabel(m))}</option>`).join('');
    return `${legHtml(stop)}<li class="stop t-${esc(p.type)}">
      <div class="stop-time">${esc(fmtTime(stop.arrive))}–${esc(fmtTime(stop.leave))}</div>
      <button class="stop-name" data-open="${esc(p.id)}">${n}. ${TYPES[p.type].icon} ${esc(p.name)}</button>
      ${stop.problem ? `<div class="stop-warn">⚠ ${esc(stop.problem.text)}</div>` : ''}
      <div class="stop-controls">
        <select data-stay="${stop.index}" aria-label="Time at ${esc(p.name)}">${stays}</select>
        <button class="tbtn icon-sm" data-move="${stop.index}" data-delta="-1" aria-label="Move ${esc(p.name)} earlier" ${n === 1 ? 'disabled' : ''}>↑</button>
        <button class="tbtn icon-sm" data-move="${stop.index}" data-delta="1" aria-label="Move ${esc(p.name)} later" ${n === count ? 'disabled' : ''}>↓</button>
        <button class="tbtn icon-sm" data-remove="${stop.index}" aria-label="Remove ${esc(p.name)}">×</button>
      </div>
    </li>`;
  }

  /* opts: TripHome.homeOptions result. home: GETTING_HOME. walkMin: walk from the place to the hub. */
  function homeLines(opts, home, walkMin) {
    const lines = [`🚶 ${walkMin} min walk to ${home.hub.label}`];
    const last = (o, label) => (o ? `last ${label} ${fmtTime(o.dep)} (leave by ${fmtTime(o.leaveBy)})` : null);
    if (opts.frequent) {
      lines.push(`Trams to Bury every 12–15 min; ${last(opts.lastTram, 'tram')}`);
    } else if (opts.best) {
      const b = opts.best;
      const via = home[b.mode];
      lines.push(`${MODE_ICON[b.mode]} ${fmtTime(b.dep)} ${via.label} → ${via.stop} ${fmtTime(b.arr)}, home ~${fmtTime(b.homeAt)}`);
      if (b.mode === 'tram' && opts.lastTram) lines.push(last(opts.lastTram, 'tram'));
    }
    if (opts.lastBus && !opts.frequent) lines.push(`🚌 ${home.bus.label} from ${home.hub.label}: ${last(opts.lastBus, 'bus')}`);
    return lines.filter(Boolean);
  }

  function homeHtml(opts, home, walkMin, dayLabel) {
    const none = !opts.frequent && !opts.best;
    const lines = homeLines(opts, home, walkMin).map((l) => `<li>${esc(l)}</li>`).join('');
    return `<h3>Getting home · ${esc(dayLabel)}</h3>
      ${none ? '<div class="warn">No tram or bus home after this. Book a taxi.</div>' : ''}
      <ul class="home-lines">${lines}</ul>
      <p class="small">Times from TfGM's timetable, checked ${esc(home.checked)}. Check live times in the Bee Network app on the night.</p>`;
  }

  /* One short line for cards: how long you can stay for the last tram, then what's left. */
  function homeShort(opts) {
    if (opts.frequent) return opts.lastTram ? `🚋 last tram ${fmtTime(opts.lastTram.dep)}` : '';
    if (opts.next.tram && opts.lastTram) return `🚋 leave by ${fmtTime(opts.lastTram.leaveBy)}`;
    if (opts.next.bus) return `🚌 last tram gone · bus ${fmtTime(opts.next.bus.dep)}`;
    return '🚕 no tram or bus home';
  }

  function planHtml(ctx) {
    const { day, plans, timeline, homeBlock, extras, startLabel } = ctx;
    const count = timeline.stops.length;
    const stops = timeline.stops.map((s, i) => stopHtml(s, i + 1, count)).join('');
    const extrasHtml = extras.length === 0 ? '' : `<h3>From your shortlist</h3><div class="chips">${
      extras.map((p) => `<button class="chip" data-plan-add="${esc(p.id)}">＋ ${esc(p.name)}</button>`).join('')}</div>`;
    return `<div class="plan-days chips" role="group" aria-label="Day">${dayChipsHtml(day, plans)}</div>
      <label class="plan-start small">Start at ${esc(startLabel)} at <input type="time" id="plan-start" value="${esc(plans[day].start)}"></label>
      ${count === 0 ? '<p class="empty">No stops yet. Open a place and tap "Add to plan", or add from your shortlist below.</p>' :
        `<ol class="timeline">${stops}</ol>${homeBlock}`}
      ${extrasHtml}
      <div class="links">
        <button class="tbtn" data-plan-map="1" ${count === 0 ? 'disabled' : ''}>Show day on map</button>
        <button class="tbtn" data-share="1">Share plan &amp; shortlist</button>
      </div>`;
  }

  function addToPlanHtml(placeId, plans) {
    const chips = DAYS.map((d) => {
      const on = plans[d].stops.some((s) => s.id === placeId);
      return `<button class="chip" data-plan-toggle="${d}" data-id="${esc(placeId)}" aria-pressed="${on}">${on ? '✓' : '＋'} ${esc(DAY_LABELS[d])}</button>`;
    }).join('');
    return `<div class="add-plan"><span class="group-label">Add to plan</span><div class="chips">${chips}</div></div>`;
  }

  /* Map pop-up: one button for the day shown in the Plan tab. */
  function planButtonHtml(placeId, day, plans) {
    const on = plans[day].stops.some((s) => s.id === placeId);
    return `<button class="pbtn secondary" data-plan-toggle="${day}" data-id="${esc(placeId)}" aria-pressed="${on}">${on ? '✓ In' : '＋ Add to'} ${esc(DAY_LABELS[day].split(' ')[0])} plan</button>`;
  }

  function shareBannerHtml(shared, stopCount) {
    const parts = [];
    if (shared.shortlist.length) parts.push(`${shared.shortlist.length} shortlisted place${shared.shortlist.length === 1 ? '' : 's'}`);
    if (stopCount) parts.push(`${stopCount} planned stop${stopCount === 1 ? '' : 's'}`);
    return `<p><strong>Shared with you:</strong> ${esc(parts.join(' and ') || 'nothing we recognise')}.</p>
      <div class="row"><button class="pbtn" data-share-accept="1" ${parts.length ? '' : 'disabled'}>Add to mine</button>
      <button class="pbtn secondary" data-share-dismiss="1">Dismiss</button></div>`;
  }

  window.TripRenderPlan = { planHtml, homeHtml, homeShort, addToPlanHtml, planButtonHtml, shareBannerHtml };
})();
