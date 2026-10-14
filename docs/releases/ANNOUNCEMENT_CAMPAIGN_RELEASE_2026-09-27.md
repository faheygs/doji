# Announcement campaign release — September 27, 2026

Status: **LIVE**, verified at 20:39 UTC. Owner's “yup lets do it” approved the
separate backend and portal release, not publication or a mobile build.

## Release receipts

- Supabase migration `20260927040000_announcement_campaigns` committed at
  20:38:23 UTC. Exact transactional migration/rollback rehearsal passed at
  20:37:09 UTC, leaving no rehearsal data or schema change.
- Pages `2e4a7cb5-e200-4e45-84a3-11354ee7c7b1`, main production branch:
  https://admin.dojipro.com and https://2e4a7cb5.doji-admin.pages.dev.
- Runtime `admin-app-20260927campaign1.js`. All 19 public asset hashes and security
  headers match the isolated candidate. Four files uploaded, 15 reused.
- Shared Worker unchanged: SHA-256
  `c618cf1a99e3f0660ff84be28d986de44e4ddded89134ae0e12964651b931e1a`.
  Deployments, bindings/settings and schedules compare unchanged before/after.
- **Zero production announcements, zero enabled announcements** after release.
  No draft, campaign reward, suggestion review, moderation action or role change
  was executed as a live test. Browser form selections were discarded with Close.

## Shipped scope

The existing audited draft/preview/publish/cancel workflow now supports No reward
or a configurable integer reward of 1–10,000 Sparks. A valid new idea submission
earns it once per member/campaign; a popup impression or CTA click is not required.
The existing separate 15-Sparks approval reward is unchanged. Shop announcements
support No reward; no purchase-completion rule was invented.

Only Suggest a Doji and Sparks shop are permitted CTA destinations. Informational
announcements may omit a CTA. Enabled half-open date windows cannot overlap;
adjacent future windows are permitted. Saving a draft does not enable it.

Portal forms reuse existing modal, field, picker, contextual-help and Close
controls. Auth/session code, onboarding assets and security headers are preserved.
`campaignsEnabled:true` is explicit only in the reviewed production artifact;
generic builds still default off until deliberately configured.

This approved shared change replaces exactly three existing function bodies:
employee editorial command, member idea submission, and announcement claim. It
adds one ungranted completion helper, a private completion table, two reward
columns, constraints and indexes. Unique completion attribution precedes the
existing Sparks helper in the same submission transaction. Claims append canonical
reward terms and exclude campaigns already completed by that member. Existing
profile/economy invalidations remain responsible for balance reconciliation.

## Verification and isolation

- PostgreSQL 17.6 live baseline matched the last verified release. Announcements
  had 0 rows / 24 KiB; Sparks ledger had 4,012 rows / about 1.15 MiB including
  indexes. No active participation window, overdue outbox rows or lock waits.
  The next future event was well beyond the 25-minute deployment guard.
- DDL used a 2-second lock budget and 8-second statement budget. The exact
  rehearsal checked rollback restores all three prior function definitions.
  No broad migration push or timeout expansion was used.
- **326 unrelated existing functions unchanged.** The three changed RPCs retained
  their signatures, owners and grants. Existing RLS policies, table privileges,
  triggers, indexes, role settings and default privileges were preserved. New
  completion attribution/helper deny member, employee and service-role access.
- Bounded production member profile/realtime/notification/feed/comment queries
  passed, as did employee session/queue and cross-role denial checks. Feed returned
  one authorized row, sampled thread zero comments. These are API checks, not
  physical-device rendering/session proof.
- **94/94 browser tests** passed against the exact isolated release artifact with
  mocked network boundaries (17 editorial cases). Prior local qualification also
  passed 22 focused Jest tests and real PostgreSQL functional, concurrent-award,
  competing-publish, cancellation-race and rollback tests.
- Live browser work session restored after reload. Announcement page showed zero
  records. The shared destination picker exposed only Shop/Suggest; Reward defaults
  to No reward and reveals action/amount controls when Sparks on completion is
  selected. The unsaved form closed correctly. Read-only computer-use verification
  changed no business data.
- Final 20:39 UTC check: overdue outbox 0, lock waits 0, announcements 0.
- No mobile build, Worker/Edge deployment, auth setting, push/alarm schedule, release
  policy, business workflow, paid add-on or new cloud resource. Existing included
  resource usage checks were recorded earlier the same day in the editorial release
  record; this is not a guarantee about future unrelated account charges.
- One expired Cloudflare CLI token caused a read-only 401 before deployment.
  `wrangler whoami` refreshed its existing OAuth login; baseline then matched.
  No scopes, credentials or app sessions were changed by this release.

## Evidence and rollback

All immutable receipts, before/after fingerprints, generated SQL, exact portal
baseline/candidate and live screenshot are in
`test-results/announcement-campaign-release-20260927/`.
`scripts/announcement-campaign-release.mts` provides explicitly separated capture,
prepare, rehearsal, commit and verify modes, with no uncertain-commit retries.

Previous Pages: `f57b2692-26a6-4bf3-99fd-7a9f797b5189`. If needed, restore that
artifact first, drain callers, then use the guarded `rollback.sql` from this release
directory. It disables reward campaigns, prevents their republication via a pause
constraint, and restores previous handlers. Retain completion/ledger history and
earned balances; do not undo member rewards. Retain the migration ledger and new
schema. Recovery requires a reviewed forward migration, not rerunning initial CREATE.
No Worker rollback is needed because its code/settings were not changed.

## Remaining gates

Native popup Not now/back/backdrop, receipt failures, both CTA routes, account
changes and completion feedback still require isolated device qualification before
a real campaign launch. Existing receipt-before-dismiss behavior needs its separate
client follow-up; this backend/portal release does not claim to fix offline dismissal.
The owner's personal app session/profile/feed/comments confirmation was requested
after deployment and is pending. No blanket app-wide health claim is made: existing
Sentry groups and prior daily delivery warnings remain separate work.

Publication requires separate explicit owner approval of actual campaign terms.

## References

- [PostgreSQL 17 ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html):
  lock and constraint behavior informed the bounded rehearsal and release guards.
- `ANNOUNCEMENT_CAMPAIGN_DESIGN_2026-09-27.md`: requirements, race semantics,
  underlying PostgreSQL/WAI references and local qualification.
- `ADMIN_EDITORIAL_RELEASE_2026-09-27.md`: preserved production baseline and
  same-day included-plan usage checks.
