// GET /case-studies/<id>, /careers/<id> and /sitemap-details.xml (rewrites in vercel.json)
//
// One page per published case study and per open role, so search engines can
// index each one and staff can share a direct link. Pages are rendered from
// data/case-studies.json and data/jobs.json on request, so console edits show
// up with the redeploy they trigger, inside the site's own header, footer,
// styles and scripts (taken from privacy-policy.html, a page with no scripts of
// its own, so the Content-Security-Policy hashes of its inline scripts still
// match).
//
// Case pages show only what the public card on /case-studies already shows;
// the write-up (challenge, solution, results) and the PDF stay behind that
// page's email form. Job pages carry JobPosting data for Google's job search.
//
//   ?type=case&id=…   case-study page   (404 page for a draft or unknown id)
//   ?type=job&id=…    job page          (404 page for a closed or unknown role)
//   ?type=sitemap     XML sitemap of every page above

const fs = require('fs');
const path = require('path');

const SITE = 'https://www.dtechindia.com'; // canonical host, as on every static page
const ID_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const PRACTICES = {
  network: 'Network & IT infrastructure',
  services: 'Managed services',
  safety: 'Safety, communication & automation',
};
// The same practices mid-sentence ("More network & IT infrastructure projects").
const PRACTICE_PHRASES = {
  network: 'network & IT infrastructure',
  services: 'managed services',
  safety: 'safety, communication & automation',
};
// Places in Gujarat that roles are advertised in, for the job location's region.
const GUJARAT = ['ahmedabad', 'ankleshwar', 'bharuch', 'dahej', 'gandhinagar', 'hazira', 'jhagadia', 'rajkot', 'surat', 'vadodara', 'vapi'];
const CACHE_OK = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'; // the CDN cache is cleared by each deploy
const CACHE_MISS = 'public, max-age=0, s-maxage=300';

// ---- the site shell ---------------------------------------------------------

let shellCache;

// privacy-policy.html with absolute URLs (pages here live one level down),
// the shared sections stylesheet added, and the parts each page fills in
// checked once, so a change to the source page fails loudly here.
function shell() {
  if (shellCache) return shellCache;
  const page = fs.readFileSync(path.join(__dirname, '..', 'privacy-policy.html'), 'utf8');
  const contact = fs.readFileSync(path.join(__dirname, '..', 'contact.html'), 'utf8');
  const sections = /<link rel="stylesheet" href="assets\/sections\.min\.css\?v=[0-9a-f]+">/.exec(contact);
  if (!sections) throw new Error('contact.html no longer links assets/sections.min.css');
  const lightChrome = /<link rel="stylesheet" href="assets\/light-chrome\.min\.css\?v=[0-9a-f]+">/;
  if (!lightChrome.test(page)) throw new Error('privacy-policy.html no longer links assets/light-chrome.min.css');

  // sections.css goes before light-chrome.css, which loads last on every page.
  let html = absolutize(page.replace(lightChrome, m => `${sections[0]}\n    ${m}`));
  const start = html.indexOf('<main');
  const end = html.indexOf('</main>');
  if (start < 0 || end < start || html.indexOf('<main', start + 1) > -1) throw new Error('privacy-policy.html must have exactly one <main>');
  const parts = { head: html.slice(0, start), tail: html.slice(end + '</main>'.length) };
  for (const [label, re] of Object.entries(SLOTS)) {
    const hits = parts.head.match(new RegExp(re.source, 'g')) || [];
    if (hits.length !== 1) throw new Error(`privacy-policy.html: expected one ${label}, found ${hits.length}`);
  }
  shellCache = parts;
  return shellCache;
}

const SLOTS = {
  title: /<title>[^<]*<\/title>/,
  description: /<meta name="description" content="[^"]*">/,
  ogTitle: /<meta property="og:title" content="[^"]*">/,
  ogDescription: /<meta property="og:description" content="[^"]*">/,
  twitterTitle: /<meta name="twitter:title" content="[^"]*">/,
  twitterDescription: /<meta name="twitter:description" content="[^"]*">/,
  canonical: /<link rel="canonical" href="[^"]*">/,
  ogUrl: /<meta property="og:url" content="[^"]*">/,
  businessUrl: /"url": "https:\/\/www\.dtechindia\.com\/privacy-policy"/,
  bodyPage: / data-page="legal"/,
};

// Relative href/src/srcset values become root-relative ("assets/x" → "/assets/x");
// in-page anchors, absolute paths and URLs with a scheme are left alone.
function absolutize(html) {
  const fix = url => (url === '' || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url) ? url : `/${url}`);
  return html
    .replace(/(\s(?:href|src|action|poster)=")([^"]*)"/gi, (m, attr, url) => `${attr}${fix(url)}"`)
    .replace(/(\ssrcset=")([^"]*)"/gi, (m, attr, list) => `${attr}${list.split(',').map(part => {
      const [url, ...rest] = part.trim().split(/\s+/);
      return [fix(url), ...rest].join(' ');
    }).join(', ')}"`);
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// JSON for a <script type="application/ld+json"> block: "<" is escaped so the
// data can never close the script element.
function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

