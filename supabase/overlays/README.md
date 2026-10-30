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

Cleanup changes paths only, not SQL definitions, grants, deployment order or
production state. Preserve evidence, leases, receipts and holds during rollback.
