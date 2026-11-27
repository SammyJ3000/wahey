/* Body age at the foot of Trends. The maths is in lib/body-age.js and written up in docs/body-age-method.md.
   The inputs lead; the single number is the last tile. */
/* global BA_CAP, BA_DAYS, BA_MIN_READY, baAge, baInputs, baList, baSplit, baTotal, baYearsSay */       // js/core.jsx
/* global clamp, isoToday, P, signed, useMemo, useState */                                              // js/core.jsx
/* global Dur, Icon, Lab, Tile */                                                                       // js/ui.jsx
/* exported BodyAge */

const BA_DOB = 'ow_dob';                 // date of birth, YYYY-MM-DD, kept on this phone only

// One input as a tile: your number on the left, the years it adds or takes off on the right, then a ruler with the
// range it is held against. Same quiet ruler as the sleep stages: grey track, the target range, a ringed dot for you.
function BodyAgeTile({ row }) {
  const counted = row.status === 'ready', ruler = row.value != null && row.scale, w = 333;
  const p = (x) => clamp((x - row.scale[0]) / (row.scale[1] - row.scale[0]), 0.02, 0.98) * w;
  const said = counted ? (row.years === 0 ? 'no change' : `${row.years < 0 ? 'took off' : 'added'} ${Math.abs(row.years)} years`) : 'not counted';
  const icon = row.where === 'in' ? 'check' : row.where === 'below' ? 'arrow-down' : 'arrow-up';
  const [v, unit] = row.text ? baSplit(row.text) : [];
  return (
    <Tile className={counted ? '' : 'ba-off'}>
      <Lab>{row.name}</Lab>
      {(row.text || row.cap) && (<>
        <div className="between" style={{ marginTop: 10 }}>
          <div className="num n4">{!row.text ? null : row.k === 'sleep' ? <Dur m={row.value} /> : <>{v}{unit && <small>{unit}</small>}</>}</div>
          {row.cap && <div className="num n4 ba-yrs" role="img" aria-label={said}>{counted ? <>{signed(row.years)}<small>{Math.abs(row.years) === 1 ? 'year' : 'years'}</small></> : '–'}</div>}
        </div>
        <div className="between cap" style={{ marginTop: 5 }}>
          <span>{row.detail}</span>
          {row.cap && <span className="right" style={{ flex: 'none' }}>{counted ? (row.years < 0 ? 'taken off' : row.years > 0 ? 'added' : 'no change') : 'not counted yet'}</span>}
        </div>
      </>)}
      {ruler && (<>
        <div style={{ margin: '12px 0 0' }}>
          <svg className="fit" viewBox={`0 0 ${w} 18`} role="img" aria-label={`${row.name} ${row.text}. ${row.range}.`}>
            <rect x="0" y="7" width={w} height="4" rx="2" fill={P.track} />
            <rect x={p(row.band[0])} y="7" width={Math.max(3, p(row.band[1]) - p(row.band[0]))} height="4" rx="2" fill={P.faint} />
            <circle className="pop" cx={p(row.value)} cy="9" r="5" fill={counted ? P.ink : P.muted} stroke={P.tile} strokeWidth="2" />
          </svg>
        </div>
        <div className="ba-foot cap"><span><b><Icon n={icon} /> {row.say[row.where]}</b></span><span>{row.range}</span></div>
      </>)}
      {row.why && <p className="cap" style={{ marginTop: row.text ? 10 : 8 }}>{row.why}</p>}
      {row.extra && <p className="cap" style={{ marginTop: 6 }}>{row.extra}</p>}
    </Tile>
  );
}

