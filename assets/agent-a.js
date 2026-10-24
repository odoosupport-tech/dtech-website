/* ==========================================================================
   D-TECH · Agent-A Motion Layer (Task #4)
   Presentational only: scroll hover shield, header elevation, count-up figures.
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

  /* The browser re-hovers whatever slides under a still mouse while the page
     scrolls, so cards lifted and dropped mid-scroll. A transparent shield over
     the page takes the pointer until scrolling stops. Only the shield's own
     pointer-events change, so nothing else is restyled (a class on <html>
     restyled the whole page twice per scroll). The wheel event comes before
     the page moves, so the shield is up before the browser re-checks hover;
     scroll covers the keyboard and scrollbar. Both listeners are passive and
     never delay scrolling. Mouse pointers only: touch screens have no hover. */
  function initScrollShield() {
    try {
      if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      var shield = document.createElement('div');
      shield.className = 'scroll-shield';
      shield.setAttribute('aria-hidden', 'true');
      document.body.appendChild(shield);
      var timer = 0;
      var raise = function () {
        if (!timer) shield.style.pointerEvents = 'auto';
        clearTimeout(timer);
        timer = setTimeout(function () { shield.style.pointerEvents = ''; timer = 0; }, 150);
      };
      window.addEventListener('wheel', raise, { passive: true });
      window.addEventListener('scroll', raise, { passive: true });
    } catch (e) {}
  }

  /* Count the trust figures up when the ribbon first comes into view.
     Only a figure that STARTS with digits is animated, so "20+ Years" and
     "500+ Plants" count while "ISO 9001:2015" and "< 4 Hours" are left
     exactly as written. */
  function countUp(el, target, suffix) {
    var start = null;
    var dur = 1100;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      var val = Math.round(target * eased);
      el.textContent = val + suffix;
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
              countUp(jobs[j].el, jobs[j].target, jobs[j].suffix);
            }
            return;
          }
        },
        { threshold: 0.4 }
      );
      io.observe(ribbon);
    } catch (e) {}
  }

  function init() {
    initScrollShield();
    initTheme();
    initHeader();
    initCounters();
    initEmbedTitles();
  }

  /* HP's showcase script injects its iframe without a title, so screen readers
     announce an unnamed frame. Name it from the container's data-frame-title. */
  function initEmbedTitles() {
    if (!('MutationObserver' in window)) return;
    var boxes = document.querySelectorAll('[data-frame-title]');
    for (var i = 0; i < boxes.length; i++) nameEmbedFrames(boxes[i]);
  }

  function nameEmbedFrames(box) {
    var title = box.getAttribute('data-frame-title');
    function apply() {
      var frames = box.querySelectorAll('iframe:not([title])');
      for (var i = 0; i < frames.length; i++) frames[i].setAttribute('title', title);
      return frames.length > 0;
    }
    if (apply()) return;
    // The script adds its frame once, so stop watching after naming it.
    var observer = new MutationObserver(function () {
      if (apply()) observer.disconnect();
    });
    observer.observe(box, { childList: true, subtree: true });
  }

  /* Theme: the visitor's saved choice wins, otherwise light (the system setting is ignored). Sheet toggle only. */
  function readTheme() {
    try {
      var t = localStorage.getItem('dtech-theme');
      if (t === 'light' || t === 'dark') return t;
    } catch (e) {}
    // The design system is derived from a light document, so light is the
    // default voice; dark is only used after the visitor picks it with the toggle.
    return 'light';
  }

  function paintThemeToggle(t) {
    try {
      var b = document.getElementById('theme-toggle');
      if (!b) return;
      var dark = t !== 'light';
      // A toggle button keeps one name and reports its state: "Dark theme", pressed or not.
      b.setAttribute('aria-pressed', dark ? 'true' : 'false');
      b.setAttribute('aria-label', 'Dark theme');
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
