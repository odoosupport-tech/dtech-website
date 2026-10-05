// Shared SMTP sender for the Vercel functions (contact form, case-study PDFs).
//
// Set these in Vercel → Project → Settings → Environment Variables, then redeploy:
//
//   SMTP_HOST    required  e.g. smtp.gmail.com, smtp.zoho.in, smtp.office365.com
//   SMTP_USER    required  mailbox login, e.g. sales@dtechindia.com
//   SMTP_PASS    required  that mailbox's password or app password
//   SMTP_PORT    optional  465 (implicit TLS) or 587 (STARTTLS); default 465
//   SMTP_SECURE  optional  "true"/"false"; defaults to true on port 465 only
//   MAIL_FROM    optional  sender shown to recipients; default "D-TECH <SMTP_USER>".
//                          Most providers reject a From address the login does not own.
//   SALES_EMAIL  optional  where enquiries and lead notices go (default sales@dtechindia.com)

const nodemailer = require('nodemailer');

const DEFAULT_SALES = 'sales@dtechindia.com';

let transport;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transportOptions() {
  const port = Number(process.env.SMTP_PORT) || 465;
  const secureEnv = String(process.env.SMTP_SECURE || '').toLowerCase();
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: secureEnv ? secureEnv === 'true' : port === 465,
    requireTLS: port === 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // Leave room inside the function's maxDuration for the response.
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 7000,
  };
}

function getTransport() {
  if (transport) return transport;
  transport = nodemailer.createTransport(transportOptions());
  return transport;
}

function mailFrom() {
  return process.env.MAIL_FROM || `D-TECH <${process.env.SMTP_USER}>`;
}

function salesEmail() {
  return process.env.SALES_EMAIL || DEFAULT_SALES;
}

// message: { to, replyTo?, subject, html, text?, attachments?: [{ filename, content: Buffer }] }
async function sendMail(message) {
  const info = await getTransport().sendMail({ from: mailFrom(), ...message });
  return { id: info.messageId };
}

// ── Diagnostics for the management console's "Check email" ─────────────
// Reports the settings in use (never the password) and what the mail server
// says when we sign in, translated into the setting that needs fixing.

function maskUser(user) {
  const [name, domain] = String(user || '').split('@');
  if (!name) return '';
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}${domain ? '@' + domain : ''}`;
}

function explain(err) {
  const code = String(err && err.code || '');
  const response = Number(err && err.responseCode) || 0;
  const message = String(err && err.message || '');
  if (code === 'EAUTH' || response === 535 || response === 534) {
    return 'The mail server rejected the sign-in. Check SMTP_USER and SMTP_PASS. For Gmail or Google Workspace, SMTP_PASS must be a 16-character App Password (Google Account → Security → App passwords), not the normal password; for Zoho, use an app-specific password.';
  }
  if (/wrong version number|ssl3_get_record|tls_validate_record_header|unknown protocol/i.test(message)) {
    return 'The port and the encryption setting do not match. Use SMTP_PORT=465 (SMTP_SECURE empty or true), or SMTP_PORT=587 with SMTP_SECURE=false.';
  }
  if (code === 'EDNS' || /ENOTFOUND|EAI_AGAIN/.test(message)) {
    return 'The mail server name in SMTP_HOST could not be found. Check it for typos, e.g. smtp.gmail.com, smtp.zoho.in or smtp.office365.com.';
  }
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED'].includes(code) || /timeout|ECONNREFUSED/i.test(message)) {
    return 'Could not connect to the mail server. Check SMTP_HOST and SMTP_PORT (465 or 587); some providers only allow one of them.';
  }
  if (code === 'EENVELOPE' || response === 550 || response === 553 || response === 554) {
    return 'The mail server refused the sender address. Set MAIL_FROM to an address the SMTP_USER mailbox owns, e.g. "D-TECH <sales@dtechindia.com>", or leave it empty.';
  }
  return 'The mail server returned an error. The details below name the cause.';
}

async function checkMail({ sendTest = false } = {}) {
  const opts = transportOptions();
  const settings = {
    host: opts.host || '',
    port: opts.port,
    secure: opts.secure,
    user: maskUser(opts.auth.user),
    passwordSet: Boolean(opts.auth.pass),
    from: mailFrom(),
    sales: salesEmail(),
  };
  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter(k => !process.env[k]);
  if (missing.length) {
    return { status: 'missing', settings, missing, advice: `Add ${missing.join(', ')} in Vercel → Project → Settings → Environment Variables (Production), then redeploy.` };
  }
  // A fresh transport, so the check reflects the current settings rather than
  // a connection this instance cached earlier.
  const probe = nodemailer.createTransport(opts);
  try {
    await probe.verify();
  } catch (err) {
    return { status: 'failed', settings, advice: explain(err), detail: `${err.code || 'ERROR'}${err.responseCode ? ' ' + err.responseCode : ''}: ${String(err.message || '').slice(0, 300)}` };
  }
  if (!sendTest) return { status: 'ok', settings };
  try {
    await probe.sendMail({
      from: settings.from,
      to: settings.sales,
      subject: 'D-TECH website: test email from the management console',
      text: 'This is a test email sent from the D-TECH management console ("Check email"). If you can read it, the website can send email.',
    });
    return { status: 'sent', settings };
  } catch (err) {
    return { status: 'failed', settings, advice: explain(err), detail: `${err.code || 'ERROR'}${err.responseCode ? ' ' + err.responseCode : ''}: ${String(err.message || '').slice(0, 300)}` };
  } finally {
    if (typeof probe.close === 'function') probe.close();
  }
}

module.exports = { isConfigured, sendMail, salesEmail, checkMail };
