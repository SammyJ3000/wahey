const crypto = require('crypto');

// Constant-time check of the x-app-key header against APP_KEY.
function keyOk(req) {
  const expected = process.env.APP_KEY || '';
  const given = req.headers['x-app-key'];
  if (!expected || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { keyOk };
