// GET /api/admin/console: the management console app script (session required).
// portal.html (the admin sign-in page at /admin-dtech) loads this script only
// after sign-in, so the console's markup never appears in a public file.

const fs = require('fs');
const path = require('path');
const { requireSession } = require('../_admin');

let app;

module.exports = async function handler(req, res) {
  if (!(await requireSession(req, res))) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    if (!app) app = fs.readFileSync(path.join(__dirname, '_console-app.js'), 'utf8');
  } catch (err) {
    console.error('Console app script missing from the function bundle:', err.message);
    return res.status(500).json({ ok: false, error: 'Console unavailable' });
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  return res.status(200).send(app);
};
