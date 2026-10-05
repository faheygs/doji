# Admin portal consistency pass — September 29, 2026

Scope: admin static assets only. No member app, business/public website, shared
Worker, database, RPC/RLS, realtime, push, authentication settings, release policy,
paid service or moderation/publication changes.

## Repairs

- Reuse admin theme tokens for queue headings, audit metadata, search labels,
  drawer eyebrows, history metadata and related-record labels. Correct priority
  badge foreground contrast in the affected themes.
- Empty history messages use the full available width instead of being squeezed
  into the timeline marker column (caught by reviewing the mobile screenshot).
- Right-align editorial actions and the operator-role action using existing styles.
- Present audit record details using the existing full-height right drawer; retain
  native modal semantics, close/focus behavior and late-response protection.
- Label search and audit dialogs. Case Details/History/Related tabs now expose
  selected state, tab/panel relationships and roving keyboard focus, supporting
  arrows, Home/End and Tab into the panel.
- Audit export has persistent contextual preparing/success/failure feedback and
  manual retry. Existing single-flight, CSV safety and session-epoch guards remain;
  locking clears feedback and prevents a late protected download.

No command payload, server-owned state or read cadence changed. The packaged
business runtime prefix is byte-identical; all previously deployed dependencies,
feature flags and configuration are retained.

## Qualification and references

Exact-candidate browser tests use synthetic, intercepted backend responses; no real
moderation, announcement, operator-role or safety workflow command is submitted.
The added matrix checks 390/900/1440 px in both themes across queues, operations,
access, audit, report details/history/related records, search and audit detail.
Existing tests cover announcement/community forms, dropdowns, confirmation,
validation, errors, stale/revoked sessions and evidence cleanup. Eleven public-site
tests are intentionally excluded by the existing admin-only artifact configuration.

The initial matrix reproduced contrast, dialog-name and tab-semantics failures.
Expanded history/related coverage found additional muted-label contrast failures.
The first full run also timed out awaiting a health refresh under 12 workers;
final qualification reruns the full suite at four workers without retries or
loosening assertions. Final results and release status are recorded below.

Reference guidance: [WAI-ARIA modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[WAI-ARIA tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/),
[WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
and [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
Automated Chromium/axe and keyboard checks are not a full accessibility
certification or Safari/screen-reader/device qualification.

## Release boundary and rollback

Candidate and evidence: `test-results/portal-consistency-20260929/`.
Release helper: `scripts/release-portal-consistency.mts`.
Baseline/rollback admin Pages deployment:
`7026a54c-fa7d-4c5d-b0f1-44b9e5f05e86`.
Only the new admin runtime bundle, admin stylesheet and two admin HTML entrypoints
differ. Deployment requires clean browser results, unchanged candidate hashes and
an unchanged canonical production deployment. Verification checks the four changed
production asset hashes, admin domains and unchanged public-site deployment.
If a regression appears, roll back only doji-admin to the retained baseline;
no database rollback, case reversal or member session action is part of this release.

Qualification: **151 browser tests passed, 11 public-only tests skipped, zero
failures/flaky tests** on the final exact artifact at four workers. **48 unit tests
passed**, including live-client/auth checks, health classification and queue-age
boundaries. Syntax and scoped diff-whitespace checks passed. Desktop dark audit
drawer and mobile light empty-history screenshots were visually inspected after
the final repair. The health-refresh test passed without code/assertion changes in
both four-worker full runs; the earlier 12-worker timeout is retained as a test-run
limitation, not a claimed production health repair.

Status: **LIVE**, admin Pages deployment
`cf9bb575-4727-48dc-9a41-cfa91460fe75` at
`https://cf9bb575.doji-admin.pages.dev`, September 29 around 19:33 UTC.
All four changed asset hashes verified on `https://admin.dojipro.com`; public-site
deployment and admin domains unchanged. The initial immediate asset readback did
not yet match; a subsequent read-only verification passed, without redeployment.
Existing Cloudflare OAuth was refreshed through `wrangler whoami` after expiration;
no access scope, credential configuration or billing was changed.

After the owner's sign-in, a production reload restored the work session and live
updates. Audit log opened successfully; the existing synthetic safety case's
`safety.not_actionable` audit entry (revision 2) opened in the labeled full-height
right drawer with readable dark-theme content and a close control. No workflow
decision, announcement, role change, export or member write was submitted.

Final screenshot evidence (synthetic local fixtures):
`final-suite/consistency-portal-consistency-dark-1440/audit-detail.png` and
`final-suite/consistency-portal-consistency-light-390/report-history.png`, under
the candidate/evidence directory. Tonight's existing Doji monitor is unchanged.
