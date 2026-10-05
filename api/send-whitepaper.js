// Vercel serverless function: emails a case-study PDF to the visitor who
// requested it, notifies D-TECH sales about the lead and files the lead in
// leads.json in the private data repository (see _store.js) when configured.
//
// With { request: "summary" } it only files the lead: a visitor who filled in
// the form to read a case study's summary on the page. Nothing is emailed;
// the management console lists it beside the PDF requests. Every request is
// its own record, so a visitor's repeat requests all show up.
//
// Built-in case studies and their PDFs are listed in _whitepapers.json. Case
// studies added from the management console carry their own PDF in
// data/case-studies.json: an upload under assets/case-studies/pdf/custom/
// or an https link. PDFs held on this site are attached to the email, but are
// fetched from the site's own static URL at request time rather than bundled
// with this function, so the library can grow without nearing Vercel's function
// size limit. An https link is emailed as a link; so is a PDF that cannot be
// fetched, so the visitor is never left empty-handed.
//
// Sends over SMTP via _mail.js; set SMTP_HOST, SMTP_USER and SMTP_PASS (and
// optionally MAIL_FROM, SALES_EMAIL) as described there. Also reads:
//
//   SITE_URL        optional  public site address used in email links, e.g.
//                             https://www.dtechindia.com (default: the project's
//                             production address that Vercel provides; the request's
//                             Host header is only trusted off Vercel, in local runs)
//   ALLOWED_ORIGINS optional  extra comma-separated origins allowed to call this
//                             endpoint; the deployment's own origin is always allowed

const path = require('path');
const WHITEPAPERS = require('./_whitepapers.json');
const { isConfigured, sendMail, salesEmail } = require('./_mail');
const store = require('./_store');
const { EMAIL_RE, createRateLimiter, allowedOrigin, submittedTooFast, esc, clean } = require('./_http');

// Copied on every case-study email sent to a visitor.
const CASE_STUDY_CC = 'director@dtechindia.com';

const overLimit = createRateLimiter();

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;
const CASE_ID_RE = /^[a-z0-9-]{1,80}$/;
const CUSTOM_PDF_RE = /^assets\/case-studies\/pdf\/custom\/[A-Za-z0-9-]+\.pdf$/;
const PDF_FETCH_TIMEOUT_MS = 10 * 1000;
const PDF_HEAD_TIMEOUT_MS = 3 * 1000;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const CONSOLE_LIST_TTL_MS = 60 * 1000;
const CONSOLE_LIST_RETRY_MS = 10 * 1000;

// The console's list, cached per instance so a burst of requests cannot use up
// the GitHub token's rate limit: kept for a minute, and re-read on a miss (a
// case study published moments ago) at most every 10 seconds.
let consoleList = { at: 0, items: [] };

async function consoleCaseStudies(maxAgeMs) {
  if (consoleList.at && Date.now() - consoleList.at < maxAgeMs) return consoleList.items;
  const items = await store.readJson('site', 'case-studies.json', []);
  consoleList = { at: Date.now(), items: Array.isArray(items) ? items : [] };
  return consoleList.items;
}

