// The SVG charts, drawn by hand. Shared path helpers first, then each chart.
/* global band, bandHex, clamp, clock, clock12, dOf, dur, isoToday, londonMin, minOfDay, P */           // js/core.jsx
/* global shortDate, signed, SLEEP_STAGES, ST_DAY, stDate, stIso, stKg, stPlural, stT, useState */      // js/core.jsx
/* global usual, wkDate, wkShort */                                                                     // js/core.jsx
/* global Icon */                                                                                       // js/ui.jsx
/* exported col, consecutive, hrThreshold, bucketCounts, linePath, hbar, RecoveryScale, DRIVERS */
/* exported DriverBars, Waterfall, windowRows, findGaps, biggest, Trend, hrStrip, HrStrip, DayHr */
/* exported SessionChart, ZoneBars, StrainRuler, StrainGauge, StageBar, Ruler, nightHr, NightHr */
/* exported TonightLine, WakeControl, WeekDays, WeeksChart, GROUP_COLOURS, muscleSplit, SplitBar */
/* exported Spark */

// Column with a 4px rounded data end and a square base.
const col = (cx, top, base, w, r = 4) => {
  const x0 = cx - w / 2, x1 = cx + w / 2, rr = Math.max(0, Math.min(r, (base - top) / 2, w / 2));
  return `M${x0},${base}V${top + rr}Q${x0},${top} ${x0 + rr},${top}H${x1 - rr}Q${x1},${top} ${x1},${top + rr}V${base}Z`;
};

const pairs = (a) => { const o = []; for (let i = 0; i + 1 < (a || []).length; i += 2) o.push([a[i], a[i + 1]]); return o; };
const consecutive = (a, b) => !!a && !!b && Date.parse(b.date) - Date.parse(a.date) === 864e5;

const hrThreshold = (d) => Math.round(d.restHr + 0.3 * (d.maxHr - d.restHr));          // the heart rate above which a minute adds strain
const bucketCounts = (i, d) => (42.5 + i * 5 - d.restHr) / (d.maxHr - d.restHr) > 0.3;   // same test as strainOf
const linePath = (pts, gap) => { let prev = null; return pts.map(([x, y, k]) => { const c = prev == null || (gap != null && k - prev > gap) ? 'M' : 'L'; prev = k; return `${c}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' '); };
// Horizontal bar from x0 to x1 with a 4px rounded data end and a square foot.
const hbar = (x0, x1, y, h, r = 4) => { const d = x1 >= x0 ? 1 : -1, rr = Math.min(r, Math.abs(x1 - x0), h / 2);
  return `M${x0},${y}H${x1 - d * rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 - d * rr},${y + h}H${x0}Z`; };

// Finger or pointer across a chart: where it is, in the chart's own units.
function useScrub(w) {
  const [x, setX] = useState(null);
  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(); setX(((e.clientX - r.left) / r.width) * w); };
  return [x, { onPointerDown: at, onPointerMove: at, onPointerLeave: () => setX(null), onPointerCancel: () => setX(null), onPointerUp: (e) => { if (e.pointerType !== 'mouse') setX(null); } }];
}
const nearest = (list, x) => list.reduce((a, p) => (a == null || Math.abs(p.x - x) < Math.abs(a.x - x) ? p : a), null);

/* ---------------------------------------------------------------- recovery pieces */

// 0 to 100 as three bands. Only the band you are in is lit; the dashed tick is a normal morning for you.
function RecoveryScale({ value, normal, w = 333, surface = P.tile }) {
  const x = (v) => (v / 100) * w;
  const segs = [[0, 33.5, P.red], [33.5, 66.5, P.amber], [66.5, 100, P.green]];
  const nx = normal == null ? null : clamp(x(normal), 34, w - 44);
  return (
    <svg className="fit" viewBox={`0 0 ${w} 40`} role="img" aria-label={`Recovery ${value} on a scale of 0 to 100${normal != null ? `. A normal morning for you is ${normal}` : ''}`}>
      {segs.map(([a, b, c]) => <rect key={a} x={x(a) + (a ? 1 : 0)} y="9" width={x(b) - x(a) - (a && b < 100 ? 2 : 1)} height="8" rx="4" fill={c} opacity={value >= a && value < b + (b === 100 ? 1 : 0) ? 1 : 0.22} />)}
      {normal != null && <><path d={`M${x(normal)} 5v16`} stroke={P.muted} strokeWidth="1.5" strokeDasharray="2 2" /><text x={nx} y="35" textAnchor="middle" className="m">Normal {normal}</text></>}
      <rect className="pop" x={x(value) - 3.5} y="1.5" width="7" height="23" rx="3.5" fill={P.ink} stroke={surface} strokeWidth="2" />
      {(normal == null || nx > 60) && <text x="0" y="35">0</text>}
      {(normal == null || nx < w - 70) && <text x={w} y="35" textAnchor="end">100</text>}
    </svg>
  );
}

const DRIVERS = [['hrv', 'HRV', 'Heart rate variability'], ['rhr', 'Resting HR', 'Resting heart rate'], ['sleep', 'Sleep', 'Sleep']];

// The three drivers as bars from a centre line: left took points off, right added them.
function DriverBars({ dp, day, w = 333 }) {
  // Each row shows the reading and your usual, so the points on the right can't be mistaken for milliseconds or beats.
  const read = !day ? {} : {
    hrv: day.hrv_ms && day.hrvNormal ? `${Math.round(day.hrv_ms)} ms, usual ${day.hrvNormal}` : null,
    rhr: day.rhr && day.rhrNormal ? `${day.rhr} bpm, usual ${day.rhrNormal}` : null,
    sleep: day.sleepPerf ? `${Math.round(day.sleepPerf * 100)}% of need` : null,
  };
  const short = { hrv: 'HRV', rhr: 'RHR', sleep: 'Sleep' };
  const rh = 26, ax = 232, half = 44, max = Math.max(10, ...Object.values(dp.by).map(Math.abs)), sc = half / max;
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${rh * 3 + 2}`} role="img" aria-label={'Points against a normal morning: ' + DRIVERS.map(([k, , n]) => `${n} ${dp.by[k] == null ? 'not counted' : signed(dp.by[k])}`).join(', ')}>
      <path d={`M${ax + 0.5} 2V${rh * 3}`} stroke={P.line2} />
      {DRIVERS.map(([k, name], i) => { const p = dp.by[k], y = i * rh + 9; return (
        <g key={k}>
          <text x="0" y={y + 9} className="m" style={{ fontSize: 13 }}>{read[k] ? <>{short[k]} <tspan className="v">{read[k]}</tspan></> : name}</text>
          {p != null && p !== 0 && <path className={'stretch' + (p < 0 ? ' rtl' : '')} style={{ '--d': `${150 + i * 60}ms` }} d={hbar(ax, ax + p * sc, y, 10)} fill={P.soft} />}
          <text x={w} y={y + 9} textAnchor="end" className={p == null ? '' : 'v'} style={{ fontSize: 13 }}>{p == null ? 'Not counted' : signed(p) + ' pts'}</text>
        </g>
      ); })}
    </svg>
  );
}

