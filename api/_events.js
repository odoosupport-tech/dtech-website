// Events and registrations: the model, validation and storage rules shared by
// the public API (api/_events-public.js, served as /api/events) and the management console API
// (api/admin/_events-admin.js, served through api/admin/data.js and update.js).
//
// Everything lives in ONE document in the private data repository, events.json:
//
//   {
//     version: 1,
//     settings: { payment: { payeeName, upiId, instructions, qr?: { type, dataBase64 } } },
//     events: [{
//       id, title, description, status: "draft"|"published"|"cancelled",
//       startsAt, endsAt?, registrationDeadline            ISO instants (UTC)
//       timezone,                                          IANA name the times were entered in
//       mode: "online"|"offline", publicLocation,          public text
//       accessDetails,                                     CONFIDENTIAL: meeting link / joining notes
//       admission: "free"|"paid", feePaise,                paid events: whole paise (INR)
//       capacity,
//       createdAt, updatedAt, publishedAt?, cancelledAt?,
//       attendees: [{
//         ticketId, requestId, name, email, phone, organization,
//         status: "confirmed"|"pending_verification"|"cancelled",
//         paymentReference, registeredAt, confirmedAt?, confirmedBy?,
//         cancelledAt?, cancelledBy?,
//         mail?: { kind: "ticket"|"acknowledgement", state: "sent"|"failed"|"not_configured", at, attempts, error? }
//       }]
//     }]
//   }
//
// One document means publication, capacity and duplicate checks, and the
// registration write itself share a single SHA-protected commit
// (store.updateJson). Each mutation callback re-reads the latest document, so a
// lost race simply re-runs it against the winner's data. Callbacks may run more
// than once: they hold no email sends or other side effects, and every id and
// timestamp is generated before the callback.
//
// Limits: this is a GitHub file, not a database. The whole document is read and
// rewritten on each change, every change is a commit, and simultaneous writers
// retry (4 attempts) before the visitor is asked to try again. That is fine for
// a few hundred registrations an hour at most; see README "Events".

const crypto = require('crypto');
const store = require('./_store');
const mail = require('./_mail');
const { esc, clean, normalizeMobile } = require('./_http');

const FILE = 'events.json';
const EVENT_STATUSES = ['draft', 'published', 'cancelled'];
const ACTIVE_STATUSES = ['confirmed', 'pending_verification'];
const MAX_CAPACITY = 5000;
const MAX_FEE_PAISE = 100000000; // INR 10,00,000
const MAX_EVENT_DAYS = 14;
const MAX_MAIL_ATTEMPTS = 3;
const ENDED_VISIBLE_MS = 24 * 60 * 60 * 1000;
const CANCELLED_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const EVENT_ID_RE = /^evt-[a-f0-9]{10}$/;
const TICKET_ID_RE = /^DT-[A-Z2-7]{10}$/;
const LOCAL_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const UPI_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,40}$/;
const PAYMENT_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9/_-]{5,39}$/;
const MAX_QR_BYTES = 150 * 1024;

class EventError extends Error {
  // status: HTTP status for the API; field: the form field to fix; code: stable machine name.
  constructor(message, { status = 400, field, code } = {}) {
    super(message);
    this.status = status;
    this.field = field;
    this.code = code;
  }
}

// ── Text and time helpers ───────────────────────────────────────────────

function multiline(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim().slice(0, max);
}

// Reads one text field; too long or (when required) empty is an error naming the field.
function text(input, key, label, max, { required = false, lines = false } = {}) {
  const value = (lines ? multiline : clean)(input[key], max + 1);
  if (value.length > max) throw new EventError(`${label[0].toUpperCase()}${label.slice(1)} is too long: keep it to ${max} characters.`, { field: key });
  if (required && !value) throw new EventError(`Please fill in ${label}.`, { field: key });
  return value;
}

// Links in free text must be http(s). Anything else with a scheme (javascript:,
// data:, file:, ftp://…) is refused, so a pasted link can never run script.
const SCHEME_RE = /(^|[\s(<"'])([a-z][a-z0-9+.-]*):(\/\/)?/gi;
function assertWebLinksOnly(value, key, label) {
  SCHEME_RE.lastIndex = 0;
  let m;
  while ((m = SCHEME_RE.exec(value))) {
    const scheme = m[2].toLowerCase();
    const isUrl = Boolean(m[3]);
    const dangerous = ['javascript', 'data', 'vbscript', 'file', 'blob', 'about'].includes(scheme);
    if ((isUrl && scheme !== 'http' && scheme !== 'https') || dangerous) {
      throw new EventError(`${label[0].toUpperCase()}${label.slice(1)} may only contain http:// or https:// links.`, { field: key });
    }
  }
}

function validTimeZone(tz) {
  if (typeof tz !== 'string' || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) && tz !== 'UTC') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (err) {
    return false;
  }
}

// Offset of tz from UTC at an instant, in ms (positive east of Greenwich).
function zoneOffsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const n = type => Number(parts.find(p => p.type === type).value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(utcMs / 1000) * 1000;
}

// "2026-11-14T10:00" typed in tz → the UTC instant in ms, or NaN when the date
// does not exist (30 February), is outside 2000-2100, or falls in a daylight-
// saving gap where that wall-clock time never happens.
function localToUtcMs(local, tz) {
  const m = LOCAL_TIME_RE.exec(String(local || ''));
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (y < 2000 || y > 2100) return NaN;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h || check.getUTCMinutes() !== mi) return NaN;
  let utc = wall - zoneOffsetMs(wall, tz);
  utc = wall - zoneOffsetMs(utc, tz);
  return utc + zoneOffsetMs(utc, tz) === wall ? utc : NaN;
}

function utcToLocalInput(iso, tz) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + zoneOffsetMs(ms, tz)).toISOString().slice(0, 16);
}

