// Small pieces every screen uses: counters, icons, typed text, tiles, labels and the segmented control.
/* global clock12, dayLabel, Nav, P, useContext, useEffect, useRef, useState, wkDate */                 // js/core.jsx
/* exported useCount, Rich, Icon, Typed, Dur, clockParts, Fresh, Tile, Lab, Hatch, Seg, Detail */

function useCount(target, ms = 900) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null) { setV(null); return; }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    const start = performance.now(), a = from.current || 0;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * e;
      setV(cur); from.current = cur;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

// Bold the numbers in Claude's message so they scan, the way WHOOP's coach does.
function Rich({ text }) {
  const parts = text.split(/(\d+(?:\.\d+)?\s?(?:%|bpm|ms|kg|hours?|h|minutes?|mins?|m)?)/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}

const Icon = ({ n }) => <i className={'ph ph-' + n} aria-hidden="true" />;

// Claude's words arrive one by one, the numbers in bold so they scan.
function Typed({ text, start = 0 }) {
  const toks = [];
  text.split(/(\d+(?:\.\d+)?\s?(?:%|bpm|ms|kg|hours?|h|minutes?|mins?|m)?)/g).forEach((p, i) => p.split(/(\s+)/).forEach((w) => w && toks.push({ w, b: i % 2 === 1 })));
  const words = toks.filter((t) => !/^\s+$/.test(t.w)).length;
  const step = Math.min(32, 1100 / Math.max(1, words));
  let n = 0;
  return <>{toks.map((t, k) => /^\s+$/.test(t.w) ? t.w : <span key={k} className="w" style={{ animationDelay: `${start + n++ * step}ms` }}>{t.b ? <b>{t.w}</b> : t.w}</span>)}</>;
}

// 7h 02m with the units set small, as on every number in the app.
function Dur({ m }) {
  if (m == null) return '–';
  const t = Math.round(m), h = Math.floor(t / 60), mm = t % 60;
  return h ? <>{h}<small className="hh">h</small>{String(mm).padStart(2, '0')}<small>m</small></> : <>{mm}<small>m</small></>;
}
// 10:49pm as [10:49, pm]
const clockParts = (m) => { const s = clock12(m); return [s.slice(0, -2), s.slice(-2)]; };

// A screen (or one chart) wears .fresh for its first moments so marks grow in once, then never again.
function Fresh({ k, className = '', children, ...rest }) {
  const [f, setF] = useState(true);
  useEffect(() => { setF(true); const t = setTimeout(() => setF(false), 1700); return () => clearTimeout(t); }, [k]);
  return <div className={(f ? 'fresh ' : '') + className} {...rest}>{children}</div>;
}

function Tile({ c = 6, r2, hero, open, openLabel, vt, className = '', children }) {
  return (
    <section className={`t c${c}${r2 ? ' r2' : ''}${hero ? ' hero' : ''}${open ? ' tap' : ''} ${className}`} style={vt ? { viewTransitionName: 'hero' } : undefined}>
      {open && <button className="hit" aria-label={openLabel} onClick={open} />}
      {children}
    </section>
  );
}
const Lab = ({ children, icon, right, go }) => (
  <div className="lab"><span className="l">{icon && <Icon n={icon} />}{children}</span>{right != null ? <span className="wt">{right}</span> : go != null ? <span className="go">{go}<Icon n="caret-right" /></span> : null}</div>
);

const Hatch = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke={P.line2} strokeWidth="1.5" /></pattern>
  </defs></svg>
);

function Seg({ items, value, onChange, label }) {
  const i = Math.max(0, items.findIndex(([v]) => v === value));
  return (
    <div className="seg" role="group" aria-label={label} style={{ '--n': items.length, '--i': i }}>
      <span className="thumb" aria-hidden="true" />
      {items.map(([v, l]) => <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

// The frame of a detail screen pushed over Today: back button, title, then a grid of tiles.
function Detail({ title, day, children }) {
  const nav = useContext(Nav);
  return (
    <Fresh k={title + day.date} className={'detail page ' + nav.enter}>
      <header className="top"><button className="back" onClick={nav.back}><Icon n="caret-left" />{dayLabel(day.date) === 'Today' ? 'Today' : dayLabel(day.date)}</button><span className="wt" style={{ fontSize: 13 }}>{wkDate(day.date)}</span></header>
      <h1 className="title">{title}</h1>
      <div className="grid">{children}</div>
    </Fresh>
  );
}
