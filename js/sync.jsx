// Pull to sync: the ring that drops from the top edge, and the pill that says what the phone is doing.
/* global useEffect, useRef */                                                                          // js/core.jsx
/* global Icon */                                                                                       // js/ui.jsx
/* exported PullToSync, SHORTCUT_NAME, SyncBar */

// Pull down from the top of any main screen to fetch again. Driven straight on the element (no React state per frame)
// so it tracks the finger 1:1; the pull is damped, and nothing happens unless the page is already at the top.
function PullToSync({ onSync, off }) {
  const el = useRef(null), offRef = useRef(off);
  offRef.current = off;
  useEffect(() => {
    const node = el.current, arc = node.querySelector('.arc'), C = 2 * Math.PI * 15, NEED = 72;
    let y0 = null, x0 = 0, dist = 0, pulling = false; const busy = false;
    const place = (d, settle) => {
      node.classList.toggle('settle', !!settle);
      node.style.transform = `translateY(${d}px)`;
      node.style.opacity = d <= 0 ? 0 : Math.min(1, d / 28);
    };
    const fill = (f) => { arc.style.strokeDasharray = C; arc.style.strokeDashoffset = C * (1 - f); };
    const reset = () => { node.classList.remove('armed', 'spin', 'done'); place(0, true); };
    const start = (e) => {
      if (busy || offRef.current || e.touches.length !== 1 || window.scrollY > 0) { y0 = null; return; }
      if (e.target.closest && e.target.closest('.ch-body, .ch-back, [role="dialog"], input, textarea, [data-noptr]')) { y0 = null; return; }
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; pulling = false; dist = 0;
    };
    const move = (e) => {
      if (y0 == null || busy) return;
      const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
      if (!pulling) {
        if (dy < 8 || Math.abs(dx) > dy || window.scrollY > 0) { if (dy < -4 || Math.abs(dx) > 12) y0 = null; return; }
        pulling = true; node.classList.remove('done', 'spin');
      }
      if (e.cancelable) e.preventDefault();
      dist = 150 * (1 - Math.exp(-dy / 190));                      // follows the finger at first, then resists
      fill(Math.min(1, dist / NEED));
      node.classList.toggle('armed', dist >= NEED);
      place(dist);
    };
    const end = () => {
      if (y0 == null || !pulling) { y0 = null; return; }
      y0 = null; pulling = false;
      if (dist < NEED) return reset();
      reset();
      onSync();                                                     // called inside the touch itself, so iOS lets it open the Shortcut
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
    return () => { document.removeEventListener('touchstart', start); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end); };
  }, []);
  return (
    <div className="ptr" ref={el} aria-hidden="true">
      <svg viewBox="0 0 44 44"><g className="ring"><circle className="trk" cx="22" cy="22" r="15" /><circle className="arc" cx="22" cy="22" r="15" /><path className="tick" d="M15.5 22.5l4.5 4.5 8.5-9.5" /></g></svg>
    </div>
  );
}

// What the pull is doing, as a small pill under the status bar: a line that runs while the phone sends, then a tick.
const SHORTCUT_NAME = 'Send To Recovery';                    // the iPhone Shortcut that sends Apple Health to this app
function SyncBar({ sync }) {
  if (!sync) return null;
  const say = { send: 'Asking your phone for the latest', wait: 'Getting the latest from your phone', done: 'Up to date', none: 'Nothing new from your phone yet', plain: 'Refreshing' }[sync.phase];
  const busy = sync.phase === 'send' || sync.phase === 'wait' || sync.phase === 'plain';
  return (
    <div className={'syncbar' + (busy ? ' busy' : ' end')} role="status" aria-live="polite">
      <span>{sync.phase === 'done' && <Icon n="check" />}{say}</span>
      <i />
    </div>
  );
}
