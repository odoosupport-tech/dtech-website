// POST /api/contact
// Emails a contact.html enquiry to D-TECH sales over SMTP, with Reply-To set to
// the visitor so sales can answer straight from their inbox, sends the visitor an
// automatic "requirement received" confirmation, and files it in
// requirements.json in the private data repository for the management console.
//
// Body (JSON):
//   { name, email, phone, company, subject, message, website }
//   subject is one of the TOPICS keys (the contact.html dropdown values); anything
//   else is filed as a general enquiry. "website" is a hidden bot-trap field and
//   must stay empty.
//
// Needs SMTP_HOST, SMTP_USER and SMTP_PASS (see _mail.js). Filing the enquiry
// needs GITHUB_DATA_REPO and a token (see _store.js); without them it is only emailed.

const { isConfigured, sendMail, salesEmail } = require('./_mail');
const store = require('./_store');
const { EMAIL_RE, createRateLimiter, allowedOrigin, submittedTooFast, esc, clean } = require('./_http');

const overLimit = createRateLimiter();

// The contact.html dropdown, value → label. The topic is echoed in the
// confirmation sent to an address the visitor typed, so only these fixed labels
// are used, never free text that could carry a spammer's message.
const TOPICS = {
  'it-infra': 'Turnkey Industrial IT & Optical Fiber Backbone',
  forklift: 'AI Forklift Pedestrian Safety (N2024G-5)',
  tfms: 'TFMS Tanker Fleet Management System',
  jiva: 'JIVA Siemens SPM Industrial Automation',
  kiosk: 'AT-GTS Safety & Group Training Kiosk',
  cctv: 'CCTV Surveillance & AI Vision Analytics',
  other: 'Other Custom Systems Integration',
};
const GENERAL_TOPIC = 'General enquiry';

function topicFor(subject) {
  const key = clean(subject, 40);
  return Object.prototype.hasOwnProperty.call(TOPICS, key) ? TOPICS[key] : GENERAL_TOPIC;
}

// The message body keeps its line breaks; only strip control characters.
function cleanMultiline(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim().slice(0, max);
}

function enquiryEmail({ enquiry, ip }) {
  const rows = [
    ['Name', enquiry.name], ['Email', enquiry.email], ['Phone', enquiry.phone], ['Company', enquiry.company],
    ['Subject', enquiry.topic], ['Received at', new Date().toISOString()], ['IP', ip],
  ].map(([k, v]) => `<tr><td style="padding:6px 12px;color:#64748b">${esc(k)}</td><td style="padding:6px 12px"><strong>${esc(v || '—')}</strong></td></tr>`).join('');
  return `<p style="font-family:Arial,sans-serif">New enquiry from the website contact form. Reply to this email to answer the visitor directly.</p>
  <table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">${rows}</table>
  <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;margin-top:16px;padding:14px 16px;background:#f8fafc;border-radius:8px">${esc(enquiry.message)}</div>`;
}

function enquiryText({ enquiry, ip }) {
  return [
    `Name: ${enquiry.name}`, `Email: ${enquiry.email}`, `Phone: ${enquiry.phone || '—'}`,
    `Company: ${enquiry.company || '—'}`, `Subject: ${enquiry.topic}`, `IP: ${ip}`, '', enquiry.message,
  ].join('\n');
}

