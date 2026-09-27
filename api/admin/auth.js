// /api/admin/auth: management console sign-in (see api/_admin.js).
//
//   GET     200 when the caller has a valid session, otherwise 404
//   POST    { key } — checks the passkey against ADMIN_SECRET and starts a session
//   DELETE  signs out

const { secret, passkeyMatches, hasSession, startSession, endSession, notFound, jsonBody } = require('../_admin');
const { createRateLimiter, allowedOrigin } = require('../_http');

const overLimit = createRateLimiter();

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!secret()) return notFound(res); // console switched off

  if (req.method === 'GET') {
    return hasSession(req) ? res.status(200).json({ ok: true }) : notFound(res);
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') return notFound(res);
  if (!allowedOrigin(req)) return notFound(res);

  if (req.method === 'DELETE') {
    endSession(res);
    return res.status(200).json({ ok: true });
  }

  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (overLimit('ip:' + ip, 5, 15 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many attempts. Please wait 15 minutes.' });
  }
  const { key } = jsonBody(req);
  if (!passkeyMatches(key)) return notFound(res);
  startSession(res);
  return res.status(200).json({ ok: true });
};
