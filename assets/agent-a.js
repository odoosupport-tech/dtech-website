/* ==========================================================================
   D-TECH · Agent-A Motion Layer (Task #4)
   Presentational only: scroll reveal, header elevation, count-up figures.
   Touches nothing functional — no modal/form logic here.
   Loads with defer on all 7 pages, after assets/refined.js.
   ========================================================================== */
(function () {
  'use strict';

  function reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function initHeader() {
    try {
      var header = document.querySelector('.site-header');
      if (!header || !('IntersectionObserver' in window)) return;
      // 1px sentinel parked at the scroll threshold: no scroll listeners,
      // no per-frame work. Shadow engages once it leaves the viewport.
      var sentinel = document.createElement('div');
      sentinel.setAttribute('aria-hidden', 'true');
      sentinel.style.cssText =
        'position:absolute;top:9px;left:0;width:1px;height:1px;' +
        'pointer-events:none;opacity:0;';
      document.body.insertBefore(sentinel, document.body.firstChild);
      var io = new IntersectionObserver(
        function (entries) {
          try {
            header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
          } catch (e) {}
        },
        { threshold: 0 }
      );
      io.observe(sentinel);
    } catch (e) {}
  }

  function initReveal() {
    try {
      if (reducedMotion()) return;
      if (!('IntersectionObserver' in window)) return;
      var sections = document.querySelectorAll('main > section');
      if (!sections.length) return;
      var io = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.isIntersecting) {
              entry.target.classList.add('a-in');
              io.unobserve(entry.target);
            }
          }
        },
        { threshold: 0, rootMargin: '0px 0px 8% 0px' }
      );
      for (var j = 0; j < sections.length; j++) {
        if (sections[j].classList.contains('home-hero')) continue;
        sections[j].classList.add('a-pre');
        io.observe(sections[j]);
      }
    } catch (e) {}
  }

  /* Count the trust figures up when the ribbon first comes into view.
     Only a figure that STARTS with digits is animated, so "20+ Years" and
     "500+ Plants" count while "ISO 9001:2015" and "< 4 Hours" are left
     exactly as written. */
  function countUp(el, target, suffix, digits) {
    var start = null;
    var dur = 1100;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      var val = Math.round(target * eased);
      el.textContent = (digits ? String(val).padStart(digits, '0') : String(val)) + suffix;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function initCounters() {
    try {
      if (reducedMotion()) return;
      if (!('IntersectionObserver' in window)) return;
      if (!document.body || document.body.getAttribute('data-page') !== 'home') return;
      var ribbon = document.querySelector('.home-hero + section, .home-hero + div + section');
      if (!ribbon) return;
      var figures = ribbon.querySelectorAll('.text-2xl');
      if (!figures.length) return;

      var jobs = [];
      for (var i = 0; i < figures.length; i++) {
        var raw = (figures[i].textContent || '').trim();
        var m = /^(\d[\d,]*)([\s\S]*)$/.exec(raw);
        if (!m) continue;
        var target = parseInt(m[1].replace(/,/g, ''), 10);
        if (!isFinite(target) || target <= 0) continue;
        jobs.push({ el: figures[i], target: target, suffix: m[2] });
      }
      if (!jobs.length) return;

      var io = new IntersectionObserver(
        function (entries) {
          for (var k = 0; k < entries.length; k++) {
            if (!entries[k].isIntersecting) continue;
            io.disconnect();
            /* Zero out only now, as the count begins. If this observer never
               fires, the figures stay exactly as authored in the markup. */
            for (var j = 0; j < jobs.length; j++) {
              jobs[j].el.textContent = '0' + jobs[j].suffix;
              countUp(jobs[j].el, jobs[j].target, jobs[j].suffix, 0);
            }
            return;
          }
        },
        { threshold: 0.4 }
      );
      io.observe(ribbon);
    } catch (e) {}
  }

  /* Flag active scrolling so CSS can suspend hover effects until it ends. */
  function initScrollState() {
    try {
      var root = document.documentElement, timer = 0;
      window.addEventListener('scroll', function () {
        if (!timer) root.classList.add('is-scrolling');
        clearTimeout(timer);
        timer = setTimeout(function () { root.classList.remove('is-scrolling'); timer = 0; }, 150);
      }, { passive: true });
    } catch (e) {}
  }

  function init() {
    initScrollState();
    initTheme();
    initHeader();
    initReveal();
    initCounters();
  }

  /* Theme: stored pref wins, else OS, else dark. Sheet toggle only. */
  function readTheme() {
    try {
      var t = localStorage.getItem('dtech-theme');
      if (t === 'light' || t === 'dark') return t;
    } catch (e) {}
    // The design system is derived from a light document, so light is the
    // default voice; only an explicit OS dark preference opts into the dark chapter.
    try {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (e) {}
    return 'light';
  }

  function paintThemeToggle(t) {
    try {
      var b = document.getElementById('theme-toggle');
      if (!b) return;
      var dark = t !== 'light';
      b.setAttribute('aria-pressed', dark ? 'false' : 'true');
      b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      b.innerHTML = '<i data-lucide="' + (dark ? 'sun' : 'moon') + '"></i>';
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    } catch (e) {}
  }

  function applyTheme(t, persist) {
    try {
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
    try {
      var link = document.getElementById('theme-dark-css');
      if (link) link.disabled = t !== 'dark';
    } catch (e) {}
    if (persist !== false) {
      try {
        localStorage.setItem('dtech-theme', t);
      } catch (e) {}
    }
    paintThemeToggle(t);
  }

  function initTheme() {
    try {
      var t = readTheme();
      applyTheme(t, false);
      var b = document.getElementById('theme-toggle');
      if (b) {
        b.addEventListener('click', function () {
          var cur = 'dark';
          try {
            cur = document.documentElement.getAttribute('data-theme') || readTheme();
          } catch (e) {}
          applyTheme(cur === 'dark' ? 'light' : 'dark', true);
        });
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
