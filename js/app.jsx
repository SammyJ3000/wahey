// The app shell: loading, the passphrase sheet, the tabs, the detail screens and moving between them.
/* global api, clock12, computeAll, dayLabel, isoToday, KEY_STORE, longDate, Nav, reduceMotion */       // js/core.jsx
/* global shortDate, status, useEffect, useMemo, useRef, useState, weightSeries */                      // js/core.jsx
/* global Hatch, Icon */                                                                                // js/ui.jsx
/* global PullToSync, SHORTCUT_NAME, SyncBar */                                                         // js/sync.jsx
/* global chDayPayload */                                                                               // js/chat.jsx
/* global Today */                                                                                      // js/screens/today.jsx
/* global RecoveryScreen */                                                                             // js/screens/recovery.jsx
/* global SleepScreen */                                                                                // js/screens/sleep.jsx
/* global StrainScreen */                                                                               // js/screens/strain.jsx
/* global Trends */                                                                                     // js/screens/trends.jsx
/* global Strength */                                                                                   // js/screens/strength.jsx

function KeySheet({ onSave, onCancel, message }) {
  const [v, setV] = useState('');
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="key-h">
      <form className="panel" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSave(v.trim()); }}>
        <h2 id="key-h">Your passphrase</h2>
        <p className="say">{message || 'The one you set as APP_KEY. It stays on this phone.'}</p>
        <label htmlFor="key-i">Passphrase</label>
        <input id="key-i" type="password" value={v} onChange={(e) => setV(e.target.value)} autoFocus autoComplete="current-password" />
        <button className="btn" type="submit" disabled={!v.trim()}>Save passphrase</button>
        {onCancel && <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>}
      </form>
    </div>
  );
}

const Skeleton = () => (
  <div className="page" aria-busy="true" aria-label="Loading your data">
    <header className="top"><h1>Today</h1></header>
    <div className="grid" style={{ marginTop: 22 }}>
      <div className="skel-t c6" style={{ height: 330, borderRadius: 26 }} /><div className="skel-t c6" style={{ height: 190 }} /><div className="skel-t c4" style={{ height: 170 }} /><div className="skel-t c2" style={{ height: 170 }} />
    </div>
  </div>
);

const TABS = [['today', 'Today', 'sun-horizon'], ['trends', 'Trends', 'chart-line'], ['strength', 'Strength', 'barbell']];

