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