// A normal morning, then what each driver added or took off, ending on this morning's score. One 0 to 100 axis.
function Waterfall({ day, dp, w = 333 }) {
  const x0 = 136, x1 = 292, rh = 34, bh = 14, X = (v) => x0 + (v / 100) * (x1 - x0);
  const rows = [{ name: 'Starting point', tot: dp.start }, ...DRIVERS.map(([k, , n]) => ({ name: n, p: dp.by[k] == null ? null : dp.by[k], off: dp.by[k] == null })), { name: 'This morning', tot: day.recovery, last: true }];
  const H = rh * rows.length + 34, bottom = rh * rows.length + 4;
  let cur = dp.start;
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Every morning starts at ${dp.start}. ${DRIVERS.filter(([k]) => dp.by[k] != null).map(([k, , n]) => `${n} ${dp.by[k] >= 0 ? 'added' : 'took off'} ${Math.abs(dp.by[k])}`).join(', ')}, leaving ${day.recovery}.`}>
      {[0, 33.5, 66.5, 100].map((v) => <path key={v} d={`M${X(v)} 0V${bottom}`} stroke={P.line2} />)}
      {rows.map((r, i) => {
        const y = i * rh + 9; let bar, end, val;
        if (r.tot != null) { end = r.tot; bar = <path className="stretch" style={{ '--d': `${i * 70}ms` }} d={hbar(X(0), Math.max(X(0) + 2, X(r.tot)), y, bh)} fill={r.last ? bandHex(day.recovery) : P.faint} />; val = r.last ? r.tot + '%' : r.tot; }
        else if (r.off) { end = cur; bar = null; val = '–'; }
        else { const a = cur, b = cur + r.p; end = b; cur = b; val = signed(r.p);
          bar = r.p === 0 ? <rect x={X(a) - 1} y={y} width="2" height={bh} fill={P.soft} /> : <path className={'stretch' + (r.p < 0 ? ' rtl' : '')} style={{ '--d': `${i * 70}ms` }} d={hbar(X(a), X(b), y, bh)} fill={P.soft} />; }
        return (
          <g key={r.name}>
            <text x="0" y={y + 11} style={{ fontSize: 13, fill: r.tot != null ? P.ink : r.off ? P.faint : P.muted, fontWeight: r.last ? 600 : 500 }}>{r.name}</text>
            {bar}
            <text x={w} y={y + 12} textAnchor="end" className="v" style={r.tot != null ? { fontSize: r.last ? 17 : 14, fontFamily: 'Cabinet Grotesk', fontWeight: 700 } : { fontSize: 14, fill: r.off ? P.faint : P.ink }}>{val}</text>
            {i < rows.length - 1 && <path d={`M${X(end)} ${y + bh}V${y + rh}`} stroke={P.faint} />}
          </g>
        );
      })}
      {[[0, 33.5, P.red], [33.5, 66.5, P.amber], [66.5, 100, P.green]].map(([a, b, c]) => <rect key={a} x={X(a) + 1} y={bottom + 6} width={X(b) - X(a) - 2} height="4" rx="2" fill={c} opacity={band(day.recovery) === { 0: 'bad', 33.5: 'meh', 66.5: 'good' }[a] ? 1 : 0.3} />)}
      {[[0, '0', 'start'], [33.5, '34', 'middle'], [66.5, '67', 'middle'], [100, '100', 'end']].map(([v, t, a]) => <text key={t} x={X(v)} y={bottom + 25} textAnchor={a}>{t}</text>)}
    </svg>
  );
}

/* ---------------------------------------------------------------- days on one honest axis
   rows is one entry per calendar day. A night with nothing stays empty; three or more in a row are hatched and
   the line breaks either side rather than joining across them. */
function windowRows(all, endIdx, span) {
  const by = {}; all.forEach((d) => { by[d.date] = d; });
  const end = Date.parse(all[endIdx].date), first = Date.parse(all[0].date);
  const n = Math.max(1, Math.min(span, Math.round((end - first) / 864e5) + 1)), rows = [];
  for (let i = n - 1; i >= 0; i--) { const iso = new Date(end - i * 864e5).toISOString().slice(0, 10); rows.push(by[iso] || { date: iso }); }
  return rows;
}
function findGaps(rows, val) {
  const gaps = []; let a = null;
  for (let i = 0; i <= rows.length; i++) {
    const miss = i < rows.length && val(rows[i]) == null;
    if (miss) { if (a == null) a = i; } else if (a != null) { if (i - a >= 3) gaps.push([a, i - 1]); a = null; }
  }
  return gaps;
}
const biggest = (gaps) => gaps.reduce((a, g) => (!a || g[1] - g[0] > a[1] - a[0] ? g : a), null);

function Trend({ rows, val, lo, hi, kind = 'line', colour = P.ink, colourFn, band: usualBand, ticks, tfmt, w = 333, h = 122, labelLast = true, fmt = (v) => String(Math.round(v)),
  xlabels = true, need, bg = P.tile, gapLabel = 'No watch data', refLine, aria, scrub, hatch = true, joinGap = 3 }) {
  const n = rows.length, s = rows.map((d, i) => (val(d) == null ? null : { i, v: val(d), d })).filter(Boolean);
  const pl = ticks ? 28 : 0, pr = labelLast ? 32 : 0, pt = 12, pb = xlabels ? 18 : 2, iw = w - pl - pr, ih = h - pt - pb;
  const step = n > 1 ? (iw - 10) / (n - 1) : 0, X = (i) => (n > 1 ? pl + 5 + i * step : pl + iw / 2), Y = (v) => pt + ih - ((clamp(v, lo, hi) - lo) / (hi - lo || 1)) * ih;
  const gaps = hatch ? findGaps(rows, val) : [], big = biggest(gaps), last = s[s.length - 1];
  const bw = clamp(step - 2, 1.5, n <= 14 ? 14 : 8), base = pt + ih;
  const [sx, handlers] = useScrub(w);
  const hit = scrub && sx != null && s.length ? nearest(s.map((p) => ({ ...p, x: X(p.i) })), sx) : null;
  const endIsToday = rows[n - 1].date === isoToday();
  const midLabel = big && big[0] > 0 && X(big[0] - 1) - X(0) > 64 && X(n - 1) - X(big[0] - 1) > 70 ? big[0] - 1 : null;
  return (
    <svg className={'fit' + (scrub ? ' scrub' : '')} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={aria} {...(scrub ? handlers : {})}>
      {(ticks || []).map((tv) => <g key={tv}><path d={`M${pl} ${Y(tv)}H${pl + iw}`} stroke={P.line} /><text x="0" y={Y(tv) + 4}>{tfmt ? tfmt(tv) : fmt(tv)}</text></g>)}
      {usualBand && <rect x={pl} y={Y(usualBand[1])} width={iw} height={Math.max(2, Y(usualBand[0]) - Y(usualBand[1]))} rx="3" fill={P.ink} opacity=".08" />}
      {gaps.map(([a, b]) => { const gx0 = Math.max(pl, X(a) - step * 0.4), gx1 = Math.min(pl + iw, X(b) + step * 0.4), wide = xlabels && w > 250 && gx1 - gx0 >= 124 && big && a === big[0]; return (
        <g key={a}>
          <rect x={gx0} y={pt} width={gx1 - gx0} height={ih} rx="4" fill="url(#hatch)" opacity=".7" />
          {wide && <><rect x={(gx0 + gx1) / 2 - 58} y={pt + ih / 2 - 19} width="116" height="38" rx="8" fill={bg} />
            <text x={(gx0 + gx1) / 2} y={pt + ih / 2 - 3} textAnchor="middle" className="m">{gapLabel}</text>
            <text x={(gx0 + gx1) / 2} y={pt + ih / 2 + 11} textAnchor="middle">{shortDate(rows[a].date)} to {shortDate(rows[b].date)}</text></>}
        </g>
      ); })}
      {refLine && <path d={`M${pl} ${Y(refLine.v)}H${pl + iw}`} stroke={P.muted} strokeDasharray="3 3" />}
      {kind === 'line' ? (<>
        <path className="draw" d={linePath(s.map((p) => [X(p.i), Y(p.v), p.i]), joinGap)} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {n <= 45 && s.slice(0, -1).map((p) => <circle key={p.i} cx={X(p.i)} cy={Y(p.v)} r="2" fill={colour} />)}
        {last && <circle className="pop" cx={X(last.i)} cy={Y(last.v)} r="4.5" fill={colour} stroke={bg} strokeWidth="2" />}
      </>) : s.map((p, k) => { const c = colourFn ? colourFn(p.v, p.d) : colour, y = Y(p.v), d = { '--d': `${Math.min(k * (400 / s.length), 500)}ms` }; return (
        <g key={p.i}>
          {need && need(p.d) != null && <rect x={X(p.i) - bw / 2} y={Y(need(p.d))} width={bw} height={base - Y(need(p.d))} rx={Math.min(3, bw / 2)} fill={P.track} />}
          {base - y < 1.5 ? <rect x={X(p.i) - bw / 2} y={base - 1.5} width={bw} height="1.5" fill={c} /> : <path className="grow" style={d} d={col(X(p.i), y, base, bw, Math.min(3, bw / 2))} fill={c} />}
        </g>
      ); })}
      {refLine && <g><rect x={pl + iw - refLine.label.length * 6.1 - 12} y={pt - 12} width={refLine.label.length * 6.1 + 12} height="16" rx="5" fill={bg} /><text x={pl + iw - 6} y={pt} textAnchor="end" className="m">{refLine.label}</text></g>}
      {labelLast && last && !hit && <text className="v rise" style={{ '--d': '500ms' }} x={X(last.i) + 9} y={Math.min(base, Y(last.v) + 4)}>{fmt(last.v)}</text>}
      {xlabels && <>
        <text x={X(0) - 4} y={h - 2}>{shortDate(rows[0].date)}</text>
        {midLabel != null && <text x={X(midLabel)} y={h - 2} textAnchor="middle">{shortDate(rows[midLabel].date)}</text>}
        {n > 1 && <text x={X(n - 1) + 6} y={h - 2} textAnchor="end" className="m">{endIsToday ? 'Today' : shortDate(rows[n - 1].date)}</text>}
      </>}
      {hit && <g pointerEvents="none">
        <path d={`M${hit.x} ${pt}V${base}`} stroke={P.muted} />
        <circle cx={hit.x} cy={Y(hit.v)} r="4.5" fill={P.ink} stroke={bg} strokeWidth="2" />
        <rect x={clamp(hit.x - 56, 0, w - 112)} y="-10" width="112" height="20" rx="6" fill={P.bg} />
        <text className="v" x={clamp(hit.x, 56, w - 56)} y="4" textAnchor="middle">{fmt(hit.v)}, {shortDate(hit.d.date)}</text>
      </g>}
    </svg>
  );
}

/* ---------------------------------------------------------------- heart rate */

// The last 24 hours, ending at the latest reading (or, on a past day, midnight to midnight).
function hrStrip(all, idx, gym) {
  const day = all[idx], prev = idx > 0 && consecutive(all[idx - 1], day) ? all[idx - 1] : null, live = day.date === isoToday();
  const T = pairs(day.hr_min), Yd = live && prev ? pairs(prev.hr_min) : [];
  if (T.length + Yd.length < 3) return null;
  const end = live ? (T.length ? T[T.length - 1][0] : londonMin(Date.now())) : 1439;
  const kY = (m) => m - end, kT = (m) => (live ? m + 1440 - end : m);
  const pts = [...Yd.filter(([m]) => m >= end).map(([m, v]) => ({ k: kY(m), v, m })), ...T.map(([m, v]) => ({ k: kT(m), v, m }))];
  if (pts.length < 3) return null;
  const sessions = ((gym && gym.sessions) || []).filter((s) => s.start && s.end).map((s) => {
    const a = londonMin(s.start), b = londonMin(s.end);
    if (s.date === day.date) return { a: kT(a), b: Math.min(1440, kT(b)), name: s.name };
    if (live && prev && s.date === prev.date && b >= end) return { a: Math.max(0, kY(a)), b: kY(b), name: s.name };
    return null;
  }).filter(Boolean);
  let sleep = null;
  if (day.sleep && day.sleep.start && day.sleep.end) {
    const a = minOfDay(day.sleep.start), b = minOfDay(day.sleep.end);
    sleep = live ? { a: a > b ? Math.max(0, kY(a)) : kT(a), b: kT(b) } : { a: a > b ? 0 : a, b };
  }
  const gaps = [];
  if (pts[0].k > 45) gaps.push([0, pts[0].k]);
  pts.forEach((p, i) => { if (i && p.k - pts[i - 1].k > 45) gaps.push([pts[i - 1].k, p.k]); });
  if (!live && 1440 - pts[pts.length - 1].k > 45) gaps.push([pts[pts.length - 1].k, 1440]);
  const peak = pts.reduce((a, p) => (p.v > a.v ? p : a)), low = pts.reduce((a, p) => (p.v < a.v ? p : a)), last = pts[pts.length - 1];
  return { pts, sessions, sleep, gaps, live, peak, low, last, peakInGym: sessions.some((s) => peak.k >= s.a && peak.k <= s.b) };
}

function HrStrip({ data, w = 333, h = 104 }) {
  const { pts, sessions, sleep, gaps, live, peak, low, last } = data;
  const pt = 14, pb = 18, ih = h - pt - pb, lo = Math.min(45, Math.floor((low.v - 5) / 5) * 5), hi = Math.max(125, Math.ceil((peak.v + 5) / 5) * 5);
  const X = (k) => (k / 1440) * w, Y = (v) => pt + ih - ((v - lo) / (hi - lo)) * ih;
  // Labels along the bottom: place the important ones first and drop any that would sit on top of another.
  const placed = [], put = (x, text, anchor, cls) => { const wd = text.length * 6.3, a = anchor === 'middle' ? x - wd / 2 : anchor === 'end' ? x - wd : x;
    if (a < -1 || a + wd > w + 1 || placed.some((p) => a < p.b + 6 && a + wd > p.a - 6)) return; placed.push({ a, b: a + wd, x, text, anchor, cls }); };
  put(w, live ? clock12(last.m) : '12am', 'end', live ? 'm' : '');
  if (!live) put(0, '12am', 'start', '');
  if (sleep) put((X(sleep.a) + X(sleep.b)) / 2, 'Asleep', 'middle', 'm');
  sessions.forEach((s) => put((X(s.a) + X(s.b)) / 2, 'Gym', 'middle', 'm'));
  const wide = biggest(gaps.map(([a, b]) => [X(a), X(b)]));
  if (wide && wide[1] - wide[0] > 30) put(Math.max(0, wide[0]), 'Watch off', 'start', '');
  const near = Math.abs(X(peak.k) - X(low.k)) < 30;
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Heart rate ${live ? 'over the last 24 hours' : 'through the day'}: peak ${peak.v}, lowest ${low.v} at ${clock12(low.m)}`}>
      {[60, 100].filter((v) => v > lo && v < hi).map((v) => <path key={v} d={`M0 ${Y(v)}H${w}`} stroke={P.line} />)}
      {gaps.map(([a, b]) => <rect key={a} x={X(a) + (a ? 3 : 0)} y={pt} width={Math.max(0, X(b) - X(a) - (a ? 6 : 3))} height={ih} rx="4" fill="url(#hatch)" opacity=".7" />)}
      {sessions.map((s) => <rect key={s.a} x={X(s.a)} y={pt} width={Math.max(3, X(s.b) - X(s.a))} height={ih} rx="3" fill={P.blue} opacity=".16" />)}
      {sleep && <rect x={X(sleep.a)} y={pt + ih - 4} width={Math.max(4, X(sleep.b) - X(sleep.a))} height="4" rx="2" fill={P.sleep} />}
      <path className="draw" d={linePath(pts.map((p) => [X(p.k), Y(p.v), p.k]), 16)} fill="none" stroke={P.blue} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(peak.k)} cy={Y(peak.v)} r="3.5" fill={P.blue} stroke={P.tile} strokeWidth="2" />
      <text className="v" x={X(peak.k) > w - 40 ? X(peak.k) - 7 : X(peak.k) + 7} y={Y(peak.v) + 3} textAnchor={X(peak.k) > w - 40 ? 'end' : 'start'}>{peak.v}</text>
      {!near && <><circle cx={X(low.k)} cy={Y(low.v)} r="3.5" fill={P.blue} stroke={P.tile} strokeWidth="2" /><text className="v" x={clamp(X(low.k), 10, w - 10)} y={Y(low.v) - 9} textAnchor="middle">{low.v}</text></>}
      {live && <circle className="pop" cx={X(last.k) - 2} cy={Y(last.v)} r="4" fill={P.ink} stroke={P.tile} strokeWidth="2" />}
      {placed.map((p) => <text key={p.text + p.x} x={p.x} y={h - 3} textAnchor={p.anchor} className={p.cls}>{p.text}</text>)}
    </svg>
  );
}

