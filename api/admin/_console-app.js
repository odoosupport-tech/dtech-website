/* D-TECH Management Console. Served by api/admin/console.js to signed-in
 * sessions only, and injected into portal.html (the admin sign-in page at
 * /admin-dtech), replacing its content. Styles are scoped under .dc so nothing
 * leaks into the public bundle. */
(function () {
  'use strict';

  var CSS = [
    '.dc{--navy:#0b2f52;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--soft:#f8fafc;--blue:#2563eb;--blue-d:#1d4ed8;--brand:#008ccf;--orange:#f0561d;--ok:#059669;--warn:#b45309;--bad:#b91c1c;',
    'min-height:100vh;background:#f1f5f9;color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.5}',
    '.dc *{box-sizing:border-box}',
    'html:has(.dc){color-scheme:light;background:#f1f5f9}',
    '.dc-top{background:var(--navy);color:#fff;border-bottom:4px solid var(--orange)}',
    '.dc-top-in{max-width:1400px;margin:0 auto;padding:14px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:16px}',
    '.dc-logo{background:#fff;border-radius:10px;padding:6px 10px;display:inline-flex;border:0;cursor:pointer;font:inherit}',
    '.dc-logo:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
    '.dc-logo img{height:30px;width:auto;display:block}',
    '.dc-title{font-weight:800;font-size:18px;letter-spacing:-.01em}',
    '.dc-title small{display:block;font-weight:500;font-size:12px;color:#bfdbfe}',
    '.dc-counts{display:flex;flex-wrap:wrap;gap:8px;margin-left:auto}',
    '.dc-count{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 12px;font-size:12px;white-space:nowrap}',
    '.dc-count b{font-size:14px;margin-right:4px}',
    '.dc-main{max-width:1400px;margin:0 auto;padding:20px}',
    '.dc-tabs{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;padding-bottom:4px;margin-bottom:16px}',
    '.dc-menu-wrap{position:relative}',
    '.dc-caret{display:inline-block;width:7px;height:7px;margin:0 2px 3px 10px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .15s;vertical-align:middle}',
    '.dc-menu-btn[aria-expanded="true"] .dc-caret{transform:rotate(-135deg);margin-bottom:-1px}',
    '.dc-menu{position:absolute;left:0;top:calc(100% + 6px);z-index:30;min-width:260px;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.16);padding:6px}',
    '.dc-menu[hidden]{display:none}',
    '.dc-menu-item{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;border:0;background:none;text-align:left;padding:10px 12px;border-radius:8px;font:inherit;font-weight:600;font-size:14px;color:var(--ink);cursor:pointer}',
    '.dc-menu-item:hover,.dc-menu-item:focus-visible{background:#f1f5f9;outline:none}',
    '.dc-menu-item[aria-current="page"]{background:var(--navy);color:#fff}',
    '.dc-menu-item span{background:rgba(15,23,42,.08);border-radius:999px;padding:0 8px;font-size:12px}',
    '.dc-menu-item[aria-current="page"] span{background:rgba(255,255,255,.2)}',
    '.dc-tab{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:10px 16px;font-weight:600;font-size:14px;cursor:pointer;white-space:nowrap;transition:background-color .15s,color .15s,border-color .15s}',
    '.dc-tab:hover{border-color:#94a3b8}',
    '.dc-tab.is-active{background:var(--navy);border-color:var(--navy);color:#fff}',
    '.dc-tab span{display:inline-block;margin-left:6px;background:rgba(15,23,42,.08);border-radius:999px;padding:0 8px;font-size:12px}',
    '.dc-tab.is-active span{background:rgba(255,255,255,.2)}',
    '.dc .dc-card{padding:0;margin:0}',
    '.dc-card{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.04)}',
    '.dc-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}',
    '.dc-bar h2{font-size:17px;line-height:1.3;font-weight:800;letter-spacing:normal;color:var(--ink);margin:0 auto 0 0;padding:0}',
    '.dc-intro{margin:0;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--soft);color:#334155;font-size:13px}',
    '.dc-search{border:1px solid #cbd5e1;border-radius:10px;padding:8px 12px;font-size:14px;min-width:220px;background:#fff;color:var(--ink)}',
    '.dc-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#fff;color:var(--ink);border-radius:10px;padding:8px 14px;font-weight:600;font-size:13px;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background-color .15s,border-color .15s}',
    '.dc-btn:hover{background:var(--soft);border-color:#94a3b8}',
    '.dc-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.dc-btn-primary{background:var(--blue);border-color:var(--blue);color:#fff}',
    '.dc-btn-primary:hover{background:var(--blue-d);border-color:var(--blue-d)}',
    '.dc-btn-accent{background:var(--orange);border-color:var(--orange);color:#fff}',
    '.dc-btn-accent:hover{background:#d9490f;border-color:#d9490f}',
    '.dc-btn-danger{color:var(--bad);border-color:#fecaca}',
    '.dc-btn-danger:hover{background:#fef2f2;border-color:#fca5a5}',
    '.dc-btn-light{background:transparent;color:#fff;border-color:rgba(255,255,255,.4)}',
    '.dc-btn-light:hover{background:rgba(255,255,255,.12);border-color:#fff}',
    '.dc-btn svg,.dc-count svg,.dc-preview-label svg{width:16px;height:16px}',
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
    '.dc-mail-status{font-size:14px;line-height:1.5;margin:0 0 12px;padding:10px 12px;border-radius:8px;background:#f1f5f9}',
    '.dc-mail-ok,.dc-mail-sent{background:#ecfdf5;color:#065f46}',
    '.dc-mail-failed,.dc-mail-missing{background:#fef2f2;color:#991b1b}',
    '.dc-mail-table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0}',
    '.dc-mail-table th,.dc-mail-table td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere}',
    '.dc-mail-table th{font-weight:600;color:var(--muted);width:45%}',
    '.dc-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
    '.dc-empty{padding:48px 16px;text-align:center;color:var(--muted)}',
    '.dc-note{border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:13px;border:1px solid #fde68a;background:#fffbeb;color:#92400e}',
    '.dc-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:13px;user-select:none}',
    '.dc-switch input{position:absolute;opacity:0;width:1px;height:1px}',
    '.dc-track{flex:none;width:40px;height:22px;border-radius:999px;background:#cbd5e1;position:relative;transition:background-color .15s}',
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
    '.dc-tags{display:flex;flex-wrap:wrap;gap:6px}',
    '.dc-chip{display:inline-block;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:600;background:#e0f2fe;color:#075985;white-space:nowrap}',
    '.dc-chip-live{background:#d1fae5;color:#065f46}',
    '.dc-chip-wait{background:#e0e7ff;color:#3730a3}',
    '.dc-chip-off{background:#f1f5f9;color:#475569}',
    '.dc-chip-warn{background:#fef3c7;color:#92400e}',
    '.dc-cs-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:8px;border-top:1px solid var(--line)}',
    '.dc-dash{display:flex;flex-direction:column;gap:24px;padding:20px}',
    '.dc-dash-h{margin:0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}',
    '.dc-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}',
    '.dc-card-alert{background:linear-gradient(135deg,#0b2f52 0%,#0052cc 100%);color:#fff;border:0;border-radius:14px;padding:20px 24px;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;text-align:left;font:inherit;width:100%}',
    '.dc-card-alert:hover{transform:translateY(-2px);box-shadow:0 10px 25px -8px rgba(0,82,204,.5)}',
    '.dc-card-alert .dc-kpi-title{display:block;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.9}',
    '.dc-card-alert .dc-kpi-num{display:block;font-size:42px;font-weight:800;line-height:1.1;margin:10px 0 4px}',
    '.dc-card-alert .dc-kpi-sub{display:block;font-size:12px;opacity:.8}',
    '.dc-card-stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px 24px;cursor:pointer;transition:transform .15s ease,border-color .15s ease;text-align:left;font:inherit;width:100%}',
    '.dc-card-stat:hover{transform:translateY(-2px);border-color:var(--blue)}',
    '.dc-card-stat .dc-kpi-title{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;color:var(--muted)}',
    '.dc-card-stat .dc-kpi-num{display:block;font-size:36px;font-weight:800;color:var(--ink);margin:8px 0 4px}',
    '.dc-card-stat .dc-kpi-sub{display:block;font-size:12px;color:var(--muted)}',
    '.dc-status{display:flex;flex-direction:column;align-items:flex-start;gap:6px}',
    '.dc-swatch{flex:none;display:inline-block;width:12px;height:12px;border-radius:4px;vertical-align:-1px;margin-right:6px}',
    '.dc-modal{background:#fff;color:var(--ink);border:0;border-radius:16px;padding:0;width:min(640px,calc(100vw - 32px));max-height:calc(100vh - 32px);box-shadow:0 20px 50px rgba(15,23,42,.3)}',
    '.dc-modal-mid{width:min(860px,calc(100vw - 32px))}',
    '.dc-modal-wide{width:min(1080px,calc(100vw - 32px))}',
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
    '.dc-form{display:grid;grid-template-columns:1fr 1fr;gap:14px 12px;align-content:start}',
    '.dc-form .dc-wide{grid-column:1/-1}',
    '.dc-form [hidden]{display:none}',
    '.dc-f{display:flex;flex-direction:column;gap:5px;min-width:0}',
    '.dc-f>label,.dc-f-label,.dc-seg legend{font-weight:600;font-size:13px;color:var(--ink)}',
    '.dc-req{color:var(--bad)}',
    '.dc-form input:not([type=checkbox]):not([type=radio]),.dc-form select,.dc-form textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:9px 12px;font:inherit;font-weight:400;color:var(--ink);background:#fff}',
    '.dc-form textarea{resize:vertical;line-height:1.5}',
    '.dc-form input[type=file]{padding:7px 10px;background:var(--soft)}',
    '.dc-check{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-weight:500}',
    '.dc-check input{width:auto}',
    '.dc-form input:focus,.dc-form select:focus,.dc-form textarea:focus,.dc-search:focus{outline:2px solid var(--blue);outline-offset:0;border-color:var(--blue)}',
    '.dc-form [aria-invalid="true"]{border-color:#dc2626!important;background:#fef2f2!important}',
    '.dc-hint{font-weight:400;color:var(--muted);font-size:12px;margin:0}',
    '.dc-f-foot{display:flex;align-items:baseline;gap:8px}',
    '.dc-err{color:var(--bad);font-size:12px;font-weight:600;margin:0}',
    '.dc-counter{font-size:11px;color:var(--muted);margin-left:auto;white-space:nowrap}',
    '.dc-counter.is-near{color:var(--warn);font-weight:700}',
    '.dc-section{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:14px 12px;padding-top:16px;border-top:1px solid var(--line)}',
    '.dc-section:first-child{padding-top:0;border-top:0}',
    '.dc-section h4{grid-column:1/-1;margin:0;font-size:14px;font-weight:800;color:var(--navy)}',
    '.dc-section h4+.dc-hint{grid-column:1/-1;margin-top:-10px}',
    '.dc-metric{grid-column:1/-1;display:grid;grid-template-columns:24px 1fr 1.4fr;gap:8px;align-items:start}',
    '.dc-metric-n{font-weight:800;color:var(--muted);text-align:center;padding-top:9px}',
    '.dc-metric .dc-err{grid-column:2/-1}',
    '.dc-seg{border:0;margin:0;padding:0;min-width:0;display:flex;flex-wrap:wrap;gap:6px}',
    '.dc-seg legend{padding:0;margin-bottom:6px;width:100%}',
    '.dc-seg label{position:relative;display:inline-flex;align-items:center;gap:8px;border:1px solid #cbd5e1;border-radius:10px;padding:8px 12px;font-weight:600;font-size:13px;cursor:pointer;background:#fff}',
    '.dc-seg label small{font-weight:400;color:var(--muted)}',
    '.dc-seg input{position:absolute;opacity:0;width:1px;height:1px}',
    '.dc-seg label:has(input:checked){border-color:var(--blue);background:#eff6ff;box-shadow:inset 0 0 0 1px var(--blue)}',
    '.dc-seg label:has(input:focus-visible){outline:2px solid var(--blue);outline-offset:2px}',
    '.dc-seg .dc-err{width:100%}',
    '.dc-current{margin:0;padding:8px 12px;border-radius:10px;background:var(--soft);border:1px solid var(--line);font-size:13px;word-break:break-all}',
    '.dc-current a{color:var(--blue)}',
    '.dc-error{color:var(--bad);font-weight:600;font-size:13px;margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca}',
    '.dc-error[hidden]{display:none}',
    '.dc-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,390px);gap:24px;align-items:start}',
    '.dc-preview{position:sticky;top:0}',
    '.dc-preview-label{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}',
    '.dc-preview-frame{background:#eef3f7;border:1px dashed #cbd5e1;border-radius:14px;padding:16px}',
    '.dc-preview-note{margin:10px 0 0;font-size:12px;color:var(--muted)}',
    '.dc-preview-note.is-warn{color:var(--warn);font-weight:600}',
    '.dc-pv-job{background:#fff;border:1px solid #dce8f1;border-top:4px solid #27b6da;border-radius:18px;padding:24px;color:#142b41;transition:opacity .15s}',
    '.dc-pv-job.is-off{opacity:.5}',
    '.dc-pv-meta{display:flex;flex-wrap:wrap;align-items:center;gap:14px;font:500 12px/1.4 "IBM Plex Mono",ui-monospace,Menlo,monospace;color:#607182}',
    '.dc-pv-meta svg{display:inline-block;width:14px;height:14px;margin-right:4px;vertical-align:-2px}',
    '.dc-pv-badge{padding:4px 10px;border-radius:999px;background:#e9f7f1;color:#2cb67d;font-weight:700;letter-spacing:.08em;text-transform:uppercase}',
    '.dc-pv-job h3{margin:10px 0 8px;font:700 20px/1.25 "Inter Tight",Inter,sans-serif;letter-spacing:-.01em;color:#0f253b;word-break:break-word}',
    '.dc-pv-body{color:#576e82;font-size:15px;line-height:1.65;word-break:break-word}',
    '.dc-pv-body p{margin:0}',
    '.dc-pv-body p+p,.dc-pv-body p+ul,.dc-pv-body ul+p,.dc-pv-body ul+ul{margin-top:10px}',
    '.dc-pv-body ul{margin:0;padding-left:1.25em;list-style:disc}',
    '.dc-pv-foot{margin-top:16px}',
    '.dc-pv-btn{display:inline-flex;align-items:center;gap:12px;padding:10px 16px;min-height:40px;border-radius:8px;background:#0075ae;color:#fff;font:700 11px/1.4 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase}',
    '.dc-pv-empty{color:#94a3b8;font-style:italic}',
    '.dc-pv-banner{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;font:500 13px/1.45 Inter,sans-serif}',
    '.dc-pv-banner[data-tone="info"]{background:#0075ae;color:#fff}',
    '.dc-pv-banner[data-tone="highlight"]{background:#c2410c;color:#fff}',
    '.dc-pv-banner[data-tone="warning"]{background:#fbbf24;color:#1f1300}',
    '.dc-pv-banner svg{flex:none;width:18px;height:18px}',
    '.dc-pv-banner p{margin:0;flex:1;word-break:break-word;color:inherit}',
    '.dc-pv-banner a{color:inherit;font-weight:700;text-decoration:underline;text-underline-offset:3px;margin-left:6px;white-space:nowrap}',
    '.dc-pv-banner .dc-pv-x{flex:none;font-size:18px;line-height:1;opacity:.8}',
    '.dc-busy{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;background:rgba(255,255,255,.94);border-radius:16px}',
    '.dc-busy strong{font-size:16px;color:var(--ink)}',
    '.dc-busy .dc-sub{max-width:380px;font-size:13px}',
    '.dc-spin{width:30px;height:30px;border-radius:50%;border:3px solid #cbd5e1;border-top-color:var(--blue);animation:dc-spin .8s linear infinite}',
    '.dc-modal.is-busy .dc-modal-body,.dc-modal.is-busy .dc-modal-foot{pointer-events:none}',
    '.dc-progress{position:fixed;left:0;right:0;top:0;height:3px;z-index:70;overflow:hidden;background:rgba(37,99,235,.15);opacity:0;transition:opacity .2s}',
    '.dc-progress.is-on{opacity:1}',
    '.dc-progress::after{content:"";position:absolute;top:0;bottom:0;left:-40%;width:40%;background:var(--blue);animation:dc-bar 1.1s ease-in-out infinite}',
    '.dc-deploy{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;white-space:nowrap;cursor:default}',
    '.dc-deploy[hidden]{display:none}',
    '.dc-deploy[data-state="working"]{background:#fef3c7;color:#92400e}',
    '.dc-deploy[data-state="live"]{background:#d1fae5;color:#065f46}',
    '.dc-deploy[data-state="slow"],.dc-deploy[data-state="unknown"]{background:#fee2e2;color:#991b1b}',
    '.dc-dot{width:8px;height:8px;border-radius:50%;background:currentColor}',
    '.dc-deploy[data-state="working"] .dc-dot,.dc-deploy[data-state="slow"] .dc-dot{animation:dc-pulse 1.2s ease-in-out infinite}',
    '.dc-toast{position:fixed;right:20px;bottom:20px;z-index:60;background:var(--ink);color:#fff;padding:12px 16px;border-radius:12px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:380px;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:none}',
    '.dc-toast.is-on{opacity:1;transform:none}',
    '.dc-toast.is-bad{background:#991b1b}',
    '.dc-toast.is-ok{background:#065f46}',
    '.dc-loading{padding:80px 16px;text-align:center;color:var(--muted);font-size:15px}',
    '.dc-select{border:1px solid #cbd5e1;border-radius:10px;padding:7px 10px;font:inherit;font-size:13px;background:#fff;color:var(--ink);cursor:pointer;max-width:100%}',
    '.dc-select:focus{outline:2px solid var(--blue);outline-offset:0;border-color:var(--blue)}',
    '.dc-select:disabled{opacity:.6;cursor:not-allowed}',
    '.dc-state{font-weight:600}',
    '.dc-state[data-value="new"]{background:#e0f2fe;border-color:#bae6fd;color:#075985}',
    '.dc-state[data-value="contacted"]{background:#e0e7ff;border-color:#c7d2fe;color:#3730a3}',
    '.dc-state[data-value="review"]{background:#fef3c7;border-color:#fde68a;color:#92400e}',
    '.dc-state[data-value="archived"]{background:#f1f5f9;color:#475569}',
    '.dc-follow{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}',
    '.dc-follow h4{margin:0 0 12px;font-size:14px;font-weight:800;color:var(--navy)}',
    '.dc-follow-status{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-weight:600;font-size:13px}',
    '.dc-notes{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:8px}',
    '.dc-notes li{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:10px 12px}',
    '.dc-notes-meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted);margin-bottom:4px}',
    '.dc-notes-text{white-space:pre-wrap;word-break:break-word}',
    '.dc-link-btn{border:0;background:none;padding:0;font:inherit;font-size:12px;font-weight:600;color:var(--bad);cursor:pointer;text-decoration:underline;text-underline-offset:2px}',
    '.dc-link-btn[data-armed]{text-decoration:none;background:#fef2f2;border-radius:6px;padding:0 6px}',
    '.dc-order{list-style:none;margin:0;padding:4px 16px 12px}',
    '.dc-order li{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}',
    '.dc-order li:last-child{border-bottom:0}',
    '.dc-order-n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--soft);border:1px solid var(--line);display:grid;place-items:center;font-weight:800;font-size:12px;color:var(--muted)}',
    '.dc-order-name{flex:1;min-width:0;word-break:break-word}',
    '.dc-order-btns{flex:none;display:flex;gap:6px}',
    '.dc-btn-icon{padding:6px 11px;font-size:15px;line-height:1.2}',
    '@keyframes dc-spin{to{transform:rotate(360deg)}}',
    '@keyframes dc-bar{to{left:100%}}',
    '@keyframes dc-pulse{50%{opacity:.25}}',
    '@media (max-width:900px){.dc-split{grid-template-columns:1fr}.dc-preview{position:static}}',
    '@media (max-width:640px){.dc-form,.dc-section{grid-template-columns:1fr}.dc-dl{grid-template-columns:1fr}.dc-counts{margin-left:0}.dc-search{min-width:0;flex:1}}',
    '@media (prefers-reduced-motion:reduce){.dc *{transition:none!important}.dc-spin,.dc-progress::after,.dc-dot{animation-duration:3s!important}}'
  ].join('\n');

  var TABS = [
    { id: 'dashboard', label: '📊 Dashboard Overview' },
    { id: 'requirements', label: '📋 Client Requirements' },
    { id: 'applicants', label: '👥 Job Applicants' },
    { id: 'leads', label: '📑 Case Study Leads' },
    { id: 'jobs', label: '💼 Manage Careers' },
    { id: 'caseStudies', label: '🏆 Manage Case Studies' }
  ];
  var CATEGORIES = { network: 'Network & IT Infrastructure', services: 'Managed Services', safety: 'Safety, Communication & Automation' };
  var LOCATIONS = ['Bharuch', 'Dahej', 'Jhagadia', 'Ankleshwar', 'Vadodara'];
  var DEPARTMENTS = ['Engineering', 'Field Operations', 'Facility Management Services'];
  var TONES = {
    info: { label: 'Notice', hint: 'general updates', color: '#0075ae' },
    highlight: { label: 'Highlight', hint: 'hiring, launches', color: '#c2410c' },
    warning: { label: 'Urgent', hint: 'closures, outages', color: '#fbbf24' }
  };
  // What each switch means, and where each list lives on the website. The
  // private lists (requirements, applicants, leads) never reach the website.
  var TYPES = {
    job: { list: 'jobs', file: 'jobs.json', on: 'Active', off: 'Closed', isOn: function (j) { return j.isActive; },
      name: function (j) { return j.title; }, detail: function (j) { return j.department + ' · ' + j.location; } },
    caseStudy: { list: 'caseStudies', file: 'case-studies.json', on: 'Published', off: 'Draft', isOn: function (c) { return c.published !== false; },
      name: function (c) { return c.client; }, detail: function (c) { return c.arch_tag; } },
    banner: { list: 'banners', file: 'banners.json', on: 'Active', off: 'Off', isOn: function (b) { return b.isActive; },
      name: function (b) { return b.message; }, detail: function (b) { return schedule(b); } },
    requirement: { list: 'requirements', private: true },
    applicant: { list: 'applicants', private: true },
    lead: { list: 'leads', private: true }
  };
  var TAB_TYPE = { requirements: 'requirement', applicants: 'applicant', leads: 'lead', jobs: 'job', caseStudies: 'caseStudy', banners: 'banner' };
  // Same values as api/admin/update.js. Records saved before statuses existed count as New.
  var STATUSES = {
    new: 'New',
    contacted: 'Contacted',
    review: 'Under Review',
    archived: 'Archived'
  };
  var MAX_PDF_BYTES = 3 * 1024 * 1024;
  var MAX_LOGO_BYTES = 300 * 1024;
  // Same rules as api/admin/update.js.
  var SITE_PATH_RE = /^(\/?[A-Za-z0-9][A-Za-z0-9._\/-]*)?(\?[A-Za-z0-9._~=&%+-]*)?(#[A-Za-z0-9._-]*)?$/;
  var CONTACT_LINK_RE = /^(tel:\+?[0-9 ()-]{3,20}|mailto:[^\s@<>"'()]+@[^\s@<>"'()]+\.[A-Za-z]{2,})$/i;
  var DEPLOY_POLL_MS = 10000;
  var DEPLOY_SLOW_MS = 4 * 60 * 1000;
  var DEPLOY_GIVE_UP_MS = 12 * 60 * 1000;
  var SVG = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    highlight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>'
  };

  // show: status filter per inbox tab. reorder: the unsaved order (list of ids) per site list.
  var state = { tab: 'dashboard', data: null, query: {}, show: {}, reorder: {}, busy: false, leaving: false };
  var deploy = { pending: {}, started: 0, timer: 0, hideTimer: 0 };
  var root, toastEl, modal, progressEl;

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
  function fmtDay(day) {
    var p = String(day || '').split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d) ? day : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  // Today as YYYY-MM-DD in the viewer's time zone, as the public banner script reads it.
  function localDay() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
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

  // Plain text to HTML, as careers.html shows job summaries: lines starting with
  // "- ", "* " or "• " become a bulleted list and an empty line starts a new paragraph.
  function formatSummary(text) {
    var html = '', para = [], items = [];
    function flush() {
      if (para.length) html += '<p>' + para.join('<br>') + '</p>';
      if (items.length) html += '<ul>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
      para = [];
      items = [];
    }
    String(text || '').split('\n').forEach(function (raw) {
      var line = raw.trim();
      var bullet = /^[-*•]\s+(.*)$/.exec(line);
      if (!line) return flush();
      if (bullet) {
        if (para.length) flush();
        items.push(esc(bullet[1]));
      } else {
        if (items.length) flush();
        para.push(esc(line));
      }
    });
    flush();
    return html;
  }

  function toast(message, tone, sticky) {
    toastEl.textContent = message;
    toastEl.classList.toggle('is-bad', tone === 'bad');
    toastEl.classList.toggle('is-ok', tone === 'ok');
    toastEl.classList.add('is-on');
    clearTimeout(toast.timer);
    if (!sticky) toast.timer = setTimeout(function () { toastEl.classList.remove('is-on'); }, tone === 'bad' ? 7000 : 5000);
  }

  // Reloads the sign-in page with a note (see portal.html).
  function backToSignIn(note) {
    state.leaving = true;
    try { localStorage.removeItem('dtech-console'); } catch (e) {}
    history.replaceState(null, '', location.pathname + '#' + note);
    location.reload();
  }

  function signedOut() {
    if (signedOut.done) return;
    signedOut.done = true;
    toast('Your session has ended. Taking you back to sign in…', 'bad', true);
    setTimeout(function () { backToSignIn('session-ended'); }, 1500);
  }

  function api(url, options) {
    return fetch(url, Object.assign({ credentials: 'same-origin', headers: { Accept: 'application/json' } }, options || {}))
      .then(function (r) {
        if (r.status === 404 && url.indexOf('/api/admin/') === 0) { signedOut(); throw new Error('Signed out'); }
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok || !body.ok) {
            var err = new Error(body.error || (r.status === 413 ? 'That file is too large to upload.' : 'Something went wrong. Please try again.'));
            err.field = body.field;
            throw err;
          }
          return body;
        });
      }, function () {
        throw new Error('Cannot reach the server. Check your internet connection and try again.');
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

  // ---------- inbox follow-up ----------
  // The site's own PDFs are lead-gated (middleware.js): open them through the admin
  // route, which redirects to a short-lived signed link. https links open as they are.
  function pdfHref(c) {
    if (!c.pdf_file) return '';
    return /^https?:/.test(c.pdf_file) ? c.pdf_file : '/api/admin/data?pdf=' + encodeURIComponent(c.pdf_file);
  }
  function statusOf(r) { return STATUSES.hasOwnProperty(r.status) ? r.status : 'new'; }
  function notesOf(r) { return Array.isArray(r.notes) ? r.notes : []; }
  function isOpen(r) { return statusOf(r) !== 'archived'; }
  function notesText(r) {
    return notesOf(r).map(function (n) { return fmtDate(n.date) + ': ' + n.text; }).join('\n\n');
  }

  // Inbox tabs show open (not archived) records unless another filter is chosen.
  function shown(r) {
    var v = state.show[state.tab] || 'open';
    return v === 'all' || (v === 'open' ? isOpen(r) : statusOf(r) === v);
  }
  function showFilter() {
    var v = state.show[state.tab] || 'open';
    var options = [['open', 'Open (not archived)']]
      .concat(Object.keys(STATUSES).map(function (k) { return [k, STATUSES[k]]; }))
      .concat([['all', 'Everything']]);
    return '<select class="dc-select" data-show aria-label="Show records by status">' + options.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function emptyInbox(q, all, none) {
    if (q) return 'Nothing matches your search.';
    if ((state.show[state.tab] || 'open') !== 'all' && all.length) return 'Nothing with this status. Change the filter to see the rest.';
    return none;
  }

  function statusSelect(type, r, id) {
    var s = statusOf(r);
    return '<select class="dc-select dc-state" data-status="' + type + '" data-id="' + esc(r.id) + '" data-value="' + s + '"' +
      (id ? ' id="' + id + '"' : ' aria-label="Status of ' + esc(r.name || r.email || 'this record') + '"') + disabledUnless(state.data.hasInbox) + '>' +
      Object.keys(STATUSES).map(function (k) { return '<option value="' + k + '"' + (k === s ? ' selected' : '') + '>' + esc(STATUSES[k]) + '</option>'; }).join('') +
      '</select>';
  }
  // Case-study leads: a PDF emailed, or a summary read on the page. Records from
  // before summaries were tracked are all PDF requests.
  function leadRequest(l) { return l.request === 'summary' ? 'summary' : 'pdf'; }
  function leadRequestChip(l) {
    return leadRequest(l) === 'summary'
      ? '<span class="dc-chip dc-chip-wait">👁 Summary viewed</span>'
      : '<span class="dc-chip">📄 PDF emailed</span>';
  }
  function leadKey(l) { return String(l.email || '').trim().toLowerCase(); }
  // Every lead from the same email address, newest first.
  function leadHistory(l) {
    var key = leadKey(l);
    return key ? state.data.leads.filter(function (x) { return leadKey(x) === key; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }) : [l];
  }

  function noteCount(r) {
    var n = notesOf(r).length;
    return n ? '<div class="dc-sub">💬 ' + n + ' internal note' + (n === 1 ? '' : 's') + '</div>' : '';
  }

  // Status, notes and the add-note box, shown under each record's details.
  function followUp(type, r) {
    var can = state.data.hasInbox;
    var notes = notesOf(r);
    return '<section class="dc-follow" aria-label="Follow-up"><h4>Follow-up</h4>' +
      '<div class="dc-follow-status"><label for="dc-follow-status">Status</label>' + statusSelect(type, r, 'dc-follow-status') + '</div>' +
      (notes.length
        ? '<ol class="dc-notes">' + notes.map(function (n) {
          return '<li><div class="dc-notes-meta"><span>' + esc(fmtDate(n.date)) + '</span>' +
            (can ? '<button type="button" class="dc-link-btn" data-remove-note="' + esc(n.id) + '" data-type="' + type + '" data-id="' + esc(r.id) + '">Remove</button>' : '') +
            '</div><div class="dc-notes-text">' + esc(n.text) + '</div></li>';
        }).join('') + '</ol>'
        : '<p class="dc-sub">No internal notes yet.</p>') +
      (can
        ? '<form class="dc-form" id="dc-form" data-kind="note" novalidate>' +
          textarea({ name: 'note', label: 'Add an internal note', max: 1000, rows: 3, wide: true,
            placeholder: 'e.g. Called on 12 Oct. Sending the quote by Friday.', hint: 'Only staff signed in to this console can see notes.' }) +
          '<div class="dc-wide"><button type="button" class="dc-btn dc-btn-primary" data-add-note="' + type + '" data-id="' + esc(r.id) + '">Add Note</button></div>' +
          '</form><p class="dc-error" id="dc-form-error" role="alert" hidden></p>'
        : '<p class="dc-note">Statuses and notes cannot be saved until the private storage setup is finished.</p>') +
      (can ? '<p class="dc-sub"><button type="button" class="dc-link-btn" data-purge="' + type + '" data-id="' + esc(r.id) + '">Delete permanently</button></p>' : '') +
      '</section>';
  }

  // ---------- banners ----------
  function bannerState(b, day) {
    if (!b.isActive) return 'off';
    if (b.startsOn && day < b.startsOn) return 'soon';
    if (b.endsOn && day > b.endsOn) return 'ended';
    return 'on';
  }
  // The banner visitors see today: the first active one in date (see assets/refined.js).
  function liveBanner(list) {
    var day = localDay();
    return list.filter(function (b) { return bannerState(b, day) === 'on'; })[0] || null;
  }
  function schedule(b) {
    if (b.startsOn && b.endsOn) return fmtDay(b.startsOn) + ' – ' + fmtDay(b.endsOn);
    if (b.startsOn) return 'From ' + fmtDay(b.startsOn);
    if (b.endsOn) return 'Until ' + fmtDay(b.endsOn);
    return 'No end date';
  }
  function bannerHtml(b) {
    var tone = TONES[b.tone] ? b.tone : 'info';
    var link = b.linkLabel ? '<a href="#" tabindex="-1">' + esc(b.linkLabel) + ' <span aria-hidden="true">→</span></a>' : '';
    return '<div class="dc-pv-banner" data-tone="' + tone + '">' + SVG[tone] + '<p>' + (esc(b.message) || '<span class="dc-pv-empty">Your message</span>') + link + '</p><span class="dc-pv-x" aria-hidden="true">×</span></div>';
  }

  // ---------- modal ----------
  // opts.size: 'mid' | 'wide'. opts.form: a form the user may have typed into, so
  // clicking the backdrop does not close it and Escape asks before discarding edits.
  function openModal(title, bodyHtml, footHtml, opts) {
    opts = opts || {};
    modal.className = 'dc-modal' + (opts.size ? ' dc-modal-' + opts.size : '');
    modal.dataset.form = opts.form ? '1' : '';
    modal.dataset.dirty = '';
    modal.innerHTML = '<div class="dc-modal-head"><h3>' + esc(title) + '</h3><button type="button" class="dc-x" data-close aria-label="Close">&#10005;</button></div>' +
      '<div class="dc-modal-body">' + bodyHtml + '</div>' +
      '<div class="dc-modal-foot">' + (footHtml || '<button type="button" class="dc-btn" data-close>Close</button>') + '</div>';
    if (!modal.open) modal.showModal();
    refreshIcons();
  }
  function closeModal() { if (modal.open && !state.busy) modal.close(); }

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

  // ---------- saving ----------
  function publishing() { return state.data.publishing === 'github'; }

  function setBusy(on, opts) {
    state.busy = on;
    var label = opts.label || (publishing() ? 'Committing to GitHub and deploying to Vercel…' : 'Saving…');
    if (opts.inModal) {
      modal.classList.toggle('is-busy', on);
      var el = modal.querySelector('.dc-busy');
      if (on && !el) {
        el = document.createElement('div');
        el.className = 'dc-busy';
        el.setAttribute('role', 'status');
        el.innerHTML = '<span class="dc-spin" aria-hidden="true"></span><strong>' + esc(label) + '</strong>' +
          '<span class="dc-sub">This usually takes a few seconds. Please keep this window open.</span>';
        modal.appendChild(el);
      } else if (!on && el) {
        el.remove();
      }
    } else {
      progressEl.classList.toggle('is-on', on);
      if (on) toast(label, null, true);
    }
  }

  // opts.inModal: show progress over the open dialog. opts.done: the toast for a
  // private-list save (those are not published, so there is no deploy to watch).
  function save(type, action, payload, opts) {
    opts = opts || {};
    var isPrivate = TYPES[type].private;
    if (isPrivate && !opts.label) opts.label = 'Saving…';
    setBusy(true, opts);
    return api('/api/admin/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.assign({ type: type, action: action }, payload))
    }).then(function (res) {
      state.data[TYPES[type].list] = res.items;
      render();
      if (isPrivate) {
        toast(opts.done || 'Saved.', 'ok');
        return res;
      }
      toast(publishing()
        ? 'Saved to GitHub. Vercel is now redeploying the website, so this change will be live within 1–2 minutes.'
        : 'Saved to the local data folder.', 'ok');
      watchDeploy(type, res.items);
      return res;
    }).finally(function () { setBusy(false, opts); });
  }

  // After a save, watch the deployed copy of the file until it matches what
  // was committed, so staff can see when the website has caught up.
  function setDeploy(name) {
    var el = document.getElementById('dc-deploy');
    clearTimeout(deploy.hideTimer);
    el.hidden = !name;
    if (!name) return;
    var text = {
      working: ['Deploying to the website…', 'Vercel is rebuilding the website with your change. This usually takes 1–2 minutes.'],
      live: ['Live on the website', 'The website now shows your latest changes.'],
      slow: ['Still deploying…', 'This is taking longer than usual. The website will update as soon as Vercel finishes.'],
      unknown: ['Could not confirm the update', 'Check the website in a few minutes. If your change still does not show, ask your website administrator to check Vercel.']
    }[name];
    el.dataset.state = name;
    el.title = text[1];
    el.innerHTML = '<span class="dc-dot" aria-hidden="true"></span>' + esc(text[0]);
    if (name === 'live') deploy.hideTimer = setTimeout(function () { el.hidden = true; }, 30000);
  }

  function watchDeploy(type, items) {
    if (!publishing()) return;
    deploy.pending[TYPES[type].file] = JSON.stringify(items);
    deploy.started = Date.now();
    setDeploy('working');
    clearTimeout(deploy.timer);
    deploy.timer = setTimeout(pollDeploy, DEPLOY_POLL_MS);
  }

  function pollDeploy() {
    Promise.all(Object.keys(deploy.pending).map(function (file) {
      return fetch('/api/admin/data?deployed=' + encodeURIComponent(file), { cache: 'no-store', credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (list) {
          if (list && JSON.stringify(list) === deploy.pending[file]) delete deploy.pending[file];
        }, function (err) { console.warn('Deploy check failed:', err.message); });
    })).then(function () {
      if (!Object.keys(deploy.pending).length) {
        setDeploy('live');
        toast('Your changes are now live on the website.', 'ok');
        return;
      }
      var waited = Date.now() - deploy.started;
      if (waited > DEPLOY_GIVE_UP_MS) { deploy.pending = {}; setDeploy('unknown'); return; }
      if (waited > DEPLOY_SLOW_MS) setDeploy('slow');
      deploy.timer = setTimeout(pollDeploy, DEPLOY_POLL_MS);
    });
  }

  // ---------- rendering ----------
  function counts() {
    var d = state.data;
    function fresh(list) { return list.filter(function (r) { return statusOf(r) === 'new'; }).length; }
    return {
      dashboard: fresh(d.requirements) + fresh(d.applicants) + fresh(d.leads),
      requirements: d.requirements.filter(isOpen).length,
      applicants: d.applicants.filter(isOpen).length,
      leads: d.leads.filter(isOpen).length,
      jobs: d.jobs.filter(function (j) { return j.isActive; }).length,
      caseStudies: d.caseStudies.filter(function (c) { return c.published !== false; }).length,
      banners: d.banners.filter(function (b) { return b.isActive; }).length
    };
  }

  // "Check email": signs in to the SMTP server with the Vercel settings and
  // explains any failure; "Send test email" also mails SALES_EMAIL.
  function checkEmail(button, send) {
    button.disabled = true;
    toast(send ? 'Sending a test email…' : 'Checking the email settings…');
    api('/api/admin/mail-check', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ send: send }) })
      .then(function (body) {
        button.disabled = false;
        var r = body.result || {};
        var s = r.settings || {};
        var head = {
          ok: ['Email is working', 'The website signed in to the mail server successfully.'],
          sent: ['Test email sent', 'A test email went to ' + (s.sales || 'the sales inbox') + '. Check that inbox (and spam).'],
          failed: ['Email is not working', r.advice || ''],
          missing: ['Email is not set up', r.advice || ''],
        }[r.status] || ['Email check', ''];
        var rows = [['Server (SMTP_HOST)', s.host || 'not set'], ['Port (SMTP_PORT)', String(s.port || '')], ['Encryption', s.secure ? 'SSL/TLS (port 465 style)' : 'STARTTLS (port 587 style)'],
          ['Login (SMTP_USER)', s.user || 'not set'], ['Password (SMTP_PASS)', s.passwordSet ? 'set' : 'not set'], ['Sender (MAIL_FROM)', s.from || ''], ['Enquiries go to (SALES_EMAIL)', s.sales || '']];
        openModal(head[0],
          '<p class="dc-mail-status dc-mail-' + esc(r.status || 'unknown') + '">' + esc(head[1]) + '</p>' +
          (r.detail ? '<p class="dc-sub">Mail server said: <code>' + esc(r.detail) + '</code></p>' : '') +
          '<table class="dc-mail-table"><tbody>' + rows.map(function (x) { return '<tr><th scope="row">' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</tbody></table>' +
          '<p class="dc-sub">Change these in Vercel → Project → Settings → Environment Variables, then redeploy. The password is never shown here.</p>',
          (r.status === 'ok' ? '<button type="button" class="dc-btn dc-btn-primary" id="dc-mail-send">Send test email</button>' : '') +
          '<button type="button" class="dc-btn" data-close>Close</button>');
      }, function (err) {
        button.disabled = false;
        toast(err.message, 'bad');
      });
  }

  function shell() {
    root.innerHTML =
      '<header class="dc-top"><div class="dc-top-in">' +
        '<button type="button" class="dc-logo" data-tab="dashboard" aria-label="D-TECH: go to the Dashboard Overview"><img src="/assets/dtech-logo-blue.webp" width="324" height="142" alt=""></button>' +
        '<div class="dc-title">Management Console<small>D-TECH Solution Integrators</small></div>' +
        '<div class="dc-counts" id="dc-counts"></div>' +
        '<span class="dc-deploy" id="dc-deploy" role="status" aria-live="polite" hidden></span>' +
        '<button type="button" class="dc-btn dc-btn-light" id="dc-refresh">Refresh</button>' +
        '<button type="button" class="dc-btn dc-btn-light" id="dc-mail-check">Check email</button>' +
        '<button type="button" class="dc-btn dc-btn-light" id="dc-logout">' + icon('lock') + 'Sign Out</button>' +
      '</div></header>' +
      '<main class="dc-main"><div id="dc-notes"></div><nav class="dc-tabs" aria-label="Console sections" id="dc-tabs"></nav><div id="dc-panel" class="dc-card" role="tabpanel"><div class="dc-loading">Loading the latest records…</div></div></main>';
    toastEl = document.createElement('div');
    toastEl.className = 'dc-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    root.appendChild(toastEl);
    progressEl = document.createElement('div');
    progressEl.className = 'dc-progress';
    progressEl.setAttribute('aria-hidden', 'true');
    root.appendChild(progressEl);
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
    // Dashboard Overview stays one click away; the other sections live in one
    // drop-down, whose button shows the section that is open.
    var home = TABS[0];
    var sections = TABS.slice(1);
    var current = sections.filter(function (t) { return t.id === state.tab; })[0];
    document.getElementById('dc-tabs').innerHTML =
      '<button type="button" class="dc-tab' + (state.tab === home.id ? ' is-active' : '') + '" data-tab="' + home.id + '"' + (state.tab === home.id ? ' aria-current="page"' : '') + '>' + esc(home.label) + '<span>' + c[home.id] + '</span></button>' +
      '<div class="dc-menu-wrap">' +
        '<button type="button" class="dc-tab dc-menu-btn' + (current ? ' is-active' : '') + '" id="dc-menu-btn" aria-haspopup="true" aria-expanded="false" aria-controls="dc-menu">' +
          (current ? esc(current.label) + '<span>' + c[current.id] + '</span>' : '📂 Sections') + '<i class="dc-caret" aria-hidden="true"></i></button>' +
        '<div class="dc-menu" id="dc-menu" role="menu" hidden>' + sections.map(function (t) {
          return '<button type="button" role="menuitem" class="dc-menu-item" data-tab="' + t.id + '"' + (t.id === state.tab ? ' aria-current="page"' : '') + '>' + esc(t.label) + '<span>' + c[t.id] + '</span></button>';
        }).join('') + '</div>' +
      '</div>';
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

  function disabledUnless(can) { return can ? '' : ' disabled'; }

  var VIEWS = {
    dashboard: function () {
      var d = state.data;
      var newApplicants = d.applicants.filter(function (a) { return statusOf(a) === 'new'; }).length;
      var newRequirements = d.requirements.filter(function (r) { return statusOf(r) === 'new'; }).length;
      var newLeads = d.leads.filter(function (l) { return statusOf(l) === 'new'; }).length;
      var totalActionable = newApplicants + newRequirements + newLeads;
      var activeJobs = d.jobs.filter(function (j) { return j.isActive; }).length;
      var totalVacancies = d.jobs.filter(function (j) { return j.isActive; }).reduce(function (sum, j) { return sum + (Number(j.positions) || 1); }, 0);
      var publishedCases = d.caseStudies.filter(function (c) { return c.published !== false; }).length;
      var inbox = d.requirements.concat(d.applicants, d.leads);
      var inProgress = inbox.filter(function (r) { var s = statusOf(r); return s === 'contacted' || s === 'review'; }).length;
      var archived = inbox.filter(function (r) { return statusOf(r) === 'archived'; }).length;
      var weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      var recentWeek = inbox.filter(function (r) { var t = new Date(r.date).getTime(); return !isNaN(t) && t >= weekAgo; }).length;
      function alertCard(tab, title, num, sub) {
        return '<button type="button" class="dc-card-alert" data-tab="' + tab + '"><span class="dc-kpi-title">' + esc(title) + '</span>' +
          '<span class="dc-kpi-num">' + num + '</span><span class="dc-kpi-sub">' + esc(sub) + '</span></button>';
      }
      function statCard(tab, title, num, sub) {
        return '<button type="button" class="dc-card-stat" data-tab="' + tab + '"><span class="dc-kpi-title"><span>' + esc(title) + '</span><span aria-hidden="true">→</span></span>' +
          '<span class="dc-kpi-num">' + num + '</span><span class="dc-kpi-sub">' + esc(sub) + '</span></button>';
      }
      return bar('Dashboard Overview', null, '<span class="dc-sub">Live metrics across inboxes and site content</span>') +
        '<div class="dc-dash">' +
        '<h3 class="dc-dash-h">Needs attention</h3><div class="dc-kpi-grid">' +
        alertCard('requirements', '⚡ Action Needed', totalActionable, 'New items across all inboxes') +
        alertCard('applicants', '👥 New Applicants', newApplicants, 'Job applications awaiting review') +
        alertCard('requirements', '📋 New Requirements', newRequirements, 'Client requirements awaiting review') +
        alertCard('leads', '📑 New Leads', newLeads, 'Case-study leads awaiting review') +
        '</div><h3 class="dc-dash-h">Site content &amp; pipeline</h3><div class="dc-kpi-grid">' +
        statCard('jobs', '💼 Open Roles', activeJobs, 'Active career openings') +
        statCard('jobs', '🪑 Total Vacancies', totalVacancies, 'Open positions to fill') +
        statCard('caseStudies', '🏆 Published Cases', publishedCases, 'Case studies live on the site') +
        statCard('requirements', '🔄 In Progress', inProgress, 'Contacted or under review') +
        statCard('requirements', '🗄 Archived', archived, 'Completed inbox records') +
        statCard('requirements', '📥 This Week', recentWeek, 'Inbound items in the last 7 days') +
        '</div></div>';
    },
    requirements: function () {
      var q = state.query.requirements || '';
      var all = state.data.requirements;
      var list = all.filter(function (r) { return shown(r) && matches(r, ['name', 'company', 'topic', 'email', 'phone', 'message'], q); });
      return bar('Client Requirements', q, showFilter() + '<button type="button" class="dc-btn dc-btn-primary" data-export="requirements">' + '📥 Download Excel (CSV)</button>') +
        table(['Client Name', 'Company', 'Requirement Topic', 'Phone', 'Email', 'Date', 'Status', ''], list.map(function (r) {
          return '<tr><td><div class="dc-strong">' + esc(r.name) + '</div>' + noteCount(r) + '</td><td>' + esc(r.company || '—') + '</td><td>' + esc(r.topic || 'General') + '</td>' +
            '<td>' + tel(r.phone) + '</td><td>' + mail(r.email) + '</td><td class="dc-sub">' + esc(fmtDate(r.date)) + '</td>' +
            '<td>' + statusSelect('requirement', r) + '</td>' +
            '<td><div class="dc-actions"><button type="button" class="dc-btn" data-view-req="' + esc(r.id) + '">' + icon('eye') + 'View Full Scope</button></div></td></tr>';
        }), emptyInbox(q, all, 'No client requirements yet. New ones from the Contact page will appear here.'));
    },
    applicants: function () {
      var q = state.query.applicants || '';
      var all = state.data.applicants;
      var list = all.filter(function (a) { return shown(a) && matches(a, ['name', 'role', 'email', 'phone', 'location'], q); });
      return bar('Job Applicants', q, showFilter() + '<button type="button" class="dc-btn" data-export="applicants">' + icon('file-spreadsheet') + 'Export List</button>') +
        table(['Candidate Name', 'Role Applied For', 'Phone', 'Email', 'Date', 'Status', ''], list.map(function (a) {
          var cv = a.cv && a.cv.path
            ? '<a class="dc-btn dc-btn-primary" href="/api/admin/data?cv=' + encodeURIComponent(a.id) + '" download>' + '📄 Download CV</a>'
            : '<span class="dc-sub">' + (a.cv ? 'CV sent by email' : 'No CV attached') + '</span>';
          return '<tr><td><div class="dc-strong">' + esc(a.name) + '</div>' + noteCount(a) + '</td><td>' + esc(a.role) + (a.location ? '<div class="dc-sub">' + esc(a.location) + '</div>' : '') + '</td>' +
            '<td>' + tel(a.phone) + '</td><td>' + mail(a.email) + '</td><td class="dc-sub">' + esc(fmtDate(a.date)) + '</td>' +
            '<td>' + statusSelect('applicant', a) + '</td>' +
            '<td><div class="dc-actions">' + cv + '<button type="button" class="dc-btn" data-view-note="' + esc(a.id) + '">Details &amp; Notes</button></div></td></tr>';
        }), emptyInbox(q, all, 'No applications yet. New ones from the Careers page will appear here.'));
    },
    leads: function () {
      var q = state.query.leads || '';
      var all = state.data.leads;
      var list = all.filter(function (l) { return shown(l) && matches(l, ['name', 'company', 'email', 'phone', 'caseTitle'], q); });
      var perVisitor = {};
      all.forEach(function (l) { var k = leadKey(l); if (k) perVisitor[k] = (perVisitor[k] || 0) + 1; });
      return bar('Case Study Leads', q, showFilter() + '<button type="button" class="dc-btn dc-btn-primary" data-export="leads">' + icon('file-spreadsheet') + 'Export Leads</button>') +
        table(['Requester Name', 'Company', 'Phone', 'Email', 'Case Study', 'Request', 'Date', 'Status', ''], list.map(function (l) {
          var n = perVisitor[leadKey(l)] || 1;
          var repeat = n > 1 ? '<div class="dc-sub">🔁 ' + n + ' requests from this visitor</div>' : '';
          return '<tr><td><div class="dc-strong">' + esc(l.name || '—') + '</div>' + repeat + noteCount(l) + '</td><td>' + esc(l.company || '—') + '</td><td>' + tel(l.phone) + '</td><td>' + mail(l.email) + '</td>' +
            '<td>' + esc(l.caseTitle || l.caseId) + '</td><td>' + leadRequestChip(l) + '</td><td class="dc-sub">' + esc(fmtDate(l.date)) + '</td>' +
            '<td>' + statusSelect('lead', l) + '</td>' +
            '<td><div class="dc-actions"><button type="button" class="dc-btn" data-view-lead="' + esc(l.id) + '">Details &amp; Notes</button></div></td></tr>';
        }), emptyInbox(q, all, 'No case-study requests yet. New ones from the Case Studies page will appear here.'));
    },
    jobs: function () {
      if (state.reorder.job) return reorderView('job');
      var q = state.query.jobs || '';
      var can = state.data.canSave;
      var list = state.data.jobs.filter(function (j) { return matches(j, ['title', 'department', 'location', 'summary'], q); });
      return bar('Manage Careers', q, reorderButton('job') + '<button type="button" class="dc-btn dc-btn-accent" data-new-job' + disabledUnless(can) + '>+ Add New Opening</button>') +
        table(['Job Title', 'Department', 'Location', 'Openings', 'Status', ''], list.map(function (j) {
          return '<tr><td class="dc-strong">' + esc(j.title) + '</td><td>' + esc(j.department) + '</td><td>' + esc(j.location) + '</td><td>' + esc(j.positions) + '</td>' +
            '<td>' + toggle('job', j.id, j.isActive, can) + '</td>' +
            '<td><div class="dc-actions"><button type="button" class="dc-btn" data-edit-job="' + esc(j.id) + '"' + disabledUnless(can) + '>Edit</button>' +
            '<button type="button" class="dc-btn dc-btn-danger" data-delete="job" data-id="' + esc(j.id) + '"' + disabledUnless(can) + '>Delete</button></div></td></tr>';
        }), q ? 'No openings match your search.' : 'No openings yet. Use “Add New Opening” to post one.');
    },
    caseStudies: function () {
      if (state.reorder.caseStudy) return reorderView('caseStudy');
      var q = state.query.caseStudies || '';
      var can = state.data.canSave;
      var list = state.data.caseStudies.filter(function (c) { return matches(c, ['client', 'arch_tag', 'industry', 'summary'], q); });
      var cards = list.map(function (c) {
        var on = c.published !== false;
        var pdf = !c.pdf_file ? 'No PDF' : /^https:/.test(c.pdf_file) ? 'PDF link' : 'PDF attached';
        var pdfUrl = pdfHref(c);
        var viewBtn = '<button type="button" class="dc-btn" data-view-cs="' + esc(c.id) + '">👁 View</button>';
        var pdfBtn = pdfUrl ? '<a class="dc-btn" href="' + esc(pdfUrl) + '" target="_blank" rel="noopener">📄 PDF</a>' : '';
        var siteBtn = '<a class="dc-btn" href="/case-studies#' + esc(c.id) + '" target="_blank" rel="noopener">🌐 Live</a>';
        var custom = c.custom
          ? '<button type="button" class="dc-btn" data-edit-cs="' + esc(c.id) + '"' + disabledUnless(can) + '>Edit</button>' +
            '<button type="button" class="dc-btn dc-btn-danger" data-delete="caseStudy" data-id="' + esc(c.id) + '"' + disabledUnless(can) + '>Delete</button>'
          : '';
        return '<article class="dc-cs' + (on ? '' : ' is-off') + '"><div class="dc-tags"><span class="dc-chip">' + esc(CATEGORIES[c.category] || c.category) + '</span>' +
          '<span class="dc-chip dc-chip-off">' + (c.custom ? pdf : 'Built-in') + '</span></div>' +
          '<div class="dc-cs-name">' + esc(c.client) + '</div><div>' + esc(c.arch_tag) + '</div><div class="dc-sub">' + esc(c.industry) + '</div>' +
          '<div class="dc-cs-foot">' + toggle('caseStudy', c.id, on, can) + '<div class="dc-actions">' + viewBtn + pdfBtn + siteBtn + custom + '</div></div></article>';
      });
      return bar('Manage Case Studies', q, reorderButton('caseStudy') + '<button type="button" class="dc-btn dc-btn-accent" data-new-cs' + disabledUnless(can) + '>+ Add Case Study</button>') +
        (cards.length ? '<div class="dc-grid">' + cards.join('') + '</div>' : '<div class="dc-empty">' + (q ? 'No case studies match your search.' : 'No case studies yet.') + '</div>');
    },
    banners: function () {
      if (state.reorder.banner) return reorderView('banner');
      var q = state.query.banners || '';
      var can = state.data.canSave;
      var showing = liveBanner(state.data.banners);
      var day = localDay();
      var list = state.data.banners.filter(function (b) { return matches(b, ['message', 'linkLabel', 'linkUrl'], q); });
      return bar('Site Banners', q, reorderButton('banner') + '<button type="button" class="dc-btn dc-btn-accent" data-new-banner' + disabledUnless(can) + '>+ New Banner</button>') +
        '<p class="dc-intro">One banner shows at a time, across the top of every page: the first <strong>active</strong> banner in this list whose dates include today. Visitors can close it. Use Reorder to choose which banner wins when two overlap.</p>' +
        table(['Banner', 'Schedule', 'Status', ''], list.map(function (b) {
          var s = bannerState(b, day);
          var chip = s === 'off' ? '<span class="dc-chip dc-chip-off">Not shown</span>'
            : s === 'soon' ? '<span class="dc-chip dc-chip-wait">Starts ' + esc(fmtDay(b.startsOn)) + '</span>'
            : s === 'ended' ? '<span class="dc-chip dc-chip-off">Ended ' + esc(fmtDay(b.endsOn)) + '</span>'
            : b === showing ? '<span class="dc-chip dc-chip-live">Live now</span>'
            : '<span class="dc-chip dc-chip-warn">Waiting: another banner is showing</span>';
          var tone = TONES[b.tone] || TONES.info;
          return '<tr><td><div class="dc-strong"><span class="dc-swatch" style="background:' + tone.color + '" title="' + esc(tone.label) + '"></span>' + esc(b.message) + '</div>' +
            (b.linkLabel ? '<div class="dc-sub">Link: ' + esc(b.linkLabel) + ' → ' + esc(b.linkUrl) + '</div>' : '') + '</td>' +
            '<td class="dc-sub">' + esc(schedule(b)) + '</td>' +
            '<td><div class="dc-status">' + toggle('banner', b.id, b.isActive, can) + chip + '</div></td>' +
            '<td><div class="dc-actions"><button type="button" class="dc-btn" data-edit-banner="' + esc(b.id) + '"' + disabledUnless(can) + '>Edit</button>' +
            '<button type="button" class="dc-btn dc-btn-danger" data-delete="banner" data-id="' + esc(b.id) + '"' + disabledUnless(can) + '>Delete</button></div></td></tr>';
        }), q ? 'No banners match your search.' : 'No banners yet. Use “New Banner” for holiday notices, hiring drives or urgent updates.');
    }
  };

  function toggle(type, id, on, enabled) {
    var t = TYPES[type];
    return '<label class="dc-switch"><input type="checkbox" data-toggle="' + type + '" data-id="' + esc(id) + '"' + (on ? ' checked' : '') + disabledUnless(enabled) + '>' +
      '<span class="dc-track" aria-hidden="true"></span><span data-toggle-label>' + (on ? t.on : t.off) + '</span></label>';
  }

  // ---------- display order ----------
  // Reordering happens locally and is saved as one commit, so the site redeploys once.
  var REORDER = {
    job: { title: 'Order of openings', intro: 'Openings appear on the careers page in this order. Closed openings stay hidden wherever they sit.' },
    caseStudy: { title: 'Order of case studies', intro: 'Case studies appear on the Case Studies page in this order. Drafts stay hidden wherever they sit. The client logos on the home page are chosen separately and do not change.' },
    banner: { title: 'Order of banners', intro: 'When more than one active banner covers today, the one highest in this list is shown.' }
  };

  function reorderButton(type) {
    var enough = state.data[TYPES[type].list].length > 1;
    return '<button type="button" class="dc-btn" data-reorder="' + type + '"' + disabledUnless(state.data.canSave && enough) + '>⇅ Reorder</button>';
  }

  function currentOrder(type) {
    return state.data[TYPES[type].list].map(function (x) { return x.id; });
  }

  function reorderView(type) {
    var t = TYPES[type];
    var ids = state.reorder[type] = state.reorder[type].filter(function (id) { return find(t.list, id); });
    var changed = ids.join('\n') !== currentOrder(type).join('\n');
    var rows = ids.map(function (id, i) {
      var x = find(t.list, id);
      var name = t.name(x);
      var label = esc(name.length > 60 ? name.slice(0, 57) + '…' : name);
      return '<li><span class="dc-order-n" aria-hidden="true">' + (i + 1) + '</span>' +
        '<div class="dc-order-name"><div class="dc-strong">' + esc(name) + '</div><div class="dc-sub">' + esc(t.detail(x)) + '</div></div>' +
        '<span class="dc-chip ' + (t.isOn(x) ? 'dc-chip-live">' + t.on : 'dc-chip-off">' + t.off) + '</span>' +
        '<span class="dc-order-btns">' +
        '<button type="button" class="dc-btn dc-btn-icon" data-move="up" data-id="' + esc(id) + '" aria-label="Move “' + label + '” up"' + disabledUnless(i > 0) + '>↑</button>' +
        '<button type="button" class="dc-btn dc-btn-icon" data-move="down" data-id="' + esc(id) + '" aria-label="Move “' + label + '” down"' + disabledUnless(i < ids.length - 1) + '>↓</button>' +
        '</span></li>';
    });
    return bar(REORDER[type].title, null,
      '<button type="button" class="dc-btn" data-reorder-cancel>Cancel</button>' +
      '<button type="button" class="dc-btn dc-btn-accent" data-reorder-save' + disabledUnless(changed) + '>Save Order</button>') +
      '<p class="dc-intro">' + esc(REORDER[type].intro) + ' Nothing changes on the website until you press Save Order.</p>' +
      '<ol class="dc-order">' + rows.join('') + '</ol>';
  }

  function moveItem(type, id, dir) {
    var ids = state.reorder[type];
    var i = ids.indexOf(id);
    var j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids[i] = ids[j];
    ids[j] = id;
    renderPanel();
    // Keep keyboard focus on the item that moved; at either end, on its other arrow.
    var sel = '[data-move][data-id="' + (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id) + '"]';
    var buttons = document.querySelectorAll(sel);
    var same = [].filter.call(buttons, function (b) { return b.dataset.move === dir && !b.disabled; })[0];
    (same || buttons[dir === 'up' ? 1 : 0] || document.body).focus();
  }

  function saveOrder(type) {
    var ids = state.reorder[type].slice();
    save(type, 'reorder', { ids: ids }).then(function () {
      delete state.reorder[type];
      renderPanel();
    }, function (err) { if (err.message !== 'Signed out') toast(err.message, 'bad'); });
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

  // Details dialogs double as the follow-up view (status and internal notes), so
  // they are opened as forms: a stray backdrop click does not lose a half-typed note.
  function showRequirement(id) {
    var r = find('requirements', id);
    if (!r) return;
    openModal('Requirement from ' + (r.name || 'client'),
      '<dl class="dc-dl"><dt>Client</dt><dd>' + esc(r.name) + '</dd><dt>Company</dt><dd>' + esc(r.company || '—') + '</dd>' +
      '<dt>Topic</dt><dd>' + esc(r.topic || 'General') + '</dd><dt>Phone</dt><dd>' + tel(r.phone) + '</dd><dt>Email</dt><dd>' + mail(r.email) + '</dd>' +
      '<dt>Received</dt><dd>' + esc(fmtDate(r.date)) + '</dd></dl>' +
      '<p class="dc-sub">Full scope, as the client described it:</p><div class="dc-msg">' + esc(r.message || 'No details provided.') + '</div>' +
      followUp('requirement', r),
      '<a class="dc-btn dc-btn-primary" href="mailto:' + esc(r.email) + '?subject=' + encodeURIComponent('Re: ' + (r.topic || 'Your requirement')) + '">' + icon('mail') + 'Reply by Email</a><button type="button" class="dc-btn" data-close>Close</button>',
      { form: true });
  }

  function showNote(id) {
    var a = find('applicants', id);
    if (!a) return;
    openModal('Application from ' + a.name,
      '<dl class="dc-dl"><dt>Role</dt><dd>' + esc(a.role) + '</dd><dt>Phone</dt><dd>' + tel(a.phone) + '</dd><dt>Email</dt><dd>' + mail(a.email) + '</dd>' +
      '<dt>Applied</dt><dd>' + esc(fmtDate(a.date)) + '</dd></dl><p class="dc-sub">The candidate’s note:</p><div class="dc-msg">' + esc(a.message || 'The candidate did not add a note.') + '</div>' +
      followUp('applicant', a),
      (a.cv && a.cv.path ? '<a class="dc-btn dc-btn-primary" href="/api/admin/data?cv=' + encodeURIComponent(a.id) + '" download>' + '📄 Download CV</a>' : '') +
      '<button type="button" class="dc-btn" data-close>Close</button>',
      { form: true });
  }

  // Everything this visitor has asked for, so staff see their full interest at a glance.
  function leadHistoryHtml(l) {
    var history = leadHistory(l);
    if (history.length < 2) return '';
    return '<p class="dc-sub">All ' + history.length + ' requests from this visitor (newest first):</p>' +
      table(['Date', 'Request', 'Case Study'], history.map(function (h) {
        return '<tr' + (h.id === l.id ? ' class="dc-strong"' : '') + '><td class="dc-sub">' + esc(fmtDate(h.date)) + '</td><td>' + leadRequestChip(h) + '</td><td>' + esc(h.caseTitle || h.caseId) + '</td></tr>';
      }), '');
  }

  function showLead(id) {
    var l = find('leads', id);
    if (!l) return;
    openModal('Lead from ' + (l.name || l.email),
      '<dl class="dc-dl"><dt>Name</dt><dd>' + esc(l.name || '—') + '</dd><dt>Company</dt><dd>' + esc(l.company || '—') + '</dd>' +
      '<dt>Phone</dt><dd>' + tel(l.phone) + '</dd><dt>Email</dt><dd>' + mail(l.email) + '</dd>' +
      '<dt>Case study</dt><dd>' + esc(l.caseTitle || l.caseId) + '</dd><dt>Request</dt><dd>' + leadRequestChip(l) + '</dd>' +
      '<dt>Requested</dt><dd>' + esc(fmtDate(l.date)) + '</dd></dl>' +
      leadHistoryHtml(l) +
      followUp('lead', l),
      '<a class="dc-btn dc-btn-primary" href="mailto:' + esc(l.email) + '?subject=' + encodeURIComponent('Re: ' + (l.caseTitle || 'Your case study request')) + '">' + icon('mail') + 'Reply by Email</a><button type="button" class="dc-btn" data-close>Close</button>',
      { form: true });
  }

  function showCaseStudy(id) {
    var c = find('caseStudies', id);
    if (!c) return;
    var pdfUrl = pdfHref(c);
    var outcomes = Array.isArray(c.outcomes) ? c.outcomes : [];
    var metrics = Array.isArray(c.metrics) ? c.metrics : [];
    var bodyHtml = '<dl class="dc-dl"><dt>Client</dt><dd>' + esc(c.client) + '</dd>' +
      '<dt>Section</dt><dd>' + esc(c.arch_tag || '—') + '</dd>' +
      '<dt>Industry</dt><dd>' + esc(c.industry || '—') + '</dd>' +
      '<dt>Category</dt><dd>' + esc(CATEGORIES[c.category] || c.category || '—') + '</dd>' +
      '<dt>Status</dt><dd>' + (c.published !== false ? 'Published' : 'Draft') + '</dd></dl>' +
      (c.summary ? '<p class="dc-sub">Summary:</p><div class="dc-msg">' + esc(c.summary) + '</div>' : '') +
      (c.challenge ? '<p class="dc-sub">Challenge:</p><div class="dc-msg">' + esc(c.challenge) + '</div>' : '') +
      (c.solution ? '<p class="dc-sub">Solution:</p><div class="dc-msg">' + esc(c.solution) + '</div>' : '') +
      (outcomes.length ? '<p class="dc-sub">Outcomes:</p><div class="dc-msg"><ul>' + outcomes.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul></div>' : '') +
      (metrics.length ? '<p class="dc-sub">Metrics:</p><div class="dc-msg"><ul>' + metrics.map(function (m) { return '<li>' + esc(Array.isArray(m) ? m.join(': ') : m) + '</li>'; }).join('') + '</ul></div>' : '');
    var footHtml = (pdfUrl ? '<a class="dc-btn dc-btn-primary" href="' + esc(pdfUrl) + '" target="_blank" rel="noopener">📄 Open Full PDF</a>' : '') +
      '<a class="dc-btn" href="/case-studies#' + esc(c.id) + '" target="_blank" rel="noopener">🌐 Open on Live Site</a>' +
      (c.custom ? '<button type="button" class="dc-btn" data-edit-cs="' + esc(c.id) + '">Edit</button>' : '') +
      '<button type="button" class="dc-btn" data-close>Close</button>';
    openModal(c.client + ' — Case Study', bodyHtml, footHtml, { wide: true, size: 'wide' });
  }

  function showDetails(type, id) {
    var open = { requirement: showRequirement, applicant: showNote, lead: showLead }[type];
    if (!find(TYPES[type].list, id)) { forceClose(); return; }
    open(id);
  }

  // Redraws an open details dialog after a save, keeping any note still being typed.
  function refreshDetails(type, id, keepDraft) {
    var form = document.getElementById('dc-form');
    var draft = keepDraft && form && form.elements.note ? form.elements.note.value : '';
    showDetails(type, id);
    var again = document.getElementById('dc-form');
    if (draft && again) {
      again.elements.note.value = draft;
      modal.dataset.dirty = '1';
      syncForm(again);
    }
  }

  function submitNote(type, id) {
    var form = document.getElementById('dc-form');
    var note = form.elements.note.value.trim();
    if (!showErrors(form, note ? {} : { note: 'Write the note first.' })) return;
    save(type, 'note', { id: id, note: note }, { inModal: true, done: 'Note added.' })
      .then(function () { refreshDetails(type, id, false); }, function (err) { serverError(form, err); });
  }

  // Removing a note takes two clicks on the same button, so the dialog stays open.
  function removeNote(button) {
    var d = button.dataset;
    if (!d.armed) {
      button.dataset.armed = '1';
      button.textContent = 'Click again to remove';
      setTimeout(function () {
        if (button.isConnected) { delete button.dataset.armed; button.textContent = 'Remove'; }
      }, 4000);
      return;
    }
    save(d.type, 'deleteNote', { id: d.id, noteId: d.removeNote }, { inModal: true, done: 'Note removed.' })
      .then(function () { refreshDetails(d.type, d.id, true); }, function (err) {
        if (err.message === 'Signed out') return;
        if (document.getElementById('dc-form-error')) formError(err.message); else toast(err.message, 'bad');
      });
  }

  function purgeRecord(type, id) {
    confirmBox('Delete permanently?',
      'This removes the record' + (type === 'applicant' ? ' and the stored CV file' : '') + ' from the inbox and from the storage history. It cannot be undone.',
      'Delete permanently').then(function (ok) {
      if (!ok) return;
      save(type, 'purge', { id: id }, { done: 'Deleted permanently.' }).then(function (res) {
        if (res && res.historyErased === false) toast('Deleted from the inbox, but older copies could not be cleared from the storage history. Please tell your website administrator.', 'bad');
      }, function (err) {
        if (err.message !== 'Signed out') toast(err.message, 'bad');
      });
    });
  }

  function saveStatus(select) {
    var d = select.dataset;
    var before = d.value;
    var inModal = modal.contains(select);
    var archiving = select.value === 'archived' && (state.show[state.tab] || 'open') === 'open';
    select.disabled = true;
    save(d.status, 'status', { id: d.id, value: select.value }, {
      inModal: inModal,
      done: 'Marked as ' + STATUSES[select.value] + '.' + (archiving ? ' Archived records are hidden from the Open list; use the filter to see them.' : '')
    }).then(function () {
      if (inModal) refreshDetails(d.status, d.id, true);
    }, function (err) {
      select.value = before;
      select.disabled = false;
      if (err.message === 'Signed out') return;
      if (inModal && document.getElementById('dc-form-error')) formError(err.message); else toast(err.message, 'bad');
    });
  }

  // ---------- form building ----------
  // Every field sits in a [data-field] wrapper holding its error message, so the
  // browser-side checks and the server's { field } answers mark the same place.
  function fid(name) { return 'dc-f-' + name; }

  function wrap(o, control) {
    var id = fid(o.name);
    return '<div class="dc-f' + (o.wide ? ' dc-wide' : '') + '" data-field="' + o.name + '"' + (o.show ? ' data-show="' + o.show + '"' : '') + (o.hidden ? ' hidden' : '') + '>' +
      '<label for="' + id + '">' + esc(o.label) + (o.required ? ' <span class="dc-req" aria-hidden="true">*</span>' : '') + '</label>' +
      control +
      (o.hint ? '<p class="dc-hint" id="' + id + '-hint">' + esc(o.hint) + '</p>' : '') +
      '<div class="dc-f-foot"><p class="dc-err" id="' + id + '-err" hidden></p>' +
      (o.counter ? '<span class="dc-counter" data-counter="' + o.name + '" data-max="' + o.max + '"></span>' : '') + '</div></div>';
  }

  function controlAttrs(o) {
    var id = fid(o.name);
    return ' id="' + id + '" name="' + o.name + '"' + (o.required ? ' aria-required="true"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
      ' aria-describedby="' + (o.hint ? id + '-hint ' : '') + id + '-err"' + (o.attrs ? ' ' + o.attrs : '');
  }

  function input(o) {
    return wrap(o, '<input type="' + (o.type || 'text') + '" value="' + esc(o.value == null ? '' : o.value) + '"' + controlAttrs(o) + '>');
  }

  function textarea(o) {
    o.counter = o.max && o.counter !== false;
    return wrap(o, '<textarea rows="' + (o.rows || 3) + '"' + controlAttrs(o) + '>' + esc(o.value || '') + '</textarea>');
  }

  function select(o, options) {
    return wrap(o, '<select' + controlAttrs(o) + '>' + options + '</select>');
  }

  function switchField(name, label, on, onText, offText) {
    return '<div class="dc-f" data-field="' + name + '"><span class="dc-f-label">' + esc(label) + '</span>' +
      '<label class="dc-switch"><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') + ' data-on="' + esc(onText) + '" data-off="' + esc(offText) + '">' +
      '<span class="dc-track" aria-hidden="true"></span><span data-switch-text>' + esc(on ? onText : offText) + '</span></label>' +
      '<p class="dc-err" hidden></p></div>';
  }

  function choices(name, legend, options, checked, wide) {
    return '<fieldset class="dc-seg' + (wide ? ' dc-wide' : '') + '" data-field="' + name + '"><legend>' + esc(legend) + '</legend>' +
      options.map(function (o) {
        return '<label><input type="radio" name="' + name + '" value="' + esc(o.value) + '"' + (o.value === checked ? ' checked' : '') + '>' + o.html + '</label>';
      }).join('') + '<p class="dc-err" hidden></p></fieldset>';
  }

  function section(title, hint, inner) {
    return '<section class="dc-section"><h4>' + esc(title) + '</h4>' + (hint ? '<p class="dc-hint">' + esc(hint) + '</p>' : '') + inner + '</section>';
  }

  function footer(label, attr) {
    return '<button type="button" class="dc-btn" data-close>Cancel</button><button type="button" class="dc-btn dc-btn-accent" ' + attr + '>' + esc(label) + '</button>';
  }

  function unique(list) {
    return list.filter(function (v, i, all) { return v && all.indexOf(v) === i; });
  }

  // ---------- validation ----------
  function setFieldError(form, name, message) {
    var box = form.querySelector('[data-field="' + name + '"]');
    if (!box) return false;
    var err = box.querySelector('.dc-err');
    err.textContent = message || '';
    err.hidden = !message;
    box.querySelectorAll('input:not([type=radio]):not([type=checkbox]),select,textarea').forEach(function (el) {
      if (message) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    });
    return true;
  }

  function focusField(form, name) {
    var box = form.querySelector('[data-field="' + name + '"]');
    var el = box && box.querySelector('input:not([type=hidden]),select,textarea');
    if (!el) return;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  }

  function formError(message) {
    var el = document.getElementById('dc-form-error');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  // errors: { fieldName: message }. Returns true when there are none.
  function showErrors(form, errors) {
    var first = null;
    form.querySelectorAll('[data-field]').forEach(function (box) {
      var name = box.getAttribute('data-field');
      var message = box.hidden ? '' : errors[name] || '';
      setFieldError(form, name, message);
      if (message && !first) first = name;
    });
    formError(first ? 'Please fix the highlighted fields.' : '');
    if (first) focusField(form, first);
    return !first;
  }

  function serverError(form, err) {
    if (err.message === 'Signed out') return;
    if (err.field && setFieldError(form, err.field, err.message)) focusField(form, err.field);
    formError(err.message);
  }

  function linkProblem(value) {
    if (!value) return '';
    if (/^https:\/\//i.test(value)) {
      try { new URL(value); return /\s/.test(value) ? 'Links cannot contain spaces.' : ''; } catch (e) { return 'That link is not a valid web address.'; }
    }
    return SITE_PATH_RE.test(value) || CONTACT_LINK_RE.test(value) ? '' : 'Use a page on this site (e.g. careers), a full link starting with https://, or tel:/mailto:';
  }

  function lines(value) {
    return String(value || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  }

  // ---------- job form ----------
  function jobForm(job) {
    var j = job || { positions: 1, isActive: true };
    var known = unique(LOCATIONS.concat(state.data.jobs.map(function (x) { return x.location; })));
    if (j.location && known.indexOf(j.location) === -1) known.push(j.location);
    var departments = unique(DEPARTMENTS.concat(state.data.jobs.map(function (x) { return x.department; })));
    var form = '<form class="dc-form" id="dc-form" data-kind="job" novalidate>' +
      input({ name: 'title', label: 'Job title', required: true, max: 120, value: j.title, wide: true, placeholder: 'e.g. Industrial Network Engineer' }) +
      input({ name: 'department', label: 'Department', required: true, max: 80, value: j.department, placeholder: 'e.g. Engineering', attrs: 'list="dc-departments"' }) +
      '<datalist id="dc-departments">' + departments.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      wrap({ name: 'location', label: 'Location', required: true },
        '<select id="' + fid('location') + '" name="location" aria-required="true" aria-describedby="' + fid('location') + '-err"><option value="">Choose a location</option>' +
        known.map(function (l) { return '<option' + (l === j.location ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') +
        '<option value="__other">Other…</option></select>' +
        '<input name="locationOther" maxlength="120" placeholder="e.g. GACL, Dahej" aria-label="Other location" hidden>') +
      input({ name: 'positions', label: 'Open positions', required: true, type: 'number', value: j.positions, attrs: 'min="1" max="99" step="1" inputmode="numeric"', hint: 'A whole number from 1 to 99.' }) +
      switchField('isActive', 'Status', j.isActive !== false, 'Active: accepting applications', 'Closed: hidden from the careers page') +
      textarea({ name: 'summary', label: 'Job summary / responsibilities', required: true, max: 1000, rows: 8, value: j.summary, wide: true,
        placeholder: 'What the role involves, then the key responsibilities:\n- Configure and maintain plant switches and routers\n- Support CCTV and P2P links on site',
        hint: 'Start a line with “- ” to make a bullet point. Leave an empty line between paragraphs.' }) +
      '</form>';
    var preview = '<aside class="dc-preview" aria-label="Live preview"><p class="dc-preview-label">' + icon('eye') + 'Live preview · careers page</p>' +
      '<div class="dc-preview-frame" id="dc-preview"></div><p class="dc-preview-note" id="dc-preview-note"></p></aside>';
    openModal(job ? 'Edit Opening' : 'Add New Opening', '<div class="dc-split">' + form + preview + '</div><p class="dc-error" id="dc-form-error" role="alert" hidden></p>',
      footer(job ? 'Save Changes' : 'Post Opening', 'data-save-job="' + esc(j.id || '') + '"'), { size: 'wide', form: true });
    syncForm(document.getElementById('dc-form'));
  }

  function jobLocation(f) {
    return f.location.value === '__other' ? f.locationOther.value.trim() : f.location.value;
  }

  function jobPreview(f) {
    var title = f.title.value.trim();
    var positions = parseInt(f.positions.value, 10);
    var meta = ['<span class="dc-pv-badge">Open</span>'];
    var location = jobLocation(f);
    if (location) meta.push('<span>' + SVG.pin + esc(location) + '</span>');
    if (f.department.value.trim()) meta.push('<span>' + esc(f.department.value.trim()) + '</span>');
    if (positions > 1) meta.push('<span>' + positions + ' positions</span>');
    document.getElementById('dc-preview').innerHTML =
      '<article class="dc-pv-job' + (f.isActive.checked ? '' : ' is-off') + '"><div class="dc-pv-meta">' + meta.join('') + '</div>' +
      '<h3>' + (esc(title) || '<span class="dc-pv-empty">Job title</span>') + '</h3>' +
      '<div class="dc-pv-body">' + (formatSummary(f.summary.value) || '<p class="dc-pv-empty">The job summary appears here.</p>') + '</div>' +
      '<div class="dc-pv-foot"><span class="dc-pv-btn">Apply for this role <span aria-hidden="true">&#8599;</span></span></div></article>';
    var note = document.getElementById('dc-preview-note');
    note.textContent = f.isActive.checked
      ? 'Shown on the careers page, where candidates can apply.'
      : 'Closed openings are saved here but not shown on the careers page.';
    note.classList.toggle('is-warn', !f.isActive.checked);
  }

  function jobErrors(f) {
    var e = {};
    if (!f.title.value.trim()) e.title = 'Enter the job title.';
    if (!f.department.value.trim()) e.department = 'Enter the department.';
    if (!jobLocation(f)) e.location = f.location.value === '__other' ? 'Type the location.' : 'Choose a location.';
    var n = f.positions.value.trim();
    if (!/^\d+$/.test(n) || +n < 1 || +n > 99) e.positions = 'Enter a whole number from 1 to 99.';
    if (!f.summary.value.trim()) e.summary = 'Describe the role and its responsibilities.';
    return e;
  }

  function submitJob(id) {
    var form = document.getElementById('dc-form');
    var f = form.elements;
    if (!showErrors(form, jobErrors(f))) return;
    save('job', 'save', {
      id: id || undefined,
      item: {
        title: f.title.value, department: f.department.value, location: jobLocation(f),
        positions: Number(f.positions.value), summary: f.summary.value, isActive: f.isActive.checked
      }
    }, { inModal: true }).then(forceClose, function (err) { serverError(form, err); });
  }

  // ---------- case study form ----------
  var METRIC_EXAMPLES = [['99.8%', 'Network uptime'], ['45%', 'Faster cycle time'], ['2', 'Plant sites'], ['24×7', 'Support coverage']];

  function caseForm(cs) {
    var c = cs || { metrics: [], outcomes: [], published: true };
    var metrics = (c.metrics || []).concat([[], [], [], []]).slice(0, 4);
    var current = c.pdf_file || '';
    var isLink = /^https:/.test(current);
    var pdfModes = (current ? [{ value: 'keep', html: 'Keep current PDF' }] : []).concat([
      { value: 'upload', html: 'Upload a PDF' }, { value: 'link', html: 'Link to a PDF' }
    ]);
    var body = '<form class="dc-form" id="dc-form" data-kind="caseStudy" novalidate>' +
      section('Client & project', '',
        input({ name: 'client', label: 'Client name', required: true, max: 120, value: c.client, placeholder: 'e.g. GNFC Limited' }) +
        input({ name: 'industry', label: 'Industry sector', required: true, max: 80, value: c.industry, placeholder: 'e.g. Chemicals & Fertilizers' }) +
        input({ name: 'arch_tag', label: 'Title / headline', required: true, max: 120, value: c.arch_tag, wide: true, placeholder: 'e.g. Plant-wide Network & CCTV', hint: 'Shown under the client name on the case-study card.' }) +
        select({ name: 'category', label: 'Category', required: true, hint: 'Which filter tab it appears under.' },
          '<option value="">Choose a category</option>' + Object.keys(CATEGORIES).map(function (k) {
            return '<option value="' + k + '"' + (k === c.category ? ' selected' : '') + '>' + esc(CATEGORIES[k]) + '</option>';
          }).join('')) +
        wrap({ name: 'logoFile', label: 'Client logo', wide: true, hint: 'Optional. PNG, JPG or WebP, up to 300 KB, on a transparent or white background. Without a logo the card shows the client name.' },
          (c.logo ? '<p class="dc-current">Current: <a href="/' + esc(c.logo) + '" target="_blank" rel="noopener">' + esc(c.logo.split('/').pop()) + '</a></p>' +
            '<label class="dc-check"><input type="checkbox" name="logoRemove"> Remove the current logo</label>' : '') +
          '<input type="file" id="' + fid('logoFile') + '" name="logoFile" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-describedby="' + fid('logoFile') + '-hint ' + fid('logoFile') + '-err">') +
        input({ name: 'location', label: 'Site / location', max: 120, value: c.location, placeholder: 'e.g. Dahej, Gujarat' }) +
        input({ name: 'period', label: 'Period', max: 120, value: c.period, placeholder: 'e.g. 2025 – 2026' })) +
      section('The story', '',
        textarea({ name: 'summary', label: 'Card summary', required: true, max: 600, rows: 3, value: c.summary, wide: true, hint: 'One or two sentences shown on the case-study card.' }) +
        textarea({ name: 'challenge', label: 'Core challenge', max: 1500, rows: 4, value: c.challenge, wide: true, placeholder: 'What problem did the client face?' }) +
        textarea({ name: 'solution', label: 'Engineering solution', max: 1500, rows: 4, value: c.solution, wide: true, placeholder: 'What did D-TECH design and deliver?' }) +
        textarea({ name: 'outcomes', label: 'Business results', rows: 4, value: (c.outcomes || []).join('\n'), wide: true, counter: false,
          placeholder: '45% reduction in cycle time\nZero unplanned network downtime in year one', hint: 'One result per line, up to 6.' })) +
      section('Key metrics', 'Up to 4 headline figures shown on the card, e.g. “99.8%” with “Network uptime”.',
        metrics.map(function (m, i) {
          var ex = METRIC_EXAMPLES[i];
          return '<div class="dc-metric" data-field="metric' + i + '"><span class="dc-metric-n" aria-hidden="true">' + (i + 1) + '</span>' +
            '<input name="mv' + i + '" value="' + esc(m[1] || '') + '" maxlength="40" placeholder="' + esc(ex[0]) + '" aria-label="Metric ' + (i + 1) + ' figure">' +
            '<input name="mk' + i + '" value="' + esc(m[0] || '') + '" maxlength="40" placeholder="' + esc(ex[1]) + '" aria-label="Metric ' + (i + 1) + ' measures">' +
            '<p class="dc-err" hidden></p></div>';
        }).join('')) +
      section('PDF whitepaper (required)', 'Every case study needs a PDF, uploaded or linked. Visitors who ask for the full case study get this PDF by email, and their details arrive under Case Study Leads.',
        (current ? '<p class="dc-current dc-wide">Current: ' + (isLink
          ? '<a href="' + esc(current) + '" target="_blank" rel="noopener">' + esc(current) + '</a>'
          : '<a href="/' + esc(current) + '" target="_blank" rel="noopener">' + esc(current.split('/').pop()) + '</a> (uploaded)') + '</p>' : '') +
        choices('pdfMode', 'PDF', pdfModes, current ? 'keep' : 'upload', true) +
        wrap({ name: 'pdfFile', label: 'PDF file', required: true, wide: true, show: 'upload', hidden: current ? true : false, hint: 'PDF only, up to 3 MB. For a bigger file, use “Link to a PDF”.' },
          '<input type="file" id="' + fid('pdfFile') + '" name="pdfFile" accept="application/pdf,.pdf" aria-describedby="' + fid('pdfFile') + '-hint ' + fid('pdfFile') + '-err">') +
        input({ name: 'pdfUrl', label: 'PDF link', required: true, type: 'url', max: 500, wide: true, show: 'link', hidden: true, value: isLink ? current : '',
          placeholder: 'https://…', hint: 'Must start with https://. For Google Drive or OneDrive, share the file with “Anyone with the link” first.' })) +
      section('Visibility', '',
        switchField('published', 'Status', c.published !== false, 'Published: shown on the Case Studies page', 'Draft: saved, but not shown on the website')) +
      '</form><p class="dc-error" id="dc-form-error" role="alert" hidden></p>';
    openModal(cs ? 'Edit Case Study' : 'Add Case Study', body,
      footer(cs ? 'Save Changes' : 'Add Case Study', 'data-save-cs="' + esc(c.id || '') + '"'), { size: 'mid', form: true });
    syncForm(document.getElementById('dc-form'));
  }

  function pdfMode() {
    var checked = document.querySelector('#dc-form input[name="pdfMode"]:checked');
    return checked ? checked.value : 'keep';
  }

  function caseErrors(f) {
    var e = {};
    if (!f.client.value.trim()) e.client = 'Enter the client name.';
    if (!f.industry.value.trim()) e.industry = 'Enter the industry sector.';
    if (!f.arch_tag.value.trim()) e.arch_tag = 'Enter a title or headline.';
    if (!f.category.value) e.category = 'Choose a category.';
    if (!f.summary.value.trim()) e.summary = 'Write a short summary for the card.';
    var results = lines(f.outcomes.value);
    if (results.length > 6) e.outcomes = 'Keep it to 6 results (you have ' + results.length + ').';
    else if (results.some(function (r) { return r.length > 200; })) e.outcomes = 'Keep each result to 200 characters.';
    [0, 1, 2, 3].forEach(function (i) {
      var value = f['mv' + i].value.trim(), label = f['mk' + i].value.trim();
      if (value && !label) e['metric' + i] = 'Add what this figure measures.';
      if (label && !value) e['metric' + i] = 'Add the figure, e.g. 99.8%.';
    });
    var logo = f.logoFile.files[0];
    if (logo) {
      if (!/^image\/(png|jpeg|webp)$/.test(logo.type) && !/\.(png|jpe?g|webp)$/i.test(logo.name)) e.logoFile = 'The logo must be a PNG, JPG or WebP image.';
      else if (logo.size > MAX_LOGO_BYTES) e.logoFile = 'That logo is ' + Math.ceil(logo.size / 1024) + ' KB. The limit is 300 KB, so resize or compress it.';
    }
    var mode = pdfMode();
    if (mode === 'upload') {
      var file = f.pdfFile.files[0];
      if (!file) e.pdfFile = 'Choose the PDF to upload.';
      else if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') e.pdfFile = 'That file is not a PDF.';
      else if (file.size > MAX_PDF_BYTES) e.pdfFile = 'That PDF is ' + (file.size / 1048576).toFixed(1) + ' MB. The limit is 3 MB, so compress it or use “Link to a PDF”.';
    }
    if (mode === 'link') {
      var url = f.pdfUrl.value.trim();
      if (!/^https:\/\//i.test(url)) e.pdfUrl = 'Paste the full link, starting with https://';
      else if (linkProblem(url)) e.pdfUrl = linkProblem(url);
    }
    return e;
  }

  // Reads a chosen PDF as base64, refusing anything that does not start like a PDF.
  function readPdf(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var data = String(reader.result).replace(/^data:[^,]*,/, '');
        if (atob(data.slice(0, 8)).slice(0, 5) !== '%PDF-') { var err = new Error('That file is not a PDF.'); err.field = 'pdfFile'; return reject(err); }
        resolve(data);
      };
      reader.onerror = function () { var err = new Error('The PDF could not be read. Please choose it again.'); err.field = 'pdfFile'; reject(err); };
      reader.readAsDataURL(file);
    });
  }

  // Reads a chosen logo as base64 (the server checks the real image type).
  function readLogo(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).replace(/^data:[^,]*,/, '')); };
      reader.onerror = function () { var err = new Error('The logo could not be read. Please choose it again.'); err.field = 'logoFile'; reject(err); };
      reader.readAsDataURL(file);
    });
  }

  function submitCase(id) {
    var form = document.getElementById('dc-form');
    var f = form.elements;
    if (!showErrors(form, caseErrors(f))) return;
    var mode = pdfMode();
    var item = {
      client: f.client.value, category: f.category.value, industry: f.industry.value, arch_tag: f.arch_tag.value,
      location: f.location.value, period: f.period.value, summary: f.summary.value, challenge: f.challenge.value,
      solution: f.solution.value, outcomes: lines(f.outcomes.value), published: f.published.checked,
      metrics: [0, 1, 2, 3].map(function (i) { return [f['mk' + i].value, f['mv' + i].value]; }),
      pdf: { mode: mode }
    };
    if (mode === 'link') item.pdf.url = f.pdfUrl.value.trim();
    var upload = mode === 'upload' ? f.pdfFile.files[0] : null;
    var logoUpload = f.logoFile.files[0] || null;
    item.logo = { mode: logoUpload ? 'upload' : (f.logoRemove && f.logoRemove.checked ? 'none' : 'keep') };
    Promise.all([upload ? readPdf(upload) : null, logoUpload ? readLogo(logoUpload) : null]).then(function (files) {
      if (files[0]) { item.pdf.filename = upload.name; item.pdf.dataBase64 = files[0]; }
      if (files[1]) item.logo.dataBase64 = files[1];
      return save('caseStudy', 'save', { id: id || undefined, item: item }, {
        inModal: true,
        label: (upload || logoUpload)
          ? (publishing() ? 'Uploading the files, committing to GitHub and deploying to Vercel…' : 'Uploading the files…')
          : null
      });
    }).then(forceClose, function (err) { serverError(form, err); });
  }

  // ---------- banner form ----------
  function bannerForm(banner) {
    var b = banner || { tone: 'info', isActive: true };
    var tones = Object.keys(TONES).map(function (k) {
      return { value: k, html: '<span class="dc-swatch" style="background:' + TONES[k].color + '"></span>' + esc(TONES[k].label) + ' <small>' + esc(TONES[k].hint) + '</small>' };
    });
    var body = '<div class="dc-preview" style="position:static;margin-bottom:18px"><p class="dc-preview-label">' + icon('eye') + 'Live preview · top of every page</p>' +
      '<div class="dc-preview-frame" id="dc-preview"></div><p class="dc-preview-note" id="dc-preview-note"></p></div>' +
      '<form class="dc-form" id="dc-form" data-kind="banner" data-id="' + esc(b.id || '') + '" novalidate>' +
      textarea({ name: 'message', label: 'Message', required: true, max: 200, rows: 2, value: b.message, wide: true,
        placeholder: 'e.g. Our offices are closed 20–24 Oct for Diwali. Emergency support: +91 95588 09163.' }) +
      choices('tone', 'Style', tones, TONES[b.tone] ? b.tone : 'info', true) +
      input({ name: 'linkLabel', label: 'Link text', max: 40, value: b.linkLabel, placeholder: 'e.g. See open roles', hint: 'Optional.' }) +
      input({ name: 'linkUrl', label: 'Link goes to', max: 500, value: b.linkUrl, placeholder: 'careers or https://…', hint: 'A page on this site, a full https:// link, or tel:/mailto:' }) +
      input({ name: 'startsOn', label: 'Show from', type: 'date', value: b.startsOn, hint: 'Optional. Empty means straight away.' }) +
      input({ name: 'endsOn', label: 'Show until (inclusive)', type: 'date', value: b.endsOn, hint: 'Optional. Empty means until you switch it off.' }) +
      switchField('isActive', 'Status', b.isActive !== false, 'Active: shown on the website (within the dates above)', 'Off: saved, but not shown') +
      '</form><p class="dc-error" id="dc-form-error" role="alert" hidden></p>';
    openModal(banner ? 'Edit Banner' : 'New Banner', body,
      footer(banner ? 'Save Changes' : 'Publish Banner', 'data-save-banner="' + esc(b.id || '') + '"'), { size: 'mid', form: true });
    syncForm(document.getElementById('dc-form'));
  }

  function bannerFromForm(f) {
    var tone = document.querySelector('#dc-form input[name="tone"]:checked');
    return {
      message: f.message.value.replace(/\s+/g, ' ').trim(), tone: tone ? tone.value : '',
      linkLabel: f.linkLabel.value.trim(), linkUrl: f.linkUrl.value.trim(),
      startsOn: f.startsOn.value, endsOn: f.endsOn.value, isActive: f.isActive.checked
    };
  }

  function bannerPreview(form) {
    var b = bannerFromForm(form.elements);
    var day = localDay();
    var s = bannerState(b, day);
    document.getElementById('dc-preview').innerHTML = bannerHtml(b);
    var text = s === 'off' ? 'Switched off: saved, but not shown.'
      : s === 'soon' ? 'Starts showing on ' + fmtDay(b.startsOn) + (b.endsOn ? ' and stops after ' + fmtDay(b.endsOn) : '') + '.'
      : s === 'ended' ? 'These dates are in the past, so this banner will not show.'
      : (b.endsOn ? 'Shows from today until the end of ' + fmtDay(b.endsOn) + '.' : 'Shows from today until you switch it off.');
    // New banners go to the top of the list; an edited one keeps its place behind any live banner above it.
    var id = form.dataset.id;
    var index = id ? state.data.banners.map(function (x) { return x.id; }).indexOf(id) : 0;
    var ahead = state.data.banners.slice(0, index).filter(function (x) { return bannerState(x, day) === 'on'; })[0];
    var live = liveBanner(state.data.banners);
    if (s === 'on' && ahead) text += ' Until “' + ahead.message.slice(0, 50) + '” ends or is switched off, that banner shows instead.';
    else if (s === 'on' && !id && live) text += ' It will replace the banner showing now.';
    var note = document.getElementById('dc-preview-note');
    note.textContent = text;
    note.classList.toggle('is-warn', s !== 'on' || !!ahead);
  }

  function bannerErrors(f) {
    var b = bannerFromForm(f);
    var e = {};
    if (!b.message) e.message = 'Write the banner message.';
    if (!b.tone) e.tone = 'Choose a style.';
    if (b.linkLabel && !b.linkUrl) e.linkUrl = 'Add where the link should go.';
    if (b.linkUrl && !b.linkLabel) e.linkLabel = 'Add the link text visitors will click.';
    if (b.linkUrl && linkProblem(b.linkUrl)) e.linkUrl = linkProblem(b.linkUrl);
    if (b.startsOn && b.endsOn && b.endsOn < b.startsOn) e.endsOn = 'The end date must be on or after the start date.';
    return e;
  }

  function submitBanner(id) {
    var form = document.getElementById('dc-form');
    var f = form.elements;
    if (!showErrors(form, bannerErrors(f))) return;
    save('banner', 'save', { id: id || undefined, item: bannerFromForm(f) }, { inModal: true })
      .then(forceClose, function (err) { serverError(form, err); });
  }

  // ---------- live form behaviour ----------
  function forceClose() {
    modal.dataset.dirty = '';
    closeModal();
  }

  // Counters, conditional fields, switch captions and previews, from the form's current values.
  function syncForm(form) {
    if (!form) return;
    var f = form.elements;
    form.querySelectorAll('[data-counter]').forEach(function (el) {
      var field = f[el.getAttribute('data-counter')];
      var max = +el.getAttribute('data-max');
      var used = field.value.length;
      el.textContent = used + ' / ' + max;
      el.classList.toggle('is-near', used > max * 0.9);
    });
    form.querySelectorAll('input[data-on]').forEach(function (el) {
      el.parentNode.querySelector('[data-switch-text]').textContent = el.checked ? el.dataset.on : el.dataset.off;
    });
    var kind = form.dataset.kind;
    if (kind === 'job') {
      f.locationOther.hidden = f.location.value !== '__other';
      jobPreview(f);
    } else if (kind === 'caseStudy') {
      var mode = pdfMode();
      form.querySelectorAll('[data-show]').forEach(function (box) { box.hidden = box.getAttribute('data-show') !== mode; });
    } else if (kind === 'banner') {
      bannerPreview(form);
    }
  }

  function onFormInput(event) {
    var form = document.getElementById('dc-form');
    if (!form || !form.contains(event.target)) return;
    modal.dataset.dirty = '1';
    var box = event.target.closest('[data-field]');
    if (box) setFieldError(form, box.getAttribute('data-field'), '');
    if (!form.querySelector('.dc-err:not([hidden])')) formError('');
    syncForm(form);
  }

  // ---------- events ----------
  function onClick(event) {
    var t = event.target.closest('button, a');
    if (!t || t.id !== 'dc-menu-btn') setMenu(false);
    if (!t) return;
    var d = t.dataset;
    if (t.id === 'dc-menu-btn') { setMenu(t.getAttribute('aria-expanded') !== 'true'); return; }
    if (d.tab) { state.tab = d.tab; render(); return; }
    if ('close' in d) { closeModal(); return; }
    if (state.busy) return;
    if (t.id === 'dc-refresh') { refresh(t); return; }
    if (t.id === 'dc-mail-check' || t.id === 'dc-mail-send') { checkEmail(t, t.id === 'dc-mail-send'); return; }
    if (t.id === 'dc-logout') {
      t.disabled = true;
      api('/api/admin/auth', { method: 'DELETE' }).then(function () { backToSignIn('signed-out'); }, function () { backToSignIn('signed-out'); });
      return;
    }
    if (d.viewReq) return showRequirement(d.viewReq);
    if (d.viewNote) return showNote(d.viewNote);
    if (d.viewLead) return showLead(d.viewLead);
    if (d.viewCs) return showCaseStudy(d.viewCs);
    if (d.addNote) return submitNote(d.addNote, d.id);
    if (d.removeNote) return removeNote(t);
    if (d.purge) return purgeRecord(d.purge, d.id);
    if (d.export === 'requirements') {
      return downloadCsv('client-requirements-' + today() + '.csv', ['Date', 'Client Name', 'Company', 'Topic', 'Phone', 'Email', 'Full Scope', 'Status', 'Internal Notes'],
        state.data.requirements.map(function (r) { return [fmtDate(r.date), r.name, r.company, r.topic, r.phone, r.email, r.message, STATUSES[statusOf(r)], notesText(r)]; }));
    }
    if (d.export === 'applicants') {
      return downloadCsv('job-applicants-' + today() + '.csv', ['Date', 'Candidate Name', 'Role Applied For', 'Location', 'Phone', 'Email', 'CV Attached', 'Note', 'Status', 'Internal Notes'],
        state.data.applicants.map(function (a) { return [fmtDate(a.date), a.name, a.role, a.location, a.phone, a.email, a.cv ? 'Yes' : 'No', a.message, STATUSES[statusOf(a)], notesText(a)]; }));
    }
    if (d.export === 'leads') {
      return downloadCsv('case-study-leads-' + today() + '.csv', ['Date', 'Requester Name', 'Company', 'Phone', 'Email', 'Case Study', 'Request', 'Status', 'Internal Notes'],
        state.data.leads.map(function (l) { return [fmtDate(l.date), l.name, l.company, l.phone, l.email, l.caseTitle || l.caseId, leadRequest(l) === 'summary' ? 'Summary viewed' : 'PDF emailed', STATUSES[statusOf(l)], notesText(l)]; }));
    }
    if (d.reorder) { state.reorder[d.reorder] = currentOrder(d.reorder); renderPanel(); return; }
    if ('reorderCancel' in d) { delete state.reorder[TAB_TYPE[state.tab]]; renderPanel(); return; }
    if ('reorderSave' in d) return saveOrder(TAB_TYPE[state.tab]);
    if (d.move) return moveItem(TAB_TYPE[state.tab], d.id, d.move);
    if ('newJob' in d) return jobForm(null);
    if (d.editJob) return jobForm(find('jobs', d.editJob));
    if ('newCs' in d) return caseForm(null);
    if (d.editCs) return caseForm(find('caseStudies', d.editCs));
    if ('newBanner' in d) return bannerForm(null);
    if (d.editBanner) return bannerForm(find('banners', d.editBanner));
    if ('saveJob' in d) return submitJob(d.saveJob);
    if ('saveCs' in d) return submitCase(d.saveCs);
    if ('saveBanner' in d) return submitBanner(d.saveBanner);
    if (d.delete) {
      var type = d.delete;
      var item = find(TYPES[type].list, d.id);
      if (!item) return;
      var name = item.title || item.client || item.message;
      var hint = {
        job: 'This removes the opening from the careers page and from this list. To stop applications for now, switch it to Closed instead.',
        caseStudy: 'This removes it from the website and from this list. To take it down for now, switch it to Draft instead.',
        banner: 'This removes the banner for good. To hide it for now, switch it Off instead.'
      }[type];
      confirmBox('Delete “' + (name.length > 60 ? name.slice(0, 57) + '…' : name) + '”?', hint, 'Delete')
        .then(function (yes) {
          if (!yes) return;
          save(type, 'delete', { id: d.id }).catch(function (err) { if (err.message !== 'Signed out') toast(err.message, 'bad'); });
        });
    }
  }

  function onChange(event) {
    var input = event.target;
    if (!input.dataset) return;
    if ('show' in input.dataset) { state.show[state.tab] = input.value; renderPanel(); return; }
    if (input.dataset.status) {
      if (state.busy) { input.value = input.dataset.value; return; }
      saveStatus(input);
      return;
    }
    if (!input.dataset.toggle) return;
    var type = input.dataset.toggle;
    var value = input.checked;
    var label = input.parentNode.querySelector('[data-toggle-label]');
    var words = TYPES[type];
    if (state.busy) { input.checked = !value; return; }
    label.textContent = value ? words.on : words.off;
    input.disabled = true;
    save(type, 'toggle', { id: input.dataset.id, value: value }).catch(function (err) {
      input.checked = !value;
      input.disabled = false;
      label.textContent = !value ? words.on : words.off;
      if (err.message !== 'Signed out') toast(err.message, 'bad');
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

  // Resolves true when the latest records were loaded, false otherwise.
  function load() {
    return api('/api/admin/data').then(function (data) {
      data.banners = data.banners || [];
      state.data = data;
      state.reorder = {}; // an unsaved order may no longer match the reloaded lists
      render();
      return true;
    }, function (err) {
      if (err.message === 'Signed out') return false;
      document.getElementById('dc-panel').innerHTML = '<div class="dc-empty">' + esc(err.message) + ' <button type="button" class="dc-btn" id="dc-refresh">Try again</button></div>';
      return false;
    });
  }

  // Refresh reloads every list and says so, even when nothing changed.
  function refresh(button) {
    if (button.disabled) return;
    var label = button.textContent;
    button.disabled = true;
    button.textContent = 'Refreshing…';
    load().then(function (ok) {
      // The panel's "Try again" shares the header button's id and is replaced
      // by the reload, so restore only the button that was clicked.
      if (button.isConnected) { button.disabled = false; button.textContent = label; }
      if (ok) toast('Up to date: latest records loaded at ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '.', 'ok');
    });
  }

  function setMenu(open) {
    var btn = document.getElementById('dc-menu-btn');
    var menu = document.getElementById('dc-menu');
    if (!btn || !menu) return;
    if (!open && menu.hidden) return;
    btn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (open) { var first = menu.querySelector('[aria-current="page"]') || menu.querySelector('.dc-menu-item'); if (first) first.focus(); }
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
  modal.addEventListener('input', onFormInput);
  modal.addEventListener('change', onFormInput);
  modal.addEventListener('submit', function (e) { e.preventDefault(); });
  modal.addEventListener('click', function (e) { if (e.target === modal && !modal.dataset.form) closeModal(); });
  // Escape: never while saving, and not over unsaved edits (Cancel still discards them).
  modal.addEventListener('cancel', function (e) {
    if (state.busy) { e.preventDefault(); return; }
    if (modal.dataset.dirty) { e.preventDefault(); formError('You have unsaved changes. Save them, or press Cancel to discard them.'); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var menu = document.getElementById('dc-menu');
    if (menu && !menu.hidden) { setMenu(false); var btn = document.getElementById('dc-menu-btn'); if (btn) btn.focus(); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (!state.leaving && (state.busy || (modal.open && modal.dataset.dirty))) { e.preventDefault(); e.returnValue = ''; }
  });
  load();
})();
