/* Ask the coach: a chat with Claude about the day's numbers, opened from the field under the morning call (never a
   floating button), plus "What I know about you": a short list of plain facts Claude reads before answering. Claude can
   suggest a line; it is only saved when the user taps it. The day's conversation and the list live on the server
   (api/chat.js). */
/* global api, band, clamp, clock, clock12, dayLabel, driverPoints, dur, hm, isoToday */                // js/core.jsx
/* global reduceMotion, sessionHr, strainTarget, tonightPlan, useEffect, useRef, useState */            // js/core.jsx
/* global Icon, Rich, Seg, Typed */                                                                     // js/ui.jsx
/* exported chDayPayload, ChatEntry */

const CH_API = '/api/chat';

// The morning call's payload, in one place so the chat sends Claude exactly the same picture of the day.
function chDayPayload(all, i, gym, weights) {
  const day = all[i], recent = (gym && gym.sessions || []).slice(-4);
  return {
    date: day.date, recovery: day.recovery, band: band(day.recovery),
    hrv_ms: day.hrv_ms, hrv_normal: day.hrvNormal, resting_hr: day.rhr, resting_hr_normal: day.rhrNormal,
    sleep: hm(day.asleep), sleep_needed: hm(day.need), sleep_debt_3_nights: hm(day.debt), strain_yesterday: day.yStrain,
    last_7_days: all.slice(Math.max(0, i - 7), i).map((d) => ({ date: d.date, recovery: d.recovery, strain: d.strain, sleep: hm(d.asleep) })),
    weight_7day_avg: weights.length ? weights[weights.length - 1].avg : null,
    weight_goal: gym && gym.goal ? gym.goal.targetWeight : null,
    recent_gym_sessions: recent.map((s) => ({ date: s.date, name: s.name, sets: s.sets, volume_kg: s.volume })),
  };
}

// What the chat adds on top: why the score is what it is, last night in stages, today's strain range, tonight's plan,
// 14 days of key numbers and the recent gym sessions with heart rate. Built when a question is sent, so it is current.
function chContext({ all, idx, gym, weights, wake }) {
  const day = all[idx], base = chDayPayload(all, idx, gym, weights);
  const pts = driverPoints(day), plan = tonightPlan(all, idx, wake), tg = strainTarget(all, idx), st = day.sleep;
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  const drop = (o) => { Object.keys(o).forEach((k) => (o[k] == null || o[k] === '–') && delete o[k]); return o; };   // missing readings are left out, not sent as blanks
  delete base.last_7_days; delete base.recent_gym_sessions; delete base.sleep_debt_3_nights;   // replaced below by fuller versions
  return drop({
    ...base,
    sleep_short_over_3_nights_before_last_night: hm(day.debt),
    asked_at: new Date().toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }),
    recovery_points: pts ? { normal_morning_starts_at: pts.start, ...pts.by } : null,
    sleep_stages: st ? drop({ from: clock(st.start), to: clock(st.end), deep: hm(st.deep_min), rem: hm(st.rem_min), light: hm(st.core_min), awake: hm(st.awake_min) }) : null,
    breathing_rate: r1(day.resp_rate), blood_oxygen: day.spo2 != null ? Math.round(day.spo2) : null, steps_so_far: day.steps,
    strain_so_far: day.strain,
    strain_target: tg && tg.lo != null ? { aim_for: `${tg.lo} to ${tg.hi}`, because: tg.why, usual_day: r1(tg.usualDay), still_learning: tg.learning || undefined } : null,
    tonight: plan ? { in_bed_by: clock12(plan.bed), up_at: clock12(plan.wake), time_in_bed: dur(plan.inBed), base_need: dur(plan.base), added_for_strain: dur(plan.forStrain), sleep_short_over_last_3_nights: dur(plan.short), added_to_pay_that_back: dur(plan.forDebt), falling_asleep_and_waking: dur(plan.awake) } : null,
    last_14_days: all.slice(Math.max(0, idx - 14), idx).map((d) => drop({ date: d.date, recovery: d.recovery, hrv_ms: d.hrv_ms, resting_hr: d.rhr, sleep: hm(d.asleep), strain: d.strain, weight_kg: d.weight_kg })).filter((d) => Object.keys(d).length > 1),   // days the watch wasn't worn are left out
    recent_gym_sessions: (gym && gym.sessions || []).slice(-5).map((s) => {
      const hr = sessionHr(s, all.find((d) => d.date === s.date));
      return drop({ date: s.date, name: s.name, sets: s.sets, volume_kg: s.volume, strain: hr && hr.strain, avg_hr: hr && hr.avg, max_hr: hr && hr.max, minutes: hr && hr.minutes,
        lifts: (s.exercises || []).slice(0, 8).map((e) => `${e.name}, ${e.sets} sets`) });
    }),
    gym_programme: gym && gym.programme && gym.programme.name ? `${gym.programme.name}, week ${gym.programme.week}` : null,
  });
}

