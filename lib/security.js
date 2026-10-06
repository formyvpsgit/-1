const MAX_BODY = 16 * 1024;

function applySecurityHeaders(res) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; " +
      "connect-src 'self'; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'none'; " +
      "form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const tooBig = () => {
      reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { code: 'PAYLOAD_TOO_LARGE' }));
      req.destroy();
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > max) return tooBig();
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (_) {
        reject(Object.assign(new Error('BAD_JSON'), { code: 'BAD_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

function num(v, min, max, fallback = null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function str(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

const GOALS = ['home', 'stocks', 'marriage', 'emergency', 'education', 'retire', 'debt', 'business'];
const RISKS = ['conservative', 'balanced', 'aggressive'];
const HORIZONS = ['1', '3', '5', '10'];

function enumOf(v, list, fallback) {
  const s = str(v, 32);
  return list.includes(s) ? s : fallback;
}

// Validate user input + trim every long string (defense against prompt injection)
function validatePlanInput(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'BAD_INPUT' };

  const income = num(raw.income, 500, 1000000, null);
  if (income === null) return { ok: false, error: 'INCOME_REQUIRED' };

  const data = {
    income,
    fixedExpenses: num(raw.fixedExpenses, 0, 1000000, 0),
    otherExpenses: num(raw.otherExpenses, 0, 1000000, 0),
    currentSavings: num(raw.currentSavings, 0, 100000000, 0),
    goalAmount: num(raw.goalAmount, 0, 1000000000, 0),
    goal: enumOf(raw.goal, GOALS, 'emergency'),
    risk: enumOf(raw.risk, RISKS, 'balanced'),
    horizon: enumOf(raw.horizon, HORIZONS, '3'),
    dependents: num(raw.dependents, 0, 20, 0),
    note: str(raw.note, 200)
  };
  return { ok: true, data };
}

module.exports = {
  applySecurityHeaders,
  sendJson,
  readBody,
  validatePlanInput
};
