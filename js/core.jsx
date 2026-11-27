// Shared setup for every file in js/. These run as classic scripts in the order index.html lists them and share
// one global scope, so a name declared here is visible to the files after it. The `global` and `exported` comments
// at the top of each file list what it takes from earlier files and what it gives to later ones.
/* exported useState, useEffect, useMemo, useRef, useLayoutEffect, useContext, mean, clamp */
/* exported londonMin, sessionHr, computeAll, band, weightSeries, usual, verdict, driverPoints */
/* exported minOfDay, tonightPlan, strainTarget, hm, dur, signed, clock, clock12, isoToday */
/* exported dayLabel, dOf, shortDate, wkDate, longDate, wkShort, cap1, watchList, warningLine */
/* exported driverSay, strainYardstick, strainSentence, planDays, ST_DAY, stT, stIso, stWeekStart */
/* exported ST_KIND, stKg, stDate, stPlural, stTopText, strengthWeeks, strengthLifts, stChange */
/* exported stSummary, JN_MIN, jnShift, jnDate, jnNights, jnTop, jnInsights, jnSay, jnNeed */
/* exported BA_DAYS, BA_MIN_READY, BA_CAP, baAge, baInputs, baTotal, baList, baYearsSay, baSplit */
/* exported bandHex, status, P, SLEEP_STAGES, Nav, reduceMotion, KEY_STORE, api */

const { useState, useEffect, useMemo, useRef, useLayoutEffect, createContext, useContext } = React;

// The pure logic in lib/, loaded before the app as plain scripts. The same files run in the Node tests.
const { mean, clamp, londonMin, sessionHr, computeAll, band, weightSeries, usual, verdict, driverPoints, minOfDay, tonightPlan, strainTarget } = window.Score;
const { hm, dur, signed, clock, clock12, isoToday, dayLabel, dOf, shortDate, wkDate, longDate, wkShort, cap1 } = window.Format;
const { watchList, warningLine, driverSay, strainYardstick, strainSentence } = window.Words;
const { planDays, ST_DAY, stT, stIso, stWeekStart, ST_KIND, stKg, stDate, stPlural, stTopText, strengthWeeks, strengthLifts, stChange, stSummary } = window.StrengthStats;
const { JN_MIN, jnShift, jnDate, jnNights, jnTop, jnInsights, jnSay, jnNeed } = window.Habits;
const { BA_DAYS, BA_MIN_READY, BA_CAP, baAge, baInputs, baTotal, baList, baYearsSay, baSplit } = window.BodyAgeStats;

const bandHex = (r) => ({ good: '#16ec06', meh: '#ffde00', bad: '#ff3b4e' }[band(r)] || 'transparent');
const status = (r) => ({ good: ['Recovered', 'a good day to push'], meh: ['Part recovered', 'train, but steady'], bad: ['Running low', 'keep it light today'] }[band(r)] || ['Not enough data', 'wear the watch to bed']);

// The palette in JavaScript, for SVG charts. The same colours are CSS tokens in css/base.css.
const P = { red: '#ff3b4e', amber: '#ffde00', green: '#16ec06', blue: '#0093e7', blueL: '#7cc6f2', blueD: '#0a5687',
  sleep: '#7ba1bb', rem: '#b9cfdd', light: '#3f5668', ink: '#ffffff', soft: '#dfe5ea', muted: '#aeb9c2', faint: '#7d8a95',
  track: '#2a3239', line: '#2c343b', line2: '#3a444d', tile: '#1d2328', tile2: '#262d33', bg: '#12171b', easy: '#56626d' };
const SLEEP_STAGES = [
  { k: 'deep_min', name: 'Deep', colour: P.sleep },
  { k: 'rem_min', name: 'REM', colour: P.rem },
  { k: 'core_min', name: 'Light', colour: P.light },
];

const Nav = createContext(null);

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Every call to the serverless functions in api/. The passphrase rides along in a header.
const KEY_STORE = 'ow_key';
async function api(path, opts = {}) {
  const key = localStorage.getItem(KEY_STORE) || '';
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-app-key': key, ...(opts.headers || {}) }, cache: 'no-store' });
  if (r.status === 401 || r.status === 503) { const e = new Error('key'); e.status = r.status; throw e; }
  return r.json();
}