function when(input, key, label, tz, { required = false } = {}) {
  const raw = clean(input[key], 20);
  if (!raw) {
    if (required) throw new EventError(`Please enter ${label}.`, { field: key });
    return null;
  }
  const ms = localToUtcMs(raw, tz);
  if (!Number.isFinite(ms)) throw new EventError(`Please enter a valid ${label}. That date or time does not exist in ${tz}.`, { field: key });
  return ms;
}

function parseFeePaise(value) {
  const raw = String(value == null ? '' : value).trim().replace(/^(?:₹|INR|Rs\.?)\s*/i, '').replace(/,/g, '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw)) return NaN;
  const [rupees, paise = ''] = raw.split('.');
  return Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
}

// ── Document access ─────────────────────────────────────────────────────

function emptyDoc() {
  return { version: 1, settings: { payment: {} }, events: [] };
}

function normalizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDoc();
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  return {
    ...raw,
    version: 1,
    settings: { ...settings, payment: settings.payment && typeof settings.payment === 'object' ? settings.payment : {} },
    events: (Array.isArray(raw.events) ? raw.events : []).filter(e => e && typeof e === 'object').map(e => ({ ...e, attendees: Array.isArray(e.attendees) ? e.attendees : [] })),
  };
}

async function readDoc() {
  return normalizeDoc(await store.readJson('private', FILE, null));
}

// Re-reads the latest document, lets apply() change it, and commits with the
// SHA of what was read. apply returns false when nothing changed (no commit).
// Resolves with the committed document.
async function mutateDoc(apply, commitMessage) {
  const committed = await store.updateJson('private', FILE, null, raw => {
    const doc = normalizeDoc(raw);
    return apply(doc) === false ? store.UNCHANGED : doc;
  }, commitMessage);
  return normalizeDoc(committed);
}

function isStorageReady() {
  return store.isConfigured('private');
}

function activeAttendees(event) {
  return event.attendees.filter(a => ACTIVE_STATUSES.includes(a.status));
}

function findEvent(doc, id) {
  return doc.events.find(e => e.id === id) || null;
}

function locate(doc, eventId, ticketId) {
  const event = findEvent(doc, eventId);
  if (!event) throw new EventError('That event no longer exists. Refresh the list.', { status: 404, code: 'not_found' });
  const attendee = event.attendees.find(a => a.ticketId === ticketId);
  if (!attendee) throw new EventError('That registration no longer exists. Refresh the list.', { status: 404, code: 'not_found' });
  return { event, attendee };
}

// ── Event state ─────────────────────────────────────────────────────────

// What a visitor can do with a published or cancelled event right now.
function stateOf(event, nowMs) {
  if (event.status === 'cancelled') return 'cancelled';
  const start = Date.parse(event.startsAt);
  const deadline = Date.parse(event.registrationDeadline || event.startsAt);
  if (nowMs >= start || nowMs >= deadline) return 'closed';
  return activeAttendees(event).length >= event.capacity ? 'sold_out' : 'open';
}

function countsOf(event) {
  const active = activeAttendees(event);
  return {
    confirmed: active.filter(a => a.status === 'confirmed').length,
    pending: active.filter(a => a.status === 'pending_verification').length,
    active: active.length,
    seatsLeft: Math.max(0, event.capacity - active.length),
  };
}

// ── Payment settings ────────────────────────────────────────────────────

