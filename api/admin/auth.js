// /api/admin/auth: management console sign-in (see api/_admin.js).
//
//   GET     200 when the caller has a valid session, otherwise 404
//   POST    { id, key } — checks the admin ID (ADMIN_USER) and password
//           (ADMIN_SECRET) and starts a session; 401 when either is wrong
//   DELETE  signs out
//
// Every method answers 404 while ADMIN_SECRET is unset (console switched off).

const { secret, credentialsMatch, hasSession, startSession, endSession, notFound, jsonBody } = require('../_admin');
const { createRateLimiter, allowedOrigin } = require('../_http');

const overLimit = createRateLimiter();

// Each wrong guess waits before answering. The limiter above only counts per
// function instance; the hard, shared limit is the Vercel Firewall rate-limit
// rule on /api/ (see README), and this delay keeps every instance slow on its own.
const FAILED_SIGN_IN_DELAY_MS = 1500;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  const { id, key } = jsonBody(req);
  if (!credentialsMatch(id, key)) {
    await pause(FAILED_SIGN_IN_DELAY_MS);
    return res.status(401).json({ ok: false, error: 'Incorrect admin ID or password.' });
  }
  startSession(res);
  return res.status(200).json({ ok: true });
};
