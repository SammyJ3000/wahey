// Strain, pushed over Today: the heart rate day, its sessions, and today against its target range.
/* global clock12, dur, isoToday, londonMin, Nav, P, sessionHr, stKg, strainSentence */                 // js/core.jsx
/* global strainTarget, strainYardstick, useContext, wkDate, wkShort */                                 // js/core.jsx
/* global Detail, Icon, Lab, Tile */                                                                    // js/ui.jsx
/* global bucketCounts, consecutive, DayHr, hrThreshold, SessionChart, StrainRuler, Trend */            // js/charts.jsx
/* global windowRows, ZoneBars */                                                                       // js/charts.jsx
/* exported StrainScreen */

const daySessions = (gym, day) => ((gym && gym.sessions) || []).filter((s) => s.date === day.date).map((s) => ({ s, hr: sessionHr(s, day) }));

function SessionBlock({ s, hr, day }) {
  const nav = useContext(Nav);
  return (
    <div>
      <div className="hr" />
      <div className="between"><b style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</b><span className="wt">{hr ? `${clock12(hr.a)} to ${clock12(hr.b)}, ${dur(hr.minutes)}` : wkDate(s.date)}</span></div>
      {hr && <div style={{ marginTop: 14 }}><SessionChart hr={hr} day={day} /></div>}
      <div className="stats">
        {hr && <div><b>{hr.strain}</b>Session strain</div>}
        {hr && <div><b>{hr.avg}<small>bpm</small></b>Average</div>}
        {hr && <div><b>{hr.max}<small>bpm</small></b>Peak</div>}
        <div><b>{s.sets}</b>Sets</div>
        <div><b>{stKg(s.volume)}<small>kg</small></b>Moved</div>
        <div><b>{(s.exercises || []).length}</b>Exercises</div>
      </div>
      {!hr && <p className="cap" style={{ marginTop: 10 }}>No heart rate from the watch during this session.</p>}
      <button className="link" onClick={() => nav.tab('strength')}>Open the session in Strength<Icon n="caret-right" /></button>
    </div>
  );
}

