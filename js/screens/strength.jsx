// Strength: the gym app's log as weeks, lifts and personal bests. The maths is in lib/strength.js.
/* global clamp, clock12, dOf, dur, isoToday, londonMin, P, planDays, sessionHr, shortDate */           // js/core.jsx
/* global ST_DAY, ST_KIND, stChange, stDate, stIso, stKg, stPlural, strainSentence, strainTarget */     // js/core.jsx
/* global strainYardstick, strengthLifts, strengthWeeks, stSummary, stT, stTopText, stWeekStart */      // js/core.jsx
/* global useMemo, useState, wkDate, wkShort */                                                         // js/core.jsx
/* global Fresh, Icon, Lab, Seg, Tile, useCount */                                                      // js/ui.jsx
/* global GROUP_COLOURS, muscleSplit, SessionChart, Spark, SplitBar, WeekDays, WeeksChart */            // js/charts.jsx
/* exported Strength */

const ST_SPANS = [[12, '12 weeks'], [26, '6 months'], [52, '1 year']];

function Lift({ lift, share, lone, latest }) {
  const k = ST_KIND[lift.kind], p = lift.pts, v = p.length ? p[p.length - 1].v : null, ch = stChange(lift), stale = stT(latest) - stT(lift.last.date) > 10 * ST_DAY;
  return (
    <li className="lift">
      <span className="nm">{lift.name}</span>
      <span className="st">{lift.kind === 'volume' ? stPlural(lift.last.sets, 'set') : stTopText(lift.last)}{stale ? `, last done ${stDate(lift.last.date)}` : ''}</span>
      {p.length >= 3 && <Spark pts={p} />}
      <span className="kg">{v == null ? '–' : k.fmt(v)}{v != null && <small>{k.unit}</small>}{lift.kind !== 'volume' && <em>{k.label}</em>}</span>
      {share != null && <span className="bar stretch" style={{ width: `${clamp(share, 0.02, 1) * 100}%` }} aria-hidden="true" />}
      {lift.isBest ? <span className="chg"><Icon n="arrow-up" /><span><b>Your best yet.</b> {ch.text}</span></span> : ch ? <span className="chg"><Icon n={ch.icon} /><span>{ch.text}</span></span> : !lone && share == null ? <span className="chg">First time logged</span> : null}
    </li>
  );
}

