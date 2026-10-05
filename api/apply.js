// POST /api/apply
// Emails a careers-page application to HR over SMTP with the CV attached and
// Reply-To set to the candidate, and files it (details in applicants.json, the
// CV as its own file under cvs/) in the private data repository so it shows up
// in the management console.
//
// Body (JSON):
//   { jobId, jobTitle, name, email, phone, message, cv: { filename, type, dataBase64 }, website }
//   jobId is optional: without it the application is filed as a speculative
//   application, with any role the person named kept as the role.
//   "website" is a hidden bot-trap field and must stay empty.
//
// Needs SMTP_HOST, SMTP_USER and SMTP_PASS (see _mail.js); HR_EMAIL optionally
// overrides where applications go (default SALES_EMAIL). Filing needs
// GITHUB_DATA_REPO and a token (see _store.js).
//
// CV_STORAGE=email keeps CV files out of the data repository: the CV only travels
// as the email attachment to HR and the record notes that it was emailed, so
// deleting the email deletes the CV (git history never holds a copy). Any other
// value (the default) also files the CV in the private repository.

const fs = require('fs');
const path = require('path');
const { isConfigured, sendMail, salesEmail } = require('./_mail');
const store = require('./_store');
const { EMAIL_RE, createRateLimiter, allowedOrigin, submittedTooFast, esc, clean } = require('./_http');

const MAX_CV_BYTES = 3 * 1024 * 1024; // Vercel caps the request body at 4.5 MB
const ALLOWED_CV = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

// Leading bytes of each allowed type, so a renamed executable can't pass as a CV.
const CV_SIGNATURES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'application/msword': [0xd0, 0xcf, 0x11, 0xe0], // OLE compound file
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4b, 0x03, 0x04], // ZIP
};

const overLimit = createRateLimiter();

const emailOnlyCvs = () => String(process.env.CV_STORAGE || '').toLowerCase() === 'email';

function matchesSignature(buffer, mime) {
  const sig = CV_SIGNATURES[mime];
  return Boolean(sig) && buffer.length >= sig.length && sig.every((b, i) => buffer[i] === b);
}

function safeFilename(name, mime) {
  const ext = ALLOWED_CV[mime];
  const base = String(name || 'cv').replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\.[A-Za-z0-9]+$/, '').trim().slice(0, 60) || 'cv';
  return `${base}.${ext}`;
}

// null: no such open role; undefined: the job list could not be read.
function findJob(id) {
  let jobs;
  try {
    jobs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'jobs.json'), 'utf8'));
  } catch (err) {
    console.error('Reading data/jobs.json failed:', err.message);
    return undefined;
  }
  return (Array.isArray(jobs) ? jobs : []).find(j => j && j.id === id && j.isActive === true) || null;
}

function applicationEmail({ applicant, role, job, ip }) {
  const rows = [
    ['Candidate name', applicant.name], ['Phone', applicant.phone], ['Email', applicant.email],
    ['Role applied for', role], ['Location', job && job.location], ['Received at', new Date().toISOString()], ['IP', ip],
  ].map(([k, v]) => `<tr><td style="padding:6px 12px;color:#64748b">${esc(k)}</td><td style="padding:6px 12px"><strong>${esc(v || '—')}</strong></td></tr>`).join('');
  return `<p style="font-family:Arial,sans-serif">New job application from the careers page. The CV, if provided, is attached. Reply to this email to answer the candidate directly.</p>
  <table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">${rows}</table>
  <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;margin-top:16px;padding:14px 16px;background:#f8fafc;border-radius:8px">${esc(applicant.message || 'No cover message provided.')}</div>`;
}

function applicationText({ applicant, role, ip }) {
  return [
    `Candidate: ${applicant.name}`, `Phone: ${applicant.phone || '—'}`, `Email: ${applicant.email}`,
    `Role: ${role}`, `IP: ${ip}`, '', applicant.message || 'No cover message provided.',
  ].join('\n');
}

