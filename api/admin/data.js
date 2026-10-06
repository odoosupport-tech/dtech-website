// GET /api/admin/data: everything the management console shows (session required).
//
//   GET                  { requirements, applicants, leads, jobs, caseStudies, banners,
//                          canSave, publishing: "github"|"local"|null, hasInbox }
//   GET ?cv=<applicant>  that applicant's CV file, as a download
//   GET ?pdf=<file>      a redirect to a short-lived signed link to a case-study PDF
//                        under assets/case-studies/pdf/ (lead-gated; see _pdf-link.js)
//   GET ?case=<id>       a redirect to that case study's PDF: a signed link as above,
//                        or its outside https link (which the public list hides)
//   GET ?deployed=<file> the copy of jobs.json, case-studies.json or banners.json in
//                        this deployment, so the console can tell when a change is
//                        live (the public never sees the raw files, drafts included)

const fs = require('fs');
const path = require('path');
const store = require('../_store');
const { requireSession } = require('../_admin');
const { signedPdfPath, FETCH_LINK_MS } = require('../_pdf-link');

const ID_RE = /^[a-z0-9-]{1,40}$/;
const SITE_FILES = ['jobs.json', 'case-studies.json', 'banners.json'];
// No dots outside the extension, so no "..": the path stays inside the PDF folder.
const PDF_FILE_RE = /^assets\/case-studies\/pdf\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)?\.pdf$/;
const CASE_ID_RE = /^[a-z0-9-]{1,80}$/;
const LINK_RE = /^https:\/\/[^\s"'<>]+$/;

function deployedList(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', file), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Jobs, case studies and banners: the latest committed version when GitHub
// access is set up (so changes show before the redeploy finishes), else the
// deployed file. A list that has never been saved (banners) starts empty.
async function siteList(file) {
  if (store.isConfigured('site')) return store.readJson('site', file, []);
  return deployedList(file);
}

async function privateList(file) {
  if (!store.isConfigured('private')) return [];
  return store.readJson('private', file, []);
}

function redirect(res, location) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', location);
  return res.status(302).send('');
}

async function openCasePdf(res, id) {
  if (!CASE_ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Unknown case study' });
  const c = (await siteList('case-studies.json')).find(x => x && x.id === id);
  const file = c && typeof c.pdf_file === 'string' ? c.pdf_file : '';
  if (PDF_FILE_RE.test(file)) return redirect(res, signedPdfPath(file, FETCH_LINK_MS));
  if (LINK_RE.test(file)) return redirect(res, file);
  return res.status(404).json({ ok: false, error: 'This case study has no PDF.' });
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
  if (!(await requireSession(req, res))) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    if (req.query && req.query.cv) return await sendCv(req, res, String(req.query.cv));
    if (req.query && req.query.pdf) {
      const file = String(req.query.pdf);
      if (!PDF_FILE_RE.test(file)) return res.status(400).json({ ok: false, error: 'Unknown PDF' });
      return redirect(res, signedPdfPath(file, FETCH_LINK_MS));
    }
    if (req.query && req.query.case) return await openCasePdf(res, String(req.query.case));
    if (req.query && req.query.deployed) {
      const file = String(req.query.deployed);
      if (!SITE_FILES.includes(file)) return res.status(400).json({ ok: false, error: 'Unknown list' });
      return res.status(200).json(deployedList(file));
    }
    const [requirements, applicants, leads, jobs, caseStudies, banners] = await Promise.all([
      privateList('requirements.json'),
      privateList('applicants.json'),
      privateList('leads.json'),
      siteList('jobs.json'),
      siteList('case-studies.json'),
      siteList('banners.json'),
    ]);
    return res.status(200).json({
      ok: true,
      requirements, applicants, leads, jobs, caseStudies, banners,
      canSave: store.isConfigured('site'),
      publishing: store.mode('site'),
      hasInbox: store.isConfigured('private'),
    });
  } catch (err) {
    console.error('Console data load failed:', err.message);
    return res.status(502).json({ ok: false, error: 'The latest records could not be loaded. Please try again in a minute.' });
  }
};