// One calendar day, midnight to midnight: the line, the part that counted towards strain, sleep, sessions, and the hours with no watch.
function DayHr({ day, sessions = [], live, w = 333, h = 196 }) {
  const id = React.useId().replace(/:/g, ''), pts = pairs(day.hr_min), th = hrThreshold(day);
  const pl = 28, pt = 22, pb = 20, iw = w - pl, ih = h - pt - pb, vs = pts.map((p) => p[1]);
  const lo = Math.min(45, Math.floor((Math.min(...vs) - 5) / 5) * 5), hi = Math.max(th + 20, Math.ceil((Math.max(...vs) + 6) / 10) * 10);
  const X = (m) => pl + (m / 1440) * iw, Y = (v) => pt + ih - ((v - lo) / (hi - lo)) * ih, base = pt + ih;
  const segs = []; pts.forEach((p, i) => { if (!i || p[0] - pts[i - 1][0] > 16) segs.push([]); segs[segs.length - 1].push(p); });
  const gaps = []; if (pts[0][0] > 60) gaps.push([0, pts[0][0]]);
  pts.forEach((p, i) => { if (i && p[0] - pts[i - 1][0] > 60) gaps.push([pts[i - 1][0], p[0]]); });
  const lastM = pts[pts.length - 1][0]; if (!live && 1440 - lastM > 60) gaps.push([lastM, 1440]);
  const lead = gaps.find((g) => g[0] === 0 && X(g[1]) - X(0) > 120);
  const sl = day.sleep && day.sleep.start && day.sleep.end ? (() => { const a = minOfDay(day.sleep.start), b = minOfDay(day.sleep.end); return { a: a > b ? 0 : a, b, end: day.sleep.end }; })() : null;
  const ticks = [...new Set([Math.ceil(lo / 20) * 20 + 10, th, Math.floor(hi / 10) * 10])].filter((v) => v > lo && v <= hi);
  const [sx, handlers] = useScrub(w);
  const hit = sx != null ? nearest(pts.map(([m, v]) => ({ x: X(m), m, v })), sx) : null;
  return (
    <svg className="fit scrub" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Heart rate on ${wkDate(day.date)}, midnight to midnight. Minutes above ${th} beats a minute count towards strain.`} {...handlers}>
      <defs><clipPath id={id}><rect x="0" y="0" width={w} height={Y(th)} /></clipPath></defs>
      {ticks.filter((v) => v !== th).map((v) => <g key={v}><path d={`M${pl} ${Y(v)}H${w}`} stroke={P.line} /><text x={pl - 8} y={Y(v) + 4} textAnchor="end">{v}</text></g>)}
      {sl && <rect x={X(sl.a)} y={pt} width={Math.max(2, X(sl.b) - X(sl.a))} height={ih} rx="3" fill={P.sleep} opacity=".16" />}
      {sl && X(sl.b) - X(sl.a) > 96 && <text x={X(sl.a) + 6} y={pt + 13} style={{ fill: P.rem }}>Asleep until {clock(sl.end)}</text>}
      {gaps.map(([a, b]) => <rect key={a} x={X(a)} y={pt} width={Math.max(0, X(b) - X(a) - 3)} height={ih} rx="4" fill="url(#hatch)" opacity=".7" />)}
      {sessions.map((s) => <g key={s.a}><rect x={X(s.a)} y={pt - 8} width={Math.max(3, X(s.b) - X(s.a))} height={ih + 8} rx="3" fill={P.blue} opacity=".16" />
        <text className="v" x={clamp((X(s.a) + X(s.b)) / 2, pl + s.name.length * 3.2, w - s.name.length * 3.2)} y={pt - 13} textAnchor="middle">{s.name}</text></g>)}
      <path d={`M${pl} ${Y(th)}H${w}`} stroke={P.muted} strokeDasharray="3 3" /><text className="v" x={pl - 8} y={Y(th) + 4} textAnchor="end">{th}</text>
      {lead && <><rect x={(X(0) + X(lead[1])) / 2 - 58} y={pt + ih / 2 - 19} width="116" height="38" rx="8" fill={P.tile} />
        <text x={(X(0) + X(lead[1])) / 2} y={pt + ih / 2 - 3} textAnchor="middle" className="m">Watch off</text>
        <text x={(X(0) + X(lead[1])) / 2} y={pt + ih / 2 + 11} textAnchor="middle">until {clock12(lead[1])}</text></>}
      {segs.filter((g) => g.length > 1).map((g, i) => <path key={i} clipPath={`url(#${id})`} d={`M${X(g[0][0])} ${Y(th)} ` + g.map(([m, v]) => `L${X(m).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ') + ` L${X(g[g.length - 1][0])} ${Y(th)}Z`} fill={P.blue} opacity=".4" />)}
      <path className="draw" d={linePath(pts.map(([m, v]) => [X(m), Y(v), m]), 16)} fill="none" stroke={P.blue} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {live && <><path d={`M${X(lastM)} ${pt - 6}V${base}`} stroke={P.ink} strokeWidth="1.5" />
        <text className="v" x={X(lastM) > w - 110 ? X(lastM) - 6 : X(lastM) + 6} y={pt + 13} textAnchor={X(lastM) > w - 110 ? 'end' : 'start'}>Last sync {clock12(lastM)}</text></>}
      <path d={`M${pl} ${base}H${w}`} stroke={P.line2} />
      {[[0, '12am', 'start'], [360, '6am', 'middle'], [720, '12pm', 'middle'], [1080, '6pm', 'middle'], [1440, '12am', 'end']].map(([m, t, a]) => <text key={m} x={X(m)} y={h - 3} textAnchor={a}>{t}</text>)}
      {hit && <g pointerEvents="none"><path d={`M${hit.x} ${pt}V${base}`} stroke={P.muted} /><circle cx={hit.x} cy={Y(hit.v)} r="4" fill={P.ink} stroke={P.tile} strokeWidth="2" />
        <rect x={clamp(hit.x - 52, 0, w - 104)} y={pt - 22} width="104" height="20" rx="6" fill={P.bg} /><text className="v" x={clamp(hit.x, 52, w - 52)} y={pt - 8} textAnchor="middle">{hit.v} bpm, {clock12(hit.m)}</text></g>}
    </svg>
  );
}

// The session opened up: its window shaded, with a little of the day either side for context.
function SessionChart({ hr, day, w = 333, h = 124, surface = P.tile }) {
  const A = Math.max(0, hr.a - 20), B = Math.min(1439, hr.b + 15), pts = pairs(day.hr_min).filter(([m]) => m >= A && m <= B);
  const pt = 16, pb = 18, ih = h - pt - pb, vs = pts.map((p) => p[1]), lo = Math.min(...vs) - 6, hi = Math.max(...vs) + 6;
  const X = (m) => ((m - A) / (B - A)) * w, Y = (v) => pt + ih - ((v - lo) / (hi - lo)) * ih;
  const pk = pts.filter(([m]) => m >= hr.a && m <= hr.b).reduce((a, p) => (p[1] > a[1] ? p : a), [hr.a, 0]), right = X(pk[0]) < w - 80;
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Heart rate during the session, ${clock12(hr.a)} to ${clock12(hr.b)}: average ${hr.avg}, peak ${hr.max}`}>
      <rect x={X(hr.a)} y={pt - 2} width={X(hr.b) - X(hr.a)} height={ih + 4} rx="6" fill={P.blue} opacity=".1" />
      <path d={`M0 ${Y(hr.avg)}H${w}`} stroke={P.faint} strokeDasharray="1 3" /><text x="0" y={Y(hr.avg) - 4} className="m">Average {hr.avg}</text>
      <path className="draw" d={linePath(pts.map(([m, v]) => [X(m), Y(v), m]), 16)} fill="none" stroke={P.blue} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle className="pop" cx={X(pk[0])} cy={Y(pk[1])} r="4.5" fill={P.blue} stroke={surface} strokeWidth="2" />
      <text className="v" x={X(pk[0]) + (right ? 9 : -9)} y={Y(pk[1]) + 3} textAnchor={right ? 'start' : 'end'}>Peak {pk[1]}</text>
      <text x={X(hr.a)} y={h - 3} className="m">{clock12(hr.a)}</text><text x={X(hr.b)} y={h - 3} textAnchor="end" className="m">{clock12(hr.b)}</text>
    </svg>
  );
}

// Minutes at each heart rate. Grey was too easy to count; blue is what built the strain number.
function ZoneBars({ day, w = 333, h = 150 }) {
  const b = day.hr_buckets, first = b.findIndex((x) => x > 0), lastI = b.length - 1 - b.slice().reverse().findIndex((x) => x > 0);
  const idx = []; for (let i = first; i <= lastI; i++) idx.push(i);
  const pt = 34, pb = 18, ih = h - pt - pb, slot = w / idx.length, bw = Math.max(3, slot - 4), max = Math.max(...idx.map((i) => b[i])), base = pt + ih;
  const firstCount = idx.find((i) => bucketCounts(i, day)), dx = firstCount == null ? null : (firstCount - first) * slot;
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Minutes at each heart rate on ${wkDate(day.date)}`}>
      {idx.map((i, k) => { const on = bucketCounts(i, day), y = base - (b[i] / max) * ih, cx = slot * (k + 0.5); return (
        <g key={i}>
          {b[i] > 0 && (base - y < 1.5 ? <rect x={cx - bw / 2} y={base - 1.5} width={bw} height="1.5" fill={on ? P.blue : P.easy} /> : <path className="grow" style={{ '--d': `${k * 25}ms` }} d={col(cx, y, base, bw, 4)} fill={on ? P.blue : P.easy} />)}
          {b[i] > 0 && slot >= 20 && <text className={on ? 'v' : 'm'} x={cx} y={y - 5} textAnchor="middle">{Math.round(b[i])}</text>}
          {(40 + i * 5) % 10 === 0 && (idx.length <= 16 || (40 + i * 5) % 20 === 0) && <text x={cx - slot / 2} y={h - 3} textAnchor="middle">{40 + i * 5}</text>}
        </g>
      ); })}
      <path d={`M0 ${base}H${w}`} stroke={P.line2} />
      {dx != null && dx > 0 && <><path d={`M${dx} 6V${base}`} stroke={P.muted} strokeDasharray="3 3" />
        {dx > 104 && <text x={dx - 7} y="14" textAnchor="end">Too easy to count</text>}
        {w - dx > 132 ? <text className="v" x={dx + 7} y="14">Counts towards strain</text> : <text className="v" x={dx + 7} y="14">Counts</text>}</>}
    </svg>
  );
}

