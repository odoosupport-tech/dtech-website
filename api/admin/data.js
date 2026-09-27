// GET /api/admin/data: everything the management console shows (session required).
//
//   GET                  { requirements, applicants, leads, jobs, caseStudies, canSave, hasInbox }
//   GET ?cv=<applicant>  that applicant's CV file, as a download

const fs = require('fs');
const path = require('path');
const store = require('../_store');
const { requireSession } = require('../_admin');

const ID_RE = /^[a-z0-9-]{1,40}$/;

// Jobs and case studies: the latest committed version when GitHub access is
// set up (so changes show before the redeploy finishes), else the deployed file.
async function siteList(file) {
  if (store.isConfigured('site')) return store.readJson('site', file, []);
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', file), 'utf8'));
}

async function privateList(file) {
  if (!store.isConfigured('private')) return [];
  return store.readJson('private', file, []);
}

async function sendCv(req, res, id) {
  if (!ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Unknown applicant' });
  const applicant = (await privateList('applicants.json')).find(a => a && a.id === id);
  if (!applicant || !applicant.cv || !applicant.cv.path) return res.status(404).json({ ok: false, error: 'This applicant did not attach a CV.' });
  const file = await store.readFile('private', applicant.cv.path);
  if (!file) return res.status(404).json({ ok: false, error: 'The CV file could not be found.' });
  const name = String(applicant.cv.filename || 'cv').replace(/[^A-Za-z0-9 ._-]/g, '');
  res.setHeader('Content-Type', applicant.cv.type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Length', String(file.length));
  return res.status(200).send(file);
}

module.exports = async function handler(req, res) {
  if (!requireSession(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    if (req.query && req.query.cv) return await sendCv(req, res, String(req.query.cv));
    const [requirements, applicants, leads, jobs, caseStudies] = await Promise.all([
      privateList('requirements.json'),
      privateList('applicants.json'),
      privateList('leads.json'),
      siteList('jobs.json'),
      siteList('case-studies.json'),
    ]);
    return res.status(200).json({
      ok: true,
      requirements, applicants, leads, jobs, caseStudies,
      canSave: store.isConfigured('site'),
      hasInbox: store.isConfigured('private'),
    });
  } catch (err) {
    console.error('Console data load failed:', err.message);
    return res.status(502).json({ ok: false, error: 'The latest records could not be loaded. Please try again in a minute.' });
  }
};
