# D-TECH Solution Integrators — Website

Static marketing site for D-TECH Solution Integrators Pvt. Ltd.: home, about, online shop, solutions, case studies, contact and legal pages.

Plain HTML, CSS and JavaScript. Styling is a prebuilt Tailwind file (`assets/tailwind.css`) plus the layers in `assets/` (`skin.css`, `skin-dark.css`, `color.css`, `polish.css`). Icons are a Lucide subset in `assets/lucide.js`. Nothing is loaded from third-party script hosts.

## Run locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

## Rebuilding generated assets

Commit the outputs; Vercel serves them as-is and `tools/` is excluded by `.vercelignore`.

| Output | When to rebuild | Command (from the repo root) |
|---|---|---|
| `assets/tailwind.css` | after adding or changing Tailwind classes in any page or script | `npm run build:tailwind` |
| `assets/lucide.js` | after using a new `data-lucide` icon | `npm --prefix tools/lucide install && node tools/lucide/build.mjs` |
| `assets/og-image.png` | after editing `tools/og/og-image.html` | `node tools/og/render.mjs` (needs `puppeteer-core` and Chrome) |

`npm run build:css` always regenerates Tailwind from the current HTML and JavaScript before minifying and purging the production bundle. Run `npm run verify` before publishing to catch stale responsive utilities and other UI contract regressions.

## Analytics

The site loads no analytics script. Vercel Web Analytics was never switched on, so its loader (removed on 2026-10-06) only produced a 404 on every page. To add page-view counts later, turn on Vercel → Project → Analytics and restore `assets/analytics.js` from git history (commit before its removal), adding it back to every page and to `build:js` in `package.json`.

## Deploy on Vercel

1. Import this repository in Vercel.
2. Framework preset: **Other**. Leave the build command and output directory empty; the repository root is the site.
3. Deploy. `404.html` is served automatically for unknown paths.

## Email (SMTP)