// 0 to 21 across: the white block is the range to aim for, the dot is where the day is.
function StrainRuler({ strain, tg, marks = [], w = 333 }) {
  const X = (v) => 6 + (clamp(v, 0, 21) / 21) * (w - 12), has = tg && tg.lo != null;
  return (
    <svg className="fit" viewBox={`0 0 ${w} 70`} role="img" aria-label={`Strain ${strain == null ? 'not recorded' : strain.toFixed(1)} on a scale of 0 to 21${has ? `. Aim for ${tg.lo} to ${tg.hi}` : ''}`}>
      <rect x="0" y="22" width={w} height="12" rx="6" fill={P.track} />
      {has && <><rect className="stretch" x={X(tg.lo)} y="22" width={X(tg.hi) - X(tg.lo)} height="12" rx="3" fill={P.ink} />
        <text className="v" x={clamp((X(tg.lo) + X(tg.hi)) / 2, 44, w - 44)} y="13" textAnchor="middle">Aim for {tg.lo} to {tg.hi}</text></>}
      {marks.map((m) => <path key={m.label} d={`M${X(m.v)} 18v20`} stroke={P.blue} strokeWidth="2" strokeLinecap="round" />)}
      {strain != null && <circle className="pop" cx={X(strain)} cy="28" r="7" fill={P.blue} stroke={P.tile2} strokeWidth="2.5" />}
      <text x="0" y="50">0</text><text x={w} y="50" textAnchor="end">21</text>
      {marks.slice().sort((a, b) => a.v - b.v).map((m, i, arr) => { const two = arr.length === 2 && X(arr[1].v) - X(arr[0].v) < 150, t = `${m.label} ${m.v.toFixed(1)}`, wd = t.length * 6.2;
        const anchor = two ? (i === 0 ? 'end' : 'start') : 'middle', x = two ? X(m.v) + (i === 0 ? 3 : -3) : X(m.v);
        return <text key={m.label} className="m" x={anchor === 'end' ? Math.max(wd, x) : anchor === 'start' ? Math.min(w - wd, x) : clamp(x, wd / 2, w - wd / 2)} y="66" textAnchor={anchor}>{t}</text>; })}
    </svg>
  );
}