const IMAGE_TYPES = [
  { type: 'image/png', test: b => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/jpeg', test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/webp', test: b => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

// What a paid event still needs before it can be published; [] when complete.
function paymentGaps(payment) {
  const p = payment || {};
  const gaps = [];
  if (!p.payeeName) gaps.push('the payee name');
  if (!p.upiId && !(p.qr && p.qr.dataBase64)) gaps.push('a UPI ID or a UPI QR code');
  return gaps;
}

function paymentFrom(input, existing) {
  const payeeName = text(input, 'payeeName', 'the payee name', 80);
  const upiId = text(input, 'upiId', 'the UPI ID', 80);
  if (upiId && !UPI_RE.test(upiId)) throw new EventError('That UPI ID does not look right. It looks like name@bank.', { field: 'upiId' });
  const instructions = text(input, 'instructions', 'the payment instructions', 600, { lines: true });
  assertWebLinksOnly(instructions, 'instructions', 'the payment instructions');

  let qr = existing && existing.qr ? existing.qr : undefined;
  const change = input.qr && typeof input.qr === 'object' ? input.qr : { mode: 'keep' };
  if (change.mode === 'remove') qr = undefined;
  else if (change.mode === 'upload') {
    const base64 = String(change.dataBase64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new EventError('The QR image could not be read. Please choose the file again.', { field: 'qr' });
    if (Math.floor(base64.length * 3 / 4) > MAX_QR_BYTES) throw new EventError('The QR image is larger than 150 KB. Resize or compress it and try again.', { field: 'qr', status: 413 });
    const kind = IMAGE_TYPES.find(t => t.test(Buffer.from(base64, 'base64')));
    if (!kind) throw new EventError('The QR image must be a PNG, JPG or WebP file.', { field: 'qr' });
    qr = { type: kind.type, dataBase64: base64, version: crypto.createHash('sha256').update(base64).digest('hex').slice(0, 10) };
  } else if (change.mode !== 'keep') {
    throw new EventError('Please choose a QR option.', { field: 'qr' });
  }
  return { payeeName, upiId, instructions, ...(qr ? { qr } : {}) };
}

// ── Event fields ────────────────────────────────────────────────────────

function eventFields(input, existing, nowMs) {
  const timezone = clean(input.timezone || (existing && existing.timezone) || DEFAULT_TIMEZONE, 60);
  if (!validTimeZone(timezone)) throw new EventError('Please choose a valid time zone.', { field: 'timezone' });

  const title = text(input, 'title', 'the event title', 140, { required: true });
  if (title.length < 3) throw new EventError('The event title must be at least 3 characters.', { field: 'title' });
  const description = text(input, 'description', 'the description', 4000, { lines: true });

  const startMs = when(input, 'startLocal', 'the start date and time', timezone, { required: true });
  let endMs = when(input, 'endLocal', 'the end date and time', timezone);
  let deadlineMs = when(input, 'deadlineLocal', 'the registration deadline', timezone);
  if (endMs !== null) {
    if (endMs <= startMs) throw new EventError('The event must end after it starts.', { field: 'endLocal' });
    if (endMs - startMs > MAX_EVENT_DAYS * 24 * 3600 * 1000) throw new EventError(`An event can run for ${MAX_EVENT_DAYS} days at most.`, { field: 'endLocal' });
  }
  if (deadlineMs === null) deadlineMs = startMs;
  if (deadlineMs > startMs) throw new EventError('Registration must close at or before the start time.', { field: 'deadlineLocal' });
  const startChanged = !existing || existing.startsAt !== new Date(startMs).toISOString();
  if (startChanged && startMs <= nowMs) throw new EventError('The start time must be in the future.', { field: 'startLocal' });

  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    throw new EventError(`Capacity must be a whole number from 1 to ${MAX_CAPACITY}.`, { field: 'capacity' });
  }

  const mode = clean(input.mode, 10);
  if (mode !== 'online' && mode !== 'offline') throw new EventError('Please choose online or offline.', { field: 'mode' });
  const publicLocation = text(input, 'publicLocation', 'the public location', 200);
  const accessDetails = text(input, 'accessDetails', 'the meeting or access details', 1000, { lines: true });
  assertWebLinksOnly(publicLocation, 'publicLocation', 'the public location');
  assertWebLinksOnly(accessDetails, 'accessDetails', 'the meeting or access details');
  assertWebLinksOnly(description, 'description', 'the description');

  const admission = clean(input.admission, 10);
  if (admission !== 'free' && admission !== 'paid') throw new EventError('Please choose free or paid admission.', { field: 'admission' });
  let feePaise = 0;
  if (admission === 'paid') {
    feePaise = parseFeePaise(input.feeInr);
    if (!Number.isFinite(feePaise) || feePaise < 100 || feePaise > MAX_FEE_PAISE) {
      throw new EventError('Enter the fee in rupees, from 1 to 10,00,000 (for example 500 or 499.50).', { field: 'feeInr' });
    }
  }

  const fields = {
    title, description, timezone, mode, publicLocation, accessDetails, admission, feePaise, capacity,
    startsAt: new Date(startMs).toISOString(),
    endsAt: endMs === null ? null : new Date(endMs).toISOString(),
    registrationDeadline: new Date(deadlineMs).toISOString(),
  };
  return fields;
}

// Rules that apply when an event goes live; they name what is missing.
// checkTimes is false when an already-published event is edited, so fixing a
// typo after registration has closed is still possible.
function assertPublishable(event, doc, nowMs, { checkTimes = true } = {}) {
  const problems = [];
  if (checkTimes && Date.parse(event.startsAt) <= nowMs) throw new EventError('The start time has passed. Edit the event before publishing it.', { field: 'startLocal' });
  if (checkTimes && Date.parse(event.registrationDeadline) <= nowMs) throw new EventError('The registration deadline has passed. Edit the event before publishing it.', { field: 'deadlineLocal' });
  if (event.mode === 'offline' && !event.publicLocation) problems.push('the venue (public location)');
  if (event.mode === 'online' && !event.accessDetails) problems.push('the meeting link or joining details');
  if (event.admission === 'paid') {
    const gaps = paymentGaps(doc.settings.payment);
    if (gaps.length) {
      throw new EventError(`This is a paid event, but the payment details are incomplete. Add ${gaps.join(' and ')} under Payment settings, then publish.`, { code: 'payment_config' });
    }
  }
  if (problems.length) throw new EventError(`Before publishing, add ${problems.join(' and ')}.`, { field: event.mode === 'offline' ? 'publicLocation' : 'accessDetails' });
}

// ── Public projections (explicit allowlists) ────────────────────────────

function publicEvent(event, nowMs) {
  const counts = countsOf(event);
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt || null,
    registrationDeadline: event.registrationDeadline,
    timezone: event.timezone,
    mode: event.mode,
    publicLocation: event.publicLocation,
    admission: event.admission,
    feeInr: event.admission === 'paid' ? event.feePaise / 100 : 0,
    capacity: event.capacity,
    seatsLeft: counts.seatsLeft,
    state: stateOf(event, nowMs),
  };
}

function publicPayment(payment) {
  if (paymentGaps(payment).length) return null;
  return {
    payeeName: payment.payeeName,
    upiId: payment.upiId || '',
    instructions: payment.instructions || '',
    qrUrl: payment.qr && payment.qr.dataBase64 ? `/api/events?qr=1&v=${payment.qr.version || '1'}` : null,
  };
}

// Published events that are upcoming or just finished, and recently cancelled
// ones (so a visitor with an old link sees "cancelled", not nothing).
function isListed(event, nowMs) {
  if (event.status === 'published') return nowMs < Date.parse(event.endsAt || event.startsAt) + ENDED_VISIBLE_MS;
  if (event.status === 'cancelled' && event.publishedAt) return nowMs < Date.parse(event.startsAt) + CANCELLED_VISIBLE_MS;
  return false;
}

function publicListing(doc, nowMs = Date.now()) {
  const events = doc.events.filter(e => isListed(e, nowMs)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const hasPaid = events.some(e => e.admission === 'paid' && e.status === 'published');
  return {
    events: events.map(e => publicEvent(e, nowMs)),
    payment: hasPaid ? publicPayment(doc.settings.payment) : null,
  };
}

function publicDetail(doc, id, nowMs = Date.now()) {
  const event = findEvent(doc, id);
  if (!event || !isListed(event, nowMs)) return null;
  return { event: publicEvent(event, nowMs), payment: event.admission === 'paid' && event.status === 'published' ? publicPayment(doc.settings.payment) : null };
}

// What the attendee may see about their own registration. Access details
// (meeting link, entry notes) are included for confirmed attendees only.
function ticketView(event, attendee) {
  const confirmed = attendee.status === 'confirmed';
  return {
    ticketId: attendee.ticketId,
    status: attendee.status,
    name: attendee.name,
    email: attendee.email,
    organization: attendee.organization,
    paymentReference: event.admission === 'paid' ? attendee.paymentReference : '',
    event: {
      id: event.id, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt || null, timezone: event.timezone,
      mode: event.mode, publicLocation: event.publicLocation, admission: event.admission, feeInr: event.admission === 'paid' ? event.feePaise / 100 : 0,
    },
    ...(confirmed && event.accessDetails ? { accessDetails: event.accessDetails } : {}),
  };
}

// ── Admin projections ───────────────────────────────────────────────────

function adminEvent(event, nowMs = Date.now()) {
  const tz = event.timezone || DEFAULT_TIMEZONE;
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    status: event.status,
    state: stateOf(event, nowMs),
    timezone: tz,
    startsAt: event.startsAt,
    endsAt: event.endsAt || null,
    registrationDeadline: event.registrationDeadline,
    startLocal: utcToLocalInput(event.startsAt, tz),
    endLocal: event.endsAt ? utcToLocalInput(event.endsAt, tz) : '',
    deadlineLocal: utcToLocalInput(event.registrationDeadline, tz),
    mode: event.mode,
    publicLocation: event.publicLocation,
    accessDetails: event.accessDetails,
    admission: event.admission,
    feeInr: event.admission === 'paid' ? event.feePaise / 100 : 0,
    capacity: event.capacity,
    counts: countsOf(event),
    attendeeTotal: event.attendees.length,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    publishedAt: event.publishedAt || null,
    cancelledAt: event.cancelledAt || null,
    attendees: event.attendees.slice().sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt))),
  };
}