// Plain-text description for search results, cut at a word near 155 characters.
function snippet(text, max = 155) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 80 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,;:.–-]+$/, '')}…`;
}

function render({ title, description, url, page, nav, main, data = [] }) {
  const { head, tail } = shell();
  const t = esc(title);
  const d = esc(description);
  const u = esc(url);
  let top = head
    .replace(SLOTS.title, () => `<title>${t}</title>`)
    .replace(SLOTS.description, () => `<meta name="description" content="${d}">`)
    .replace(SLOTS.ogTitle, () => `<meta property="og:title" content="${t}">`)
    .replace(SLOTS.ogDescription, () => `<meta property="og:description" content="${d}">`)
    .replace(SLOTS.twitterTitle, () => `<meta name="twitter:title" content="${t}">`)
    .replace(SLOTS.twitterDescription, () => `<meta name="twitter:description" content="${d}">`)
    .replace(SLOTS.canonical, () => `<link rel="canonical" href="${u}">`)
    .replace(SLOTS.ogUrl, () => `<meta property="og:url" content="${u}">`)
    .replace(SLOTS.businessUrl, () => `"url": ${JSON.stringify(url)}`)
    .replace(SLOTS.bodyPage, () => ` data-page="${page}"`)
    .replace('</head>', () => `${data.map(jsonLd).join('\n')}\n</head>`);
  // The section the page belongs to is marked current in the desktop and phone menus.
  if (nav) top = top.split(`<a href="/${nav}">`).join(`<a href="/${nav}" aria-current="page">`);
  return `${top}${main}${tail}`;
}

// ---- data --------------------------------------------------------------------

function readList(file) {
  const list = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', file), 'utf8'));
  if (!Array.isArray(list)) throw new Error(`data/${file} must be an array`);
  return list.filter(x => x && typeof x === 'object' && typeof x.id === 'string');
}

const publishedCases = () => readList('case-studies.json').filter(c => c.published !== false && c.client);
const openJobs = () => readList('jobs.json').filter(j => j.isActive === true && j.title);

// Site paths only (logos the console uploads live under assets/ too).
function assetUrl(p) {
  return typeof p === 'string' && /^assets\/[A-Za-z0-9/._-]+$/.test(p) && !p.includes('..') ? `/${p}` : '';
}

// "ADAMA Agricultural Solutions, Dahej" → "Dahej"; "Vadodara (GNAL)" → "Vadodara".
function townOf(location) {
  const last = String(location || '').split(',').pop().replace(/\([^)]*\)/g, '').trim();
  return last || String(location || '').trim();
}

function longDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Console summaries: "- ", "* " or "• " lines are bullets, a blank line starts a paragraph
// (the same rules as the careers page).
function formatSummary(text) {
  let html = '';
  let para = [];
  let items = [];
  const flush = () => {
    if (para.length) html += `<p>${para.join('<br>')}</p>`;
    if (items.length) html += `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
    para = [];
    items = [];
  };
  String(text || '').split('\n').forEach(raw => {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (!line) return flush();
    if (bullet) {
      if (para.length) flush();
      items.push(esc(bullet[1]));
    } else {
      if (items.length) flush();
      para.push(esc(line));
    }
  });
  flush();
  return html;
}

// ---- page parts --------------------------------------------------------------

function hero(crumbs, heading, lead) {
  const trail = crumbs.map(([label, href]) => (href
    ? `<a href="${href}">${esc(label)}</a>`
    : `<span class="text-white">${esc(label)}</span>`)).join(' <span class="text-slate-400">/</span> ');
  return `
    <section class="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white py-14 sm:py-18 border-b border-slate-800">
      <div class="executive-container">
        <div class="max-w-3xl space-y-4">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-mono">${trail}</div>
          <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">${esc(heading)}</h1>
          ${lead ? `<p class="text-base sm:text-lg text-slate-300 leading-relaxed">${esc(lead)}</p>` : ''}
        </div>
      </div>
    </section>`;
}

