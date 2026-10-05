document.addEventListener('DOMContentLoaded', () => {
  // Shared drawer behavior, including keyboard focus and restoration.
  let returnFocus;
  const menu = document.getElementById('mobile-menu');
  const trigger = document.querySelector('.menu-button');
  window.toggleMobileMenu = () => {
    const opening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !opening);
    trigger?.setAttribute('aria-expanded', String(opening));
    document.body.style.overflow = opening ? 'hidden' : '';
    if (opening) {
      returnFocus = document.activeElement;
      menu.querySelector('button[aria-label="Close menu drawer"]')?.focus();
    } else returnFocus?.focus();
  };
  // Menu buttons carry data-menu-toggle; the CSP blocks inline onclick handlers.
  document.addEventListener('click', event => {
    if (menu && event.target.closest('[data-menu-toggle]')) window.toggleMobileMenu();
  });
  document.addEventListener('keydown', event => {
    if (!menu || menu.classList.contains('hidden')) return;
    if (event.key === 'Escape') window.toggleMobileMenu();
    if (event.key === 'Tab') {
      const items = [...menu.querySelectorAll('a[href],button,summary')].filter(el => el.tabIndex >= 0 && el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
      if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
    }
  });
  // Escape closes whichever page-level modal is open, topmost (last in DOM) first.
  const overlays = [
    ['case-detail-modal', 'closeCaseModal'],
    ['email-gate-modal', 'closeEmailGateModal'],
  ];
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = overlays
      .map(([id, fn]) => [document.getElementById(id), fn])
      .filter(([el, fn]) => el && !el.classList.contains('hidden') && typeof window[fn] === 'function');
    if (!open.length) return;
    open.sort(([a], [b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1));
    window[open[0][1]]();
  });

  const current = location.pathname.split('/').pop() || '/';
  menu?.querySelectorAll('a').forEach(link => {
    if (link.getAttribute('href') === current) link.setAttribute('aria-current','page');
  });
  document.querySelectorAll('img').forEach(img => {
    if (!img.closest('.home-hero,.site-header')) img.loading = 'lazy';
  });

  const desktopDropdowns = [...document.querySelectorAll('.restored-nav .nav-dropdown')];
  const closeNavigationForHash = link => {
    let destination;
    try { destination = new URL(link.href, location.href); } catch (_) { return; }
    if (destination.pathname !== location.pathname || !destination.hash) return;
    desktopDropdowns.forEach(dropdown => { dropdown.open = false; });
    if (menu?.contains(link) && !menu.classList.contains('hidden')) window.toggleMobileMenu();
  };
  desktopDropdowns.forEach(dropdown => {
    dropdown.addEventListener('toggle', () => {
      if (!dropdown.open) return;
      desktopDropdowns.forEach(other => {
        if (other !== dropdown) other.open = false;
      });
    });
  });
  document.addEventListener('click', event => {
    const hashLink = event.target.closest('a[href*="#"]');
    if (hashLink) closeNavigationForHash(hashLink);
    if (!event.target.closest('.restored-nav .nav-dropdown')) {
      desktopDropdowns.forEach(dropdown => { dropdown.open = false; });
    }
  });
});

// Re-align initial and same-page deep links after fonts and responsive CSS settle.
function alignHashTarget() {
  if (!location.hash) return;
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
  const target = document.getElementById(id);
  if (!target) return;
  requestAnimationFrame(() => requestAnimationFrame(() => target.scrollIntoView({block: 'start', behavior: 'instant'})));
}

window.addEventListener('load', () => {
  const ready = document.fonts ? document.fonts.ready : Promise.resolve();
  ready.then(alignHashTarget);
});
window.addEventListener('hashchange', alignHashTarget);

