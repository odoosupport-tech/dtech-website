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

// ── Contact details checks (case-study requests) ────────────────────

// Misspellings of the big free-mail domains that still resolve (typo-squatted
// or parked), so the DNS check alone would let them through.
const DOMAIN_TYPOS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com',
  'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com',
  'rediffmai.com': 'rediffmail.com', 'redifmail.com': 'rediffmail.com',
};

// Stricter than EMAIL_RE: a dotted domain with real labels and no empty parts.
const STRICT_EMAIL_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}(?<!\.)@(?=.{4,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

// Message for a badly formed or misspelled address, or '' when it looks right.
function emailProblem(email) {
  const value = String(email || '').trim();
  if (!STRICT_EMAIL_RE.test(value)) return 'Please enter a valid email address, e.g. name@company.com.';
  const [local, domain] = [value.slice(0, value.lastIndexOf('@')), value.slice(value.lastIndexOf('@') + 1).toLowerCase()];
  if (DOMAIN_TYPOS[domain]) return `Please check the email address. Did you mean ${local}@${DOMAIN_TYPOS[domain]}?`;
  return '';
}

// The mobile number as +<country><number>, or '' when it is not a usable mobile.
// Indian numbers (10 digits starting 6–9, with or without +91 or a leading 0);
// other countries need the + and country code (8–15 digits in all).
function normalizeMobile(phone) {
  const raw = String(phone || '').trim();
  if (!raw || /[^\d\s()+.-]/.test(raw) || raw.indexOf('+') > 0) return '';
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    if (digits.startsWith('91')) return /^91[6-9]\d{9}$/.test(digits) ? `+${digits}` : '';
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : '';
  }
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : '';
}

// Whether the email's domain can receive mail. Resolves to a message when the
// domain does not exist or publishes "no mail" (null MX), else ''. DNS that is
// slow or failing never blocks a visitor: only a definite answer does.
let dnsResolver = require('dns').promises;
function setDnsResolver(resolver) { dnsResolver = resolver; }

const NO_DOMAIN = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);
async function emailDomainProblem(email, timeoutMs = 2500) {
  const domain = String(email || '').split('@').pop().toLowerCase();
  const message = `We could not find the email domain "${domain}". Please check the address.`;
  const lookup = async () => {
    try {
      const mx = await dnsResolver.resolveMx(domain);
      if (mx.length && mx.every(r => !r.exchange || r.exchange === '.')) return `The domain "${domain}" does not accept email. Please use another address.`;
      if (mx.length) return '';
    } catch (err) {
      if (!NO_DOMAIN.has(err.code)) return '';
    }
    // No MX: mail falls back to the domain's own address records.
    for (const method of ['resolve4', 'resolve6']) {
      try {
        if ((await dnsResolver[method](domain)).length) return '';
      } catch (err) {
        if (!NO_DOMAIN.has(err.code)) return '';
      }
    }
    return message;
  };
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(''), timeoutMs); });
  try {
    return await Promise.race([lookup(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { EMAIL_RE, createRateLimiter, allowedOrigin, submittedTooFast, esc, clean, emailProblem, normalizeMobile, emailDomainProblem, setDnsResolver };