// Two or three questions worth asking, picked from the day's state. No API call.
function chSuggest(day, plan, trained, live) {
  const b = band(day.recovery);
  const out = [b === 'bad' ? 'Why is my recovery low?' : b === 'good' ? 'What’s behind my good recovery?' : 'What’s holding my recovery back?'];
  if (live) out.push(trained ? 'How hard did today’s session hit me?' : 'Should I train today?');
  if (plan) out.push('What time should I go to bed?');
  return out;
}

const chErrorText = (e) => (/API_KEY/.test(e || '')
  ? 'Claude isn’t connected on the server yet, so there’s no answer. Nothing was saved.'
  : 'Claude didn’t answer that one. Nothing was saved.');

// A reply as paragraphs. The newest one arrives word by word like the morning call; older ones are just there.
function ChatText({ text, typed }) {
  let at = 0;
  return text.split(/\n\s*\n/).map((para, i) => {
    const start = at; at += typed ? Math.min(1100, para.split(/\s+/).length * 32) : 0;
    return <p key={i}>{para.split('\n').map((line, k) => <React.Fragment key={k}>{k > 0 && <br />}{typed ? <Typed text={line} start={start} /> : <Rich text={line} />}</React.Fragment>)}</p>;
  });
}

const chRubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));       // the further past the edge, the less it follows
const chProject = (v, rate = 0.998) => (v / 1000) * rate / (1 - rate);                        // where a flick at v px/s would come to rest

function ChatMemory({ lines, busy, error, onChange }) {
  const [edit, setEdit] = useState(null);                       // { id, text } while one line is being changed
  const save = (e) => {
    e.preventDefault();
    const text = edit.text.trim();
    onChange(text ? lines.map((l) => (l.id === edit.id ? { ...l, text } : l)) : lines.filter((l) => l.id !== edit.id));
    setEdit(null);
  };
  return (
    <div className="ch-mem">
      <p className="cap">Claude reads these lines before it answers. Nothing is added unless you add it, or tap a suggestion in the chat.</p>
      {lines.length ? (
        <ul className="ch-facts" aria-busy={busy}>{lines.map((l) => (edit && edit.id === l.id ? (
          <li key={l.id}>
            <form className="ch-edit" onSubmit={save}>
              <input className="ch-in" autoFocus value={edit.text} maxLength={160} aria-label="Change this line" onChange={(e) => setEdit({ id: l.id, text: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEdit(null); } }} />
              <button type="submit" className="ch-txt ch-strong">Save</button>
              <button type="button" className="ch-txt" onClick={() => setEdit(null)}>Cancel</button>
            </form>
          </li>
        ) : (
          <li key={l.id}>
            <span className="ch-fact">{l.text}</span>
            <button className="ch-ico" aria-label={`Change: ${l.text}`} disabled={busy} onClick={() => setEdit({ id: l.id, text: l.text })}><Icon n="pencil-simple" /></button>
            <button className="ch-ico" aria-label={`Delete: ${l.text}`} disabled={busy} onClick={() => onChange(lines.filter((x) => x.id !== l.id))}><Icon n="trash" /></button>
          </li>
        )))}</ul>
      ) : <p className="ch-none">Nothing here yet. Add a line below and Claude will use it from the next question.</p>}
      {error && <p className="ch-err" role="alert">{error}</p>}
    </div>
  );
}

