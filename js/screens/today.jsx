// Today: the three rings, Claude's morning call, and the tiles under them.
/* global api, bandHex, cap1, clock12, dayLabel, dOf, driverPoints, dur, hm, isoToday, mean, Nav */     // js/core.jsx
/* global P, planDays, shortDate, SLEEP_STAGES, status, stKg, stPlural, strainTarget, stWeekStart */    // js/core.jsx
/* global tonightPlan, useContext, useLayoutEffect, useRef, useState, warningLine, wkDate */            // js/core.jsx
/* global wkShort */                                                                                    // js/core.jsx
/* global clockParts, Dur, Fresh, Icon, Lab, Tile, Typed, useCount */                                   // js/ui.jsx
/* global col, consecutive, DriverBars, hrStrip, HrStrip, linePath, RecoveryScale, StageBar */          // js/charts.jsx
/* global StrainGauge, TonightLine, WakeControl, WeekDays, windowRows */                                // js/charts.jsx
/* global JournalTile */                                                                                // js/journal.jsx
/* global ChatEntry */                                                                                  // js/chat.jsx
/* exported Today */

// Claude's words arrive once, when the message does. After that they are just text.
function Call({ coach, isLatest, day, hasAsk }) {
  const [typing, setTyping] = useState(false), seen = useRef(null);
  useLayoutEffect(() => {
    if (!coach.message || seen.current === coach.message) return;
    seen.current = coach.message; setTyping(true);
    const t = setTimeout(() => setTyping(false), 2000); return () => clearTimeout(t);
  }, [coach.message]);
  const when = day.date === isoToday() ? 'this morning' : isLatest ? 'on ' + dayLabel(day.date) : null;
  return (
    <div className={'call' + (hasAsk ? ' has-ask' : '')} aria-live="polite">
      <Lab icon="sparkle">{when ? `Claude, ${when}` : 'Claude'}</Lab>
      {isLatest && coach.message ? <p className={typing ? 'typing' : ''}><Typed text={coach.body} /></p>
        : isLatest && coach.loading ? <div aria-label="Claude is writing the call"><div className="skel" /><div className="skel" /><div className="skel" style={{ width: '70%' }} /></div>
        : <p className="quiet">{isLatest && coach.error ? 'Claude’s call didn’t come through. Open the app again in a minute.' : 'Claude makes the call for your latest morning.'}</p>}
    </div>
  );
}

// The day at the top: three rings on the dark page, recovery largest. Colour stays in the ring, never a filled card.
function Ring3({ kind, label, frac, text, unit, colour, onOpen, aria }) {
  const R = 44, C = 2 * Math.PI * R, ARC = C * 0.78, f = frac == null ? 0 : Math.max(0, Math.min(1, frac));
  return (
    <button className={'r3 ' + kind} onClick={onOpen} aria-label={aria}>
      <span className="r3-o">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} className="tr" strokeDasharray={`${ARC} ${C}`} transform="rotate(129.6 50 50)" />
          {f > 0.004 && <circle cx="50" cy="50" r={R} className="va" stroke={colour} strokeDasharray={`${ARC * f} ${C}`} transform="rotate(129.6 50 50)" />}
        </svg>
        <b className="num">{text == null ? '–' : text}{text != null && unit ? <small>{unit}</small> : null}</b>
      </span>
      <span className="r3-l">{label}<Icon n="caret-right" /></span>
    </button>
  );
}

// Type the morning's HRV in from the Zepp app when it hasn't come through by itself. The real figure replaces it later.
function HrvEntry({ date }) {
  const [open, setOpen] = useState(false), [v, setV] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(null);
  const n = Number(v), ok = n >= 5 && n <= 250;
  async function save(e) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api('/api/health', { method: 'POST', body: JSON.stringify({ hrv: { date, ms: n } }) });
      if (!r.ok) throw new Error(r.error || 'not saved');
      window.dispatchEvent(new Event('ow-refresh'));
    } catch { setErr('That didn’t save. Try again.'); setBusy(false); }
  }
  if (!open) return <p className="hrv-add"><button type="button" onClick={() => setOpen(true)}>Type it in from Zepp</button></p>;
  return (
    <form className="hrv-form" onSubmit={save}>
      <label htmlFor="hrv-in">Last night’s HRV in Zepp</label>
      <div><input id="hrv-in" type="number" inputMode="numeric" min="5" max="250" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="42" /><span>ms</span>
        <button type="submit" disabled={!ok || busy}>{busy ? 'Saving' : 'Save'}</button></div>
      {err ? <p role="alert">{err}</p> : null}
    </form>
  );
}

