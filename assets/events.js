/* D-TECH events page: lists published events from /api/events and registers
 * visitors. Everything the server sends is rendered as text (never as HTML).
 * The page never polls: it reloads when the visitor returns to the tab (at most
 * every 30 seconds) and after a registration. The server rechecks seats on every
 * registration, so a stale count here can never overbook an event. */
(() => {
  'use strict';

  const API = '/api/events';
  const REFRESH_AFTER_MS = 30000;
  const SUBMIT_TIMEOUT_MS = 28000;
  const STATE_LABEL = { open: 'Registration open', sold_out: 'Sold out', closed: 'Registration closed', cancelled: 'Cancelled' };
  const PAY_NOTE = 'A payment reference you enter here is checked by our team against our bank records. It is not a ticket until we confirm it.';

  const $ = id => document.getElementById(id);
  const list = $('ev-list');
  if (!list) return;

  const view = { events: [], payment: null, loadedAt: 0, status: 'loading', mode: 'all', cost: 'all', query: '' };
  const dialog = $('ev-dialog');
  const form = $('ev-form');
  const result = $('ev-result');
  let opener = null;
  let current = null; // the event the dialog is open for
  let requestId = '';
  let submitting = false;
  let loadToken = 0;

  // ---------- small helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function newRequestId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    (window.crypto || { getRandomValues: a => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function money(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(amount);
  }

  function zoned(iso, tz, opts) {
    try {
      return new Intl.DateTimeFormat('en-IN', Object.assign({ timeZone: tz }, opts)).format(new Date(iso));
    } catch (e) {
      return new Intl.DateTimeFormat('en-IN', opts).format(new Date(iso));
    }
  }
  function when(ev) {
    const day = zoned(ev.startsAt, ev.timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const start = zoned(ev.startsAt, ev.timezone, { hour: 'numeric', minute: '2-digit' });
    const zone = zoned(ev.startsAt, ev.timezone, { timeZoneName: 'short' }).split(/,\s*/).pop();
    let end = '';
    if (ev.endsAt) {
      const sameDay = zoned(ev.endsAt, ev.timezone, { day: 'numeric', month: 'numeric', year: 'numeric' }) === zoned(ev.startsAt, ev.timezone, { day: 'numeric', month: 'numeric', year: 'numeric' });
      end = ' to ' + (sameDay ? '' : zoned(ev.endsAt, ev.timezone, { day: 'numeric', month: 'short' }) + ', ') + zoned(ev.endsAt, ev.timezone, { hour: 'numeric', minute: '2-digit' });
    }
    return day + ', ' + start + end + ' ' + zone;
  }

  // Plain text to elements: "- " lines become bullets, blank lines split paragraphs.
  function richText(value) {
    const box = h('div', { class: 'ev-rich' });
    let para = [], items = null;
    const flush = () => {
      if (para.length) {
        const p = h('p');
        para.forEach((line, i) => { if (i) p.append(h('br')); p.append(line); });
        box.append(p);
      }
      if (items) box.append(items);
      para = []; items = null;
    };
    String(value || '').split('\n').forEach(raw => {
      const line = raw.trim();
      const bullet = /^[-*•]\s+(.*)$/.exec(line);
      if (!line) return flush();
      if (bullet) {
        if (para.length) flush();
        if (!items) items = h('ul');
        items.append(h('li', { text: bullet[1] }));
      } else {
        if (items) flush();
        para.push(line);
      }
    });
    flush();
    return box;
  }

  // Text with http(s) links made clickable; anything else stays text.
  function linkified(value) {
    const box = h('p', { class: 'ev-access' });
    const re = /https?:\/\/[^\s<>"']+/g;
    let last = 0, m;
    const text = String(value || '');
    while ((m = re.exec(text))) {
      box.append(text.slice(last, m.index));
      let href = '';
      try { const u = new URL(m[0]); if (u.protocol === 'https:' || u.protocol === 'http:') href = u.href; } catch (e) { href = ''; }
      box.append(href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer', text: m[0] }) : m[0]);
      last = m.index + m[0].length;
    }
    box.append(text.slice(last));
    return box;
  }

  // ---------- loading ----------
  async function load({ fresh = false, silent = false } = {}) {
    const token = ++loadToken;
    if (!silent) { view.status = 'loading'; render(); }
    try {
      const res = await fetch(API + (fresh ? '?fresh=' + Date.now() : ''), { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (token !== loadToken) return;
      if (!res.ok || !body.ok) throw new Error(body.error || 'unavailable');
      const snapshot = JSON.stringify([body.events, body.payment]);
      view.loadedAt = Date.now();
      // Nothing changed: leave the page alone, so open agendas and focus stay put.
      if (silent && view.status === 'ready' && snapshot === view.snapshot) return;
      view.snapshot = snapshot;
      view.events = body.events || [];
      view.payment = body.payment || null;
      view.status = 'ready';
    } catch (err) {
      if (token !== loadToken) return;
      // A silent refresh that fails keeps the list the visitor is looking at.
      if (silent && view.status === 'ready') return;
      view.status = 'unavailable';
    }
    render();
    focusHash();
  }

  function visible() {
    const q = view.query.trim().toLowerCase();
    return view.events.filter(ev => {
      if (view.mode !== 'all' && ev.mode !== view.mode) return false;
      if (view.cost !== 'all' && ev.admission !== view.cost) return false;
      if (!q) return true;
      return [ev.title, ev.description, ev.publicLocation].join(' ').toLowerCase().includes(q);
    });
  }

  // ---------- rendering ----------
  function badge(ev) {
    return h('span', { class: 'ev-state ev-state--' + ev.state, text: STATE_LABEL[ev.state] || ev.state });
  }

  function card(ev) {
    const canRegister = ev.state === 'open';
    const seats = ev.state === 'sold_out' ? 'No seats left'
      : ev.state === 'cancelled' ? 'This event has been cancelled'
      : ev.seatsLeft + ' of ' + ev.capacity + ' seats left';
    const title = h('h3', { id: 'ev-title-' + ev.id, text: ev.title });
    const action = canRegister
      ? h('button', { type: 'button', class: 'button button-primary ev-register', 'data-event': ev.id, 'aria-describedby': 'ev-title-' + ev.id }, 'Register ', h('span', { 'aria-hidden': 'true', text: '↗' }))
      : h('p', { class: 'ev-closed', text: ev.state === 'sold_out' ? 'This event is full.' : ev.state === 'cancelled' ? 'Registration is closed because the event was cancelled.' : 'Registration for this event has closed.' });
    const more = ev.description ? h('details', { class: 'ev-more' }, h('summary', { text: 'Agenda and details' }), richText(ev.description)) : null;
    return h('li', { class: 'ev-card', id: 'event-' + ev.id, 'data-state': ev.state, 'aria-labelledby': 'ev-title-' + ev.id },
      h('div', { class: 'ev-tags' }, badge(ev),
        h('span', { class: 'ev-chip', text: ev.mode === 'online' ? 'Online' : 'In person' }),
        h('span', { class: 'ev-chip' + (ev.admission === 'paid' ? ' ev-chip--paid' : ''), text: ev.admission === 'paid' ? money(ev.feeInr) : 'Free' })),
      title,
      h('ul', { class: 'ev-facts' },
        h('li', { text: when(ev) }),
        h('li', { text: ev.publicLocation || (ev.mode === 'online' ? 'Online. Joining details are emailed to registered attendees.' : 'Venue to be announced') }),
        h('li', { text: seats })),
      more,
      h('div', { class: 'ev-action' }, action));
  }

  function render() {
    const status = $('ev-status');
    const filters = $('ev-filters');
    clear(list);
    $('ev-empty').hidden = true;
    $('ev-unavailable').hidden = true;
    list.setAttribute('aria-busy', String(view.status === 'loading'));
    if (view.status === 'loading') {
      status.textContent = 'Loading events…';
      filters.hidden = true;
      return;
    }
    if (view.status === 'unavailable') {
      status.textContent = '';
      filters.hidden = true;
      $('ev-unavailable').hidden = false;
      return;
    }
    filters.hidden = !view.events.length;
    if (!view.events.length) {
      status.textContent = '';
      $('ev-empty').hidden = false;
      return;
    }
    const shown = visible();
    shown.forEach(ev => list.append(card(ev)));
    const open = shown.filter(ev => ev.state === 'open').length;
    status.textContent = shown.length
      ? shown.length + (shown.length === 1 ? ' event' : ' events') + ' (' + open + ' open for registration).'
      : 'No events match your search or filters.';
    $('ev-reset-row').hidden = shown.length > 0;
    $('ev-modes').querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === view.mode)));
    $('ev-costs').querySelectorAll('[data-cost]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cost === view.cost)));
  }

  function focusHash() {
    const m = /^#event-(evt-[a-f0-9]+)$/.exec(location.hash);
    const el = m && $('event-' + m[1]);
    if (el && !focusHash.done) { focusHash.done = true; el.scrollIntoView({ block: 'center' }); el.classList.add('is-linked'); }
  }

  // ---------- registration dialog ----------
  function field(name) { return form.elements[name]; }

  function setError(name, message) {
    const input = field(name);
    const box = $('ev-err-' + name);
    if (!input || !box) return;
    box.textContent = message || '';
    box.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  function formMessage(text, tone) {
    const box = $('ev-form-msg');
    box.textContent = text || '';
    box.hidden = !text;
    box.dataset.tone = tone || 'error';
  }

  function paymentBlock(ev) {
    const box = $('ev-pay');
    clear(box);
    box.hidden = ev.admission !== 'paid';
    $('ev-field-ref').hidden = ev.admission !== 'paid';
    field('paymentReference').required = ev.admission === 'paid';
    if (ev.admission !== 'paid') return;
    const p = view.payment;
    box.append(h('h4', { text: 'Pay ' + money(ev.feeInr) + ' to reserve your seat' }));
    if (!p) {
      box.append(h('p', { class: 'ev-warn', text: 'Payment details are not available right now. Please try again later or contact sales@dtechindia.com.' }));
      return;
    }
    const rows = h('dl', { class: 'ev-pay-rows' });
    if (p.payeeName) rows.append(h('dt', { text: 'Pay to' }), h('dd', { text: p.payeeName }));
    if (p.upiId) {
      const copy = h('button', { type: 'button', class: 'ev-copy', 'data-copy': p.upiId, 'aria-label': 'Copy UPI ID' }, 'Copy');
      rows.append(h('dt', { text: 'UPI ID' }), h('dd', null, h('span', { class: 'ev-mono', text: p.upiId }), ' ', copy));
    }
    rows.append(h('dt', { text: 'Amount' }), h('dd', { text: money(ev.feeInr) }));
    box.append(rows);
    if (p.qrUrl) box.append(h('img', { class: 'ev-qr', src: p.qrUrl, alt: 'UPI QR code to pay ' + money(ev.feeInr) + ' to ' + (p.payeeName || 'D-TECH'), width: '180', height: '180' }));
    if (p.instructions) box.append(richText(p.instructions));
    box.append(h('p', { class: 'ev-pay-note', text: PAY_NOTE }));
  }

  function openDialog(ev, trigger) {
    current = ev;
    opener = trigger;
    requestId = newRequestId();
    form.reset();
    ['name', 'email', 'phone', 'paymentReference'].forEach(n => setError(n, ''));
    formMessage('');
    result.hidden = true;
    clear(result);
    form.hidden = false;
    $('ev-dialog-title').textContent = ev.title;
    clear($('ev-summary'));
    $('ev-summary').append(h('li', { text: when(ev) }), h('li', { text: ev.publicLocation || (ev.mode === 'online' ? 'Online' : 'Venue to be announced') }),
      h('li', { text: ev.admission === 'paid' ? 'Fee: ' + money(ev.feeInr) : 'Free admission' }));
    paymentBlock(ev);
    field('formStart').value = String(Date.now());
    setSubmitting(false);
    dialog.showModal();
    // Focus the first field without scrolling to it: on a phone that would hide the
    // title and the payment instructions, which come first.
    dialog.querySelector('.ev-dialog-inner').scrollTop = 0;
    field('name').focus({ preventScroll: true });
  }

  function closeDialog() {
    if (submitting) return;
    if (dialog.open) dialog.close();
  }

  // Back to where the visitor was. The list re-renders after a registration, so
  // the original button may be gone: use the same event's new button, then its card.
  function restoreFocus() {
    const id = current && current.id;
    const target = (opener && opener.isConnected && opener)
      || (id && (document.querySelector('#event-' + id + ' .ev-register') || $('event-' + id)))
      || $('events-title');
    if (target) {
      if (target.tabIndex < 0) target.setAttribute('tabindex', '-1');
      target.focus();
    }
    opener = null;
    current = null;
  }

  function setSubmitting(on) {
    submitting = on;
    form.setAttribute('aria-busy', String(on));
    const btn = $('ev-submit');
    btn.disabled = on;
    btn.firstChild.textContent = on ? 'Registering… ' : 'Register ';
  }

  // The same checks the server makes, so visitors see problems before sending.
  function validate() {
    const errors = {};
    if (field('name').value.trim().length < 2) errors.name = 'Please enter your full name.';
    if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(field('email').value.trim())) errors.email = 'Please enter a valid email address, e.g. name@company.com.';
    const digits = field('phone').value.replace(/[\s().-]/g, '');
    if (!/^(\+91|0)?[6-9]\d{9}$|^\+(?!91)[1-9]\d{7,14}$/.test(digits)) errors.phone = 'Please enter a valid mobile number, for example 98765 43210.';
    if (current && current.admission === 'paid' && !/^[A-Za-z0-9][A-Za-z0-9/_-]{5,39}$/.test(field('paymentReference').value.trim())) {
      errors.paymentReference = 'Enter the UTR or transaction reference from your payment app (6 to 40 letters or digits).';
    }
    return errors;
  }

  function showErrors(errors) {
    let first = '';
    ['name', 'email', 'phone', 'paymentReference'].forEach(n => {
      setError(n, errors[n] || '');
      if (errors[n] && !first) first = n;
    });
    formMessage(first ? 'Please fix the highlighted fields.' : '');
    if (first) field(first).focus();
    return !first;
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting || !current) return;
    if (!showErrors(validate())) return;
    if (navigator.onLine === false) {
      formMessage('You appear to be offline, so your registration has not been sent. Reconnect and press Register again.');
      return;
    }
    setSubmitting(true);
    formMessage('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          eventId: current.id, requestId,
          name: field('name').value, email: field('email').value, phone: field('phone').value,
          organization: field('organization').value, paymentReference: current.admission === 'paid' ? field('paymentReference').value : '',
          website: field('website').value, formStart: Number(field('formStart').value),
        }),
        signal: controller.signal,
      });
      // An answer we cannot read (cut-off body, a gateway timeout page) says nothing
      // about whether the server saved the registration, so it is handled like no answer.
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      if (!body || typeof body.ok !== 'boolean') throw new Error('unreadable response');
      if (res.ok && body.ok) {
        showTicket(body);
        load({ fresh: true, silent: true });
        return;
      }
      if (body.code === 'request_reuse') requestId = newRequestId();
      if (body.field && field(body.field)) { setError(body.field, body.error); field(body.field).focus(); }
      formMessage(body.error || 'We could not register you. Nothing was saved. Please try again.');
      if (res.status === 409) load({ fresh: true, silent: true }); // seats or status changed
    } catch (err) {
      // The request may or may not have reached the server. The same request ID
      // makes pressing Register again safe: it can never book a second seat.
      formMessage('We could not confirm your registration (no response from the server). It may not have been saved. Press Register again: you will not be booked twice.');
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  }

  const DELIVERY = {
    ticket: {
      sent: email => 'We have emailed your ticket to ' + email + '.',
      failed: () => 'We could not email your ticket just now. Keep the ticket ID below; our team can resend it.',
      not_configured: () => 'Email is not available right now, so no ticket email was sent. Keep the ticket ID below; our team can resend it.',
    },
    acknowledgement: {
      sent: email => 'We have emailed a receipt to ' + email + '.',
      failed: () => 'We could not email the receipt just now. Your registration is saved; keep the ticket ID below.',
      not_configured: () => 'Email is not available right now, so no receipt was sent. Your registration is saved; keep the ticket ID below.',
    },
  };

  function showTicket(body) {
    const t = body.ticket;
    const confirmed = t.status === 'confirmed';
    const say = (DELIVERY[body.delivery.kind] || DELIVERY.ticket)[body.delivery.state] || DELIVERY.ticket.failed;
    form.hidden = true;
    clear(result);
    result.append(
      h('h4', { id: 'ev-result-title', tabindex: '-1', text: confirmed ? 'You are registered' : 'Registration received: payment to be verified' }),
      body.repeated ? h('p', { class: 'ev-note', text: 'This registration was already saved, so you have not been booked twice.' }) : null,
      confirmed ? null : h('p', { class: 'ev-warn', text: 'This is not a ticket yet. Once our team verifies your payment, we will email your ticket with the joining details.' }),
      h('div', { class: 'ev-ticket' + (confirmed ? '' : ' is-pending') },
        h('p', { class: 'ev-ticket-id', text: t.ticketId }),
        h('p', { class: 'ev-ticket-sub', text: confirmed ? 'Ticket ID. Show it at entry.' : 'Reference. Quote it if you contact us.' }),
        h('dl', { class: 'ev-pay-rows' },
          h('dt', { text: 'Event' }), h('dd', { text: t.event.title }),
          h('dt', { text: 'When' }), h('dd', { text: when(t.event) }),
          h('dt', { text: 'Where' }), h('dd', { text: t.event.publicLocation || (t.event.mode === 'online' ? 'Online' : 'Venue to be announced') }),
          h('dt', { text: 'Name' }), h('dd', { text: t.name }),
          t.paymentReference ? h('dt', { text: 'Payment reference' }) : null, t.paymentReference ? h('dd', { text: t.paymentReference }) : null),
        confirmed && t.accessDetails ? h('div', { class: 'ev-access-box' }, h('h5', { text: t.event.mode === 'online' ? 'How to join' : 'Entry details' }), linkified(t.accessDetails)) : null),
      h('p', { class: body.delivery.state === 'sent' ? 'ev-note' : 'ev-warn', role: 'status', text: say(body.delivery.email) }),
      h('div', { class: 'ev-actions' },
        h('button', { type: 'button', class: 'ev-copy', 'data-copy': t.ticketId }, 'Copy ticket ID'),
        h('button', { type: 'button', class: 'button button-primary', 'data-close': true }, 'Done')));
    result.hidden = false;
    $('ev-result-title').focus();
  }

  async function copy(text, button) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      button.focus();
    }
    const before = button.textContent;
    button.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => { if (button.isConnected) button.textContent = before; }, 1800);
  }

  // ---------- wiring ----------
  list.addEventListener('click', e => {
    const btn = e.target.closest('.ev-register');
    if (!btn) return;
    const ev = view.events.find(x => x.id === btn.dataset.event);
    if (ev) openDialog(ev, btn);
  });
  dialog.addEventListener('click', e => {
    if (e.target === dialog && !submitting) closeDialog(); // backdrop
    const t = e.target.closest('[data-close]');
    if (t) closeDialog();
    const c = e.target.closest('[data-copy]');
    if (c) copy(c.dataset.copy, c);
  });
  dialog.addEventListener('cancel', e => { if (submitting) e.preventDefault(); });
  dialog.addEventListener('close', restoreFocus);
  form.addEventListener('submit', submit);
  form.addEventListener('input', e => {
    const name = e.target.name;
    if (name && $('ev-err-' + name)) setError(name, '');
  });

  $('ev-search').addEventListener('input', e => { view.query = e.target.value; render(); });
  $('ev-modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) { view.mode = b.dataset.mode; render(); } });
  $('ev-costs').addEventListener('click', e => { const b = e.target.closest('[data-cost]'); if (b) { view.cost = b.dataset.cost; render(); } });
  $('ev-reset').addEventListener('click', () => {
    view.mode = 'all'; view.cost = 'all'; view.query = '';
    $('ev-search').value = '';
    render();
    $('ev-search').focus();
  });
  $('ev-retry').addEventListener('click', () => load({ fresh: true }));

  // Come back to the tab, or to the page from the back button: refresh if the list is old.
  const refreshIfOld = () => { if (view.status === 'ready' && Date.now() - view.loadedAt > REFRESH_AFTER_MS) load({ silent: true }); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshIfOld(); });
  window.addEventListener('pageshow', e => { if (e.persisted) refreshIfOld(); });
  window.addEventListener('online', () => { if (view.status !== 'ready') load({ fresh: true }); });

  load();
})();