function sheet(rows) {
  return `<dl class="dt-sheet">${rows.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function linkList(items) {
  return `<ul class="dt-detail-list">${items.map(i => `<li><a href="${esc(i.href)}"><strong>${esc(i.title)}</strong><span>${esc(i.sub)}</span></a></li>`).join('')}</ul>`;
}

function breadcrumbData(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
  };
}

const MAIN_OPEN = '<main id="main-content" class="flex-1" tabindex="-1">';

function casePage(c, all) {
  const url = `${SITE}/case-studies/${c.id}`;
  const practice = PRACTICES[c.category] || '';
  const logo = assetUrl(c.logo);
  const metrics = (Array.isArray(c.metrics) ? c.metrics : []).filter(m => Array.isArray(m) && m[0] && m[1]).slice(0, 4);
  const related = all.filter(x => x.id !== c.id && ID_RE.test(x.id) && x.category === c.category).slice(0, 4);
  const main = `${MAIN_OPEN}${hero([['Home', '/'], ['Case studies', '/case-studies'], [c.client, '']], c.client, [c.arch_tag, c.industry].filter(Boolean).join(' · '))}
    <section class="dt-section dt-section--surface dt-detail" aria-labelledby="detail-overview">
      <div class="executive-container">
        <div class="dt-detail-grid">
          <div>
            <span class="dt-cut" aria-hidden="true"></span>
            <h2 id="detail-overview" class="dt-h2 dt-h2--sm">${esc(c.arch_tag || 'Project overview')}</h2>
            <p class="dt-intro">${esc(c.summary)}</p>
            ${sheet([['Client', c.client], ['Industry', c.industry], ['Site', c.location], ['Period', c.period], ['Practice', practice]])}
            <div class="dt-detail-actions">
              <a class="button button-primary" href="/case-studies#${esc(c.id)}">Get the full case study</a>
              <a class="hx-link" href="/contact">Discuss a similar project</a>
            </div>
            <p class="dt-detail-note">The full write-up and PDF are emailed to you from the case studies page.</p>
          </div>
          <figure class="dt-detail-logo">${logo
            ? `<img src="${esc(logo)}" alt="${esc(c.client)} logo" width="300" height="128" decoding="async">`
            : `<span>${esc(c.client)}</span>`}</figure>
        </div>
        ${metrics.length ? `<dl class="dt-figures dt-figures--compact">${metrics.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      </div>
    </section>
    ${related.length ? `<section class="dt-section dt-section--paper" aria-labelledby="detail-more">
      <div class="executive-container">
        <h2 id="detail-more" class="dt-h2 dt-h2--sm">More ${esc(PRACTICE_PHRASES[c.category] || 'related')} projects</h2>
        ${linkList(related.map(r => ({ href: `/case-studies/${r.id}`, title: r.client, sub: r.arch_tag })))}
        <p class="dt-detail-more"><a class="hx-link" href="/case-studies">All ${all.length} case studies</a></p>
      </div>
    </section>` : ''}
    <section class="dt-cta" aria-labelledby="detail-cta">
      <div class="executive-container dt-cta-inner">
        <div>
          <span class="dt-cut" aria-hidden="true"></span>
          <h2 id="detail-cta">Planning something similar at your plant?</h2>
          <p>Tell us about your site. An engineer will call you back within one business day.</p>
        </div>
        <div class="dt-cta-actions">
          <a class="button button-primary" href="/contact">Request a proposal</a>
          <a class="dt-cta-ghost" href="/case-studies">All case studies</a>
        </div>
      </div>
    </section>
  </main>`;
  return render({
    title: `${c.client}: ${c.arch_tag || 'Case study'} | D-TECH SIPL`,
    description: snippet(c.summary),
    url,
    page: 'case-study',
    nav: 'case-studies',
    main,
    data: [breadcrumbData([['Home', `${SITE}/`], ['Case studies', `${SITE}/case-studies`], [c.client, url]])],
  });
}

function jobPosting(j, url) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(j.postedAt || ''))) return null; // Google requires the posting date
  const town = townOf(j.location);
  const address = { '@type': 'PostalAddress', addressLocality: town, addressCountry: 'IN' };
  if (GUJARAT.includes(town.toLowerCase())) address.addressRegion = 'Gujarat';
  const facts = [['Department', j.department], ['Location', j.location], ['Open positions', j.positions]]
    .filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${v}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: j.title,
    description: `${formatSummary(j.summary)}<p>${facts.map(esc).join('<br>')}</p>`,
    datePosted: j.postedAt,
    url,
    identifier: { '@type': 'PropertyValue', name: 'D-Tech Solution Integrators Private Limited', value: j.id },
    hiringOrganization: {
      '@type': 'Organization',
      name: 'D-Tech Solution Integrators Private Limited',
      sameAs: SITE,
      logo: `${SITE}/assets/dtech-logo-blue.webp`,
    },
    jobLocation: { '@type': 'Place', address },
    ...(Number.isInteger(j.positions) && j.positions > 0 ? { totalJobOpenings: j.positions } : {}),
  };
}