function StateBand({ day, coach, isLatest, vt, ask }) {
  const nav = useContext(Nav), [word, hint] = status(day.recovery);
  const shown = useCount(day.recovery);
  const headline = isLatest && coach.message ? coach.title : cap1(hint);
  const sp = day.sleepPerf;
  return (
    <div className="lead3" style={vt ? { viewTransitionName: 'hero' } : undefined}>
      <div className="rings3">
        <Ring3 kind="side" label="Sleep" frac={sp} text={sp ? Math.round(Math.min(sp, 1.5) * 100) : null} unit="%" colour="var(--sleep)" onOpen={() => nav.open('sleep', 'sleep')}
          aria={sp ? `Sleep, ${Math.round(sp * 100)}% of what you needed. Open sleep` : 'Sleep, no reading. Open sleep'} />
        <Ring3 kind="main" label="Recovery" frac={day.recovery == null ? null : day.recovery / 100} text={day.recovery == null ? null : Math.round(shown || 0)} unit="%" colour={day.recovery == null ? 'var(--line2)' : bandHex(day.recovery)} onOpen={() => nav.open('recovery', 'band')}
          aria={day.recovery == null ? 'Recovery, not scored. Open recovery' : `Recovery ${day.recovery}%, ${word.toLowerCase()}. Open recovery`} />
        <Ring3 kind="side" label="Strain" frac={day.strain == null ? null : day.strain / 21} text={day.strain == null ? null : day.strain.toFixed(1)} colour="var(--strain)" onOpen={() => nav.open('strain', 'strain')}
          aria={day.strain == null ? 'Strain, no reading. Open strain' : `Strain ${day.strain.toFixed(1)} out of 21. Open strain`} />
      </div>
      <p className="r3-state">{day.recovery != null && <i style={{ background: bandHex(day.recovery) }} />}<b>{day.recovery == null ? (!day.hrv_ms && (day.sleep || day.rhr) ? 'Waiting for HRV from Zepp' : 'Not scored yet') : word}</b></p>
      {day.recovery == null && !day.hrv_ms && (day.sleep || day.rhr) ? <HrvEntry date={day.date} /> : null}
      <div className="lead-unit">
        <h2 className="lead-head">{headline}</h2>
        <Call coach={coach} isLatest={isLatest} day={day} hasAsk={!!ask} />
        {ask}
      </div>
    </div>
  );
}

function WhyTile({ day, vt }) {
  const nav = useContext(Nav), dp = driverPoints(day), warn = warningLine(day);
  return (
    <Tile open={() => nav.open('recovery', 'why')} openLabel="Open recovery" vt={vt}>
      <Lab go="">{dp ? `Every morning starts at ${dp.start}%. Today:` : 'What’s behind your recovery'}</Lab>
      {dp ? (<>
        <div style={{ marginTop: 12 }}><DriverBars dp={dp} day={day} /></div>
        <div style={{ marginTop: 10 }}><RecoveryScale value={day.recovery} normal={dp.normal} /></div>
      </>) : <p className="empty">A score needs last night’s HRV from Zepp and five nights of history. HRV usually arrives after you open Zepp and it syncs.</p>}
      {warn && <><div className="hr" /><div className="note"><Icon n="warning" /><span>{warn}</span></div></>}
      {dp && day.baseNights < 30 && !warn && <p className="cap" style={{ marginTop: 10 }}>Still learning your normal, {day.baseNights} of 30 nights so far.</p>}
    </Tile>
  );
}

