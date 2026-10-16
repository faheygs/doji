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

Cleanup changes paths only, not SQL definitions, grants, deployment order or
production state. Preserve evidence, leases, receipts and holds during rollback.
