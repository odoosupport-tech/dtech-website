// Vercel Routing Middleware: the case-study PDFs are lead-gated. A request for
// any file under /assets/case-studies/pdf/ must carry a signed, unexpired
// ?t=<expiry>.<signature> made by api/_pdf-link.js (sent in the visitor's email,
// used by the site to attach the PDF, or issued to console users). Anything else,
// including old addresses search engines still list, goes to the case-study page,
// where the form emails the PDF.
//
// Runs on the Edge runtime, so it signs with Web Crypto rather than node:crypto.
// Fails closed: without PDF_LINK_SECRET / ADMIN_SECRET no PDF is served.

export const config = { matcher: '/assets/case-studies/pdf/:path*' };

const KEY_LABEL = 'dtech-case-study-pdf-link-v1'; // must match api/_pdf-link.js
const TOKEN_RE = /^(\d{13,16})\.([A-Za-z0-9_-]{43})$/;

const encoder = new TextEncoder();

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
  const secret = process.env.PDF_LINK_SECRET || process.env.ADMIN_SECRET || '';
  if (await validPdfToken(url.pathname, url.searchParams.get('t'), secret)) return undefined; // serve the file
  return Response.redirect(new URL('/case-studies', url), 302);
}