function App() {
  const names = TABS.map((t) => t[0]);
  const [tab, setTabState] = useState(names.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today');
  const [view, setView] = useState(null);            // null, or the detail pushed on top of Today: recovery, sleep, strain
  const [vt, setVt] = useState(null);                // which tile the detail grew out of
  const [mk, setMk] = useState('recovery');
  const [days, setDays] = useState(null);
  const [gym, setGym] = useState(null);
  const [journal, setJournal] = useState([]);
  const onJournal = (date, entry) => setJournal((list) => [...list.filter((e) => e.date !== date), ...(entry ? [entry] : [])].sort((a, b) => a.date.localeCompare(b.date)));
  const [needKey, setNeedKey] = useState(false);
  const [failed, setFailed] = useState(false);
  const [coach, setCoach] = useState({});
  const [idx, setIdx] = useState(null);
  const [dx, setDx] = useState('0px');
  const [wake, setWake] = useState(() => { try { const v = localStorage.getItem('ow_wake'); return v == null ? null : Number(v); } catch { return null; } });
  const saveWake = (m) => { setWake(m); try { localStorage.setItem('ow_wake', String(m)); } catch {} };
  const touch = useRef(null), scrollY = useRef(0), viewRef = useRef(null);
  viewRef.current = view;

  async function load(quiet) {
    if (!quiet) setFailed(false);
    try {
      const [h, g, j] = await Promise.all([api('/api/health'), api('/api/gym').catch(() => null), api('/api/journal').catch(() => null)]);   // the journal never blocks the app
      setDays(h.days || []); setGym(g); setJournal((j && Array.isArray(j.entries) && j.entries) || []); setNeedKey(false);
    } catch (e) { if (e.message === 'key') setNeedKey(e.status === 503 ? 'server' : true); else if (!quiet) setFailed(true); }   // a failed background refresh keeps what's already on screen
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const f = () => load(true); window.addEventListener('ow-refresh', f); return () => window.removeEventListener('ow-refresh', f); }, []);

  // Pull to sync: hand over to the iPhone Shortcut (the only thing allowed to read Apple Health), then, back in the app,
  // wait until the server has heard from the phone and show the fresh numbers.
  const [sync, setSync] = useState(null);
  const syncing = useRef(false);
  function syncFromPhone() {
    if (syncing.current) return;
    syncing.current = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const finish = (phase) => { setSync({ phase }); setTimeout(() => { setSync(null); syncing.current = false; }, phase === 'done' ? 1500 : 3200); };
    let left = false;
    const seen = () => { if (document.visibilityState === 'hidden') left = true; };
    document.addEventListener('visibilitychange', seen);
    const before = api('/api/health?sync=1').then((x) => x.at || null).catch(() => undefined);   // when the phone last sent, before this pull
    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);    // the Shortcut only exists on the phone
    setSync({ phase: iphone ? 'send' : 'plain' });
    if (iphone) window.location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT_NAME);
    (async () => {
      await wait(iphone ? 1600 : 0);
      if (!left) {                                                    // not on an iPhone, or the hand-over was blocked: an ordinary refresh
        document.removeEventListener('visibilitychange', seen);
        setSync({ phase: 'plain' }); await Promise.all([load(true), wait(500)]); return finish('done');
      }
      while (document.visibilityState !== 'visible') await wait(300);
      document.removeEventListener('visibilitychange', seen);
      setSync({ phase: 'wait' });
      const was = await before, until = Date.now() + 75000;
      let got = false;
      while (Date.now() < until && !got) {
        try { const now = await api('/api/health?sync=1'); got = !!now.at && now.at !== was; } catch {}
        if (!got) await wait(2500);
      }
      await load(true);
      finish(got ? 'done' : 'none');
    })();
  }

  // A home-screen app is kept alive in the background, so reopening it doesn't reload the page.
  // Fetch again whenever it comes back to the front, and jump to today if the date has moved on.
  useEffect(() => {
    let left = Date.now(), day = isoToday();
    const onVis = () => {
      if (document.visibilityState === 'hidden') { left = Date.now(); return; }
      if (Date.now() - left < 30000) return;
      if (isoToday() !== day) { day = isoToday(); setIdx(null); }
      load(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Always include today, even before any data has arrived, so the app opens on today rather than the last good morning.
  const all = useMemo(() => { if (!days) return []; const t = isoToday(); return computeAll(days.length && days[days.length - 1].date >= t ? days : [...days, { date: t }]); }, [days]);
  const weights = useMemo(() => (days ? weightSeries(days, gym && gym.body) : []), [days, gym]);
  const latest = useMemo(() => { let i = all.length - 1; while (i > 0 && all[i].recovery == null) i--; return i; }, [all]);
  const scored = useMemo(() => all.map((d, i) => (d.recovery != null || d.sleep || i === all.length - 1 ? i : null)).filter((i) => i != null), [all]);
  useEffect(() => { if (idx == null && all.length) setIdx(all.length - 1); }, [all]);

  // Claude's call, for the latest scored morning only.
  useEffect(() => {
    const day = all[latest];
    if (!day || day.recovery == null) return;
    setCoach({ loading: true });
    api('/api/coach', { method: 'POST', body: JSON.stringify(chDayPayload(all, latest, gym, weights)) }).then((r) => {
      if (!r.message) return setCoach({ error: r.error || 'no reply' });
      const [title, ...rest] = r.message.split(/\n\s*\n/);
      setCoach({ message: r.message, title: rest.length ? title.replace(/[.#*]/g, '').trim() : status(day.recovery)[0], body: rest.length ? rest.join(' ').trim() : r.message });
    }).catch(() => setCoach({ error: 'offline' }));
  }, [all.length, latest, all[latest] && all[latest].recovery]);   // a corrected score gets a fresh call, not this morning's old one

  /* Moving between screens. A detail is pushed over Today and popped back; Today stays mounted underneath so its scroll
     position and its charts are exactly as they were left. Where the browser can, the tapped tile grows into the detail's hero. */
  const canVT = typeof document.startViewTransition === 'function';
  const move = (dir, change) => {
    if (!canVT || reduceMotion()) { ReactDOM.flushSync(change.set); change.after(); return Promise.resolve(); }
    document.documentElement.dataset.nav = dir;
    const t = document.startViewTransition(() => { ReactDOM.flushSync(change.set); change.after(); });
    return t.finished.catch(() => {}).then(() => { delete document.documentElement.dataset.nav; });
  };
  const openView = (v, src) => {
    if (viewRef.current) return;
    scrollY.current = window.scrollY;
    ReactDOM.flushSync(() => setVt(src || v));
    history.pushState({ view: v }, '');
    move('push', { set: () => setView(v), after: () => window.scrollTo(0, 0) });
  };
  const closeView = () => {
    if (!viewRef.current) return;
    move('pop', { set: () => setView(null), after: () => window.scrollTo(0, scrollY.current) }).then(() => setVt(null));
  };
  useEffect(() => { const pop = () => closeView(); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const setTab = (t, metric) => {
    if (metric) setMk(metric);
    if (viewRef.current) { if (t === 'today') { history.back(); return; } setView(null); setVt(null); }
    if (t === tab && !viewRef.current) { window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); return; }
    setTabState(t); history.replaceState(null, '', t === 'today' ? location.pathname + location.search : '#' + t); window.scrollTo(0, 0);
  };
  const nav = { open: openView, back: () => history.back(), tab: setTab, vt, enter: canVT && !reduceMotion() ? '' : reduceMotion() ? 'fade' : 'push' };

  if (needKey) return <KeySheet message={needKey === 'server' ? 'The server doesn’t have its APP_KEY yet.' : null} onCancel={days ? () => setNeedKey(false) : null} onSave={(k) => { localStorage.setItem(KEY_STORE, k); load(); }} />;
  if (failed && !days) return (
    <div className="page"><div className="waiting"><h2>Couldn’t load your data</h2><p className="say">The app couldn’t reach its server. Check your connection and try again.</p><button className="btn" style={{ marginTop: 20 }} onClick={load}>Try again</button></div></div>
  );
  if (!days || idx == null) return days && !all.length ? <div className="page"><div className="waiting"><h2>No data yet</h2><p className="say">Run the morning Shortcut or the importer and your first day shows here.</p></div></div> : <Skeleton />;

  const day = all[idx], pos = scored.indexOf(idx);
  // Newer days come in from the right, older from the left, so the days feel laid out in a line.
  const go = (dir) => { const n = scored[pos + dir]; if (n == null) return; setDx(dir > 0 ? '24px' : '-24px'); setIdx(n); };
  const watchLast = all.slice().reverse().find((d) => d.sleep || d.rhr);
  const stale = watchLast && watchLast.date !== isoToday();
  const syncM = day.date === isoToday() && day.hr_min && day.hr_min.length ? day.hr_min[day.hr_min.length - 2] : null;
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, t: performance.now() }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0], ddx = t.clientX - s.x, ddy = t.clientY - s.y, v = Math.abs(ddx) / (performance.now() - s.t);
    if (Math.abs(ddx) > Math.abs(ddy) * 1.5 && (Math.abs(ddx) > 60 || v > 0.4)) go(ddx < 0 ? 1 : -1);   // a quick flick is enough
  };
  const isLatest = idx === latest, showTarget = isLatest || idx === all.length - 1;

  return (
    <Nav.Provider value={nav}>
      <Hatch />
      <PullToSync onSync={syncFromPhone} off={!!view} />
      <SyncBar sync={sync} />
      <main>
        {tab === 'today' ? (<div className="screen" key="today">
          <div className="page today" hidden={!!view} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <header className="top">
              <div className="daynav">
                <button className="chev" aria-label="Previous day" disabled={pos <= 0} onClick={() => go(-1)}><Icon n="caret-left" /></button>
                <h1>{dayLabel(day.date)}</h1>
                <button className="chev" aria-label="Next day" disabled={pos >= scored.length - 1} onClick={() => go(1)}><Icon n="caret-right" /></button>
              </div>
              <button className="iconbtn" aria-label="Change passphrase" onClick={() => setNeedKey(true)}><Icon n="key" /></button>
            </header>
            <p className="sub"><span>{longDate(day.date)}</span>{syncM != null ? <span><Icon n="watch" />Synced {clock12(syncM)}</span> : stale && day.date === isoToday() ? <span><Icon n="watch" />Watch last synced {shortDate(watchLast.date)}</span> : null}</p>
            <Today all={all} idx={idx} gym={gym} weights={weights} coach={coach} isLatest={isLatest} dx={dx} wake={wake} saveWake={saveWake} journal={journal} onJournal={onJournal}
              watchLast={watchLast} onLatest={() => { setDx('-24px'); setIdx(latest); }} latestLabel={all[latest] && all[latest].recovery != null ? dayLabel(all[latest].date) : null} />
          </div>
          {view === 'recovery' && <RecoveryScreen all={all} idx={idx} />}
          {view === 'sleep' && <SleepScreen all={all} idx={idx} isLatest={isLatest} wake={wake} saveWake={saveWake} />}
          {view === 'strain' && <StrainScreen all={all} idx={idx} gym={gym} showTarget={showTarget} />}
        </div>) : tab === 'trends' ? <div className="screen" key="trends"><Trends all={all} latest={latest} weights={weights} mk={mk} setMk={setMk} gym={gym} journal={journal} /></div>
          : <div className="screen" key="strength"><Strength gym={gym} all={all} latest={latest} /></div>}
      </main>
      <nav className="tabs" aria-label="Screens"><div>
        {TABS.map(([k, l, icon]) => <button key={k} className="tab" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}><span className="pill"><Icon n={icon} /></span>{l}</button>)}
      </div></nav>
    </Nav.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
