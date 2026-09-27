// Vercel serverless function: emails a case-study PDF to the visitor who
// requested it, notifies D-TECH sales about the lead and files the lead in
// leads.json in the private data repository (see _store.js) when configured.
//
// Sends over SMTP via _mail.js; set SMTP_HOST, SMTP_USER and SMTP_PASS (and
// optionally MAIL_FROM, SALES_EMAIL) as described there. Also reads:
//
//   SITE_URL        optional  public site address used in email links, e.g.
//                             https://www.dtechindia.com (default: this deployment)
//   ALLOWED_ORIGINS optional  extra comma-separated origins allowed to call this
//                             endpoint; the deployment's own origin is always allowed

const fs = require('fs');
const path = require('path');
const WHITEPAPERS = require('./_whitepapers.json');
const { isConfigured, sendMail, salesEmail } = require('./_mail');
const store = require('./_store');
const { EMAIL_RE, createRateLimiter, allowedOrigin, esc, clean } = require('./_http');

const overLimit = createRateLimiter();

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// The visitor's name is echoed in an email we send to the address they typed,
// so keep it to plain name characters — no links or markup for spammers to plant.
function safeGreetingName(name) {
  const words = String(name).split(/\s+/).filter(w => /^[\p{L}\p{M}'-]{1,30}$/u.test(w));
  return words.slice(0, 2).join(' ');
}

function visitorEmail({ name, paper, siteUrl }) {
  const greeting = name ? `Hello ${esc(name)},` : 'Hello,';
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
        <p style="margin:0 0 14px">Thank you for your interest in D-TECH. The full <strong>${esc(paper.title)}</strong> case study you requested is attached to this email as a PDF.</p>
        <p style="margin:0 0 22px">If you would like to discuss a similar project at your plant, simply reply to this email and our team will get in touch.</p>
        <a href="${esc(siteUrl)}/case-studies.html" style="display:inline-block;background:#f0561d;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Explore more case studies</a>
      </td></tr>
      <tr><td style="padding:18px 28px;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.5">
        D-TECH Solution Integrators Pvt. Ltd. · Bharuch, Gujarat<br>You received this because this address was entered on the D-TECH website to request a case study.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function leadEmail({ lead, paper, ip }) {
  const rows = [
    ['Name', lead.name], ['Email', lead.email], ['Phone', lead.phone], ['Company', lead.company],
    ['Case study', `${paper.title} — ${paper.topic}`], ['Requested at', new Date().toISOString()], ['IP', ip],
  ].map(([k, v]) => `<tr><td style="padding:6px 12px;color:#64748b">${esc(k)}</td><td style="padding:6px 12px"><strong>${esc(v || '—')}</strong></td></tr>`).join('');
  return `<p style="font-family:Arial,sans-serif">New case-study PDF request from the website. The PDF was emailed to the visitor automatically.</p>
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

  if (!isConfigured()) {
    console.error('SMTP environment variables are missing');
    return res.status(503).json({ ok: false, error: 'Email delivery is temporarily unavailable. Please contact sales@dtechindia.com.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // Honeypot: real visitors never see or fill this field.
  if (body.website) return res.status(200).json({ ok: true });

  const lead = {
    email: clean(body.email, 254),
    name: clean(body.name, 120),
    phone: clean(body.phone, 40),
    company: clean(body.company, 160),
  };
  const caseId = clean(body.caseId, 60);
  const paper = Object.prototype.hasOwnProperty.call(WHITEPAPERS, caseId) ? WHITEPAPERS[caseId] : null;

  if (!EMAIL_RE.test(lead.email)) return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  if (!paper) return res.status(400).json({ ok: false, error: 'Unknown case study.' });

  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (overLimit('ip:' + ip, 5, 10 * 60 * 1000) || overLimit('to:' + lead.email.toLowerCase(), 3, 60 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }

  const pdfPath = path.join(process.cwd(), paper.file);
  let pdf;
  try {
    pdf = fs.readFileSync(pdfPath);
  } catch (e) {
    console.error('PDF not found in function bundle:', pdfPath);
    return res.status(500).json({ ok: false, error: 'Case study file is unavailable.' });
  }

  const sales = salesEmail();
  const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const siteUrl = (process.env.SITE_URL || (HOST_RE.test(requestHost) ? `https://${requestHost}` : 'https://www.dtechindia.com')).replace(/\/+$/, '');

  try {
    const sent = await sendMail({
      to: lead.email,
      replyTo: sales,
      subject: `Your D-TECH case study: ${paper.title}`,
      html: visitorEmail({ name: safeGreetingName(lead.name), paper, siteUrl }),
      attachments: [{ filename: path.basename(paper.file), content: pdf, contentType: 'application/pdf' }],
    });

    // The visitor already has their PDF; a failed sales notice or filing must not
    // undo that. Awaited, because Vercel may freeze the function once the response is sent.
    const record = { id: store.newId(), ...lead, caseId, caseTitle: `${paper.title} — ${paper.topic}`, date: new Date().toISOString() };
    await Promise.all([
      sendMail({
        to: sales,
        replyTo: lead.email,
        subject: `Website lead: ${paper.title} PDF requested by ${lead.name || lead.email}`,
        html: leadEmail({ lead, paper, ip }),
      }).catch(err => console.error('Sales notification failed:', err.message)),
      store.isConfigured('private')
        ? store.appendJson('private', 'leads.json', record, `Add case-study lead from ${lead.name || lead.email}`)
          .catch(err => console.error('Filing lead failed:', err.message))
        : Promise.resolve(console.error('Lead not filed: private storage is not configured')),
    ]);

    return res.status(200).json({ ok: true, id: sent.id });
  } catch (err) {
    console.error('Visitor email failed:', err.message);
    return res.status(502).json({ ok: false, error: 'We could not send the email right now. Please try again or contact sales@dtechindia.com.' });
  }
};