function adminSnapshot(doc, nowMs = Date.now()) {
  const p = doc.settings.payment;
  return {
    events: doc.events.slice().sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).map(e => adminEvent(e, nowMs)),
    payment: { payeeName: p.payeeName || '', upiId: p.upiId || '', instructions: p.instructions || '', hasQr: Boolean(p.qr && p.qr.dataBase64), qrUrl: p.qr && p.qr.dataBase64 ? `/api/events?qr=1&v=${p.qr.version || '1'}` : null, gaps: paymentGaps(p) },
  };
}

// ── Admin mutations ─────────────────────────────────────────────────────

function newEventId() {
  return `evt-${crypto.randomBytes(5).toString('hex')}`;
}

async function saveEvent({ id, item }) {
  const createdId = id ? null : newEventId(); // outside the retryable callback
  const stamp = new Date();
  const nowMs = stamp.getTime();
  const doc = await mutateDoc(d => {
    const existing = id ? findEvent(d, id) : null;
    if (id && !existing) throw new EventError('That event no longer exists. Refresh the list.', { status: 404, code: 'not_found' });
    if (existing && existing.status === 'cancelled') throw new EventError('A cancelled event cannot be edited.', { code: 'cancelled' });
    const fields = eventFields(item, existing, nowMs);
    if (existing) {
      const active = activeAttendees(existing).length;
      if (fields.capacity < active) {
        throw new EventError(`${active} ${active === 1 ? 'person is' : 'people are'} registered, so capacity cannot go below ${active}.`, { field: 'capacity', code: 'capacity_below_registered' });
      }
      if (existing.attendees.length && (fields.admission !== existing.admission || fields.feePaise !== existing.feePaise)) {
        throw new EventError('Admission and fee cannot change once people have registered, because their payments were made at the old price. Cancel this event and create a new one.', { field: 'admission', code: 'price_locked' });
      }
      Object.assign(existing, fields, { updatedAt: stamp.toISOString() });
      if (existing.status === 'published') assertPublishable(existing, d, nowMs, { checkTimes: false });
    } else {
      d.events.push({ id: createdId, ...fields, status: 'draft', createdAt: stamp.toISOString(), updatedAt: stamp.toISOString(), attendees: [] });
    }
  }, 'events: save event');
  return { doc, eventId: id || createdId };
}

