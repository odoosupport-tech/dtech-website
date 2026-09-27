// GET /api/jobs
// Returns the open roles from data/jobs.json (managed in the management
// console, which commits changes to that file and so redeploys the site).
//
// Response: { ok: true, source: "site", jobs: [...] }
// Only roles with isActive: true are listed. If the file cannot be read the
// careers page keeps the static list it ships with.

const fs = require('fs');
const path = require('path');

const PUBLIC_FIELDS = ['id', 'title', 'department', 'location', 'positions', 'summary'];

function activeJobs() {
  const all = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'jobs.json'), 'utf8'));
  if (!Array.isArray(all)) throw new Error('data/jobs.json must be an array');
  return all
    .filter(job => job && job.isActive === true)
    .map(job => Object.fromEntries(PUBLIC_FIELDS.map(k => [k, job[k]])));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const jobs = activeJobs();
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ ok: true, source: 'site', jobs });
  } catch (err) {
    console.error('Reading data/jobs.json failed:', err.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, error: 'Openings are unavailable right now.' });
  }
};