// The same scale stood upright for the narrow tile on Today.
function StrainGauge({ strain, tg, yesterday, h = 156, w = 96 }) {
  const x0 = 4, bw = 12, Y = (v) => 8 + (h - 16) * (1 - clamp(v, 0, 21) / 21), has = tg && tg.lo != null, tx = x0 + bw + 8;
  const yy = yesterday ? Y(yesterday.v) : null, clash = yy != null && has && (Math.abs(yy - Y(tg.hi)) < 13 || Math.abs(yy - Y(tg.lo)) < 13 || (yy > Y(tg.hi) && yy < Y(tg.lo)));
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Strain ${strain == null ? 'not recorded' : strain.toFixed(1)}${has ? `, aim for ${tg.lo} to ${tg.hi}` : ''}${yesterday ? `, ${yesterday.label} ${yesterday.v.toFixed(1)}` : ''}`}>
      <rect x={x0} y={Y(21)} width={bw} height={Y(0) - Y(21)} rx="6" fill={P.track} />
      {has && <><rect x={x0} y={Y(tg.hi)} width={bw} height={Y(tg.lo) - Y(tg.hi)} rx="3" fill={P.ink} />
        <text className="v" x={tx} y={Y(tg.hi) + 4}>{tg.hi}</text><text className="v" x={tx} y={Y(tg.lo) + 4}>{tg.lo}</text>
        {Y(tg.lo) - Y(tg.hi) > 26 && <text x={tx + 14} y={(Y(tg.hi) + Y(tg.lo)) / 2 + 4} className="m">Aim here</text>}</>}
      {yy != null && <><path d={`M${x0 - 3} ${yy}h${bw + 6}`} stroke={P.blue} strokeWidth="2" strokeLinecap="round" />{!clash && yy > 26 && <text x={tx} y={yy + 4} className="m">{yesterday.label} {yesterday.v.toFixed(1)}</text>}</>}
      {strain != null && <circle className="pop" cx={x0 + bw / 2} cy={clamp(Y(strain), Y(21) + 6, Y(0) - 6)} r="6" fill={P.blue} stroke={P.tile} strokeWidth="2" />}
      {(yy == null || yy > 26 || clash) && (!has || Y(tg.hi) > 26) && <text x={tx} y={Y(21) + 8}>21</text>}
    </svg>
  );
}

/* ---------------------------------------------------------------- sleep pieces */

// Stage amounts in one bar. The full width is the sleep you needed, so the empty end is the shortfall.
function StageBar({ st, need, w = 333, h = 14 }) {
  const staged = SLEEP_STAGES.reduce((a, s) => a + (st[s.k] || 0), 0), total = Math.max(need || 0, staged || st.asleep_min || 0) || 1;
  const segs = staged ? SLEEP_STAGES.map((s) => [st[s.k] || 0, s.colour]) : [[st.asleep_min || 0, P.sleep]];
  let x = 0;
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={staged ? 'Sleep stages by amount, against the sleep you needed' : 'Time asleep against the sleep you needed'}>
      <rect x=".5" y=".5" width={w - 1} height={h - 1} rx={h / 2} fill="none" stroke={P.line2} />
      <g className="stretch">{segs.map(([m, c], k) => { const sw = (m / total) * w, x0 = x; x += sw; if (sw < 2) return null; return (
        <g key={k}><rect x={x0} y="0" width={Math.max(1, sw - 2)} height={h} rx={k ? 3 : h / 2} fill={c} />{k === 0 && segs.length > 1 && sw > 10 && <rect x={x0 + sw - 8} y="0" width="6" height={h} fill={c} />}</g>
      ); })}</g>
    </svg>
  );
}

// A reading against its usual range: quiet track, usual band, a ringed dot for last night.
function Ruler({ value, r, colour = P.ink, w = 91 }) {
  const u = usual(r), lo0 = Math.min(r.lo, value), hi0 = Math.max(r.hi, value), pad = (hi0 - lo0) * 0.15 || 1;
  const x = (v) => clamp(((v - (lo0 - pad)) / (hi0 - lo0 + 2 * pad)) * w, 5, w - 5);
  return (
    <svg className="fit" viewBox={`0 0 ${w} 18`} aria-hidden="true">
      <rect x="0" y="7" width={w} height="4" rx="2" fill={P.track} /><rect x={x(u[0])} y="7" width={Math.max(3, x(u[1]) - x(u[0]))} height="4" rx="2" fill={P.faint} />
      <circle className="pop" cx={x(value)} cy="9" r="5" fill={colour} stroke={P.tile} strokeWidth="2" />
    </svg>
  );
}

function nightHr(all, idx) {
  const day = all[idx], s = day.sleep;
  if (!s || !s.start || !s.end) return null;
  const a = minOfDay(s.start), b = minOfDay(s.end), prev = idx > 0 && consecutive(all[idx - 1], day) ? all[idx - 1] : null;
  const pts = a > b ? [...(prev ? pairs(prev.hr_min).filter(([m]) => m >= a).map(([m, v]) => [m - a, v]) : []), ...pairs(day.hr_min).filter(([m]) => m <= b).map(([m, v]) => [m + 1440 - a, v])]
    : pairs(day.hr_min).filter(([m]) => m >= a && m <= b).map(([m, v]) => [m - a, v]);
  const len = a > b ? b + 1440 - a : b - a;
  return pts.length < 10 ? null : { pts, len, a, start: s.start, end: s.end };
}
function NightHr({ n, w = 333, h = 128 }) {
  const vs = n.pts.map((p) => p[1]), mn = Math.min(...vs), mx = Math.max(...vs), lo = Math.floor((mn - 6) / 5) * 5, hi = Math.ceil((mx + 6) / 5) * 5;
  const X = (k) => (k / n.len) * w, Y = (v) => 10 + 100 - ((v - lo) / (hi - lo)) * 100, low = n.pts.reduce((a, p) => (p[1] < a[1] ? p : a));
  const ticks = [Math.ceil((lo + 4) / 10) * 10, Math.floor((hi - 4) / 10) * 10].filter((v, i, a) => v > lo && v < hi && a.indexOf(v) === i);
  const hours = []; for (let m = Math.ceil((n.a + 50) / 120) * 120; m < n.a + n.len - 50; m += 120) hours.push(m);
  const lx = X(low[0]), right = lx < w - 132;
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Heart rate through the night, lowest ${low[1]} at ${clock12(n.a + low[0])}`}>
      <rect x="0" y="10" width={w} height="100" rx="6" fill={P.sleep} opacity=".07" />
      {ticks.map((v) => <g key={v}><path d={`M0 ${Y(v)}H${w}`} stroke={P.line2} /><text x={w - 4} y={Y(v) - 3} textAnchor="end">{v}</text></g>)}
      <path className="draw" d={linePath(n.pts.map(([k, v]) => [X(k), Y(v), k]), 16)} fill="none" stroke={P.blue} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle className="pop" cx={lx} cy={Y(low[1])} r="4" fill={P.blue} stroke={P.tile2} strokeWidth="2" />
      <text className="v" x={lx + (right ? 9 : -9)} y={Math.min(106, Y(low[1]) + 14)} textAnchor={right ? 'start' : 'end'}>Lowest {low[1]}, {clock12(n.a + low[0])}</text>
      <text x="0" y={h - 3} className="m">{clock(n.start)}</text><text x={w} y={h - 3} textAnchor="end" className="m">{clock(n.end)}</text>
      {hours.map((m) => <text key={m} x={X(m - n.a)} y={h - 3} textAnchor="middle">{clock12(m).replace(':00', '')}</text>)}
    </svg>
  );
}

