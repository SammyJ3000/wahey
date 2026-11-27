/* The journal and what affects you. One line about a day, turned into habits by Claude, or one tap on a chip.
   The maths is in lib/habits.js. */
/* global api, isoToday, JN_MIN, jnDate, jnInsights, jnNeed, jnNights, jnSay, jnShift, jnTop, Nav */    // js/core.jsx
/* global P, signed, useContext, useEffect, useMemo, useRef, useState */                                // js/core.jsx
/* global Icon, Lab, Tile */                                                                            // js/ui.jsx
/* global hbar */                                                                                       // js/charts.jsx
/* exported JournalTile, AffectsTile */

function JournalChip({ on, label, amount, onClick, busy, plain }) {
  return (
    <button type="button" className={'jn-chip' + (on ? ' on' : '') + (plain ? ' plain' : '')} onClick={onClick} disabled={busy}
      aria-label={(on ? 'Remove ' : 'Add ') + label + (amount ? ', ' + amount : '')}>
      <span>{!on && !plain && <Icon n="plus" />}<b>{label}</b>{on && amount && <em>{amount}</em>}{on && <Icon n="x" />}</span>
    </button>
  );
}

// `day` is the morning on screen; the entry is for the day before it. `entries` is everything from /api/journal.
// `onSaved(date, entry)` hands the stored entry (or null when it was emptied) back to App.
function JournalTile({ day, entries, onSaved }) {
  const date = jnShift(day.date, -1);
  const entry = entries.find((e) => e.date === date) || null;
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null);                       // 'text' | 'chip'
  const [msg, setMsg] = useState(null);                         // { kind: 'ok' | 'soft' | 'bad', text }
  const box = useRef(null);
  const fit = () => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };
  useEffect(fit, [text, editing]);
  useEffect(() => { if (editing && box.current) box.current.focus(); }, [editing]);

  const habits = entry ? entry.habits || [] : [];
  const nothing = !!(entry && entry.nothing);
  const offers = jnTop(entries).filter((h) => !habits.some((x) => x.slug === h.slug));
  const isToday = day.date === isoToday();

  async function post(body, kind) {
    setBusy(kind); setMsg(null);
    try {
      const r = await api('/api/journal', { method: 'POST', body: JSON.stringify({ date, ...body }) });
      if (!r || r.error) throw new Error(r && r.error);
      onSaved(date, r.entry);
      return r;
    } catch {
      setMsg({ kind: 'bad', text: kind === 'text' ? 'That didn’t save. Your note is still in the box.' : 'That didn’t save. Try it again.' });
      return null;
    } finally { setBusy(null); }
  }
  async function saveText() {
    const t = text.trim();
    if ((!t && !editing) || busy) return;
    const before = habits.length;
    const r = await post({ text: t }, 'text');
    if (!r) return;
    setText(''); setEditing(false);
    if (!t) setMsg({ kind: 'ok', text: 'Note removed' });
    else if (r.parsed === false) setMsg({ kind: 'soft', text: 'Note saved. It couldn’t be read into habits just now, so tap any that apply.' });
    else if (r.entry && (r.entry.habits || []).length === before && !before) setMsg({ kind: 'soft', text: 'Note saved. Nothing in it to track, so tap a habit if one applies.' });
    else setMsg({ kind: 'ok', text: 'Saved' });
  }
  const setHabits = async (next, extra) => { if (!busy && await post({ habits: next, ...extra }, 'chip')) setMsg({ kind: 'ok', text: 'Saved' }); };
  const add = (h) => setHabits([...habits, { slug: h.slug, label: h.label, src: 'chip' }]);
  const remove = (slug) => setHabits(habits.filter((h) => h.slug !== slug));
  const edit = () => { setText(entry.text); setEditing(true); setMsg(null); };
  const canSend = !busy && (text.trim() || editing);
  const saved = !!(entry && entry.text) && !editing;            // the stored line stands in for the field until Edit is tapped

  return (
    <Tile className="jn">
      <Lab icon="pencil-simple" right={isToday ? jnDate(date) : 'Set against the next morning'}><label htmlFor="jn-note">{isToday ? 'Yesterday, in a line' : `${jnDate(date)}, in a line`}</label></Lab>

      {saved ? (
        <div className="jn-note">
          <p>{entry.text}</p>
          <button type="button" className="jn-edit" onClick={edit} disabled={!!busy}><Icon n="pencil-simple" />Edit</button>
        </div>
      ) : (
        <form className={'jn-field' + (busy === 'text' ? ' busy' : '')} onSubmit={(e) => { e.preventDefault(); saveText(); }}>
          <textarea id="jn-note" ref={box} rows={1} value={text} maxLength={500} readOnly={busy === 'text'} enterKeyHint="send"
            placeholder={editing ? 'Rewrite the line, or clear it' : isToday ? 'Anything that might explain today?' : 'Anything worth noting about that day?'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveText(); } else if (e.key === 'Escape' && editing) { setEditing(false); setText(''); } }} />
          <button type="submit" className="jn-send" disabled={!canSend} aria-label={busy === 'text' ? 'Saving' : 'Save the line'}>
            <i className="sq"><Icon n={busy === 'text' ? 'circle-notch' : 'arrow-up'} /></i>
          </button>
        </form>
      )}

      <p className={'jn-msg' + (msg ? ' ' + msg.kind : '')} role="status" aria-live="polite">
        {busy === 'text' ? 'Reading your line' : msg ? <>{msg.kind !== 'soft' && <Icon n={msg.kind === 'ok' ? 'check' : 'warning-circle'} />}<span>{msg.text}</span></> : null}
      </p>

      <div className="jn-chips" role="group" aria-label="Habits for this day">
        {habits.map((h) => <JournalChip key={h.slug} on label={h.label} amount={h.amount} busy={!!busy} onClick={() => remove(h.slug)} />)}
        {nothing && <JournalChip on label="Nothing to note" busy={!!busy} onClick={() => setHabits([], { nothing: false })} />}
        {offers.map((h) => <JournalChip key={h.slug} label={h.label} busy={!!busy} onClick={() => add(h)} />)}
        {!habits.length && !nothing && <JournalChip plain label="Nothing to note" busy={!!busy} onClick={() => setHabits([], { nothing: true })} />}
      </div>
      {editing && <button type="button" className="textlink" onClick={() => { setEditing(false); setText(''); }}>Keep the line as it was</button>}
      {!entries.length && <p className="cap" style={{ marginTop: 10 }}>One line or one tap is enough. Once a habit has five nights behind it, Trends shows how your recovery tends to differ the morning after.</p>}
    </Tile>
  );
}

