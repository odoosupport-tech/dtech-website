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

  const current = location.pathname.split('/').pop() || 'index.html';
  if (current === 'solutions.html') {
    document.querySelectorAll('.nav-dropdown summary').forEach(summary => {
      if (summary.textContent.trim().startsWith('Solutions')) summary.setAttribute('aria-current', 'page');
    });
  }
  menu?.querySelectorAll('a').forEach(link => {
    link.classList.remove('bg-blue-50','text-blue-700');
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
