// POST /api/admin/update: changes made in the management console (session
// required). Jobs, case studies and site banners are committed to data/*.json
// in the site repository (see api/_store.js), which redeploys the public pages.
// Follow-ups on requirements, applicants and leads are written to the private
// data store and never reach the public site.
//
// Body (JSON), site lists:
//   { type: "job"|"caseStudy"|"banner", action: "save", id?, item: {...} }  create or edit
//   { type, action: "toggle", id, value }        open/close, publish/draft, show/hide
//   { type, action: "delete", id }
//   { type, action: "reorder", ids: [...] }      every id in the list, in the new
//                                                display order
//
// Body (JSON), private inbox lists:
//   { type: "requirement"|"applicant"|"lead", action: "status", id, value }
//                                                value: new|contacted|review|archived
//   { type, action: "note", id, note }           adds an internal note (up to 1000 characters)
//   { type, action: "deleteNote", id, noteId }
//
// A case study's item.pdf chooses the whitepaper emailed to visitors who ask for it (every case study needs one):
//   { mode: "keep" }                           leave it as it is (the default)
//   { mode: "link", url: "https://…" }         emailed as a link
//   { mode: "upload", filename, dataBase64 }   a PDF of up to 3 MB, committed to
//                                              assets/case-studies/pdf/custom/ and
//                                              emailed as an attachment
// Seeded case studies (not added from the console) can only be published or
// unpublished, because their full pages and PDFs live in the site itself.
//
// Response: { ok: true, items: [...the whole updated list] }
// Invalid input: 400 (413 for an oversized PDF) { ok: false, error, field? },
// where field names the form field to fix.

const crypto = require('crypto');
const store = require('../_store');
const { requireSession, jsonBody } = require('../_admin');
const { allowedOrigin, clean } = require('../_http');