// Site banner from the management console (data/banners.json): the first active
// banner whose dates include today shows above the utility bar until the visitor
// closes it. The banner is remembered for the session, so later pages show it at
// once instead of shifting the layout when the fetch returns.
(() => {
  const CACHE = 'dtech-banner';
  const DISMISSED = 'dtech-banner-dismissed';
  const ICONS = {
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    highlight: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  };
  const CSS = `
.site-banner{font:500 13px/1.45 var(--text-face,Inter,system-ui,sans-serif)}
.site-banner[data-tone="info"]{background:#0075ae;color:#fff}
.site-banner[data-tone="highlight"]{background:#c2410c;color:#fff}
.site-banner[data-tone="warning"]{background:#fbbf24;color:#1f1300}
.site-banner-in{display:flex;align-items:center;gap:10px;max-width:100%;margin:0 auto;padding:8px 1rem}
@media (min-width:640px){.site-banner-in{padding-left:2rem;padding-right:2rem}}
@media (min-width:1280px){.site-banner-in{padding-left:3.5rem;padding-right:3.5rem}}
@media (min-width:1800px){.site-banner-in{max-width:1720px}}
.site-banner-in>svg{flex:none;width:18px;height:18px}
.site-banner-text{margin:0;flex:1;min-width:0;overflow-wrap:anywhere;color:inherit}
.site-banner-text a{color:inherit;font-weight:700;text-decoration:underline;text-underline-offset:3px;margin-left:4px;white-space:nowrap}
.site-banner-close{flex:none;display:grid;place-items:center;width:32px;height:32px;margin:-4px -6px -4px 0;border:0;border-radius:8px;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer;opacity:.85}
.site-banner-close:hover{opacity:1;background:rgba(255,255,255,.16)}
.site-banner[data-tone="warning"] .site-banner-close:hover{background:rgba(0,0,0,.08)}
.site-banner-close:focus-visible,.site-banner-text a:focus-visible{outline:2px solid currentColor;outline-offset:2px}`;

  const get = (area, key) => { try { return window[area].getItem(key); } catch (_) { return null; } };
  const set = (area, key, value) => {
    try {
      if (value == null) window[area].removeItem(key); else window[area].setItem(key, value);
    } catch (_) { /* storage blocked: the banner still shows, it just is not remembered */ }
  };
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const pick = list => {
    if (!Array.isArray(list)) return null;
    const day = today();
    return list.find(b => b && b.isActive === true && typeof b.message === 'string' && b.message &&
      (!b.startsOn || b.startsOn <= day) && (!b.endsOn || day <= b.endsOn)) || null;
  };
  // Pages on this site, https links, tel: and mailto: only (the console allows no others).
  const safeHref = url => {
    const value = String(url || '');
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
    if (value.startsWith('//')) return '';
    return !scheme || ['https', 'tel', 'mailto'].includes(scheme[1].toLowerCase()) ? value : '';
  };

  const show = banner => {
    const anchor = document.querySelector('.utility-bar');
    const current = document.querySelector('.site-banner');
    const id = banner ? JSON.stringify(banner) : '';
    if (current && current.dataset.banner === id) return;
    current?.remove();
    if (!banner || !anchor || get('localStorage', DISMISSED) === `${banner.id}|${banner.message}`) return;
    if (!document.getElementById('site-banner-css')) {
      const style = document.createElement('style');
      style.id = 'site-banner-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const tone = ICONS[banner.tone] ? banner.tone : 'info';
    const bar = document.createElement('div');
    bar.className = 'site-banner';
    bar.dataset.tone = tone;
    bar.dataset.banner = id;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Announcement');
    bar.innerHTML = `<div class="site-banner-in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[tone]}</svg><p class="site-banner-text"></p><button type="button" class="site-banner-close" aria-label="Close announcement">&times;</button></div>`;
    const text = bar.querySelector('p');
    text.textContent = banner.message;
    const href = safeHref(banner.linkUrl);
    if (href && banner.linkLabel) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = `${banner.linkLabel} →`;
      if (link.origin !== location.origin && link.protocol === 'https:') { link.target = '_blank'; link.rel = 'noopener'; }
      text.append(' ', link);
    }
    bar.querySelector('button').addEventListener('click', () => {
      set('localStorage', DISMISSED, `${banner.id}|${banner.message}`);
      bar.remove();
    });
    anchor.before(bar);
  };

  const cached = get('sessionStorage', CACHE);
  if (cached) {
    try { show(pick([JSON.parse(cached)])); } catch (_) { set('sessionStorage', CACHE, null); }
  }
  fetch('/api/content?list=banners', { cache: 'no-cache', headers: { Accept: 'application/json' } })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(list => {
      const banner = pick(list);
      set('sessionStorage', CACHE, banner ? JSON.stringify(banner) : null);
      show(banner);
    })
    .catch(err => console.warn('Site banner not loaded:', err.message));
})();

