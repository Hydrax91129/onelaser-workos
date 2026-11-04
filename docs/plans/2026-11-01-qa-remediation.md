# WorkOS QA Remediation Implementation Plan

> **For Claude:** Execute the steps below in the existing isolated frontend/API worktrees, preserving the historical QA evidence. This is the implementation already authorized by the user.

**Goal:** Correct the nine reproduced QA defects and deploy verified frontend/API revisions to craftos.app.

**Architecture:** Retain the existing Fastify/PostgreSQL API and modular browser frontend. Keep submitted results immutable after three days, but allow the owner or reviewer to recover an unscored result with an audited, concurrency-safe scoring attempt. Render readiness and unknown metrics honestly. Keep prototypes out of live employee work.

**Tech Stack:** Node 24, TypeScript, Fastify, PostgreSQL/PGlite, vanilla JS/CSS, node:test, linkedom, Render/Caddy.

---

## Design decision

Considered: targeted corrections in the current modules; a larger board/report rewrite; cosmetic messages without backend corrections. Targeted corrections cover the verified defects while keeping existing interfaces and stored evidence. No provider credentials or new employee grants are needed.

## Task 1: Reporting correctness and prototype boundaries

- Add the three failing QA regressions to frontend/test/qa-remediation.test.mjs and verify they fail.
- reports.js: preserve unknown on-time metrics; use only valid acceptance timestamps; show sample coverage when incomplete. Distinguish absent OKRs from unmeasurable progress. Format unknown percentages without a percent sign.
- projects.js: unknown real users do not map to the sample president; sample tasks never enter the live Task hub or personal workbench facts.
- app.ts: return the current valid acceptance timestamp, from the matching submission review, on task lists. Keep response authorization unchanged.
- Test before/after deadline, missing timestamps, missing metrics, both languages and absent actors.

## Task 2: Scoring recovery and readiness

- completions.ts: add backward-compatible attempt metadata columns. Recover pending/failed/unavailable scores even after result locking; only owner/reviewer may retry. Never replace a successful score. Use a database claim/attempt ID to suppress duplicate and stale outputs; audit attempts without submitted text.
- app.ts: construct the model once; derive both AI capability flags from that exact instance. Invalid or partial provider configuration is unavailable.
- task-board.js: show unavailable/failed/pending/scored separately. Add a read-only result and score block in task discussions and an explicitly authorized retry button. Retain result locking.
- Test no configuration, restored model, late retries, viewer denial, successful-score immutability, duplicate claims and stale attempt output.

## Task 3: Profile validation and responsive board

- org.ts: validate IANA time zones using Intl while accepting the unset value.
- task-flat.css: reserve readable task titles, allow horizontal scrolling within narrow tables, keep the overall page within the viewport.
- Browser verify at 390px, tablet and desktop, after sidebar transitions settle; check English/light and Chinese/dark.

## Task 4: Release and live acceptance

- Run complete frontend/API suites, typecheck/build, parser/sync/Wiki checks; retain logs on DevSSD.
- Commit/push frontend; pin its exact SHA in API deploy/frontend-revision.txt. Wait for GitHub checks on both exact heads.
- Deploy the exact API revision to the existing Render service. Do not create resources, change permissions or enable missing providers.
- Verify Render Live, public build info and asset bytes, health, authorization failures, signed-in pages and public Wiki. Preserve original employee records.
- Publish an acceptance note mapping all nine defects to passing checks. Remaining real-provider, organization and prototype setup stays explicit.