// The night on a 6pm to noon line: white from lights out to getting up.
function TonightLine({ plan, w = 333, mini }) {
  const T0 = 18 * 60, SPAN = 18 * 60, pos = (m) => ((((m - T0) % 1440) + 1440) % 1440) / SPAN * w, a = pos(plan.bed), b = pos(plan.wake);
  if (mini) return <svg className="fit" viewBox={`0 0 ${w} 8`} aria-hidden="true"><rect width={w} height="4" y="2" rx="2" fill={P.track} /><rect className="stretch" x={a} y="2" width={Math.max(4, b - a)} height="4" rx="2" fill={P.ink} /></svg>;
  return (
    <svg className="fit" viewBox={`0 0 ${w} 40`} role="img" aria-label={`In bed from ${clock12(plan.bed)} to ${clock12(plan.wake)}, ${dur(plan.inBed)}`}>
      <rect x="0" y="6" width={w} height="10" rx="5" fill={P.track} /><rect className="stretch" x={a} y="6" width={Math.max(6, b - a)} height="10" rx="5" fill={P.ink} />
      {[18, 21, 0, 3, 6, 9, 12].map((hh, i) => <text key={i} x={(i / 6) * w} y="36" textAnchor={i === 0 ? 'start' : i === 6 ? 'end' : 'middle'}>{hh % 12 || 12}{hh % 12 === 0 || hh === 18 ? (hh >= 12 ? 'pm' : 'am') : ''}</text>)}
    </svg>
  );
}