// exampleAge is for layout previews only: it stands in for a missing date of birth and says so on screen. The app never passes it.
function BodyAge({ all, gym, today = isoToday(), exampleAge = null }) {
  const [dob, setDob] = useState(() => { try { return localStorage.getItem(BA_DOB) || ''; } catch { return ''; } });
  const [draft, setDraft] = useState(dob);
  const [editing, setEditing] = useState(false);
  const [bad, setBad] = useState(false);
  const realAge = baAge(dob, today), example = realAge == null && exampleAge != null;
  const age = realAge != null ? realAge : exampleAge;
  const rows = useMemo(() => baInputs(all, gym, today, age), [all, gym, today, age]);
  const sum = baTotal(rows, age);
  const asking = age == null;                 // no age at all: the sum is shown as years, not as an age
  const save = (e) => {
    e.preventDefault();
    if (baAge(draft, today) == null) { setBad(true); return; }
    try { localStorage.setItem(BA_DOB, draft); } catch {}
    setDob(draft); setEditing(false); setBad(false);
  };
  const waitingNames = baList(sum.waiting.map((r) => r.name.toLowerCase()));

  return (
    <section id="body-age" aria-label="Body age">
      <div className="sect"><h2>Body age</h2><span className="wt" style={{ fontSize: 13 }}>Last {BA_DAYS} days</span></div>
      <div className="grid">
        <Tile hero>
          <p className="say lead">A rough estimate to keep you motivated, not a medical measure. Each habit below is held against a published guideline and adds or takes off up to a year and a half.</p>
          {example && <p className="ba-banner"><Icon n="info" /><span>Example age {exampleAge}, for layout only. The inputs are real, the age is a stand-in, and so is the body age at the bottom.</span></p>}
          <div className="hr" />
          {asking || editing ? (
            <form className="ba-ask" onSubmit={save}>
              <label htmlFor="ba-dob">{editing ? 'Your date of birth' : 'First, your date of birth'}</label>
              <div className="ba-ask-row">
                <input id="ba-dob" type="date" value={draft} min="1920-01-01" max={today} required aria-describedby="ba-dob-hint" onChange={(e) => { setDraft(e.target.value); setBad(false); }} />
                <button className="btn" type="submit" disabled={!draft}>Save</button>
              </div>
              <p className="cap" style={{ marginTop: 10 }} id="ba-dob-hint" role={bad ? 'alert' : undefined}>{bad
                ? 'That date doesn’t give an age between 18 and 100. The guidelines used here are for adults.'
                : 'Asked once and kept on this phone. Your watch doesn’t know it, and the years below need an age to be added to.'}</p>
            </form>
          ) : (
            <div className="between end">
              <div><div className="lab"><span>{example ? 'Example age' : 'Your age'}</span></div>
                {realAge != null && <button className="textlink" style={{ marginBottom: -12 }} onClick={() => { setDraft(dob); setEditing(true); }}>Change date of birth</button>}</div>
              <div className="num n2">{age}</div>
            </div>
          )}
        </Tile>

        {rows.map((r) => <BodyAgeTile key={r.k} row={r} />)}

        <Tile hero>
          <Lab right={`${sum.ready} of ${sum.of} inputs counted`}>{asking ? 'Years so far' : example ? 'Example body age' : 'Estimated body age'}</Lab>
          <div className="num nh" style={{ marginTop: 14, color: sum.enough ? P.ink : P.faint }}>{!sum.enough ? '–' : asking ? <>{signed(sum.years)}<small style={{ marginLeft: 6 }}>{Math.abs(sum.years) === 1 ? 'year' : 'years'}</small></> : sum.bodyAge}</div>
          {sum.enough ? (<>
            <p className="say lead" style={{ marginTop: 14 }}>{asking ? 'Add your date of birth at the top of this section to see this as an age. ' : <><b><Icon n={sum.years < 0 ? 'arrow-down' : sum.years > 0 ? 'arrow-up' : 'equals'} /> {baYearsSay(sum.years)}.</b> </>}Added up from {sum.ready} of {sum.of} inputs.</p>
            {sum.waiting.length > 0 && <p className="cap" style={{ marginTop: 8 }}>{waitingNames.charAt(0).toUpperCase() + waitingNames.slice(1)} {sum.waiting.length === 1 ? 'isn’t' : 'aren’t'} counted yet. Once {sum.waiting.length === 1 ? 'it is' : 'they are'}, the total could land anywhere from {asking ? `${signed(sum.lo)} to ${signed(sum.hi)} years` : `${age + sum.lo} to ${age + sum.hi}`}.</p>}
          </>) : (
            <p className="say" style={{ marginTop: 14 }}>Not enough to add up yet. {sum.ready} of {sum.of} inputs have enough days behind them, and it takes {BA_MIN_READY} before a total is shown. The tiles above fill in as you wear the watch, log the gym and step on the scale.</p>
          )}
          <details className="ba-how">
            <summary>What this can and can’t tell you<Icon n="caret-down" /></summary>
            <p>It is your age plus the years in the tiles above, nothing else. Each one moves in half-year steps and is capped, and the total can’t move your age by more than {BA_CAP} years.</p>
            <p>The guidelines come from studies of large groups. They say what tends to be true across thousands of people, not what is true of you.</p>
            <p>It can’t see illness, family history, smoking, diet or blood tests, and it has no fitness test such as VO2 max. The watch and the scale estimate; they don’t measure the way a clinic does.</p>
            <p>It isn’t WHOOP Age and doesn’t copy WHOOP’s maths.</p>
          </details>
        </Tile>
      </div>
    </section>
  );
}
