/* Ruya — analysis logic: safe submit + rendering without any innerHTML for plan content */
(function () {
  'use strict';

  var form = document.getElementById('planForm');
  if (!form) return;

  var submitBtn = document.getElementById('submitBtn');
  var emptyState = document.getElementById('emptyState');
  var loadingState = document.getElementById('loadingState');
  var loadingText = document.getElementById('loadingText');
  var result = document.getElementById('result');
  var toast = document.getElementById('toast');

  var MESSAGES = {
    DEVICE: 'We could not verify your identity. Refresh the page.',
    RATE: 'Too many requests. Wait a minute and try again.',
    NO_CREDITS: 'Your daily limit is used up. It renews automatically at midnight, UAE time.',
    INCOME_REQUIRED: 'Enter your monthly income correctly (AED 500 or more).',
    BAD_INPUT: 'Please double-check the values you entered.',
    TIMEOUT: 'The analysis took too long. Please try again.',
    NETWORK: 'Could not reach the server. Make sure it is running.',
    BAD_KEY: 'Could not reach the AI service. Please contact the project developer.',
    UPSTREAM: 'The AI service is busy right now. Please try again later.'
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function aed(n) {
    return 'AED ' + Number(n || 0).toLocaleString('en-US');
  }

  function showToast(msg, isError) {
    toast.textContent = msg;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.classList.remove('show'); }, 4200);
  }

  function readForm() {
    var riskEl = form.querySelector('input[name="risk"]:checked');
    return {
      income: Number(document.getElementById('income').value),
      fixedExpenses: Number(document.getElementById('fixedExpenses').value || 0),
      otherExpenses: Number(document.getElementById('otherExpenses').value || 0),
      currentSavings: Number(document.getElementById('currentSavings').value || 0),
      dependents: Number(document.getElementById('dependents').value || 0),
      goalAmount: Number(document.getElementById('goalAmount').value || 0),
      goal: document.getElementById('goal').value,
      horizon: document.getElementById('horizon').value,
      risk: riskEl ? riskEl.value : 'balanced',
      note: document.getElementById('note').value.slice(0, 200)
    };
  }

  function validate(data) {
    var incomeInput = document.getElementById('income');
    var ok = Number.isFinite(data.income) && data.income >= 500 && data.income <= 1000000;
    incomeInput.classList.toggle('invalid', !ok);
    if (!ok) {
      incomeInput.focus();
      showToast(MESSAGES.INCOME_REQUIRED, true);
    }
    return ok;
  }

  function setState(state) {
    emptyState.hidden = state !== 'empty';
    loadingState.hidden = state !== 'loading';
    result.hidden = state !== 'result';
    if (state === 'loading') {
      var steps = ['Analyzing your financial situation...', 'Reviewing your commitments and goal...', 'The AI is drafting your plan...'];
      var i = 0;
      loadingText.textContent = steps[0];
      clearInterval(setState._t);
      setState._t = setInterval(function () {
        i = (i + 1) % steps.length;
        loadingText.textContent = steps[i];
      }, 2200);
    } else {
      clearInterval(setState._t);
    }
  }

  function updateCredits(c) {
    if (!c) return;
    var chip = document.getElementById('creditChip');
    if (chip) chip.innerHTML = 'Daily credits <b>' + c.remaining + '</b> / ' + c.limit;
    document.querySelectorAll('[data-credits-remaining]').forEach(function (n) {
      n.textContent = c.remaining;
    });
  }

  /* ===== عرض الخطة (آمن: textContent فقط) ===== */
  function render(plan, mode, creditsInfo, meta) {
    var sources = (meta && meta.sources) || [];
    var searched = !!(meta && meta.searched);
    document.getElementById('pHeadline').textContent = plan.headline || 'Your money plan';
    document.getElementById('pSummary').textContent = plan.summary || '';
    document.getElementById('pDisclaimer').textContent = plan.disclaimer || '';
    document.getElementById('modeBadge').hidden = mode !== 'demo';
    document.getElementById('planDate').textContent = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    // مسار التحليل
    var ratPanel = document.getElementById('pRationalePanel');
    var ratList = document.getElementById('pRationale');
    ratList.textContent = '';
    if (plan.rationale && plan.rationale.length) {
      plan.rationale.forEach(function (step) { ratList.appendChild(el('li', null, step)); });
      ratPanel.hidden = false;
    } else {
      ratPanel.hidden = true;
    }

    // مصادر البحث على الويب
    var srcBox = document.getElementById('pSources');
    var srcList = document.getElementById('pSourceList');
    srcList.textContent = '';
    var validSources = (sources || []).filter(function (s) { return s && /^https?:\/\//i.test(s.url || ''); });
    if (validSources.length && searched) {
      validSources.forEach(function (s) {
        var a = el('a', null, s.title || s.url);
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        srcList.appendChild(a);
      });
      srcBox.hidden = false;
    } else {
      srcBox.hidden = true;
    }

    var b = plan.budget;
    document.getElementById('barNeeds').style.width = b.needs_pct + '%';
    document.getElementById('barWants').style.width = b.wants_pct + '%';
    document.getElementById('barSavings').style.width = b.savings_pct + '%';
    document.getElementById('valNeeds').textContent = b.needs_pct + '% • ' + aed(b.needs_aed);
    document.getElementById('valWants').textContent = b.wants_pct + '% • ' + aed(b.wants_aed);
    document.getElementById('valSavings').textContent = b.savings_pct + '% • ' + aed(b.savings_aed);
    document.getElementById('splitNote').textContent =
      'Rule of thumb: 50% essentials, 30% lifestyle choices, 20% saving & investing — the analysis may adjust this to your actual situation.';

    var runway = document.getElementById('pRunway');
    runway.textContent = '';
    [
      { v: aed(plan.runway.emergency_aed), l: 'Emergency fund target' },
      { v: plan.runway.emergency_months + ' months', l: 'Suggested safety period' },
      { v: aed(plan.runway.current_savings), l: 'Your current savings' },
      { v: plan.runway.months_to_goal > 0 ? plan.runway.months_to_goal + ' months' : '—', l: 'Time to reach your goal' }
    ].forEach(function (m, i) {
      var box = el('div', 'mini');
      var bEl = el('b', null, m.v);
      bEl.style.transform = 'scale(.7)';
      bEl.style.opacity = '0';
      box.appendChild(bEl);
      box.appendChild(el('span', null, m.l));
      runway.appendChild(box);
      setTimeout(function () {
        bEl.style.transition = 'all .5s cubic-bezier(.2,.8,.3,1)';
        bEl.style.transform = 'none';
        bEl.style.opacity = '1';
      }, 140 + i * 110);
    });

    var channels = document.getElementById('pChannels');
    channels.textContent = '';
    (plan.channels || []).forEach(function (c) {
      var card = el('article', 'chan');
      card.appendChild(el('h4', null, c.name));
      var meta = el('div', 'chan-meta');
      var riskLower = String(c.risk || '').toLowerCase();
      var riskCls = riskLower.indexOf('high') === 0 ? 'tag risk-high' : riskLower.indexOf('med') === 0 ? 'tag risk-mid' : 'tag';
      meta.appendChild(el('span', riskCls, 'Risk: ' + c.risk));
      meta.appendChild(el('span', 'tag', 'Horizon: ' + c.horizon));
      if (c.share > 0) meta.appendChild(el('span', 'tag', c.share + '% of savings'));
      card.appendChild(meta);
      card.appendChild(el('p', null, c.note));
      var meter = el('div', 'chan-meter');
      var fill = el('i');
      meter.appendChild(fill);
      card.appendChild(meter);
      channels.appendChild(card);
      setTimeout(function () { fill.style.width = Math.min(100, c.share) + '%'; fill.style.transition = 'width 1s'; }, 260);
    });

    var actions = document.getElementById('pActions');
    actions.textContent = '';
    (plan.actions || []).forEach(function (a) {
      var li = el('li');
      var box = el('div');
      box.appendChild(el('div', 'a-t', a.title));
      box.appendChild(el('div', 'a-d', a.detail));
      li.appendChild(box);
      if (a.saving > 0) li.appendChild(el('span', 'a-s', 'Saves ~' + aed(a.saving)));
      actions.appendChild(li);
    });

    var risks = document.getElementById('pRisks');
    risks.textContent = '';
    (plan.risks || []).forEach(function (r) { risks.appendChild(el('li', null, r)); });

    setState('result');
    updateCredits(creditsInfo);
    showToast(mode === 'demo' ? 'Plan generated in local demo mode (no AI connection)' : 'Your plan is ready ✓');
    if (window.ruyaCelebrate) window.ruyaCelebrate();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = readForm();
    if (!validate(data)) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Analyzing...';
    setState('loading');

    fetch('/api/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': window.getRuyaDeviceId()
      },
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        var body = res.body || {};
        if (body.ok && body.plan) {
          render(body.plan, body.mode, body.credits, { sources: body.sources, searched: body.searched });
        } else {
          setState('empty');
          showToast(MESSAGES[body.error] || body.message || 'Something went wrong unexpectedly.', true);
        }
      })
      .catch(function () {
        setState('empty');
        showToast(MESSAGES.NETWORK, true);
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create my money plan →';
      });
  });

  document.getElementById('againBtn').addEventListener('click', function () {
    setState('empty');
    document.getElementById('income').focus();
    window.scrollTo({ top: document.querySelector('.app-body').offsetTop - 60, behavior: 'smooth' });
  });

  document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

  var costLabel = document.getElementById('costLabel');
  if (costLabel) {
    fetch('/api/me', { headers: { 'X-Device-Id': window.getRuyaDeviceId() } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok) costLabel.textContent = d.cost; })
      .catch(function () {});
  }
})();