function HeartTile({ all, idx, gym }) {
  const nav = useContext(Nav), day = all[idx], live = day.date === isoToday(), data = hrStrip(all, idx, gym);
  return (
    <Tile open={() => nav.open('strain', 'heart')} openLabel="Open strain and heart rate">
      <Lab go="">{live ? 'Heart rate, last 24 hours' : `Heart rate, ${wkDate(day.date)}`}</Lab>
      {data ? (<>
        <div style={{ marginTop: 10 }}><HrStrip data={data} /></div>
        <div className="stats">
          <div><b>{data.last.v}<small>bpm</small></b>{live ? `Latest, ${clock12(data.last.m)}` : `Last, ${clock12(data.last.m)}`}</div>
          <div><b>{data.low.v}<small>bpm</small></b>Lowest, {clock12(data.low.m)}</div>
          <div><b>{data.peak.v}<small>bpm</small></b>Peak, {data.peakInGym ? 'in the gym' : clock12(data.peak.m)}</div>
        </div>
      </>) : <p className="empty">{day.hr_max ? `No minute-by-minute heart rate for this day, only its totals. Peak ${day.hr_max} bpm.` : 'No heart rate from the watch for this day.'}</p>}
    </Tile>
  );
}

function SleepTile({ day, c }) {
  const nav = useContext(Nav), st = day.sleep, staged = st && SLEEP_STAGES.some((s) => st[s.k]);
  const short = st && day.need ? Math.round(day.need - st.asleep_min) : null;
  return (
    <Tile c={c} open={() => nav.open('sleep', 'sleep')} openLabel="Open sleep" vt={nav.vt === 'sleep'}>
      <Lab go="">Sleep</Lab>
      {st ? (<>
        <div className="num n3" style={{ marginTop: 12 }}><Dur m={st.asleep_min} /></div>
        <div className="cap" style={{ margin: '6px 0 12px' }}>of {hm(day.need)} needed, <b>{short > 0 ? `${dur(short)} short` : 'need met'}</b></div>
        <StageBar st={st} need={day.need} w={c === 6 ? 333 : 208} h={10} />
        {staged ? <div className="stg">{SLEEP_STAGES.map((s) => <React.Fragment key={s.k}><span><i className="sw" style={{ background: s.colour }} />{s.name}</span><b>{dur(st[s.k])}</b></React.Fragment>)}</div>
          : <p className="cap" style={{ marginTop: 10 }}>{day.sleep_score ? <>Zepp sleep score <b>{day.sleep_score}</b>. </> : null}Zepp doesn’t share sleep stages.</p>}
      </>) : <p className="empty">No sleep recorded for this night.</p>}
    </Tile>
  );
}

function TonightTile({ plan, onWake }) {
  const nav = useContext(Nav), [t, ap] = clockParts(plan.bed);
  return (
    <Tile c={2} className="narrow" open={() => nav.open('sleep', 'tonight')} openLabel="Open sleep and tonight’s bedtime">
      <Lab icon="moon">Tonight</Lab>
      <div className="cap" style={{ marginTop: 14 }}>In bed by</div>
      <div className="num n3s" style={{ marginTop: 3 }}>{t}<small style={{ color: P.ink, marginLeft: 1 }}>{ap}</small></div>
      <div style={{ marginTop: 14 }}><TonightLine plan={plan} w={91} mini /></div>
      <div className="cap" style={{ marginTop: 6 }}>{dur(plan.inBed)} in bed</div>
      <WakeControl plan={plan} onWake={onWake} mini />
    </Tile>
  );
}

function StrainTile({ all, idx, showTarget }) {
  const nav = useContext(Nav), day = all[idx], live = day.date === isoToday(), tg = showTarget ? strainTarget(all, idx) : null;
  const y = idx > 0 && consecutive(all[idx - 1], day) && all[idx - 1].strain != null ? { v: all[idx - 1].strain, label: wkShort(all[idx - 1].date) } : null;
  return (
    <Tile c={2} r2 className="narrow flexcol" open={() => nav.open('strain', 'strain')} openLabel="Open strain" vt={nav.vt === 'strain'}>
      <Lab go="">Strain</Lab>
      <div className="num n3" style={{ marginTop: 12 }}>{day.strain == null ? '–' : day.strain.toFixed(1)}</div>
      <div className="cap" style={{ margin: '6px 0 12px' }}>{day.strain == null ? 'no heart rate' : live ? 'so far today' : 'for the day'}</div>
      <div style={{ marginTop: 'auto' }}><StrainGauge strain={day.strain} tg={tg} yesterday={y} /></div>
    </Tile>
  );
}

