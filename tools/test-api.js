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
globalThis.fetch = async (url) => { throw new Error(`network blocked in tests: ${url}`); };
require(path.join(REPO, 'node_modules/nodemailer')).createTransport = () => { throw new Error('real SMTP transport must never be created in tests'); };

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dtech-suite-'));
fs.cpSync(path.join(REPO, 'data'), path.join(sandbox, 'data'), { recursive: true });
fs.symlinkSync(path.join(REPO, 'assets'), path.join(sandbox, 'assets'));
process.chdir(sandbox);

const sent = [];
const mail = require(path.join(REPO, 'api/_mail.js'));
mail.sendMail = async (msg) => { sent.push(msg); return { id: `mock-${sent.length}` }; };

const api = (p) => require(path.join(REPO, 'api', p));
const jobs = api('jobs.js'), contact = api('contact.js'), apply = api('apply.js'), whitepaper = api('send-whitepaper.js');
const auth = api('admin/auth.js'), data = api('admin/data.js'), update = api('admin/update.js');

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
    ['petronet-fms → visitor gets PDF, sales gets lead alert, lead filed', async () => {
      const before = sent.length;
      const r = await call(whitepaper, req('POST', { email: 'lead@example.com', name: 'Lead Person', company: 'Acme', caseId: 'petronet-fms' }));
      eq(r.statusCode, 200); eq(r.body.ok, true);
      const [visitor, sales] = sent.slice(before);
      eq(visitor.to, 'lead@example.com');
      eq(visitor.attachments[0].filename, 'petronet-lng-enterprise-fms-2026.pdf');
      eq(visitor.attachments[0].contentType, 'application/pdf');
      eq(sales.to, 'sales@test.invalid'); eq(sales.replyTo, 'lead@example.com');
      eq(JSON.parse(fs.readFileSync('.portal-data/leads.json', 'utf8'))[0].caseId, 'petronet-fms');
    }],
  ]);

  // 5. Admin portal
  let cookie = '';
  await area('5. Stealth portal & admin API', [
    ['portal.html body markup identical to 404.html; no console markup', () => {
      const strip = (h) => h.replace(/<meta name="robots"[^>]*>/, '').replace(/<script>\s*\(function \(\) \{\s*\/\/ Renders as the 404 page[\s\S]*?<\/script>\s*/, '');
      const portal = fs.readFileSync(path.join(REPO, 'portal.html'), 'utf8');
      eq(strip(portal), strip(fs.readFileSync(path.join(REPO, '404.html'), 'utf8')), 'portal differs from 404 beyond robots meta + session script');
      assert(!/requirements|applicants|ADMIN_SECRET/i.test(portal), 'console strings leaked into portal.html');
    }],
    ['no session: auth GET, data, update → 404', async () => {
      eq((await call(auth, req('GET'))).statusCode, 404);
      eq((await call(data, req('GET'))).statusCode, 404);
      eq((await call(update, req('POST', {}))).statusCode, 404);
    }],
    ['wrong passkey → 404 (cloaked; spec said 401), no cookie', async () => {
      const r = await call(auth, req('POST', { key: 'wrong-passkey-xxxxxxxx' }));
      eq(r.statusCode, 404); eq(r.headers['set-cookie'], undefined);
    }],
    ['correct passkey → 200, signed HttpOnly/Secure/SameSite=Strict cookie', async () => {
      const r = await call(auth, req('POST', { key: process.env.ADMIN_SECRET }));
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
      eq(r.body.requirements.length, 1); eq(r.body.applicants.length, 2); // PDF + DOCX applications from area 3 eq(r.body.leads.length, 1);
    }],
    ['update toggles a role isActive (sandbox copy only)', async () => {
      const r = await call(update, req('POST', { type: 'job', action: 'toggle', id: openJob.id, value: false }, { headers: { cookie } }));
      eq(r.statusCode, 200); eq(r.body.ok, true);
      eq(r.body.items.find(j => j.id === openJob.id).isActive, false);
      eq((await call(jobs, req('GET'))).body.jobs.length, 11, 'public list reflects toggle');
    }],
  ]);

  // 7 (reported after 6). GitHub store retry rules, against a scripted fake GitHub.
  const store = api('_store.js');
  async function withFakeGitHub(putResponses, fn) {
    const saved = { fetch: globalThis.fetch, repo: process.env.GITHUB_DATA_REPO, token: process.env.GITHUB_DATA_TOKEN };
    const puts = [];
    Object.assign(process.env, { GITHUB_DATA_REPO: 'test-owner/test-data', GITHUB_DATA_TOKEN: 'test-token' });
    globalThis.fetch = async (url, opts) => {
      assert(String(url).startsWith('https://api.github.com/repos/test-owner/test-data/'), `unexpected url ${url}`);
      if (opts.method === 'GET') return { ok: false, status: 404, text: async () => '' };
      const [status, text] = putResponses[Math.min(puts.length, putResponses.length - 1)];
      puts.push(status);
      return { ok: status < 300, status, text: async () => text };
    };
    try { return await fn(puts); } finally {
      globalThis.fetch = saved.fetch;
      if (saved.repo === undefined) delete process.env.GITHUB_DATA_REPO; else process.env.GITHUB_DATA_REPO = saved.repo;
      if (saved.token === undefined) delete process.env.GITHUB_DATA_TOKEN; else process.env.GITHUB_DATA_TOKEN = saved.token;
    }
  }
  const storeChecks = [
    ['409 conflict → retried, gives up after 2 attempts', () => withFakeGitHub([[409, 'conflict']], async (puts) => {
      await assert.rejects(store.appendJson('private', 'leads.json', { id: 'x' }, 'm'), /changed too often/);
      eq(puts.length, 2);
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
  ];

  console.error = errLog;

  // 6. Build & contracts
  const run = (cmd, args, expect) => () => {
    const out = execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
    assert(out.includes(expect), `missing "${expect}"`);
  };
  await area('6. Build & contract integrity', [
    ['check-links.py', run('python3', ['tools/check-links.py'], 'OK')],
    ['check-ui-contract.py', run('python3', ['tools/check-ui-contract.py'], 'OK')],
    ['npm run verify → VERIFY-OK', run('npm', ['run', 'verify'], 'VERIFY-OK')],
  ]);
  await area('7. GitHub store retry rules (api/_store.js)', storeChecks);

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
