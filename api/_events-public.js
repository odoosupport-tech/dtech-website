// /api/events: the public events API (listing, detail and registration).
//
// Not a function of its own (the project is at Vercel Hobby's limit of 12, counting
// middleware.js): vercel.json rewrites /api/events to api/content.js?list=events,
// which hands the request to this module.
//
//   GET                 { ok, events: [...], payment, generatedAt }
//                       Published events that are upcoming or just over, plus recently
//                       cancelled ones, as explicit public fields only. Read live from the
//                       private store, so a newly published event shows on the next fetch.
//                       Cached by the CDN for 10 seconds to spare the GitHub quota.
//   GET ?id=<event>     { ok, event, payment } for one event, or 404
//   GET ?qr=1           the UPI QR image the admin uploaded (payment instructions)
//   POST                register: { eventId, requestId, name, email, phone, organization?,
//                       paymentReference? (paid events), website (bot trap), formStart }
//                       200 { ok, repeated, status, ticket, delivery } once the registration
//                       is SAVED. 409 for full / closed / cancelled / duplicate, 503 when it
//                       could not be saved (nothing was registered).
//
// Never returned: attendees, contact details, payment references, the confidential
// meeting/access details (only a confirmed attendee's own ticket carries them), draft
// events, repository details. See api/_events.js for the stored shape.

const events = require('./_events');
const { createRateLimiter, allowedOrigin, submittedTooFast, emailProblem, emailDomainProblem } = require('./_http');

const overLimit = createRateLimiter();
const LIVE_CACHE = 'public, max-age=0, s-maxage=10';
const UNAVAILABLE = 'Events are unavailable right now. Please try again in a minute.';

function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

function fail(res, status, error, extra) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ ok: false, error, ...extra });
}

async function handleGet(req, res) {
  const ip = clientIp(req);
  if (overLimit(`read:${ip}`, 120, 60 * 1000)) return fail(res, 429, 'Too many requests. Please wait a moment.');
  if (!events.isStorageReady()) return fail(res, 503, UNAVAILABLE, { unavailable: true });
  let doc;
  try {
    doc = await events.readDoc();
  } catch (err) {
    console.error('Reading events failed:', err.message);
    return fail(res, 503, UNAVAILABLE, { unavailable: true });
  }
  const query = req.query || {};

  if (query.qr) {
    const qr = doc.settings.payment.qr;
    if (!qr || !qr.dataBase64) return fail(res, 404, 'Not found');
    res.setHeader('Content-Type', qr.type);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(Buffer.from(qr.dataBase64, 'base64'));
  }
  if (query.id) {
    const id = String(query.id);
    const found = events.EVENT_ID_RE.test(id) ? events.publicDetail(doc, id) : null;
    if (!found) return fail(res, 404, 'This event is not available.');
    res.setHeader('Cache-Control', LIVE_CACHE);
    return res.status(200).json({ ok: true, ...found });
  }
  res.setHeader('Cache-Control', LIVE_CACHE);
  return res.status(200).json({ ok: true, ...events.publicListing(doc), generatedAt: new Date().toISOString() });
}

function deliveryView(sent, attendee) {
  return { kind: sent.kind, state: sent.state, email: attendee.email };
}

async function handlePost(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!allowedOrigin(req)) return fail(res, 403, 'Forbidden');
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return fail(res, 415, 'Unsupported content type');
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  // Unlike the contact form, a trapped request is refused rather than "accepted":
  // nothing may claim a registration that was not saved.
  if (body.website) return fail(res, 400, 'Your registration could not be processed.');
  if (submittedTooFast(body)) return fail(res, 400, 'That was very quick. Please check your details and press Register again.');

  let input;
  try {
    input = events.validateRegistration(body);
    const problem = emailProblem(input.email);
    if (problem) throw new events.EventError(problem, { field: 'email' });
  } catch (err) {
    if (err instanceof events.EventError) return fail(res, err.status, err.message, { ...(err.field ? { field: err.field } : {}), ...(err.code ? { code: err.code } : {}) });
    throw err;
  }
  if (overLimit(`ip:${clientIp(req)}`, 30, 10 * 60 * 1000) || overLimit(`email:${input.email}`, 5, 60 * 60 * 1000)) {
    return fail(res, 429, 'Too many registration attempts. Please try again later.');
  }
  const domainProblem = await emailDomainProblem(input.email);
  if (domainProblem) return fail(res, 400, domainProblem, { field: 'email' });
  if (!events.isStorageReady()) return fail(res, 503, 'Registration is unavailable right now. Nothing was saved. Please try again later.', { unavailable: true });

  let result;
  try {
    result = await events.register(input);
  } catch (err) {
    if (err instanceof events.EventError) return fail(res, err.status, err.message, { ...(err.field ? { field: err.field } : {}), ...(err.code ? { code: err.code } : {}) });
    console.error('Event registration not saved:', err.message);
    const busy = /changed too often/.test(err.message);
    return fail(res, 503, busy
      ? 'Many people are registering at once and your registration was not saved. Please press Register again.'
      : 'We could not save your registration. Nothing was saved; please try again in a minute.', { retryable: true });
  }

  // The registration is saved; only now does email go out (within a deadline,
  // awaited so Vercel cannot freeze the function mid-send).
  const { event, attendee, repeated } = result;
  const kind = attendee.status === 'confirmed' ? 'ticket' : 'acknowledgement';
  let delivery;
  if (!repeated || events.canAttemptMail(attendee, kind)) {
    const sent = await events.sendFor(event, attendee);
    delivery = deliveryView(sent, attendee);
  } else {
    delivery = { kind, state: attendee.mail ? attendee.mail.state : 'failed', email: attendee.email };
  }
  return res.status(200).json({ ok: true, repeated, status: attendee.status, ticket: events.ticketView(event, attendee), delivery });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
  } catch (err) {
    console.error('Events API error:', err.message);
    return fail(res, 500, 'Something went wrong. Please try again.');
  }
  res.setHeader('Allow', 'GET, POST');
  return fail(res, 405, 'Method not allowed');
};
