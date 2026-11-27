// Storage: a private Vercel Blob store in production, plain files in tmp/store locally.
const fs = require('fs');
const path = require('path');

const LOCAL = path.join(__dirname, '..', 'tmp', 'store');
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const opts = { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true };

async function readJSON(name, fallback) {
  if (useBlob()) {
    const { get } = require('@vercel/blob');
    try {
      const r = await get(name, { access: 'private', useCache: false });
      if (!r || !r.stream) return fallback;
      return JSON.parse(await new Response(r.stream).text());
    } catch (e) {
      if (/not.?found|404/i.test(String(e && e.message))) return fallback;
      throw e;
    }
  }
  const file = path.join(LOCAL, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

async function writeJSON(name, value) {
  const body = JSON.stringify(value);
  if (useBlob()) {
    const { put } = require('@vercel/blob');
    return put(name, body, opts);
  }
  const file = path.join(LOCAL, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

module.exports = { readJSON, writeJSON };
