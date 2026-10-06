// Vercel Routing Middleware: protect internal files before static routing,
// including aliases containing encoded slashes that bypass redirect patterns.
// The case-study PDFs are lead-gated. A request for
// any file under /assets/case-studies/pdf/ must carry a signed, unexpired
// ?t=<expiry>.<signature> made by api/_pdf-link.js (sent in the visitor's email,
// used by the site to attach the PDF, or issued to console users). Anything else,
// including old addresses search engines still list, goes to the case-study page,
// where the form emails the PDF.
//
// Runs on the Edge runtime, so it signs with Web Crypto rather than node:crypto.
// Fails closed: without PDF_LINK_SECRET / ADMIN_SECRET no PDF is served.

export const config = { matcher: '/:path*' };

const KEY_LABEL = 'dtech-case-study-pdf-link-v1'; // must match api/_pdf-link.js
const TOKEN_RE = /^(\d{13,16})\.([A-Za-z0-9_-]{43})$/;

const encoder = new TextEncoder();

const INTERNAL_DIRS = new Set([
  'data', 'docs', 'tools', 'graphify-out', '.portal-data', '.git', '.vercel',
  '.claude', '.codex', '.agents', '.aws', '.superpowers', '~',
]);
const INTERNAL_FILES = new Set([
  'middleware.js', 'vercel.json', 'README.md', 'package.json', 'package-lock.json',
  'purgecss.config.js', '.gitignore', '.gitattributes', '.vercelignore',
]);

// Check the path the router can ultimately resolve, not only its encoded text.
// Fail closed on malformed or excessively nested encodings. No decoded path is
// used as a redirect destination or filesystem path.
export function canonicalPathname(pathname) {
  let decoded = pathname;
  try {
    for (let i = 0; i < 8; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (i === 7 && /%[0-9a-f]{2}/i.test(decoded)) return null;
    }
  } catch (_) { return null; }
  if (/[\x00-\x1f\x7f]/.test(decoded)) return null;
  const parts = [];
  for (const part of decoded.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return '/' + parts.join('/');
}

function internalPath(pathname) {
  const parts = pathname.slice(1).split('/');
  if (INTERNAL_DIRS.has(parts[0]) || /^\.env(?:\.|$)/.test(parts[0])) return true;
  if (parts.length === 1 && INTERNAL_FILES.has(parts[0])) return true;
  return parts[0] === 'api' && (
    /\.(?:js|json)$/i.test(parts.at(-1)) ||
    (parts[1] || '').startsWith('_') ||
    (parts[1] === 'admin' && (parts[2] || '').startsWith('_'))
  );
}

function denied(status) {
  return new Response(status === 400 ? 'Invalid path' : 'Not found', {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Compares every character, so the time taken does not reveal how much matched.
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function validPdfToken(pathname, token, secret, now = Date.now()) {
  if (!secret || secret.length < 16 || typeof token !== 'string') return false;
  const m = TOKEN_RE.exec(token);
  if (!m || Number(m[1]) <= now) return false;
  const key = await hmac(encoder.encode(secret), KEY_LABEL);
  const expected = base64url(await hmac(key, `${pathname}:${m[1]}`));
  return sameText(expected, m[2]);
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = canonicalPathname(url.pathname);
  if (pathname === null) return denied(400);
  if (internalPath(pathname)) return denied(404);
  if (pathname !== '/assets/case-studies/pdf' && !pathname.startsWith('/assets/case-studies/pdf/')) return undefined;
  const secret = process.env.PDF_LINK_SECRET || process.env.ADMIN_SECRET || '';
  if (await validPdfToken(url.pathname, url.searchParams.get('t'), secret)) return undefined; // serve the file
  return new Response(null, { status: 302, headers: { Location: new URL('/case-studies', url).href, 'Cache-Control': 'no-store' } });
}
