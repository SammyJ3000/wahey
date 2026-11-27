// Sleep, pushed over Today: last night in stages, and tonight's bedtime.
/* global clock, dur, hm, isoToday, mean, P, shortDate, SLEEP_STAGES, stPlural, tonightPlan */          // js/core.jsx
/* global usual, verdict */                                                                             // js/core.jsx
/* global clockParts, Detail, Dur, Lab, Tile */                                                         // js/ui.jsx
/* global nightHr, NightHr, Ruler, StageBar, TonightLine, Trend, WakeControl, windowRows */             // js/charts.jsx
/* exported SleepScreen */

function TonightBlock({ plan, onWake }) {
  const [t, ap] = clockParts(plan.bed);
  const rows = [
    ['Your base need', dur(plan.base), null],
    ['Today’s strain', plan.forStrain ? `+${dur(plan.forStrain)}` : '+0m', plan.forStrain ? `${plan.strain} so far` : `${plan.strain} so far, nothing to add yet`],
    ['Sleep you’re short', plan.forDebt ? `+${dur(plan.forDebt)}` : '+0m', plan.forDebt ? `${dur(plan.short)} down ${plan.nights === 1 ? 'last night' : `over the last ${plan.nights} nights`}, paid back a third at a time` : 'You’re not short'],
    ['Falling asleep and waking', `+${dur(plan.awake)}`, null],
  ];
  return (
    <Tile>
      <Lab icon="moon" right="To wake up recovered">Tonight</Lab>
      <div className="between end" style={{ marginTop: 12 }}>
        <div><div className="cap">In bed by</div><div className="num n2" style={{ marginTop: 4 }}>{t}<small style={{ color: P.ink, fontSize: 17 }}>{ap}</small></div></div>
        <WakeControl plan={plan} onWake={onWake} />
      </div>
      <div style={{ margin: '16px 0 8px' }}><TonightLine plan={plan} /></div>
      <dl className="sum">
        {rows.map(([k, v, why]) => <div key={k}><dt>{k}{why && <small>{why}</small>}</dt><dd>{v}</dd></div>)}
        <div className="tot"><dt>Time in bed</dt><dd>{dur(plan.inBed)}</dd></div>
      </dl>
    </Tile>
  );
}

function SleepScreen({ all, idx, isLatest, wake, saveWake }) {
  const day = all[idx], st = day.sleep, staged = st && SLEEP_STAGES.some((s) => st[s.k]), night = nightHr(all, idx);
  const plan = isLatest ? tonightPlan(all, idx, wake) : null, rows = windowRows(all, idx, 30);
  const nights = rows.filter((d) => d.asleep), met = nights.filter((d) => d.sleepPerf >= 1).length;
  const stagedPrev = all.slice(Math.max(0, idx - 30), idx).filter((d) => d.sleep && d.sleep.deep_min);
  const short = st && day.need ? Math.round(day.need - st.asleep_min) : null;
  const hiS = Math.max(540, ...nights.map((d) => Math.max(d.asleep, d.need || 0))) + 20;
  return (
    <Detail title="Sleep" day={day}>
      <Tile hero vt>
        <Lab right={st && st.start ? `${clock(st.start)} to ${clock(st.end)}` : null}>{day.date === isoToday() ? 'Last night' : 'The night before'}</Lab>
        {st ? (<>
          <div className="between end" style={{ marginTop: 14 }}>
            <div className="num nh"><Dur m={st.asleep_min} /></div>
            <div className="cap right" style={{ fontSize: 13, paddingBottom: 2 }}><b>{Math.round(day.sleepPerf * 100)}%</b> of the {hm(day.need)}<br />you needed</div>
          </div>
          <div style={{ margin: '18px 0 6px' }}><StageBar st={st} need={day.need} w={325} /></div>
          <div className="between cap"><span>Asleep {hm(st.asleep_min)}{!staged && day.sleep_score ? `, Zepp sleep score ${day.sleep_score}` : ''}</span><span><b>{short > 0 ? `${dur(short)} short` : 'Need met'}</b></span></div>
          {night ? (<>
            <div className="hr" />
            <div className="lab" style={{ marginBottom: 6 }}><span>Heart rate through the night</span></div>
            <NightHr n={night} w={325} />
          </>) : <><div className="hr" /><p className="cap">{st.start ? 'No minute-by-minute heart rate for this night, so there is no overnight line to draw.' : 'Zepp sent the total for this night without bed and wake times, so there is no overnight line to draw.'}</p></>}
        </>) : <p className="say" style={{ marginTop: 12 }}>No sleep recorded for this night. Wear the watch to bed and it shows here in the morning.</p>}
      </Tile>

      {staged && SLEEP_STAGES.map((s) => { const r = day.stageRange[s.k], v = st[s.k] || 0, vd = verdict(v, r), u = usual(r); return (
        <Tile c={2} key={s.k} className="narrow">
          <Lab><i className="sw" style={{ background: s.colour }} />{s.name}</Lab>
          <div className="num" style={{ marginTop: 12, fontSize: 22 }}><Dur m={v} /></div>
          {vd ? <><div style={{ margin: '10px 0 6px' }}><Ruler value={v} r={r} colour={s.colour} /></div><div className="cap" style={{ fontSize: 12 }}><b>{{ within: 'Usual', below: 'Low', above: 'High' }[vd]}</b><br />{dur(u[0])} to {dur(u[1])}</div></>
            : <div className="cap" style={{ marginTop: 10, fontSize: 12 }}>Usual not known yet</div>}
        </Tile>
      ); })}
      {st && <p className="foot c6">{staged ? <>{stagedPrev.length >= 5 ? `Stage amounts are set against your ${stagedPrev.length} nights with stages in the 30 days before, ${shortDate(stagedPrev[0].date)} to ${shortDate(stagedPrev[stagedPrev.length - 1].date)}. ` : `A usual range for each stage needs five nights with stages in the 30 days before. There ${stagedPrev.length === 1 ? 'is 1' : `are ${stagedPrev.length}`}. `}The watch shares how long each stage lasted, not when it happened, so there is no stage timeline to draw.{st.awake_min != null ? ` You were awake for ${stPlural(Math.round(st.awake_min), 'minute')}.` : ''}</>
        : 'Zepp shares the total and its own sleep score for this night, not the stages.'}</p>}

      {plan && <TonightBlock plan={plan} onWake={saveWake} />}

      <Tile>
        <Lab>Sleep against need, last 30 nights</Lab>
        {nights.length ? (<>
          <div style={{ marginTop: 12 }}><Trend rows={rows} val={(d) => d.asleep || null} need={(d) => d.need} lo={0} hi={hiS} kind="bar" colour={P.sleep} ticks={[240, 480]} tfmt={(v) => v / 60 + 'h'} fmt={dur} labelLast={false} h={124} scrub aria="Hours asleep against the hours needed, last 30 nights" /></div>
          <div className="leg"><span><i className="sw" style={{ background: P.sleep }} />Asleep</span><span><i className="sw" style={{ background: P.track, boxShadow: `inset 0 0 0 1px ${P.line2}` }} />What you needed that night</span></div>
          <p className="cap" style={{ marginTop: 8 }}>You met your need on <b>{met} of the {nights.length} nights</b> tracked, averaging {hm(mean(nights.map((d) => d.asleep)))}.</p>
        </>) : <p className="empty">No nights tracked in the last 30 days.</p>}
      </Tile>
    </Detail>
  );
}