// A published console case study with a PDF, as { title, topic, file } or
// { title, topic, url }; null when there is no such case study or PDF.
async function consolePaper(caseId) {
  if (!CASE_ID_RE.test(caseId) || !store.isConfigured('site')) return null;
  const match = list => list.find(x => x && x.id === caseId && x.custom === true && x.published !== false);
  const c = match(await consoleCaseStudies(CONSOLE_LIST_TTL_MS)) || match(await consoleCaseStudies(CONSOLE_LIST_RETRY_MS));
  if (!c || typeof c.pdf_file !== 'string') return null;
  const paper = { title: clean(c.client, 120), topic: clean(c.arch_tag, 120) };
  if (CUSTOM_PDF_RE.test(c.pdf_file)) return { ...paper, file: c.pdf_file };
  if (/^https:\/\/[^\s"'<>]+$/.test(c.pdf_file)) return { ...paper, url: c.pdf_file };
  return null;
}

// True when the console has switched an original (built-in) case study to Draft, so its PDF is no
// longer offered. If the list cannot be read the study stays available rather than failing the request.
async function isUnpublishedBuiltIn(caseId) {
  if (!store.isConfigured('site')) return false;
  try {
    const list = await consoleCaseStudies(CONSOLE_LIST_RETRY_MS);
    return list.some(x => x && x.id === caseId && x.published === false);
  } catch (err) {
    console.error('Checking published state failed:', err.message);
    return false;
  }
}

// The visitor's name is echoed in an email we send to the address they typed,
// so keep it to plain name characters — no links or markup for spammers to plant.
function safeGreetingName(name) {
  const words = String(name).split(/\s+/).filter(w => /^[\p{L}\p{M}'-]{1,30}$/u.test(w));
  return words.slice(0, 2).join(' ');
}

// The public address of a case study's PDF: its own https link, or the file as
// served from this site's static assets.
function downloadUrlFor(paper, siteUrl) {
  return paper.url || `${siteUrl}/${paper.file.split('/').map(encodeURIComponent).join('/')}`;
}

// The address used for email links and for fetching this site's own PDFs. It never
// comes from the request on Vercel, so a forged Host header cannot point either one
// at another server.
function siteUrlFor(req) {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const url = process.env.SITE_URL
    || (production && HOST_RE.test(production) ? `https://${production}` : '')
    || (!process.env.VERCEL && HOST_RE.test(requestHost) ? `https://${requestHost}` : '')
    || 'https://www.dtechindia.com';
  return url.replace(/\/+$/, '');
}

// The PDF's bytes from this site's static files, or null (logged) when it cannot
// be fetched, is not a PDF, or is too large to email. A fast HEAD pre-check
// skips oversized files without buffering them into function memory; anything
// the HEAD check cannot decide falls through to the GET below.
async function fetchPdf(url) {
  try {
    try {
      const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(PDF_HEAD_TIMEOUT_MS) });
      const headLen = Number(head.headers.get('content-length'));
      if (head.ok && Number.isFinite(headLen) && headLen > MAX_PDF_BYTES) {
        console.error(`Skipping PDF ${url}: HEAD reports ${headLen} bytes, over the ${MAX_PDF_BYTES}-byte limit`);
        return null;
      }
    } catch (headErr) {
      console.error(`PDF HEAD pre-check ${url} failed, falling back to GET:`, headErr.message);
    }
    const r = await fetch(url, { signal: AbortSignal.timeout(PDF_FETCH_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES) throw new Error(`${buf.length} bytes exceeds the ${MAX_PDF_BYTES}-byte limit`);
    if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
    return buf;
  } catch (err) {
    console.error(`Fetching PDF ${url} failed:`, err.message);
    return null;
  }
}

function visitorEmail({ name, paper, siteUrl, attached }) {
  const greeting = name ? `Hello ${esc(name)},` : 'Hello,';
  const downloadUrl = downloadUrlFor(paper, siteUrl);
  const delivery = attached
    ? `<p style="margin:0 0 14px">Thank you for your interest in D-TECH. The full <strong>${esc(paper.title)}</strong> case study you requested is attached to this email as a PDF.</p>`
    : `<p style="margin:0 0 14px">Thank you for your interest in D-TECH. The full <strong>${esc(paper.title)}</strong> case study you requested is ready to download as a PDF:</p>
        <p style="margin:0 0 22px"><a href="${esc(downloadUrl)}" style="display:inline-block;background:#0b1a33;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Download the case study (PDF)</a></p>`;
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#14181c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#0b1a33;padding:22px 28px;color:#ffffff">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ff8a3d">D-TECH Case Study</div>
        <div style="font-size:22px;font-weight:bold;margin-top:6px">${esc(paper.title)}</div>
        <div style="font-size:14px;color:#bfdbfe;margin-top:4px">${esc(paper.topic)}</div>
      </td></tr>
      <tr><td style="height:4px;background:linear-gradient(90deg,#f0561d,#fbbf24,#14b8a6,#3b82f6,#7c3aed);background-color:#f0561d"></td></tr>
      <tr><td style="padding:26px 28px;font-size:15px;line-height:1.6">
        <p style="margin:0 0 14px">${greeting}</p>
        ${delivery}
        <p style="margin:0 0 22px">If you would like to discuss a similar project at your plant, simply reply to this email and our team will get in touch.</p>
        <a href="${esc(siteUrl)}/case-studies" style="display:inline-block;background:#f0561d;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Explore more case studies</a>
      </td></tr>
      <tr><td style="padding:18px 28px;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.5">
        D-TECH Solution Integrators Pvt. Ltd. · Bharuch, Gujarat<br>You received this because this address was entered on the D-TECH website to request a case study.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function leadEmail({ lead, paper, ip, attached }) {
  const rows = [
    ['Name', lead.name], ['Email', lead.email], ['Phone', lead.phone], ['Company', lead.company],
    ['Case study', `${paper.title} — ${paper.topic}`], ['Requested at', new Date().toISOString()], ['IP', ip],
  ].map(([k, v]) => `<tr><td style="padding:6px 12px;color:#64748b">${esc(k)}</td><td style="padding:6px 12px"><strong>${esc(v || '—')}</strong></td></tr>`).join('');
  return `<p style="font-family:Arial,sans-serif">New case-study PDF request from the website. ${attached ? 'The PDF was emailed to the visitor automatically.' : 'A download link for the PDF was emailed to the visitor automatically.'}</p>
  <table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">${rows}</table>`;
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

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const summaryOnly = body.request === 'summary';

  if (!summaryOnly && !isConfigured()) {
    console.error('SMTP environment variables are missing');
    return res.status(503).json({ ok: false, error: 'Email delivery is temporarily unavailable. Please contact sales@dtechindia.com.' });
  }

  // Honeypot: real visitors never see or fill this field.
  if (body.website || submittedTooFast(body)) return res.status(200).json({ ok: true });

  const lead = {
    email: clean(body.email, 254),
    name: clean(body.name, 120),
    phone: clean(body.phone, 40),
    company: clean(body.company, 160),
  };
  const caseId = clean(body.caseId, 80);
  const builtIn = Object.prototype.hasOwnProperty.call(WHITEPAPERS, caseId) ? WHITEPAPERS[caseId] : null;

  if (!EMAIL_RE.test(lead.email)) return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  if (!builtIn && !CASE_ID_RE.test(caseId)) return res.status(400).json({ ok: false, error: 'Unknown case study.' });

  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  // Summaries send no email, so they get their own, roomier counters.
  const limited = summaryOnly
    ? overLimit('view-ip:' + ip, 30, 10 * 60 * 1000) || overLimit('view-to:' + lead.email.toLowerCase(), 30, 60 * 60 * 1000)
    : overLimit('ip:' + ip, 5, 10 * 60 * 1000) || overLimit('to:' + lead.email.toLowerCase(), 3, 60 * 60 * 1000);
  if (limited) return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });

  if (builtIn && await isUnpublishedBuiltIn(caseId)) return res.status(400).json({ ok: false, error: 'Unknown case study.' });

  let paper = builtIn;
  if (!paper) {
    try {
      paper = await consolePaper(caseId);
    } catch (err) {
      console.error('Reading console case studies failed:', err.message);
      return res.status(502).json({ ok: false, error: 'We could not send the email right now. Please try again or contact sales@dtechindia.com.' });
    }
    if (!paper) return res.status(400).json({ ok: false, error: 'Unknown case study.' });
  }

  // Commit messages name the record by id only: the data repository's history keeps them for good.
  const fileLead = request => {
    const record = { id: store.newId(), ...lead, caseId, caseTitle: `${paper.title} — ${paper.topic}`, request, date: new Date().toISOString() };
    return store.appendJson('private', 'leads.json', record, `Add case-study ${request === 'pdf' ? 'lead' : 'summary view'} ${record.id}`);
  };

  if (summaryOnly) {
    if (!store.isConfigured('private')) {
      console.error('Summary view not filed: private storage is not configured');
      return res.status(200).json({ ok: true, filed: false });
    }
    try {
      await fileLead('summary');
      return res.status(200).json({ ok: true, filed: true });
    } catch (err) {
      console.error('Filing summary view failed:', err.message);
      return res.status(502).json({ ok: false, error: 'We could not record your request right now.' });
    }
  }

  const sales = salesEmail();
  const siteUrl = siteUrlFor(req);

  const pdf = paper.file ? await fetchPdf(downloadUrlFor(paper, siteUrl)) : null;
  const attached = pdf !== null;

  try {
    const sent = await sendMail({
      to: lead.email,
      cc: CASE_STUDY_CC,
      replyTo: sales,
      subject: `Your D-TECH case study: ${paper.title}`,
      html: visitorEmail({ name: safeGreetingName(lead.name), paper, siteUrl, attached }),
      attachments: attached ? [{ filename: path.basename(paper.file), content: pdf, contentType: 'application/pdf' }] : [],
    });

    // The visitor already has their PDF; a failed sales notice or filing must not
    // undo that. Awaited, because Vercel may freeze the function once the response is sent.
    await Promise.all([
      sendMail({
        to: sales,
        replyTo: lead.email,
        subject: `Website lead: ${paper.title} PDF requested by ${lead.name || lead.email}`,
        html: leadEmail({ lead, paper, ip, attached }),
      }).catch(err => console.error('Sales notification failed:', err.message)),
      store.isConfigured('private')
        ? fileLead('pdf')
          .catch(err => console.error('Filing lead failed:', err.message))
        : Promise.resolve(console.error('Lead not filed: private storage is not configured')),
    ]);

    return res.status(200).json({ ok: true, id: sent.id });
  } catch (err) {
    console.error('Visitor email failed:', err.message);
    return res.status(502).json({ ok: false, error: 'We could not send the email right now. Please try again or contact sales@dtechindia.com.' });
  }
};
