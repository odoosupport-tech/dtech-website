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
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(REPO, 'node_modules/nodemailer'))) throw new Error('node_modules missing: run npm ci first');

// ---- isolation -------------------------------------------------------------
for (const k of Object.keys(process.env)) if (/^(GITHUB_|SMTP_|MAIL_FROM|SALES_EMAIL|HR_EMAIL|VERCEL|ADMIN_SECRET|ALLOWED_ORIGINS|SITE_URL)/.test(k)) delete process.env[k];
Object.assign(process.env, { SMTP_HOST: 'smtp.invalid', SMTP_USER: 'test@invalid', SMTP_PASS: 'x', SALES_EMAIL: 'sales@test.invalid', ADMIN_SECRET: 'test-admin-secret-0123456789' });
// The only network the suite allows: this site's own static PDFs (the whitepaper
// handler fetches them from https://dtech.test), served from the sandbox's assets/
// behind the real middleware.js gate: an unsigned or bad link gets the case-study
// page (where the redirect lands), as on Vercel.
let failPdfFetch = false;
const gate = import(path.join(REPO, 'middleware.js'));
globalThis.fetch = async (url) => {
  const m = /^https:\/\/dtech\.test\/(assets\/case-studies\/pdf\/[A-Za-z0-9\/._-]+\.pdf)(\?t=[^&#]*)?$/.exec(String(url));
  if (!m) throw new Error(`network blocked in tests: ${url}`);
  if (failPdfFetch) return new Response('missing', { status: 404 });
  const turnedAway = await (await gate).default(new Request(String(url)));
  if (turnedAway) return new Response('<!doctype html><title>Case studies</title>', { status: 200, headers: { 'content-type': 'text/html' } });
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
const detail = api('detail.js');
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

  await area('0. Request origin & abuse limits', [
    ['origin checks match scheme, host and port; forwarded host is not trusted', () => {
      const { allowedOrigin } = api('_http.js');
      eq(allowedOrigin(req('POST')), true);
      for (const origin of ['http://dtech.test', 'https://dtech.test:8443', 'null', 'https://dtech.test/path', 'https://user@dtech.test', 'https://evil.test']) {
        eq(allowedOrigin(req('POST', {}, { headers: { origin, 'x-forwarded-host': 'evil.test' } })), false, origin);
      }
      eq(allowedOrigin(req('POST', {}, { headers: { origin: undefined } })), false);
      eq(allowedOrigin({ headers: { host: 'localhost:8000', origin: 'http://localhost:8000' }, socket: { encrypted: false } }), true);
      const saved = process.env.ALLOWED_ORIGINS;
      try {
        process.env.ALLOWED_ORIGINS = 'https://extra.test/';
        eq(allowedOrigin(req('POST', {}, { headers: { origin: 'https://extra.test' } })), true);
      } finally {
        if (saved === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = saved;
      }
    }],
    ['saturating the limiter cannot clear existing limits; expired keys recover', () => {
      const { createRateLimiter } = api('_http.js');
      const limited = createRateLimiter();
      const realNow = Date.now;
      let now = realNow();
      Date.now = () => now;
      try {
        eq(limited('blocked', 1, 1000), false);
        for (let i = 0; i < 4999; i++) eq(limited('key' + i, 1, 1000), false);
        eq(limited('overflow', 1, 1000), true);
        for (let i = 0; i < 10000; i++) eq(limited('blocked', 1, 1000), true);
        now += 1000;
        eq(limited('new-key', 1, 1000), false);
        eq(limited('blocked', 1, 1000), false);
      } finally { Date.now = realNow; }
    }],
  ]);

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
      const file = 'data/case-studies.json';
      const before = fs.readFileSync(file, 'utf8');
      try {
        // The site's list may hold no drafts: mark one in the sandbox copy so this check always runs.
        const raw = JSON.parse(before);
        if (!raw.some(c => c.published === false)) raw[raw.length - 1] = { ...raw[raw.length - 1], published: false };
        fs.writeFileSync(file, JSON.stringify(raw));
        const draft = raw.find(c => c.published === false);
        assert(draft, 'fixture needs a draft case study');
        const r = await call(content, req('GET', null, { query: { list: 'case-studies' } }));
        eq(r.statusCode, 200); assert(Array.isArray(r.body)); eq(r.body.length, raw.length, 'drafts keep their slot for ordering');
        assert.deepStrictEqual(r.body.find(c => c.id === draft.id), { id: draft.id, published: false });
        assert(!JSON.stringify(r.body).includes(draft.summary), 'draft text leaked');
        assert(r.body.filter(c => c.published !== false).every(c => c.client), 'published entries complete');
        assert.match(r.headers['cache-control'], /max-age=0/);
      } finally { fs.writeFileSync(file, before); }
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
  const validEnquiry = { name: 'Test Client', email: 'test@enterprise.com', phone: '+91 99999 88888', company: 'Test Industries', subject: 'forklift', message: 'Testing automated proposal submission' };
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
      eq(m.to, 'sales@test.invalid, rahul.sharma@dtechindia.com'); eq(m.replyTo, 'test@enterprise.com');
      assert.match(m.subject, /AI Forklift Pedestrian Safety \(N2024G-5\) — Test Client/);
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
      assert(c.html.includes('AI Forklift Pedestrian Safety') && c.text.includes('AI Forklift Pedestrian Safety'), 'topic acknowledged');
      assert(/within 1 business day/.test(c.text), 'response promise');
      assert(c.text.includes('sales@dtechindia.com') && c.text.includes('+91 95588 09163') && c.text.includes('support@dtechindia.com') && c.text.includes('+91 99989 03042') && c.text.includes('Bharuch'), 'contact details');
      eq(sent.slice(before).filter(m => m.to === 'sales@test.invalid, rahul.sharma@dtechindia.com').length, 1, 'sales notified once');
    }],
    ['auto-responder ignores markup planted in the name', async () => {
      const before = sent.length;
      await call(contact, req('POST', { ...validEnquiry, name: 'Win <a href="http://x.test">prize</a> now' }));
      const c = sent.slice(before).find(m => m.to === validEnquiry.email);
      assert(c && !c.html.includes('x.test'), 'markup reached the visitor mail');
    }],
    ['auto-responder never echoes a free-text topic', async () => {
      const before = sent.length;
      await call(contact, req('POST', { ...validEnquiry, email: 'topic@example.com', subject: 'Claim your prize at spam.test', topic: 'Claim your prize at spam.test' }));
      const c = sent.slice(before).find(m => m.to === 'topic@example.com');
      assert(c, 'no confirmation mail');
      assert(!c.html.includes('spam.test') && !c.text.includes('spam.test'), 'free-text topic reached the visitor mail');
      assert(c.text.includes('General enquiry'), 'unknown subject filed as a general enquiry');
    }],
    ['auto-responses capped per address; sales still gets every enquiry', async () => {
      const target = 'flood@example.com';
      const before = sent.length;
      for (let i = 0; i < 4; i++) eq((await call(contact, req('POST', { ...validEnquiry, email: target }, { headers: { 'x-real-ip': `10.9.0.${i}` } }))).statusCode, 200);
      const mails = sent.slice(before);
      eq(mails.filter(m => m.to === target).length, 3, 'visitor confirmations');
      eq(mails.filter(m => m.to === 'sales@test.invalid, rahul.sharma@dtechindia.com').length, 4, 'sales notices');
    }],
    ['enquiry copy to Rahul is not duplicated when SALES_EMAIL already lists him', async () => {
      const saved = process.env.SALES_EMAIL;
      process.env.SALES_EMAIL = 'sales@test.invalid, Rahul.Sharma@dtechindia.com';
      try {
        const before = sent.length;
        eq((await call(contact, req('POST', validEnquiry, { headers: { 'x-real-ip': '10.9.1.1' } }))).statusCode, 200);
        eq(sent[before].to, 'sales@test.invalid, Rahul.Sharma@dtechindia.com');
      } finally { process.env.SALES_EMAIL = saved; }
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
    ['every published case study in data/ → its PDF exists and is a PDF, its logo exists', () => {
      const list = JSON.parse(fs.readFileSync(path.join(REPO, 'data/case-studies.json'), 'utf8'));
      for (const c of list.filter(x => x.published !== false)) {
        if (/^https?:\/\//.test(c.pdf_file)) continue; // a console "link" PDF lives elsewhere
        const buf = fs.readFileSync(path.join(REPO, c.pdf_file));
        eq(buf.subarray(0, 5).toString(), '%PDF-', `${c.id} PDF header`);
        if (c.logo) assert(fs.existsSync(path.join(REPO, c.logo)), `${c.id} logo ${c.logo} missing`);
      }
    }],
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
    ['summary request → filed as a "summary" lead, nothing emailed; PDF requests are filed as "pdf"', async () => {
      const leads = () => JSON.parse(fs.readFileSync('.portal-data/leads.json', 'utf8'));
      const before = sent.length;
      const r = await call(whitepaper, req('POST', { request: 'summary', email: 'reader@example.com', name: 'Reader', company: 'Acme', caseId: 'mrf' }));
      eq(r.statusCode, 200, JSON.stringify(r.body)); eq(r.body.filed, true);
      eq(sent.length, before, 'a summary view must not send email');
      const filed = leads().find(l => l.email === 'reader@example.com');
      eq(filed.request, 'summary'); eq(filed.caseId, 'mrf'); assert(filed.caseTitle && filed.id && filed.date);
      eq(leads().find(l => l.email === 'lead@example.com').request, 'pdf');
    }],
    ['the same visitor asking again: every request is its own record, summaries not held to the 3-PDF limit', async () => {
      const leads = () => JSON.parse(fs.readFileSync('.portal-data/leads.json', 'utf8')).filter(l => l.email === 'repeat@example.com');
      for (const caseId of ['mrf', 'indofil', 'bostik', 'krystal', 'mrf']) {
        eq((await call(whitepaper, req('POST', { request: 'summary', email: 'repeat@example.com', name: 'Repeat', caseId }))).statusCode, 200, caseId);
      }
      eq(leads().length, 5, 'five summary views, five records');
      assert.deepStrictEqual(leads().map(l => l.caseId).sort(), ['bostik', 'indofil', 'krystal', 'mrf', 'mrf']);
    }],
    ['summary request: bad email, unknown case, bot trap', async () => {
      eq((await call(whitepaper, req('POST', { request: 'summary', email: 'nope', caseId: 'mrf' }))).statusCode, 400);
      eq((await call(whitepaper, req('POST', { request: 'summary', email: 'x@example.com', caseId: 'does-not-exist' }))).statusCode, 400);
      const count = JSON.parse(fs.readFileSync('.portal-data/leads.json', 'utf8')).length;
      eq((await call(whitepaper, req('POST', { request: 'summary', email: 'bot@example.com', caseId: 'mrf', website: 'spam' }))).statusCode, 200);
      eq(JSON.parse(fs.readFileSync('.portal-data/leads.json', 'utf8')).length, count, 'bot filed a lead');
    }],
    ['PDF cannot be fetched → visitor still gets a signed download link, no attachment', async () => {
      failPdfFetch = true;
      try {
        const before = sent.length;
        const r = await call(whitepaper, req('POST', { email: 'lead5@example.com', caseId: 'petronet-fms' }));
        eq(r.statusCode, 200, JSON.stringify(r.body));
        const visitor = sent[before];
        eq(visitor.attachments.length, 0);
        const link = /href="https:\/\/dtech\.test(\/assets\/case-studies\/pdf\/petronet-lng-enterprise-fms-2026\.pdf)\?t=([^"]+)"/.exec(visitor.html);
        assert(link, 'signed download link');
        eq(await (await gate).validPdfToken(link[1], link[2], process.env.ADMIN_SECRET), true, 'link passes the PDF gate');
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
        // The only off-site destination: the company's Odoo (staff login and customer portal).
        if (/^https?:\/\//.test(r.destination)) {
          assert(r.destination.startsWith('https://d-tech-live-database.odoo.com/'), `${r.source} -> ${r.destination} leaves the site`);
          continue;
        }
        const dest = r.destination.split(/[?#]/)[0];
        if (dest === '/' || dest === '/admin-dtech') continue;
        const file = dest.replace(/^\//, '');
        // /api/x is the serverless function api/x.js
        const fn = file.startsWith('api/') && fs.existsSync(path.join(REPO, `${file}.js`));
        assert(fn || fs.existsSync(path.join(REPO, file)) || fs.existsSync(path.join(REPO, `${file}.html`)), `${r.source} -> ${r.destination} is missing`);
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
      assert.match(cookie, /^dt_console=\d{13}\.[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{43}$/);
      assert(/Max-Age=14400\b/.test(c), `session should last 4 hours: ${c}`);
    }],
    ['tampered cookie → 404', async () => eq((await call(data, req('GET', null, { headers: { cookie: cookie.replace(/.$/, c => c === 'A' ? 'B' : 'A') } }))).statusCode, 404)],
    ['data with session → requirements, applicants, leads, jobs, caseStudies', async () => {
      const r = await call(data, req('GET', null, { headers: { cookie } }));
      eq(r.statusCode, 200);
      for (const k of ['requirements', 'applicants', 'leads', 'jobs', 'caseStudies']) assert(Array.isArray(r.body[k]), k);
      eq(r.body.requirements.length, 9); // area 2: the valid enquiry, the auto-responder, markup, free-text topic, 4 flood posts and the Rahul-copy check
      eq(r.body.applicants.length, 2); // PDF + DOCX applications from area 3
      eq(r.body.leads.length, 8); // PDF and summary requests from area 4
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
      const script = portal.match(/<script>\s*\(function \(\) \{\s*\/\/ Admin sign-in\.[\s\S]*?<\/script>/)[0];
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
    ['sign-out revokes the session: a copied cookie stops working, other sessions continue', async () => {
      const signIn = async () => (await call(auth, req('POST', { id: 'admin', key: process.env.ADMIN_SECRET }))).headers['set-cookie'].split(';')[0];
      const a = await signIn(), b = await signIn();
      assert.notStrictEqual(a, b, 'each sign-in needs its own session id');
      const out = await call(auth, req('DELETE', null, { headers: { cookie: a } }));
      eq(out.statusCode, 200); eq(out.body.revoked, true);
      assert(/Max-Age=0\b/.test(out.headers['set-cookie']), 'cookie not cleared');
      eq((await call(data, req('GET', null, { headers: { cookie: a } }))).statusCode, 404, 'copied cookie still works after sign-out');
      eq((await call(auth, req('GET', null, { headers: { cookie: a } }))).statusCode, 404);
      eq((await call(data, req('GET', null, { headers: { cookie: b } }))).statusCode, 200, 'other session was signed out');
      const list = JSON.parse(fs.readFileSync('.portal-data/revoked-sessions.json', 'utf8'));
      assert(list.some(x => x.sid === a.split('.')[1]), 'revocation not stored');
      assert(!JSON.stringify(list).includes(a.split('.')[2]), 'signature must not be stored');
    }],
    ['sign-out without a valid session clears the cookie, stores nothing', async () => {
      const before = fs.readFileSync('.portal-data/revoked-sessions.json', 'utf8');
      const r = await call(auth, req('DELETE', null, { headers: { cookie: 'dt_console=1.' + 'x'.repeat(24) + '.' + 'y'.repeat(43) } }));
      eq(r.statusCode, 200); eq(r.body.revoked, false);
      eq(fs.readFileSync('.portal-data/revoked-sessions.json', 'utf8'), before);
    }],
    ['old cookie format without a session id → 404', async () => {
      const expires = String(Date.now() + 3600 * 1000);
      const key = crypto.createHmac('sha256', process.env.ADMIN_SECRET).update('dtech-console-session-v1').digest();
      const legacy = `dt_console=${expires}.${crypto.createHmac('sha256', key).update(expires).digest('base64url')}`;
      eq((await call(data, req('GET', null, { headers: { cookie: legacy } }))).statusCode, 404);
    }],
    ['revocations from another instance apply within 30 s; expired ones are pruned', async () => {
      const c = (await call(auth, req('POST', { id: 'admin', key: process.env.ADMIN_SECRET }))).headers['set-cookie'].split(';')[0];
      const file = '.portal-data/revoked-sessions.json';
      const saved = fs.readFileSync(file, 'utf8');
      const realNow = Date.now;
      let now = realNow();
      Date.now = () => now;
      try {
        const list = JSON.parse(saved);
        list.push({ sid: c.split('.')[1], expires: now + 3600e3 }, { sid: 'z'.repeat(24), expires: now - 1 });
        fs.writeFileSync(file, JSON.stringify(list)); // as another instance would
        now += 31 * 1000;
        eq((await call(data, req('GET', null, { headers: { cookie: c } }))).statusCode, 404, 'revocation by another instance ignored');
        const d = (await call(auth, req('POST', { id: 'admin', key: process.env.ADMIN_SECRET }))).headers['set-cookie'].split(';')[0];
        eq((await call(auth, req('DELETE', null, { headers: { cookie: d } }))).body.revoked, true);
        assert(!JSON.parse(fs.readFileSync(file, 'utf8')).some(x => x.sid === 'z'.repeat(24)), 'expired revocation kept');
        fs.writeFileSync(file, '{ not json');
        now += 31 * 1000;
        eq((await call(data, req('GET', null, { headers: { cookie: d } }))).statusCode, 404, 'unreadable list must keep the last known revocations');
        eq((await call(data, req('GET', null, { headers: { cookie } }))).statusCode, 200, 'unreadable list with a cached copy should not sign everyone out');
      } finally { Date.now = realNow; fs.writeFileSync(file, saved); }
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
      eq((await post({ type: 'banner', action: 'save', id: bannerId, item: { ...banner, linkUrl: 'tel:+91 95588 09163' } })).statusCode, 200);
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
    const calls = { visibility: 0, contents: 0 };
    const base = `https://api.github.com/repos/${repo}`;
    Object.assign(process.env, { GITHUB_DATA_REPO: repo, GITHUB_DATA_TOKEN: 'test-token' });
    globalThis.fetch = async (url, opts) => {
      url = String(url);
      if (url === base && opts.method === 'GET') {
        calls.visibility++;
        return { ok: true, status: 200, json: async () => ({ full_name: repo, private: typeof isPrivate === 'function' ? isPrivate() : isPrivate }), text: async () => '' };
      }
      assert(url.startsWith(`${base}/contents/`), `unexpected url ${url}`);
      calls.contents++;
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
    ['public data repo → JSON and CV reads refused before fetching content', () => withFakeGitHub([], async (puts, calls) => {
      await assert.rejects(store.readJson('private', 'leads.json', []), /not private; refusing/);
      await assert.rejects(store.readFile('private', 'cvs/a.pdf'), /not private; refusing/);
      eq(calls.contents, 0);
    }, { repo: 'test-owner/public-read', isPrivate: false })],
    ['visibility is rechecked after one minute in a warm function', () => withFakeGitHub([], async (puts, calls) => {
      const realNow = Date.now;
      let now = realNow();
      Date.now = () => now;
      try {
        await store.readJson('private', 'leads.json', []);
        await store.readFile('private', 'cvs/a.pdf');
        eq(calls.visibility, 1);
        now += 60000;
        await store.readJson('private', 'leads.json', []);
        eq(calls.visibility, 2);
      } finally { Date.now = realNow; }
    }, { repo: 'test-owner/expiring-visibility' })],
    ['repository changed to public → reads stop when the visibility cache expires', async () => {
      let privateRepo = true;
      await withFakeGitHub([], async (puts, calls) => {
        const realNow = Date.now;
        let now = realNow();
        Date.now = () => now;
        try {
          await store.readJson('private', 'leads.json', []);
          privateRepo = false;
          now += 60000;
          await assert.rejects(store.readFile('private', 'cvs/a.pdf'), /not private; refusing/);
          eq(calls.contents, 1);
        } finally { Date.now = realNow; }
      }, { repo: 'test-owner/visibility-changed', isPrivate: () => privateRepo });
    }],
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

  // A tiny in-memory GitHub repository: contents, branch ref and commits.
  async function withFakeRepo(fn, { repo = 'test-owner/squash-data', isPrivate = true, files = {}, parents = 1, patchStatus = 200, moveHeadOnce = false } = {}) {
    const saved = { fetch: globalThis.fetch, repo: process.env.GITHUB_DATA_REPO, token: process.env.GITHUB_DATA_TOKEN };
    const base = `https://api.github.com/repos/${repo}`;
    const state = { head: 'c0', commits: { c0: { tree: 't0', parents: parents ? [{ sha: 'older' }] : [] } }, files: { ...files }, posts: [], patches: [], n: 0, headReads: 0 };
    const commit = () => { const sha = `c${++state.n}`; state.commits[sha] = { tree: `t${state.n}`, parents: [{ sha: state.head }] }; state.head = sha; };
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    Object.assign(process.env, { GITHUB_DATA_REPO: repo, GITHUB_DATA_TOKEN: 'test-token' });
    globalThis.fetch = async (url, opts) => {
      url = String(url);
      const body = opts.body ? JSON.parse(opts.body) : null;
      if (url === base) return json(200, { private: isPrivate });
      if (url === `${base}/git/ref/heads/main`) {
        if (moveHeadOnce && ++state.headReads === 2) commit(); // a visitor's write lands mid-squash
        return json(200, { object: { sha: state.head } });
      }
      let m = /\/git\/commits\/([^/?]+)$/.exec(url);
      if (m && opts.method === 'GET') return json(200, { sha: m[1], tree: { sha: state.commits[m[1]].tree }, parents: state.commits[m[1]].parents });
      if (url === `${base}/git/commits` && opts.method === 'POST') { state.posts.push(body); const sha = `snap${state.posts.length}`; state.commits[sha] = { tree: body.tree, parents: body.parents }; return json(201, { sha }); }
      if (url === `${base}/git/refs/heads/main` && opts.method === 'PATCH') { state.patches.push(body); if (patchStatus >= 300) return json(patchStatus, { message: 'protected branch' }); state.head = body.sha; return json(200, {}); }
      m = new RegExp(`^${base}/contents/([^?]+)`).exec(url);
      assert(m, `unexpected url ${url}`);
      const file = m[1];
      if (opts.method === 'GET') return file in state.files ? json(200, { sha: `s-${file}`, encoding: 'base64', content: Buffer.from(state.files[file]).toString('base64') }) : json(404, {});
      if (opts.method === 'PUT') { state.files[file] = Buffer.from(body.content, 'base64').toString('utf8'); commit(); return json(201, {}); }
      if (opts.method === 'DELETE') { delete state.files[file]; commit(); return json(200, {}); }
      throw new Error(`unexpected ${opts.method} ${url}`);
    };
    try { return await fn(state); } finally {
      globalThis.fetch = saved.fetch;
      if (saved.repo === undefined) delete process.env.GITHUB_DATA_REPO; else process.env.GITHUB_DATA_REPO = saved.repo;
      if (saved.token === undefined) delete process.env.GITHUB_DATA_TOKEN; else process.env.GITHUB_DATA_TOKEN = saved.token;
    }
  }
  storeChecks.push(
    ['squashHistory: branch replaced by one parentless commit of the current tree', () => withFakeRepo(async (state) => {
      eq(await store.squashHistory('private', 'snapshot'), true);
      eq(state.posts.length, 1);
      assert.deepStrictEqual(state.posts[0], { message: 'snapshot', tree: 't0', parents: [] });
      assert.deepStrictEqual(state.patches, [{ sha: 'snap1', force: true }]);
      eq(state.head, 'snap1');
    })],
    ['squashHistory: history already one snapshot → nothing rewritten', () => withFakeRepo(async (state) => {
      eq(await store.squashHistory('private', 'snapshot'), true);
      eq(state.posts.length, 0); eq(state.patches.length, 0);
    }, { repo: 'test-owner/squash-single', parents: 0 })],
    ['squashHistory: a write lands meanwhile → restarts from the new head, keeps it', () => withFakeRepo(async (state) => {
      eq(await store.squashHistory('private', 'snapshot'), true);
      eq(state.posts.length, 2, 'should retry once');
      eq(state.posts[1].tree, 't1', 'second snapshot must include the new write');
      assert.deepStrictEqual(state.patches, [{ sha: 'snap2', force: true }]);
    }, { repo: 'test-owner/squash-race', moveHeadOnce: true })],
    ['squashHistory: public repository → refused before touching git', () => withFakeRepo(async (state) => {
      await assert.rejects(store.squashHistory('private', 'snapshot'), /not private; refusing/);
      eq(state.posts.length, 0); eq(state.patches.length, 0);
    }, { repo: 'test-owner/squash-public', isPrivate: false })],
    ['squashHistory: only the private store; local storage has no history', async () => {
      await assert.rejects(store.squashHistory('site', 'snapshot'), /Only the private store/);
      eq(await store.squashHistory('private', 'snapshot'), false);
    }],
    ['console purge on GitHub storage → record gone and history replaced', () => withFakeRepo(async (state) => {
      const r = await post({ type: 'requirement', action: 'purge', id: 'req-gone' });
      eq(r.statusCode, 200, JSON.stringify(r.body));
      eq(r.body.historyErased, undefined);
      assert(!JSON.parse(state.files['requirements.json']).some(x => x.id === 'req-gone'), 'record kept');
      eq(state.posts.length, 1); eq(state.posts[0].parents.length, 0);
      eq(state.head, 'snap1'); assert.match(state.posts[0].message, /snapshot after deleting requirement req-gone/);
    }, { repo: 'test-owner/purge-data', files: { 'requirements.json': JSON.stringify([{ id: 'req-gone', name: 'X' }, { id: 'req-kept', name: 'Y' }]) } })],
    ['console purge when history replacement fails → deleted, historyErased: false', () => withFakeRepo(async (state) => {
      const r = await post({ type: 'requirement', action: 'purge', id: 'req-gone' });
      eq(r.statusCode, 200, JSON.stringify(r.body)); eq(r.body.historyErased, false);
      assert(!JSON.parse(state.files['requirements.json']).some(x => x.id === 'req-gone'), 'record kept');
    }, { repo: 'test-owner/purge-protected', patchStatus: 422, files: { 'requirements.json': JSON.stringify([{ id: 'req-gone', name: 'X' }]) } })],
  );

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
    for (const p of ['/api/contact', '/api/apply', '/api/jobs', '/api/content', '/api/send-whitepaper', '/api/admin/data', '/api/admin/update', '/api/admin/auth', '/api/admin/console', '/api/detail']) assert(!re.test(p), `${p} endpoint would be redirected`);
  };
  // 6c. "Check email": settings report, failure explanations, test send, no secrets.
  const mailCheck = api('admin/mail-check.js');
  const nodemailer = require(path.join(REPO, 'node_modules/nodemailer'));
  const withSmtp = async (fakeTransport, fn) => {
    const real = nodemailer.createTransport;
    nodemailer.createTransport = () => fakeTransport;
    try { return await fn(); } finally { nodemailer.createTransport = real; }
  };
  const smtpError = (code, responseCode, message) => Object.assign(new Error(message), { code, responseCode });
  const check = (body = {}) => call(mailCheck, req('POST', body, { headers: { cookie } }));
  await area('6c. Check email (api/admin/mail-check.js)', [
    ['no session → 404', async () => eq((await call(mailCheck, req('POST', {}))).statusCode, 404)],
    ['working server → ok, settings shown, password never returned', async () => {
      const r = await withSmtp({ verify: async () => true }, () => check());
      eq(r.statusCode, 200); eq(r.body.result.status, 'ok');
      eq(r.body.result.settings.host, 'smtp.invalid'); eq(r.body.result.settings.passwordSet, true);
      assert(!JSON.stringify(r.body).includes(process.env.SMTP_PASS + '"'), 'password leaked');
      assert(!/"pass"/.test(JSON.stringify(r.body)), 'pass field leaked');
      assert(/^te•+@invalid$/.test(r.body.result.settings.user), r.body.result.settings.user);
    }],
    ['wrong password → explains SMTP_USER/SMTP_PASS and App Passwords', async () => {
      const r = await withSmtp({ verify: async () => { throw smtpError('EAUTH', 535, 'Invalid login: 535-5.7.8 Username and Password not accepted'); } }, () => check());
      eq(r.body.result.status, 'failed');
      assert(/SMTP_PASS/.test(r.body.result.advice) && /App Password/.test(r.body.result.advice), r.body.result.advice);
      assert(/EAUTH 535/.test(r.body.result.detail), r.body.result.detail);
    }],
    ['port/encryption mismatch and unreachable server are told apart', async () => {
      const tls = await withSmtp({ verify: async () => { throw smtpError('ESOCKET', 0, 'C0:error:0A00010B:SSL routines:ssl3_get_record:wrong version number'); } }, () => check());
      assert(/SMTP_PORT=465/.test(tls.body.result.advice), tls.body.result.advice);
      const down = await withSmtp({ verify: async () => { throw smtpError('ETIMEDOUT', 0, 'Connection timeout'); } }, () => check());
      assert(/Could not connect/.test(down.body.result.advice), down.body.result.advice);
      const dns = await withSmtp({ verify: async () => { throw smtpError('EDNS', 0, 'getaddrinfo ENOTFOUND smtp.gmial.com'); } }, () => check());
      assert(/SMTP_HOST could not be found/.test(dns.body.result.advice), dns.body.result.advice);
    }],
    ['sender refused → points at MAIL_FROM', async () => {
      const r = await withSmtp({ verify: async () => true, sendMail: async () => { throw smtpError('EENVELOPE', 553, 'Sender address rejected'); } }, () => check({ send: true }));
      eq(r.body.result.status, 'failed'); assert(/MAIL_FROM/.test(r.body.result.advice), r.body.result.advice);
    }],
    ['send test → mails SALES_EMAIL', async () => {
      const mails = [];
      const r = await withSmtp({ verify: async () => true, sendMail: async (m) => { mails.push(m); return {}; }, close() {} }, () => check({ send: true }));
      eq(r.body.result.status, 'sent'); eq(mails.length, 1); eq(mails[0].to, 'sales@test.invalid');
    }],
    ['missing settings → names them, no connection attempted', async () => {
      const saved = process.env.SMTP_PASS; delete process.env.SMTP_PASS;
      try {
        const r = await withSmtp({ verify: async () => { throw new Error('must not connect'); } }, () => check());
        eq(r.body.result.status, 'missing'); assert(r.body.result.missing.includes('SMTP_PASS'));
      } finally { process.env.SMTP_PASS = saved; }
    }],
  ]);

  await area('7. Build & contract integrity', [
    ['api source files are hidden, endpoints stay reachable (vercel.json)', hiddenSource],
    ['middleware source is hidden while the PDF middleware remains deployable', () => {
      const config = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
      assert(config.redirects.some(r => r.source === '/middleware.js' && r.destination === '/404.html'));
      assert(!/^middleware\.js$/m.test(fs.readFileSync(path.join(REPO, '.vercelignore'), 'utf8')));
    }],
    ['raw data/*.json files are not served (drafts stay private)', () => {
      const rule = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8')).redirects.find(r => r.source === '/data/(.*)');
      assert(rule && rule.destination === '/404.html', 'no redirect hiding data/');
    }],
    ['CSP: no unsafe-inline scripts except the HP widget page, hashes current', () => {
      for (const h of JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8')).headers) {
        const csp = (h.headers.find(x => x.key === 'Content-Security-Policy') || {}).value;
        if (!csp) continue;
        const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src'));
        eq(scriptSrc.includes("'unsafe-inline'"), h.source === '/hp(\\.html)?', h.source);
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
      eq(r.body.historyErased, undefined, 'local storage has no history to erase');
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
      const unpublish = await post({ type: 'caseStudy', action: 'toggle', id: 'rockwool', value: false });
      eq(unpublish.statusCode, 200, JSON.stringify(unpublish.body));
      const before = sent.length;
      const r = await call(fresh(), req('POST', { email: 'unpub@example.com', name: 'Lead', caseId: 'rockwool', formStart: stale() }));
      eq(r.statusCode, 400); eq(r.body.error, 'Unknown case study.'); eq(sent.length, before, 'mail sent for an unpublished case study');
      // other original case studies are unaffected
      const other = await call(fresh(), req('POST', { email: 'still@example.com', name: 'Lead', caseId: 'petronet-fms', formStart: stale() }));
      eq(other.statusCode, 200, JSON.stringify(other.body));
      // publishing it again makes it deliverable again
      eq((await post({ type: 'caseStudy', action: 'toggle', id: 'rockwool', value: true })).statusCode, 200);
      const again = await call(fresh(), req('POST', { email: 'again@example.com', name: 'Lead', caseId: 'rockwool', formStart: stale() }));
      eq(again.statusCode, 200, JSON.stringify(again.body));
    }],
  ]);

  // 10. One page per case study and per open role (api/detail.js)
  const page = (type, id, method = 'GET') => call(detail, { method, query: id === undefined ? { type } : { type, id }, headers: {} });
  const casesFile = 'data/case-studies.json', jobsFile = 'data/jobs.json';
  const withList = async (file, change, fn) => {
    const before = fs.readFileSync(file, 'utf8');
    try { fs.writeFileSync(file, JSON.stringify(change(JSON.parse(before)))); return await fn(); } finally { fs.writeFileSync(file, before); }
  };
  const cspAllows = () => {
    const rule = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8')).headers.find(h => h.source.startsWith('/((?!'));
    const csp = rule.headers.find(x => x.key === 'Content-Security-Policy').value;
    return new Set((csp.match(/'sha256-[^']+'/g) || []).map(h => h.slice(1, -1)));
  };
  const runnableScripts = html => [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attrs = '']) => !/\ssrc\s*=/i.test(attrs) && !/application\/ld\+json/i.test(attrs)).map(m => m[2]);
  const ldBlocks = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const relativeUrls = html => html.match(/\s(?:href|src|srcset)="(?![a-z][a-z0-9+.-]*:|\/|#)[^"]+"/gi) || [];
  await area('10. Case-study and job pages (api/detail.js)', [
    ['case page: 200 HTML, own title/canonical/h1, absolute URLs, current menu item, sections.css', async () => {
      const r = await page('case', 'petronet-fms');
      eq(r.statusCode, 200); assert.match(r.headers['content-type'], /^text\/html/);
      assert.match(r.headers['cache-control'], /s-maxage=\d+/);
      assert(r.body.includes('<title>Petronet LNG Limited: 24×7 Onsite Enterprise FMS | D-TECH SIPL</title>'));
      assert(r.body.includes('<link rel="canonical" href="https://www.dtechindia.com/case-studies/petronet-fms">'));
      assert(r.body.includes('<meta property="og:url" content="https://www.dtechindia.com/case-studies/petronet-fms">'));
      assert.match(r.body, /<h1[^>]*>Petronet LNG Limited<\/h1>/);
      assert(r.body.includes('data-page="case-study"')); assert(!r.body.includes('data-page="legal"'));
      eq((r.body.match(/<a href="\/case-studies" aria-current="page">/g) || []).length, 2, 'desktop and phone menus');
      assert(/<link rel="stylesheet" href="\/assets\/sections\.min\.css\?v=[0-9a-f]+">/.test(r.body), 'sections.css');
      assert(r.body.indexOf('sections.min.css') < r.body.indexOf('light-chrome.min.css'), 'light-chrome.css must load last');
      assert.deepStrictEqual(relativeUrls(r.body), []);
      eq((r.body.match(/<main\b/g) || []).length, 1);
      assert(r.body.includes('href="/case-studies#petronet-fms"'), 'full case study link');
    }],
    ['case page shows only the public card: write-up and PDF stay behind the email form', async () => {
      const c = JSON.parse(fs.readFileSync(casesFile, 'utf8')).find(x => x.id === 'petronet-fms');
      assert(c.challenge && c.solution && c.outcomes.length, 'fixture needs a full write-up');
      const r = await page('case', 'petronet-fms');
      assert(r.body.includes(c.summary.replace(/'/g, '&#39;')), 'summary shown');
      for (const hidden of [c.challenge, c.solution, ...c.outcomes, c.pdf_file]) {
        assert(!r.body.includes(String(hidden).replace(/'/g, '&#39;').slice(0, 60)), `leaked: ${String(hidden).slice(0, 40)}`);
      }
    }],
    ['every runnable inline script is allowed by the CSP (same scripts as the template page)', async () => {
      const allowed = cspAllows();
      for (const [type, id] of [['case', 'petronet-fms'], ['job', 'l2-engineer-fms-dahej'], ['case', 'no-such-case'], ['job', 'no-such-role']]) {
        const scripts = runnableScripts((await page(type, id)).body);
        assert(scripts.length >= 2, 'template scripts missing');
        for (const body of scripts) {
          const hash = 'sha256-' + crypto.createHash('sha256').update(body, 'utf8').digest('base64');
          assert(allowed.has(hash), `${type}/${id}: inline script not in CSP: ${body.slice(0, 50)}`);
        }
      }
    }],
    ['unknown, malformed and draft ids → 404 page; the draft is not listed or linked', async () => {
      for (const id of ['no-such-case', '../etc/passwd', 'PETRONET-FMS', '', 'a'.repeat(101)]) {
        const r = await page('case', id);
        eq(r.statusCode, 404, id); assert.match(r.headers['content-type'], /^text\/html/); assert(r.body.includes('Case study not found'));
      }
      await withList(casesFile, list => list.map(c => (c.id === 'rockwool' ? { ...c, published: false } : c)), async () => {
        eq((await page('case', 'rockwool')).statusCode, 404);
        const other = await page('case', 'gnfc-fms');
        assert(!other.body.includes('/case-studies/rockwool"'), 'draft linked from a related list');
        assert(!(await page('sitemap')).body.includes('/case-studies/rockwool<'), 'draft in sitemap');
      });
    }],
    ['data is escaped in the page and in the JSON-LD', async () => {
      const evil = '<script>alert(1)</script> "Quoted" & Co\'s';
      await withList(casesFile, list => [{ ...list[0], id: 'evil-case', client: evil, arch_tag: '</script><b>x', summary: '<img src=x onerror=alert(1)>' }, ...list], async () => {
        const r = await page('case', 'evil-case');
        eq(r.statusCode, 200);
        assert(!r.body.includes('<script>alert(1)') && !r.body.includes('<img src=x') && !r.body.includes('</script><b>'), 'unescaped data');
        assert(r.body.includes('&lt;script&gt;alert(1)&lt;/script&gt; &quot;Quoted&quot; &amp; Co&#39;s'));
        const crumbs = ldBlocks(r.body).find(d => d['@type'] === 'BreadcrumbList');
        eq(crumbs.itemListElement[2].name, evil, 'JSON-LD keeps the text');
      });
    }],
    ['job page: JobPosting with every field Google requires, apply link, 200', () => withList(jobsFile, list => list.map(j => ({ ...j, isActive: true })), async () => {
      const r = await page('job', 'l2-engineer-fms-dahej');
      eq(r.statusCode, 200);
      assert(r.body.includes('<link rel="canonical" href="https://www.dtechindia.com/careers/l2-engineer-fms-dahej">'));
      eq((r.body.match(/<a href="\/careers" aria-current="page">/g) || []).length, 2);
      assert(r.body.includes('href="/careers?apply=l2-engineer-fms-dahej"'), 'apply link');
      assert.deepStrictEqual(relativeUrls(r.body), []);
      const job = ldBlocks(r.body).find(d => d['@type'] === 'JobPosting');
      assert(job, 'no JobPosting');
      eq(job.title, 'L2 Engineer - FMS'); eq(job.datePosted, '2026-09-27');
      assert(job.description.length > 80 && job.description.startsWith('<p>'), 'description');
      eq(job.hiringOrganization.name, 'D-Tech Solution Integrators Private Limited');
      assert.deepStrictEqual(job.jobLocation.address, { '@type': 'PostalAddress', addressLocality: 'Dahej', addressCountry: 'IN', addressRegion: 'Gujarat' });
      eq(job.url, 'https://www.dtechindia.com/careers/l2-engineer-fms-dahej');
      const adama = ldBlocks((await page('job', 'l1-fms-engineer-adama-agricultural-solutions-dahej')).body).find(d => d['@type'] === 'JobPosting');
      eq(adama.jobLocation.address.addressLocality, 'Dahej', 'town taken from "Client, Town"');
      const gnal = ldBlocks((await page('job', 'fms-engineer-vadodara-gnal')).body).find(d => d['@type'] === 'JobPosting');
      eq(gnal.jobLocation.address.addressLocality, 'Vadodara', 'site in brackets dropped');
    })],
    ['closed role → 404; a role without a posting date gets a page but no JobPosting', async () => {
      await withList(jobsFile, list => list.map((j, i) => (i === 0 ? { ...j, isActive: false } : i === 1 ? { ...j, isActive: true, postedAt: undefined } : j)), async () => {
        const all = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
        const closed = await page('job', all[0].id);
        eq(closed.statusCode, 404); assert(closed.body.includes('This role is no longer open'));
        const undated = await page('job', all[1].id);
        eq(undated.statusCode, 200); assert(!ldBlocks(undated.body).some(d => d['@type'] === 'JobPosting'));
      });
    }],
    ['sitemap: every published case and open role, nothing else', async () => {
      const r = await page('sitemap');
      eq(r.statusCode, 200); assert.match(r.headers['content-type'], /^application\/xml/);
      assert(r.body.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
      const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort();
      const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8')).filter(c => c.published !== false).map(c => `https://www.dtechindia.com/case-studies/${c.id}`);
      const roles = JSON.parse(fs.readFileSync(jobsFile, 'utf8')).filter(j => j.isActive === true).map(j => `https://www.dtechindia.com/careers/${j.id}`);
      assert.deepStrictEqual(locs, [...cases, ...roles].sort());
    }],
    ['HEAD → 200; POST → 405; unknown type → 404', async () => {
      eq((await page('case', 'petronet-fms', 'HEAD')).statusCode, 200);
      const post405 = await page('case', 'petronet-fms', 'POST');
      eq(post405.statusCode, 405); eq(post405.headers.allow, 'GET, HEAD');
      eq((await page('news', 'x')).statusCode, 404);
    }],
    ['routes, function bundle and robots.txt are wired', () => {
      const v = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
      const dest = src => (v.rewrites.find(r => r.source === src) || {}).destination;
      eq(dest('/case-studies/:id'), '/api/detail?type=case&id=:id');
      eq(dest('/careers/:id'), '/api/detail?type=job&id=:id');
      eq(dest('/sitemap-details.xml'), '/api/detail?type=sitemap');
      eq(v.functions['api/detail.js'].includeFiles, 'data/*.json');
      assert(fs.readFileSync(path.join(REPO, 'robots.txt'), 'utf8').includes('Sitemap: https://www.dtechindia.com/sitemap-details.xml'));
    }],
    ['every role has a posting date; the console stamps new roles and keeps the date on edit', async () => {
      for (const j of JSON.parse(fs.readFileSync(path.join(REPO, 'data/jobs.json'), 'utf8'))) assert.match(String(j.postedAt), /^\d{4}-\d{2}-\d{2}$/, j.id);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const added = await post({ type: 'job', action: 'save', item: { ...job, title: 'Detail Page Engineer', location: 'Jhagadia' } });
      eq(added.statusCode, 200, JSON.stringify(added.body));
      const saved = added.body.items.find(j => j.title === 'Detail Page Engineer');
      eq(saved.postedAt, today);
      const old = { ...saved, postedAt: '2026-01-02' };
      fs.writeFileSync(jobsFile, JSON.stringify(JSON.parse(fs.readFileSync(jobsFile, 'utf8')).map(j => (j.id === saved.id ? old : j))));
      const edited = await post({ type: 'job', action: 'save', id: saved.id, item: { ...job, title: 'Detail Page Engineer', location: 'Jhagadia', positions: 3 } });
      eq(edited.statusCode, 200, JSON.stringify(edited.body));
      eq(edited.body.items.find(j => j.id === saved.id).postedAt, '2026-01-02', 'edit kept the date');
      eq((await post({ type: 'job', action: 'delete', id: saved.id })).statusCode, 200);
    }],
  ]);

  // 11. The private data repo keeps every commit message and file path for good,
  // even after a purge, so neither may carry a visitor's name or email.
  const recordWrites = async (fn) => {
    const real = { appendJson: store.appendJson, putFile: store.putFile };
    const writes = [];
    store.appendJson = (name, file, item, message) => { writes.push({ file, message }); return real.appendJson(name, file, item, message); };
    store.putFile = (name, file, buf, message) => { writes.push({ file, message }); return real.putFile(name, file, buf, message); };
    try { await fn(); } finally { Object.assign(store, real); }
    return writes;
  };
  const personal = ['Asha Verma', 'asha.verma@example.com', 'Asha'];
  const assertAnonymous = (writes, expected) => {
    eq(writes.length, expected, `writes: ${JSON.stringify(writes)}`);
    for (const w of writes) for (const p of personal) {
      assert(!w.message.includes(p), `commit message "${w.message}" names the visitor`);
      assert(!w.file.includes(p.split(' ')[0]), `path "${w.file}" names the visitor`);
    }
  };
  await area('11. No personal data in data-repo commits', [
    ['contact → "Add requirement <id>"', async () => {
      const writes = await recordWrites(async () => {
        eq((await call(contact, req('POST', { ...validEnquiry, name: 'Asha Verma', email: 'asha.verma@example.com', formStart: stale() }))).statusCode, 200);
      });
      assertAnonymous(writes, 1);
      assert.match(writes[0].message, /^Add requirement [a-z0-9]+-[0-9a-f]{8}$/);
    }],
    ['application with CV → CV stored as cvs/<id>.pdf, messages by id', async () => {
      const writes = await recordWrites(async () => {
        // Earlier areas edit and close roles, so apply to one that is open now.
        const open = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8')).find(j => j.isActive === true);
        const r = await call(apply, req('POST', { ...applicant, jobId: open.id, name: 'Asha Verma', email: 'asha.verma@example.com', formStart: stale(), cv: { filename: 'Asha Verma CV.pdf', type: 'application/pdf', dataBase64: pdfB64 } }));
        eq(r.statusCode, 200, JSON.stringify(r.body));
        const rec = JSON.parse(fs.readFileSync('.portal-data/applicants.json', 'utf8')).find(a => a.id === r.body.reference);
        eq(rec.cv.path, `cvs/${rec.id}.pdf`);
        eq(rec.cv.filename, 'Asha Verma CV.pdf', 'download keeps the original file name');
      });
      assertAnonymous(writes, 2);
      assert.match(writes[0].message, /^Add CV for application [a-z0-9]+-[0-9a-f]{8}$/);
      assert.match(writes[1].message, /^Add application [a-z0-9]+-[0-9a-f]{8}$/);
    }],
    ['case-study summary view and PDF lead → messages by id', async () => {
      const writes = await recordWrites(async () => {
        eq((await call(whitepaper, req('POST', { request: 'summary', email: 'asha.verma@example.com', name: 'Asha Verma', caseId: 'mrf', formStart: stale() }))).statusCode, 200);
        eq((await call(whitepaper, req('POST', { email: 'asha.verma@example.com', name: 'Asha Verma', caseId: 'petronet-fms', formStart: stale() }))).statusCode, 200);
      });
      assertAnonymous(writes, 2);
      assert.match(writes[0].message, /^Add case-study summary view [a-z0-9]+-[0-9a-f]{8}$/);
      assert.match(writes[1].message, /^Add case-study lead [a-z0-9]+-[0-9a-f]{8}$/);
    }],
  ]);
  console.error = errLog;

  // 12. Service worker offline behaviour, run in a stubbed worker scope.
  const runWorker = async (cached, url) => {
    const listeners = {};
    const scope = {
      self: { addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: () => {}, clients: { claim: () => {} } },
      location: { origin: 'https://dtech.test' },
      caches: { match: async (r) => cached[typeof r === 'string' ? r : new URL(r.url).pathname], open: async () => ({ put: async () => {} }) },
      fetch: async () => { throw new TypeError('Failed to fetch'); },
      URL, Response, Promise,
    };
    scope.self.location = scope.location;
    require('vm').runInNewContext(fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8'), scope);
    let reply;
    listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: `https://dtech.test${url}` }, respondWith: (p) => { reply = p; } });
    return reply;
  };
  await area('12. Service worker offline fallback (sw.js)', [
    ['offline, page cached → the cached page', async () => {
      const page = new Response('about page');
      eq(await runWorker({ '/about': page, '/': new Response('home') }, '/about'), page);
    }],
    ['offline, page not cached → explicit offline page (503), never the home page', async () => {
      const r = await runWorker({ '/': new Response('home page') }, '/contact');
      eq(r.status, 503);
      const html = await r.text();
      assert(html.includes('You are offline') && !html.includes('home page'), html.slice(0, 120));
      assert.match(r.headers.get('content-type'), /^text\/html/);
    }],
  ]);

  // 13. Case-study PDFs are lead-gated: middleware.js serves them only on links signed by _pdf-link.js.
  const { default: pdfGate, validPdfToken, config: gateConfig } = await gate;
  const pdfLink = require(path.join(REPO, 'api/_pdf-link.js'));
  const PDF = 'assets/case-studies/pdf/petronet-lng-enterprise-fms-2026.pdf';
  const through = async (pathAndQuery) => (await pdfGate(new Request(`https://dtech.test${pathAndQuery}`))) === undefined;
  const withEnv = async (vars, fn) => {
    const saved = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
    for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    try { return await fn(); } finally {
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };
  await area('13. Lead-gated case-study PDFs (middleware.js)', [
    ['the gate covers every route before static routing', () => eq(gateConfig.matcher, '/:path*')],
    ['internal files are blocked through plain, encoded and double-encoded aliases', async () => {
      for (const route of [
        '/data/case-studies.json', '/data%2Fcase-studies.json', '/%64ata%2Fjobs.json',
        '/data%252Fjobs.json', '/data%5Cjobs.json', '//data//jobs.json',
        '/api%2Fadmin%2F_console-app.js', '/api/admin/_console-app.js', '/api/_store',
        '/docs/superpowers/plans/example.md', '/tools/test-api.js', '/graphify-out/graph.json',
        '/middleware.js', '/middle%77are.js', '/vercel.json', '/.env.production', '/.git/config',
        '/.portal-data/requirements.json', '/assets/..%2Fdata%2Fjobs.json',
      ]) {
        const r = await pdfGate(new Request(`https://dtech.test${route}`));
        assert(r, route); eq(r.status, 404, route); eq(r.headers.get('cache-control'), 'no-store');
      }
    }],
    ['public pages, assets and API handlers remain reachable through middleware', async () => {
      for (const route of ['/', '/careers', '/case-studies/mrf', '/admin-dtech', '/portal', '/assets/bundle.min.css', '/api/jobs', '/api/contact', '/api/admin/data', '/api/detail?type=sitemap', '/.well-known/acme-challenge/example']) {
        eq(await pdfGate(new Request(`https://dtech.test${route}`)), undefined, route);
      }
    }],
    ['encoded PDF aliases still require a signed link', async () => {
      for (const route of ['/assets%2Fcase-studies%2Fpdf%2Fexample.pdf', '/assets/case-studies/%70df/example.pdf', '/assets%252Fcase-studies%252Fpdf%252Fexample.pdf']) {
        const r = await pdfGate(new Request(`https://dtech.test${route}`));
        eq(r.status, 302, route); eq(r.headers.get('location'), 'https://dtech.test/case-studies');
      }
    }],
    ['malformed and excessively nested path encodings fail closed', async () => {
      for (const route of ['/data%ZZjobs.json', '/data%' + '25'.repeat(9) + '2Fjobs.json', '/da%0Ata%2Fjobs.json', '/middleware.js%00']) {
        const r = await pdfGate(new Request(`https://dtech.test${route}`));
        eq(r.status, 400, route);
      }
    }],
    ['no link, or an old address search engines list → redirected to /case-studies', async () => {
      const r = await pdfGate(new Request(`https://dtech.test/${PDF}`));
      eq(r.status, 302); eq(r.headers.get('location'), 'https://dtech.test/case-studies');
      eq(await through(`/${PDF}?t=`), false);
      eq(await through(`/${PDF}?t=garbage`), false);
    }],
    ['a signed link → served', async () => eq(await through(pdfLink.signedPdfPath(PDF, 60000)), true)],
    ['an expired link → refused', async () => {
      const old = pdfLink.signedPdfPath(PDF, 1000, Date.now() - 5000);
      eq(await through(old), false);
    }],
    ['a link signed for another PDF, or with a changed expiry or signature → refused', async () => {
      const other = pdfLink.signedPdfPath('assets/case-studies/pdf/mrf-plant-network.pdf', 60000);
      eq(await through(`/${PDF}?t=${other.split('?t=')[1]}`), false);
      const [p, t] = pdfLink.signedPdfPath(PDF, 60000).split('?t=');
      const [exp, sig] = t.split('.');
      eq(await through(`${p}?t=${Number(exp) + 86400000}.${sig}`), false);
      eq(await through(`${p}?t=${exp}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`), false);
    }],
    ['no secret on the server → nothing served, even with a link; requests answer 503', async () => {
      const link = pdfLink.signedPdfPath(PDF, 60000);
      await withEnv({ ADMIN_SECRET: undefined, PDF_LINK_SECRET: undefined }, async () => {
        eq(await through(link), false);
        assert.throws(() => pdfLink.signedPdfPath(PDF, 60000), /cannot be signed/);
        const r = await call(whitepaper, req('POST', { email: 'nosecret@example.com', name: 'Lead', caseId: 'petronet-fms', formStart: stale() }));
        eq(r.statusCode, 503);
        eq((await call(whitepaper, req('POST', { request: 'summary', email: 'nosecret@example.com', name: 'Lead', caseId: 'mrf', formStart: stale() }))).statusCode, 200, 'summary views need no PDF');
      });
    }],
    ['PDF_LINK_SECRET, when set, signs instead of ADMIN_SECRET (and both sides agree)', async () => {
      await withEnv({ PDF_LINK_SECRET: 'a-separate-pdf-link-secret' }, async () => {
        const link = pdfLink.signedPdfPath(PDF, 60000);
        eq(await through(link), true);
        const [p, t] = link.split('?t=');
        eq(await validPdfToken(p, t, process.env.ADMIN_SECRET), false, 'not valid under ADMIN_SECRET');
      });
    }],
    ['PDF emailed → attached via a signed fetch; a fallback link is signed for 14 days', async () => {
      const before = sent.length;
      eq((await call(whitepaper, req('POST', { email: 'gated@example.com', name: 'Lead', caseId: 'petronet-fms', formStart: stale() }))).statusCode, 200);
      eq(sent.slice(before).find(m => m.to === 'gated@example.com').attachments.length, 1, 'signed fetch got through the gate');
      failPdfFetch = true;
      try {
        const mark = sent.length;
        eq((await call(whitepaper, req('POST', { email: 'gated-link@example.com', name: 'Lead', caseId: 'petronet-fms', formStart: stale() }))).statusCode, 200);
        const html = sent.slice(mark).find(m => m.to === 'gated-link@example.com').html;
        const m = /href="https:\/\/dtech\.test(\/assets\/case-studies\/pdf\/[^"?]+)\?t=([^"]+)"/.exec(html);
        assert(m, 'signed download link in the email');
        const days = (Number(m[2].split('.')[0]) - Date.now()) / 86400000;
        assert(days > 13.9 && days <= 14, `link valid for ${days} days`);
        eq(await validPdfToken(m[1], m[2], process.env.ADMIN_SECRET), true);
      } finally { failPdfFetch = false; }
    }],
    ['console: ?pdf= needs a session, then redirects to a short-lived signed link', async () => {
      const q = { query: { pdf: PDF } };
      eq((await call(data, req('GET', null, q))).statusCode, 404, 'no session');
      const r = await call(data, req('GET', null, { ...q, headers: { cookie } }));
      eq(r.statusCode, 302);
      eq(r.headers['cache-control'], 'no-store');
      assert(r.headers.location.startsWith(`/${PDF}?t=`), r.headers.location);
      eq(await through(r.headers.location), true);
      for (const bad of ['assets/case-studies/pdf/../../api/_store.js', 'assets/case-studies/pdf/x.pdf/../y.pdf', 'api/_whitepapers.json', 'assets/case-studies/pdf/a/b/c.pdf']) {
        eq((await call(data, req('GET', null, { query: { pdf: bad }, headers: { cookie } }))).statusCode, 400, bad);
      }
    }],
    ['a PDF added later as an outside link: hidden from the public list, opened via ?case= by the console', async () => {
      const file = 'data/case-studies.json';
      const before = fs.readFileSync(file, 'utf8');
      try {
        const list = JSON.parse(before);
        const uploaded = list.find(c => c.published !== false && typeof c.pdf_file === 'string' && c.pdf_file.startsWith('assets/'));
        const linked = { ...uploaded, id: 'future-linked-pdf', pdf_file: 'https://drive.example.com/case.pdf', custom: true, published: true };
        const none = { ...uploaded, id: 'future-no-pdf', pdf_file: '', custom: true, published: true };
        fs.writeFileSync(file, JSON.stringify([...list, linked, none]));
        const pub = (await call(content, req('GET', null, { query: { list: 'case-studies' } }))).body;
        eq(pub.find(c => c.id === linked.id).pdf_file, true, 'outside link hidden, "has a PDF" kept');
        eq(pub.find(c => c.id === uploaded.id).pdf_file, uploaded.pdf_file, 'uploaded path unchanged (the gate guards it)');
        assert(!JSON.stringify(pub).includes('drive.example.com'), 'link leaked');
        const open = (id, withSession = true) => call(data, req('GET', null, { query: { case: id }, headers: withSession ? { cookie } : {} }));
        eq((await open(uploaded.id, false)).statusCode, 404, 'no session');
        const up = await open(uploaded.id);
        eq(up.statusCode, 302); eq(await through(up.headers.location), true);
        const ln = await open(linked.id);
        eq(ln.statusCode, 302); eq(ln.headers.location, 'https://drive.example.com/case.pdf');
        eq((await open(none.id)).statusCode, 404);
        eq((await open('Not An Id!')).statusCode, 400);
      } finally { fs.writeFileSync(file, before); }
    }],
    ['vercel.json tells search engines not to index the PDFs', () => {
      const rule = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8')).headers.find(h => h.source === '/assets/case-studies/pdf/(.*)');
      assert(rule && rule.headers.some(h => h.key === 'X-Robots-Tag' && /noindex/.test(h.value)));
    }],
  ]);

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