async function setEventStatus({ id, to }) {
  if (!EVENT_STATUSES.includes(to)) throw new EventError('Unknown status.');
  const stamp = new Date();
  const nowMs = stamp.getTime();
  return mutateDoc(d => {
    const event = findEvent(d, id);
    if (!event) throw new EventError('That event no longer exists. Refresh the list.', { status: 404, code: 'not_found' });
    if (event.status === to) return false;
    if (event.status === 'cancelled') throw new EventError('A cancelled event cannot be reopened. Create a new event instead.', { code: 'cancelled' });
    if (to === 'published') {
      assertPublishable(event, d, nowMs);
      event.publishedAt = event.publishedAt || stamp.toISOString();
    }
    if (to === 'cancelled') event.cancelledAt = stamp.toISOString();
    event.status = to;
    event.updatedAt = stamp.toISOString();
  }, `events: ${to === 'published' ? 'publish' : to === 'cancelled' ? 'cancel' : 'unpublish'} event ${id}`);
}

async function deleteEvent({ id }) {
  return mutateDoc(d => {
    const event = findEvent(d, id);
    if (!event) throw new EventError('That event no longer exists. Refresh the list.', { status: 404, code: 'not_found' });
    if (event.attendees.length) throw new EventError('This event has registrations, so it cannot be deleted. Cancel it instead; the attendee records are kept.', { code: 'has_attendees' });
    if (event.status === 'published') throw new EventError('Unpublish the event before deleting it.', { code: 'published' });
    d.events = d.events.filter(e => e.id !== id);
  }, `events: delete event ${id}`);
}

async function savePayment({ item }) {
  return mutateDoc(d => {
    const payment = paymentFrom(item, d.settings.payment);
    const livePaid = d.events.filter(e => e.status === 'published' && e.admission === 'paid' && Date.parse(e.startsAt) > Date.now());
    const gaps = paymentGaps(payment);
    if (livePaid.length && gaps.length) {
      throw new EventError(`${livePaid.length === 1 ? 'A published paid event needs' : 'Published paid events need'} ${gaps.join(' and ')}. Unpublish ${livePaid.length === 1 ? 'it' : 'them'} first, or keep these details.`, { code: 'payment_in_use' });
    }
    d.settings.payment = payment;
  }, 'events: update payment settings');
}