function Strength({ gym, all, latest }) {
  const [span, setSpan] = useState(12), [dayName, setDayName] = useState('all'), [open, setOpen] = useState(false);
  const sessions = (gym && gym.sessions) || [];
  const weeks = useMemo(() => strengthWeeks(sessions, isoToday()), [gym]);
  const lifts = useMemo(() => strengthLifts(sessions), [gym]);
  const cur = weeks[weeks.length - 1], kgNow = useCount(cur ? cur.volume : null, 700);
  const prog = gym && gym.programme && gym.programme.name ? `${gym.programme.name}${gym.programme.week ? `, week ${gym.programme.week}` : ''}` : null;
  const head = <><header className="top"><h1>Strength</h1><span className="wt" style={{ fontSize: 13 }}>Read from your gym app</span></header>{prog && <p className="sub"><span>{prog}</span></p>}</>;
  if (!sessions.length) return (
    <div className="page">{head}
      <div className="grid"><Tile hero><Lab icon="barbell">Nothing logged yet</Lab><p className="say" style={{ marginTop: 10 }}>{gym && gym.connected ? 'Connected. Log a workout in your gym app and your weekly volume, top sets and bests build up here.' : 'Turn on online backup in your gym app and your lifting shows here.'}</p></Tile></div>
    </div>
  );

  const lastS = sessions[sessions.length - 1], lone = sessions.length === 1, ws = stWeekStart(isoToday()), wk = sessions.filter((s) => stWeekStart(s.date) === ws);
  const days = []; sessions.forEach((s) => { if (!days.includes(s.name)) days.push(s.name); });
  const noDetail = lifts.every((l) => l.kind === 'volume');                    // gym link hasn't sent top sets yet
  const list = lifts.filter((l) => dayName === 'all' || l.days.includes(dayName)), ordered = noDetail ? list.slice().sort((a, b) => (b.last.volume || 0) - (a.last.volume || 0)) : list;
  const maxVol = Math.max(1, ...list.map((l) => l.last.volume || 0)), LIMIT = 8, rows = open ? ordered : ordered.slice(0, LIMIT);
  const mins = lastS.start && lastS.end ? Math.round((lastS.end - lastS.start) / 60e3) : null;
  const lastDay = all.find((d) => d.date === lastS.date), hr = sessionHr(lastS, lastDay), groups = muscleSplit(lastS), plan = planDays(gym);
  const since = stT(isoToday()) - 28 * ST_DAY, bests = lifts.flatMap((l) => l.bests).sort((a, b) => b.date.localeCompare(a.date));
  const fresh = bests.filter((b) => stT(b.date) >= since).filter((b, i, a) => a.findIndex((x) => x.name === b.name) === i).slice(0, 6);
  const topS = sessions.reduce((a, s) => (s.volume > a.volume ? s : a), sessions[0]), topW = weeks.reduce((a, w) => (w.volume > a.volume ? w : a), weeks[0]);
  // What a session would do to today's strain, from the same target and yardstick the Strain screen uses.
  const day = all[latest], tg = day && day.date === isoToday() ? strainTarget(all, latest) : null, yard = tg ? strainYardstick(all, latest, gym) : null;
  const trained = sessions.some((s) => s.date === isoToday());
  const wkEnd = stIso(stT(ws) + 6 * ST_DAY);

  return (
    <Fresh k="strength" className="page">
      {head}
      {weeks.length > 12 && <Seg items={ST_SPANS.filter((_, i) => i === 0 || weeks.length > ST_SPANS[i - 1][0])} value={span} onChange={setSpan} label="Range" />}
      <div className="grid">
        <Tile hero>
          <Lab right={`${wkShort(ws)} ${dOf(ws).getDate()} to ${wkShort(wkEnd)} ${shortDate(wkEnd)}`}>Moved this week</Lab>
          <div className="between end" style={{ marginTop: 14 }}>
            <div className="num nh">{stKg(kgNow || 0)}<small style={{ marginLeft: 4 }}>kg</small></div>
            <div className="cap right" style={{ fontSize: 13, paddingBottom: 2 }}><b>{plan ? `${cur.count} of ${plan}` : cur.count}</b> {cur.count === 1 && !plan ? 'session' : 'sessions'}<br />{stPlural(cur.sets, 'set')}</div>
          </div>
          <div style={{ marginTop: 22 }}>{weeks.length < 2 ? <WeekDays sessions={wk} weekStart={ws} big w={325} /> : <WeeksChart key={span} weeks={weeks} span={span} w={325} />}</div>
          <div className="hr" />
          <p className="cap">{stSummary(weeks)}</p>
        </Tile>

        {tg && tg.lo != null && day.strain != null && <Tile>
          <Lab icon="crosshair-simple">Next session</Lab>
          <p className="say" style={{ marginTop: 10 }}><b>Recovery is {day.recovery}% and today’s strain range is {tg.lo} to {tg.hi}.</b> {strainSentence({ strain: day.strain, lo: tg.lo, hi: tg.hi, live: true, yard, trained })}</p>
        </Tile>}

        <Tile>
          <Lab right={wkDate(lastS.date)}>{lastS.name}</Lab>
          <div className="stats">
            {mins ? <div><b>{dur(mins)}</b>{clock12(londonMin(lastS.start))} start</div> : null}
            <div><b>{lastS.sets}</b>sets, {stPlural((lastS.exercises || []).length, 'exercise')}</div>
            {hr ? <div><b>{hr.strain}</b>session strain</div> : <div><b>{stKg(lastS.volume)}<small>kg</small></b>moved</div>}
          </div>
          {hr ? <div style={{ marginTop: 14 }}><SessionChart hr={hr} day={lastDay} /></div> : <p className="cap" style={{ marginTop: 10 }}>No heart rate from the watch during this session.</p>}
        </Tile>

        {groups.length > 0 && <Tile>
          <Lab right={lone ? null : wkDate(lastS.date)}>Where the work went</Lab>
          <div style={{ marginTop: 12 }}><SplitBar groups={groups} /></div>
          <div className="leg">{groups.map(([n, v], i) => <span key={n}><i className="sw" style={{ background: GROUP_COLOURS[i] }} />{n} <b>{stKg(v)} kg</b></span>)}</div>
          <p className="cap" style={{ marginTop: 8 }}>Grouped by exercise name, as the gym app does not tag muscles.</p>
        </Tile>}

        <Tile>
          <Lab right={noDetail ? 'Most kg moved first' : lone ? wkDate(lastS.date) : 'Latest top set, est. 1RM'}>{lone ? 'What you lifted' : 'Lifts'}</Lab>
          {days.length > 1 && <div className="chips inset" role="group" aria-label="Training day">
            {[['all', 'All'], ...days.map((d) => [d, d])].map(([v, l]) => <button key={v} className="chip" aria-pressed={dayName === v} onClick={() => { setDayName(v); setOpen(false); }}>{l}</button>)}
          </div>}
          <ul style={{ listStyle: 'none', marginTop: 6 }} key={dayName}>{rows.map((l) => <Lift key={l.name} lift={l} lone={lone} latest={lastS.date} share={noDetail ? (l.last.volume || 0) / maxVol : null} />)}</ul>
          {ordered.length > LIMIT && !open && <button className="more" onClick={() => setOpen(true)}>Show all {ordered.length} lifts<Icon n="caret-down" /></button>}
        </Tile>

        {lone ? (<>
          <Tile c={3}><Lab>Bests</Lab><div className="num n3" style={{ marginTop: 12, color: P.faint }}>0</div><p className="empty">One session in, so every lift above is a starting mark. A best needs something to beat.</p></Tile>
          <Tile c={3}><Lab>Top set and est. 1RM</Lab><div className="num n3" style={{ marginTop: 12, color: noDetail ? P.faint : P.ink }}>{noDetail ? 'Not yet' : 'On'}</div><p className="empty">{noDetail ? 'The gym link sends sets and kg moved for now. These join each lift once it passes set detail through.' : 'Each lift above shows its top set and estimated one-rep max.'}</p></Tile>
        </>) : (
          <Tile>
            <Lab right="Last 4 weeks">Personal bests</Lab>
            {fresh.length ? <ul style={{ listStyle: 'none', marginTop: 6 }}>{fresh.map((b) => { const k = ST_KIND[b.kind]; return (
              <li className="lift" key={b.name + b.date}><span className="nm">{b.name}</span><span className="st">{stDate(b.date)}, {stTopText(b.e)}, beat {k.fmt(b.was)} {k.unit}</span><span className="kg">{k.fmt(b.v)}<small>{k.unit}</small><em>{k.label}</em></span></li>
            ); })}</ul> : <p className="empty">{noDetail ? 'Bests per lift need top sets from the gym link.' : bests.length ? `No new bests in the last four weeks. Your last was ${bests[0].name} on ${stDate(bests[0].date)}.` : 'No bests yet. Repeat a lift and beat your starting mark to set one.'}</p>}
            <dl className="sum" style={{ marginTop: 12 }}>
              <div><dt>Heaviest session<small>{topS.name}, {stDate(topS.date)}</small></dt><dd>{stKg(topS.volume)} kg</dd></div>
              {weeks.length > 1 && <div><dt>Biggest week<small>Week of {stDate(topW.start)}</small></dt><dd>{stKg(topW.volume)} kg</dd></div>}
            </dl>
          </Tile>
        )}
      </div>
      <p className="foot" style={{ marginTop: 8 }}>Read from your gym app, never written to. Estimated 1RM uses the Epley formula on sets of 1 to 12 reps.</p>
    </Fresh>
  );
}
