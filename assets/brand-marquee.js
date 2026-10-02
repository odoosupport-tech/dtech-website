/* ============================================================================
   D-TECH · Three-tier brand marquee with infinite auto-scroll.
   Visual rules live in assets/skin.css.

   Tier 1  —  Global giants + large multinationals (scrolls ←)
   Tier 2  —  Established brands (scrolls →)
   Tier 3  —  Mid-size + specialist partners (scrolls ←)
   ========================================================================= */
(function () {
  'use strict';

  /* ---- Tier 1: Mega-cap global giants + large multinational OEMs -------- */
  var tier1 = [
    { name: 'Apple',               logo: 'assets/partners/apple.svg',               width: 81,  height: 100 },
    { name: 'Microsoft',           logo: 'assets/partners/microsoft.svg',           width: 118, height: 25  },
    { name: 'Google',              logo: 'assets/partners/google.svg',              width: 296, height: 100 },
    { name: 'Samsung',             logo: 'assets/partners/samsung.svg',             width: 653, height: 100 },
    { name: 'HP',                  logo: 'assets/partners/hp.svg',                  width: 100, height: 100, link: 'about.html#partner-hp' },
    { name: 'Dell Technologies',   logo: 'assets/partners/dell-technologies.svg',   width: 72,  height: 9,   link: 'about.html#partner-dell' },
    { name: 'Oracle',              logo: 'assets/partners/oracle.svg',              width: 770, height: 100 },
    { name: 'Bosch',               logo: 'assets/partners/bosch.svg',               width: 400, height: 100 },
    { name: 'Sony',                logo: 'assets/partners/sony.svg',                width: 568, height: 100 },
    { name: 'Panasonic',           logo: 'assets/partners/panasonic.svg',           width: 653, height: 100 },
    { name: 'Cisco',               logo: 'assets/partners/cisco.svg',               width: 80,  height: 42  },
    { name: 'Honeywell',           logo: 'assets/partners/honeywell.svg',           width: 565, height: 100 },
    { name: 'Canon',               logo: 'assets/partners/canon.svg',               width: 472, height: 100 }
  ];

  /* ---- Tier 2: Large, established brands -------------------------------- */
  var tier2 = [
    { name: 'Lenovo',              logo: 'assets/partners/lenovo.svg',              width: 120, height: 24  },
    { name: 'LG',                  logo: 'assets/partners/lg.svg',                  width: 100, height: 100 },
    { name: 'Legrand',             logo: 'assets/partners/legrand.svg',             width: 403, height: 100 },
    { name: 'Motorola Solutions',  logo: 'assets/partners/motorola-solutions.svg',  width: 634, height: 73,  link: 'about.html#partner-motorola' },
    { name: 'Epson',               logo: 'assets/partners/epson.svg',               width: 407, height: 100 },
    { name: 'CommScope',           logo: 'assets/partners/commscope-logo.png',      width: 800, height: 106 },
    { name: 'Exide',               logo: 'assets/partners/exide.svg',               width: 310, height: 100 }
  ];

  /* ---- Tier 3: Mid-size global/regional + niche specialists ------------- */
  var tier3 = [
    { name: 'Asus',                logo: 'assets/partners/asus.svg',                width: 371, height: 100 },
    { name: 'Acer',                logo: 'assets/partners/acer.svg',                width: 373, height: 100 },
    { name: 'Logitech',            logo: 'assets/partners/logitech.svg',            width: 605, height: 100 },
    { name: 'Polycab',             logo: 'assets/partners/polycab.png',             width: 150, height: 34  },
    { name: 'JBL',                 logo: 'assets/partners/jbl.svg',                 width: 96,  height: 100 },
    { name: 'ViewSonic',           logo: 'assets/partners/viewsonic.svg',           width: 616, height: 100 },
    { name: 'D-Link',              logo: 'assets/partners/d-link.svg',              width: 333, height: 100 },
    { name: 'Poly',                logo: 'assets/partners/poly.svg',                width: 229, height: 100 },
    { name: 'ZKTeco',              logo: 'assets/partners/zkteco.png',              width: 500, height: 115 },
    { name: 'Grandstream',         logo: 'assets/partners/grandstream.png',         width: 300, height: 43  },
    { name: 'Axis Communications', logo: 'assets/partners/axis-communications.svg', width: 278, height: 100 },
    { name: 'CP Plus',             logo: 'assets/partners/cp-plus.png',             width: 168, height: 28  },
    { name: 'Beetel',              logo: 'assets/partners/beetel.png',              width: 100, height: 100 },
    { name: 'Matrix',              logo: 'assets/partners/matrix-comsec.png',       width: 90,  height: 34  },
    { name: 'Prama',               logo: 'assets/partners/prama.png',               width: 793, height: 213 },
    { name: 'Digisol',             logo: 'assets/partners/digisol.png',             width: 657, height: 120 },
    { name: 'Fingers',             logo: 'assets/partners/fingers.png',             width: 484, height: 264 }
  ];

  /* ---- Build a single logo element ------------------------------------- */
  function buildItem(brand, repeat) {
    var tag = brand.link ? 'a' : 'div';
    var href = brand.link ? ' href="' + brand.link + '"' : '';
    /* Extra copies only exist to fill the row, so keep them out of the tab order and screen readers */
    var hidden = repeat ? ' aria-hidden="true"' + (brand.link ? ' tabindex="-1"' : '') : '';
    var logo = brand.logo
      ? '<img src="' + brand.logo + '" alt="' + brand.name + '" width="' + brand.width + '" height="' + brand.height + '" loading="lazy" decoding="async">'
      : brand.name;
    return '<' + tag + href + hidden + ' class="brand-marquee-item">' + logo + '</' + tag + '>';
  }

  /* The brand list repeated `copies` times, as one set's markup */
  function logosHtmlFor(brands, copies) {
    var html = '';
    for (var c = 0; c < copies; c++) {
      for (var i = 0; i < brands.length; i++) { html += buildItem(brands[i], c > 0); }
    }
    return html;
  }

  /* A row loops by scrolling one set past while its twin follows, so one set must be
     at least as wide as the row or an empty gap shows before the loop restarts
     (the 7-logo middle row is far narrower than a desktop screen). Grow, never shrink. */
  function fillRow(row) {
    var sets = row.querySelectorAll('.marquee-set');
    var copies = Number(row.getAttribute('data-copies')) || 1;
    var oneCopy = sets[0].getBoundingClientRect().width / copies;
    if (!(oneCopy > 0)) return;
    var needed = Math.min(8, Math.max(1, Math.ceil(row.clientWidth * 1.1 / oneCopy)));
    if (needed <= copies) return;
    var html = logosHtmlFor(row._brands, needed);
    sets[0].innerHTML = html;
    sets[1].innerHTML = html;
    row.setAttribute('data-copies', needed);
  }

  /* ---- Build a single auto-scrolling marquee row ----------------------- */
  function buildRow(brands, direction, label) {
    var row = document.createElement('div');
    row.className = 'brand-marquee-row';
    row.setAttribute('data-direction', direction);

    /* The visible label tag sitting above the logos */
    var labelWrap = document.createElement('div');
    labelWrap.className = 'brand-marquee-label-wrap';
    var labelEl = document.createElement('span');
    labelEl.className = 'brand-marquee-label';
    labelEl.textContent = label;
    labelWrap.appendChild(labelEl);
    row.appendChild(labelWrap);

    /* Inner track: contains logos duplicated for seamless loop */
    var track = document.createElement('div');
    track.className = 'brand-marquee-track';
    var dirClass = direction === 'right' ? 'marquee-scroll-right' : 'marquee-scroll-left';
    track.classList.add(dirClass);

    /* Build the logo set twice for the infinite-loop illusion */
    var logosHtml = logosHtmlFor(brands, 1);
    row._brands = brands;
    row.setAttribute('data-copies', 1);
    track.innerHTML = '<div class="marquee-set">' + logosHtml + '</div>'
                    + '<div class="marquee-set" aria-hidden="true">' + logosHtml + '</div>';

    row.appendChild(track);
    return row;
  }

  /* ---- Inject the full three-tier section ------------------------------- */
  function inject() {
    if (document.querySelector('.brand-marquee')) return;

    var section = document.createElement('section');
    section.className = 'brand-marquee';
    section.setAttribute('aria-label', 'Technology partners');

    /* Section heading */
    var heading = document.createElement('div');
    heading.className = 'brand-marquee-heading';
    heading.innerHTML = '<span class="brand-marquee-eyebrow">OEM & Technology Alliances</span>'
                      + '<h2 class="brand-marquee-title">Trusted by the enterprises that power industry</h2>';
    section.appendChild(heading);

    /* Three rows */
    section.appendChild(buildRow(tier1, 'left',  'Global Technology Leaders'));
    section.appendChild(buildRow(tier2, 'right', 'Enterprise Infrastructure & Control'));
    section.appendChild(buildRow(tier3, 'left',  'Specialized Systems & Hardware'));

    /* Stop the three infinite animations while the section is off screen,
       so scrolling the rest of the page is not competing with them. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        section.classList.toggle('marquee-offscreen', !entries[0].isIntersecting);
      }, { rootMargin: '200px 0px' }).observe(section);
    }

    /* Respect reduced motion */
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        section.classList.add('marquee-paused');
      }
    } catch (e) { /* matchMedia not supported */ }

    /* Inject position: after the metric ribbon on home, else before footer */
    var footer = document.querySelector('footer');
    var homeMetric = document.body && document.body.getAttribute('data-page') === 'home'
      ? document.querySelector('.home-hero + section')
      : null;
    if (homeMetric && homeMetric.parentNode) {
      homeMetric.parentNode.insertBefore(section, homeMetric.nextSibling);
    } else if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(section, footer);
    }

    /* Fill each row to the screen width now, once images have loaded, and on resize */
    var rows = section.querySelectorAll('.brand-marquee-row');
    function fillAll() { for (var r = 0; r < rows.length; r++) { fillRow(rows[r]); } }
    fillAll();
    window.addEventListener('load', fillAll);
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fillAll, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
