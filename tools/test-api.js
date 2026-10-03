// Local smoke/integration suite for the dtech-website API handlers.
// Runs every handler against a throwaway copy of data/ (cwd is switched to a temp
// sandbox), with SMTP mocked and network fetch blocked, so nothing is emailed,
// committed or written inside the repository.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(REPO, 'node_modules/nodemailer'))) throw new Error('node_modules missing: run npm ci first');

// ---- isolation -------------------------------------------------------------
for (const k of Object.keys(process.env)) if (/^(GITHUB_|SMTP_|MAIL_FROM|SALES_EMAIL|HR_EMAIL|VERCEL|ADMIN_SECRET|ALLOWED_ORIGINS|SITE_URL)/.test(k)) delete process.env[k];
Object.assign(process.env, { SMTP_HOST: 'smtp.invalid', SMTP_USER: 'test@invalid', SMTP_PASS: 'x', SALES_EMAIL: 'sales@test.invalid', ADMIN_SECRET: 'test-admin-secret-0123456789' });
// The only network the suite allows: this site's own static PDFs (the whitepaper
// handler fetches them from https://dtech.test), served from the sandbox's assets/.
let failPdfFetch = false;
globalThis.fetch = async (url) => {
  const m = /^https:\/\/dtech\.test\/(assets\/case-studies\/pdf\/[A-Za-z0-9\/._-]+\.pdf)$/.exec(String(url));
  if (!m) throw new Error(`network blocked in tests: ${url}`);
  if (failPdfFetch) return new Response('missing', { status: 404 });
  return new Response(fs.readFileSync(path.join(process.cwd(), m[1])), { status: 200 });
};
require(path.join(REPO, 'node_modules/nodemailer')).createTransport = () => { throw new Error('real SMTP transport must never be created in tests'); };

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dtech-suite-'));
fs.cpSync(path.join(REPO, 'data'), path.join(sandbox, 'data'), { recursive: true });
// assets/ is linked entry by entry, with real directories down to the console's
// PDF upload folder, so uploads made in the tests land in the sandbox.
const REAL_DIRS = ['assets', 'assets/case-studies', 'assets/case-studies/pdf', 'assets/case-studies/pdf/custom', 'assets/case-studies/logos', 'assets/case-studies/logos/custom'].map(d => path.join(REPO, d));
(function mirror(src, dst) {
  fs.mkdirSync(dst);
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    if (REAL_DIRS.includes(from)) mirror(from, path.join(dst, name)); else fs.symlinkSync(from, path.join(dst, name));
  }
})(path.join(REPO, 'assets'), path.join(sandbox, 'assets'));
fs.mkdirSync(path.join(sandbox, 'assets/case-studies/logos/custom'), { recursive: true });
const repoUploads = path.join(REPO, 'assets/case-studies/pdf/custom');
const repoLogos = path.join(REPO, 'assets/case-studies/logos/custom');
const repoLogosBefore = fs.existsSync(repoLogos) ? fs.readdirSync(repoLogos).length : -1;
const repoUploadsBefore = fs.existsSync(repoUploads) ? fs.readdirSync(repoUploads).length : -1;
process.chdir(sandbox);

const sent = [];
const mail = require(path.join(REPO, 'api/_mail.js'));
mail.sendMail = async (msg) => { sent.push(msg); return { id: `mock-${sent.length}` }; };

const api = (p) => require(path.join(REPO, 'api', p));
const jobs = api('jobs.js'), contact = api('contact.js'), apply = api('apply.js'), whitepaper = api('send-whitepaper.js');
const content = api('content.js');
const auth = api('admin/auth.js'), data = api('admin/data.js'), update = api('admin/update.js'), consoleApp = api('admin/console.js');

// ---- tiny req/res mocks ----------------------------------------------------
let ipSeq = 0;
function req(method, body, extra = {}) {
  return {
    method, body, query: extra.query || {},
    headers: { host: 'dtech.test', origin: 'https://dtech.test', 'content-type': 'application/json', 'x-real-ip': `10.0.0.${++ipSeq}`, ...(extra.headers || {}) },
  };
}
function res() {
  const r = { statusCode: 0, headers: {}, body: undefined };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}
async function call(handler, rq) { const r = res(); await handler(rq, r); return r; }

// ---- runner ----------------------------------------------------------------
const results = [];
async function area(name, checks) {
  const failures = [];
  let passed = 0;
  for (const [label, fn] of checks) {
    try { await fn(); passed++; } catch (e) { failures.push(`${label}: ${e.message}`); }
  }
  results.push({ name, passed, total: checks.length, failures });
}
const eq = (a, b, m) => assert.strictEqual(a, b, m);

