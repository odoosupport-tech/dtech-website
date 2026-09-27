/* D-TECH Management Console. Served by api/admin/console.js to signed-in
 * sessions only, and injected into portal.html (which otherwise shows the 404
 * page). Styles are scoped under .dc so nothing leaks into the public bundle. */
(function () {
  'use strict';

  var CSS = [
    '.dc{--navy:#0b2f52;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--soft:#f8fafc;--blue:#2563eb;--blue-d:#1d4ed8;--brand:#008ccf;--orange:#f0561d;--ok:#059669;--warn:#b45309;',
    'min-height:100vh;background:#f1f5f9;color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.5}',
    '.dc *{box-sizing:border-box}',
    'html:has(.dc){color-scheme:light;background:#f1f5f9}',
    '.dc-top{background:var(--navy);color:#fff;border-bottom:4px solid var(--orange)}',
    '.dc-top-in{max-width:1400px;margin:0 auto;padding:14px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:16px}',
    '.dc-logo{background:#fff;border-radius:10px;padding:6px 10px;display:inline-flex}',
    '.dc-logo img{height:30px;width:auto;display:block}',
    '.dc-title{font-weight:800;font-size:18px;letter-spacing:-.01em}',
    '.dc-title small{display:block;font-weight:500;font-size:12px;color:#bfdbfe}',
    '.dc-counts{display:flex;flex-wrap:wrap;gap:8px;margin-left:auto}',
    '.dc-count{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 12px;font-size:12px;white-space:nowrap}',
    '.dc-count b{font-size:14px;margin-right:4px}',
    '.dc-main{max-width:1400px;margin:0 auto;padding:20px}',
    '.dc-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px}',
    '.dc-tab{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:10px 16px;font-weight:600;font-size:14px;cursor:pointer;white-space:nowrap;transition:background-color .15s,color .15s,border-color .15s}',
    '.dc-tab:hover{border-color:#94a3b8}',
    '.dc-tab[aria-selected="true"]{background:var(--navy);border-color:var(--navy);color:#fff}',
    '.dc-tab span{display:inline-block;margin-left:6px;background:rgba(15,23,42,.08);border-radius:999px;padding:0 8px;font-size:12px}',
    '.dc-tab[aria-selected="true"] span{background:rgba(255,255,255,.2)}',
    '.dc .dc-card{padding:0;margin:0}',
    '.dc-card{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.04)}',
    '.dc-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}',
    '.dc-bar h2{font-size:17px;line-height:1.3;font-weight:800;letter-spacing:normal;color:var(--ink);margin:0 auto 0 0;padding:0}',
    '.dc-search{border:1px solid #cbd5e1;border-radius:10px;padding:8px 12px;font-size:14px;min-width:220px;background:#fff;color:var(--ink)}',
    '.dc-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#fff;color:var(--ink);border-radius:10px;padding:8px 14px;font-weight:600;font-size:13px;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background-color .15s,border-color .15s}',
    '.dc-btn:hover{background:var(--soft);border-color:#94a3b8}',
    '.dc-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.dc-btn-primary{background:var(--blue);border-color:var(--blue);color:#fff}',
    '.dc-btn-primary:hover{background:var(--blue-d);border-color:var(--blue-d)}',
    '.dc-btn-accent{background:var(--orange);border-color:var(--orange);color:#fff}',
    '.dc-btn-accent:hover{background:#d9490f;border-color:#d9490f}',
    '.dc-btn-danger{color:#b91c1c;border-color:#fecaca}',
    '.dc-btn-danger:hover{background:#fef2f2;border-color:#fca5a5}',
    '.dc-btn-light{background:transparent;color:#fff;border-color:rgba(255,255,255,.4)}',
    '.dc-btn-light:hover{background:rgba(255,255,255,.12);border-color:#fff}',
    '.dc-btn svg,.dc-count svg{width:16px;height:16px}',
    '.dc-scroll{overflow-x:auto}',
    '.dc-table{width:100%;border-collapse:collapse;min-width:760px}',
    '.dc-table th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);background:var(--soft);padding:10px 14px;border-bottom:1px solid var(--line)}',
    '.dc-table td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle}',
    '.dc-table tr:last-child td{border-bottom:0}',
    '.dc-table a{color:var(--blue);text-decoration:none;font-weight:500}',
    '.dc-table a:hover{text-decoration:underline}',
    '.dc-table a.dc-btn-primary,.dc-modal a.dc-btn-primary{color:#fff;text-decoration:none}',
    '.dc-strong{font-weight:700}',
    '.dc-sub{color:var(--muted);font-size:12px}',
    '.dc-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
    '.dc-empty{padding:48px 16px;text-align:center;color:var(--muted)}',
    '.dc-note{border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:13px;border:1px solid #fde68a;background:#fffbeb;color:#92400e}',
    '.dc-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:13px;user-select:none}',
    '.dc-switch input{position:absolute;opacity:0;width:1px;height:1px}',
    '.dc-track{width:40px;height:22px;border-radius:999px;background:#cbd5e1;position:relative;transition:background-color .15s}',
    '.dc-track::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s}',
    '.dc-switch input:checked+.dc-track{background:var(--ok)}',
    '.dc-switch input:checked+.dc-track::after{transform:translateX(18px)}',
    '.dc-switch input:focus-visible+.dc-track{outline:2px solid var(--blue);outline-offset:2px}',
    '.dc-switch input:disabled+.dc-track{opacity:.5}',
    '.dc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;padding:16px}',
    '.dc-cs{border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}',
    '.dc-cs.is-off{background:var(--soft)}',
    '.dc-cs.is-off .dc-cs-name{color:var(--muted)}',
    '.dc-cs-name{font-weight:800;font-size:15px}',
    '.dc-chip{display:inline-block;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:600;background:#e0f2fe;color:#075985}',
    '.dc-cs-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:8px;border-top:1px solid var(--line)}',
    '.dc-modal{background:#fff;color:var(--ink);border:0;border-radius:16px;padding:0;width:min(640px,calc(100vw - 32px));max-height:calc(100vh - 32px);box-shadow:0 20px 50px rgba(15,23,42,.3)}',
    '.dc-modal::backdrop{background:rgba(7,29,52,.55)}',
    '.dc-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);background:var(--soft)}',
    '.dc-modal-head h3{margin:0;font-size:17px;font-weight:800}',
    '.dc-modal-body{padding:18px 20px;overflow-y:auto;max-height:calc(100vh - 180px)}',
    '.dc-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid var(--line)}',
    '.dc-x{border:0;background:transparent;font-size:20px;cursor:pointer;color:var(--muted);line-height:1}',
    '.dc-dl{display:grid;grid-template-columns:140px 1fr;gap:8px 14px;margin:0 0 14px}',
    '.dc-dl dt{color:var(--muted);font-size:13px}',
    '.dc-dl dd{margin:0;font-weight:600;word-break:break-word}',
    '.dc-msg{white-space:pre-wrap;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:14px;font-size:14px;line-height:1.6}',
    '.dc-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.dc-form label{display:flex;flex-direction:column;gap:4px;font-weight:600;font-size:13px}',
    '.dc-form .dc-wide{grid-column:1/-1}',
    '.dc-form [hidden]{display:none}',
    '.dc-form input,.dc-form select,.dc-form textarea{border:1px solid #cbd5e1;border-radius:10px;padding:9px 12px;font:inherit;font-weight:400;color:var(--ink);background:#fff}',
    '.dc-form input:focus,.dc-form select:focus,.dc-form textarea:focus,.dc-search:focus{outline:2px solid var(--blue);outline-offset:0;border-color:var(--blue)}',
    '.dc-form .dc-hint{font-weight:400;color:var(--muted);font-size:12px}',
    '.dc-error{color:#b91c1c;font-weight:600;font-size:13px;margin:10px 0 0}',
    '.dc-toast{position:fixed;right:20px;bottom:20px;z-index:60;background:var(--ink);color:#fff;padding:12px 16px;border-radius:12px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:360px;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:none}',
    '.dc-toast.is-on{opacity:1;transform:none}',
    '.dc-toast.is-bad{background:#991b1b}',
    '.dc-loading{padding:80px 16px;text-align:center;color:var(--muted);font-size:15px}',
    '@media (max-width:640px){.dc-form{grid-template-columns:1fr}.dc-dl{grid-template-columns:1fr}.dc-counts{margin-left:0}.dc-search{min-width:0;flex:1}}',
    '@media (prefers-reduced-motion:reduce){.dc *{transition:none!important}}'
  ].join('\n');

  var TABS = [
    { id: 'requirements', label: '📋 Client Requirements' },
    { id: 'applicants', label: '👥 Job Applicants' },
    { id: 'leads', label: '📑 Case Study Leads' },
    { id: 'jobs', label: '💼 Manage Careers' },
    { id: 'caseStudies', label: '🏆 Manage Case Studies' }
  ];
  var CATEGORIES = { network: 'Network & IT Infrastructure', services: 'Managed Services', safety: 'Safety, Communication & Automation' };
  var LOCATIONS = ['Bharuch', 'Dahej', 'Jhagadia', 'Ankleshwar', 'Vadodara'];
  var LIVE_NOTE = 'Saved. The website will show this change within about 2 minutes.';

  var state = { tab: 'requirements', data: null, query: {} };
  var root, toastEl, modal;

  // ---------- helpers ----------
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function tel(phone) {
    if (!phone) return '<span class="dc-sub">—</span>';
    return '<a href="tel:' + esc(String(phone).replace(/[^\d+]/g, '')) + '">' + esc(phone) + '</a>';
  }
  function mail(email) {
    if (!email) return '<span class="dc-sub">—</span>';
    return '<a href="mailto:' + esc(email) + '">' + esc(email) + '</a>';
  }
  function icon(name) { return '<i data-lucide="' + name + '"></i>'; }
  function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }

  function toast(message, bad) {
    toastEl.textContent = message;
    toastEl.classList.toggle('is-bad', !!bad);
    toastEl.classList.add('is-on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { toastEl.classList.remove('is-on'); }, bad ? 6000 : 4000);
  }

  function signedOut() {
    toast('Your session has ended. Please sign in again.', true);
    setTimeout(function () { location.href = '/'; }, 1800);
  }

  function api(url, options) {
    return fetch(url, Object.assign({ credentials: 'same-origin', headers: { Accept: 'application/json' } }, options || {}))
      .then(function (r) {
        if (r.status === 404 && url.indexOf('/api/admin/') === 0) { signedOut(); throw new Error('Signed out'); }
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok || !body.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
          return body;
        });
      });
  }

  function matches(item, fields, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return fields.some(function (f) { return String(item[f] || '').toLowerCase().indexOf(q) > -1; });
  }

  // Excel opens UTF-8 CSV correctly with a BOM; cells starting with = + - @
  // are prefixed so a malicious entry cannot run as a spreadsheet formula.
  function downloadCsv(filename, headers, rows) {
    function cell(v) {
      var s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var csv = '﻿' + [headers].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function today() { return new Date().toISOString().slice(0, 10); }

  // ---------- modal ----------
  function openModal(title, bodyHtml, footHtml) {
    modal.innerHTML = '<div class="dc-modal-head"><h3>' + esc(title) + '</h3><button type="button" class="dc-x" data-close aria-label="Close">&#10005;</button></div>' +
      '<div class="dc-modal-body">' + bodyHtml + '</div>' +
      '<div class="dc-modal-foot">' + (footHtml || '<button type="button" class="dc-btn" data-close>Close</button>') + '</div>';
    if (!modal.open) modal.showModal();
    refreshIcons();
  }
  function closeModal() { if (modal.open) modal.close(); }

  function confirmBox(title, text, actionLabel) {
    return new Promise(function (resolve) {
      openModal(title, '<p>' + esc(text) + '</p>',
        '<button type="button" class="dc-btn" data-close>Cancel</button><button type="button" class="dc-btn dc-btn-accent" data-confirm>' + esc(actionLabel) + '</button>');
      function done(value) { modal.removeEventListener('close', onClose); resolve(value); }
      function onClose() { done(false); }
      modal.addEventListener('close', onClose);
      modal.querySelector('[data-confirm]').addEventListener('click', function () { done(true); closeModal(); });
    });
  }

  // ---------- rendering ----------
  function counts() {
    var d = state.data;
    return {
      requirements: d.requirements.length,
      applicants: d.applicants.length,
      leads: d.leads.length,
      jobs: d.jobs.filter(function (j) { return j.isActive; }).length,
      caseStudies: d.caseStudies.filter(function (c) { return c.published; }).length
    };
  }

  function shell() {
    root.innerHTML =
      '<header class="dc-top"><div class="dc-top-in">' +
        '<span class="dc-logo"><img src="/assets/dtech-logo-blue.webp" width="324" height="142" alt="D-TECH"></span>' +
        '<div class="dc-title">Management Console<small>D-TECH Solution Integrators</small></div>' +
        '<div class="dc-counts" id="dc-counts"></div>' +
        '<button type="button" class="dc-btn dc-btn-light" id="dc-refresh">Refresh</button>' +
        '<button type="button" class="dc-btn dc-btn-light" id="dc-logout">' + icon('lock') + 'Log Out</button>' +
      '</div></header>' +
      '<main class="dc-main"><div id="dc-notes"></div><nav class="dc-tabs" role="tablist" id="dc-tabs"></nav><div id="dc-panel" class="dc-card" role="tabpanel"><div class="dc-loading">Loading the latest records…</div></div></main>';
    toastEl = document.createElement('div');
    toastEl.className = 'dc-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    root.appendChild(toastEl);
    modal = document.createElement('dialog');
    modal.className = 'dc-modal';
    root.appendChild(modal);
  }

  function renderChrome() {
    var c = counts();
    document.getElementById('dc-counts').innerHTML =
      '<span class="dc-count"><b>' + c.requirements + '</b>requirements</span>' +
      '<span class="dc-count"><b>' + c.applicants + '</b>applicants</span>' +
      '<span class="dc-count"><b>' + c.leads + '</b>leads</span>' +
      '<span class="dc-count"><b>' + c.jobs + '</b>open roles</span>';
    document.getElementById('dc-tabs').innerHTML = TABS.map(function (t) {
      return '<button type="button" role="tab" class="dc-tab" data-tab="' + t.id + '" aria-selected="' + (t.id === state.tab) + '">' + esc(t.label) + '<span>' + c[t.id] + '</span></button>';
    }).join('');
    var notes = [];
    if (!state.data.hasInbox) notes.push('New client requirements, job applications and case-study leads are still emailed to sales, but they are not being saved here yet. Ask your website administrator to finish the storage setup.');
    if (!state.data.canSave) notes.push('Changes to careers and case studies cannot be saved yet. Ask your website administrator to finish the publishing setup.');
    document.getElementById('dc-notes').innerHTML = notes.map(function (n) { return '<p class="dc-note">' + esc(n) + '</p>'; }).join('');
  }

  function bar(title, q, extra) {
    return '<div class="dc-bar"><h2>' + esc(title) + '</h2>' +
      (q !== null ? '<input type="search" class="dc-search" data-search placeholder="Search…" aria-label="Search" value="' + esc(q || '') + '">' : '') +
      (extra || '') + '</div>';
  }

  function table(headers, rowsHtml, emptyText) {
    if (!rowsHtml.length) return '<div class="dc-empty">' + esc(emptyText) + '</div>';
    return '<div class="dc-scroll"><table class="dc-table"><thead><tr>' +
      headers.map(function (h) { return '<th' + (h === '' ? ' aria-label="Actions"' : '') + '>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rowsHtml.join('') + '</tbody></table></div>';
  }

  var VIEWS = {
    requirements: function () {
      var q = state.query.requirements || '';
      var list = state.data.requirements.filter(function (r) { return matches(r, ['name', 'company', 'topic', 'email', 'phone', 'message'], q); });
      return bar('Client Requirements', q, '<button type="button" class="dc-btn dc-btn-primary" data-export="requirements">' + '📥 Download Excel (CSV)</button>') +
        table(['Client Name', 'Company', 'Requirement Topic', 'Phone', 'Email', 'Date', ''], list.map(function (r) {
          return '<tr><td class="dc-strong">' + esc(r.name) + '</td><td>' + esc(r.company || '—') + '</td><td>' + esc(r.topic || 'General') + '</td>' +
            '<td>' + tel(r.phone) + '</td><td>' + mail(r.email) + '</td><td class="dc-sub">' + esc(fmtDate(r.date)) + '</td>' +
            '<td><div class="dc-actions"><button type="button" class="dc-btn" data-view-req="' + esc(r.id) + '">' + icon('eye') + 'View Full Scope</button></div></td></tr>';
        }), q ? 'No requirements match your search.' : 'No client requirements yet. New ones from the Contact page will appear here.');
    },
    applicants: function () {
      var q = state.query.applicants || '';
      var list = state.data.applicants.filter(function (a) { return matches(a, ['name', 'role', 'email', 'phone', 'location'], q); });
      return bar('Job Applicants', q, '<button type="button" class="dc-btn" data-export="applicants">' + icon('file-spreadsheet') + 'Export List</button>') +
        table(['Candidate Name', 'Role Applied For', 'Phone', 'Email', 'Date', ''], list.map(function (a) {
          var cv = a.cv
            ? '<a class="dc-btn dc-btn-primary" href="/api/admin/data?cv=' + encodeURIComponent(a.id) + '" download>' + '📄 Download CV</a>'
            : '<span class="dc-sub">No CV attached</span>';
          return '<tr><td class="dc-strong">' + esc(a.name) + '</td><td>' + esc(a.role) + (a.location ? '<div class="dc-sub">' + esc(a.location) + '</div>' : '') + '</td>' +
            '<td>' + tel(a.phone) + '</td><td>' + mail(a.email) + '</td><td class="dc-sub">' + esc(fmtDate(a.date)) + '</td>' +
            '<td><div class="dc-actions">' + cv + '<button type="button" class="dc-btn" data-view-note="' + esc(a.id) + '">View Note</button></div></td></tr>';
        }), q ? 'No applicants match your search.' : 'No applications yet. New ones from the Careers page will appear here.');
    },
    leads: function () {
      var q = state.query.leads || '';
      var list = state.data.leads.filter(function (l) { return matches(l, ['name', 'company', 'email', 'phone', 'caseTitle'], q); });
      return bar('Case Study Leads', q, '<button type="button" class="dc-btn dc-btn-primary" data-export="leads">' + icon('file-spreadsheet') + 'Export Leads</button>') +
        table(['Requester Name', 'Company', 'Phone', 'Email', 'Case Study Requested', 'Date'], list.map(function (l) {
          return '<tr><td class="dc-strong">' + esc(l.name || '—') + '</td><td>' + esc(l.company || '—') + '</td><td>' + tel(l.phone) + '</td><td>' + mail(l.email) + '</td>' +
            '<td>' + esc(l.caseTitle || l.caseId) + '</td><td class="dc-sub">' + esc(fmtDate(l.date)) + '</td></tr>';
        }), q ? 'No leads match your search.' : 'No case-study requests yet. New ones from the Case Studies page will appear here.');
    },
    jobs: function () {
      var q = state.query.jobs || '';
      var can = state.data.canSave;
      var list = state.data.jobs.filter(function (j) { return matches(j, ['title', 'department', 'location', 'summary'], q); });
      return bar('Manage Careers', q, '<button type="button" class="dc-btn dc-btn-accent" data-new-job' + (can ? '' : ' disabled') + '>+ Post New Opening</button>') +
        table(['Job Title', 'Department', 'Location', 'Openings', 'Status', ''], list.map(function (j) {
          return '<tr><td class="dc-strong">' + esc(j.title) + '</td><td>' + esc(j.department) + '</td><td>' + esc(j.location) + '</td><td>' + esc(j.positions) + '</td>' +
            '<td>' + toggle('job', j.id, j.isActive, 'Active', 'Closed', can) + '</td>' +
            '<td><div class="dc-actions"><button type="button" class="dc-btn" data-edit-job="' + esc(j.id) + '"' + (can ? '' : ' disabled') + '>Edit</button>' +
            '<button type="button" class="dc-btn dc-btn-danger" data-delete="job" data-id="' + esc(j.id) + '"' + (can ? '' : ' disabled') + '>Delete</button></div></td></tr>';
        }), q ? 'No openings match your search.' : 'No openings yet. Use “Post New Opening” to add one.');
    },
    caseStudies: function () {
      var q = state.query.caseStudies || '';
      var can = state.data.canSave;
      var list = state.data.caseStudies.filter(function (c) { return matches(c, ['client', 'arch_tag', 'industry', 'summary'], q); });
      var cards = list.map(function (c) {
        var custom = c.custom
          ? '<span class="dc-actions"><button type="button" class="dc-btn" data-edit-cs="' + esc(c.id) + '"' + (can ? '' : ' disabled') + '>Edit</button>' +
            '<button type="button" class="dc-btn dc-btn-danger" data-delete="caseStudy" data-id="' + esc(c.id) + '"' + (can ? '' : ' disabled') + '>Delete</button></span>'
          : '';
        return '<article class="dc-cs' + (c.published ? '' : ' is-off') + '"><span class="dc-chip">' + esc(CATEGORIES[c.category] || c.category) + '</span>' +
          '<div class="dc-cs-name">' + esc(c.client) + '</div><div>' + esc(c.arch_tag) + '</div><div class="dc-sub">' + esc(c.industry) + '</div>' +
          '<div class="dc-cs-foot">' + toggle('caseStudy', c.id, c.published, 'Published', 'Hidden', can) + custom + '</div></article>';
      });
      return bar('Manage Case Studies', q, '<button type="button" class="dc-btn dc-btn-accent" data-new-cs' + (can ? '' : ' disabled') + '>+ Add Case Study</button>') +
        (cards.length ? '<div class="dc-grid">' + cards.join('') + '</div>' : '<div class="dc-empty">' + (q ? 'No case studies match your search.' : 'No case studies yet.') + '</div>');
    }
  };

  function toggle(type, id, on, onLabel, offLabel, enabled) {
    return '<label class="dc-switch"><input type="checkbox" data-toggle="' + type + '" data-id="' + esc(id) + '"' + (on ? ' checked' : '') + (enabled ? '' : ' disabled') + '>' +
      '<span class="dc-track" aria-hidden="true"></span><span data-toggle-label>' + (on ? onLabel : offLabel) + '</span></label>';
  }

  function renderPanel() {
    var panel = document.getElementById('dc-panel');
    panel.innerHTML = VIEWS[state.tab]();
    refreshIcons();
  }

  function render() {
    renderChrome();
    renderPanel();
  }

  // ---------- details ----------
  function find(list, id) { return state.data[list].filter(function (x) { return x.id === id; })[0]; }

  function showRequirement(id) {
    var r = find('requirements', id);
    if (!r) return;
    openModal('Requirement from ' + (r.name || 'client'),
      '<dl class="dc-dl"><dt>Client</dt><dd>' + esc(r.name) + '</dd><dt>Company</dt><dd>' + esc(r.company || '—') + '</dd>' +
      '<dt>Topic</dt><dd>' + esc(r.topic || 'General') + '</dd><dt>Phone</dt><dd>' + tel(r.phone) + '</dd><dt>Email</dt><dd>' + mail(r.email) + '</dd>' +
      '<dt>Received</dt><dd>' + esc(fmtDate(r.date)) + '</dd></dl>' +
      '<p class="dc-sub">Full scope, including any items the client added from the Cart or Estimator:</p><div class="dc-msg">' + esc(r.message || 'No details provided.') + '</div>',
      '<a class="dc-btn dc-btn-primary" href="mailto:' + esc(r.email) + '?subject=' + encodeURIComponent('Re: ' + (r.topic || 'Your requirement')) + '">' + icon('mail') + 'Reply by Email</a><button type="button" class="dc-btn" data-close>Close</button>');
  }

  function showNote(id) {
    var a = find('applicants', id);
    if (!a) return;
    openModal('Note from ' + a.name,
      '<dl class="dc-dl"><dt>Role</dt><dd>' + esc(a.role) + '</dd><dt>Phone</dt><dd>' + tel(a.phone) + '</dd><dt>Email</dt><dd>' + mail(a.email) + '</dd>' +
      '<dt>Applied</dt><dd>' + esc(fmtDate(a.date)) + '</dd></dl><div class="dc-msg">' + esc(a.message || 'The candidate did not add a note.') + '</div>',
      (a.cv ? '<a class="dc-btn dc-btn-primary" href="/api/admin/data?cv=' + encodeURIComponent(a.id) + '" download>' + '📄 Download CV</a>' : '') +
      '<button type="button" class="dc-btn" data-close>Close</button>');
  }

  // ---------- forms ----------
  function field(label, name, value, attrs, wide) {
    return '<label' + (wide ? ' class="dc-wide"' : '') + '>' + esc(label) + '<input name="' + name + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '></label>';
  }
  function area(label, name, value, attrs, hint) {
    return '<label class="dc-wide">' + esc(label) + (hint ? ' <span class="dc-hint">' + esc(hint) + '</span>' : '') + '<textarea name="' + name + '" rows="3" ' + (attrs || '') + '>' + esc(value || '') + '</textarea></label>';
  }

  function jobForm(job) {
    var j = job || { positions: 1 };
    var known = LOCATIONS.concat(state.data.jobs.map(function (x) { return x.location; }))
      .filter(function (v, i, all) { return v && all.indexOf(v) === i; });
    if (j.location && known.indexOf(j.location) === -1) known.push(j.location);
    var departments = state.data.jobs.map(function (x) { return x.department; }).filter(function (v, i, all) { return v && all.indexOf(v) === i; });
    var body = '<form class="dc-form" id="dc-form" novalidate>' +
      field('Job Title *', 'title', j.title, 'required maxlength="120"', true) +
      '<label>Department *<input name="department" list="dc-departments" value="' + esc(j.department || '') + '" required maxlength="80"></label>' +
      '<datalist id="dc-departments">' + departments.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      '<label>Location *<select name="location" required><option value="">Choose a location</option>' +
        known.map(function (l) { return '<option' + (l === j.location ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') +
        '<option value="__other">Other…</option></select></label>' +
      '<label class="dc-wide" hidden id="dc-other-loc">Other location *<input name="locationOther" maxlength="120" placeholder="e.g. Client name, Dahej"></label>' +
      field('Openings *', 'positions', j.positions, 'type="number" min="1" max="99" required') +
      area('Summary *', 'summary', j.summary, 'required maxlength="600"', 'Shown on the careers page') +
      '</form><p class="dc-error" id="dc-form-error" hidden></p>';
    openModal(job ? 'Edit Opening' : 'Post New Opening', body,
      '<button type="button" class="dc-btn" data-close>Cancel</button><button type="button" class="dc-btn dc-btn-accent" data-save-job="' + esc(j.id || '') + '">' + (job ? 'Save Changes' : 'Post Opening') + '</button>');
    var select = modal.querySelector('select[name="location"]');
    select.addEventListener('change', function () { document.getElementById('dc-other-loc').hidden = select.value !== '__other'; });
  }

  function caseForm(cs) {
    var c = cs || { metrics: [], outcomes: [] };
    var metrics = (c.metrics || []).concat([[], [], [], []]).slice(0, 4);
    var body = '<form class="dc-form" id="dc-form" novalidate>' +
      field('Client Name *', 'client', c.client, 'required maxlength="120"') +
      '<label>Category *<select name="category" required><option value="">Choose a category</option>' +
        Object.keys(CATEGORIES).map(function (k) { return '<option value="' + k + '"' + (k === c.category ? ' selected' : '') + '>' + esc(CATEGORIES[k]) + '</option>'; }).join('') +
      '</select></label>' +
      field('Industry *', 'industry', c.industry, 'required maxlength="80" placeholder="e.g. Chemicals & Fertilizers"') +
      field('Project Scope *', 'arch_tag', c.arch_tag, 'required maxlength="120" placeholder="e.g. Plant-wide Network & CCTV"') +
      field('Site / Location', 'location', c.location, 'maxlength="120"') +
      field('Period', 'period', c.period, 'maxlength="120" placeholder="e.g. 2025 – 2026"') +
      area('Summary *', 'summary', c.summary, 'required maxlength="600"', 'One or two sentences for the card') +
      area('The Challenge', 'challenge', c.challenge, 'maxlength="1500"') +
      area('Our Solution', 'solution', c.solution, 'maxlength="1500"') +
      area('Key Outcomes', 'outcomes', (c.outcomes || []).join('\n'), 'maxlength="1300"', 'One per line, up to 6') +
      metrics.map(function (m, i) {
        return field('Highlight ' + (i + 1) + ' label', 'mk' + i, m[0], 'maxlength="40" placeholder="e.g. Sites"') + field('Highlight ' + (i + 1) + ' value', 'mv' + i, m[1], 'maxlength="40" placeholder="e.g. 2"');
      }).join('') +
      '</form><p class="dc-error" id="dc-form-error" hidden></p>';
    openModal(cs ? 'Edit Case Study' : 'Add Case Study', body,
      '<button type="button" class="dc-btn" data-close>Cancel</button><button type="button" class="dc-btn dc-btn-accent" data-save-cs="' + esc(c.id || '') + '">' + (cs ? 'Save Changes' : 'Add Case Study') + '</button>');
  }

  function formError(message) {
    var el = document.getElementById('dc-form-error');
    el.textContent = message;
    el.hidden = !message;
  }

  function save(type, action, payload, button) {
    if (button) button.disabled = true;
    return api('/api/admin/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.assign({ type: type, action: action }, payload))
    }).then(function (res) {
      state.data[type === 'job' ? 'jobs' : 'caseStudies'] = res.items;
      render();
      toast(LIVE_NOTE);
      return true;
    }).finally(function () { if (button) button.disabled = false; });
  }

  function submitJob(id, button) {
    var form = document.getElementById('dc-form');
    var f = form.elements;
    var location = f.location.value === '__other' ? f.locationOther.value.trim() : f.location.value;
    if (!f.title.value.trim() || !f.department.value.trim() || !location || !f.summary.value.trim()) return formError('Please fill in every field marked *.');
    save('job', 'save', {
      id: id || undefined,
      item: { title: f.title.value, department: f.department.value, location: location, positions: Number(f.positions.value), summary: f.summary.value }
    }, button).then(closeModal, function (err) { formError(err.message); });
  }

  function submitCase(id, button) {
    var f = document.getElementById('dc-form').elements;
    if (!f.client.value.trim() || !f.category.value || !f.industry.value.trim() || !f.arch_tag.value.trim() || !f.summary.value.trim()) {
      return formError('Please fill in every field marked *.');
    }
    var metrics = [0, 1, 2, 3].map(function (i) { return [f['mk' + i].value, f['mv' + i].value]; });
    save('caseStudy', 'save', {
      id: id || undefined,
      item: {
        client: f.client.value, category: f.category.value, industry: f.industry.value, arch_tag: f.arch_tag.value,
        location: f.location.value, period: f.period.value, summary: f.summary.value, challenge: f.challenge.value,
        solution: f.solution.value, outcomes: f.outcomes.value.split('\n'), metrics: metrics
      }
    }, button).then(closeModal, function (err) { formError(err.message); });
  }

  // ---------- events ----------
  function onClick(event) {
    var t = event.target.closest('button, a');
    if (!t) return;
    var d = t.dataset;
    if (d.tab) { state.tab = d.tab; render(); return; }
    if ('close' in d) { closeModal(); return; }
    if (t.id === 'dc-refresh') { load(); return; }
    if (t.id === 'dc-logout') {
      api('/api/admin/auth', { method: 'DELETE' }).then(function () { location.href = '/'; }, function () { location.href = '/'; });
      return;
    }
    if (d.viewReq) return showRequirement(d.viewReq);
    if (d.viewNote) return showNote(d.viewNote);
    if (d.export === 'requirements') {
      return downloadCsv('client-requirements-' + today() + '.csv', ['Date', 'Client Name', 'Company', 'Topic', 'Phone', 'Email', 'Full Scope'],
        state.data.requirements.map(function (r) { return [fmtDate(r.date), r.name, r.company, r.topic, r.phone, r.email, r.message]; }));
    }
    if (d.export === 'applicants') {
      return downloadCsv('job-applicants-' + today() + '.csv', ['Date', 'Candidate Name', 'Role Applied For', 'Location', 'Phone', 'Email', 'CV Attached', 'Note'],
        state.data.applicants.map(function (a) { return [fmtDate(a.date), a.name, a.role, a.location, a.phone, a.email, a.cv ? 'Yes' : 'No', a.message]; }));
    }
    if (d.export === 'leads') {
      return downloadCsv('case-study-leads-' + today() + '.csv', ['Date', 'Requester Name', 'Company', 'Phone', 'Email', 'Case Study Requested'],
        state.data.leads.map(function (l) { return [fmtDate(l.date), l.name, l.company, l.phone, l.email, l.caseTitle || l.caseId]; }));
    }
    if ('newJob' in d) return jobForm(null);
    if (d.editJob) return jobForm(find('jobs', d.editJob));
    if ('newCs' in d) return caseForm(null);
    if (d.editCs) return caseForm(find('caseStudies', d.editCs));
    if ('saveJob' in d) return submitJob(d.saveJob, t);
    if ('saveCs' in d) return submitCase(d.saveCs, t);
    if (d.delete) {
      var list = d.delete === 'job' ? 'jobs' : 'caseStudies';
      var item = find(list, d.id);
      if (!item) return;
      var name = item.title || item.client;
      confirmBox('Delete “' + name + '”?', 'This removes it from the website and from this list. To take it down only for now, switch it off instead.', 'Delete')
        .then(function (yes) {
          if (!yes) return;
          save(d.delete, 'delete', { id: d.id }).catch(function (err) { toast(err.message, true); });
        });
    }
  }

  function onChange(event) {
    var input = event.target;
    if (!input.dataset || !input.dataset.toggle) return;
    var type = input.dataset.toggle;
    var value = input.checked;
    var label = input.parentNode.querySelector('[data-toggle-label]');
    var words = type === 'job' ? ['Active', 'Closed'] : ['Published', 'Hidden'];
    label.textContent = value ? words[0] : words[1];
    input.disabled = true;
    save(type, 'toggle', { id: input.dataset.id, value: value }).catch(function (err) {
      input.checked = !value;
      input.disabled = false;
      label.textContent = !value ? words[0] : words[1];
      toast(err.message, true);
    });
  }

  function onInput(event) {
    if (!('search' in event.target.dataset)) return;
    state.query[state.tab] = event.target.value;
    var pos = event.target.selectionStart;
    renderPanel();
    var box = document.querySelector('[data-search]');
    if (box) { box.focus(); box.setSelectionRange(pos, pos); }
  }

  function load() {
    return api('/api/admin/data').then(function (data) {
      state.data = data;
      render();
    }, function (err) {
      if (err.message === 'Signed out') return;
      document.getElementById('dc-panel').innerHTML = '<div class="dc-empty">' + esc(err.message) + ' <button type="button" class="dc-btn" id="dc-refresh">Try again</button></div>';
    });
  }

  // ---------- boot ----------
  document.title = 'Management Console | D-TECH';
  // The console is light-only; the site's dark stylesheet would restyle its inputs and dialogs.
  document.documentElement.setAttribute('data-theme', 'light');
  var darkCss = document.getElementById('theme-dark-css');
  if (darkCss) darkCss.disabled = true;
  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.body.innerHTML = '';
  document.body.className = '';
  document.body.style.margin = '0';
  root = document.createElement('div');
  root.className = 'dc';
  document.body.appendChild(root);
  shell();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  load();
})();
