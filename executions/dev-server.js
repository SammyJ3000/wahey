#!/usr/bin/env node
// Local preview: serves index.html and its static files, and runs api/*.js the way Vercel does. Reads .env if there is one.
//   node executions/dev-server.js   -> http://localhost:4321
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 4321);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// No .env yet: run with a throwaway local passphrase and hand it to the page, so the preview works straight away.
const DEV_KEY = !process.env.APP_KEY || process.argv.includes('--dev-key');   // --dev-key: keep the real API keys from .env but use a local passphrase
if (DEV_KEY) { process.env.APP_KEY = 'local-dev'; console.log('No APP_KEY in .env: using a local-only dev passphrase.'); }

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
    const file = path.join(ROOT, 'api', name + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('no such api'); }
    let body = '';
    for await (const chunk of req) body += chunk;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = body && /json/.test(req.headers['content-type'] || '') ? JSON.parse(body) : body; } catch { req.body = body; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    res.send = (s) => { res.end(s); return res; };
    delete require.cache[require.resolve(file)];
    try { await require(file)(req, res); } catch (e) { console.error(e); res.statusCode = 500; res.end(String(e)); }
    return;
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (DEV_KEY && rel === 'index.html') {
    // CLOCK_OFFSET_MS shifts the page's clock (to preview an earlier day as "today"); local preview only.
    const off = Number(process.env.CLOCK_OFFSET_MS || 0);
    const clock = off ? `<script>(()=>{const D=Date,off=${off};class F extends D{constructor(...a){if(a.length)super(...a);else super(D.now()+off);}static now(){return D.now()+off;}}window.Date=F;})()</script>` : '';
    return res.end(fs.readFileSync(file, 'utf8').replace('<head>', '<head>' + clock).replace('</head>', "<script>localStorage.setItem('ow_key','local-dev')</script></head>"));
  }
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Wahey running on http://localhost:${PORT}`));
