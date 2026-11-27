// Trends: one metric over 7, 30 or 90 nights, the others as small tiles, then habits and body age.
/* global bandHex, cap1, dur, isoToday, mean, P, shortDate, useMemo, useState, usual, wkDate */         // js/core.jsx
/* global Dur, Fresh, Lab, Seg, Tile, useCount */                                                       // js/ui.jsx
/* global biggest, findGaps, Trend, windowRows */                                                       // js/charts.jsx
/* global AffectsTile */                                                                                // js/journal.jsx
/* global BodyAge */                                                                                    // js/body-age.jsx
/* exported Trends */

const SPANS = [[7, '7 nights'], [30, '30 nights'], [90, '90 nights']];
const nf = (v) => Math.round(v).toLocaleString('en-GB');
const TM = [
  { k: 'recovery', name: 'Recovery', unit: '%', kind: 'bar', lo: 0, hi: 100, ticks: [34, 67], val: (d) => d.recovery, colourFn: (v) => bandHex(v), fmt: (v) => String(Math.round(v)), noun: 'morning' },
  { k: 'strain', name: 'Strain', unit: '', kind: 'bar', lo: 0, hi: 21, ticks: [7, 14], val: (d) => d.strain, colour: P.blue, fmt: (v) => v.toFixed(1), noun: 'day' },
  { k: 'sleep', name: 'Sleep', unit: '', kind: 'bar', lo: 0, ticks: [240, 480], tfmt: (v) => v / 60 + 'h', val: (d) => d.asleep || null, need: (d) => d.need, colour: P.sleep, fmt: dur, isDur: true, range: 'sleep', noun: 'night' },
  { k: 'rhr', name: 'Resting HR', long: 'resting heart rate', unit: 'bpm', kind: 'line', val: (d) => d.rhr || null, range: 'rhr', fmt: (v) => String(Math.round(v)), noun: 'morning', pad: 2, by: 5 },
  { k: 'hrv_ms', name: 'HRV', long: 'HRV', unit: 'ms', kind: 'line', val: (d) => d.hrv_ms || null, range: 'hrv', fmt: (v) => String(Math.round(v)), noun: 'morning', pad: 4, by: 10 },
  { k: 'steps', name: 'Steps', unit: '', kind: 'bar', lo: 0, val: (d) => (d.steps == null ? null : d.steps), colour: P.blue, fmt: nf, tfmt: (v) => v / 1000 + 'k', noun: 'day', gapLabel: 'No step count' },
  { k: 'weight', name: 'Weight', unit: 'kg', kind: 'line', val: (d) => (d._w == null ? null : d._w), colour: P.soft, fmt: (v) => String(Math.round(v * 10) / 10), noun: 'weigh-in', pad: 0.4, by: 1, loose: true },
];

function trendModel(m, rows, latestDay) {
  const s = rows.filter((d) => m.val(d) != null), vals = s.map(m.val), live = (d) => m.k === 'strain' && d.date === isoToday();
  const done = s.filter((d) => !live(d)), avg = done.length ? mean(done.map(m.val)) : null;
  const u = m.range && latestDay ? usual(latestDay.ranges[m.range]) : null;
  let lo = m.lo, hi = m.hi, ticks = m.ticks;
  if (vals.length && (lo == null || hi == null)) {
    if (m.kind === 'bar') { hi = Math.max(...vals) * 1.08 || 1; if (m.k === 'sleep') hi = Math.max(540, ...s.map((d) => Math.max(d.asleep, d.need || 0))) + 20; if (m.k === 'steps') ticks = [hi > 11000 ? 10000 : hi > 5500 ? 5000 : null].filter(Boolean); }
    else { const a = [...vals, ...(u || [])]; lo = Math.min(...a) - m.pad; hi = Math.max(...a) + m.pad;
      const t0 = Math.ceil((lo + (hi - lo) * 0.12) / m.by) * m.by, t1 = Math.floor((hi - (hi - lo) * 0.1) / m.by) * m.by; ticks = t0 < t1 ? [t0, t1] : [t0]; }
  }
  const half = Math.floor(s.length / 2), a1 = s.slice(0, half).map(m.val), a2 = s.slice(half).map(m.val), change = a1.length && a2.length ? mean(a2) - mean(a1) : null;
  return { s, vals, avg, u, lo, hi, ticks, change, last: s[s.length - 1], gap: m.loose ? null : biggest(findGaps(rows, m.val)) };
}

