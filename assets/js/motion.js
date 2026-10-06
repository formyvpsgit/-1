/* Ruya — motion system: spotlight, tilt, ripples, tickers, draw-on-view */
(function () {
  'use strict';

  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  if (reduced) return;

  var finePointer = true;
  try { finePointer = window.matchMedia('(pointer: fine)').matches; } catch (_) {}

  /* ===== Environment probe: some embedded webviews never advance CSS
     transitions. Detect it once and flip to static styling (html.anim-off)
     so content is always visible and correct. ===== */
  (function detectTransitions() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:-99px;left:0;width:1px;height:1px;opacity:1;transition:opacity .25s linear;pointer-events:none';
    document.body.appendChild(probe);
    void probe.offsetHeight; /* style flush */
    probe.style.opacity = '0';
    setTimeout(function () {
      var broken = getComputedStyle(probe).opacity !== '0';
      probe.remove();
      if (broken) document.documentElement.classList.add('anim-off');
    }, 400);
  })();

  /* ===== Cursor spotlight on cards ===== */
  if (finePointer) {
    document.querySelectorAll('[data-spotlight]').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      }, { passive: true });
    });
  }

  /* ===== Gentle 3D tilt ===== */
  if (finePointer) {
    document.querySelectorAll('[data-tilt]').forEach(function (el) {
      var raf = null, tx = 0, ty = 0;
      function apply() {
        el.style.transform = 'rotateX(' + ty + 'deg) rotateY(' + tx + 'deg)';
        raf = null;
      }
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        tx = px * 7; ty = -py * 6;
        if (!raf) raf = requestAnimationFrame(apply);
      }, { passive: true });
      el.addEventListener('pointerleave', function () {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(apply);
      });
    });
  }

  /* ===== Nav glider — a pill glides between nav links ===== */
  var navLinksBox = document.querySelector('.nav-links');
  if (navLinksBox && finePointer) {
    var glider = document.createElement('span');
    glider.className = 'nav-glider';
    navLinksBox.appendChild(glider);
    function glideTo(target) {
      var r = target.getBoundingClientRect();
      var p = navLinksBox.getBoundingClientRect();
      if (!r.width || !p.width) return; /* environment guard */
      glider.style.width = r.width + 'px';
      glider.style.transform = 'translateX(' + (r.left - p.left) + 'px)';
      glider.style.opacity = '1';
    }
    navLinksBox.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('mouseenter', function () { glideTo(a); });
    });
    navLinksBox.addEventListener('mouseleave', function () { glider.style.opacity = '0'; });
    window.addEventListener('resize', function () { glider.style.opacity = '0'; }, { passive: true });
  }

  /* ===== Magnetic buttons — gently pulled toward the cursor ===== */
  if (finePointer) {
    document.querySelectorAll('.btn').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        if (btn.disabled) return;
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) / r.width;
        var dy = (e.clientY - r.top - r.height / 2) / r.height;
        btn.style.transform = 'translate(' + dx * 8 + 'px,' + dy * 6 + 'px)';
      }, { passive: true });
      btn.addEventListener('pointerleave', function () { btn.style.transform = ''; });
    });
  }

  /* ===== Headlines reveal word by word ===== */
  document.querySelectorAll('.section-title').forEach(function (t) {
    var idx = 0;
    Array.prototype.slice.call(t.childNodes).forEach(function (n) {
      if (n.nodeType !== 3 || !n.textContent.trim()) return;
      var frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(function (w) {
        if (!w) return;
        if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
        var s = document.createElement('span');
        s.className = 'word';
        s.style.setProperty('--wd', idx++);
        s.textContent = w;
        frag.appendChild(s);
      });
      n.parentNode.replaceChild(frag, n);
    });
  });

  /* ===== Confetti burst — exported for the plan success moment ===== */
  window.ruyaCelebrate = function () {
    var colors = ['#66e8b1', '#f5c451', '#ffffff', '#0ab36c'];
    for (var i = 0; i < 30; i++) {
      (function (i) {
        var p = document.createElement('span');
        p.className = 'confetti-p';
        p.style.left = (44 + Math.random() * 12) + 'vw';
        p.style.top = '16vh';
        p.style.background = colors[i % colors.length];
        if (i % 3 === 0) p.style.borderRadius = '50%';
        document.body.appendChild(p);
        var dx = (Math.random() - 0.5) * 56;
        var dy = 58 + Math.random() * 32;
        var rot = (Math.random() - 0.5) * 760;
        if (p.animate) {
          p.animate([
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: 'translate(' + dx + 'vw,' + dy + 'vh) rotate(' + rot + 'deg)', opacity: 0 }
          ],              { duration: 1200 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = function () { p.remove(); };
        }
        setTimeout(function () { p.remove(); }, 2400); /* guaranteed cleanup in every environment */
      })(i);
    }
  };

  /* ===== Button ripples ===== */
  document.querySelectorAll('.btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var r = btn.getBoundingClientRect();
      var d = Math.max(r.width, r.height);
      var s = document.createElement('span');
      s.className = 'ripple';
      s.style.width = s.style.height = d + 'px';
      s.style.left = (e.clientX - r.left - d / 2) + 'px';
      s.style.top = (e.clientY - r.top - d / 2) + 'px';
      btn.appendChild(s);
      setTimeout(function () { s.remove(); }, 700);
    });
  });

  /* ===== Ticking balance inside the hero dashboard ===== */
  document.querySelectorAll('[data-tick]').forEach(function (el) {
    var values = (el.getAttribute('data-tick') || '').split('|');
    if (values.length < 2) return;
    var i = 0;
    setInterval(function () {
      i = (i + 1) % values.length;
      el.style.transition = 'opacity .28s ease, transform .28s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-7px)';
      setTimeout(function () {
        el.textContent = 'AED ' + values[i];
        el.style.transform = 'translateY(7px)';
        requestAnimationFrame(function () {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
      }, 290);
    }, 3400);
  });

  /* ===== Draw-on-view: add .visible when the element scrolls in ===== */
  var animEls = document.querySelectorAll('[data-animate]');
  if ('IntersectionObserver' in window && animEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.3 });
    animEls.forEach(function (el) { io.observe(el); });

    /* Fallback for environments where IO never fires */
    setTimeout(function () {
      if (document.querySelectorAll('[data-animate].visible').length > 0) return;
      function check() {
        var vh = window.innerHeight;
        animEls.forEach(function (el) {
          if (el.classList.contains('visible')) return;
          var r = el.getBoundingClientRect();
          if (r.top < vh * 0.95 && r.bottom > 0) el.classList.add('visible');
        });
      }
      var t = false;
      window.addEventListener('scroll', function () {
        if (t) return;
        t = true;
        requestAnimationFrame(function () { check(); t = false; });
      }, { passive: true });
      check();
    }, 2500);
  } else {
    animEls.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ===== Coin buddy — click for a sparkle burst + a money tip ===== */
  var buddy = document.querySelector('.coin-buddy');
  if (buddy) {
    /* eyes follow the cursor */
    if (finePointer) {
      var eyes = buddy.querySelector('.eyes');
      var eyeRaf = null;
      window.addEventListener('pointermove', function (e) {
        if (!eyes || eyeRaf) return;
        eyeRaf = requestAnimationFrame(function () {
          eyeRaf = null;
          var r = buddy.getBoundingClientRect();
          var ang = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
          eyes.style.transform = 'translate(' + Math.cos(ang) * 2.2 + 'px,' + Math.sin(ang) * 2.2 + 'px)';
        });
      }, { passive: true });
    }

    var TIPS = [
      'Pay yourself first — save the moment your salary lands, not what is left at the end.',
      'AED 25 a day is about AED 9,000 a year. Small is powerful.',
      'Build the emergency fund before anything fun. Future-you says thanks.',
      'Automate your savings on payday — willpower is a bad savings plan.',
      'Before any purchase, ask: is this worth the hours of work it costs?',
      'Compound growth loves patience more than big amounts.',
      'A high return that is “guaranteed” is a red flag, not an opportunity.'
    ];
    var tipIndex = Math.floor(Math.random() * TIPS.length);
    var toast = document.getElementById('toast');
    var toastTimer = null;

    function burst() {
      for (var i = 0; i < 9; i++) {
        (function (i) {
          var p = document.createElement('span');
          p.className = 'sparkle-p';
          buddy.appendChild(p);
          var angle = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
          var dist = 44 + Math.random() * 36;
          var dx = Math.cos(angle) * dist;
          var dy = Math.sin(angle) * dist - 14;
          if (p.animate) {
            p.animate(
              [
                { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
                { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.2) rotate(160deg)', opacity: 0 }
              ],
              { duration: 620 + Math.random() * 260, easing: 'cubic-bezier(.16,1,.3,1)' }
            ).onfinish = function () { p.remove(); };
          }
          setTimeout(function () { p.remove(); }, 950); /* guaranteed cleanup */
        })(i);
      }
    }

    buddy.addEventListener('click', function () {
      buddy.classList.remove('jump');
      void buddy.offsetWidth; /* restart animation */
      buddy.classList.add('jump');
      burst();
      if (toast) {
        toast.textContent = TIPS[tipIndex % TIPS.length];
        toast.classList.remove('error');
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 5200);
      }
      tipIndex++;
    });
  }
})();
