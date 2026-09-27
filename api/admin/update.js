// POST /api/admin/update: changes jobs or case studies from the management
// console (session required). Each change is committed to data/*.json in the
// site repository (see api/_store.js), which redeploys the public pages.
//
// Body (JSON):
//   { type: "job"|"caseStudy", action: "save", item: {...} }      create or edit
//   { type: "job"|"caseStudy", action: "toggle", id, value }      open/close, publish/hide
//   { type: "job"|"caseStudy", action: "delete", id }
// Seeded case studies (not added from the console) can only be shown or hidden,
// because their full pages and PDFs live in the site itself.
//
// Response: { ok: true, items: [...the whole updated list] }

const store = require('../_store');
const { requireSession, jsonBody } = require('../_admin');
const { allowedOrigin, clean } = require('../_http');

const CATEGORIES = ['network', 'services', 'safety'];

const TYPES = {
  job: { file: 'jobs.json', flag: 'isActive', label: 'opening', name: item => item.title },
  caseStudy: { file: 'case-studies.json', flag: 'published', label: 'case study', name: item => item.client },
};

class InputError extends Error {}

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

function required(value, label) {
  if (!value) throw new InputError(`Please fill in ${label}.`);
  return value;
}

function jobFrom(input, existing) {
  const positions = Number(input.positions);
  if (!Number.isInteger(positions) || positions < 1 || positions > 99) throw new InputError('Openings must be a whole number from 1 to 99.');
  return {
    id: existing ? existing.id : undefined,
    title: required(clean(input.title, 120), 'the job title'),
    department: required(clean(input.department, 80), 'the department'),
    location: required(clean(input.location, 120), 'the location'),
    positions,
    summary: required(multiline(input.summary, 600), 'the summary'),
    isActive: input.isActive === undefined ? (existing ? existing.isActive : true) : input.isActive === true,
  };
}

function caseStudyFrom(input, existing) {
  const category = clean(input.category, 20);
  if (!CATEGORIES.includes(category)) throw new InputError('Please choose a category.');
  const outcomes = (Array.isArray(input.outcomes) ? input.outcomes : String(input.outcomes || '').split('\n'))
    .map(o => clean(o, 200)).filter(Boolean).slice(0, 6);
  const metrics = (Array.isArray(input.metrics) ? input.metrics : [])
    .map(m => [clean(m && m[0], 40), clean(m && m[1], 40)]).filter(([k, v]) => k && v).slice(0, 4);
  return {
    id: existing ? existing.id : undefined,
    client: required(clean(input.client, 120), 'the client name'),
    wordmark: null,
    logo: null,
    category,
    industry: required(clean(input.industry, 80), 'the industry'),
    location: clean(input.location, 120),
    period: clean(input.period, 120),
    arch_tag: required(clean(input.arch_tag, 120), 'the project scope'),
    summary: required(multiline(input.summary, 600), 'the summary'),
    challenge: multiline(input.challenge, 1500),
    solution: multiline(input.solution, 1500),
    outcomes,
    metrics,
    pdf_file: null,
    published: input.published === undefined ? (existing ? existing.published : true) : input.published === true,
    custom: true,
  };
}

function apply(type, body, list) {
  const cfg = TYPES[type];
  const items = Array.isArray(list) ? list : [];
  const id = clean(body.id || (body.item && body.item.id), 80);
  const index = id ? items.findIndex(x => x && x.id === id) : -1;
  const current = index > -1 ? items[index] : null;

  if (body.action === 'toggle') {
    if (!current) throw new InputError(`That ${cfg.label} no longer exists.`);
    if (typeof body.value !== 'boolean') throw new InputError('Invalid switch value.');
    const next = items.slice();
    next[index] = { ...current, [cfg.flag]: body.value };
    return { next, summary: `${body.value ? 'Show' : 'Hide'} ${cfg.label} "${cfg.name(current)}"` };
  }

  if (body.action === 'delete') {
    if (!current) throw new InputError(`That ${cfg.label} no longer exists.`);
    if (type === 'caseStudy' && !current.custom) throw new InputError('Built-in case studies can be hidden but not deleted.');
    return { next: items.filter((_, i) => i !== index), summary: `Delete ${cfg.label} "${cfg.name(current)}"` };
  }

  if (body.action === 'save') {
    const input = body.item && typeof body.item === 'object' ? body.item : {};
    if (id && !current) throw new InputError(`That ${cfg.label} no longer exists.`);
    if (type === 'caseStudy' && current && !current.custom) throw new InputError('Built-in case studies can be hidden but not edited here.');
    const item = type === 'job' ? jobFrom(input, current) : caseStudyFrom(input, current);
    if (!current) {
      item.id = uniqueId(slug(type === 'job' ? `${item.title} ${item.location}` : `${item.client} ${item.arch_tag}`), items);
      return { next: [item, ...items], summary: `Add ${cfg.label} "${cfg.name(item)}"` };
    }
    const next = items.slice();
    next[index] = item;
    return { next, summary: `Edit ${cfg.label} "${cfg.name(item)}"` };
  }

  throw new InputError('Unknown action.');
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
  if (!store.isConfigured('site')) {
    return res.status(503).json({ ok: false, error: 'Saving changes is not set up yet. Ask your website administrator to add the GITHUB_TOKEN setting.' });
  }

  const body = jsonBody(req);
  const cfg = TYPES[body.type];
  if (!cfg) return res.status(400).json({ ok: false, error: 'Unknown section.' });

  try {
    let summary = '';
    const items = await store.updateJson('site', cfg.file, [], list => {
      const result = apply(body.type, body, list);
      summary = result.summary;
      return result.next;
    }, () => `content: ${summary} (management console)`);
    console.log('Console change:', summary);
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    if (err instanceof InputError) return res.status(400).json({ ok: false, error: err.message });
    console.error('Console update failed:', err.message);
    return res.status(502).json({ ok: false, error: 'Your change could not be saved. Please try again in a minute.' });
  }
};
