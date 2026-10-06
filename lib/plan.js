// Normalize the AI plan: extract JSON + sanitize every value before it reaches the browser

function pickString(v, max = 600) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function pickNum(v, min, max, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function extractJson(text) {
  const candidates = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  candidates.push(text);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return null;
}

function sanitizeChannels(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 6).map((c) => ({
    name: pickString(c && c.name, 80) || 'Investment channel',
    risk: pickString(c && c.risk, 40) || '—',
    horizon: pickString(c && c.horizon, 40) || '—',
    share: pickNum(c && c.share, 0, 100, 0),
    note: pickString(c && c.note, 300)
  }));
}

function sanitizeActions(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 6).map((a) => ({
    title: pickString(a && a.title, 100) || 'Action',
    detail: pickString(a && a.detail, 300),
    saving: pickNum(a && a.saving, 0, 1000000, 0)
  }));
}

function pickStringList(list, max, count) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, count).map((s) => pickString(s, max)).filter(Boolean);
}

function normalizePlan(raw, input) {
  const budget = raw.budget || {};
  const income = input.income;
  const needsAed = pickNum(budget.needs_aed, 0, 1000000, Math.round(income * 0.5));
  const wantsAed = pickNum(budget.wants_aed, 0, 1000000, Math.round(income * 0.3));
  const savingsAed = pickNum(budget.savings_aed, 0, 1000000, income - needsAed - wantsAed > 0 ? income - needsAed - wantsAed : 0);
  const sum = needsAed + wantsAed + savingsAed || 1;

  return {
    summary: pickString(raw.summary, 900),
    headline: pickString(raw.headline, 160),
    rationale: pickStringList(raw.rationale, 300, 5),
    budget: {
      needs_pct: Math.round((needsAed / sum) * 100),
      wants_pct: Math.round((wantsAed / sum) * 100),
      savings_pct: 100 - Math.round((needsAed / sum) * 100) - Math.round((wantsAed / sum) * 100),
      needs_aed: needsAed,
      wants_aed: wantsAed,
      savings_aed: savingsAed
    },
    runway: {
      emergency_months: pickNum(raw.runway && raw.runway.emergency_months, 0, 36, 6),
      emergency_aed: pickNum(raw.runway && raw.runway.emergency_aed, 0, 100000000, needsAed * 6),
      months_to_goal: pickNum(raw.runway && raw.runway.months_to_goal, 0, 1200, 0),
      current_savings: input.currentSavings,
      target: input.goalAmount
    },
    channels: sanitizeChannels(raw.channels),
    actions: sanitizeActions(raw.actions),
    risks: pickStringList(raw.risks, 240, 6),
    disclaimer:
      pickString(raw.disclaimer, 400) ||
      'This is an automatically generated educational analysis, not licensed financial advice. Consult a licensed financial advisor before making any investment decision.'
  };
}

// Fallback mode: if the AI API fails, the site keeps working with a local plan
function demoPlan(input) {
  const income = input.income;
  const needs = Math.max(input.fixedExpenses + input.otherExpenses, Math.round(income * 0.5));
  const savings = Math.max(0, Math.round(income * 0.2));
  const wants = Math.max(0, income - needs - savings);

  const raw = {
    headline: 'A balanced money plan',
    summary:
      `Your monthly income is AED ${income.toLocaleString('en-US')} and your commitments are AED ${(input.fixedExpenses + input.otherExpenses).toLocaleString('en-US')}. ` +
      `This plan suggests directing AED ${savings.toLocaleString('en-US')} every month to saving and investing while keeping a comfortable emergency fund.`,
    rationale: [
      `Commitments are ${Math.round(((input.fixedExpenses + input.otherExpenses) / income) * 100)}% of your AED ${income.toLocaleString('en-US')} income — ${input.fixedExpenses + input.otherExpenses <= income * 0.35 ? 'within the safe limit (35%)' : 'above the safe limit (35%) and should be reduced'}.`,
      `Monthly net remainder: AED ${(income - input.fixedExpenses - input.otherExpenses).toLocaleString('en-US')}, with a suggested saving rate of ${Math.round((savings / income) * 100)}% of income.`,
      `Financial safety: we target 6 months of commitments = AED ${(needs * 6).toLocaleString('en-US')} as an emergency fund before any investing.`,
      input.goalAmount > 0
        ? `Goal of AED ${input.goalAmount.toLocaleString('en-US')} against AED ${input.currentSavings.toLocaleString('en-US')} saved: you need AED ${Math.max(0, input.goalAmount - input.currentSavings).toLocaleString('en-US')} more — about ${savings > 0 ? Math.ceil((input.goalAmount - input.currentSavings) / savings) : '∞'} months at AED ${savings.toLocaleString('en-US')} per month.`
        : `No goal amount was set, so savings are split between the safety fund and long-term investing.`,
      `We picked channels with stepwise risk that fit a ${input.horizon}-year horizon and a ${input.risk === 'conservative' ? 'Conservative' : input.risk === 'aggressive' ? 'Bold' : 'Balanced'} risk tolerance.`
    ],
    budget: { needs_aed: needs, wants_aed: wants, savings_aed: savings },
    runway: {
      emergency_months: 6,
      emergency_aed: needs * 6,
      months_to_goal: input.goalAmount > 0 && savings > 0 ? Math.ceil((input.goalAmount - input.currentSavings) / savings) : 0
    },
    channels: [
      { name: 'Emergency fund (bank deposits)', risk: 'Low', horizon: 'Immediate', share: 30, note: 'Save 6 months of commitments in an account you can withdraw from within two days.' },
      { name: 'High-yield savings account', risk: 'Low', horizon: '6+ months', share: 20, note: 'Open an account that pays regular interest on the balance.' },
      { name: 'Local funds / sukuk', risk: 'Medium', horizon: '3+ years', share: 30, note: 'Start small through investment funds registered in the UAE.' },
      { name: 'Local shares (Dubai / Abu Dhabi markets)', risk: 'High', horizon: '5+ years', share: 20, note: 'Spread across several sectors and stay away from short-term speculation.' }
    ],
    actions: [
      { title: 'Cut unused subscriptions', detail: 'Review monthly subscriptions and recurring charges, and cancel what you do not need.', saving: 300 },
      { title: 'Automate saving at the start of the month', detail: 'Transfer the savings amount automatically on payday, before you spend.', saving: savings },
      { title: 'Cap entertainment spending', detail: 'Set a fixed monthly amount and enjoy it without crossing the cap.', saving: 200 }
    ],
    risks: [
      'Do not invest all your savings at once; start gradually.',
      'Avoid commitments above 35% of your monthly income.',
      'Never touch the emergency fund for investing.'
    ]
  };
  return raw;
}

module.exports = { extractJson, normalizePlan, demoPlan };
