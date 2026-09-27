// Session handling for the management console (portal.html + api/admin/*).
//
//   ADMIN_SECRET  required  the console passkey; at least 16 characters. Without
//                           it the console is switched off and every admin
//                           endpoint answers 404. Changing it signs everyone out.
//
// The session is a signed, expiring token in an HttpOnly, Secure,
// SameSite=Strict cookie scoped to /api/admin, so page scripts never see it.
// Unauthenticated requests get a plain 404 so the endpoints look absent.

const crypto = require('crypto');

const COOKIE = 'dt_console';
const SESSION_MS = 8 * 60 * 60 * 1000;

function secret() {
  const s = process.env.ADMIN_SECRET || '';
  return s.length >= 16 ? s : null;
}

function signingKey(s) {
  return crypto.createHmac('sha256', s).update('dtech-console-session-v1').digest();
}

function sign(payload, s) {
  return crypto.createHmac('sha256', signingKey(s)).update(payload).digest('base64url');
}

// Compares digests so neither length nor content leaks through timing.
function safeEqual(a, b) {
  const da = crypto.createHash('sha256').update(String(a)).digest();
  const db = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(da, db);
}

function passkeyMatches(candidate) {
  const s = secret();
  return Boolean(s) && typeof candidate === 'string' && safeEqual(candidate, s);
}

function readCookie(req, name) {
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function hasSession(req) {
  const s = secret();
  if (!s) return false;
  const [expires, mac] = readCookie(req, COOKIE).split('.');
  if (!expires || !mac || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(mac, sign(expires, s));
}

function cookie(value, maxAgeSeconds) {
  return `${COOKIE}=${value}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function startSession(res) {
  const expires = String(Date.now() + SESSION_MS);
  res.setHeader('Set-Cookie', cookie(`${expires}.${sign(expires, secret())}`, SESSION_MS / 1000));
}

function endSession(res) {
  res.setHeader('Set-Cookie', cookie('', 0));
}

function notFound(res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).json({ ok: false, error: 'Not found' });
}

// Call at the top of every protected handler: `if (!requireSession(req, res)) return;`
function requireSession(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (hasSession(req)) return true;
  notFound(res);
  return false;
}

function jsonBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  return body && typeof body === 'object' ? body : {};
}

module.exports = { secret, passkeyMatches, hasSession, startSession, endSession, requireSession, notFound, jsonBody };
