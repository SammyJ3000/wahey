// Formatting for Wahey: durations, clock times and dates as the app writes them, always en-GB.
// Pure functions with no DOM. In the browser it sets window.Format (index.html loads it before the app); in Node it is a CommonJS module.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Format = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Minutes as "7h 05m". Null reads as a dash.
  const hm = (m) => (m == null ? '–' : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`);

  // Minutes as "45m" under an hour, "7h 05m" from an hour.
  const dur = (m) => (m == null ? '–' : m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`);

  // A whole number with its sign, using a true minus.
  const signed = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');

  // An ISO time as "10:49pm" in UK time.
  const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(/\s/g, '').toLowerCase() : '');

  // Minutes after midnight as "10:49pm". Wraps past midnight either way.
  const clock12 = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440, h = Math.floor(x / 60); return `${h % 12 || 12}:${String(x % 60).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; };

  // Dates. A YYYY-MM-DD day is read at local noon so it never slips a day across time zones.
  const isoToday = () => new Date().toLocaleDateString('en-CA');
  const dayLabel = (iso) => {
    const y = new Date(Date.now() - 864e5).toLocaleDateString('en-CA');
    if (iso === isoToday()) return 'Today';
    if (iso === y) return 'Yesterday';
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const dOf = (iso) => new Date(iso + 'T12:00:00');
  const shortDate = (iso) => dOf(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const wkDate = (iso) => dOf(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  const longDate = (iso) => dOf(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  const wkShort = (iso) => dOf(iso).toLocaleDateString('en-GB', { weekday: 'short' });
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const listAnd = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

  return {
    hm,
    dur,
    signed,
    clock,
    clock12,
    isoToday,
    dayLabel,
    dOf,
    shortDate,
    wkDate,
    longDate,
    wkShort,
    cap1,
    listAnd,
  };
});