// One plain sentence per metric, worked out from the nights on screen.
function trendSay(m, T, rows) {
  const { s, vals, u, last } = T, n = s.length, N = (k) => `${k} ${m.noun}${k === 1 ? '' : 's'}`;
  if (!n) return null;
  const when = (d) => (d.date === isoToday() ? (m.noun === 'morning' ? 'This morning’s' : 'Today’s') : `${cap1(wkDate(d.date))}’s`);
  if (m.k === 'recovery') { const g = vals.filter((v) => v >= 67).length, a = vals.filter((v) => v >= 34 && v < 67).length, r = n - g - a, low = Math.min(...vals);
    return `Recovered on ${g} of the ${N(n)} scored, part recovered on ${a} and running low on ${r}.${n > 2 && last && m.val(last) === low ? ` ${when(last)} ${low}% is the lowest of them.` : ''}`; }
  if (m.range && m.kind === 'line') {
    if (!u) return `${cap1(N(n))} tracked, from ${m.fmt(Math.min(...vals))} to ${m.fmt(Math.max(...vals))} ${m.unit}. Your usual range appears once five nights are on file.`;
    const inside = vals.filter((v) => v >= u[0] && v <= u[1]).length, vd = m.val(last) < u[0] ? 'below' : m.val(last) > u[1] ? 'above' : 'inside';
    const i = s.length > 1 ? Math.round((Date.parse(last.date) - Date.parse(s[s.length - 2].date)) / 864e5) - 1 : 0;
    return `Your ${m.long} sat inside your usual range on ${inside} of the ${N(n)} tracked. ${when(last)} ${m.fmt(m.val(last))} is ${vd} it${i >= 3 ? `, the first reading after ${i} days with no overnight data` : ''}.`;
  }
  if (m.k === 'sleep') { const met = s.filter((d) => d.sleepPerf >= 1).length; return `You met your sleep need on ${met} of the ${N(n)} tracked.${u ? ` Your usual night is ${dur(u[0])} to ${dur(u[1])}.` : ''}`; }
  if (m.k === 'strain') { const top = s.reduce((a, d) => (d.strain > a.strain ? d : a)); return `${cap1(N(n))} scored. The hardest was ${top.strain.toFixed(1)} on ${wkDate(top.date)}.${last.date === isoToday() ? ` Today is ${last.strain.toFixed(1)} so far and is left out of the average.` : ''}`; }
  if (m.k === 'steps') { const top = s.reduce((a, d) => (d.steps > a.steps ? d : a)); return `Your most was ${nf(top.steps)} on ${wkDate(top.date)}.${last.date === isoToday() ? ` Today’s ${nf(last.steps)} is the day so far.` : ''}${n === rows.length ? ' Your phone counts steps, so this one has no gap.' : ''}`; }
  if (m.k === 'weight') { if (n < 2) return `One weigh-in in this range, ${m.fmt(vals[0])} kg on ${wkDate(s[0].date)}. Step on the scale again and the line starts.`;
    const d = Math.round((vals[n - 1] - vals[0]) * 100) / 100; return `${cap1(N(n))}: ${m.fmt(vals[0])} kg on ${shortDate(s[0].date)} to ${m.fmt(vals[n - 1])} kg on ${shortDate(last.date)}, ${d === 0 ? 'no change' : `${Math.abs(d)} kg ${d < 0 ? 'down' : 'up'}`}.`; }
  return null;
}
function trendShort(m, T) {
  const { s, vals, u, last } = T, n = s.length;
  if (!n) return m.k === 'hrv_ms' ? 'No HRV from Zepp in this range.' : m.k === 'weight' ? 'No weigh-ins in this range.' : 'No data in this range.';
  if (m.k === 'recovery') return `Recovered on ${vals.filter((v) => v >= 67).length} of ${n} scored mornings.`;
  if (m.range && m.kind === 'line') return u ? `Latest ${m.fmt(m.val(last))} is ${m.val(last) < u[0] ? 'below' : m.val(last) > u[1] ? 'above' : 'inside'} your usual ${m.fmt(u[0])} to ${m.fmt(u[1])}.` : `${n} mornings tracked.`;
  if (m.k === 'sleep') return u ? `Usual night ${dur(u[0])} to ${dur(u[1])}.` : `${n} nights tracked.`;
  if (m.k === 'strain') return `${n} ${n === 1 ? 'day' : 'days'} scored.`;
  if (m.k === 'steps') { const top = s.reduce((a, d) => (d.steps > a.steps ? d : a)); return `Most ${nf(top.steps)}, ${wkDate(top.date)}.`; }
  return `${n} ${n === 1 ? 'weigh-in' : 'weigh-ins'}.`;
}

