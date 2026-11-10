# Reviewed database overlays

These SQL sources and retaining inverses are used by the local database harness
and controlled release packaging. They are not documentation drafts and are
**not an ordered migration directory**.

Some are individually deployed; others remain gated. Presence here does not prove
deployment. Read current release state and the relevant release record before
changing or executing an overlay. Never bulk-apply this directory or move files
into `migrations/` merely to tidy it: that can replay already-installed changes.

- `../migrations/`: immutable ordered migrations.
- This directory: exact SQL overlays, rollback sources and composition fragments.
- `member_comment_pages_v2.indexes.sql`, `member_comment_pages_v2.sql` and their
  retaining inverse are source-only. The index installs concurrently outside a
  transaction; the RPC installer refuses a missing, invalid or unexpected index.
  Separate root/reply cursors and retained-ID refresh preserve existing installed
  reads and all writes. Results cap at 50 and expose only safe fields; authorization
  filtering can examine more index candidates than the returned count, so hosted
  skew/concurrency and latency still need qualification. The offline harness
  `node scripts/database/member-comment-pages.mts` uses 100K synthetic comments,
  tied/deleted cursors, visibility denials and normal planner choices. It is also
  included in the main database suite. Before release verify live compatibility,
  index build capacity/locks and staging acceptance. Rollback removes only these
  new read helpers/index; comments, command receipts and existing RPCs remain.
- `member_profile_search_v1.sql` and its retaining inverse: source-only member
  discovery expansion. Indexed public display-name token prefixes join literal
  username prefixes; existing identity/block/demo/ban rules, grants and safe fields
  remain. `node scripts/database/member-profile-search.mts` verifies matches,
  permissions, bounds, index eligibility and exact rollback offline. Hosted release
  requires a verified live function/index baseline, capacity/locking review and
  staging qualification; rollback retains profiles and local app history.
- `participation_deadline_v1.sql` and its retaining inverse: staging deployed and
  qualified; production remains gated.
  Activation/recovery updates only normal pending deadlines, preserving signup-day
  grace, paid participation and terminal records. No historical backfill, grants,
  reward rules or alarm changes. `node scripts/database/participation-deadline.mts`
  reproduces the original bug and tests pre/post-activation reads, recovery, close,
  unchanged contracts and rollback in an owned offline database. The hosted rollback
  fixture passed without retained users/events or unrelated contract changes. Before
  any further release, verify its live baseline and review affected occurrences.
  Rollback restores the old function without rewriting evidence or deadlines.
- `staging_mobile_signup_v1.sql`: prepared, disabled staging-only admission for
  a configured Gmail test-alias family. Auth-admin-only execution delegates to the
  existing minimum-age hook; normal confirmation and profile consent remain required.
  Its retaining rollback closes admission without deleting accounts. Installation
  does not configure Auth hooks, SMTP, redirects or public signup. The development
  database harness verifies family/age/role boundaries and rollback offline.
- `mobile_workflow_counts_v1.sql` and its retaining rollback: default-off,
  service-only ingestion/read of fixed device-reported counts. Bounded receipt-hour
  aggregates and salted admission slots; no authoritative member/reward writes.
  Synthetic replay, rate, permission, payload and retaining rollback checks:
  `node scripts/database/mobile-workflow.mts`. No live or mobile enablement implied.
  `employee_mobile_workflows_v1.sql` adds an Operations/MFA-only read;
  `admin_development_mobile_workflows_v1.sql` adds the isolated staging-persona
  equivalent. Their inverses remove only read bridges, retaining counts/admission.
  Both are exercised by the employee-health and development database harnesses.
- `monitor_incident_history_v1.sql` and its retaining rollback: local preparation,
  capture disabled. Service-only, ordered monitor observations and keyset incident
  history; superseding a family is not recovery. Fixed heartbeat projection excludes
  incident details. `employee_monitor_history_v1.sql` adds the independently gated
  Operations/MFA read; its inverse removes only that bridge and retains evidence.
  `admin_development_monitor_history_v1.sql` and its inverse provide the exact
  staging-realm-only, permission-checked developer route, retaining history/audit.
  No producer, independent runner, deletion or alert sending is enabled. Offline
  tests: `node scripts/database/monitor-history.mts` and
  `node scripts/test-employee-health-database.mts` and
  `node scripts/test-admin-development-database.mts`.
- `../tests/` and `../../scripts/database/`: synthetic regression and
  source-only reconstruction checks.
- `admin_development_employees_v2.sql` and its paired rollback: deployed staging-only
  employee-driven impersonation upgrade over the deployed v1 adapter. No automatic
  directory-wide grants; rollback v2 before v1. Not a shared-sign-in migration.
- `employee_shared_staging_v1.sql` and its paired rollback: deployed exact staging
  realm cutover to the shared employee directory and separate application audience.
  Retains old identities/audit; rollback this before directory v2 and development v1.
- `workflow_health_v1.sql` and its retaining rollback: **staging only**, observations
  enabled; scheduler pruning disabled after synthetic validation. Production unchanged.
  Bounded lifecycle/maintenance observations and separately gated scheduler-log retention.
  Success logs: 30 days; failure logs: 90 days; active/unfinished/unknown runs and
  explicit evidence holds survive. No scheduler jobs are created or changed. See
  [monitoring contract](../../docs/REALTIME_ARCHITECTURE.md#monitoring-and-validation).
- `employee_workflow_health_v1.sql` and its paired rollback: deployed in staging, employee-only
  bounded projection of workflow health; requires `workflow_health_v1` and the
  existing independent employee registry. No member grants or data mutation.
  Deploy SQL before enabling portal runtime `workflowHealthEnabled`; disable that
  flag before rollback. Production remains gated.
- `admin_development_health_v1.sql` and its paired rollback: staging-only private
  workflow-health route with existing developer/persona permission checks. No public
  MFA bypass or direct execution grant. Disable `ADMIN_DEVELOPMENT_HEALTH_ENABLED`
  before retaining rollback; restore the captured runtime/config first.
- `admin_development_health_events_v1.sql` and its paired rollback: prepared,
  staging-only health revision route, requiring `employee_health_feed_v1.sql` and
  the shared staging employee realm. No direct execution grants or MFA substitution.
  `ADMIN_DEVELOPMENT_HEALTH_EVENTS_ENABLED` defaults off; disable it before rollback.
  The inverse removes only this route/helper and retains observations and audit.
- `employee_health_snapshot_v1.sql` and its retaining rollback: **local preparation
  only**, default off, requiring workflow health and the employee registry. One
  bounded cached delivery/workflow observation; no jobs, provider calls or events.
  SQL settings pin the project; the collector separately pins environment/URL.
  The employee bridge authorizes MFA/operations access; no direct browser grants.
  Disable public/runtime/collector gates before rollback, which disables capture/
  reads and retains the observation. Never enable alongside the
  prior health-event producer; qualify the complete replacement in staging first.
- `admin_development_health_snapshot_v1.sql` and its paired rollback: prepared
  staging-only cached summary/detail route using the existing developer/persona
  assurance and operations permission. No direct execution grant or MFA substitution.
  Disable `ADMIN_DEVELOPMENT_HEALTH_SNAPSHOT_ENABLED` before removing this route;
  apply its rollback before the snapshot rollback. Keep cache and audit evidence.

Cleanup changes paths only, not SQL definitions, grants, deployment order or
production state. Preserve evidence, leases, receipts and holds during rollback.