// Phones: a call / WhatsApp bar pinned to the bottom of every page that has the
// site header. Hidden on wider screens (the top bar shows the numbers there),
// in print, and while a form field has focus, where the on-screen keyboard would
// push the bar over the field being typed in.
(() => {
  const SALES_TEL = '+919558809163';
  const SALES_LABEL = '+91 95588 09163';
  // The WhatsApp line published on the contact page.
  const WHATSAPP = 'https://wa.me/919998026089?text=Hello%20D-TECH%20SIPL,%20I%20would%20like%20to%20request%20an%20engineering%20consultation.';
  const CSS = `
.contact-dock{display:none}
@media (max-width:767px){
.contact-dock{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:40;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px;border:1px solid var(--line-strong,#ccdee8);border-radius:14px;background:var(--surface,#fff);box-shadow:0 14px 34px -14px rgba(7,29,52,.5)}
.contact-dock[hidden]{display:none}
.contact-dock a{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;border-radius:10px;font:600 15px/1 var(--text-face,Inter,system-ui,sans-serif);text-decoration:none}
.contact-dock svg{width:18px;height:18px;flex:none}
.contact-dock .dock-call{background:var(--signal-deep,#0075ae);color:#fff}
html[data-theme="dark"] .contact-dock .dock-call{background:var(--signal,#27b6da);color:#071d34}
.contact-dock .dock-chat{border:1px solid var(--line-strong,#ccdee8);background:var(--paper,#f7fafc);color:var(--ink,#142b41)}
.contact-dock .dock-chat svg{color:#1f9d55}
.contact-dock a:focus-visible{outline:2px solid var(--signal-deep,#0075ae);outline-offset:2px}
body.has-contact-dock{padding-bottom:calc(76px + env(safe-area-inset-bottom,0px))}
}
@media print{.contact-dock{display:none!important}body.has-contact-dock{padding-bottom:0}}`;

  if (!document.querySelector('.utility-bar') || document.querySelector('.contact-dock')) return;
  const style = document.createElement('style');
  style.id = 'contact-dock-css';
  style.textContent = CSS;
  document.head.appendChild(style);

  const dock = document.createElement('nav');
  dock.className = 'contact-dock';
  dock.setAttribute('aria-label', 'Quick contact');
  dock.innerHTML =
    `<a class="dock-call" href="tel:${SALES_TEL}" aria-label="Call sales on ${SALES_LABEL}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call sales</a>` +
    `<a class="dock-chat" href="${WHATSAPP}" target="_blank" rel="noopener noreferrer" aria-label="Chat with D-TECH on WhatsApp (opens WhatsApp)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>WhatsApp</a>`;
  document.body.appendChild(dock);
  document.body.classList.add('has-contact-dock');

  const typing = el => el instanceof Element && el.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select,[contenteditable="true"]');
  document.addEventListener('focusin', event => { if (typing(event.target)) dock.hidden = true; });
  document.addEventListener('focusout', () => {
    // Moving from one field to the next keeps the bar hidden.
    setTimeout(() => { if (!typing(document.activeElement)) dock.hidden = false; }, 0);
  });
})();