function jobPage(j, all) {
  const url = `${SITE}/careers/${j.id}`;
  const others = all.filter(x => x.id !== j.id && ID_RE.test(x.id)).slice(0, 6);
  const positions = Number.isInteger(j.positions) && j.positions > 0 ? String(j.positions) : '';
  const posting = jobPosting(j, url);
  const main = `${MAIN_OPEN}${hero([['Home', '/'], ['Careers', '/careers'], [j.title, '']], j.title, [j.department, j.location].filter(Boolean).join(' · '))}
    <section class="dt-section dt-section--surface dt-detail" aria-labelledby="detail-role">
      <div class="executive-container">
        <div class="dt-detail-grid">
          <div>
            <span class="dt-cut" aria-hidden="true"></span>
            <h2 id="detail-role" class="dt-h2 dt-h2--sm">About the role</h2>
            <div class="dt-detail-copy">${formatSummary(j.summary)}</div>
            <div class="dt-detail-actions">
              <a class="button button-primary" href="/careers?apply=${encodeURIComponent(j.id)}">Apply for this role</a>
              <a class="hx-link" href="/careers">All open roles</a>
            </div>
          </div>
          ${sheet([['Department', j.department], ['Location', j.location], ['Open positions', positions], ['Posted', j.postedAt ? longDate(j.postedAt) : '']])}
        </div>
      </div>
    </section>
    ${others.length ? `<section class="dt-section dt-section--paper" aria-labelledby="detail-more">
      <div class="executive-container">
        <h2 id="detail-more" class="dt-h2 dt-h2--sm">Other open roles</h2>
        ${linkList(others.map(o => ({ href: `/careers/${o.id}`, title: o.title, sub: o.location })))}
        <p class="dt-detail-more"><a class="hx-link" href="/careers">All ${all.length} open roles</a></p>
      </div>
    </section>` : ''}
  </main>`;
  return render({
    title: `${j.title}, ${j.location} | Careers | D-TECH SIPL`,
    description: snippet(`${j.title} at D-TECH, ${j.location}. ${String(j.summary || '').replace(/^[-*•]\s+/gm, '')}`),
    url,
    page: 'job',
    nav: 'careers',
    main,
    data: [breadcrumbData([['Home', `${SITE}/`], ['Careers', `${SITE}/careers`], [j.title, url]]), posting].filter(Boolean),
  });
}

function notFoundPage(type) {
  const isJob = type === 'job';
  const section = isJob ? ['Careers', '/careers'] : ['Case studies', '/case-studies'];
  const main = `${MAIN_OPEN}${hero([['Home', '/'], section, ['Not found', '']], isJob ? 'This role is no longer open' : 'Case study not found',
    isJob ? 'It may have been filled or closed.' : 'It may have been moved or unpublished.')}
    <section class="dt-section dt-section--surface dt-detail">
      <div class="executive-container">
        <p class="dt-intro">${isJob ? 'See the roles we are hiring for now.' : 'Browse every documented project on the case studies page.'}</p>
        <div class="dt-detail-actions"><a class="button button-primary" href="${section[1]}">${isJob ? 'See open roles' : 'See all case studies'}</a></div>
      </div>
    </section>
  </main>`;
  return render({
    title: `${isJob ? 'Role not found' : 'Case study not found'} | D-TECH SIPL`,
    description: isJob ? 'This role is no longer open at D-TECH.' : 'This case study is not available.',
    url: `${SITE}${section[1]}`,
    page: isJob ? 'job' : 'case-study',
    nav: section[1].slice(1),
    main,
  });
}

function sitemap() {
  const xml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
  const urls = [
    ...publishedCases().filter(c => ID_RE.test(c.id)).map(c => ({ loc: `${SITE}/case-studies/${c.id}` })),
    ...openJobs().filter(j => ID_RE.test(j.id)).map(j => ({ loc: `${SITE}/careers/${j.id}`, lastmod: /^\d{4}-\d{2}-\d{2}$/.test(String(j.postedAt || '')) ? j.postedAt : '' })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(u => `  <url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const type = String((req.query && req.query.type) || '');
  const id = String((req.query && req.query.id) || '');
  try {
    if (type === 'sitemap') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', CACHE_OK);
      return res.status(200).send(sitemap());
    }
    if (type !== 'case' && type !== 'job') return res.status(404).json({ ok: false, error: 'Not found' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const list = type === 'case' ? publishedCases() : openJobs();
    const item = ID_RE.test(id) ? list.find(x => x.id === id) : null;
    if (!item) {
      res.setHeader('Cache-Control', CACHE_MISS);
      return res.status(404).send(notFoundPage(type));
    }
    res.setHeader('Cache-Control', CACHE_OK);
    return res.status(200).send(type === 'case' ? casePage(item, list) : jobPage(item, list));
  } catch (err) {
    console.error(`Rendering ${type} ${id} failed:`, err.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, error: 'This page is unavailable right now.' });
  }
};
