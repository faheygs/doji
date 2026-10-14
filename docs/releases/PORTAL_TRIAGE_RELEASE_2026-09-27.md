# Portal triage release — September 27, 2026

Status: **implemented triage safety and case-context batch is LIVE**, not a claim
that every admin/business/legal workflow is complete or legally certified.
Owner requested production release and confirmed afterward: "Signed in; profile,
feed, and comments work". No real enforcement/triage decision was executed by the
agent. The browser inspection used the computer-use skill for read-only allowance
checks and authenticated case verification; no billing settings changed.

## Exact deployed boundary

- Database: `20260927020000_employee_case_evidence`, committed September 27 ~15:55–15:57 UTC.
  Three additive employee-only functions: report-case v3, appeal-case v1, exact
  avatar authorization helper. One partial moderation-decision index, one new
  employee SELECT policy and the existing employee restrictive Storage boundary's
  avatar branch. Existing member/PUBLIC policies and bucket publicity unchanged.
- Shared Worker: version `487ec955-41ed-44d2-a4a1-4e6d0f3f4c7f`, 100% active.
  SHA-256 `bdb7cb6dbbfdf6e82555d7e2fe0bdbad43493cfb5da398c1b7b5a242623aaf43`.
  Only report-case-v3 and appeal-case routes plus employee-mode guard were added
  to captured live code. Removing those additions yields the original source
  byte-for-byte. Existing bindings, secret names, DO namespace IDs, compatibility,
  observability, usage model and minute cron verified identical. No secret rotation.
- Admin Pages: `17daf056-7d5c-45c9-9512-34cfb2cbcc44`, production `main`.
  Bundle `admin-app-20260927triage1.js`. Four new/changed asset uploads plus headers;
  other 13 uploaded assets already existed. All 17 served asset hashes verified.
  Only bundled portal runtime/client, admin CSS/entry references and admin CSP
  changed. Onboarding/config, shared styles, images and theme assets preserved.
- Video CSP fix discovered during release review: admin-only `media-src 'self'
  https://tvixsmqxotuvyjqzmjla.supabase.co. All other security headers preserved.
  Source build and test server now exercise this policy; public/business site
  headers are not changed by the admin build.

No mobile build/update, member session revocation, auth configuration, existing
member RPC/trigger change, realtime producer, push, alarm, retention, release-policy,
paid resource or plan upgrade. Infrastructure remains shared, not zero-risk.

## Verification and qualifications

- Exact isolated static artifact: **69 browser tests passed** with its production
  CSP enforced, using mocked backend responses. Desktop/mobile and both themes,
  inline failure/retry/late-response/revocation, complete case contracts and media
  states included. Prior offline real-role SQL apply/rollback suite remains passed.
- Four gateway/isolation Jest suites: **22 tests passed**. Auth/signing client
  suite and exact compiled Worker artifact JWT/MFA/role/input/old-route tests passed.
- Production transaction rehearsed and fully rolled back before commit. First
  rehearsal stopped because the old canary required a particular member's expired
  post; nothing committed. A bounded current-event canary then returned one comment
  row and one feed RPC row (the latter is not a count of visible feed posts).
- Final rehearsal and commit checked existing report/appeal contract shapes,
  rolling back their probe audit entries. All **321 preexisting public function
  definitions/grants**, member policies, table RLS/grants, triggers, role settings
  and existing indexes preserved. Only specified staff policy/index additions differ.
- Post-commit member profile, feed, comments, notifications, realtime and reciprocal
  employee/member access-denial checks passed. No active Doji, lock waits or overdue
  outbox work before/after. Owner independently confirmed phone behavior afterward.
- Live public asset/security-header hashes match candidate; exact Worker source and
  settings/schedules verified. Unauthenticated session/new-case routes return 401.
- Actual owner MFA sign-in works. Live updates connected. Existing Case C44F84C3
  opened successfully with category/concern/people/context, truthful missing-content
  state, overdue target (~43 hours), and scoped controls. Nothing was decided.

The existing report's post is gone. The new viewer cannot restore missing evidence
and does not label current content as historical evidence. Signed media playback
could not be exercised with that missing-content case; real retained photo/video
and avatar cases still need owner acceptance. Local/browser fixtures are not
proof of hosted video codecs/playback or representative-scale performance.
Public avatar URLs remain public; saved references are not immutable snapshots.
Copied signed URLs can remain valid until their five-minute expiry.

## Existing-capacity / no-new-spend check

Read-only dashboards at release time showed:

- Cloudflare Workers Paid already active; observed/projected usage cost $0.00,
  all current usage within included allowances. Workers requests ~30.51k/10M,
  CPU ~43.92k/30M ms; DO compute ~40.83k/400k GB-seconds. No budget/plan settings changed.
- Supabase Pro already active; UI says overages currently restricted, not billed.
  Egress 0.69/250 GB, cached 0.21/250 GB, object storage 0.09/100 GB, function
  invocations 23,228/2M, MAU 65/100k. No image transformations added by this viewer.
- Database ~322 MB; moderation decisions: two total, zero avatar decisions,
  table/index total 96 KiB before release. Existing disk 35%, CPU 4%, connections
  15/60 in dashboard. New index uses existing capacity, not provisioned capacity.
- Static Pages deployment to existing project; no hosted build or new runtime.

This does not guarantee zero future charges from unrelated usage or growth. No
new subscription, paid feature, resource, quota increase or billing mutation was used.

## Remaining readiness work

Current reports/appeals can use the existing atomic audited moderation commands
with stronger frontend safety and case context. The following are **not connected**:

1. External legal/takedown request intake, protected correspondence, preservation,
   ownership and closure. Restricted in-app reports are not external legal intake.
2. Business verification and sponsored-Doji submit/review/revise/pause/takedown.
3. Community decisions and announcement publishing/scheduling/cancellation.
4. Staff alert delivery receipts/retry/escalation and approved severity response policy.
5. Full per-Doji feature health/correlation and representative load qualification.

Immutable evidence preservation is also a separate retention/privacy/member-impact
design decision. Do not silently change member deletion/cleanup to retain content.
These require separately scoped contracts and release approval under AGENTS.md;
do not turn sample/localStorage flows into production controls. See the workflow
audit and triage repair register for the full inventory.

## Rollback and artifacts

Artifacts: `test-results/portal-triage-release-20260927/` holds captured source,
fingerprints, isolated site, candidate hashes, guarded deploy/rollback/rehearsal
SQL, provider receipts and verification. Do not use this directory as test output.
Source helpers: `capture-portal-triage-release.mjs`, `prepare-portal-triage-release.mts`,
`test-portal-triage-artifact.mts`, `release-portal-triage-worker.mts`,
`verify-portal-triage-database.mts`, `verify-portal-triage-live.mjs`.

If rollback is necessary, restore Pages `650e5d01-5789-40ca-b1c3-b04973de5c72`,
then Worker `4855a3d3-782f-4c33-a7a8-482ff5605aad`. Drain/reload new callers before
removing additive RPCs. Inspect current fingerprints, then apply `rollback.sql`
with its expected-function guards, 1-second lock and 8-second statement timeouts.
It removes only the new readers/helper/index/policy and restores the employee-only
boundary; never CASCADE, reverse real decisions, purge audit records or sign out
members. Full SQL round-trip restored the pre-release schema in rehearsal.

Release references: [Cloudflare module upload and retained bindings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/),
[PostgreSQL CREATE INDEX locking](https://www.postgresql.org/docs/17/sql-createindex.html),
[Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/).