// The CV is committed first so the record never points at a missing file.
// Commit messages and the CV path name the record by id only: the data
// repository's history keeps them even after the record is purged.
async function fileApplication(record, cv) {
  if (!store.isConfigured('private')) throw new Error('private storage is not configured');
  if (cv && record.cv.path) await store.putFile('private', record.cv.path, cv.buffer, `Add CV for application ${record.id}`);
  await store.appendJson('private', 'applicants.json', record, `Add application ${record.id}`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!allowedOrigin(req)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
    return res.status(415).json({ ok: false, error: 'Unsupported content type' });
  }
  if (!isConfigured()) {
    console.error('SMTP environment variables are missing');
    return res.status(503).json({ ok: false, error: 'Applications are temporarily unavailable. Please email sales@dtechindia.com.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  if (body.website || submittedTooFast(body)) return res.status(200).json({ ok: true }); // bot trap

  const applicant = {
    name: clean(body.name, 120),
    email: clean(body.email, 254),
    phone: clean(body.phone, 40),
    message: String(body.message == null ? '' : body.message).trim().slice(0, 3000),
  };
  const jobId = clean(body.jobId, 80);

  if (!applicant.name) return res.status(400).json({ ok: false, error: 'Please enter your name.' });
  if (!EMAIL_RE.test(applicant.email)) return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  const wantedRole = clean(body.jobTitle, 120);

  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (overLimit('ip:' + ip, 5, 60 * 60 * 1000) || overLimit('mail:' + applicant.email.toLowerCase(), 3, 24 * 60 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many applications from here. Please try again later.' });
  }

  // CV is optional, but when present it must be a PDF or Word file within the size limit.
  let cv = null;
  if (body.cv && body.cv.dataBase64) {
    const mime = String(body.cv.type || '').toLowerCase();
    if (!ALLOWED_CV[mime]) return res.status(400).json({ ok: false, error: 'Please attach your CV as a PDF or Word document.' });
    const base64 = String(body.cv.dataBase64).replace(/^data:[^;]+;base64,/, '');
    if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) return res.status(400).json({ ok: false, error: 'The attached file could not be read.' });
    const bytes = Math.floor(base64.replace(/\s/g, '').length * 3 / 4);
    if (bytes > MAX_CV_BYTES) return res.status(413).json({ ok: false, error: 'Your CV is larger than 3 MB. Please attach a smaller file.' });
    const buffer = Buffer.from(base64.replace(/\s/g, ''), 'base64');
    if (!matchesSignature(buffer, mime)) return res.status(400).json({ ok: false, error: 'The attached file is not a valid PDF or Word document.' });
    cv = { buffer, mime, filename: safeFilename(body.cv.filename, mime) };
  }

  let job = null;
  if (jobId) {
    job = findJob(jobId);
    if (job === null) return res.status(400).json({ ok: false, error: 'That role is no longer open.' });
  }
  const role = job ? job.title : (wantedRole || 'Speculative application');

  const id = store.newId();
  const record = {
    id, ...applicant, role, jobId: job ? job.id : '', department: job ? job.department || '' : '',
    location: job ? job.location || '' : '', date: new Date().toISOString(),
    cv: !cv ? null
      : emailOnlyCvs() ? { filename: cv.filename, type: cv.mime, bytes: cv.buffer.length, emailOnly: true }
      : { filename: cv.filename, type: cv.mime, bytes: cv.buffer.length, path: `cvs/${id}.${ALLOWED_CV[cv.mime]}` },
  };

  const [mailed, filed] = await Promise.allSettled([
    sendMail({
      to: process.env.HR_EMAIL || salesEmail(),
      replyTo: applicant.email,
      subject: `Job application: ${role} — ${applicant.name}`,
      html: applicationEmail({ applicant, role, job, ip }),
      text: applicationText({ applicant, role, ip }),
      attachments: cv ? [{ filename: cv.filename, content: cv.buffer, contentType: cv.mime }] : [],
    }),
    fileApplication(record, cv),
  ]);
  if (mailed.status === 'rejected') console.error('Application email failed:', mailed.reason.message);
  if (filed.status === 'rejected') console.error('Filing application failed:', filed.reason.message);

  // Either copy reaching HR is enough; only fail when both were lost.
  if (mailed.status === 'fulfilled' || filed.status === 'fulfilled') {
    return res.status(200).json({ ok: true, reference: id, job: role });
  }
  return res.status(502).json({ ok: false, error: 'We could not submit your application right now. Please try again or email sales@dtechindia.com.' });
};
