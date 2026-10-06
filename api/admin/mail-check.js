// POST /api/admin/mail-check: the console's "Check email" (session required).
//
//   { send: false }  sign in to the SMTP server and report the result
//   { send: true }   also send a test email to SALES_EMAIL
//
// Response: { ok: true, result: { status: "ok"|"sent"|"failed"|"missing",
//   settings: { host, port, secure, user (masked), passwordSet, from, sales },
//   advice?, detail?, missing? } }. The password is never returned.

const { checkMail } = require('../_mail');
const { requireSession, jsonBody } = require('../_admin');
const { allowedOrigin, createRateLimiter } = require('../_http');

const overLimit = createRateLimiter();

module.exports = async function handler(req, res) {
  if (!(await requireSession(req, res))) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!allowedOrigin(req)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  const send = jsonBody(req).send === true;
  // A test email goes to the sales inbox; a few per hour is plenty.
  if (send && overLimit('send', 5, 60 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many test emails. Please wait an hour.' });
  }
  const result = await checkMail({ sendTest: send });
  if (result.status === 'failed') console.error('Mail check failed:', result.detail);
  return res.status(200).json({ ok: true, result });
};
