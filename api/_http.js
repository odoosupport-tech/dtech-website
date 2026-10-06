// Shared request-handling helpers for the Vercel functions (contact, apply,
// send-whitepaper): origin/CSRF check, string sanitizing and a best-effort
// rate limiter. Nothing here holds state across modules — see createRateLimiter.

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

// Best-effort abuse brake. Call this once per module so each endpoint keeps
// its own independent counters — instances are short-lived and not shared,
// so this only slows bursts; add a CAPTCHA or a shared store for stronger
// protection.
function createRateLimiter() {
  const hits = new Map();
  const MAX_KEYS = 5000;
  return function overLimit(key, max, windowMs) {
    const now = Date.now();
    const entry = hits.get(key);
    const recent = (entry ? entry.times : []).filter(t => now - t < windowMs);
    // Rejected requests do not grow the array or reset the window.
    if (recent.length >= max) return true;
    if (!entry && hits.size >= MAX_KEYS) {
      for (const [id, value] of hits) {
        if (value.expires <= now) hits.delete(id);
      }
      // Saturation must not erase the counters of callers already limited.
      if (hits.size >= MAX_KEYS) return true;
    }
    recent.push(now);
    hits.set(key, { times: recent, expires: now + windowMs });
    return false;
  };
}

function allowedOrigin(req) {
  const value = req.headers.origin;
  if (typeof value !== 'string') return false;
  let origin;
  try {
    origin = new URL(value);
    if (!['https:', 'http:'].includes(origin.protocol) || value !== origin.origin) return false;
  } catch (e) { return false; }
  // Vercel terminates TLS before the function. Else use the actual connection;
  // header-only test requests default to HTTPS. Never trust a caller-supplied
  // X-Forwarded-Host to introduce another allowed origin.
  const protocol = process.env.VERCEL || !req.socket || req.socket.encrypted ? 'https:' : 'http:';
  if (origin.origin === `${protocol}//${req.headers.host}`) return true;
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
    .includes(origin.origin);
}

// Real visitors need a few seconds to fill in a form; scripts post within milliseconds.
// The page sends the time it loaded as "formStart" (epoch ms). A missing or
// implausible value is allowed, so pages cached before this check keep working.
const MIN_FILL_MS = 3000;

function submittedTooFast(body) {
  const start = Number(body && body.formStart);
  if (!Number.isFinite(start)) return false;
  const elapsed = Date.now() - start;
  return elapsed >= 0 && elapsed < MIN_FILL_MS;
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

module.exports = { EMAIL_RE, createRateLimiter, allowedOrigin, submittedTooFast, esc, clean };