function Trends({ all, latest, weights, mk, setMk, gym, journal }) {
  const [span, setSpan] = useState(30);
  const rows = useMemo(() => { const w = {}; weights.forEach((x) => { w[x.date] = x.w; }); return windowRows(all, all.length - 1, span).map((d) => ({ ...d, _w: w[d.date] })); }, [all, weights, span]);
  const m = TM.find((x) => x.k === mk) || TM[0], latestDay = all[latest], T = trendModel(m, rows, latestDay);
  const shownAvg = useCount(T.avg, 700), say = trendSay(m, T, rows);
  const pick = (k) => { setMk(k); window.scrollTo(0, 0); };
  const chart = (mm, TT, props) => <Trend rows={rows} val={mm.val} lo={TT.lo} hi={TT.hi} kind={mm.kind} colour={mm.colour || P.ink} colourFn={mm.colourFn} band={mm.kind === 'line' ? TT.u : null} need={mm.need} fmt={mm.fmt} tfmt={mm.tfmt}
    gapLabel={mm.gapLabel} hatch={!mm.loose} joinGap={mm.loose ? null : 3} aria={`${mm.name}, last ${rows.length} days`} {...props} />;
  return (
    <div className="page">
      <header className="top"><h1>Trends</h1><span className="wt" style={{ fontSize: 13 }}>{shortDate(rows[0].date)} to {shortDate(rows[rows.length - 1].date)}</span></header>
      <Seg items={SPANS} value={span} onChange={setSpan} label="Range" />
      <div className="chips" role="group" aria-label="Metric">
        {TM.map((x) => <button key={x.k} className="chip" aria-pressed={mk === x.k} onClick={() => setMk(x.k)}>{x.name}</button>)}
      </div>
      <div className="grid">
        <Fresh k={mk + span} className="t hero c6">
          {T.s.length ? (<>
            <div className="between end">
              <div><div className="lab"><span>{m.k === 'weight' ? `Average of ${T.s.length} ${T.s.length === 1 ? 'weigh-in' : 'weigh-ins'}` : `Average, ${T.s.length} ${m.noun}${T.s.length === 1 ? '' : 's'} tracked`}</span></div>
                <div className="num nh" style={{ marginTop: 10 }}>{T.avg == null ? '–' : m.isDur ? <Dur m={shownAvg || 0} /> : <>{m.fmt(shownAvg || 0)}{m.unit && <small>{m.unit}</small>}</>}</div></div>
              <div className="cap right" style={{ fontSize: 13, paddingBottom: 2 }}>{T.u && m.kind === 'line' ? <>Usual range<br /><b>{m.fmt(T.u[0])} to {m.fmt(T.u[1])} {m.unit}</b></> : T.change != null && T.s.length >= 4 ? <>Second half against first<br /><b>{(T.change > 0 ? '+' : T.change < 0 ? '−' : '') + (m.isDur ? dur(Math.abs(T.change)) : m.fmt(Math.abs(T.change)))}{m.isDur || !m.unit ? '' : ' ' + m.unit}</b></> : null}</div>
            </div>
            {say && <p className="say lead" style={{ margin: '14px 0' }}>{say}</p>}
            {chart(m, T, { w: 325, h: 172, ticks: T.ticks, bg: P.tile2, scrub: true, labelLast: m.kind === 'line' })}
            {m.need && <div className="leg"><span><i className="sw" style={{ background: P.sleep }} />Asleep</span><span><i className="sw" style={{ background: P.track, boxShadow: `inset 0 0 0 1px ${P.line2}` }} />What you needed that night</span></div>}
            {m.k === 'recovery' && <div className="leg"><span><i className="sw" style={{ background: P.green }} />Recovered</span><span><i className="sw" style={{ background: P.amber }} />Part recovered</span><span><i className="sw" style={{ background: P.red }} />Running low</span></div>}
          </>) : <><div className="lab"><span>{m.name}</span></div><p className="say" style={{ marginTop: 10 }}>{trendShort(m, T)}</p></>}
        </Fresh>
        {TM.filter((x) => x.k !== mk).map((x) => { const TT = trendModel(x, rows, latestDay); return (
          <Tile c={3} key={x.k} open={() => pick(x.k)} openLabel={`Show ${x.name}`}>
            <Lab go="">{x.name}</Lab>
            <div className="num n4" style={{ marginTop: 10 }}>{TT.avg == null ? '–' : x.isDur ? <Dur m={TT.avg} /> : <>{x.fmt(TT.avg)}{x.unit === '%' ? '%' : ''}<small>{x.unit && x.unit !== '%' ? x.unit + ' ' : ''}average</small></>}{x.isDur && TT.avg != null && <small>average</small>}</div>
            <div className="cap" style={{ margin: '6px 0 10px', minHeight: 36 }}>{trendShort(x, TT)}</div>
            {TT.s.length > 0 && chart(x, TT, { w: 146, h: 60, xlabels: false, labelLast: false })}
          </Tile>
        ); })}
      </div>
      <p className="foot" style={{ marginTop: 8 }}>Scores compare each night with your own last 30. They are this app’s own take on recovery and strain, not Whoop’s formulas.</p>
      <div className="sect"><h2>Habits</h2><span className="wt" style={{ fontSize: 13 }}>From your journal</span></div>
      <div className="grid"><AffectsTile entries={journal} all={all} /></div>
      <BodyAge all={all} gym={gym} />
    </div>
  );
}