const CATEGORIES = ['network', 'services', 'safety'];
const TONES = ['info', 'highlight', 'warning'];
const STATUSES = ['new', 'contacted', 'review', 'archived'];
const SITE_ACTIONS = ['save', 'toggle', 'delete', 'reorder'];
const INBOX_ACTIONS = ['status', 'note', 'deleteNote'];
const MAX_NOTES = 50;
const MAX_PDF_BYTES = 3 * 1024 * 1024; // Vercel caps the request body at 4.5 MB
const PDF_REQUIRED = 'Please upload a PDF or enter a valid PDF link.';
const MAX_LOGO_BYTES = 300 * 1024; // kept small so a logo plus a 3 MB PDF still fit in one request
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Pages on this site (careers.html, /contact.html?subject=x, #section); no schemes, no //host.
const SITE_PATH_RE = /^(\/?[A-Za-z0-9][A-Za-z0-9._\/-]*)?(\?[A-Za-z0-9._~=&%+-]*)?(#[A-Za-z0-9._-]*)?$/;
const CONTACT_LINK_RE = /^(tel:\+?[0-9 ()-]{3,20}|mailto:[^\s@<>"'()]+@[^\s@<>"'()]+\.[A-Za-z]{2,})$/i;

// Inbox records hold personal data, so their summaries (commit messages and
// logs) name the record id, never the person.
const TYPES = {
  job: { store: 'site', actions: SITE_ACTIONS, file: 'jobs.json', flag: 'isActive', label: 'opening', plural: 'openings', name: item => item.title },
  caseStudy: { store: 'site', actions: SITE_ACTIONS, file: 'case-studies.json', flag: 'published', label: 'case study', plural: 'case studies', name: item => item.client },
  banner: { store: 'site', actions: SITE_ACTIONS, file: 'banners.json', flag: 'isActive', label: 'banner', plural: 'banners', name: item => item.message.slice(0, 50) },
  requirement: { store: 'private', actions: INBOX_ACTIONS, file: 'requirements.json', label: 'requirement' },
  applicant: { store: 'private', actions: INBOX_ACTIONS, file: 'applicants.json', label: 'application' },
  lead: { store: 'private', actions: INBOX_ACTIONS, file: 'leads.json', label: 'lead' },
};

class InputError extends Error {
  constructor(message, field, status) {
    super(message);
    this.field = field;
    this.status = status || 400;
  }
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';
}

function uniqueId(base, list) {
  let id = base;
  for (let n = 2; list.some(x => x.id === id); n++) id = `${base}-${n}`;
  return id;
}

function multiline(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim().slice(0, max);
}

// Reads one text field; too long or (when required) empty is an error naming the field.
function text(input, key, label, max, { required = false, lines = false } = {}) {
  const value = (lines ? multiline : clean)(input[key], max + 1);
  if (value.length > max) throw new InputError(`${label[0].toUpperCase()}${label.slice(1)} is too long: keep it to ${max} characters.`, key);
  if (required && !value) throw new InputError(`Please fill in ${label}.`, key);
  return value;
}

function flag(input, key, fallback) {
  if (input[key] === undefined) return fallback;
  if (typeof input[key] !== 'boolean') throw new InputError('Invalid switch value.', key);
  return input[key];
}

function jobFrom(input, existing) {
  const title = text(input, 'title', 'the job title', 120, { required: true });
  const department = text(input, 'department', 'the department', 80, { required: true });
  const location = text(input, 'location', 'the location', 120, { required: true });
  const positions = Number(input.positions);
  if (!Number.isInteger(positions) || positions < 1 || positions > 99) throw new InputError('Open positions must be a whole number from 1 to 99.', 'positions');
  return {
    id: existing ? existing.id : undefined,
    title,
    department,
    location,
    positions,
    summary: text(input, 'summary', 'the job summary', 1000, { required: true, lines: true }),
    isActive: flag(input, 'isActive', existing ? existing.isActive : true),
  };
}

function caseStudyFrom(input, existing, pdfFile, logoFile) {
  const client = text(input, 'client', 'the client name', 120, { required: true });
  const industry = text(input, 'industry', 'the industry sector', 80, { required: true });
  const category = clean(input.category, 20);
  if (!CATEGORIES.includes(category)) throw new InputError('Please choose a category.', 'category');
  const arch_tag = text(input, 'arch_tag', 'the headline', 120, { required: true });

  const outcomes = (Array.isArray(input.outcomes) ? input.outcomes : String(input.outcomes || '').split('\n'))
    .map(o => clean(o, 201)).filter(Boolean);
  if (outcomes.length > 6) throw new InputError('Add up to 6 business results, one per line.', 'outcomes');
  if (outcomes.some(o => o.length > 200)) throw new InputError('Keep each business result to 200 characters.', 'outcomes');

  const metrics = [];
  (Array.isArray(input.metrics) ? input.metrics : []).forEach((m, i) => {
    const label = clean(m && m[0], 41);
    const value = clean(m && m[1], 41);
    if (!label && !value) return;
    if (!label || !value) throw new InputError(`Metric ${i + 1} needs both a name and a value.`, `metric${i}`);
    if (label.length > 40 || value.length > 40) throw new InputError(`Keep metric ${i + 1} to 40 characters per box.`, `metric${i}`);
    metrics.push([label, value]);
  });
  if (metrics.length > 4) throw new InputError('Add up to 4 key metrics.', 'metric0');

  return {
    id: existing ? existing.id : undefined,
    client,
    wordmark: null,
    logo: logoFile !== undefined ? logoFile : (existing ? existing.logo || null : null),
    category,
    industry,
    location: text(input, 'location', 'the site / location', 120),
    period: text(input, 'period', 'the period', 120),
    arch_tag,
    summary: text(input, 'summary', 'the card summary', 600, { required: true, lines: true }),
    challenge: text(input, 'challenge', 'the core challenge', 1500, { lines: true }),
    solution: text(input, 'solution', 'the engineering solution', 1500, { lines: true }),
    outcomes,
    metrics,
    pdf_file: pdfFile !== undefined ? pdfFile : (existing ? existing.pdf_file || null : null),
    published: flag(input, 'published', existing ? existing.published !== false : true),
    custom: true,
  };
}

function siteLink(value) {
  const raw = clean(value, 501);
  if (!raw) return '';
  if (raw.length > 500) throw new InputError('The link is too long.', 'linkUrl');
  if (/^https:\/\//i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch (e) { throw new InputError('That link is not a valid web address.', 'linkUrl'); }
    if (url.username || url.password || /\s/.test(raw)) throw new InputError('That link is not a valid web address.', 'linkUrl');
    return url.href;
  }
  if (SITE_PATH_RE.test(raw) || CONTACT_LINK_RE.test(raw)) return raw;
  throw new InputError('Use a page on this site (e.g. careers.html), a full link starting with https://, or tel:/mailto:', 'linkUrl');
}

function day(input, key, label) {
  const value = clean(input[key], 10);
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (!DATE_RE.test(value) || isNaN(date) || date.toISOString().slice(0, 10) !== value) throw new InputError(`Please enter a valid ${label} date.`, key);
  return value;
}

function bannerFrom(input, existing) {
  const message = text(input, 'message', 'the banner message', 200, { required: true });
  const tone = input.tone === undefined ? 'info' : clean(input.tone, 20);
  if (!TONES.includes(tone)) throw new InputError('Please choose a banner style.', 'tone');
  const linkLabel = text(input, 'linkLabel', 'the link text', 40);
  const linkUrl = siteLink(input.linkUrl);
  if (linkLabel && !linkUrl) throw new InputError('Add the page or web address the link should open.', 'linkUrl');
  if (linkUrl && !linkLabel) throw new InputError('Add the link text visitors will click, e.g. “See open roles”.', 'linkLabel');
  const startsOn = day(input, 'startsOn', 'start');
  const endsOn = day(input, 'endsOn', 'end');
  if (startsOn && endsOn && endsOn < startsOn) throw new InputError('The end date must be on or after the start date.', 'endsOn');
  return {
    id: existing ? existing.id : undefined,
    message,
    tone,
    linkLabel,
    linkUrl,
    startsOn,
    endsOn,
    isActive: flag(input, 'isActive', existing ? existing.isActive : true),
  };
}

function itemOf(body) {
  return body.item && typeof body.item === 'object' && !Array.isArray(body.item) ? body.item : {};
}

// Resolves item.pdf to the new pdf_file value, uploading first when a PDF is attached.
// undefined keeps the current value.
async function resolvePdf(input) {
  const pdf = input.pdf && typeof input.pdf === 'object' ? input.pdf : { mode: 'keep' };
  if (pdf.mode === 'keep') return undefined;
  if (pdf.mode === 'none') throw new InputError(PDF_REQUIRED, 'pdfFile');
  if (pdf.mode === 'link') {
    const raw = clean(pdf.url, 501);
    if (!/^https:\/\//i.test(raw)) throw new InputError('Paste the full PDF link, starting with https://', 'pdfUrl');
    try { return siteLink(raw); } catch (err) { throw new InputError(err.message, 'pdfUrl'); }
  }
  if (pdf.mode !== 'upload') throw new InputError('Please choose a PDF option.', 'pdfMode');

  const base64 = String(pdf.dataBase64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new InputError('The PDF could not be read. Please choose the file again.', 'pdfFile');
  if (Math.floor(base64.length * 3 / 4) > MAX_PDF_BYTES) {
    throw new InputError('The PDF is larger than 3 MB. Compress it, or upload it elsewhere and use “Link to a PDF”.', 'pdfFile', 413);
  }
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new InputError('That file is not a PDF.', 'pdfFile');
  if (!store.isConfigured('uploads')) throw new Error('Upload storage is not configured');
  const name = `${slug(input.client).slice(0, 40)}-${crypto.randomBytes(3).toString('hex')}.pdf`;
  await store.putFile('uploads', name, buffer, `content: Upload case-study PDF for "${clean(input.client, 120)}" (management console)`);
  return `${store.UPLOADS_DIR}/${name}`;
}

// Resolves item.logo to the new logo path, uploading first when an image is attached.
// undefined keeps the current value. PNG, JPEG and WebP only: SVG can carry scripts.
const LOGO_TYPES = [
  { ext: 'png', test: b => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', test: b => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

async function resolveLogo(input) {
  const logo = input.logo && typeof input.logo === 'object' ? input.logo : { mode: 'keep' };
  if (logo.mode === 'keep') return undefined;
  if (logo.mode === 'none') return null;
  if (logo.mode !== 'upload') throw new InputError('Please choose a logo option.', 'logoFile');

  const base64 = String(logo.dataBase64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new InputError('The logo could not be read. Please choose the file again.', 'logoFile');
  if (Math.floor(base64.length * 3 / 4) > MAX_LOGO_BYTES) throw new InputError('The logo is larger than 300 KB. Resize or compress it and try again.', 'logoFile', 413);
  const buffer = Buffer.from(base64, 'base64');
  const type = LOGO_TYPES.find(t => t.test(buffer));
  if (!type) throw new InputError('The logo must be a PNG, JPG or WebP image.', 'logoFile');
  if (!store.isConfigured('logos')) throw new Error('Upload storage is not configured');
  const name = `${slug(input.client).slice(0, 40)}-${crypto.randomBytes(3).toString('hex')}.${type.ext}`;
  await store.putFile('logos', name, buffer, `content: Upload client logo for "${clean(input.client, 120)}" (management console)`);
  return `${store.LOGOS_DIR}/${name}`;
}

function newIdFor(type, item, items) {
  const base = type === 'job' ? `${item.title} ${item.location}`
    : type === 'caseStudy' ? `${item.client} ${item.arch_tag}`
    : item.message.split(/\s+/).slice(0, 6).join(' ');
  return uniqueId(slug(base), items);
}

function apply(type, body, list, pdfFile, logoFile) {
  const cfg = TYPES[type];
  const items = Array.isArray(list) ? list : [];
  const id = clean(body.id || itemOf(body).id, 80);
  const index = id ? items.findIndex(x => x && x.id === id) : -1;
  const current = index > -1 ? items[index] : null;

  if (body.action === 'reorder') {
    const ids = Array.isArray(body.ids) ? body.ids.map(v => clean(v, 80)) : [];
    const known = items.map(x => x && x.id);
    if (ids.length !== known.length || new Set(ids).size !== ids.length || !ids.every(v => known.includes(v))) {
      throw new InputError(`The ${cfg.plural} changed while you were reordering. Press Refresh and set the order again.`);
    }
    const byId = new Map(items.map(x => [x.id, x]));
    return { next: ids.map(v => byId.get(v)), summary: `Reorder ${cfg.plural}` };
  }

  if (body.action === 'toggle') {
    if (!current) throw new InputError(`That ${cfg.label} no longer exists.`);
    if (typeof body.value !== 'boolean') throw new InputError('Invalid switch value.');
    const next = items.slice();
    next[index] = { ...current, [cfg.flag]: body.value };
    return { next, summary: `${body.value ? 'Show' : 'Hide'} ${cfg.label} "${cfg.name(current)}"` };
  }

  if (body.action === 'delete') {
    if (!current) throw new InputError(`That ${cfg.label} no longer exists.`);
    if (type === 'caseStudy' && !current.custom) throw new InputError('Built-in case studies can be unpublished but not deleted.');
    return { next: items.filter((_, i) => i !== index), summary: `Delete ${cfg.label} "${cfg.name(current)}"` };
  }

  // save
  if (id && !current) throw new InputError(`That ${cfg.label} no longer exists.`);
  if (type === 'caseStudy' && current && !current.custom) throw new InputError('Built-in case studies can be published or unpublished but not edited here.');
  const input = itemOf(body);
  const item = type === 'job' ? jobFrom(input, current)
    : type === 'caseStudy' ? caseStudyFrom(input, current, pdfFile, logoFile)
    : bannerFrom(input, current);
  if (type === 'caseStudy' && !item.pdf_file) throw new InputError(PDF_REQUIRED, 'pdfFile');
  if (!current) {
    item.id = newIdFor(type, item, items);
    return { next: [item, ...items], summary: `Add ${cfg.label} "${cfg.name(item)}"` };
  }
  const next = items.slice();
  next[index] = item;
  return { next, summary: `Edit ${cfg.label} "${cfg.name(item)}"` };
}

// Status and internal notes on a requirement, application or lead.
function followUp(type, body, list) {
  const cfg = TYPES[type];
  const items = Array.isArray(list) ? list : [];
  const id = clean(body.id, 80);
  const index = id ? items.findIndex(x => x && x.id === id) : -1;
  if (index < 0) throw new InputError(`That ${cfg.label} no longer exists. Press Refresh to reload the list.`);
  const current = items[index];
  const notes = Array.isArray(current.notes) ? current.notes : [];
  let record, summary;

  if (body.action === 'status') {
    const value = clean(body.value, 20);
    if (!STATUSES.includes(value)) throw new InputError('Please choose a status.', 'status');
    record = { ...current, status: value };
    summary = `Mark ${cfg.label} ${id} as ${value}`;
  } else if (body.action === 'note') {
    const note = text(body, 'note', 'the note', 1000, { required: true, lines: true });
    if (notes.length >= MAX_NOTES) throw new InputError(`A record can hold up to ${MAX_NOTES} notes. Remove an old one first.`, 'note');
    record = { ...current, notes: [...notes, { id: crypto.randomBytes(4).toString('hex'), text: note, date: new Date().toISOString() }] };
    summary = `Add a note to ${cfg.label} ${id}`;
  } else {
    const noteId = clean(body.noteId, 20);
    if (!noteId || !notes.some(n => n && n.id === noteId)) throw new InputError('That note has already been removed.');
    record = { ...current, notes: notes.filter(n => n && n.id !== noteId) };
    summary = `Remove a note from ${cfg.label} ${id}`;
  }
  const next = items.slice();
  next[index] = record;
  return { next, summary };
}

module.exports = async function handler(req, res) {
  if (!requireSession(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!allowedOrigin(req)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
    return res.status(415).json({ ok: false, error: 'Unsupported content type' });
  }
  const body = jsonBody(req);
  const cfg = Object.prototype.hasOwnProperty.call(TYPES, body.type) ? TYPES[body.type] : null;
  if (!cfg) return res.status(400).json({ ok: false, error: 'Unknown section.' });
  if (!cfg.actions.includes(body.action)) return res.status(400).json({ ok: false, error: 'Unknown action.' });
  if (!store.isConfigured(cfg.store)) {
    return res.status(503).json({
      ok: false,
      error: cfg.store === 'site'
        ? 'Saving changes is not set up yet. Ask your website administrator to add the GITHUB_TOKEN setting.'
        : 'Saving follow-ups is not set up yet. Ask your website administrator to finish the private storage setup (GITHUB_DATA_REPO).',
    });
  }

  try {
    let pdfFile, logoFile;
    if (body.type === 'caseStudy' && body.action === 'save') {
      const input = itemOf(body);
      caseStudyFrom(input, null, null); // reject bad text before anything is uploaded
      pdfFile = await resolvePdf(input);
      logoFile = await resolveLogo(input);
    }
    let summary = '';
    const items = await store.updateJson(cfg.store, cfg.file, [], list => {
      const result = cfg.store === 'site' ? apply(body.type, body, list, pdfFile, logoFile) : followUp(body.type, body, list);
      summary = result.summary;
      return result.next;
    }, () => `${cfg.store === 'site' ? 'content' : 'inbox'}: ${summary} (management console)`);
    console.log('Console change:', summary);
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    if (err instanceof InputError) return res.status(err.status).json({ ok: false, error: err.message, ...(err.field ? { field: err.field } : {}) });
    console.error('Console update failed:', err.message);
    return res.status(502).json({ ok: false, error: 'Your change could not be saved. Please try again in a minute.' });
  }
};
