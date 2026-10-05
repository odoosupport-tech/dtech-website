// GET /api/content?list=case-studies|banners
// The public copy of the lists the management console edits. The raw files in
// data/ are not served (vercel.json sends /data/* to the 404 page), so drafts and
// hidden banners never leave the server.
//
//   case-studies  published entries in full; a draft is only { id, published: false },
//                 so pages that ship a static card can still drop it, and the
//                 console's display order is kept. A PDF given as an outside link
//                 shows only as pdf_file: true: PDFs are lead-gated, reaching
//                 visitors by email after the form (site-held ones are also
//                 guarded by middleware.js)
//   banners       active banners only (the page still checks the start/end dates)
//
// Response: the list as a JSON array, the same shape as the file it comes from.

const fs = require('fs');
const path = require('path');

const LISTS = {
  'case-studies': {
    file: 'case-studies.json',
    view: items => items.map(c => (c.published === false ? { id: c.id, published: false }
      : typeof c.pdf_file === 'string' && /^https?:/i.test(c.pdf_file) ? { ...c, pdf_file: true } : c)),
  },
  banners: {
    file: 'banners.json',
    view: items => items.filter(b => b.isActive === true),
  },
};

function publicList(name) {
  const cfg = LISTS[name];
  let items;
  try {
    items = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', cfg.file), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return []; // a list that has never been saved
    throw err;
  }
  if (!Array.isArray(items)) throw new Error(`data/${cfg.file} must be an array`);
  return cfg.view(items.filter(x => x && typeof x === 'object' && typeof x.id === 'string'));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const name = String((req.query && req.query.list) || '');
  if (!Object.prototype.hasOwnProperty.call(LISTS, name)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  try {
    const list = publicList(name);
    // Same freshness as the static files it replaces: revalidated on every page load.
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.status(200).json(list);
  } catch (err) {
    console.error(`Reading the ${name} list failed:`, err.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, error: 'This content is unavailable right now.' });
  }
};
