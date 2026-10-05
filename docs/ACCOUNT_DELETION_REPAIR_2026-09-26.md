# Account-deletion repair — September 26, 2026

## Approved scope and cause

Owner approved the separate deletion backend repair and removal of the verified test
member `375bcfdc-82c0-4c25-be24-365c7b5e880b`. The identity has two decisions and two
appeals, no staff role and no owned Storage objects. New moderation profile FKs used
RESTRICT, preventing Auth's normal profile cascade. Reports by departing reporters
also cascaded into deletion-restricted decisions. This is an integration failure, not
a requirement to have a clean account status.

## Contract and impact

- Auth hard-delete remains the command; no direct SQL Auth deletion, role bypass,
  temporary dropped integrity checks or moderation-history purge.
- Profile-delete trigger preserves UUID attribution in private history, replaces live
  history links with null, and closes only pending appeals as `closed_account_deleted`.
  Existing audit action/reason/metadata and resolved decisions stay intact. Auxiliary
  deleted-identity fields are added to existing rows before their actor FKs null out.
- Member content follows existing cascades; durable Storage cleanup remains unchanged.
- Existing authorized report detail adds `deleted_member_refs`; its authorization and
  evidence-access logging wrapper remains in place. Deleted references store no new
  email, name or credentials. Member grants and RLS are unchanged.
- Indexed deletion lookups avoid unbounded table scans as history grows. DDL is one
  transaction with a 3-second lock timeout and 30-second statement timeout.
- UI uses one DeleteAccountAction on Settings and suspension routes. Immediate dialog,
  adjacent persistent error, progress and single-flight guard replace top-of-page-only
  feedback. Unconfirmed responses never claim the account survived; confirmed deletion
  is not relabeled failed if subsequent local logout cleanup fails.

## Release plan and boundaries

1. Verify target UUID/email/profile/staff state, actual FK/check names and migration
   state. Record member function/policy fingerprints for post-release comparison.
2. Preserve the currently deployed delete-account source; inspect its diff. Apply only
   migration `20260926020000`, record that exact migration, and deploy only the
   delete-account Edge function (sanitized error and request correlation).
3. Delete only the verified UUID through the existing Auth Admin API with a final
   UUID/email guard. Verify identity/profile absence, retained moderation/audit history,
   unchanged unrelated identities and the durable cleanup intent.
4. Handset UI is local until a separately requested app release. No TestFlight build,
   portal assets, Worker, employee identity draft, global Auth settings, member RPC/RLS,
   push, release-policy change, paid service or new infrastructure is included.

## Validation and rollback

The isolated PGlite fixture reproduces the original FK failure and tests clean,
moderated, pending/resolved appeal, reporter and historical-actor deletion; retained
history, protected reads, unchanged member read grants, idempotent repeat and atomic
rollback on downstream error. This is a focused PostgreSQL fixture, not a complete
hosted Auth/device test. Targeted UI/helper tests and TypeScript checks accompany it.

Before commit, any migration error rolls back the whole transaction. If release must
be paused, do not continue target deletion. After deletion, old NOT NULL/RESTRICT FKs
cannot simply be reimposed: preserve retained history and repair forward. The old Edge
source can be redeployed independently; it uses the same deletion command. Deleted
login/content cannot be restored by rolling back code. Never recreate the removed
account automatically, revert other members, or delete retained evidence to roll back.

## Execution evidence

- Applied only migration `20260926020000` and recorded its exact source in
  `supabase_migrations.schema_migrations` in the same transaction. Initial CLI parsing
  attempt rejected the leading SQL comment before executing anything; corrected call
  committed successfully. No other migration/draft was applied.
- Backed up deployed Edge v33 under
  `test-results/account-deletion-20260926/supabase/functions/delete-account/index.ts.backup`.
  Released only `delete-account` v34; ACTIVE, `verify_jwt=true` unchanged. Diff is only
  request-ID correlation and removal of private SQL/provider detail from client errors.
- Final Auth Admin GET matched the exact UUID and email before hard DELETE returned
  HTTP 200. Independent SQL checks: Auth ID/email, Auth identities and profile all zero;
  retained reports=2, decisions=2, appeals=2; appeal outcomes remain `reversed` and
  `upheld`; one `account.deleted` audit entry. No pending appeal existed on this target.
- No remaining owned/UUID-prefixed Storage objects. Existing cleanup intent remains
  queued for the normal durable maintenance path; no manual media purge was needed.
- Other Auth identity-set fingerprint unchanged:
  `41605e2ba273139b64a68a651779b09c`.
- Existing public function-definition fingerprint excluding the intentionally replaced
  report-detail wrapper/new deletion helper unchanged:
  `a1b357add4e429d6d85ecf62332af7ab`.
- Public policy-expression fingerprint unchanged:
  `8c00b09adfdd7174053a2a01fa89130f`.
- PostgreSQL fixture passed. Eight targeted Jest suites passed (73 tests), including
  rendered single-flight/error/confirmed-deletion behavior, auth store/routes and portal
  isolation regression checks. TypeScript no-emit passed. No physical-device test or
  new mobile build occurred; handset feedback/suspension-route changes remain local.
- The email is now unoccupied in existing Auth. This does not enable the still-staged
  employee registration/sign-in cutover or grant any admin role.
