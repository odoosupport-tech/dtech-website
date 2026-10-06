// Session handling for the management console (portal.html, served at
// /admin-dtech, + api/admin/*).
//
//   ADMIN_SECRET  required  the console password; at least 16 characters.
//                           Without it the console is switched off and every
//                           admin endpoint answers 404. Changing it signs
//                           everyone out.
//   ADMIN_USER    optional  the admin ID typed with the password (default
//                           "admin"); not case-sensitive.
//
// The session is a signed, expiring token in an HttpOnly, Secure,
// SameSite=Strict cookie scoped to /api/admin, so page scripts never see it.
// Requests without a session get a plain 404 so the data endpoints look absent.
//
// Each session carries a random id. Signing out records that id in the private
// store (REVOKED_FILE), so a copied cookie stops working too, not just the one
// the browser deletes. Other instances see the revocation within REVOKED_CACHE_MS.

const crypto = require('crypto');
const store = require('./_store');

const COOKIE = 'dt_console';
const SESSION_MS = 4 * 60 * 60 * 1000;
const REVOKED_FILE = 'revoked-sessions.json';
const REVOKED_CACHE_MS = 30 * 1000;
const SESSION_RE = /^(\d{13,16})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/;

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

function adminId() {
  return (process.env.ADMIN_USER || '').trim().toLowerCase() || 'admin';
}

// Both parts are always compared, so the timing does not reveal which one was wrong.
function credentialsMatch(id, key) {
  const idOk = typeof id === 'string' && safeEqual(id.trim().toLowerCase(), adminId());
  const keyOk = passkeyMatches(key);
  return idOk && keyOk;
}

function readCookie(req, name) {
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

// { expires, sid } for a correctly signed, unexpired cookie, else null.
function readSession(req) {
  const s = secret();
  if (!s) return null;
  const m = SESSION_RE.exec(readCookie(req, COOKIE));
  if (!m || Number(m[1]) < Date.now()) return null;
  if (!safeEqual(m[3], sign(`${m[1]}.${m[2]}`, s))) return null;
  return { expires: Number(m[1]), sid: m[2] };
}

// Revoked session ids, re-read from the private store at most every
// REVOKED_CACHE_MS per instance. Without a private store there is nothing to
// read (local setups and a console without storage), so nothing is revoked.
let revokedCache = null; // { at, ids: Set }

function liveRevocations(list) {
  const now = Date.now();
  return (Array.isArray(list) ? list : []).filter(r => r && typeof r.sid === 'string' && Number(r.expires) > now);
}

async function revokedIds() {
  if (revokedCache && Date.now() - revokedCache.at < REVOKED_CACHE_MS) return revokedCache.ids;
  if (!store.isConfigured('private')) return new Set();
  try {
    const ids = new Set(liveRevocations(await store.readJson('private', REVOKED_FILE, [])).map(r => r.sid));
    revokedCache = { at: Date.now(), ids };
    return ids;
  } catch (err) {
    // A storage hiccup keeps the last known list; with none, fail closed.
    console.error('Reading revoked console sessions failed:', err.message);
    if (revokedCache) return revokedCache.ids;
    throw err;
  }
}

async function hasSession(req) {
  const session = readSession(req);
  if (!session) return false;
  try {
    return !(await revokedIds()).has(session.sid);
  } catch (err) {
    return false;
  }
}

function cookie(value, maxAgeSeconds) {
  return `${COOKIE}=${value}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function startSession(res) {
  const payload = `${Date.now() + SESSION_MS}.${crypto.randomBytes(18).toString('base64url')}`;
  res.setHeader('Set-Cookie', cookie(`${payload}.${sign(payload, secret())}`, SESSION_MS / 1000));
}

// Clears the browser's cookie and, for a genuine session, revokes its id for
// every copy of the cookie. Resolves true when the revocation was stored; false
// when there was no valid session, no private store, or the write failed (the
// cookie is cleared either way, and a copy then lapses at its expiry).
async function endSession(req, res) {
  res.setHeader('Set-Cookie', cookie('', 0));
  const session = readSession(req);
  if (!session || !store.isConfigured('private')) return false;
  try {
    const next = await store.updateJson('private', REVOKED_FILE, [], list => {
      const live = liveRevocations(list).filter(r => r.sid !== session.sid);
      return [...live, { sid: session.sid, expires: session.expires }];
    }, 'console: sign-out (session revoked)');
    revokedCache = { at: Date.now(), ids: new Set(next.map(r => r.sid)) };
    return true;
  } catch (err) {
    console.error('Revoking the console session failed:', err.message);
    return false;
  }
}

function notFound(res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).json({ ok: false, error: 'Not found' });
}

// Call at the top of every protected handler: `if (!(await requireSession(req, res))) return;`
async function requireSession(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (await hasSession(req)) return true;
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

module.exports = { secret, passkeyMatches, credentialsMatch, hasSession, startSession, endSession, requireSession, notFound, jsonBody };
