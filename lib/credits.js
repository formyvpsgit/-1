const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');
const DAILY_LIMIT = Number(process.env.DAILY_CREDIT_LIMIT) || 1000;
const PLAN_COST = Number(process.env.CREDIT_COST_PER_PLAN) || 5;
const IP_MULTIPLIER = 5;

function dayKey(date = new Date()) {
  return new Date(date.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function resetAt() {
  const now = Date.now();
  return now - (now + 4 * 3600 * 1000) % 86400000 + 86400000;
}

function read() {
  const today = dayKey();
  let ledger = { day: today, devices: {}, ips: {} };
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (parsed && parsed.day === today) ledger = parsed;
    }
  } catch (_) {
    // ملف تالف: نبدأ سجل جديد بدل ما ننهار
  }
  return ledger;
}

function write(ledger) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(ledger), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error('[credits] write failed:', err.code || err.message);
  }
}

function used(ledger, deviceId, ip) {
  return {
    device: ledger.devices[deviceId] || 0,
    ip: ledger.ips[ip] || 0
  };
}

function remaining(deviceId, ip) {
  const ledger = read();
  const u = used(ledger, deviceId, ip);
  return {
    deviceRemaining: Math.max(0, DAILY_LIMIT - u.device),
    ipRemaining: Math.max(0, DAILY_LIMIT * IP_MULTIPLIER - u.ip),
    limit: DAILY_LIMIT,
    cost: PLAN_COST,
    resetAt: resetAt(),
    day: ledger.day
  };
}

function charge(deviceId, ip, amount = PLAN_COST) {
  const ledger = read();
  const u = used(ledger, deviceId, ip);
  if (u.device + amount > DAILY_LIMIT) return { ok: false, reason: 'DEVICE_LIMIT' };
  if (u.ip + amount > DAILY_LIMIT * IP_MULTIPLIER) return { ok: false, reason: 'IP_LIMIT' };
  ledger.devices[deviceId] = u.device + amount;
  ledger.ips[ip] = u.ip + amount;
  write(ledger);
  return { ok: true, deviceRemaining: DAILY_LIMIT - ledger.devices[deviceId] };
}

function status(deviceId, ip) {
  const s = remaining(deviceId, ip);
  return {
    remaining: s.deviceRemaining,
    limit: s.limit,
    cost: s.cost,
    used: s.limit - s.deviceRemaining,
    resetAt: s.resetAt
  };
}

module.exports = { DAILY_LIMIT, PLAN_COST, dayKey, remaining, charge, status };