function ChatSheet({ date, title, ask, asks, chat, setChat, getContext, onClose }) {
  const [on, setOn] = useState(false);                          // drives the slide; the sheet mounts off-screen
  const [view, setView] = useState('chat');
  const [text, setText] = useState('');
  const [fact, setFact] = useState('');
  const [wait, setWait] = useState(null);                       // the question Claude is answering
  const [fail, setFail] = useState(null);                       // { q, msg } when the last question got no answer
  const [fresh, setFresh] = useState(null);                     // id of the reply that has just arrived
  const [loadFail, setLoadFail] = useState(false);
  const [sure, setSure] = useState(false);                      // "Clear this chat" asks once before it clears
  const [memBusy, setMemBusy] = useState(false);
  const [memError, setMemError] = useState(null);
  const sheet = useRef(null), panel = useRef(null), back = useRef(null), body = useRef(null), input = useRef(null), closeBtn = useRef(null), busy = useRef(false), closing = useRef(false), drag = useRef(null);
  const still = reduceMotion;

  const close = () => { if (closing.current) return; closing.current = true; setOn(false); setTimeout(onClose, still() ? 180 : 280); };

  const send = async (raw) => {
    const q = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!q || busy.current) return;
    busy.current = true; setText(''); setFail(null); setSure(false); setView('chat'); setWait(q);
    try {
      const r = await api(CH_API, { method: 'POST', body: JSON.stringify({ date, question: q, context: getContext() }) });
      if (r.error || !Array.isArray(r.messages)) setFail({ q, msg: chErrorText(r.error) });
      else { const last = r.messages[r.messages.length - 1]; setFresh(last ? last.id : null); setChat({ messages: r.messages, memory: r.memory }); }
    } catch { setFail({ q, msg: 'Couldn’t reach the server. Nothing was saved.' }); }
    busy.current = false; setWait(null);
  };

  const load = async () => {
    setLoadFail(false);
    try {
      const r = await api(`${CH_API}?date=${date}`);
      if (!Array.isArray(r.messages)) throw new Error('bad');
      setChat({ messages: r.messages, memory: r.memory || [] });
    } catch { setLoadFail(true); return; }
    if (ask) send(ask);
  };

  const change = async (payload, onMemory) => {                  // every memory change and every "Remember" tap goes through here
    setMemBusy(true); setMemError(null);
    try {
      const r = await api(CH_API, { method: 'PUT', body: JSON.stringify(payload) });
      if (r.error && !r.memory) throw new Error(r.error);
      setChat((c) => ({ messages: r.messages || c.messages, memory: r.memory || c.memory }));
      if (r.error) setMemError(r.error); else if (onMemory) onMemory();
    } catch { setMemError('That didn’t save. Try again.'); }
    setMemBusy(false);
  };
  const saveLines = (lines, done) => change({ memory: lines.map((l) => ({ id: l.id, text: l.text })) }, done);
  const addFact = () => { const t = fact.trim(); if (t) saveLines([...(chat.memory || []), { text: t }], () => setFact('')); };
  const clear = async () => {
    setSure(false);
    try { const r = await api(`${CH_API}?date=${date}`, { method: 'DELETE' }); if (Array.isArray(r.messages)) { setChat((c) => ({ ...c, messages: r.messages })); setFail(null); } } catch {}
  };

  // Opening: lock the page behind, take focus, slide up. Closing puts all of it back, focus included.
  useEffect(() => {
    const opener = document.activeElement, root = document.getElementById('root'), b = document.body.style, y = window.scrollY;
    const was = { position: b.position, top: b.top, left: b.left, right: b.right };
    b.position = 'fixed'; b.top = `-${y}px`; b.left = '0'; b.right = '0';
    if (root) root.inert = true;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    (ask ? closeBtn.current : input.current).focus({ preventScroll: true });     // a typed question starts in the box; a tapped one leaves the keyboard down
    const key = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    // The phone keyboard shrinks the visible area but not the layout, so keep the sheet (and its input) inside what can be seen.
    const vv = window.visualViewport;
    const fit = () => { const el = sheet.current; if (!el || !vv) return; const kb = window.innerHeight - vv.height > 80; el.style.top = kb ? vv.offsetTop + 'px' : ''; el.style.height = kb ? vv.height + 'px' : ''; el.style.bottom = kb ? 'auto' : ''; };
    if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
    if (chat.messages == null) load(); else if (ask) send(ask);
    return () => {
      cancelAnimationFrame(raf); document.removeEventListener('keydown', key);
      if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
      Object.assign(b, was); window.scrollTo(0, y);
      if (root) root.inert = false;
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    };
  }, []);

  // Keep the newest line in view.
  useEffect(() => { const el = body.current; if (el && view === 'chat') el.scrollTop = el.scrollHeight; }, [chat.messages, wait, fail, view, sure]);

  // Dragging the head moves the sheet with the finger. Let go and it either settles back or carries on down and closes,
  // decided by where the flick would come to rest, not by where the finger stopped. Pulling up past the top resists.
  const dragStart = (e) => {
    if (still() || closing.current || e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { id: e.pointerId, y0: e.clientY, at: 0, moving: false, hist: [[performance.now(), e.clientY]] };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const dragMove = (e) => {
    const d = drag.current, p = panel.current;
    if (!d || d.id !== e.pointerId || !p) return;
    const dy = e.clientY - d.y0;
    if (!d.moving) { if (Math.abs(dy) < 6) return; d.moving = true; sheet.current.classList.add('drag'); }
    d.hist.push([performance.now(), e.clientY]); if (d.hist.length > 6) d.hist.shift();
    const h = p.offsetHeight;
    d.at = dy >= 0 ? dy : -chRubber(-dy, h);
    p.style.transform = `translateY(${d.at}px)`;
    back.current.style.opacity = String(1 - clamp(d.at / h, 0, 1) * 0.8);
  };
  const dragEnd = (e) => {
    const d = drag.current, p = panel.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moving || !p) return;
    const [t0, y0] = d.hist[0], [t1, y1] = d.hist[d.hist.length - 1], v = t1 - t0 > 0 ? (y1 - y0) / (t1 - t0) * 1000 : 0;
    const away = e.type !== 'pointercancel' && d.at + chProject(v) > p.offsetHeight * 0.5;
    sheet.current.classList.remove('drag');
    back.current.style.opacity = '';
    if (away) { p.style.transform = 'translateY(100%)'; close(); } else p.style.transform = '';
  };

  const msgs = chat.messages, lines = chat.memory || [];
  const empty = msgs && !msgs.length && !wait && !fail;

  return ReactDOM.createPortal(
    <div className={'ch-sheet' + (on ? ' on' : '')} ref={sheet}>
      <div className="ch-back" ref={back} onClick={close} />
      <div className="ch-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="ch-title">
        <header className="ch-head" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
          <h2 id="ch-title">{title}</h2>
          <button ref={closeBtn} className="ch-ico" aria-label="Close" onClick={close}><Icon n="x" /></button>
        </header>
        <div className="ch-tabs"><Seg items={[['chat', 'Chat'], ['memory', 'What I know about you']]} value={view} onChange={(v) => { setFresh(null); setView(v); }} label="Chat, or what Claude knows about you" /></div>

        <div className="ch-body" ref={body}>
          {view === 'memory' ? (
            chat.memory == null
              ? (loadFail ? <p className="ch-err">Couldn’t load the list. <button className="ch-txt ch-strong" onClick={load}>Try again</button></p> : <div aria-label="Loading the list"><div className="skel" /><div className="skel" style={{ width: '70%' }} /></div>)
              : <ChatMemory lines={lines} busy={memBusy} error={memError} onChange={(next) => saveLines(next)} />
          ) : (
            <div className="ch-log" aria-live="polite">
              {msgs == null && !loadFail && <div aria-label="Loading the chat"><div className="skel" /><div className="skel" style={{ width: '80%' }} /><div className="skel" style={{ width: '55%' }} /></div>}
              {loadFail && <p className="ch-err">Couldn’t load this chat. <button className="ch-txt ch-strong" onClick={load}>Try again</button></p>}
              {empty && (<>
                <p className="ch-intro">Claude answers from your own numbers: this morning, the last 14 days, tonight’s plan, your gym sessions and what it knows about you.</p>
                <ul className="ch-asks">{asks.map((q) => <li key={q}><button onClick={() => send(q)}><span>{q}</span><Icon n="arrow-up" /></button></li>)}</ul>
              </>)}
              {(msgs || []).map((m) => (m.role === 'user' ? <p key={m.id} className="ch-q">{m.text}</p> : (
                <div key={m.id} className={'ch-a' + (m.id === fresh ? ' typing' : '')}>
                  <ChatText text={m.text} typed={m.id === fresh} />
                  {m.remember && !m.remembered && (
                    <div className="ch-rem">
                      <button className="ch-rem-save" disabled={memBusy} onClick={() => change({ date, remember: m.id })}><Icon n="plus" /><span>Remember: {m.remember}</span></button>
                      <button className="ch-ico" aria-label="Don’t remember this" disabled={memBusy} onClick={() => change({ date, dismiss: m.id })}><Icon n="x" /></button>
                    </div>
                  )}
                  {m.remembered && <div className="ch-rem-done"><Icon n="check" />Saved to what I know about you</div>}
                </div>
              )))}
              {wait && (<>
                <p className="ch-q">{wait}</p>
                <div className="ch-wait" role="status" aria-label="Claude is working on it"><div className="skel" /><div className="skel" style={{ width: '85%' }} /><div className="skel" style={{ width: '50%' }} /></div>
              </>)}
              {fail && (<>
                <p className="ch-q ch-unsent">{fail.q}</p>
                <p className="ch-err" role="alert">{fail.msg} <button className="ch-txt ch-strong" onClick={() => send(fail.q)}>Try again</button></p>
              </>)}
              {memError && view === 'chat' && <p className="ch-err" role="alert">{memError}</p>}
              {msgs && msgs.length > 0 && !wait && (
                <p className="ch-clear">{sure
                  ? <>Clear every question and answer from this day? <button className="ch-txt ch-strong" onClick={clear}>Clear it</button><button className="ch-txt" onClick={() => setSure(false)}>Keep it</button></>
                  : <button className="ch-txt" onClick={() => setSure(true)}>Clear this chat</button>}</p>
              )}
            </div>
          )}
        </div>

        <form className="ch-bar" onSubmit={(e) => { e.preventDefault(); if (view === 'chat') send(text); else addFact(); }}>
          {view === 'chat'
            ? <input ref={input} className="ch-in" type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ask about your numbers" aria-label="Your question" enterKeyHint="send" autoComplete="off" />
            : <input className="ch-in" type="text" value={fact} onChange={(e) => setFact(e.target.value)} maxLength={160} placeholder="Add something Claude should know" aria-label="A new line for Claude to remember" enterKeyHint="done" autoComplete="off" />}
          <button type="submit" className="ch-send" aria-label={view === 'chat' ? 'Send' : 'Add to the list'} disabled={view === 'chat' ? !text.trim() || !!wait || msgs == null : !fact.trim() || memBusy}><Icon n={view === 'chat' ? 'arrow-up' : 'plus'} /></button>
        </form>
      </div>
    </div>,
    document.body
  );
}

