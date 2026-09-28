// JSON/file storage for the Vercel functions, kept in GitHub repositories
// through the Contents API, so no database (and no card on file) is needed.
//
// Three stores:
//
//   site     data/*.json in THIS (public) repository: jobs, case studies and
//            site banners. A write is a commit, and the commit redeploys the
//            site, so the public pages pick the change up about a minute later.
//   uploads  assets/case-studies/pdf/custom/ in the same repository: case-study
//            PDFs uploaded from the management console (public by design, like
//            the built-in PDFs next to them).
//   private  a SEPARATE PRIVATE repository for anything personal: client
//            requirements, case-study leads, job applications and their CVs.
//            Never point this at the public site repository. Writes are
//            refused unless GitHub reports the repository as private.
//
//   GITHUB_TOKEN        token with Contents read/write on the site repository
//   GITHUB_REPO         optional  owner/name of the site repository
//                                 (default odoosupport-tech/dtech-website)
//   GITHUB_BRANCH       optional  branch Vercel deploys from (default main)
//   GITHUB_DATA_REPO    owner/name of the private repository for submissions
//   GITHUB_DATA_TOKEN   optional  token for that repository (default GITHUB_TOKEN)
//   GITHUB_DATA_BRANCH  optional  (default main)
//
// Outside Vercel (local development) a store without a token falls back to the
// local disk: data/ for the site store, assets/case-studies/pdf/custom/ for
// uploads, .portal-data/ (git-ignored) for the private one.

const fs = require('fs');
const path = require('path');

const API = 'https://api.github.com';
const TIMEOUT_MS = 6000;
const UPLOAD_TIMEOUT_MS = 20000; // a 3 MB PDF is a 4 MB request body
const MAX_ATTEMPTS = 2;
const UPLOADS_DIR = 'assets/case-studies/pdf/custom';

function storeConfig(name) {
  if (name !== 'site' && name !== 'uploads' && name !== 'private') throw new Error(`Unknown store "${name}"`);
  const env = process.env;
  const siteRepo = { repo: env.GITHUB_REPO || 'odoosupport-tech/dtech-website', token: env.GITHUB_TOKEN, branch: env.GITHUB_BRANCH || 'main' };
  const cfg = name === 'site' ? { name, ...siteRepo, localDir: 'data', prefix: 'data/' }
    : name === 'uploads' ? { name, ...siteRepo, localDir: UPLOADS_DIR, prefix: `${UPLOADS_DIR}/` }
    : { name, repo: env.GITHUB_DATA_REPO, token: env.GITHUB_DATA_TOKEN || env.GITHUB_TOKEN, branch: env.GITHUB_DATA_BRANCH || 'main', localDir: '.portal-data', prefix: '' };
  if (name === 'private' && cfg.repo && cfg.repo.toLowerCase() === (env.GITHUB_REPO || 'odoosupport-tech/dtech-website').toLowerCase()) {
    throw new Error('GITHUB_DATA_REPO must be a private repository, not the public site repository');
  }
  if (cfg.repo && cfg.token) return { ...cfg, mode: 'github' };
  if (!env.VERCEL) return { ...cfg, mode: 'local' };
  return null;
}

function isConfigured(name) {
  return mode(name) !== null;
}

// 'github', 'local' (disk, outside Vercel) or null when the store is not set up.
function mode(name) {
  try {
    const cfg = storeConfig(name);
    return cfg ? cfg.mode : null;
  } catch (err) {
    console.error(err.message);
    return null;
  }
}

function requireStore(name) {
  const cfg = storeConfig(name);
  if (!cfg) {
    throw new Error(name === 'site'
      ? 'Site storage is not configured: set GITHUB_TOKEN'
      : 'Private storage is not configured: set GITHUB_DATA_REPO and GITHUB_DATA_TOKEN (or GITHUB_TOKEN)');
  }
  return cfg;
}

function safePath(file) {
  if (!/^[A-Za-z0-9._/-]+$/.test(file) || file.split('/').some(p => p === '' || p === '.' || p === '..')) {
    throw new Error(`Invalid storage path "${file}"`);
  }
  return file;
}

function gh(cfg, method, file, options) {
  const url = `${API}/repos/${cfg.repo}/contents/${cfg.prefix}${safePath(file)}` + (method === 'GET' ? `?ref=${encodeURIComponent(cfg.branch)}` : '');
  return ghRequest(cfg, method, url, options);
}

