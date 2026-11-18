/* Getting home late: next and last tram/bus from the hub. No DOM. Browser: window.TripHome. Node: module.exports.
   Times are minutes from the start of the night's day; past midnight goes above 1440 (00:43 = 1483). */
(function (root, factory) {
  const home = factory();
  if (typeof module === 'object' && module.exports) module.exports = home;
  else root.TripHome = home;
})(typeof self !== 'undefined' ? self : this, function () {
  const DAYS = ['fri', 'sat', 'sun', 'mon'];
  const DAY_MIN = 1440;
  const SMALL_HOURS_END_MIN = 5 * 60;
  const CATCH_BUFFER_MIN = 3;

  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtTime = (min) => `${pad2(Math.floor((min % DAY_MIN) / 60))}:${pad2(min % 60)}`;

  /* 01:30 on Saturday is still Friday night. */
  function nightOf(day, time) {
    const min = toMin(time);
    const prev = DAYS[DAYS.indexOf(day) - 1];
    return min < SMALL_HOURS_END_MIN && prev ? { day: prev, min: min + DAY_MIN } : { day, min };
  }

  const departuresFor = (home, day, mode) =>
    ((home.departures[day] || {})[mode] || []).map(([dep, arr]) => ({ mode, dep: toMin(dep), arr: toMin(arr) }));

  function nextFrom(home, day, mode, catchFrom) {
    const next = departuresFor(home, day, mode).find((d) => d.dep >= catchFrom);
    return next ? { ...next, homeAt: next.arr + home[mode].walkHomeMin } : null;
  }

  function lastOf(home, day, mode, walkToHubMin) {
    const all = departuresFor(home, day, mode);
    const last = all[all.length - 1];
    return last ? { ...last, leaveBy: last.dep - walkToHubMin - CATCH_BUFFER_MIN } : null;
  }

  /* readyMin: when you leave the place. walkToHubMin: walk from the place to the hub. */
  function homeOptions(home, day, readyMin, walkToHubMin) {
    const atHub = readyMin + walkToHubMin;
    const catchFrom = atHub + CATCH_BUFFER_MIN;
    const first = ['tram', 'bus'].map((m) => departuresFor(home, day, m)[0]).filter(Boolean)
      .reduce((a, d) => Math.min(a, d.dep), Infinity);
    const frequent = catchFrom < first;
    const next = { tram: nextFrom(home, day, 'tram', catchFrom), bus: nextFrom(home, day, 'bus', catchFrom) };
    const options = frequent ? [] : [next.tram, next.bus].filter(Boolean);
    const best = options.reduce((b, o) => (!b || o.homeAt < b.homeAt ? o : b), null);
    return {
      atHub, frequent, best, next,
      lastTram: lastOf(home, day, 'tram', walkToHubMin),
      lastBus: lastOf(home, day, 'bus', walkToHubMin),
    };
  }

  return { nightOf, homeOptions, fmtTime, toMin, CATCH_BUFFER_MIN };
});