// The field under the morning call. Tapping it opens the sheet with the keyboard ready; tapping a question asks it.
function ChatEntry({ all, idx, gym, weights, wake }) {
  const day = all[idx];
  const [open, setOpen] = useState(null);                       // null, or { ask } while the sheet is up
  const [chat, setChat] = useState({ messages: null, memory: null });   // kept here so reopening the sheet is instant
  const live = day.date === isoToday();
  const trained = !!(gym && gym.sessions && gym.sessions.some((s) => s.date === day.date));
  const asks = chSuggest(day, tonightPlan(all, idx, wake), trained, live);
  const asked = chat.messages ? chat.messages.filter((m) => m.role === 'user').length : 0;
  const title = live ? 'Ask about today' : `Ask about ${dayLabel(day.date)}`;
  return (
    <div className="ask">
      <button className="ask-open" aria-haspopup="dialog" onClick={() => setOpen({})}>
        <span>{title}</span>
        {asked > 0 && <small>{asked} asked</small>}
        <i className="ask-go"><Icon n="arrow-up" /></i>
      </button>
      <ul className="ask-sug" aria-label="Suggested questions">{asks.map((q) => <li key={q}><button className="chip" onClick={() => setOpen({ ask: q })}>{q}</button></li>)}</ul>
      {open && <ChatSheet date={day.date} title={title} ask={open.ask} asks={asks} chat={chat} setChat={setChat}
        getContext={() => chContext({ all, idx, gym, weights, wake })} onClose={() => setOpen(null)} />}
    </div>
  );
}