// Marks a pending registration confirmed. Repeating it changes nothing.
async function confirmPayment({ eventId, ticketId, actor }) {
  const confirmedAt = new Date().toISOString();
  let transitioned = false;
  const doc = await mutateDoc(d => {
    transitioned = false; // the callback can run again after a conflict
    const { event, attendee } = locate(d, eventId, ticketId);
    if (attendee.status === 'confirmed') return false;
    if (event.status === 'cancelled') throw new EventError('This event is cancelled, so payments can no longer be confirmed.', { status: 409, code: 'cancelled' });
    if (attendee.status !== 'pending_verification') throw new EventError('This registration was released, so it cannot be confirmed.', { status: 409, code: 'released' });
    attendee.status = 'confirmed';
    attendee.confirmedAt = confirmedAt;
    attendee.confirmedBy = actor;
    transitioned = true;
  }, `events: confirm payment for ticket ${ticketId}`);
  const { event, attendee } = locate(doc, eventId, ticketId);
  return { doc, event, attendee, transitioned };
}

// Frees the seat of a registration (for example a payment that never arrived).
// The record stays, marked cancelled, with who and when.
async function releaseRegistration({ eventId, ticketId, actor }) {
  const cancelledAt = new Date().toISOString();
  const doc = await mutateDoc(d => {
    const { attendee } = locate(d, eventId, ticketId);
    if (attendee.status === 'cancelled') return false;
    attendee.status = 'cancelled';
    attendee.cancelledAt = cancelledAt;
    attendee.cancelledBy = actor;
  }, `events: release ticket ${ticketId}`);
  const { event, attendee } = locate(doc, eventId, ticketId);
  return { doc, event, attendee };
}

// ── Registration ────────────────────────────────────────────────────────

function newTicketId() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(10);
  return 'DT-' + Array.from(bytes, b => alphabet[b % 32]).join('');
}

// input: { eventId, requestId, name, email (lower-case), phone (+E.164), organization, paymentReference }
// The caller has already validated the shapes; this applies the rules that
// depend on the latest stored state. A repeat of the same requestId returns the
// registration it created. Rejections throw EventError with a visitor-safe message.
async function register(input) {
  const ticketId = newTicketId();
  const registeredAt = new Date().toISOString();
  let outcome = null;
  const doc = await mutateDoc(d => {
    outcome = null; // the callback can run again after a conflict
    const event = findEvent(d, input.eventId);
    if (!event || event.status === 'draft') throw new EventError('This event is not available.', { status: 404, code: 'not_found' });

    const repeat = event.attendees.find(a => a.requestId === input.requestId);
    if (repeat) {
      if (repeat.email !== input.email) throw new EventError('This request was already used. Please reload the page and register again.', { status: 409, code: 'request_reuse' });
      outcome = { ticketId: repeat.ticketId, repeated: true };
      return false;
    }
    if (event.status === 'cancelled') throw new EventError('This event has been cancelled.', { status: 409, code: 'cancelled' });
    const now = Date.now();
    if (now >= Date.parse(event.startsAt)) throw new EventError('This event has already started, so registration is closed.', { status: 409, code: 'closed' });
    if (now >= Date.parse(event.registrationDeadline)) throw new EventError('Registration for this event has closed.', { status: 409, code: 'closed' });

    const active = activeAttendees(event);
    if (active.some(a => a.email === input.email)) {
      throw new EventError('This email address is already registered for this event. Check your inbox for the ticket, or contact us if it has not arrived.', { status: 409, code: 'duplicate' });
    }
    const paid = event.admission === 'paid';
    if (paid) checkPaymentReference(input.paymentReference);
    if (paid && active.some(a => a.paymentReference && a.paymentReference.toLowerCase() === input.paymentReference.toLowerCase())) {
      throw new EventError('That payment reference has already been used for this event. Check the reference and try again.', { status: 409, code: 'duplicate_reference', field: 'paymentReference' });
    }
    if (active.length >= event.capacity) throw new EventError('Sorry, this event is full.', { status: 409, code: 'sold_out' });

    event.attendees.push({
      ticketId,
      requestId: input.requestId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      organization: input.organization,
      status: paid ? 'pending_verification' : 'confirmed',
      paymentReference: paid ? input.paymentReference : '',
      registeredAt,
      ...(paid ? {} : { confirmedAt: registeredAt, confirmedBy: 'automatic (free event)' }),
    });
    outcome = { ticketId, repeated: false };
  }, `events: registration ${ticketId}`);
  if (!outcome) throw new Error('Registration finished without a result');
  const event = doc.events.find(e => e.attendees.some(a => a.ticketId === outcome.ticketId));
  const attendee = event.attendees.find(a => a.ticketId === outcome.ticketId);
  return { event, attendee, repeated: outcome.repeated };
}