function TrainingTile({ gym }) {
  const nav = useContext(Nav), sessions = (gym && gym.sessions) || [], ws = stWeekStart(isoToday());
  const wk = sessions.filter((s) => stWeekStart(s.date) === ws), vol = wk.reduce((a, s) => a + (s.volume || 0), 0), plan = planDays(gym);
  return (
    <Tile c={4} open={() => nav.tab('strength')} openLabel="Open strength">
      <Lab go="">Training this week</Lab>
      {sessions.length ? (
        <div className="between end" style={{ marginTop: 10 }}>
          <div><div className="num n4">{stKg(vol)}<small>kg</small></div><div className="cap" style={{ marginTop: 5, whiteSpace: 'nowrap' }}>{plan ? `${wk.length} of ${plan} sessions` : stPlural(wk.length, 'session')}</div></div>
          <div style={{ width: 104, flex: 'none' }}><WeekDays sessions={wk} weekStart={ws} w={104} h={92} /></div>
        </div>
      ) : <p className="empty">{gym && gym.connected ? 'Connected. No workouts logged in your gym app yet.' : 'Turn on online backup in your gym app and your sessions show here.'}</p>}
    </Tile>
  );
}

function WeightTile({ day, weights, all, gym }) {
  const nav = useContext(Nav), upto = weights.filter((x) => x.date <= day.date), latest = upto[upto.length - 1];
  const recent = latest && Date.parse(day.date) - Date.parse(latest.date) < 14 * 864e5 ? latest : null;
  const goal = gym && gym.goal && gym.goal.targetWeight ? Number(gym.goal.targetWeight) : null;
  const fat = all.filter((d) => d.date <= day.date && d.body_fat_pct && Date.parse(day.date) - Date.parse(d.date) < 14 * 864e5).pop();
  const pts = recent ? upto.filter((x) => Date.parse(day.date) - Date.parse(x.date) < 30 * 864e5).slice(-8) : [];
  const prevW = pts.length > 1 ? pts[pts.length - 2] : null, diff = prevW ? Math.round((recent.w - prevW.w) * 100) / 100 : null;
  const W = 104, H = 62, vs = pts.map((p) => p.w), lo = Math.min(...vs), hi = Math.max(...vs), t0 = pts.length ? Date.parse(pts[0].date) : 0, t1 = pts.length ? Date.parse(pts[pts.length - 1].date) : 1;
  const X = (p) => 6 + (t1 === t0 ? 0.5 : (Date.parse(p.date) - t0) / (t1 - t0)) * (W - 14), Y = (v) => (hi === lo ? 26 : 8 + (1 - (v - lo) / (hi - lo)) * 34);
  return (
    <Tile c={4} open={() => nav.tab('trends', 'weight')} openLabel="Open weight in trends">
      <Lab go="">Weight</Lab>
      {recent ? (
        <div className="between end" style={{ marginTop: 10 }}>
          <div>
            <div className="num n4">{recent.w}<small>kg</small></div>
            <div className="cap" style={{ marginTop: 5 }}>{diff ? `${Math.abs(diff)} kg ${diff < 0 ? 'down' : 'up'} since ${wkShort(prevW.date)} ${dOf(prevW.date).getDate()}` : recent.date === day.date ? 'Weighed this morning' : `Weighed ${shortDate(recent.date)}`}</div>
            <div className="cap">{fat ? <>Body fat <b>{fat.body_fat_pct}%</b></> : `7-day average ${recent.avg} kg`}{goal ? `, ${Math.round((recent.avg - goal) * 10) / 10} kg to go` : ''}</div>
          </div>
          {pts.length > 1 && <svg style={{ width: W, flex: 'none' }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight, last ${pts.length} weigh-ins: ${pts[0].w} kg on ${shortDate(pts[0].date)} to ${recent.w} kg`}>
            <path className="draw" d={linePath(pts.map((p, i) => [X(p), Y(p.w), i]))} fill="none" stroke={P.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {pts.slice(0, -1).map((p) => <circle key={p.date} cx={X(p)} cy={Y(p.w)} r="2.5" fill={P.muted} />)}
            <circle cx={X(recent)} cy={Y(recent.w)} r="4.5" fill={P.ink} stroke={P.tile} strokeWidth="2" />
            <text x="2" y={H - 2}>{shortDate(pts[0].date)}</text><text x={W} y={H - 2} textAnchor="end" className="m">{recent.date === isoToday() ? 'Today' : shortDate(recent.date)}</text>
          </svg>}
        </div>
      ) : <p className="empty">No weigh-in in the last two weeks. Step on the scale and it shows here.</p>}
    </Tile>
  );
}

function StepsTile({ all, idx }) {
  const nav = useContext(Nav), day = all[idx], live = day.date === isoToday(), rows = windowRows(all, idx, 7);
  const before = rows.slice(0, -1).map((d) => d.steps).filter((x) => x != null), avg = before.length ? Math.round(mean(before)) : null;
  const max = Math.max(1, ...rows.map((d) => d.steps || 0)), W = 150, H = 54, slot = W / rows.length;
  return (
    <Tile open={() => nav.tab('trends', 'steps')} openLabel="Open steps in trends">
      <Lab go="">Steps</Lab>
      <div className="between end" style={{ marginTop: 10 }}>
        <div><div className="num n4">{day.steps == null ? '–' : Math.round(day.steps).toLocaleString('en-GB')}</div>
          <div className="cap" style={{ marginTop: 5 }}>{live ? 'so far today' : 'for the day'}{avg != null ? `, ${avg.toLocaleString('en-GB')} a day over the ${before.length === 6 ? 'six' : before.length} days before` : ''}</div></div>
        <svg style={{ width: W, flex: 'none' }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Steps, last seven days">
          <path d={`M0 ${H - 15.5}H${W}`} stroke={P.line2} />
          {rows.map((d, i) => { const cx = slot * (i + 0.5), base = H - 16, y = base - ((d.steps || 0) / max) * (base - 2), lastOne = i === rows.length - 1; return (
            <g key={d.date}>{d.steps > 0 && (base - y < 1.5 ? <rect x={cx - 6} y={base - 1.5} width="12" height="1.5" fill={P.blue} /> : <path className="grow" style={{ '--d': `${i * 30}ms` }} d={col(cx, y, base, 12, 4)} fill={P.blue} opacity={lastOne ? 1 : 0.45} />)}
              <text x={cx} y={H - 2} textAnchor="middle" className={lastOne ? 'v' : ''}>{wkShort(d.date)[0]}</text></g>
          ); })}
        </svg>
      </div>
    </Tile>
  );
}

function Today({ all, idx, gym, weights, coach, isLatest, watchLast, onLatest, latestLabel, wake, saveWake, dx, journal, onJournal }) {
  const nav = useContext(Nav), day = all[idx];
  // A morning with nothing from the watch yet: say so plainly instead of showing empty charts.
  if (day.recovery == null && !day.sleep && !day.rhr) return (
    <div className="grid">
      <Tile hero>
        <Lab icon="watch">Nothing from the watch</Lab>
        <h2 className="band-head" style={{ marginTop: 14 }}>No data for this morning yet</h2>
        <p className="say" style={{ marginTop: 10 }}>{watchLast ? `Your watch last sent data on ${dOf(watchLast.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. ` : ''}Charge it, wear it to bed, and the morning Shortcut sends last night in when your alarm goes off.</p>
        {latestLabel && <button className="btn above" style={{ marginTop: 18 }} onClick={onLatest}>See your last scored morning ({latestLabel})</button>}
      </Tile>
      <JournalTile key={day.date} day={day} entries={journal} onSaved={onJournal} />
    </div>
  );
  const plan = isLatest ? tonightPlan(all, idx, wake) : null;
  return (
    <>
    <div className="grid"><StateBand day={day} coach={coach} isLatest={isLatest} vt={nav.vt === 'band'}
      ask={isLatest && day.recovery != null ? <ChatEntry key={day.date} all={all} idx={idx} gym={gym} weights={weights} wake={wake} /> : null} /></div>
    <Fresh k={day.date} key={day.date} className="grid day" style={{ '--dx': dx, marginTop: 8 }}>
      <WhyTile day={day} vt={nav.vt === 'why'} />
      <HeartTile all={all} idx={idx} gym={gym} />
      <SleepTile day={day} c={plan ? 4 : 6} />
      {plan && <TonightTile plan={plan} onWake={saveWake} />}
      <StrainTile all={all} idx={idx} showTarget={isLatest || idx === all.length - 1} />
      <TrainingTile gym={gym} />
      <WeightTile day={day} weights={weights} all={all} gym={gym} />
      <StepsTile all={all} idx={idx} />
      <JournalTile day={day} entries={journal} onSaved={onJournal} />
    </Fresh>
    </>
  );
}
