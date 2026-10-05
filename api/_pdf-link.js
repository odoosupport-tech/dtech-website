// Signed, expiring links to the case-study PDFs this site holds under
// assets/case-studies/pdf/. middleware.js turns away any request for those files
// without a valid link, so a PDF reaches a visitor only through the email sent
// after the request form (and to signed-in console users via api/admin/data).
//
// A link carries ?t=<expiry ms>.<signature>, the signature being a base64url
// HMAC-SHA256 of "<path>:<expiry>" under a key derived from the secret below.
// middleware.js checks it with Web Crypto; the two must stay in step (the test
// suite signs here and verifies there).
//
//   PDF_LINK_SECRET  optional  signing secret, at least 16 characters (default:
//                              ADMIN_SECRET). Changing it voids links already sent.

const crypto = require('crypto');

const PDF_PREFIX = 'assets/case-studies/pdf/';
const KEY_LABEL = 'dtech-case-study-pdf-link-v1';
const EMAIL_LINK_MS = 14 * 24 * 60 * 60 * 1000; // the download link in a visitor's email
const FETCH_LINK_MS = 10 * 60 * 1000; // this site fetching its own PDF, or a console click

function linkSecret() {
  const s = process.env.PDF_LINK_SECRET || process.env.ADMIN_SECRET || '';
  return s.length >= 16 ? s : null;
}

// The URL path of a site file, each segment percent-encoded as browsers send it.
function urlPath(file) {
  return '/' + String(file).split('/').map(encodeURIComponent).join('/');
}

function signature(secret, pathname, expires) {
  const key = crypto.createHmac('sha256', secret).update(KEY_LABEL).digest();
  return crypto.createHmac('sha256', key).update(`${pathname}:${expires}`).digest('base64url');
}

// The site-relative, signed URL of a PDF under assets/case-studies/pdf/, valid for
// ttlMs. Throws when no secret is set: an unsigned link would only be turned away.
function signedPdfPath(file, ttlMs, now = Date.now()) {
  if (!String(file).startsWith(PDF_PREFIX)) throw new Error(`not a gated case-study PDF: ${file}`);
  const secret = linkSecret();
  if (!secret) throw new Error('PDF links cannot be signed: set PDF_LINK_SECRET or ADMIN_SECRET (16+ characters)');
  const pathname = urlPath(file);
  const expires = String(now + ttlMs);
  return `${pathname}?t=${expires}.${signature(secret, pathname, expires)}`;
}

const canSignPdfLinks = () => linkSecret() !== null;

module.exports = { PDF_PREFIX, KEY_LABEL, EMAIL_LINK_MS, FETCH_LINK_MS, signedPdfPath, canSignPdfLinks };
