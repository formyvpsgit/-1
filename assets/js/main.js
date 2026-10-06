/* Ruya — shared behaviors: menus, scroll motion, counters */
(function () {
  'use strict';

  var nav = document.querySelector('.nav');
  var links = document.querySelector('.nav-links');
  var burger = document.querySelector('.burger');
  var progress = document.getElementById('progress');
  var toTop = document.getElementById('toTop');

  if (burger && links) {
    burger.addEventListener('click', function () {
      links.classList.toggle('open');
      burger.setAttribute('aria-expanded', links.classList.contains('open') ? 'true' : 'false');
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') links.classList.remove('open');
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY || 0;
      if (nav) nav.classList.toggle('scrolled', y > 12);
      if (toTop) toTop.classList.toggle('show', y > 480);
      if (progress) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
      }
      document.querySelectorAll('[data-parallax]').forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.25;
        el.style.transform = 'translate3d(0,' + y * speed + 'px,0)';
      });
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* Scroll reveal (up/down) with a self-healing fallback for environments
     where IntersectionObserver never fires (e.g. non-compositing webviews) */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('visible');
            if (en.target.hasAttribute('data-count')) countUp(en.target);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -60px 0px' }
    );
    revealEls.forEach(function (el) { io.observe(el); });

    /* Fallback: if nothing revealed after 2.5s although content is on screen,
       switch to a scroll-based checker */
    setTimeout(function () {
      if (document.querySelectorAll('.reveal.visible').length > 0) return;
      function check() {
        var vh = window.innerHeight;
        revealEls.forEach(function (el) {
          if (el.classList.contains('visible')) return;
          var r = el.getBoundingClientRect();
          if (r.top < vh * 0.9 && r.bottom > 0) {
            el.classList.add('visible');
            if (el.hasAttribute('data-count')) countUp(el);
          }
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
    revealEls.forEach(function (el) { el.classList.add('visible'); });
  }

  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var start = performance.now();
    var dur = 1400;
    function step(now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(target * eased);
      el.textContent = val.toLocaleString('en-US') + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* شارة الرصيد اليومي */
  var chip = document.getElementById('creditChip');
  if (chip) {
    var deviceId = getDeviceId();
    fetch('/api/me', { headers: { 'X-Device-Id': deviceId } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          chip.innerHTML = 'Daily credits <b>' + d.remaining + '</b> / ' + d.limit;
          document.querySelectorAll('[data-credits-remaining]').forEach(function (n) {
            n.textContent = d.remaining;
          });
        }
      })
      .catch(function () { /* الموقع يشتغل حتى بدون سيرفر API */ });
  }

  function getDeviceId() {
    var key = 'ruya_device_v1';
    var id = null;
    try { id = localStorage.getItem(key); } catch (_) {}
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
      try { localStorage.setItem(key, id); } catch (_) {}
    }
    return id;
  }
  window.getRuyaDeviceId = getDeviceId;

  /* Footer year (moved out of inline scripts to satisfy CSP) */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