(async () => {
  const errLog = console.error; const quiet = [];
  console.error = (...a) => quiet.push(a.join(' ')); // handlers log expected failures (e.g. store off)

  // 1. Jobs
  await area('1. Careers & jobs (api/jobs.js)', [
    ['jobs.json is valid JSON with 12 active roles', () => {
      const all = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'));
      eq(all.filter(j => j.isActive === true).length, 12, 'active roles');
    }],
    ['GET → 200, ok, 12 jobs, Cache-Control', async () => {
      const r = await call(jobs, req('GET'));
      eq(r.statusCode, 200); eq(r.body.ok, true); eq(r.body.jobs.length, 12);
      assert.match(r.headers['cache-control'], /max-age=\d+/);
      assert.deepStrictEqual(Object.keys(r.body.jobs[0]).sort(), ['department', 'id', 'location', 'positions', 'summary', 'title']);
    }],
    ['POST → 405', async () => eq((await call(jobs, req('POST'))).statusCode, 405)],
  ]);

  // 1b. Public copies of the console-edited lists
  await area('1b. Public content (api/content.js)', [
    ['case studies: published in full, a draft is only { id, published: false }', async () => {
      const raw = JSON.parse(fs.readFileSync('data/case-studies.json', 'utf8'));
      const draft = raw.find(c => c.published === false);
      assert(draft, 'fixture needs a draft case study');
      const r = await call(content, req('GET', null, { query: { list: 'case-studies' } }));
      eq(r.statusCode, 200); assert(Array.isArray(r.body)); eq(r.body.length, raw.length, 'drafts keep their slot for ordering');
      assert.deepStrictEqual(r.body.find(c => c.id === draft.id), { id: draft.id, published: false });
      assert(!JSON.stringify(r.body).includes(draft.summary), 'draft text leaked');
      assert(r.body.filter(c => c.published !== false).every(c => c.client), 'published entries complete');
      assert.match(r.headers['cache-control'], /max-age=0/);
    }],
    ['banners: only active ones', async () => {
      const file = 'data/banners.json';
      const before = fs.readFileSync(file, 'utf8');
      try {
        fs.writeFileSync(file, JSON.stringify([{ id: 'on', message: 'Shown', isActive: true }, { id: 'off', message: 'Secret draft', isActive: false }]));
        const r = await call(content, req('GET', null, { query: { list: 'banners' } }));
        eq(r.statusCode, 200); assert.deepStrictEqual(r.body.map(b => b.id), ['on']);
      } finally { fs.writeFileSync(file, before); }
    }],
    ['unknown or missing list → 404; jobs and private lists are not served', async () => {
      for (const list of [undefined, '', 'jobs', 'applicants', '../package', '__proto__', 'constructor']) {
        eq((await call(content, req('GET', null, { query: list === undefined ? {} : { list } }))).statusCode, 404, String(list));
      }
    }],
    ['POST → 405', async () => eq((await call(content, req('POST', null, { query: { list: 'banners' } }))).statusCode, 405)],
  ]);

  // 2. Contact
  const validEnquiry = { name: 'Test Client', email: 'test@enterprise.com', phone: '+91 99999 88888', company: 'Test Industries', topic: 'Forklift AI Safety', message: 'Testing automated proposal submission' };
  await area('2. Contact / requirements (api/contact.js)', [
    ['honeypot → 200, no email', async () => {
      const before = sent.length;
      const r = await call(contact, req('POST', { ...validEnquiry, website: 'spam' }));
      eq(r.statusCode, 200); eq(sent.length, before, 'mail sent for bot');
    }],
    ['missing email → 400', async () => eq((await call(contact, req('POST', { ...validEnquiry, email: '' }))).statusCode, 400)],
    ['invalid email → 400', async () => eq((await call(contact, req('POST', { ...validEnquiry, email: 'not-an-email' }))).statusCode, 400)],
    ['foreign origin → 403', async () => eq((await call(contact, req('POST', validEnquiry, { headers: { origin: 'https://evil.test' } }))).statusCode, 403)],
    ['valid → 200 ok, mail to sales with Reply-To client, filed locally', async () => {
      const before = sent.length;
      const r = await call(contact, req('POST', validEnquiry));
      eq(r.statusCode, 200); eq(r.body.ok, true);
      const m = sent[before]; assert(m, 'no mail');
      eq(m.to, 'sales@test.invalid'); eq(m.replyTo, 'test@enterprise.com');
      assert.match(m.subject, /Forklift AI Safety — Test Client/);
      assert(m.html.includes('Test Industries') && m.text.includes('+91 99999 88888'));
      const filed = JSON.parse(fs.readFileSync('.portal-data/requirements.json', 'utf8'));
      eq(filed[0].id, r.body.id);
    }],
    ['valid → visitor gets the thank-you auto-responder (and no reply-to sales leak)', async () => {
      const before = sent.length;
      const r = await call(contact, req('POST', validEnquiry));
      eq(r.statusCode, 200);
      const c = sent.slice(before).find(m => m.to === validEnquiry.email);
      assert(c, 'no confirmation mail to the visitor');
      eq(c.subject, 'Thank you for contacting D-TECH \u2014 Requirement Received');
      assert(c.html.includes('Hello Test Client,') && c.text.includes('Hello Test Client,'), 'personalised greeting');
      assert(c.html.includes('Forklift AI Safety') && c.text.includes('Forklift AI Safety'), 'topic acknowledged');
      assert(/within 1 business day/.test(c.text), 'response promise');
      assert(c.text.includes('sales@dtechindia.com') && c.text.includes('+91 99980 26089') && c.text.includes('Bharuch'), 'contact details');
      eq(sent.slice(before).filter(m => m.to === 'sales@test.invalid').length, 1, 'sales notified once');
    }],
    ['auto-responder ignores markup planted in the name', async () => {
      const before = sent.length;
      await call(contact, req('POST', { ...validEnquiry, name: 'Win <a href="http://x.test">prize</a> now' }));
      const c = sent.slice(before).find(m => m.to === validEnquiry.email);
      assert(c && !c.html.includes('x.test'), 'markup reached the visitor mail');
    }],
  ]);

  // 3. Apply
  const pdfB64 = Buffer.from('%PDF-1.4\n%test cv\n').toString('base64');
  const openJob = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8')).find(j => j.isActive);
  const applicant = { jobId: openJob.id, name: 'Test Candidate', email: 'cand@example.com', phone: '+91 90000 00000', message: 'Hello' };
  await area('3. Job application with CV (api/apply.js)', [
    ['.exe MIME rejected → 400', async () => {
      const r = await call(apply, req('POST', { ...applicant, email: 'exe@example.com', cv: { filename: 'cv.exe', type: 'application/x-msdownload', dataBase64: pdfB64 } }));
      eq(r.statusCode, 400);
    }],
    ['CV over 3 MB rejected → 413', async () => {
      const big = Buffer.alloc(3 * 1024 * 1024 + 10, 65).toString('base64');
      const r = await call(apply, req('POST', { ...applicant, email: 'big@example.com', cv: { filename: 'cv.pdf', type: 'application/pdf', dataBase64: big } }));
      eq(r.statusCode, 413);
    }],
    ['executable declared as PDF → 400 (magic bytes)', async () => {
      const exe = Buffer.from('MZ\x90\x00fake executable').toString('base64');
      const r = await call(apply, req('POST', { ...applicant, email: 'mz@example.com', cv: { filename: 'cv.pdf', type: 'application/pdf', dataBase64: exe } }));
      eq(r.statusCode, 400); eq(r.body.error, 'The attached file is not a valid PDF or Word document.');
    }],
    ['PDF bytes declared as DOCX → 400 (magic bytes)', async () => {
      const r = await call(apply, req('POST', { ...applicant, email: 'mismatch@example.com', cv: { filename: 'cv.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', dataBase64: pdfB64 } }));
      eq(r.statusCode, 400);
    }],
    ['valid DOCX (PK header) → 200', async () => {
      const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]).toString('base64');
      const r = await call(apply, req('POST', { ...applicant, email: 'docx@example.com', cv: { filename: 'cv.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', dataBase64: docx } }));
      eq(r.statusCode, 200);
    }],
    ['closed/unknown role → 400',async () => eq((await call(apply, req('POST', { ...applicant, email: 'x@example.com', jobId: 'no-such-role' }))).statusCode, 400)],
    ['valid PDF application → 200, CV attached, filed', async () => {
      const before = sent.length;
      const r = await call(apply, req('POST', { ...applicant, cv: { filename: 'My CV.pdf', type: 'application/pdf', dataBase64: pdfB64 } }));
      eq(r.statusCode, 200); eq(r.body.ok, true); eq(r.body.job, openJob.title);
      const m = sent[before]; assert(m, 'no mail');
      eq(m.replyTo, 'cand@example.com');
      eq(m.attachments.length, 1);
      const a = m.attachments[0];
      eq(a.filename, 'My CV.pdf'); eq(a.contentType, 'application/pdf');
      assert(Buffer.isBuffer(a.content) && a.content.toString().startsWith('%PDF-1.4'), 'attachment bytes');
      const rec = JSON.parse(fs.readFileSync('.portal-data/applicants.json', 'utf8'))[0];
      eq(rec.id, r.body.reference);
      assert(fs.existsSync(path.join('.portal-data', rec.cv.path)), 'CV file filed');
    }],
  ]);

  // 4. Whitepapers
  const papers = require(path.join(REPO, 'api/_whitepapers.json'));
  await area('4. Case-study PDF request (api/send-whitepaper.js)', [
    ...Object.entries(papers).map(([id, p]) => [`${id} → ${p.file} exists and is a PDF`, () => {
      const buf = fs.readFileSync(path.join(REPO, p.file));
      eq(buf.subarray(0, 5).toString(), '%PDF-', 'PDF header');
    }]),
    ['unknown caseId → 400', async () => eq((await call(whitepaper, req('POST', { email: 'lead@example.com', caseId: 'nope' }))).statusCode, 400)],
    ['on Vercel a forged Host cannot change the email link or the PDF fetch', async () => {
      Object.assign(process.env, { VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'dtech.test' });
      try {
        const before = sent.length;
        const forged = { host: 'evil.test', 'x-forwarded-host': 'evil.test', origin: 'https://evil.test' };
        const r = await call(whitepaper, req('POST', { email: 'host@example.com', name: 'Lead', caseId: 'petronet-fms' }, { headers: forged }));
        eq(r.statusCode, 200, JSON.stringify(r.body));
        const visitor = sent.slice(before).find(m => m.to === 'host@example.com');
        assert(visitor && visitor.attachments.length === 1, 'PDF fetched from the production address');
        assert(!visitor.html.includes('evil.test'), 'forged host in the email');
        // Without the attachment the email carries a download link: it must point at production.
        failPdfFetch = true;
        const mark = sent.length;
        eq((await call(whitepaper, req('POST', { email: 'link@example.com', name: 'Lead', caseId: 'petronet-fms' }, { headers: forged }))).statusCode, 200);
        const linked = sent.slice(mark).find(m => m.to === 'link@example.com');
        assert(linked.html.includes('https://dtech.test/assets/case-studies/pdf/'), 'download link on the production address');
        assert(!linked.html.includes('evil.test'), 'forged host in the download link');
      } finally { failPdfFetch = false; delete process.env.VERCEL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL; }
    }],
    ['petronet-fms → visitor gets the PDF attached, sales gets lead alert, lead filed', async () => {
      const before = sent.length;
      const r = await call(whitepaper, req('POST', { email: 'lead@example.com', name: 'Lead Person', company: 'Acme', caseId: 'petronet-fms' }));
      eq(r.statusCode, 200); eq(r.body.ok, true);
      const [visitor, sales] = sent.slice(before);
      eq(visitor.to, 'lead@example.com');
      eq(visitor.attachments.length, 1);
      eq(visitor.attachments[0].filename, 'petronet-lng-enterprise-fms-2026.pdf');
      eq(visitor.attachments[0].contentType, 'application/pdf');
      eq(visitor.attachments[0].content.subarray(0, 5).toString(), '%PDF-');
      assert(visitor.html.includes('attached to this email'), 'says attached');
      assert(!visitor.html.includes('Download the case study'), 'no link when attached');
      eq(sales.to, 'sales@test.invalid'); eq(sales.replyTo, 'lead@example.com');
      eq(JSON.parse(fs.readFileSync('.portal-data/leads.json', 'utf8'))[0].caseId, 'petronet-fms');
    }],
    ['PDF cannot be fetched → visitor still gets the CDN download link, no attachment', async () => {
      failPdfFetch = true;
      try {
        const before = sent.length;
        const r = await call(whitepaper, req('POST', { email: 'lead5@example.com', caseId: 'petronet-fms' }));
        eq(r.statusCode, 200, JSON.stringify(r.body));
        const visitor = sent[before];
        eq(visitor.attachments.length, 0);
        assert(visitor.html.includes('href="https://dtech.test/assets/case-studies/pdf/petronet-lng-enterprise-fms-2026.pdf"'), 'CDN download link');
      } finally { failPdfFetch = false; }
    }],
  ]);

  // 5. Admin portal
  let cookie = '';
  await area('5. Admin sign-in & admin API', [
    ['portal.html: ID + password sign-in page, noindex, posts (never GETs), no console markup', () => {
      const portal = fs.readFileSync(path.join(REPO, 'portal.html'), 'utf8');
      for (const needle of ['<meta name="robots" content="noindex, nofollow">', 'autocomplete="username"', 'autocomplete="current-password"', 'method="post"', 'type="password"']) {
        assert(portal.includes(needle), `portal.html missing ${needle}`);
      }
      assert(!/requirements|applicants|ADMIN_SECRET|ADMIN_USER/i.test(portal), 'console strings or setting names leaked into portal.html');
    }],
    ['vercel.json: /admin-dtech serves portal.html, noindex + no-store on both paths', () => {
      const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
      assert((cfg.rewrites || []).some(r => r.source === '/admin-dtech' && r.destination === '/portal'), 'rewrite');
      assert((cfg.redirects || []).some(r => r.source === '/admin-dtech/' && r.destination === '/admin-dtech'), 'trailing-slash redirect');
      for (const p of ['/portal.html', '/portal', '/admin-dtech']) {
        const keys = cfg.headers.filter(h => new RegExp(`^${h.source}$`).test(p)).flatMap(h => h.headers.map(x => `${x.key}: ${x.value}`));
        assert(keys.includes('X-Robots-Tag: noindex, nofollow') && keys.includes('Cache-Control: no-store'), `${p} headers: ${keys.join(' | ')}`);
      }
    }],
    ['vercel.json: every redirect and rewrite lands on a page that exists', () => {
      const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
      for (const r of [...(cfg.redirects || []), ...(cfg.rewrites || [])]) {
        const dest = r.destination.split(/[?#]/)[0];
        if (dest === '/' || dest === '/admin-dtech') continue;
        const file = dest.replace(/^\//, '');
        assert(fs.existsSync(path.join(REPO, file)) || fs.existsSync(path.join(REPO, `${file}.html`)), `${r.source} -> ${r.destination} is missing`);
      }
    }],
    ['no session: auth GET, data, update → 404', async () => {
      eq((await call(auth, req('GET'))).statusCode, 404);
      eq((await call(data, req('GET'))).statusCode, 404);
      eq((await call(update, req('POST', {}))).statusCode, 404);
    }],
    ['wrong password, wrong ID, missing ID → 401, no cookie', async () => {
      for (const body of [{ id: 'admin', key: 'wrong-passkey-xxxxxxxx' }, { id: 'someone', key: process.env.ADMIN_SECRET }, { key: process.env.ADMIN_SECRET }]) {
        const r = await call(auth, req('POST', body));
        eq(r.statusCode, 401, JSON.stringify(body)); eq(r.body.ok, false); eq(r.headers['set-cookie'], undefined);
      }
    }],
    ['ADMIN_USER sets the ID (any case, spaces trimmed); "admin" then stops working', async () => {
      process.env.ADMIN_USER = 'Suraj';
      try {
        eq((await call(auth, req('POST', { id: '  suraj ', key: process.env.ADMIN_SECRET }))).statusCode, 200);
        eq((await call(auth, req('POST', { id: 'admin', key: process.env.ADMIN_SECRET }))).statusCode, 401);
      } finally { delete process.env.ADMIN_USER; }
    }],
    ['console switched off (no ADMIN_SECRET) → sign-in 404', async () => {
      const saved = process.env.ADMIN_SECRET;
      delete process.env.ADMIN_SECRET;
      try { eq((await call(auth, req('POST', { id: 'admin', key: saved }))).statusCode, 404); } finally { process.env.ADMIN_SECRET = saved; }
    }],
    ['correct ID + password → 200, signed HttpOnly/Secure/SameSite=Strict cookie', async () => {
      const r = await call(auth, req('POST', { id: 'Admin', key: process.env.ADMIN_SECRET }));
      eq(r.statusCode, 200);
      const c = r.headers['set-cookie'];
      assert(/HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Strict/.test(c) && /Path=\/api\/admin/.test(c), c);
      cookie = c.split(';')[0];
      assert.match(cookie, /^dt_console=\d+\.[A-Za-z0-9_-]+$/);
    }],
    ['tampered cookie → 404', async () => eq((await call(data, req('GET', null, { headers: { cookie: cookie.replace(/.$/, c => c === 'A' ? 'B' : 'A') } }))).statusCode, 404)],
    ['data with session → requirements, applicants, leads, jobs, caseStudies', async () => {
      const r = await call(data, req('GET', null, { headers: { cookie } }));
      eq(r.statusCode, 200);
      for (const k of ['requirements', 'applicants', 'leads', 'jobs', 'caseStudies']) assert(Array.isArray(r.body[k]), k);
      eq(r.body.requirements.length, 3); eq(r.body.applicants.length, 2); // 3 = the valid enquiry plus the two area-2 auto-responder posts; // PDF + DOCX applications from area 3 eq(r.body.leads.length, 1);
    }],
    ['deployed copy of a site list for the console; others refused; no session → 404', async () => {
      const r = await call(data, req('GET', null, { query: { deployed: 'case-studies.json' }, headers: { cookie } }));
      eq(r.statusCode, 200); assert.deepStrictEqual(r.body, JSON.parse(fs.readFileSync('data/case-studies.json', 'utf8')));
      for (const f of ['applicants.json', '../package.json', 'x']) eq((await call(data, req('GET', null, { query: { deployed: f }, headers: { cookie } }))).statusCode, 400, f);
      eq((await call(data, req('GET', null, { query: { deployed: 'jobs.json' } }))).statusCode, 404);
    }],
    ['update toggles a role isActive (sandbox copy only)', async () => {
      const r = await call(update, req('POST', { type: 'job', action: 'toggle', id: openJob.id, value: false }, { headers: { cookie } }));
      eq(r.statusCode, 200); eq(r.body.ok, true);
      eq(r.body.items.find(j => j.id === openJob.id).isActive, false);
      eq((await call(jobs, req('GET'))).body.jobs.length, 11, 'public list reflects toggle');
    }],
    ['sign-in script: posts ID + password, 401/404/429 handled, loads console, nothing stored', () => {
      const portal = fs.readFileSync(path.join(REPO, 'portal.html'), 'utf8');
      const script = portal.match(/<script>\s*\(function \(\) \{\s*\/\/ Staff sign-in\.[\s\S]*?<\/script>/)[0];
      new Function(script.replace(/^<script>|<\/script>$/g, '')); // parses
      for (const needle of ["method: 'POST'", 'JSON.stringify({ id: id, key: key })', 'r.status === 401', 'r.status === 404', 'r.status === 429', "'/api/admin/console'", "'signed-out'", "'session-ended'"]) {
        assert(script.includes(needle), `sign-in script missing ${needle}`);
      }
      assert(!/setItem\([^)]*key\b/.test(script), 'password must never be stored');
    }],
    ['console app script: served to a session only, parses', async () => {
      eq((await call(consoleApp, req('GET'))).statusCode, 404);
      const r = await call(consoleApp, req('GET', null, { headers: { cookie } }));
      eq(r.statusCode, 200);
      assert.match(r.headers['content-type'], /javascript/);
      new Function(r.body);
    }],
  ]);

  // 6. Console publishing: jobs, case studies (with PDFs) and banners
  const post = (body) => call(update, req('POST', body, { headers: { cookie } }));
  const fieldError = async (body, field, status = 400) => {
    const r = await post(body);
    eq(r.statusCode, status, JSON.stringify(r.body)); eq(r.body.ok, false); eq(r.body.field, field, r.body.error);
  };
  const job = { title: 'Industrial Network Engineer', department: 'Engineering', location: 'Bharuch', positions: 2, summary: 'Keep plant networks running.\n\n- Configure switches\n- Support CCTV links', isActive: true };
  const cs = { pdf: { mode: 'link', url: 'https://files.example.com/default.pdf' }, client: 'Test Chemicals Ltd', industry: 'Chemicals', category: 'network', arch_tag: 'Plant-wide Network', summary: 'A short summary.', outcomes: ['45% reduction in cycle time'], metrics: [['Uptime', '99.8%']] };
  const banner = { message: 'Offices closed 20–24 Oct for Diwali.', tone: 'warning', linkLabel: 'Contact us', linkUrl: 'contact.html', startsOn: '2026-10-18', endsOn: '2026-10-25', isActive: true };
  const pdf = (bytes) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(bytes)]).toString('base64');
  const uploads = () => fs.existsSync('assets/case-studies/pdf/custom') ? fs.readdirSync('assets/case-studies/pdf/custom') : [];
  let uploadedCase, linkedCase, bannerId;
  await area('6. Console publishing (api/admin/update.js)', [
    ['job: add with bullets, closed → saved, hidden from /api/jobs', async () => {
      const r = await post({ type: 'job', action: 'save', item: { ...job, isActive: false } });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      const saved = r.body.items[0];
      eq(saved.id, 'industrial-network-engineer-bharuch'); eq(saved.isActive, false); eq(saved.positions, 2);
      assert(saved.summary.includes('\n- Configure switches'), 'summary line breaks kept');
      assert(!(await call(jobs, req('GET'))).body.jobs.some(j => j.id === saved.id), 'closed job listed publicly');
    }],
    ['job: positions 0 / 100 / 1.5 → 400 positions', async () => {
      for (const positions of [0, 100, 1.5]) await fieldError({ type: 'job', action: 'save', item: { ...job, positions } }, 'positions');
    }],
    ['job: missing title, 1001-char summary, non-boolean status → 400 naming the field', async () => {
      await fieldError({ type: 'job', action: 'save', item: { ...job, title: '  ' } }, 'title');
      await fieldError({ type: 'job', action: 'save', item: { ...job, summary: 'x'.repeat(1001) } }, 'summary');
      await fieldError({ type: 'job', action: 'save', item: { ...job, isActive: 'yes' } }, 'isActive');
    }],
    ['unknown action / section → 400', async () => {
      eq((await post({ type: 'job', action: 'publish', id: 'x' })).statusCode, 400);
      eq((await post({ type: 'page', action: 'save', item: {} })).statusCode, 400);
    }],
    ['case study: half-filled metric, 7 results, http link → 400 naming the field', async () => {
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, metrics: [['Uptime', '99.8%'], ['Sites', '']] } }, 'metric1');
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, outcomes: Array(7).fill('Result') } }, 'outcomes');
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, pdf: { mode: 'link', url: 'http://example.com/a.pdf' } } }, 'pdfUrl');
    }],
    ['case study: non-PDF upload → 400, over 3 MB → 413, nothing written', async () => {
      const before = uploads().length;
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, pdf: { mode: 'upload', dataBase64: Buffer.from('MZ fake').toString('base64') } } }, 'pdfFile');
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, pdf: { mode: 'upload', dataBase64: pdf(3 * 1024 * 1024) } } }, 'pdfFile', 413);
      eq(uploads().length, before);
    }],
    ['case study: bad text is refused before the PDF is uploaded', async () => {
      const before = uploads().length;
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, client: '', pdf: { mode: 'upload', dataBase64: pdf(10) } } }, 'client');
      eq(uploads().length, before);
    }],
    ['case study: PDF upload → committed under custom/, pdf_file set, published', async () => {
      const r = await post({ type: 'caseStudy', action: 'save', item: { ...cs, pdf: { mode: 'upload', filename: 'x.pdf', dataBase64: pdf(64) } } });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      uploadedCase = r.body.items[0];
      eq(uploadedCase.custom, true); eq(uploadedCase.published, true);
      assert.match(uploadedCase.pdf_file, /^assets\/case-studies\/pdf\/custom\/test-chemicals-ltd-[0-9a-f]{6}\.pdf$/);
      assert(fs.readFileSync(uploadedCase.pdf_file).subarray(0, 5).toString() === '%PDF-', 'uploaded file');
      const repoNow = fs.existsSync(repoUploads) ? fs.readdirSync(repoUploads).length : -1;
      eq(repoNow, repoUploadsBefore, 'upload leaked into the repository');
    }],
    ['case study: PDF is mandatory — none, missing, or "keep" with nothing to keep → 400 pdfFile', async () => {
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, pdf: { mode: 'none' } } }, 'pdfFile');
      const { pdf: _omit, ...noPdf } = cs;
      await fieldError({ type: 'caseStudy', action: 'save', item: noPdf }, 'pdfFile');
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, pdf: { mode: 'keep' } } }, 'pdfFile');
    }],
    ['case study: logo must be a PNG/JPG/WebP under 300 KB (SVG and fakes refused)', async () => {
      const logos = () => fs.readdirSync('assets/case-studies/logos/custom').length;
      const before = logos();
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, logo: { mode: 'upload', dataBase64: svg } } }, 'logoFile');
      await fieldError({ type: 'caseStudy', action: 'save', item: { ...cs, logo: { mode: 'upload', dataBase64: Buffer.alloc(400 * 1024, 0xff).toString('base64') } } }, 'logoFile', 413);
      eq(logos(), before);
    }],
    ['case study: logo upload → committed under logos/custom/, kept on edit, removable', async () => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString('base64');
      const r = await post({ type: 'caseStudy', action: 'save', item: { ...cs, client: 'Logo Client', logo: { mode: 'upload', dataBase64: png } } });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      const made = r.body.items[0];
      assert.match(made.logo, /^assets\/case-studies\/logos\/custom\/logo-client-[0-9a-f]{6}\.png$/);
      assert(fs.existsSync(made.logo), 'logo file written');
      const kept = await post({ type: 'caseStudy', action: 'save', id: made.id, item: { ...cs, client: 'Logo Client', logo: { mode: 'keep' } } });
      eq(kept.body.items.find(c => c.id === made.id).logo, made.logo);
      const gone = await post({ type: 'caseStudy', action: 'save', id: made.id, item: { ...cs, client: 'Logo Client', logo: { mode: 'none' } } });
      eq(gone.body.items.find(c => c.id === made.id).logo, null);
      const repoNow = fs.existsSync(repoLogos) ? fs.readdirSync(repoLogos).length : -1;
      eq(repoNow, repoLogosBefore, 'logo upload leaked into the repository');
      await post({ type: 'caseStudy', action: 'delete', id: made.id });
    }],
    ['case study: edit with "keep" leaves the PDF; draft + link saved', async () => {
      const kept = await post({ type: 'caseStudy', action: 'save', id: uploadedCase.id, item: { ...cs, summary: 'Edited.', pdf: { mode: 'keep' } } });
      eq(kept.statusCode, 200); eq(kept.body.items.find(c => c.id === uploadedCase.id).pdf_file, uploadedCase.pdf_file);
      const r = await post({ type: 'caseStudy', action: 'save', item: { ...cs, client: 'Linked Pharma', published: false, pdf: { mode: 'link', url: 'https://files.example.com/case.pdf' } } });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      linkedCase = r.body.items[0];
      eq(linkedCase.published, false); eq(linkedCase.pdf_file, 'https://files.example.com/case.pdf');
    }],
    ['case study: built-in cannot be edited or deleted, can be unpublished', async () => {
      eq((await post({ type: 'caseStudy', action: 'save', id: 'mrf', item: cs })).statusCode, 400);
      eq((await post({ type: 'caseStudy', action: 'delete', id: 'mrf' })).statusCode, 400);
      const r = await post({ type: 'caseStudy', action: 'toggle', id: 'mrf', value: false });
      eq(r.statusCode, 200); eq(r.body.items.find(c => c.id === 'mrf').published, false);
      await post({ type: 'caseStudy', action: 'toggle', id: 'mrf', value: true });
    }],
    ['banner: bad link, dates, tone, half link → 400 naming the field', async () => {
      await fieldError({ type: 'banner', action: 'save', item: { ...banner, linkUrl: 'javascript:alert(1)' } }, 'linkUrl');
      await fieldError({ type: 'banner', action: 'save', item: { ...banner, linkUrl: '//evil.example' } }, 'linkUrl');
      await fieldError({ type: 'banner', action: 'save', item: { ...banner, endsOn: '2026-10-01' } }, 'endsOn');
      await fieldError({ type: 'banner', action: 'save', item: { ...banner, startsOn: '2026-02-30' } }, 'startsOn');
      await fieldError({ type: 'banner', action: 'save', item: { ...banner, tone: 'purple' } }, 'tone');
      await fieldError({ type: 'banner', action: 'save', item: { ...banner, linkUrl: '' } }, 'linkUrl');
      await fieldError({ type: 'banner', action: 'save', item: { ...banner, message: 'x'.repeat(201) } }, 'message');
    }],
    ['banner: add → data/banners.json; tel: link ok; toggle; delete', async () => {
      const r = await post({ type: 'banner', action: 'save', item: banner });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      bannerId = r.body.items[0].id;
      assert.deepStrictEqual(JSON.parse(fs.readFileSync('data/banners.json', 'utf8'))[0], { id: bannerId, ...banner });
      eq((await post({ type: 'banner', action: 'save', id: bannerId, item: { ...banner, linkUrl: 'tel:+91 99980 26089' } })).statusCode, 200);
      eq((await post({ type: 'banner', action: 'toggle', id: bannerId, value: false })).body.items[0].isActive, false);
      eq((await post({ type: 'banner', action: 'delete', id: bannerId })).body.items.length, 0);
    }],
    ['data: banners list and publishing mode', async () => {
      const r = await call(data, req('GET', null, { headers: { cookie } }));
      eq(r.statusCode, 200); assert(Array.isArray(r.body.banners)); eq(r.body.publishing, 'local');
    }],
    ['whitepaper: console case study → uploaded PDF attached; link emailed; draft refused', async () => {
      delete require.cache[require.resolve(path.join(REPO, 'api/send-whitepaper.js'))]; // fresh list cache
      const fresh = api('send-whitepaper.js');
      let before = sent.length;
      let r = await call(fresh, req('POST', { email: 'lead2@example.com', caseId: uploadedCase.id }));
      eq(r.statusCode, 200, JSON.stringify(r.body));
      eq(sent[before].attachments[0].filename, path.basename(uploadedCase.pdf_file));
      eq((await call(fresh, req('POST', { email: 'lead3@example.com', caseId: linkedCase.id }))).statusCode, 400, 'draft sent');
      await post({ type: 'caseStudy', action: 'toggle', id: linkedCase.id, value: true });
      delete require.cache[require.resolve(path.join(REPO, 'api/send-whitepaper.js'))];
      before = sent.length;
      r = await call(api('send-whitepaper.js'), req('POST', { email: 'lead4@example.com', caseId: linkedCase.id }));
      eq(r.statusCode, 200, JSON.stringify(r.body));
      eq(sent[before].attachments.length, 0);
      assert(sent[before].html.includes('href="https://files.example.com/case.pdf"'), 'link in email');
    }],
  ]);

  // 6b. Display order of site lists; status and internal notes on the private inbox lists.
  const siteFile = (f) => JSON.parse(fs.readFileSync(`data/${f}`, 'utf8'));
  const inboxFile = (f) => JSON.parse(fs.readFileSync(`.portal-data/${f}`, 'utf8'));
  await area('6b. Console follow-ups & display order', [
    ['reorder jobs → file and /api/jobs follow the new order', async () => {
      const before = siteFile('jobs.json').map(j => j.id);
      const ids = before.slice().reverse();
      const r = await post({ type: 'job', action: 'reorder', ids });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body.items.map(j => j.id), ids);
      assert.deepStrictEqual(siteFile('jobs.json').map(j => j.id), ids);
      const listed = (await call(jobs, req('GET'))).body.jobs.map(j => j.id);
      assert.deepStrictEqual(listed, ids.filter(id => listed.includes(id)), 'public order');
      eq((await post({ type: 'job', action: 'reorder', ids: before })).statusCode, 200);
    }],
    ['reorder case studies → records kept whole, only the order changes', async () => {
      const before = siteFile('case-studies.json');
      const ids = before.map(c => c.id);
      ids.push(ids.shift());
      eq((await post({ type: 'caseStudy', action: 'reorder', ids })).statusCode, 200);
      const after = siteFile('case-studies.json');
      assert.deepStrictEqual(after.map(c => c.id), ids);
      assert.deepStrictEqual(after.slice().sort((a, b) => a.id < b.id ? -1 : 1), before.slice().sort((a, b) => a.id < b.id ? -1 : 1));
    }],
    ['reorder with a missing, duplicate or unknown id → 400, file unchanged', async () => {
      const ids = siteFile('jobs.json').map(j => j.id);
      for (const bad of [ids.slice(1), [ids[0], ...ids.slice(0, -1)], [...ids.slice(0, -1), 'no-such-job'], 'not-a-list']) {
        eq((await post({ type: 'job', action: 'reorder', ids: bad })).statusCode, 400, JSON.stringify(bad).slice(0, 60));
      }
      assert.deepStrictEqual(siteFile('jobs.json').map(j => j.id), ids);
    }],
    ['status: applicant → contacted, in the private store only', async () => {
      const a = inboxFile('applicants.json')[0];
      const r = await post({ type: 'applicant', action: 'status', id: a.id, value: 'contacted' });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      eq(r.body.items.find(x => x.id === a.id).status, 'contacted');
      eq(inboxFile('applicants.json').find(x => x.id === a.id).status, 'contacted');
      eq(inboxFile('applicants.json').length, 2, 'other applicants kept');
      assert(!fs.readdirSync('data').some(f => /applicant|requirement|lead/.test(f)), 'inbox data written to data/');
      eq((await post({ type: 'lead', action: 'status', id: inboxFile('leads.json')[0].id, value: 'archived' })).statusCode, 200);
    }],
    ['status: unknown value → 400 status; unknown record → 400', async () => {
      const id = inboxFile('requirements.json')[0].id;
      await fieldError({ type: 'requirement', action: 'status', id, value: 'won' }, 'status');
      eq((await post({ type: 'requirement', action: 'status', id: 'nobody-here', value: 'new' })).statusCode, 400);
    }],
    ['note: added with date and id, then removed; empty / 1001 chars → 400 note', async () => {
      const id = inboxFile('requirements.json')[0].id;
      await fieldError({ type: 'requirement', action: 'note', id, note: '   ' }, 'note');
      await fieldError({ type: 'requirement', action: 'note', id, note: 'x'.repeat(1001) }, 'note');
      const r = await post({ type: 'requirement', action: 'note', id, note: 'Called the client.\nQuote by Friday.' });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      const [note] = inboxFile('requirements.json')[0].notes;
      eq(note.text, 'Called the client.\nQuote by Friday.');
      assert.match(note.id, /^[0-9a-f]{8}$/); assert(!isNaN(Date.parse(note.date)), 'note date');
      eq((await post({ type: 'requirement', action: 'note', id, note: 'Second note.' })).body.items[0].notes.length, 2);
      eq((await post({ type: 'requirement', action: 'deleteNote', id, noteId: note.id })).statusCode, 200);
      assert.deepStrictEqual(inboxFile('requirements.json')[0].notes.map(n => n.text), ['Second note.']);
      eq((await post({ type: 'requirement', action: 'deleteNote', id, noteId: note.id })).statusCode, 400, 'already removed');
    }],
    ['inbox actions refused on site lists and the reverse; odd section names → 400', async () => {
      const leads = inboxFile('leads.json').length;
      eq((await post({ type: 'job', action: 'status', id: openJob.id, value: 'new' })).statusCode, 400);
      eq((await post({ type: 'lead', action: 'delete', id: inboxFile('leads.json')[0].id })).statusCode, 400);
      eq((await post({ type: 'applicant', action: 'reorder', ids: [] })).statusCode, 400);
      for (const type of ['constructor', '__proto__', 'toString']) eq((await post({ type, action: 'save', item: {} })).statusCode, 400, type);
      eq(inboxFile('leads.json').length, leads, 'leads kept');
    }],
    ['private store off → 503 naming the storage setup, nothing written', async () => {
      const before = fs.readFileSync('.portal-data/leads.json', 'utf8');
      process.env.VERCEL = '1';
      try {
        const r = await post({ type: 'lead', action: 'note', id: inboxFile('leads.json')[0].id, note: 'x' });
        eq(r.statusCode, 503); assert.match(r.body.error, /private storage/);
      } finally { delete process.env.VERCEL; }
      eq(fs.readFileSync('.portal-data/leads.json', 'utf8'), before);
    }],
  ]);

  // 8 (reported after 7). GitHub store retry and privacy rules, against a scripted fake GitHub.
  // The store caches "repo is private" per instance, so each privacy check uses its own repo name.
  const store = api('_store.js');
  async function withFakeGitHub(putResponses, fn, { repo = 'test-owner/test-data', isPrivate = true } = {}) {
    const saved = { fetch: globalThis.fetch, repo: process.env.GITHUB_DATA_REPO, token: process.env.GITHUB_DATA_TOKEN };
    const puts = [];
    const calls = { visibility: 0 };
    const base = `https://api.github.com/repos/${repo}`;
    Object.assign(process.env, { GITHUB_DATA_REPO: repo, GITHUB_DATA_TOKEN: 'test-token' });
    globalThis.fetch = async (url, opts) => {
      url = String(url);
      if (url === base && opts.method === 'GET') {
        calls.visibility++;
        return { ok: true, status: 200, json: async () => ({ full_name: repo, private: isPrivate }), text: async () => '' };
      }
      assert(url.startsWith(`${base}/contents/`), `unexpected url ${url}`);
      if (opts.method === 'GET') return { ok: false, status: 404, text: async () => '' };
      const [status, text] = putResponses[Math.min(puts.length, putResponses.length - 1)];
      puts.push(status);
      return { ok: status < 300, status, text: async () => text };
    };
    try { return await fn(puts, calls); } finally {
      globalThis.fetch = saved.fetch;
      if (saved.repo === undefined) delete process.env.GITHUB_DATA_REPO; else process.env.GITHUB_DATA_REPO = saved.repo;
      if (saved.token === undefined) delete process.env.GITHUB_DATA_TOKEN; else process.env.GITHUB_DATA_TOKEN = saved.token;
    }
  }
  const storeChecks = [
    ['409 conflict → retried, gives up after 4 attempts', () => withFakeGitHub([[409, 'conflict']], async (puts) => {
      await assert.rejects(store.appendJson('private', 'leads.json', { id: 'x' }, 'm'), /changed too often/);
      eq(puts.length, 4);
    })],
    ['three conflicts in a row → fourth attempt succeeds', () => withFakeGitHub([[409, 'conflict'], [409, 'conflict'], [409, 'conflict'], [201, '{}']], async (puts) => {
      await store.appendJson('private', 'leads.json', { id: 'x' }, 'm');
      eq(puts.length, 4);
    })],
    ['422 sha mismatch → retried, then succeeds', () => withFakeGitHub([[422, '{"message":"sha does not match"}'], [201, '{}']], async (puts) => {
      await store.appendJson('private', 'leads.json', { id: 'x' }, 'm');
      eq(puts.length, 2);
    })],
    ['422 "sha wasn\'t supplied" on putFile → "already exists"', () => withFakeGitHub([[422, '{"message":"Invalid request.\\n\\n\\"sha\\" wasn\'t supplied."}']], async (puts) => {
      await assert.rejects(store.putFile('private', 'cvs/a.pdf', Buffer.from('x'), 'm'), /already exists/);
      eq(puts.length, 1);
    })],
    ['other 422 validation error → thrown at once with GitHub detail', () => withFakeGitHub([[422, '{"message":"content is too large"}']], async (puts) => {
      await assert.rejects(store.appendJson('private', 'leads.json', { id: 'x' }, 'm'), /HTTP 422 .*too large/);
      eq(puts.length, 1);
    })],
    ['public data repo → write refused, nothing sent', () => withFakeGitHub([[201, '{}']], async (puts) => {
      await assert.rejects(store.putFile('private', 'cvs/a.pdf', Buffer.from('%PDF'), 'm'), /not private; refusing/);
      await assert.rejects(store.appendJson('private', 'applicants.json', { id: 'x' }, 'm'), /not private; refusing/);
      eq(puts.length, 0);
    }, { repo: 'test-owner/public-data', isPrivate: false })],
    ['private data repo → visibility checked once, then cached', () => withFakeGitHub([[201, '{}']], async (puts, calls) => {
      await store.appendJson('private', 'leads.json', { id: 'a' }, 'm');
      await store.appendJson('private', 'leads.json', { id: 'b' }, 'm');
      eq(puts.length, 2); eq(calls.visibility, 1);
    }, { repo: 'test-owner/fresh-data' })],
    ['site store (public by design) → no visibility check', async () => {
      const saved = { fetch: globalThis.fetch, token: process.env.GITHUB_TOKEN };
      let visibility = 0, puts = 0;
      process.env.GITHUB_TOKEN = 'test-token';
      globalThis.fetch = async (url, opts) => {
        if (!String(url).includes('/contents/')) visibility++;
        else if (opts.method === 'PUT') { puts++; return { ok: true, status: 200, text: async () => '' }; }
        return { ok: false, status: 404, text: async () => '' };
      };
      try {
        await store.updateJson('site', 'jobs.json', [], list => list, 'm');
        eq(visibility, 0); eq(puts, 1);
      } finally {
        globalThis.fetch = saved.fetch;
        if (saved.token === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = saved.token;
      }
    }],
  ];

  console.error = errLog;

  // 7. Build & contracts
  const run = (cmd, args, expect) => () => {
    const out = execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
    assert(out.includes(expect), `missing "${expect}"`);
  };
  const hiddenSource = () => {
    const rule = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8')).redirects.find(r => r.source.startsWith('/api/'));
    assert(rule, 'no redirect hiding api source files');
    const re = new RegExp(`^${rule.source}$`);
    for (const p of ['/api/_store.js', '/api/contact.js', '/api/admin/_console-app.js', '/api/_whitepapers.json']) assert(re.test(p), `${p} would stay public`);
    for (const p of ['/api/contact', '/api/apply', '/api/jobs', '/api/content', '/api/send-whitepaper', '/api/admin/data', '/api/admin/update', '/api/admin/auth', '/api/admin/console']) assert(!re.test(p), `${p} endpoint would be redirected`);
  };
  await area('7. Build & contract integrity', [
    ['api source files are hidden, endpoints stay reachable (vercel.json)', hiddenSource],
    ['raw data/*.json files are not served (drafts stay private)', () => {
      const rule = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8')).redirects.find(r => r.source === '/data/(.*)');
      assert(rule && rule.destination === '/404.html', 'no redirect hiding data/');
    }],
    ['CSP: no unsafe-inline scripts except the HP widget pages, hashes current', () => {
      for (const h of JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8')).headers) {
        const csp = (h.headers.find(x => x.key === 'Content-Security-Policy') || {}).value;
        if (!csp) continue;
        const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src'));
        eq(scriptSrc.includes("'unsafe-inline'"), h.source.includes('hp|dell|motorola') && !h.source.startsWith('/((?!'), h.source);
      }
      run('python3', ['tools/csp-hashes.py', '--check'], 'OK')();
    }],
    ['check-links.py', run('python3', ['tools/check-links.py'], 'OK')],
    ['check-ui-contract.py', run('python3', ['tools/check-ui-contract.py'], 'OK')],
    ['npm run verify → VERIFY-OK', run('npm', ['run', 'verify'], 'VERIFY-OK')],
  ]);
  await area('8. GitHub store retry & privacy (api/_store.js)', storeChecks);

  // 9. Stopgap hardening: form timing trap, email-only CVs, permanent delete
  console.error = (...a) => quiet.push(a.join(' '));
  const stale = () => Date.now() - 60 * 1000;
  await area('9. Spam trap, email-only CVs, purge', [
    ['contact posted within 3 s of page load → 200, nothing sent or filed', async () => {
      const before = sent.length, filed = inboxFile('requirements.json').length;
      const r = await call(contact, req('POST', { ...validEnquiry, formStart: Date.now() }));
      eq(r.statusCode, 200); eq(sent.length, before, 'mail sent for fast bot'); eq(inboxFile('requirements.json').length, filed);
    }],
    ['contact with a realistic fill time → processed normally', async () => {
      const before = sent.length;
      const r = await call(contact, req('POST', { ...validEnquiry, formStart: stale() }));
      eq(r.statusCode, 200); assert(sent.length > before, 'no mail');
    }],
    ['apply and whitepaper also drop too-fast posts', async () => {
      const before = sent.length;
      eq((await call(apply, req('POST', { ...applicant, email: 'fast@example.com', formStart: Date.now() }))).statusCode, 200);
      eq((await call(whitepaper, req('POST', { caseId: Object.keys(papers)[0] || 'x', email: 'fast@example.com', formStart: Date.now() }))).statusCode, 200);
      eq(sent.length, before, 'mail sent for fast bot');
    }],
    ['CV_STORAGE=email → CV emailed, not filed, record flagged', async () => {
      process.env.CV_STORAGE = 'email';
      try {
        const before = sent.length;
        const r = await call(apply, req('POST', { ...applicant, jobId: '', jobTitle: 'Test role', email: 'emailonly@example.com', cv: { filename: 'Only Mail.pdf', type: 'application/pdf', dataBase64: pdfB64 } }));
        eq(r.statusCode, 200, JSON.stringify(r.body));
        eq(sent[before].attachments.length, 1, 'CV attached to the HR mail');
        const rec = inboxFile('applicants.json').find(a => a.id === r.body.reference);
        eq(rec.cv.emailOnly, true); eq(rec.cv.path, undefined);
        assert(!fs.existsSync('.portal-data/cvs') || !fs.readdirSync('.portal-data/cvs').some(n => n.includes(r.body.reference)), 'CV file written');
      } finally { delete process.env.CV_STORAGE; }
    }],
    ['store.deleteFile removes a file, then reports it missing', async () => {
      await store.putFile('private', 'cvs/tmp-delete.pdf', Buffer.from('%PDF'), 'm');
      eq(await store.deleteFile('private', 'cvs/tmp-delete.pdf', 'm'), true);
      eq(await store.deleteFile('private', 'cvs/tmp-delete.pdf', 'm'), false);
      await assert.rejects(store.deleteFile('private', '../escape.pdf', 'm'), /Invalid storage path/);
    }],
    ['purge applicant → record and CV file gone, others kept', async () => {
      const filed = await call(apply, req('POST', { ...applicant, jobId: '', jobTitle: 'Test role', email: 'purge@example.com', cv: { filename: 'Purge Me.pdf', type: 'application/pdf', dataBase64: pdfB64 } }));
      eq(filed.statusCode, 200);
      const rec = inboxFile('applicants.json').find(a => a.id === filed.body.reference);
      assert(fs.existsSync(path.join('.portal-data', rec.cv.path)), 'CV not filed');
      const count = inboxFile('applicants.json').length;
      const r = await post({ type: 'applicant', action: 'purge', id: rec.id });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      eq(inboxFile('applicants.json').length, count - 1);
      assert(!inboxFile('applicants.json').some(a => a.id === rec.id), 'record kept');
      assert(!fs.existsSync(path.join('.portal-data', rec.cv.path)), 'CV file kept');
    }],
    ['purge requirement and lead → record removed', async () => {
      const req1 = inboxFile('requirements.json')[0];
      const r = await post({ type: 'requirement', action: 'purge', id: req1.id });
      eq(r.statusCode, 200); assert(!inboxFile('requirements.json').some(x => x.id === req1.id));
    }],
    ['purge unknown id → 400; without a session → hidden 404', async () => {
      eq((await post({ type: 'applicant', action: 'purge', id: 'no-such-id' })).statusCode, 400);
      eq((await call(update, req('POST', { type: 'applicant', action: 'purge', id: 'x' }))).statusCode, 404);
    }],
    ['purge is not offered for site content', async () => {
      eq((await post({ type: 'job', action: 'purge', id: 'x' })).statusCode, 400);
    }],
    // A fresh handler instance per request: the handler caches the console's case list for a few seconds.
    ['unpublished original case study → PDF request refused, nothing emailed', async () => {
      const fresh = () => { delete require.cache[require.resolve(path.join(REPO, 'api/send-whitepaper.js'))]; return require(path.join(REPO, 'api/send-whitepaper.js')); };
      const unpublish = await post({ type: 'caseStudy', action: 'toggle', id: 'balaji', value: false });
      eq(unpublish.statusCode, 200, JSON.stringify(unpublish.body));
      const before = sent.length;
      const r = await call(fresh(), req('POST', { email: 'unpub@example.com', name: 'Lead', caseId: 'balaji', formStart: stale() }));
      eq(r.statusCode, 400); eq(r.body.error, 'Unknown case study.'); eq(sent.length, before, 'mail sent for an unpublished case study');
      // other original case studies are unaffected
      const other = await call(fresh(), req('POST', { email: 'still@example.com', name: 'Lead', caseId: 'petronet-fms', formStart: stale() }));
      eq(other.statusCode, 200, JSON.stringify(other.body));
      // publishing it again makes it deliverable again
      eq((await post({ type: 'caseStudy', action: 'toggle', id: 'balaji', value: true })).statusCode, 200);
      const again = await call(fresh(), req('POST', { email: 'again@example.com', name: 'Lead', caseId: 'balaji', formStart: stale() }));
      eq(again.statusCode, 200, JSON.stringify(again.body));
    }],
  ]);
  console.error = errLog;

  // ---- report --------------------------------------------------------------
  fs.rmSync(sandbox, { recursive: true, force: true });
  console.log('\n  RESULT      AREA                                              CHECKS');
  console.log('  ' + '-'.repeat(76));
  for (const r of results) {
    console.log(`  ${r.failures.length ? '[ FAIL ]' : '[ PASS ]'}    ${r.name.padEnd(50)}${r.passed}/${r.total}`);
    for (const f of r.failures) console.log(`                ✗ ${f}`);
  }
  const bad = results.some(r => r.failures.length);
  console.log(`\n  mock emails captured: ${sent.length}; real SMTP/network calls: 0`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
