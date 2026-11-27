// Recovery, pushed over Today: why the score is what it is, driver by driver.
/* global band, bandHex, cap1, driverPoints, driverSay, dur, mean, P, shortDate, signed, status */      // js/core.jsx
/* global usual, verdict, watchList */                                                                  // js/core.jsx
/* global Detail, Dur, Icon, Lab, Tile */                                                               // js/ui.jsx
/* global biggest, DRIVERS, findGaps, Trend, Waterfall, windowRows */                                   // js/charts.jsx
/* exported RecoveryScreen */

const SAY_DIR = { below: ['arrow-down', 'Below your usual'], above: ['arrow-up', 'Above your usual'], within: ['check', 'In your usual range'] };

function RecoveryScreen({ all, idx }) {
  const day = all[idx], dp = driverPoints(day), rows = windowRows(all, idx, 30), [word] = status(day.recovery);
  const list = watchList(day), measured = list.filter((x) => x.vd), out = list.filter((x) => x.out);
  const hrvU = usual(day.ranges.hrv), rhrU = usual(day.ranges.rhr), slU = usual(day.ranges.sleep);
  const hrvS = rows.filter((d) => d.hrv_ms), hrvV = hrvS.map((d) => d.hrv_ms);
  const lower = day.hrv_ms ? hrvS.filter((d) => d.date !== day.date && d.hrv_ms < day.hrv_ms).length : null;
  const rec = rows.filter((d) => d.recovery != null), recLower = rec.filter((d) => d.date !== day.date && d.recovery < day.recovery).length, recHigher = rec.filter((d) => d.date !== day.date && d.recovery > day.recovery).length;
  const gap = biggest(findGaps(rows, (d) => d.recovery));
  const span = (vals, extra, pad) => { const a = [...vals, ...(extra || [])].filter((x) => x != null); return [Math.min(...a) - pad, Math.max(...a) + pad]; };
  const hrvR = hrvV.length ? span(hrvV, hrvU, 4) : null, rhrV = rows.map((d) => d.rhr).filter(Boolean), rhrR = rhrV.length ? span(rhrV, rhrU, 2) : null;
  const slV = rows.map((d) => d.asleep).filter(Boolean), slR = slV.length ? span(slV, slU, 20) : null;
  const tick2 = (lo, hi, stepBy) => { const a = Math.ceil((lo + (hi - lo) * 0.15) / stepBy) * stepBy, b = Math.floor((hi - (hi - lo) * 0.1) / stepBy) * stepBy; return a < b ? [a, b] : [a]; };
  const Small = ({ k, name, pct, value, unit, isDur, r, u, range, colour, val, fmt }) => {
    const vd = verdict(value, r);
    return (
      <Tile c={3}>
        <Lab>{name}</Lab>
        <div className="wt" style={{ marginTop: 3 }}>{pct}% of the score{dp && dp.by[k] != null ? `, ${signed(dp.by[k])}` : ''}</div>
        <div className="num n3" style={{ marginTop: 12, color: value == null ? P.faint : P.ink }}>{value == null ? '–' : isDur ? <Dur m={value} /> : <>{value}<small>{unit}</small></>}</div>
        <div className="cap" style={{ margin: '6px 0 10px', minHeight: 36 }}>{value == null ? 'No reading this morning' : vd ? <><b><Icon n={SAY_DIR[vd][0]} /> {vd === 'within' ? 'Usual' : cap1(vd)}</b>{vd === 'within' ? ', ' : ' usual '}{fmt(u[0])} to {fmt(u[1])}</> : 'Not enough nights yet to know your usual'}</div>
        {range && <Trend rows={rows} val={val} lo={range[0]} hi={range[1]} colour={colour} band={u} w={146} h={64} xlabels={false} labelLast={false} aria={`${name}, last 30 mornings`} />}
      </Tile>
    );
  };
  return (
    <Detail title="Recovery" day={day}>
      <Tile hero vt>
        <div className="between end">
          <div className="num n1">{day.recovery == null ? '–' : day.recovery}{day.recovery != null && <span className="pc">%</span>}</div>
          <div className="right" style={{ paddingBottom: 4 }}>
            <div className="state" style={{ justifyContent: 'flex-end' }}>{day.recovery != null && <i className="sw" style={{ background: bandHex(day.recovery) }} />}{word}</div>
            <div className="cap" style={{ marginTop: 4, fontSize: 13 }}>{{ good: '67 or over is a day to push', meh: '34 to 66 is a steady day', bad: '33 or under is a light day' }[band(day.recovery)] || 'Wear the watch to bed'}</div>
          </div>
        </div>
        <div className="hr" style={{ margin: '18px 0 14px' }} />
        {dp ? (<>
          <div className="lab" style={{ marginBottom: 10 }}><span>How the starting {dp.start} became {day.recovery}</span></div>
          <Waterfall day={day} dp={dp} w={325} />
          {Object.keys(dp.by).length < 3 && <p className="cap" style={{ marginTop: 10 }}>{DRIVERS.filter(([k]) => dp.by[k] == null).map(([, , n]) => n).join(' and ')} had no reading, so the score leans on the other two this morning.</p>}
        </>) : <p className="say">A score needs last night’s HRV from Zepp and five nights of history. HRV usually arrives after you open Zepp and it syncs.</p>}
      </Tile>

      <Tile>
        <Lab right={`55% of the score${dp && dp.by.hrv != null ? `, ${signed(dp.by.hrv)}` : ''}`}>Heart rate variability</Lab>
        {day.hrv_ms ? (<>
          <div className="between end" style={{ marginTop: 12 }}>
            <div className="num n2">{Math.round(day.hrv_ms)}<small>ms</small></div>
            {verdict(day.hrv_ms, day.ranges.hrv) ? <div className="cap right" style={{ fontSize: 13 }}><b><Icon n={driverSay(day.hrv_ms, day.ranges.hrv)[0]} /> {driverSay(day.hrv_ms, day.ranges.hrv)[1]}</b><br />{Math.round(hrvU[0])} to {Math.round(hrvU[1])} ms on most mornings</div>
              : <div className="cap right">Not enough nights yet<br />to know your usual</div>}
          </div>
          <div style={{ marginTop: 12 }}><Trend rows={rows} val={(d) => d.hrv_ms || null} lo={hrvR[0]} hi={hrvR[1]} band={hrvU} ticks={tick2(hrvR[0], hrvR[1], 10)} scrub fmt={(v) => String(Math.round(v))} aria="Heart rate variability, last 30 mornings, against your usual range" /></div>
          <p className="cap" style={{ marginTop: 10 }}>{hrvU ? 'The band is your usual range. ' : ''}Across the {hrvS.length} mornings tracked in the last 30 days you averaged <b>{Math.round(mean(hrvV))} ms</b>{lower != null && hrvS.length > 1 ? <>, and {lower === 0 ? 'none' : lower === 1 ? 'only 1' : lower} of the others came in lower than this one</> : null}.</p>
        </>) : <p className="empty">No HRV from Zepp for this night.{dp ? ' There’s no score without it.' : ''}</p>}
      </Tile>

      <Small k="rhr" name="Resting heart rate" pct={25} value={day.rhr ?? null} unit="bpm" r={day.ranges.rhr} u={rhrU} range={rhrR} colour={P.ink} val={(d) => d.rhr || null} fmt={(x) => Math.round(x)} />
      <Small k="sleep" name="Sleep" pct={20} value={day.asleep || null} isDur r={day.ranges.sleep} u={slU} range={slR} colour={P.sleep} val={(d) => d.asleep || null} fmt={dur} />

      <Tile>
        <Lab icon={out.length ? 'warning' : 'check-circle'}>Within your range</Lab>
        <p className="say" style={{ marginTop: 10 }}>{!measured.length ? 'Not enough nights on file yet to know your usual ranges.'
          : out.length ? <><b>{out.length} of {measured.length} {measured.length === 1 ? 'reading is' : 'readings are'} on the wrong side of your usual range.</b> One odd morning happens. If {out.length === 1 ? 'it is' : 'they are'} still out tomorrow, treat it as a sign to rest.</>
          : <><b>{measured.length === 1 ? 'The one reading with a usual range is inside it.' : `All ${measured.length} readings are where they usually are.`}</b> Nothing here to act on.</>}</p>
        <div className="cells">{list.map((x) => (
          <div key={x.k} className={x.value == null || !x.vd ? 'no' : ''}>{x.name}<b>{x.value == null ? x.none : !x.vd ? `${x.fmt(x.value)}, usual not known yet` : <><Icon n={SAY_DIR[x.vd][0]} />{x.vd === 'within' ? 'In range' : cap1(x.vd)}, {x.fmt(x.value)}</>}</b></div>
        ))}</div>
      </Tile>

      <Tile>
        <Lab>Recovery, last 30 mornings</Lab>
        {rec.length ? (<>
          <div style={{ marginTop: 12 }}><Trend rows={rows} val={(d) => d.recovery} lo={0} hi={100} kind="bar" colourFn={(v) => bandHex(v)} ticks={[34, 67]} fmt={(v) => Math.round(v) + '%'} tfmt={(v) => String(v)} h={112} scrub aria="Recovery score, last 30 mornings, coloured by band" /></div>
          <div className="leg"><span><i className="sw" style={{ background: P.green }} />Recovered</span><span><i className="sw" style={{ background: P.amber }} />Part recovered</span><span><i className="sw" style={{ background: P.red }} />Running low</span></div>
          <p className="cap" style={{ marginTop: 8 }}>{day.recovery == null ? `${rec.length} mornings scored in the last 30 days.` : rec.length < 2 ? 'This is the only morning scored in the last 30 days.' : recLower === 0 ? <>This is the lowest of the <b>{rec.length} mornings scored</b> in the last 30 days.</> : recHigher === 0 ? <>This is the highest of the <b>{rec.length} mornings scored</b> in the last 30 days.</> : <><b>{recLower} of the other {rec.length - 1} mornings scored</b> in the last 30 days came in lower.</>}
            {gap ? ` The watch has no overnight data for ${shortDate(rows[gap[0]].date)} to ${shortDate(rows[gap[1]].date)}, so those mornings stay blank.` : ''}</p>
        </>) : <p className="empty">No mornings scored in the last 30 days.</p>}
      </Tile>

      {day.baseNights < 30 && <Tile>
        <Lab right={`${day.baseNights} of 30 nights`}>Still learning your normal</Lab>
        <div className="dots" role="img" aria-label={`${day.baseNights} of 30 nights on file`}>{Array.from({ length: 30 }, (_, i) => <i key={i} className={i < day.baseNights ? 'f' : ''} />)}</div>
        <p className="cap" style={{ marginTop: 10 }}>Your usual ranges come from the nights on file. They settle, and the score steadies, as the 30 fill in.</p>
      </Tile>}
    </Detail>
  );
}