function WakeControl({ plan, onWake, mini }) {
  return (
    <label className={'wake above' + (mini ? ' mini' : '')}>
      <span className="chip num-plain">{mini ? 'Up' : plan.wakeFrom === 'usual' ? 'Up at your usual' : 'Up at'} {clock12(plan.wake)}<Icon n="pencil-simple" /></span>
      <input type="time" aria-label="Change your wake-up time" value={`${String(Math.floor(plan.wake / 60)).padStart(2, '0')}:${String(Math.round(plan.wake) % 60).padStart(2, '0')}`}
        onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (Number.isFinite(h)) onWake(h * 60 + m); }} />
    </label>
  );
}

/* ---------------------------------------------------------------- training pieces */

// This week, Monday to Sunday, one column per day.
function WeekDays({ sessions, weekStart, big, w = 333, h = 104 }) {
  const today = isoToday(), pb = 16, pt = big ? 18 : 4, ih = h - pb - pt, slot = w / 7, bw = big ? 22 : 14, base = pt + ih;
  const days = Array.from({ length: 7 }, (_, i) => { const iso = stIso(stT(weekStart) + i * ST_DAY); return { iso, v: sessions.filter((s) => s.date === iso).reduce((a, s) => a + (s.volume || 0), 0) }; });
  const max = Math.max(1, ...days.map((d) => d.v)), top = days.reduce((a, d) => (d.v > a.v ? d : a));
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={'Kg moved each day this week: ' + (days.filter((d) => d.v).map((d) => `${stKg(d.v)} kg on ${dOf(d.iso).toLocaleDateString('en-GB', { weekday: 'long' })}`).join(', ') || 'nothing logged yet')}>
      <path d={`M0 ${base + 0.5}H${w}`} stroke={P.line2} />
      {days.map((d, i) => { const cx = slot * (i + 0.5), y = base - (d.v / max) * (ih - 4) ; return (
        <g key={d.iso}>
          {d.v > 0 ? <path className="grow" style={{ '--d': `${i * 40}ms` }} d={col(cx, y, base, bw, 4)} fill={P.blue} /> : d.iso > today ? <rect x={cx - bw / 2} y={base - 3} width={bw} height="3" fill={P.track} /> : null}
          {big && d.v > 0 && d.iso === top.iso && <text className="v" x={clamp(cx, 28, w - 28)} y={y - 6} textAnchor="middle">{stKg(d.v)} kg</text>}
          <text x={cx} y={h - 2} textAnchor="middle" className={d.iso === today ? 'v' : ''}>{big ? wkShort(d.iso) : wkShort(d.iso)[0]}</text>
        </g>
      ); })}
    </svg>
  );
}