// The greeting is the one visitor-typed string that lands in a mail sent to an
// address the visitor chose, so keep it to plain name characters (no links or markup).
function safeGreetingName(name) {
  const words = String(name).split(/\s+/).filter(w => /^[\p{L}\p{M}'.-]{1,30}$/u.test(w));
  return words.slice(0, 3).join(' ');
}

const CONFIRMATION_SUBJECT = 'Thank you for contacting D-TECH \u2014 Requirement Received';

function customerConfirmationEmail({ enquiry }) {
  const name = safeGreetingName(enquiry.name) || 'there';
  const topic = enquiry.topic || 'your enquiry';
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#14181c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#0b1a33;padding:22px 28px;color:#ffffff">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ff8a3d">D-TECH Solution Integrators</div>
        <div style="font-size:22px;font-weight:bold;margin-top:6px">Requirement received</div>
      </td></tr>
      <tr><td style="height:4px;background:linear-gradient(90deg,#f0561d,#fbbf24,#14b8a6,#3b82f6,#7c3aed);background-color:#f0561d"></td></tr>
      <tr><td style="padding:26px 28px;font-size:15px;line-height:1.6">
        <p style="margin:0 0 14px">Hello ${esc(name)},</p>
        <p style="margin:0 0 14px">Thank you for reaching out to D-TECH Solution Integrators.</p>
        <p style="margin:0 0 14px">Your requirement regarding <strong>${esc(topic)}</strong> has been recorded and assigned to our solutions engineering team.</p>
        <p style="margin:0 0 14px">A representative will review the details and get in touch with you within 1 business day.</p>
      </td></tr>
      <tr><td style="padding:18px 28px;background:#f8fafc;font-size:13px;color:#475569;line-height:1.6">
        <strong style="color:#14181c">D-TECH Solution Integrators Private Limited</strong><br>
        Email: <a href="mailto:sales@dtechindia.com" style="color:#0075ae">sales@dtechindia.com</a><br>
        Phone: <a href="tel:+919558809163" style="color:#0075ae">+91 95588 09163</a><br>
        Bharuch Corporate HQ, Gujarat
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function customerConfirmationText({ enquiry }) {
  return [
    `Hello ${safeGreetingName(enquiry.name) || 'there'},`, '',
    'Thank you for reaching out to D-TECH Solution Integrators.', '',
    `Your requirement regarding ${enquiry.topic || 'your enquiry'} has been recorded and assigned to our solutions engineering team.`, '',
    'A representative will review the details and get in touch with you within 1 business day.', '',
    'D-TECH Solution Integrators Private Limited',
    'Email: sales@dtechindia.com', 'Phone: +91 95588 09163', 'Bharuch Corporate HQ, Gujarat',
  ].join('\n');
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
  if (body.website || submittedTooFast(body)) return res.status(200).json({ ok: true }); // bot trap

  const enquiry = {
    name: clean(body.name, 120),
    email: clean(body.email, 254),
    phone: clean(body.phone, 40),
    company: clean(body.company, 160),
    topic: topicFor(body.subject),
    message: cleanMultiline(body.message, 5000),
  };

  if (!enquiry.name) return res.status(400).json({ ok: false, error: 'Please enter your name.' });
  if (!EMAIL_RE.test(enquiry.email)) return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  if (!enquiry.message) return res.status(400).json({ ok: false, error: 'Please describe your requirement.' });

  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (overLimit('ip:' + ip, 5, 10 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }
  // Caps the auto-responses any one address receives, so the form cannot be used
  // to flood a stranger's inbox. Sales still gets every enquiry.
  const confirmVisitor = !overLimit('to:' + enquiry.email.toLowerCase(), 3, 60 * 60 * 1000);

  const record = { id: store.newId(), ...enquiry, date: new Date().toISOString() };
  const [mailed, filed, confirmed] = await Promise.allSettled([
    sendMail({
      to: salesEmail(),
      replyTo: enquiry.email,
      subject: `Website enquiry: ${enquiry.topic || 'General'} — ${enquiry.name}`,
      html: enquiryEmail({ enquiry, ip }),
      text: enquiryText({ enquiry, ip }),
    }),
    store.isConfigured('private')
      ? store.appendJson('private', 'requirements.json', record, `Add requirement from ${enquiry.name}`)
      : Promise.reject(new Error('private storage is not configured')),
    confirmVisitor
      ? sendMail({
        to: enquiry.email,
        subject: CONFIRMATION_SUBJECT,
        html: customerConfirmationEmail({ enquiry }),
        text: customerConfirmationText({ enquiry }),
      })
      : Promise.reject(new Error('recipient over the hourly confirmation limit')),
  ]);
  if (mailed.status === 'rejected') console.error('Contact email failed:', mailed.reason.message);
  if (filed.status === 'rejected') console.error('Filing requirement failed:', filed.reason.message);
  // The visitor's copy is a courtesy; sales already has the enquiry, so a failure here is only logged.
  if (confirmed.status === 'rejected') console.error('Confirmation email failed:', confirmed.reason.message);

  // Either copy reaching sales is enough; only fail when both were lost.
  if (mailed.status === 'fulfilled' || filed.status === 'fulfilled') {
    return res.status(200).json({ ok: true, id: record.id });
  }
  return res.status(502).json({ ok: false, error: 'We could not send your request right now. Please try again or email sales@dtechindia.com.' });
};
