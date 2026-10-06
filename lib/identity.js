const crypto = require('crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// سجل محدود في الذاكرة لمنع الطلبات المتكررة (طيارات)
const buckets = new Map();
const WINDOW_MS = 60000;

function deviceId(req) {
  const raw = (req.headers['x-device-id'] || '').trim().slice(0, 64);
  return UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

function clientIp(req) {
  const raw = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  const ip = raw.replace(/^::ffff:/i, '');
  return ip.length > 45 ? 'unknown' : ip;
}

function allow(key, max, windowMs = WINDOW_MS) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  b.count += 1;
  return b.count <= max;
}

function sweep() {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.start > WINDOW_MS * 2) buckets.delete(k);
}

setInterval(sweep, 60000).unref();

module.exports = { deviceId, clientIp, allow };
