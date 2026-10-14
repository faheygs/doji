# Employee access release — live September 26, 2026

The owner approved the authorization/cutover and the additional shared trigger
dispatch needed for employee moderation rate limits. Both are deployed. The portal
now requires an approved work identity; personal member portal access is denied,
including at AAL2.

## Released identities and artifacts

- Work owner: gfahey@dojipro.com, UUID ae62514b-d022-4845-9933-2d10689b5105,
  active super_admin, confirmed email, one verified TOTP, no member profile.
- Personal account 57f7d45d-d10a-4426-923b-dcdc6f2b1bbc remains unchanged.
  Legacy profile flags/non-portal administrative contracts were not rewritten.
- Guarded migration: 20260926040000_employee_portal_authorization applied and
  recorded. Only that migration shipped, not unrelated local changes.
- Worker: e326d2cf-55d0-4cc5-932b-4a8c10600362, 100% active.
- Pages: 75b17f46-b482-433c-b161-e0ef05cfa7c5, production main.
- Portal bundle: admin-app-20260926employee1.js; employee accounts enabled.
- realtime-token: isolated employee admin-capability patch; member branch unchanged.
- Exact owner bootstrap and employee-only gate activation are audited under
  employee-owner-bootstrap-20260926 and employee-portal-cutover-20260926.

## Resolved release blocker

Employee comment/poll moderation previously entered the member rate-limit ledger,
whose FK requires a member profile. The approved fix uses a private employee ledger
with at most two rows per employee. Only AAL2, active, authorized employees changing
moderation_status through administrative commands can use it. Limits are 30 comment
or 10 poll changes per fixed minute. Replay remains idempotent and transaction rollback
preserves quota. No employee member profile, trigger bypass or caller impersonation
was introduced. The shared dispatcher retains the original member branch and limits.

## Verification

- Fresh schema-only local stack: 311 function fingerprints, existing member/anon
  grants, table grants, RLS and policies checked. Only approved portal functions and
  the specifically approved trigger dispatcher differ. Drift/unsafe grant probes
  fail and roll back.
- Real local Auth 2.197.0: confirmation, login, refresh, recovery, MFA, pending denial,
  owner bootstrap and portal reads. Separate member sessions survive employee logout.
- Employee comment/poll/profile-photo/account moderation, replay, appeals/reversal,
  evidence restrictions, ordinary-admin permissions and last-owner protection pass.
- Rate-limit caps, bounded reset, unchanged member limits and denied direct access pass.
- Portal browser suite: 46 passed. Exact released artifact browser subset: 11 passed.
  Six targeted Jest suites: 48 passed in preflight. Worker typecheck and signed-token
  role/AAL/issuer/audience/expiry/routing artifact checks pass.
- Live bounded read checks pass: owner permissions/queue/audit/realtime, denied employee
  member APIs, personal profile/realtime and denied personal employee directory.
- Final cutover reads confirm gate on, owner active, personal portal denied at AAL2
  and both activation audit records present.
- Live assets/source hashes match isolated candidates. Existing Worker bindings,
  Durable Object namespace IDs and minute cron are preserved. Unauthenticated portal
  session returns 401. Evidence: test-results/employee-access-release/live-verification.json.

The owner confirmed profile/feed/comments and continued phone sign-in after work MFA
before cutover. After cutover, the owner confirmed: "logged into the portal and it
works, doji still has me signed in". Actual work-account portal entry and retained
personal phone sign-in are user-verified. The post-cutover reply did not separately
reconfirm profile/feed/comments; their physical-device check was before cutover.
SQL claim emulation is not a browser MFA test.

## Isolation and cost boundary

No mobile build, new paid service/project, global Auth/session change, member signout,
release-policy change or unrelated Worker/site deployment. Infrastructure remains
shared; this is logical identity/contract isolation, not physical isolation or zero
risk. Existing provider usage still applies. Intentional audited moderation affects
the selected member/content as designed.

## Rollback references

- Worker: d9912867-421b-4b6c-84b4-527639418dfb.
- Pages: 36f9d277-e531-45bc-87fd-e7606bbba3a7.
- Original Worker/settings/realtime snapshots: test-results/employee-access-release/.
- Prior trigger dispatcher: schema-only test-results/employee-sandbox/public-schema.sql.

If needed, coordinate restoring prior Worker/site, disabling the employee-only gate
and restoring the prior dispatcher definition. Preserve additive employee/audit data;
never globally sign out members or destructively reverse the migration. No rollback
was required. Do not rerun the one-time owner bootstrap or old draft migrations.