// A bar from a centre line: left is lower recovery the morning after, right is higher. Neutral ink, like the driver bars.
function EffectBar({ diff, scale, w = 333 }) {
  const ax = Math.round(w / 2), x1 = ax + (diff / scale) * (w / 2 - 2);
  return (
    <svg className="fit" viewBox={`0 0 ${w} 14`} aria-hidden="true">
      {diff !== 0 && <path className={'stretch' + (diff < 0 ? ' rtl' : '')} d={hbar(ax, x1, 2, 10)} fill={P.soft} />}
      <path d={`M${ax + 0.5} 0V14`} stroke={P.muted} />
    </svg>
  );
}
// Five pips: how far a habit is towards being compared.
const Pips = ({ n }) => <div className="dots pips" aria-hidden="true">{Array.from({ length: JN_MIN }, (_, i) => <i key={i} className={i < n ? 'f' : ''} />)}</div>;

function AffectsTile({ entries, all }) {
  const nav = useContext(Nav);
  const { logged, nights, effects, waiting } = useMemo(() => jnInsights(entries, all), [entries, all]);
  const scale = Math.max(15, ...effects.map((r) => Math.abs(r.diff)));          // points at the end of each half of the bar
  return (
    <Tile>
      <Lab right={logged > 0 ? `${jnNights(nights)} compared` : null}>What affects you</Lab>

      {!logged && (<>
        <p className="say lead" style={{ marginTop: 10 }}>Log a habit on <b>five nights</b> and this shows how your recovery tends to differ the morning after, against the nights you logged without it.</p>
        <div className="between" style={{ marginTop: 14 }}><span className="jn-name" style={{ color: P.muted }}>Your first habit</span><span className="cap">0 of {JN_MIN} nights logged</span></div>
        <Pips n={0} />
        <button className="link" style={{ marginTop: 6 }} onClick={() => nav.tab('today')}>Add yesterday’s line on Today<Icon n="caret-right" /></button>
      </>)}

      {effects.length > 0 && (<>
        <div className="jn-axis" aria-hidden="true"><span>Lower recovery the morning after</span><span>Higher</span></div>
        {effects.map((r) => (
          <div className="jn-row" key={r.slug}>
            <div className="between"><span className="jn-name">{r.label}</span><span className="num n5">{signed(r.diff)}<small>pts</small></span></div>
            <div style={{ margin: '10px 0' }}><EffectBar diff={r.diff} scale={scale} /></div>
            <p className="cap">{jnSay(r)}</p>
            <p className="cap" style={{ marginTop: 2 }}>{jnNights(r.on)} with, {r.off} without</p>
          </div>
        ))}
      </>)}

      {waiting.length > 0 && (<>
        {effects.length > 0 ? <><div className="hr" /><div className="lab" style={{ marginBottom: 12 }}><span>Still collecting</span></div></> : <div style={{ height: 14 }} />}
        {waiting.map((r) => (
          <div className="jn-row" key={r.slug}>
            <div className="between"><span className="jn-name">{r.label}</span><span className="cap">{jnNeed(r)}</span></div>
            <Pips n={r.on < JN_MIN ? r.on : r.off} />
          </div>
        ))}
      </>)}

      {logged > 0 && (
        <p className="cap" style={{ marginTop: 12 }}>
          {effects.length
            ? 'Averages from your own nights, not proof of a cause. Other things change on the same nights too.'
            : `A habit is compared once it has ${JN_MIN} nights with it and ${JN_MIN} logged nights without, each with a recovery score the morning after.`}
        </p>
      )}
    </Tile>
  );
}