function validateRegistration(body) {
  const eventId = clean(body.eventId, 40);
  if (!EVENT_ID_RE.test(eventId)) throw new EventError('This event is not available.', { status: 404, code: 'not_found' });
  const requestId = clean(body.requestId, 80);
  if (!REQUEST_ID_RE.test(requestId)) throw new EventError('Please reload the page and try again.', { code: 'bad_request' });
  const name = clean(body.name, 120);
  if (name.length < 2) throw new EventError('Please enter your full name.', { field: 'name' });
  const phone = normalizeMobile(body.phone);
  if (!phone) throw new EventError('Please enter a valid mobile number, for example 98765 43210.', { field: 'phone' });
  return {
    eventId, requestId, name, phone,
    email: clean(body.email, 254).toLowerCase(),
    organization: clean(body.organization, 160),
    paymentReference: clean(body.paymentReference, 60),
  };
}

function checkPaymentReference(reference) {
  if (!PAYMENT_REFERENCE_RE.test(reference)) {
    throw new EventError('Enter the UTR or transaction reference from your payment app (6 to 40 letters or digits).', { field: 'paymentReference' });
  }
}

// ── Email ───────────────────────────────────────────────────────────────

function emailTimeoutMs() {
  return Number(process.env.EVENT_EMAIL_TIMEOUT_MS) || 6000;
}

