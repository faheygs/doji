# Push registration: approved backend release

Status: live, final verification 2026-09-26 23:26 UTC. Project: `tvixsmqxotuvyjqzmjla`.
Owner explicitly approved backend deployment before iOS/Android build preparation.

## Scope and rationale

Only migration `20260926050000_skip_unchanged_push_profile_update.sql` was applied,
using an isolated transaction, not a bulk migration push from the dirty workspace.
The caller's profile update is skipped when its normalized Expo fallback token is
unchanged. Native endpoint freshness, ownership transfer, authentication, input
validation and missing-profile failure remain unchanged.

PostgreSQL counts matched unchanged rows as updates; filtering them out avoids
row-level update triggers. Reference: [PostgreSQL 17 UPDATE](https://www.postgresql.org/docs/17/sql-update.html).
The existing transaction-level advisory lock is retained for token ownership
serialization: [PostgreSQL 17 locking](https://www.postgresql.org/docs/17/explicit-locking.html).
This is a reduction in redundant work, not a measured production latency fix.

## Evidence

Artifacts: `test-results/push-registration-release-20260926/`.

- `before.json`: exact live original function and surrounding contract fingerprints.
- `local-tests.json`: full v3-chain regression with real installed triggers and six
  synthetic members; no production-sized data or external email/push services.
- Forty repeated registrations: **40 profile updates before, 0 after**. Endpoint
  freshness continued advancing. Local wall times: 1048 ms and 1008 ms, including
  process overhead; do not interpret this as a production speedup.
- Android/iOS, v1/v2/v3, rotation, cross-account ownership, invalid/missing identity,
  failed-command rollback, real profile validation, concurrent shared-token lock
  waits and repeated installation uniqueness passed.
- Eight concurrent transactions covering registration, reactions, profile/feed/
  comments/notification reads, employee health reads and relay claims passed in
  1776 ms with zero failures. This is a bounded regression, not a load-capacity test.
- Harness fixes during rehearsal: use current member-authorized v2 feed RPC, await
  all concurrent results before cleanup, and use local Storage deletion allowance.
  No production permission/trigger changes were made to accommodate tests.
- Exact deploy and rollback scripts were rehearsed locally including the ledger.
- `after.json` and `verified.json`: only the intended function definition changed.
  All 321 function grants/owners, other 320 definitions, public/storage RLS policies,
  table grants/RLS flags, public/auth/storage triggers and role settings unchanged.
- Live read-only assertions passed: member profile/feed/comments/notifications/
  realtime, employee session/queue and both identity access-denial boundaries.
  These SQL canaries do not establish physical-device session continuity or push delivery.
- Live checks before/after found no active Doji, overdue outbox rows or client lock
  waits. Next Doji was 2026-09-27 00:26:10 UTC; deployment completed over an hour ahead.

Definition MD5 before: `9643647407ac75f82729df0fe1e1fcb5`.
Definition MD5 after: `1dc8db0962651d38f4920d6968f224a3`.
MD5 is used for catalog drift detection, not a security signature.

## Isolation and rollback

No Worker, Edge Function, portal, Auth configuration, member session, provider
credential, release enforcement or paid plan was deployed/changed. Shared physical
infrastructure still exists; this is scoped deployment isolation, not zero risk.

The deploy script enforces a 15-second statement limit, 2-second lock limit, an
inactive/non-near event window, zero overdue outbox/client lock waits, an exact old
definition guard and unchanged surrounding contracts before commit. The migration
ledger records only version `20260926050000`.

For a regression attributable to this change, run the captured **rollback.sql** in
that artifact directory against the same verified linked project, then recapture
and compare contracts. It requires the exact candidate hash, restores the original
function with its existing permissions, and deletes only this ledger entry. It
does not delete member data, restore a whole database or revoke sessions. A drift
failure must be investigated, not bypassed. No rollback was needed in production.

## Mobile preparation (not a release)

EAS history checked: latest finished production iOS 1.0.8 (97), Android 1.0.8 (18).
Prepared local next versions: **1.0.8 (98)** and **1.0.8 (19)**. Existing local version
source, profiles and release policies remain unchanged. No cloud build queued,
store submission made, or OTA published by this backend release.

125 Jest suites / 921 tests, TypeScript and lint passed again after deployment.
`.easignore` now explicitly limits upload inputs to mobile sources/assets/config and
the production environment guard. Portal/backend/deployment artifacts, snapshots
and local environment files are excluded, following [Expo archive guidance](https://docs.expo.dev/build-reference/easignore/).

Local `eas build:inspect --stage archive` completed for both platforms. Verified
directories are `test-results/mobile-release-20260926/ios-archive-verified` and
`android-archive-verified`: 338 identical files, 2,418,272 bytes each. SHA-256 input
manifest is `archive-manifest.json`; `scripts/verify-mobile-archives.mts` confirms
required sources/assets/guard presence, exact workspace bytes and absence of
non-mobile roots or secret-like filenames. These are source archives, not compiled
IPA/AAB binaries, signing validation, or proof of a successful cloud build. Initial
incomplete inspection directories are not release candidates. Regenerate and
reverify after any mobile source/config changes; never build from an obsolete copy.

The local synthetic database was stopped with its normal backup; its VM was
returned to the original stopped state. No volumes or backups were removed.

Before creating cloud builds, verify existing EAS allocation and Sentry quota/
overage controls; no extra spend is authorized. Before distribution, perform the
physical-device tests in `MEMBER_RELIABILITY_REPAIR_2026-09-26.md`: report handoff and
retry, comments refresh/auth loss, employee/mobile session continuity, native push,
foreground/reconnect, ten-minute participation and completion. Live sanitized
Sentry delivery is still a release gate. The historical performance incident is
not cleared by this optimization.