function StrainScreen({ all, idx, gym, showTarget }) {
  const day = all[idx], live = day.date === isoToday(), strain = day.strain, tg = showTarget ? strainTarget(all, idx) : null, has = tg && tg.lo != null;
  const prev = idx > 0 && consecutive(all[idx - 1], day) ? all[idx - 1] : null;
  const yard = strainYardstick(all, idx, gym), trained = !!(gym && gym.sessions && gym.sessions.some((s) => s.date === day.date));
  const state = strain == null ? 'No heart rate' : !has ? (live ? 'So far today' : 'For the day') : strain === 0 ? 'Nothing yet' : strain < tg.lo ? 'Below the range' : strain > tg.hi ? 'Over the range' : 'In range';
  const lastM = day.hr_min && day.hr_min.length ? day.hr_min[day.hr_min.length - 2] : null, th = hrThreshold(day);
  const marks = []; if (tg && !tg.learning) marks.push({ label: 'Usual day', v: Math.round(tg.usualDay * 10) / 10 }); if (prev && prev.strain != null) marks.push({ label: wkShort(prev.date), v: prev.strain });
  const counted = (d) => (d.hr_buckets || []).reduce((a, m, i) => a + (bucketCounts(i, d) ? m : 0), 0), onFor = (d) => (d.hr_buckets || []).reduce((a, b) => a + b, 0);
  const explain = strain >= 1 && day.hr_buckets ? day : prev && prev.strain >= 1 && prev.hr_buckets ? prev : null;
  const rows = windowRows(all, idx, 45), scored = rows.filter((d) => d.strain != null), firstMin = (d) => (d.hr_min && d.hr_min.length ? d.hr_min[0] : null);
  const DayBlock = ({ d, isLive }) => { const ss = daySessions(gym, d), late = firstMin(d) > 60; return (<>
    {d.hr_min && d.hr_min.length > 5 ? <div style={{ marginTop: 14 }}><DayHr day={d} live={isLive} sessions={ss.filter((x) => x.s.start && x.s.end).map((x) => ({ a: londonMin(x.s.start), b: londonMin(x.s.end), name: x.s.name }))} /></div>
      : <p className="empty">{d.hr_buckets ? 'This day has heart rate totals but no minute-by-minute line.' : 'No heart rate from the watch for this day.'}</p>}
    {late && <p className="cap" style={{ marginTop: 10 }}>The watch went on at {clock12(firstMin(d))}, so the hours before are missing and the real figure may be higher.</p>}
    {ss.map((x) => <SessionBlock key={x.s.name + x.s.date} s={x.s} hr={x.hr} day={d} />)}
  </>); };
  return (
    <Detail title="Strain" day={day}>
      <Tile hero vt>
        <div className="between end">
          <div className="num n1">{strain == null ? '–' : strain.toFixed(1)}</div>
          <div className="right" style={{ paddingBottom: 4 }}><div className="state" style={{ justifyContent: 'flex-end' }}>{state}</div><div className="cap" style={{ marginTop: 4, fontSize: 13 }}>Out of 21{live && lastM != null ? `, as of ${clock12(lastM)}` : ''}</div></div>
        </div>
        <div style={{ marginTop: 22 }}><StrainRuler strain={strain} tg={tg} marks={marks} w={325} /></div>
        {has ? <p className="say lead" style={{ marginTop: 10 }}>At {day.recovery}% recovery, aim for {tg.why.charAt(0).toLowerCase() + tg.why.slice(1)}{tg.learning ? ' (still learning what your usual day is)' : ''}. {strain != null ? strainSentence({ strain, lo: tg.lo, hi: tg.hi, live, yard, trained }) : ''}</p>
          : showTarget ? <p className="say" style={{ marginTop: 10 }}>No target {live ? 'today' : 'for this day'}. Recovery couldn’t be scored this morning, and the target is set from it.</p> : null}
      </Tile>

      <Tile>
        <Lab right={day.hr_max ? `Peak ${day.hr_max} bpm` : null}>{live ? 'Heart rate today' : `Heart rate, ${wkDate(day.date)}`}</Lab>
        {strain != null && <p className="say" style={{ marginTop: 10 }}>Only minutes above about <b>{th} bpm</b> add strain. {counted(day) < 1 ? <>{live ? 'You have' : 'You'} peaked at <b>{day.hr_max}</b>, which is why {live ? 'today still reads' : 'the day read'} zero.</> : <><b>{dur(counted(day))}</b> {live ? 'so far' : 'of the day'} {counted(day) < 1.5 ? 'was' : 'were'} above it.</>}</p>}
        <DayBlock d={day} isLive={live} />
      </Tile>

      {prev && prev.strain != null && <Tile>
        <div className="between end"><div><Lab>{live ? 'Yesterday' : 'The day before'}</Lab><div className="cap" style={{ marginTop: 3 }}>{wkDate(prev.date)}, the day behind this morning’s score</div></div><div className="num n2">{prev.strain.toFixed(1)}</div></div>
        <DayBlock d={prev} isLive={false} />
      </Tile>}

      {explain && <Tile>
        <Lab>Where the {explain.strain.toFixed(1)} came from</Lab>
        <p className="say" style={{ marginTop: 10 }}><b>{dur(counted(explain))}</b> of the {dur(onFor(explain))} the watch was on {explain === day ? (live ? 'today' : 'that day') : live ? 'yesterday' : 'the day before'} were hard enough to count. Minutes at each heart rate:</p>
        <div style={{ marginTop: 12 }}><ZoneBars day={explain} /></div>
      </Tile>}

      <Tile>
        <Lab>Strain, last {rows.length} days</Lab>
        {scored.length ? (<>
          <div style={{ marginTop: 12 }}><Trend rows={rows} val={(d) => d.strain} lo={0} hi={21} kind="bar" colour={P.blue} ticks={[7, 14]} fmt={(v) => v.toFixed(1)} tfmt={(v) => String(v)} h={124} scrub refLine={tg && !tg.learning ? { v: tg.usualDay, label: `Usual day ${tg.usualDay.toFixed(1)}` } : null} aria={`Strain, last ${rows.length} days`} /></div>
          <p className="cap" style={{ marginTop: 8 }}>{tg && !tg.learning ? <>Your usual day is <b>{tg.usualDay.toFixed(1)}</b>, the middle of your full-wear days in the last 60. </> : tg ? `Still learning your usual day: ${tg.days} of 7 full days on file. ` : ''}{scored.length} of the last {rows.length} days have a strain score. Hatched stretches are days the watch recorded no heart rate.</p>
        </>) : <p className="empty">No strain scored in the last {rows.length} days.</p>}
      </Tile>
    </Detail>
  );
}