async function ghRequest(cfg, method, url, { body, raw, timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dtech-website',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function ghError(res, what) {
  const detail = await res.text().catch(() => '');
  return new Error(`GitHub ${what} failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
}

// Returns { buffer, sha } or null when the file does not exist.
async function readRaw(cfg, file) {
  if (cfg.mode === 'local') {
    try {
      return { buffer: fs.readFileSync(path.join(process.cwd(), cfg.localDir, safePath(file))), sha: null };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
  const res = await gh(cfg, 'GET', file);
  if (res.status === 404) return null;
  if (!res.ok) throw await ghError(res, `read of ${file}`);
  const meta = await res.json();
  if (meta.encoding === 'base64' && meta.content) return { buffer: Buffer.from(meta.content, 'base64'), sha: meta.sha };
  // Files over 1 MB come back without inline content; fetch the raw bytes.
  const rawRes = await gh(cfg, 'GET', file, { raw: true });
  if (!rawRes.ok) throw await ghError(rawRes, `raw read of ${file}`);
  return { buffer: Buffer.from(await rawRes.arrayBuffer()), sha: meta.sha };
}

// Repositories confirmed private in this instance, so the check costs one request per cold start.
const verifiedPrivate = new Set();

// Personal data (CVs, phone numbers) must never land in a public repository,
// even if someone flips the data repository's visibility by mistake.
async function assertPrivateRepo(cfg) {
  const key = cfg.repo.toLowerCase();
  if (verifiedPrivate.has(key)) return;
  const res = await ghRequest(cfg, 'GET', `${API}/repos/${cfg.repo}`);
  if (!res.ok) throw await ghError(res, `visibility check of ${cfg.repo}`);
  const meta = await res.json();
  if (meta.private !== true) throw new Error(`${cfg.repo} is not private; refusing to store personal data in it`);
  verifiedPrivate.add(key);
}

// Returns true on success, false when the write lost a race (retry), throws otherwise.
async function writeRaw(cfg, file, buffer, sha, message) {
  if (cfg.mode === 'local') {
    const full = path.join(process.cwd(), cfg.localDir, safePath(file));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
    return true;
  }
  if (cfg.name === 'private') await assertPrivateRepo(cfg);
  const res = await gh(cfg, 'PUT', file, {
    body: { message, content: buffer.toString('base64'), branch: cfg.branch, ...(sha ? { sha } : {}) },
    timeoutMs: buffer.length > 512 * 1024 ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS,
  });
  if (res.ok) return true;
  if (res.status === 409) return false; // someone else wrote first
  const detail = await res.text().catch(() => '');
  // 422 is also GitHub's generic validation error; only a sha complaint
  // ("sha wasn't supplied", "does not match") means the file moved under us.
  if (res.status === 422 && /\bsha\b/i.test(detail)) return false;
  throw new Error(`GitHub write of ${file} failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
}

async function readJson(storeName, file, fallback) {
  const hit = await readRaw(requireStore(storeName), file);
  if (!hit) return fallback;
  try {
    return JSON.parse(hit.buffer.toString('utf8'));
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${err.message}`);
  }
}

// Read-modify-write with optimistic locking: mutate(current) returns the new
// value; a concurrent write makes GitHub reject ours, so re-read and retry.
// message is the commit message, or a function of the new value returning one.
async function updateJson(storeName, file, fallback, mutate, message) {
  const cfg = requireStore(storeName);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const hit = await readRaw(cfg, file);
    const current = hit ? JSON.parse(hit.buffer.toString('utf8')) : fallback;
    const next = await mutate(current);
    const buffer = Buffer.from(JSON.stringify(next, null, 2) + '\n', 'utf8');
    const text = typeof message === 'function' ? message(next) : message;
    if (await writeRaw(cfg, file, buffer, hit && hit.sha, text)) return next;
  }
  throw new Error(`${file} changed too often while saving; please try again`);
}

async function appendJson(storeName, file, record, message) {
  await updateJson(storeName, file, [], list => [record, ...(Array.isArray(list) ? list : [])], message);
  return record;
}

async function putFile(storeName, file, buffer, message) {
  const cfg = requireStore(storeName);
  if (!(await writeRaw(cfg, file, buffer, null, message))) throw new Error(`${file} already exists`);
}

async function readFile(storeName, file) {
  const hit = await readRaw(requireStore(storeName), file);
  return hit ? hit.buffer : null;
}

function newId() {
  return `${Date.now().toString(36)}-${require('crypto').randomBytes(4).toString('hex')}`;
}

module.exports = { UPLOADS_DIR, isConfigured, mode, readJson, updateJson, appendJson, putFile, readFile, newId };