// Kg moved per week with the sessions counted underneath: two panels on the same weeks, never two y-axes.
function WeeksChart({ weeks, span, w = 333 }) {
  const shown = weeks.slice(-span), slots = Math.max(8, shown.length), last = shown.length - 1, slot = w / slots, bw = Math.min(22, slot - 3), x = (i) => slot * (i + 0.5);
  const A = { top: 22, base: 104 }, vmax = Math.max(1, ...shown.map((k) => k.volume)), cmax = Math.max(1, ...shown.map((k) => k.count)), yv = (v) => A.base - (v / vmax) * (A.base - A.top);
  const Bb = A.base + 30 + cmax * 8, H = Bb + 20, cur = shown[last], anchor = (i) => (x(i) < 34 ? 'start' : x(i) > w - 34 ? 'end' : 'middle'), lx = (i) => (anchor(i) === 'start' ? x(i) - bw / 2 : anchor(i) === 'end' ? x(i) + bw / 2 : x(i));
  const weekOf = (i) => stDate(stIso(stT(shown[0].start) + i * 7 * ST_DAY));
  return (
    <svg className="fit" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Kg moved and sessions per week, ${stPlural(shown.length, 'week')}. This week ${stKg(cur.volume)} kg in ${stPlural(cur.count, 'session')}.`}>
      <path d={`M0 ${A.base + 0.5}H${w}`} stroke={P.line2} />
      {Array.from({ length: slots }, (_, i) => { const k = shown[i]; return k && k.volume ? <path key={i} className="grow" style={{ '--d': `${i * 30}ms` }} d={col(x(i), yv(k.volume), A.base, bw, 4)} fill={P.blue} opacity={i === last ? 1 : 0.45} /> : <rect key={i} x={x(i) - bw / 2} y={A.base - 3} width={bw} height="3" fill={P.track} />; })}
      {cur.volume > 0 && <text className="v" x={lx(last)} y={yv(cur.volume) - 6} textAnchor={anchor(last)}>{stKg(cur.volume)} kg</text>}
      <text x="0" y={A.base + 20} className="m">Sessions</text>
      <path d={`M0 ${Bb + 0.5}H${w}`} stroke={P.line2} />
      {shown.map((k, i) => Array.from({ length: k.count }, (_, j) => <rect key={i + '-' + j} x={x(i) - bw / 2} y={Bb - (j + 1) * 8} width={bw} height="6" rx="2" fill={P.blue} opacity={i === last ? 1 : 0.45} />))}
      <text className="v" x={lx(last)} y={H - 3} textAnchor={anchor(last)}>This week</text>
      {last > 2 && <text x="0" y={H - 3}>{weekOf(0)}</text>}
    </svg>
  );
}

// Which muscles a session went on, read from the exercise names (the gym app does not tag them).
const MUSCLES = [['Core', /crunch|plank|\bab\b|abs\b|core|leg raise|rollout/i], ['Legs', /squat|leg|lunge|deadlift|rdl|hamstring|quad|calf|glute|hip thrust|step.?up/i],
  ['Triceps', /tricep|pushdown|skull/i], ['Biceps', /bicep|curl/i], ['Shoulders', /lateral|shoulder|overhead press|ohp|rear delt|face pull|military|arnold|upright/i],
  ['Back', /row|pull.?down|pull.?up|chin|\blat\b|pullover|shrug/i], ['Chest', /press|fly|flye|pec|bench|push.?up|dip|chest/i]];
const muscleOf = (name) => (MUSCLES.find(([, re]) => re.test(name)) || ['Other'])[0];
const GROUP_COLOURS = [P.blue, P.blueL, P.blueD, P.faint, P.easy];
function muscleSplit(session) {
  const g = {}; (session.exercises || []).forEach((e) => { const k = muscleOf(e.name); g[k] = (g[k] || 0) + (e.volume || 0); });
  const list = Object.entries(g).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return list.length > 5 ? [...list.slice(0, 4), ['Other', list.slice(4).reduce((a, x) => a + x[1], 0)]] : list;
}
function SplitBar({ groups, w = 333 }) {
  const tot = groups.reduce((a, g) => a + g[1], 0) || 1; let x = 0;
  return (
    <svg className="fit" viewBox={`0 0 ${w} 14`} role="img" aria-label={'Kg moved by muscle group: ' + groups.map(([n, v]) => `${n} ${stKg(v)} kg`).join(', ')}>
      <g className="stretch">{groups.map(([n, v], i) => { const sw = (v / tot) * w, x0 = x; x += sw; return <rect key={n} x={x0} y="0" width={Math.max(2, sw - 2)} height="14" rx="4" fill={GROUP_COLOURS[i]} />; })}</g>
    </svg>
  );
}
function Spark({ pts: allPts }) {
  const pts = allPts.slice(-12), W = 56, H = 22, Pd = 4, vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const xy = pts.map((p, i) => [Pd + (i / (pts.length - 1)) * (W - 2 * Pd), hi === lo ? H / 2 : Pd + (1 - (p.v - lo) / (hi - lo)) * (H - 2 * Pd)]);
  return <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><polyline className="draw" points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke={P.blue} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /><circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="3" fill={P.blue} stroke={P.tile} strokeWidth="1.5" /></svg>;
}
