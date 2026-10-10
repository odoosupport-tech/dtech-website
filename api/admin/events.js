// /api/admin/events: event management for the console (session required).
//
//   GET                     { ok, canSave, mailConfigured, events: [...full, with attendees], payment }
//   GET ?export=<event id>  that event's attendees as a CSV download (formula-safe)
//   POST { action, ... }    every change answers { ok, events, payment, ...extras } with the
//                           committed state, or { ok: false, error, field? }
//
//     save          { id?, item: { title, description, startLocal, endLocal?, deadlineLocal?, timezone,
//                     capacity, mode, publicLocation, accessDetails, admission, feeInr? } }  creates a draft or edits
//     status        { id, to: "published"|"draft"|"cancelled" }
//     delete        { id }                       only a draft with no registrations
//     payment       { item: { payeeName, upiId, instructions, qr: { mode, dataBase64? } } }
//     confirm       { id, ticketId }             pending → confirmed, then emails the ticket
//     resend        { id, ticketId }             emails a confirmed attendee's ticket again
//     release       { id, ticketId }             frees the seat (record kept, marked cancelled)
//
// These records are read live from the private repository by the public API, so
// a change here is visible on the website at once: no commit to the site, no redeploy.

const events = require('../_events');
const mail = require('../_mail');
const { requireSession, readSession, jsonBody } = require('../_admin');
const { allowedOrigin, clean } = require('../_http');

const ACTIONS = ['save', 'status', 'delete', 'payment', 'confirm', 'resend', 'release'];

function failure(res, err) {
  if (err instanceof events.EventError) {
    return res.status(err.status).json({ ok: false, error: err.message, ...(err.field ? { field: err.field } : {}), ...(err.code ? { code: err.code } : {}) });
  }
  console.error('Event change failed:', err.message);
  const busy = /changed too often/.test(err.message);
  return res.status(503).json({
    ok: false,
    error: busy ? 'Someone else was saving at the same moment, so your change was not saved. Please try again.' : 'Your change could not be saved. Please try again in a minute.',
  });
}

function snapshot(doc, extra) {
  return { ok: true, canSave: true, mailConfigured: mail.isConfigured(), ...events.adminSnapshot(doc), ...extra };
}

function ids(body, needTicket) {
  const eventId = clean(body.id, 40);
  if (!events.EVENT_ID_RE.test(eventId)) throw new events.EventError('Unknown event.', { status: 404 });
  if (!needTicket) return { eventId };
  const ticketId = clean(body.ticketId, 20);
  if (!events.TICKET_ID_RE.test(ticketId)) throw new events.EventError('Unknown registration.', { status: 404 });
  return { eventId, ticketId };
}

async function handleGet(req, res) {
  if (!events.isStorageReady()) {
    return res.status(200).json({ ok: true, canSave: false, mailConfigured: mail.isConfigured(), ...events.adminSnapshot({ settings: { payment: {} }, events: [] }) });
  }
  const doc = await events.readDoc();
  const exportId = req.query && req.query.export;
  if (exportId) {
    const event = events.findEvent(doc, String(exportId));
    if (!event) return res.status(404).json({ ok: false, error: 'Unknown event.' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendees-${event.id}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send(events.attendeesCsv(event));
  }
  return res.status(200).json(snapshot(doc));
}

async function handlePost(req, res) {
  const body = jsonBody(req);
  if (!ACTIONS.includes(body.action)) return res.status(400).json({ ok: false, error: 'Unknown action.' });
  if (!events.isStorageReady()) {
    return res.status(503).json({ ok: false, error: 'Event storage is not set up yet. Ask your website administrator to finish the private storage setup (GITHUB_DATA_REPO).' });
  }
  const session = readSession(req);
  const actor = `console:${session ? session.sid.slice(0, 8) : 'unknown'}`;
  const item = body.item && typeof body.item === 'object' && !Array.isArray(body.item) ? body.item : {};

  if (body.action === 'save') {
    const eventId = body.id ? ids(body, false).eventId : undefined;
    const { doc, eventId: savedId } = await events.saveEvent({ id: eventId, item });
    return res.status(200).json(snapshot(doc, { eventId: savedId }));
  }
  if (body.action === 'status') {
    const { eventId } = ids(body, false);
    return res.status(200).json(snapshot(await events.setEventStatus({ id: eventId, to: clean(body.to, 20) })));
  }
  if (body.action === 'delete') {
    const { eventId } = ids(body, false);
    return res.status(200).json(snapshot(await events.deleteEvent({ id: eventId })));
  }
  if (body.action === 'payment') {
    return res.status(200).json(snapshot(await events.savePayment({ item })));
  }
  const { eventId, ticketId } = ids(body, true);
  if (body.action === 'release') {
    const { doc } = await events.releaseRegistration({ eventId, ticketId, actor });
    return res.status(200).json(snapshot(doc));
  }
  if (body.action === 'confirm') {
    const result = await events.confirmPayment({ eventId, ticketId, actor });
    // Only the request that made the change sends the ticket; repeating it is a no-op.
    if (!result.transitioned) {
      const mailState = result.attendee.mail ? result.attendee.mail.state : 'not sent';
      return res.status(200).json(snapshot(result.doc, { alreadyConfirmed: true, ticketId, delivery: { kind: 'ticket', state: mailState } }));
    }
    const sent = await events.sendFor(result.event, result.attendee);
    return res.status(200).json(snapshot(sent.doc || result.doc, { alreadyConfirmed: false, ticketId, delivery: { kind: sent.kind, state: sent.state } }));
  }
  // resend
  const doc = await events.readDoc();
  const { event, attendee } = events.locate(doc, eventId, ticketId);
  if (event.status === 'cancelled') throw new events.EventError('This event is cancelled, so tickets are no longer sent.', { status: 409 });
  if (attendee.status !== 'confirmed') throw new events.EventError('Only a confirmed registration has a ticket to send. Confirm the payment first.', { status: 409 });
  const sent = await events.sendFor(event, attendee);
  return res.status(200).json(snapshot(sent.doc || doc, { ticketId, delivery: { kind: sent.kind, state: sent.state } }));
}

module.exports = async function handler(req, res) {
  if (!(await requireSession(req, res))) return;
  try {
    if (req.method === 'GET') {
      try {
        return await handleGet(req, res);
      } catch (err) {
        console.error('Loading events failed:', err.message);
        return res.status(502).json({ ok: false, error: 'The latest events could not be loaded. Please try again in a minute.' });
      }
    }
    if (req.method === 'POST') {
      if (!allowedOrigin(req)) return res.status(403).json({ ok: false, error: 'Forbidden' });
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
        return res.status(415).json({ ok: false, error: 'Unsupported content type' });
      }
      return await handlePost(req, res);
    }
  } catch (err) {
    return failure(res, err);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