// Sends within a deadline so a slow SMTP server cannot push the response past
// the function's time limit. Resolves { state, error? }; never throws, and never
// logs the recipient. The registration is already saved when this runs.
async function deliver(message) {
  if (!mail.isConfigured()) return { state: 'not_configured' };
  let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve({ state: 'failed', error: 'timeout' }), emailTimeoutMs()); });
  const sending = Promise.resolve()
    .then(() => mail.sendMail(message))
    .then(() => ({ state: 'sent' }), err => {
      console.error('Event email failed:', (err && (err.code || err.responseCode)) || 'error');
      return { state: 'failed', error: 'rejected' };
    });
  try {
    return await Promise.race([sending, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// Records how the last email went. Resolves with the committed document, or
// null when it could not be saved; either way the caller carries on.
async function recordDelivery(eventId, ticketId, kind, result) {
  const at = new Date().toISOString();
  try {
    return await mutateDoc(d => {
      const { attendee } = locate(d, eventId, ticketId);
      const attempts = (attendee.mail && attendee.mail.attempts || 0) + 1;
      attendee.mail = { kind, state: result.state, at, attempts, ...(result.error ? { error: result.error } : {}) };
    }, `events: email status for ticket ${ticketId}`);
  } catch (err) {
    console.error('Recording event email status failed:', err.message);
    return null;
  }
}

function canAttemptMail(attendee, kind) {
  const m = attendee.mail;
  if (!m || m.kind !== kind) return true;
  return m.state !== 'sent' && (m.attempts || 0) < MAX_MAIL_ATTEMPTS;
}

const FOOTER_LINES = ['D-TECH Solution Integrators Private Limited', 'Bharuch Corporate HQ, Gujarat', 'Questions? Email sales@dtechindia.com or call +91 95588 09163.'];

function formatWhen(event) {
  const opts = { timeZone: event.timezone || DEFAULT_TIMEZONE };
  const date = new Intl.DateTimeFormat('en-IN', { ...opts, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(event.startsAt));
  const time = new Intl.DateTimeFormat('en-IN', { ...opts, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(event.startsAt));
  return `${date}, ${time}`;
}

function greetingName(name) {
  const words = String(name).split(/\s+/).filter(w => /^[\p{L}\p{M}'.-]{1,30}$/u.test(w));
  return words.slice(0, 3).join(' ') || 'there';
}

// Plain-text details as HTML: escaped, with http(s) links made clickable.
function detailsHtml(value) {
  return esc(value).replace(/https?:\/\/[^\s<>&"']+(?:&amp;[^\s<>&"']*)*/gi, url => `<a href="${url}" style="color:#0075ae">${url}</a>`).replace(/\n/g, '<br>');
}

function frame(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#14181c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#0b1a33;padding:22px 28px;color:#ffffff">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ff8a3d">D-TECH Solution Integrators</div>
        <div style="font-size:22px;font-weight:bold;margin-top:6px">${esc(title)}</div>
      </td></tr>
      <tr><td style="height:4px;background:linear-gradient(90deg,#f0561d,#fbbf24,#14b8a6,#3b82f6,#7c3aed);background-color:#f0561d"></td></tr>
      <tr><td style="padding:26px 28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
      <tr><td style="padding:18px 28px;background:#f8fafc;font-size:13px;color:#475569;line-height:1.6">${FOOTER_LINES.map(esc).join('<br>')}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function summaryRows(event, attendee) {
  const rows = [
    ['Event', event.title],
    ['When', formatWhen(event)],
    ['Where', event.mode === 'online' ? 'Online' : (event.publicLocation || 'Venue to be announced')],
    ['Ticket ID', attendee.ticketId],
    ['Name', attendee.name],
  ];
  if (event.admission === 'paid') rows.push(['Fee', `INR ${(event.feePaise / 100).toLocaleString('en-IN')}`], ['Payment reference', attendee.paymentReference]);
  return rows;
}

function rowsHtml(rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;margin:0 0 16px">${rows.map(([k, v]) => `<tr><td style="padding:5px 16px 5px 0;color:#64748b;vertical-align:top">${esc(k)}</td><td style="padding:5px 0"><strong>${esc(v)}</strong></td></tr>`).join('')}</table>`;
}

function ticketMessage(event, attendee) {
  const rows = summaryRows(event, attendee);
  const details = event.accessDetails;
  return {
    to: attendee.email,
    subject: `Your ticket: ${event.title}`,
    html: frame('Your ticket', `<p style="margin:0 0 14px">Hello ${esc(greetingName(attendee.name))},</p>
      <p style="margin:0 0 14px">${event.admission === 'paid' ? 'Your payment has been verified and your registration is confirmed.' : 'Your registration is confirmed.'} Please keep this email: show the ticket ID at entry.</p>
      ${rowsHtml(rows)}
      ${details ? `<p style="margin:0 0 6px;font-weight:bold">${event.mode === 'online' ? 'How to join' : 'Entry details'}</p><div style="padding:12px 14px;background:#f8fafc;border-radius:8px;margin:0 0 14px">${detailsHtml(details)}</div>` : ''}
      <p style="margin:0">We look forward to seeing you.</p>`),
    text: [`Hello ${greetingName(attendee.name)},`, '', event.admission === 'paid' ? 'Your payment has been verified and your registration is confirmed.' : 'Your registration is confirmed.', 'Please keep this email: show the ticket ID at entry.', '',
      ...rows.map(([k, v]) => `${k}: ${v}`), '', ...(details ? [event.mode === 'online' ? 'How to join:' : 'Entry details:', details, ''] : []), ...FOOTER_LINES].join('\n'),
  };
}

function acknowledgementMessage(event, attendee) {
  const rows = summaryRows(event, attendee);
  return {
    to: attendee.email,
    subject: `Registration received: ${event.title}`,
    html: frame('Registration received', `<p style="margin:0 0 14px">Hello ${esc(greetingName(attendee.name))},</p>
      <p style="margin:0 0 14px">We have received your registration and the payment reference you gave. Our team will check the payment against our bank records. <strong>This is not yet your ticket</strong>: once the payment is verified, we will email your ticket with the joining details.</p>
      ${rowsHtml(rows)}
      <p style="margin:0">If you do not hear from us within two working days, reply to this email or call +91 95588 09163 and quote your ticket ID.</p>`),
    text: [`Hello ${greetingName(attendee.name)},`, '', 'We have received your registration and the payment reference you gave. Our team will check the payment against our bank records.',
      'This is not yet your ticket: once the payment is verified, we will email your ticket with the joining details.', '', ...rows.map(([k, v]) => `${k}: ${v}`), '',
      'If you do not hear from us within two working days, reply to this email or call +91 95588 09163 and quote your ticket ID.', '', ...FOOTER_LINES].join('\n'),
  };
}

// Sends the right message for the attendee's status and records the result.
// kind "ticket" needs a confirmed attendee; "acknowledgement" a pending one.
async function sendFor(event, attendee) {
  const kind = attendee.status === 'confirmed' ? 'ticket' : 'acknowledgement';
  const message = kind === 'ticket' ? ticketMessage(event, attendee) : acknowledgementMessage(event, attendee);
  const result = await deliver(message);
  const doc = await recordDelivery(event.id, attendee.ticketId, kind, result);
  return { kind, ...result, doc };
}

// ── CSV export ──────────────────────────────────────────────────────────

// Cells starting with = + - @ (or a tab/CR) are prefixed with an apostrophe so
// a spreadsheet shows them as text instead of running them as a formula.
function csvCell(value) {
  let s = String(value == null ? '' : value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function attendeesCsv(event) {
  const header = ['Ticket ID', 'Name', 'Email', 'Phone', 'Organization', 'Status', 'Payment reference', 'Registered at', 'Payment confirmed at', 'Confirmed by', 'Email status'];
  const rows = event.attendees.map(a => [
    a.ticketId, a.name, a.email, a.phone, a.organization, a.status, a.paymentReference, a.registeredAt, a.confirmedAt || '', a.confirmedBy || '',
    a.mail ? `${a.mail.kind}: ${a.mail.state}` : 'not sent',
  ]);
  return '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = {
  FILE, EventError, ACTIVE_STATUSES, MAX_QR_BYTES,
  validTimeZone, localToUtcMs, utcToLocalInput, parseFeePaise, assertWebLinksOnly,
  readDoc, isStorageReady, findEvent, locate, stateOf, countsOf, paymentGaps,
  publicListing, publicDetail, ticketView, adminSnapshot, adminEvent,
  saveEvent, setEventStatus, deleteEvent, savePayment, confirmPayment, releaseRegistration,
  register, validateRegistration, canAttemptMail, sendFor, deliver, attendeesCsv, csvCell, newTicketId,
  TICKET_ID_RE, EVENT_ID_RE,
};
