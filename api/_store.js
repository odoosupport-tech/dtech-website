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
//   logos    assets/case-studies/logos/custom/ in the same repository: client logos
//            uploaded with a case study (public, shown on its card).
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
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 150;
const UPLOADS_DIR = 'assets/case-studies/pdf/custom';
const LOGOS_DIR = 'assets/case-studies/logos/custom';

function storeConfig(name) {
  if (name !== 'site' && name !== 'uploads' && name !== 'logos' && name !== 'private') throw new Error(`Unknown store "${name}"`);
  const env = process.env;
  const siteRepo = { repo: env.GITHUB_REPO || 'odoosupport-tech/dtech-website', token: env.GITHUB_TOKEN, branch: env.GITHUB_BRANCH || 'main' };
  const cfg = name === 'site' ? { name, ...siteRepo, localDir: 'data', prefix: 'data/' }
    : name === 'uploads' ? { name, ...siteRepo, localDir: UPLOADS_DIR, prefix: `${UPLOADS_DIR}/` }
    : name === 'logos' ? { name, ...siteRepo, localDir: LOGOS_DIR, prefix: `${LOGOS_DIR}/` }
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
  if (cfg.name === 'private') await assertPrivateRepo(cfg);
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

// Briefly cache visibility to limit GitHub calls, including for reads. A warm
// function rechecks after a minute rather than trusting visibility forever.
const PRIVATE_CHECK_MS = 60 * 1000;
const verifiedPrivate = new Map();

// Personal data (CVs, phone numbers) must never land in a public repository,
// even if someone flips the data repository's visibility by mistake.
async function assertPrivateRepo(cfg) {
  const key = cfg.repo.toLowerCase();
  const checkedAt = verifiedPrivate.get(key);
  if (checkedAt !== undefined && Date.now() - checkedAt < PRIVATE_CHECK_MS) return;
  verifiedPrivate.delete(key);
  const res = await ghRequest(cfg, 'GET', `${API}/repos/${cfg.repo}`);
  if (!res.ok) throw await ghError(res, `visibility check of ${cfg.repo}`);
  const meta = await res.json();
  if (meta.private !== true) throw new Error(`${cfg.repo} is not private; refusing to store personal data in it`);
  verifiedPrivate.set(key, Date.now());
}

// Returns true on success, false when the write lost a race (retry), throws otherwise.
async function writeRaw(cfg, file, buffer, sha, message) {
  if (cfg.mode === 'local') {
    const full = path.join(process.cwd(), cfg.localDir, safePath(file));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    // Write beside the file, then rename: a reader never sees half a document.
    const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, full);
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Deletes a file; resolves false when it does not exist. Git history still holds
// earlier versions of a deleted file until squashHistory() replaces it.
async function deleteRaw(cfg, file, message) {
  if (cfg.mode === 'local') {
    try {
      fs.unlinkSync(path.join(process.cwd(), cfg.localDir, safePath(file)));
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }
  if (cfg.name === 'private') await assertPrivateRepo(cfg);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const hit = await readRaw(cfg, file);
    if (!hit) return false;
    const res = await gh(cfg, 'DELETE', file, { body: { message, sha: hit.sha, branch: cfg.branch } });
    if (res.ok) return true;
    const detail = await res.text().catch(() => '');
    const lostRace = res.status === 409 || (res.status === 422 && /\bsha\b/i.test(detail));
    if (!lostRace) throw new Error(`GitHub delete of ${file} failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
    await sleep(RETRY_BASE_MS * attempt * (1 + Math.random()));
  }
  throw new Error(`${file} changed too often while deleting; please try again`);
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

// Returned by a mutate callback when nothing needs saving: updateJson then skips
// the write (and the commit) and resolves with the document it read.
const UNCHANGED = Symbol('unchanged');

// Local disk has no SHA check, so concurrent updates inside this process are
// queued one after another per file. This protects one dev server only: two
// processes sharing .portal-data/ can still overwrite each other (GitHub mode
// has no such gap; the SHA makes the losing write fail and retry).
const localQueues = new Map();
function serializeLocally(key, task) {
  const run = (localQueues.get(key) || Promise.resolve()).then(task);
  const tail = run.catch(() => {});
  localQueues.set(key, tail);
  tail.then(() => { if (localQueues.get(key) === tail) localQueues.delete(key); });
  return run;
}

// Read-modify-write with optimistic locking: mutate(current) returns the new
// value; a concurrent write makes GitHub reject ours, so re-read and retry.
// mutate may therefore run several times: keep it free of side effects.
// message is the commit message, or a function of the new value returning one.
async function updateJson(storeName, file, fallback, mutate, message) {
  const cfg = requireStore(storeName);
  const attempts = async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const hit = await readRaw(cfg, file);
      const current = hit ? JSON.parse(hit.buffer.toString('utf8')) : fallback;
      const next = await mutate(current);
      if (next === UNCHANGED) return current;
      const buffer = Buffer.from(JSON.stringify(next, null, 2) + '\n', 'utf8');
      const text = typeof message === 'function' ? message(next) : message;
      if (await writeRaw(cfg, file, buffer, hit && hit.sha, text)) return next;
      // Jittered back-off so simultaneous writers do not collide again in lockstep.
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BASE_MS * attempt * (1 + Math.random()));
    }
    throw new Error(`${file} changed too often while saving; please try again`);
  };
  return cfg.mode === 'local' ? serializeLocally(`${cfg.name}:${file}`, attempts) : attempts();
}

async function appendJson(storeName, file, record, message) {
  await updateJson(storeName, file, [], list => [record, ...(Array.isArray(list) ? list : [])], message);
  return record;
}

async function putFile(storeName, file, buffer, message) {
  const cfg = requireStore(storeName);
  if (!(await writeRaw(cfg, file, buffer, null, message))) throw new Error(`${file} already exists`);
}

async function deleteFile(storeName, file, message) {
  return deleteRaw(requireStore(storeName), file, message);
}

async function readFile(storeName, file) {
  const hit = await readRaw(requireStore(storeName), file);
  return hit ? hit.buffer : null;
}

// Replaces the private repository's history with one commit holding its
// current files, so records and CVs deleted from the console can no longer be
// recovered from earlier commits. Resolves true when the history is a single
// snapshot afterwards (also when it already was), false for local storage,
// which keeps no history.
//
// A write that lands between the final ref check and the force-update would be
// dropped from the repository (the visitor's email copy still exists); the
// window is a few milliseconds, and the ref is re-checked before every attempt.
// GitHub may keep unreachable commits readable by their exact id until it
// garbage-collects them; GitHub Support can purge them sooner.
async function squashHistory(storeName, message) {
  const cfg = requireStore(storeName);
  if (cfg.name !== 'private') throw new Error('Only the private store has its history replaced');
  if (cfg.mode === 'local') return false;
  await assertPrivateRepo(cfg);
  const base = `${API}/repos/${cfg.repo}/git`;
  const refUrl = `${base}/refs/heads/${encodeURIComponent(cfg.branch)}`;
  const getJson = async (url, what) => {
    const res = await ghRequest(cfg, 'GET', url);
    if (!res.ok) throw await ghError(res, what);
    return res.json();
  };
  const headSha = async () => (await getJson(`${base}/ref/heads/${encodeURIComponent(cfg.branch)}`, 'branch lookup')).object.sha;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const head = await headSha();
    const commit = await getJson(`${base}/commits/${head}`, 'commit lookup');
    if (!commit.parents || commit.parents.length === 0) return true; // already one snapshot
    const created = await ghRequest(cfg, 'POST', `${base}/commits`, { body: { message, tree: commit.tree.sha, parents: [] } });
    if (!created.ok) throw await ghError(created, 'snapshot commit');
    const snapshot = (await created.json()).sha;
    // Another write since we read the branch: start again from the new head.
    if ((await headSha()) !== head) {
      await sleep(RETRY_BASE_MS * attempt * (1 + Math.random()));
      continue;
    }
    const moved = await ghRequest(cfg, 'PATCH', refUrl, { body: { sha: snapshot, force: true } });
    if (!moved.ok) throw await ghError(moved, 'history replacement');
    return true;
  }
  throw new Error('The private repository changed too often while replacing its history; please try again');
}

function newId() {
  return `${Date.now().toString(36)}-${require('crypto').randomBytes(4).toString('hex')}`;
}

module.exports = { UPLOADS_DIR, LOGOS_DIR, UNCHANGED, isConfigured, mode, readJson, updateJson, appendJson, putFile, deleteFile, readFile, squashHistory, newId };
