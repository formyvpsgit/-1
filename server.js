require('./lib/env').load();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { applySecurityHeaders, sendJson, readBody, validatePlanInput } = require('./lib/security');
const { deviceId, clientIp, allow } = require('./lib/identity');
const credits = require('./lib/credits');
const { generatePlan, buildUserMessage } = require('./lib/openrouter');
const { extractJson, normalizePlan, demoPlan } = require('./lib/plan');

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const BLOCKED_DIRS = new Set(['lib', 'data', 'prompts', 'node_modules', '.git']);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const target = path.normalize(path.join(ROOT, rel));
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  const top = parts[0] || '';

  // Strict whitelist: root-level HTML files + the assets folder only
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) return notFound(res);
  if (parts.some((p) => p.startsWith('.') || BLOCKED_DIRS.has(p))) return notFound(res);

  const underAssets = top === 'assets';
  const rootHtml = parts.length === 1 && parts[0].toLowerCase().endsWith('.html');
  if (!underAssets && !rootHtml) return notFound(res);

  const ext = path.extname(target).toLowerCase();
  if (!MIME[ext]) return notFound(res);

  fs.readFile(target, (err, buf) => {
    if (err) return notFound(res);
    const isDynamic = ext === '.html' || ext === '.css' || ext === '.js';
    res.writeHead(200, {
      'Content-Type': MIME[ext],
      'Content-Length': buf.length,
      // No caching for code during development so edits show up instantly
      'Cache-Control': isDynamic ? 'no-store' : 'public, max-age=3600'
    });
    res.end(buf);
  });
}

function notFound(res) {
  const body = 'Not Found';
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

function fail(res, status, code, message) {
  sendJson(res, status, { ok: false, error: code, message });
}

async function handlePlan(req, res) {
  const ip = clientIp(req);
  const device = deviceId(req);

  if (!device) return fail(res, 400, 'DEVICE', 'Could not verify your identity. Refresh the page and try again.');
  if (!allow('dev:' + device, 6)) return fail(res, 429, 'RATE', 'Too many requests per minute. Please slow down.');
  if (!allow('ip:' + ip, 15)) return fail(res, 429, 'RATE', 'Too many requests. Please wait a moment.');

  const wallet = credits.remaining(device, ip);
  if (wallet.deviceRemaining < credits.PLAN_COST) {
    return fail(res, 429, 'NO_CREDITS', `Daily limit used up (${wallet.limit} credits). It renews automatically at midnight, UAE time.`);
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return fail(res, err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, err.code || 'BAD_INPUT', 'Invalid request.');
  }

  const checked = validatePlanInput(body);
  if (!checked.ok) return fail(res, 400, checked.error, 'Please double-check the submitted values.');
  const input = checked.data;

  let rawPlan = null;
  let mode = 'ai';
  let sources = [];
  let searched = false;
  try {
    const res = await generatePlan(buildUserMessage(input));
    rawPlan = extractJson(res.text);
    sources = res.sources || [];
    searched = !!res.searched;
    if (!rawPlan) throw Object.assign(new Error('NO_JSON'), { code: 'NO_JSON' });
  } catch (err) {
    console.warn('[plan] AI unavailable:', err.code || err.message, '| fallback to demo');
    mode = 'demo';
    rawPlan = demoPlan(input);
    sources = [];
  }

  const plan = normalizePlan(rawPlan, input);
  const charged = credits.charge(device, ip, credits.PLAN_COST);
  if (!charged.ok && mode === 'ai') {
    return fail(res, 429, 'NO_CREDITS', 'Your daily limit was used up before completing the request.');
  }

  sendJson(res, 200, {
    ok: true,
    mode,
    searched,
    sources,
    plan,
    credits: {
      remaining: charged.ok ? charged.deviceRemaining : credits.status(device, ip).remaining,
      limit: credits.DAILY_LIMIT,
      cost: credits.PLAN_COST
    }
  });
}

function handleMe(req, res, ip) {
  const device = deviceId(req);
  if (!device) return fail(res, 400, 'DEVICE', 'Could not verify your identity.');
  sendJson(res, 200, { ok: true, ...credits.status(device, ip) });
}

const server = http.createServer((req, res) => {
  applySecurityHeaders(res);

  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (_) {
    return notFound(res);
  }

  const ip = clientIp(req);

  if (req.method === 'GET' && pathname === '/api/me') return handleMe(req, res, ip);
  if (req.method === 'POST' && pathname === '/api/plan') return handlePlan(req, res);
  if (pathname.startsWith('/api/')) return fail(res, 404, 'NOT_FOUND', 'Not found.');
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'METHOD', 'Method not supported.');

  serveStatic(req, res, pathname);
});

process.on('uncaughtException', (err) => {
  console.error('[fatal]', err && err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandled]', err && err.message);
});

server.listen(PORT, () => {
  console.log(`Ruya running on http://localhost:${PORT}`);
  console.log(`Model: ${process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash'}`);
  console.log(`Key: ${process.env.OPENROUTER_API_KEY ? 'loaded from .env' : 'missing — demo mode'}`);
});
