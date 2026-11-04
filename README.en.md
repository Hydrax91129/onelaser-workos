# OneLaser · Work OS

[简体中文](README.md) · [English](README.en.md)

GitHub Pages defaults to a browser demo for a pilot with 1–2 departments and 10–30 people. Its employees, tasks, business metrics and reviews are fictional, with a demo clock fixed at October 27, 2026. The repository also includes an independent company mode using the same-origin backend for authentication, authorization and business persistence.

[GitHub repository](https://github.com/Hydrax91129/onelaser-workos)

## Languages and themes

Use the **中 / EN** language buttons and **sun / moon** theme icons in the gateway or workspace header. Your choices are saved in the current browser. On the first visit, the theme follows the operating system preference.

The interface, validation messages, sample tasks, objectives, review explanations, integrations and notification previews are available in both languages. Language changes keep the same business records and current view. User-entered tasks, evidence and review comments remain unchanged; they are not automatically translated. Preset display text and export metadata follow the selected language; the browser still keeps a single set of business records.

The brand area uses the original English OneLaser SVG wordmark and the fixed English subtitle `Work OS`. Light and dark themes use the original black and white variants at their full aspect ratio. Dark styling covers tables, boards, forms, drawers, dialogs, reminders and empty states without applying a global image inversion.

## Hover help for new users

`dist/help-tips.js` adds bilingual hover hints (purpose + how to use) to the main controls. A **?** icon beside each page title explains the whole page, and the **?** button in the top bar turns button hints on or off (saved in this browser). The layer is read-only: no requests, no business data changes. To add or edit a hint, add an entry keyed on `data-*` attributes in `RULES` / `PAGES`, then run `npm test`.

## Server-backed company mode

The same frontend has two explicitly separate modes. GitHub Pages defaults to `demo` and fictional samples. Company deployments use `live`, reading and saving business records through the same-origin API. Live mode has no identity switcher, never imports demo browser storage, and does not fall back to fictional data when the service is unavailable.

The production server must return this public configuration at `/runtime-config.js` with `Cache-Control: no-store`:

```js
window.WORKOS_CONFIG = Object.freeze({ mode: 'live', apiBase: '/api' });
```

This file contains no credentials. The API must share the page origin. Serve static files at the site root and proxy `/api/*` to the corresponding backend route after removing the `/api` prefix. Keep the repository's default runtime config in demo mode for public GitHub Pages.

Live mode checks `/capabilities` and `/me`; an unauthenticated visitor sees only DingTalk sign-in. The browser navigates to `/api/auth/dingtalk/start`, and the backend handles OAuth and a Secure, HttpOnly, SameSite session cookie. The browser does not read or store session tokens. Writes first obtain `/api/auth/csrf` and include `X-CSRF-Token`. A 401 clears private in-memory records; a 409 requires reloading the current version before human confirmation.

The live interface supports task creation and filtering, objective and KR creation, verified measurements, versioned submissions, designated human review, current-version Grok assessment, reminder previews and explicit manager sending. AI findings show evidence references, missing material and uncertainties. DingTalk queue acceptance is described as submitted to the sending queue, never as delivered. Actual availability depends on server configuration and real responses.

`capabilities.aiReviewMode` selects the synchronous `api` or asynchronous `bot` path. Bot dispatch, pending pickup, processing, completion, failure, uncertain dispatch, expiry and replacement are distinct states. Dispatch acceptance never means assessment completion. Only findings for the current submission appear as its assessment; older jobs are labelled separately. Status reads back off at 2 / 4 / 8 / 15 seconds and stop after about two minutes with manual refresh available. Closing details, switching tasks or losing the session cancels reads. Failed, expired or uncertain jobs require explicit retry, never an automatic write replay. An uncertain dispatch additionally requires acknowledging that the original run may continue and a retry may consume Bot allowance again. Existing Bot allowance, model API billing and availability depend on the respective accounts; no free or unlimited usage is promised. Managers still inspect and accept actual deliverables.

`dist/preferences.js` restores language and theme before styles load, without requiring CSP `unsafe-inline` for scripts. `dist/api-client.js` handles cookies, CSRF, language and structured errors; `dist/live-app.js` renders the company workspace. Run the client and mode-isolation tests with:

```sh
node --test test/*.test.mjs
```

These tests include mocked HTTP responses; they do not establish that real DingTalk authentication, model assessment or notification delivery has passed production acceptance.

## Run locally

No package installation or build is required:

```sh
git clone https://github.com/Yonge6/onelaser-workos.git
cd onelaser-workos
python3 -m http.server 8867 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8867`.

## Interactive flows

1. Choose Tasks or OKRs at the gateway. Switch demo identity to explore individual and department scopes.
2. Browse task lists and boards, search and filter, create tasks and link key results.
3. Submit an evidence title, outcome summary, optional HTTPS URL and self-reported acceptance-criteria coverage.
4. Run a local demo evidence check. It identifies missing fields and unverified evidence. It does not call a model or assess actual deliverable quality.
5. A manager inspects the actual evidence, enters a human quality score from 0–100 with reasons, and accepts the deliverable or requests more evidence.
6. A new submission version invalidates earlier checks and acceptance decisions while retaining event history.
7. View OKR progress from baseline, current and target business values, separately from task speed or quality scores.
8. Inspect human-reviewed performance metrics and sample sizes. Missing samples show “—”. Sample and coverage thresholds require calibration by role; this prototype does not compute an individual composite score.
9. Read integration guides for DingTalk sign-in, directory, notifications and an independent AI model API. Reminder previews are local drafts and are never sent.
10. Export demo records for the current visible scope or confirm a reset to the fictional samples.

## Demo implementation and limitations

- `dist/index.html`, `styles.css`, `i18n.js` and `app.js` are dependency-free static files with responsive layouts and keyboard controls.
- `i18n.js` contains source-key dictionaries, dynamic message templates and fixed sample translations. UI localization does not change organization keys, task IDs, form values or permission logic. Escaped user content is protected from UI translation.
- Business records are stored in browser `localStorage` under `onelaser-workos-demo-v4`. Demo records are shared by pages using the same browser origin.
- Identity switching **is not authentication or a security boundary**. Production must implement server-side sign-in, organization membership, role authorization and object-level data access.
- The simulated scope shows employees only their own tasks and managers only their department’s tasks. Company objectives are public demo objectives. Individual objectives follow the visible scope. Managers cannot approve their own tasks; production must assign a supervisor or another authorized reviewer.
- User content is HTML-escaped. Evidence URLs must use HTTPS and cannot include embedded usernames or passwords. The prototype does not read linked content or upload files.
- Demo mode has no database, real authentication, multiuser synchronization, file storage, model call, message delivery, scheduler or enterprise connection. Company mode calls the configured same-origin backend and never uses demo records.
- The existing Grok Bot’s automation capability is unverified. Bot access and a model API are separate integrations. Neither is connected. Configuration variable names are documentation only; the browser never collects secrets.
- The prototype does not process real salaries, make employee retention decisions or automatically change compensation. Performance metrics need human review in the context of role, work calendar, dependencies and approved changes.
- The demo check only examines the title, text length and self-reported coverage. Complete fields do not establish actual quality or authenticity.

## Demo metric definitions

- **KR progress:** `(current − baseline) / (target − baseline)`, displayed within 0–100%. This prototype contains increasing metrics only.
- **Quality Q:** average human quality score for accepted tasks at their current submission version.
- **On-time T:** percentage of accepted tasks submitted by 18:00 on the effective due date. Submission and event times use the same fixed demo clock; export metadata records the actual export time.
- **Plan alignment P:** percentage of accepted tasks the reviewer confirms as matching the agreed scope.
- **Response R:** percentage of accepted tasks with valid working-time response data that meet a four-hour agreement. The prototype does not observe real employee behavior.
- **Proposed weights:** Q 50% / T 20% / P 20% / R 10%, pending agreement. This prototype does not calculate individual composite execution scores or rank people across roles.

Production development should implement the server-side policies in `spec/` and the implementation plan, followed by real authentication, authorization, evidence access, auditing, strict model-output validation and pilot acceptance testing.

## Demo site (retired)

The public GitHub Pages demo was retired on 2026-11-04 ahead of making the repository private. Demo mode still runs locally (see Local run); the production system is craftos.app, built and released from the backend repository.

The HTML uses matching version query parameters for scripts and styles. Update them together when changing localization, code or styling so cached files from different releases are not mixed.

## Backend API

The [backend API source](https://github.com/Yonge6/onelaser-workos-api) is maintained separately. GitHub Pages defaults to browser-local demo data. Company mode calls that backend through same-origin `/api`. Real DingTalk, model and notification availability depends on server configuration and production acceptance.

## Knowledge center / Wiki

Knowledge center / Wiki embeds the complete existing [OneLaser knowledge center](https://yonge6.github.io/onelaser-support-center/), retaining its homepage, product families, full-text search, downloads, article navigation, images, sources and bilingual interface, with an original-site link. The source site and its publishing flow remain unchanged. Archive & review retains authenticated source snapshots and human review records. Shell theme and mobile navigation changes preserve the current Wiki page.

Company deployments bundle a pinned, complete public version at `/wiki/`, retaining the original-site link. This avoids reliance on third-party frame navigation while preserving the original files and articles. Updates require a new reviewed pin; private support records are never bundled.