The Vercel functions send mail over SMTP with [nodemailer](https://nodemailer.com), through `api/_mail.js`:

- `api/contact.js`: the Contact Us form (`contact.html`) posts here, and the enquiry is emailed to sales with Reply-To set to the visitor. If the function fails or is unavailable, the form falls back to opening the visitor's email app.
- `api/send-whitepaper.js`: case-study PDFs live in `assets/case-studies/pdf/`. When a visitor asks for one on `case-studies.html`, the PDF is emailed to them as an attachment and sales gets a lead notification.
- `middleware.js`: the PDFs are lead-gated. Vercel serves a file under `/assets/case-studies/pdf/` only on a signed, expiring link (`api/_pdf-link.js`): the one the site uses to attach it, the download link in the visitor's email (valid 14 days), or one issued to a signed-in console user. Any other request, including old PDF addresses search engines still list, is redirected to `/case-studies`, and the PDFs carry `X-Robots-Tag: noindex`. The signing key is `PDF_LINK_SECRET`, or `ADMIN_SECRET` when that is unset; with neither, no PDF is served and PDF requests answer 503.
- `api/apply.js`: job applications from `careers.html`, emailed with the CV attached (see Careers).

Set these in Vercel → Project → Settings → Environment Variables, then redeploy:

| Variable | Required | Purpose |
|---|---|---|
| `SMTP_HOST` | yes | SMTP server, e.g. `smtp.gmail.com`, `smtp.zoho.in`, `smtp.office365.com` |
| `SMTP_USER` | yes | Mailbox login, e.g. `sales@dtechindia.com` |
| `SMTP_PASS` | yes | That mailbox's password, or an app password when the account uses 2-step verification |
| `SMTP_PORT` | no | `465` (implicit TLS, default) or `587` (STARTTLS) |
| `SMTP_SECURE` | no | `true`/`false`; defaults to `true` on port 465 only |
| `MAIL_FROM` | no | Sender shown to recipients (default `D-TECH <SMTP_USER>`). Most providers reject a From address the login does not own. |
| `SALES_EMAIL` | no | Receives enquiries and lead notifications (default `sales@dtechindia.com`) |
| `SITE_URL` | no | Public address used in email links, e.g. `https://www.dtechindia.com` (default: the production address Vercel provides in `VERCEL_PROJECT_PRODUCTION_URL`; the request's Host header is never trusted on Vercel) |
| `ALLOWED_ORIGINS` | no | Extra comma-separated full origins allowed to call the functions, e.g. `https://www.dtechindia.com` (scheme, host and port must match; the request's own origin is allowed, but `X-Forwarded-Host` does not add trusted origins) |
| `PDF_LINK_SECRET` | no | Signs the case-study PDF links (at least 16 characters; default: `ADMIN_SECRET`). Changing it voids PDF links already emailed. |

**Google Workspace / Gmail:** `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` = the full mailbox address, and `SMTP_PASS` = a 16-character [app password](https://myaccount.google.com/apppasswords) (the account needs 2-Step Verification on; Google rejects the normal password over SMTP). Gmail sends as `SMTP_USER`; a different `MAIL_FROM` address only works if it is added under Gmail → Settings → Accounts → "Send mail as". Workspace allows about 2,000 messages a day per mailbox.

All three functions only accept JSON posts from the site's own origin, have a hidden bot trap field, and rate-limit by IP (the PDF function also by recipient). These limits live in memory per instance; add a CAPTCHA (e.g. Cloudflare Turnstile) or a shared store before heavy public use.


## News page

Posts live in `content/news.json`. To publish an update, add an entry at the top of `posts` and push; the page reads the file in the browser, so no rebuild is needed.

```json
{
  "title": "Headline",
  "date": "2026-09-16",
  "category": "Case study",
  "summary": "One short paragraph.",
  "youtube": "VIDEO_ID",
  "link": "kiosk.html",
  "linkLabel": "See the Safety Kiosk"
}
```

`youtube` is the id after `watch?v=` and shows the video thumbnail; use `image` instead for a local picture. `link` and `linkLabel` are optional.

## Careers

Open roles live in `data/jobs.json` (`id`, `title`, `department`, `location`, `positions`, `summary`, `isActive`) and are managed from the management console (below). `careers.html` ships a static copy of the list for visitors without JavaScript and replaces it with the live list from the API. In a summary, lines starting with `- ` become a bulleted list and an empty line starts a new paragraph.

| Endpoint | What it does |
|---|---|
| `GET /api/jobs` | The roles in `data/jobs.json` with `isActive: true`, cached by browsers for 1 minute. |
| `GET /api/content?list=case-studies` | `data/case-studies.json` for the public pages: published case studies in full, a draft only as `{ id, published: false }`. |
| `GET /api/content?list=banners` | The active banners from `data/banners.json`. |
| `POST /api/apply` | Emails the application to `HR_EMAIL` (default `SALES_EMAIL`) with the CV attached and Reply-To set to the candidate, and files it for the console. |

Protections on `/api/apply`: same-origin JSON only, a hidden bot-trap field, 5 applications per hour per IP and 3 per day per email address, CVs limited to PDF or Word and 3 MB.

## Stored submissions and published content

SMTP is the only delivery channel; nothing else receives the site's form data. In addition to the emails, the functions keep records for the management console in GitHub through the Contents API (`api/_store.js`), so there is no database to pay for:

| Data | Where | Written by |
|---|---|---|
| Client requirements, case-study leads, job applications, CVs | `requirements.json`, `leads.json`, `applicants.json`, `cvs/` in a **separate private repository** | `api/contact.js`, `api/send-whitepaper.js`, `api/apply.js` |
| Open roles, case studies, site banners | `data/jobs.json`, `data/case-studies.json`, `data/banners.json` in this repository | the management console |
| Case-study PDFs uploaded from the console | `assets/case-studies/pdf/custom/` in this repository (in the repository like the built-in PDFs; the website serves them only on signed links, see `middleware.js`) | the management console |

**Never store submissions in this repository.** It is public, and Vercel serves the repository root as the website, so anything committed here can be read by anyone and stays in the git history. `api/_store.js` refuses to use this repository for submissions.

Setup:

1. Create a private repository, e.g. `dtech-portal-data`, with an initial commit on `main`.
2. Create two [fine-grained personal access tokens](https://github.com/settings/personal-access-tokens), each limited to one repository with **Contents: Read and write**: one for this site repository, one for the private repository.
3. Add the variables below in Vercel and redeploy.

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | for the console to save changes | Token for this site repository |
| `GITHUB_REPO` | no | `owner/name` of this repository (default `odoosupport-tech/dtech-website`) |
| `GITHUB_BRANCH` | no | Branch Vercel deploys from (default `main`) |
| `GITHUB_DATA_REPO` | to store submissions | `owner/name` of the private repository |
| `GITHUB_DATA_TOKEN` | to store submissions | Token for the private repository (falls back to `GITHUB_TOKEN`) |
| `GITHUB_DATA_BRANCH` | no | Default `main` |
| `HR_EMAIL` | no | Receives job applications (default `SALES_EMAIL`) |

Without the private repository settings, submissions are still emailed; they just do not appear in the console. A submission counts as received when either the email or the stored record succeeds. Saving a job, case study or banner commits to `data/`, which redeploys the site, so the public pages show the change 1–2 minutes later. The raw `data/*.json` files are not served (`/data/*` goes to the 404 page), so drafts and hidden items never reach visitors: pages read them through `/api/jobs` and `/api/content`. Built-in case studies are the exception: their cards are part of `case-studies.html`, so unpublishing one hides it on the page but its text stays in the page source.

Locally (no `VERCEL` variable and no tokens), `data/` is edited in place, uploaded PDFs go to `assets/case-studies/pdf/custom/`, and submissions go to `.portal-data/`, which is git-ignored.

## Management console

A private dashboard for non-technical staff:

- **Inbox:** client requirements (with CSV export for Excel), job applicants (with CV download) and case-study leads. Visitors fill in the case-study form every time they open a summary or ask for a PDF (pre-filled after the first time), and every request is its own lead: the list shows whether it was a summary view or a PDF, how many requests that visitor has made, and **Details & Notes** shows their whole history. Summary views are only recorded; PDF requests also email the visitor and sales.
- **Careers:** add, edit, close or delete openings, with a live preview of the careers-page card.
- **Case studies:** add, edit, publish (or keep as a draft) and delete case studies, each with an optional PDF whitepaper, either uploaded (up to 3 MB) or linked (`https://`). Built-in case studies can be published or unpublished.
- **Site banners:** a notice across the top of every page (holiday closures, hiring drives, urgent updates) in one of three styles, with an optional link and optional start and end dates. One banner shows at a time: the first active one in the list whose dates include today. Visitors can close it.

Every form is checked in the browser and again on the server. While a change saves, the console shows “Committing to GitHub and deploying to Vercel…”, then watches the deployed file and shows **Live on the website** once Vercel has published it (usually 1–2 minutes).

- **Switch it on** by setting `ADMIN_SECRET` in Vercel to a long random password (at least 16 characters), then redeploy. Without it every admin endpoint answers 404. Changing it signs everyone out. Optionally set `ADMIN_USER` to the admin ID staff type with it (default `admin`, not case-sensitive).
- **Sign in** at `/admin-dtech` (the same page is also at `/portal`; **Ctrl + Shift + Alt + D** on the home page opens it) with the admin ID and password.
- After 5 wrong attempts, sign-in pauses for 15 minutes. The page shows a countdown, and the server enforces the same limit (5 attempts per 15 minutes per IP, per instance). Every wrong attempt also waits 1.5 seconds before the answer.
- **Shared rate limit (Vercel Firewall, free on Hobby):** the per-instance limit above resets when Vercel starts a new instance, so add one rule in the Vercel dashboard under **Firewall → Configure → New Rule**: *If* Request Path starts with `/api/` *and* Method equals `POST`, *Then* Rate Limit, Fixed Window, 60 s, 20 requests, key IP, action Default (429). Publish it. Hobby allows one rate-limit rule per project.
- **Sign Out** in the console header ends the session and returns to the sign-in page. It also revokes that session on the server (its id goes into `revoked-sessions.json` in the private store), so a copied cookie stops working within 30 seconds; other signed-in staff are not affected.
- The console script is only served (`/api/admin/console`) to a signed-in session, so its markup never appears in a public file. The sign-in page is not linked anywhere or listed in the sitemap, and is sent with `noindex, nofollow`.
- Sessions last 4 hours, in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/api/admin`. The ID and password checks are timing-safe.
- **Delete permanently** removes the record (and an applicant's CV) and then replaces the private repository's history with a single snapshot of its current files, so earlier copies are no longer reachable. The repository therefore keeps no change history. If GitHub refuses the rewrite (for example, branch protection on the data repository forbids force-pushes), the console says so. GitHub may keep unreachable commits readable by their exact id until it garbage-collects them; ask GitHub Support to purge them if that matters.

| Endpoint | What it does |
|---|---|
| `GET/POST/DELETE /api/admin/auth` | Session check / sign in with `{ id, key }` (401 when wrong) / sign out |
| `GET /api/admin/data` | All console data; `?cv=<applicant id>` downloads that CV; `?deployed=<file>` returns this deployment's copy of a `data/` list, so the console can tell when a change is live |
| `POST /api/admin/update` | Add, edit, delete or switch jobs, case studies and banners (`type`: `job`, `caseStudy`, `banner`); errors name the field to fix |
| `GET /api/admin/console` | The console app script |

Built-in case studies can be published or unpublished but not edited or deleted from the console, because their cards, logos and PDFs are part of `case-studies.html`. Case studies added from the console appear as extra cards. If one has a PDF, visitors who open its summary can request it: `api/send-whitepaper.js` attaches an uploaded PDF, or emails the link, and files the lead as usual. A linked PDF's address is never sent to the page (the public list only says a PDF exists), so visitors still need the form; prefer uploading, because only PDFs held on this site are also guarded by `middleware.js`. Replacing or removing a PDF leaves the old uploaded file in the repository, so delete it by hand if it must go.

## Events

`/events` lists events that staff create in the management console (**Manage Events**). Visitors register without an account. Free events give an instant ticket; paid events take a UPI payment reference and wait for staff to verify it.

**Storage and architecture.** Everything lives in one document, `events.json`, in the *private* data repository (`GITHUB_DATA_REPO`, see above). The public API reads it live, so publishing, editing or cancelling shows on the website on the next fetch (the CDN caches the listing for 10 seconds): no commit to this repository, no Vercel redeploy, and the console does not show the "deploying" indicator for events. Locally it is `.portal-data/events.json`.

```
{ version: 1,
  settings: { payment: { payeeName, upiId, instructions, qr?: { type, dataBase64, version } } },
  events: [{ id, title, description, status: draft|published|cancelled,
             startsAt, endsAt?, registrationDeadline (UTC ISO), timezone (IANA),
             mode: online|offline, publicLocation, accessDetails (CONFIDENTIAL),
             admission: free|paid, feePaise, capacity, createdAt, updatedAt, publishedAt?, cancelledAt?,
             attendees: [{ ticketId, requestId, name, email, phone, organization,
                           status: confirmed|pending_verification|cancelled, paymentReference,
                           registeredAt, confirmedAt?, confirmedBy?, cancelledAt?, cancelledBy?,
                           mail?: { kind, state: sent|failed|not_configured, at, attempts, error? } }] }] }
```

Why one document: publication state, capacity, duplicate checks and the registration itself share a single SHA-protected commit (`store.updateJson`). Every mutation callback re-reads the latest document, rechecks publication, cancellation, deadline, capacity and duplicates, changes only what it needs and keeps everything else, so a lost race simply re-runs against the winner's data. Callbacks may run several times, so they contain no email and no other side effect; ticket IDs, request IDs and timestamps are created before the callback. Emails are sent only after the commit, awaited, within a deadline (`EVENT_EMAIL_TIMEOUT_MS`, default 6000 ms), and their outcome is recorded on the attendee. Commit messages and logs name ticket or event IDs, never people.

| Endpoint | What it does |
|---|---|
| `GET /api/events` | Public listing (explicit allowlist of fields; no attendees, contacts, payment references, access details or drafts) plus the payment instructions when a paid event is live. `?id=` one event, `?qr=1` the UPI QR image. |
| `POST /api/events` | Register: `{ eventId, requestId, name, email, phone, organization?, paymentReference?, website, formStart }`. Answers 200 only after the registration is saved. 409 for full, closed, cancelled or duplicate; 503 when nothing was saved. |
| `GET /api/admin/data?events=1`, `POST /api/admin/update` with `type: "events"` | Console only (session cookie, same-origin JSON): list with attendees, `&export=<id>` CSV, and `save`, `status`, `delete`, `payment`, `confirm`, `resend`, `release`. The code is `api/admin/_events-admin.js`; it is served through the existing `data` and `update` functions because Vercel's Hobby plan allows at most 12 functions (`npm test` checks the count). |

**Registration rules.** A repeated `requestId` returns the existing registration (never a second seat); the same email on another request gets "already registered". A pending paid registration holds a seat; "Release seat" frees it and keeps the record. Registration closes at the deadline or the start, whichever is first. Capacity cannot be set below active registrations, admission and fee lock once anyone has registered, and an event with registrations can be cancelled but not deleted. Meeting links and access details reach only confirmed attendees, in their ticket email and ticket response. If an email fails the registration stays saved, the visitor and the console are told, retrying the same request re-sends (up to 3 automatic attempts) without taking another seat, and staff can use **Resend ticket** at any time.

**Payment (manual).** No gateway. In the console open **Events → Payment settings** and enter D-TECH's payee name and UPI ID and/or upload a UPI QR image (PNG/JPG/WebP, up to 150 KB, kept in `events.json`, served by `/api/events?qr=1`). Nothing is pre-filled; a paid event cannot be published until the payee name and a UPI ID or QR exist, and the console says what is missing. Attendees enter the UTR from their UPI app; the console shows it with **Confirm payment**, to be checked against the bank statement. Confirming records the time and a console-session marker (`console:<session id prefix>`), then emails the ticket; confirming twice does nothing.

**Manual verification workflow.** (1) Check email (header button) and Payment settings. (2) New Event, fill the form, save as draft, Publish. (3) Open `/events`, register as a visitor. (4) Free: ticket on screen and in the mailbox. Paid: Events → Attendees → compare the UTR with the bank, Confirm payment, check the ticket email. (5) Copy emails / Export CSV (cells beginning `=`, `+`, `-`, `@` are prefixed with `'` so spreadsheets show them as text).

**Limits (read before relying on it).**
- GitHub JSON storage suits modest traffic: a few hundred registrations per event, a handful per minute. It is not a database and gives no transactions across files; the one-document design is what makes the capacity check safe.
- The whole document is read and rewritten on each change and every change is a commit. The Contents API handles files up to 100 MB but the document grows with attendees, so archive old events (delete them from the file) when it passes a few MB. Each event page load costs one GitHub read; the 10-second CDN cache and the lack of polling keep this far below the API quota (5,000 requests/hour per token).
- Simultaneous writers retry 4 times with back-off. Under heavy contention a visitor can get "your registration was not saved, press Register again" (safe: nothing was saved, and the request ID prevents double booking).
- Rate limiting in the public endpoint (30 attempts per IP per 10 minutes (many attendees share an office or venue network), 5 per email per hour, 120 reads per IP per minute) is per function instance, like the other forms; the Vercel Firewall rule described above is the shared limit.
- Local development serialises writes inside one Node process; two processes sharing `.portal-data/` can overwrite each other (GitHub mode has no such gap).
- Cancelling an event does not email attendees; use **Copy emails**.

**Tests.** `npm test` area 14 runs the real handlers against a fake GitHub contents API with SHA conflicts, injected failures and the suite's mock SMTP; nothing touches a live repository or sends mail. Run `npm run verify` for build, link, UI, CSP and syntax checks.

## Security headers

`vercel.json` sets a Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a referrer policy and a permissions policy for every page. If you add a new external script, font, image host or embed, allow its host in the CSP or the browser will block it.

Only the HP page permits inline scripts for its syndication widget. Dell and Motorola use script hashes. Routing middleware runs before static routing and blocks internal files, API source and encoded path aliases (such as `/data%2Fjobs.json`). The middleware source itself is blocked while the file stays in the deployment to enforce these checks and signed PDF links. Development reports and local environment files are also excluded by `.vercelignore`.

The in-memory abuse limiter caps its storage and refuses new keys when full, preserving existing limits. It still needs the shared Firewall rule described above. Private GitHub storage checks repository visibility before reading or writing personal data and refreshes that check after 60 seconds in a warm function; keep the repository private at all times.

Except on the HP page, the CSP's `script-src` has no `'unsafe-inline'`, so an injected `<script>` or `onclick=` does not run. The pages' own inline `<script>` blocks are allowed by their SHA-256 hashes, which `npm run build` writes into `vercel.json` (`tools/csp-hashes.py`). After editing any inline script, run `npm run build` (or `npm run csp`); `npm run verify` fails if the hashes are stale. Inline event handlers (`onclick="…"`) are not allowed at all: give the element a `data-` attribute and attach the listener in a script. The HP page keeps `'unsafe-inline'` for HP's third-party syndication widget.

The built-in case studies and their PDF files are listed in `api/_whitepapers.json`. Keep it in sync when adding a built-in case study; console case studies carry their PDF in `data/case-studies.json`. The function only runs on Vercel (or `vercel dev`), not under `python3 -m http.server`.
