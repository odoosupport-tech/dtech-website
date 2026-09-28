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

function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT) || 465;
  const secureEnv = String(process.env.SMTP_SECURE || '').toLowerCase();
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: secureEnv ? secureEnv === 'true' : port === 465,
    requireTLS: port === 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // Leave room inside the function's maxDuration for the response.
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 7000,
  });
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

module.exports = { isConfigured, sendMail, salesEmail };
