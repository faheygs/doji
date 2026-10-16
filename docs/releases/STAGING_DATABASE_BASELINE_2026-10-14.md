# Staging database baseline — October 14, 2026

Owner-authorized staging-only provisioning. Hosted verification completed
**2026-10-15 00:59:38 UTC**. Project `ohrcupagdoilkwhecict`, Free organization
`fjpnwsnnrbjsdvilesmn` (`doji-staging`), Canada Central, Nano. No paid add-on,
production application/schema change, customer-data copy, email send or app deployment.

## Installed scope

- 147 application tables with RLS; 487 functions; exact function/table grants and
  RLS policy definitions compared with the read-only production schema capture.
- Empty `avatars`, `post-media` and `moderation-evidence` buckets with matching
  visibility, MIME/size limits and 19 Storage policies. No media copied.
- Source-derived reference data: 9 badge categories, 26 tiers, 31 badges, 16 shop
  items and two disabled mobile release-policy rows. Two `@test.invalid` demo
  members without passwords and two inactive synthetic challenges; no events.
- Disabled default settings and nine source-defined staff-attribution references.
  No production contacts, realm mappings, sessions, passwords, tokens or Vault data.
- All custom SQL roles NOLOGIN; portal/email/scheduling gates closed. Supabase
  public signup and email provider disabled; no deployed Edge Functions.
- New public objects require explicit grants; automatic RLS remains enabled.
  The business email wake function's hard-coded production project was replaced
  with the staging ref, and its sender remains disabled.

## Baseline and tests

Source checkout: reviewed main `0dd2b1a`. Production's ledger had 289 entries;
source had 290. `20261005020000_poll_reserved_other.sql` was absent from the ledger
but its three transformation markers were present in the deployed function.
Staging records all 290 versions as baseline history; production's ledger was
not repaired. Separately deployed overlays were captured through schema-only
export, not blindly reapplied. Future changes still require explicit diff review.

The full migration-only offline suite passed: 290 migrations, 274 pgTAP checks,
extended permission/isolation suites and concurrency checks. A separate offline
restore of the exact staging package verified all 487 definitions and application
grants, 47 moderation and 94 admin assertions, and report replay/quarantine/visibility.
The realtime suite passed 132/133: its migration-only anonymous-function assertion
differs from live by exactly `claim_active_app_announcement`,
`record_app_announcement_action` and `moderation_media_is_frozen_v1`. Those existing
live grants were explicitly verified and preserved, not reported as a passing
unmodified suite or silently tightened in production.

Hosted checks verified matching definitions/grants/policies/buckets, zero external
jobs/requests/secrets/real users/events, and a rollback-only authenticated safe-field
profile read. Production schema metadata before/after was unchanged. Staging is
Postgres 17.11 / pg_net 0.20.4 versus production 17.6 / pg_net 0.20.0; no claim of
identical managed platform versions or connected end-to-end acceptance.

## Recovery and remaining scope

Exact bootstrap SHA-256:
`242425c70c18aec6741428805f9e4909bbe3eaae48afb7fadb2401c9bfb4436f`.
Schema capture SHA-256:
`4da0dca2879467859cee5256a2a573b542d8dd4eea66bd3ad0a2876cb133e516`.
The owner-local recovery bundle is outside Git at
`%LOCALAPPDATA%/Doji/staging-baselines/2026-10-14`: exact SQL, manifest and two
verification records. It is a recovery artifact, not a generic deployment script.
The bootstrap is transactional and rejects a populated target. Do not rerun it
against this database or delete its contents as rollback; preserve later developer
work and prepare a separately reviewed forward repair or new isolated restore.

## Employee staging connection — October 15 UTC

The separately authorized follow-on deployed `employee-portal-v2` only to staging
and Pages `doji-admin-staging`, deployment
`b2225370-b47b-45b2-8f53-a4d39ab5c493`. The same admin source accepts only the two
explicit portal origins and displays a persistent Staging marker. Pages binds
`admin-staging.dojipro.com` to the staging Edge endpoint; preview authentication is
disabled. HTTPS now serves the exact package and shows the staging label; named-account
acceptance remains pending. Hosted same-origin anonymous session reads return 401,
cross-production-origin reads 403, and the setup callback strips query data with 303.

The existing WorkOS employee staging environment/client is separate from production.
The new database login is NOINHERIT with a two-connection limit, verified TLS,
three-second statements and exactly the application/session role memberships.
It has zero direct application-table privileges. Realm/session/RPC settings are
enabled; member Auth, mail, jobs, realtime, monitoring and business gates remain off.
No staff account was granted access or invited in this step.

Validation: transactional setup rehearsal rolled back cleanly; restricted hosted
login and grants verified. Direct Edge requests returned 403, approved-origin
anonymous session reads 401, and production-origin requests 403. The 167 boundary
tests, 286 web tests, two exact-package browser tests, bundle budgets, root full
typecheck/lint/size/hygiene and web typecheck/lint passed. The first sandboxed web
run could not read its temporary module cache; the unsandboxed two-worker rerun
passed. Production Pages deployment/configuration fingerprints were unchanged.

Runtime configuration, exact setup/retaining rollback SQL and package manifests
are owner-restricted outside Git at `%LOCALAPPDATA%/Doji/staging-admin`. To disable
this connection, disable only the staging Pages/Edge gates and staging SQL login/
session/realm gates; retain all data and identity mappings. Do not replay bootstrap
or alter production. Cloudflare uses its existing included Workers Paid capacity;
Supabase remains Free/Nano; no new paid subscription/add-on was enabled.

Named staging accounts, password/MFA acceptance, scoped developer secret sharing,
connected local development and business/mobile/realtime setup remain outstanding.

The exact WorkOS staging callback `/identity/setup-complete` is now configured.
Password authentication is enabled and MFA required. The owner explicitly deferred
onboarding emails: no invitations or account-creation calls were made for the two
approved work addresses. After permission to send, verify invitation acceptance,
the exact email/provider subject and MFA before binding/activating staging staff
permissions. Do not pre-mark email verified or copy production principal IDs.
To reverse the callback change, remove only this URI from the employee staging
application; production WorkOS configuration was not changed.

The staging-only MFA label follow-on sets the owned enrollment issuer to
`Doji Staging` only for the exact staging origin/client pair. The same display
name is saved in WorkOS staging branding (previously unset). The 36 provider and
32 proxy/runtime tests, portal/tooling typechecks and targeted lint passed;
hosted anonymous/wrong-origin/direct-ingress checks remained 401/403/403.
Only the provider module changed in the deployed Edge package. The original
package remains at `staging-admin/employee-portal-v2` for rollback, with the current
package retained as `employee-portal-v2-mfa-labelled`. Reverting the branding means
clearing only staging's display name. Actual hosted enrollment/device-label
acceptance remains pending with onboarding; no invitation or factor was created.

## Local developer gateway — October 15 UTC

Owner-approved `admin-development` is enabled only in `ohrcupagdoilkwhecict`
(function `7381e2f3-8876-4584-8ebd-812f6564d9dc`, version 2). Its separately
restricted SQL login has NOINHERIT, a two-connection limit, verified TLS, bounded
timeouts, zero direct application-table privileges and parameter/error-parameter
logging disabled. The existing employee Edge function and hosted Pages package
were not redeployed. No production project was changed.

The adapter pins 40 assurance checks against all 490 captured function definitions;
unchanged functions, owners and grants match exactly. It accepts distinct local
development proof only inside its private transaction context. Normal hosted MFA
requirements remain intact. Two independent synthetic personas, **Staging Super
Admin** and **Staging Moderator**, have no member Auth/profile identities. One
owner credential is installed outside Git with OS-account-only access; it expires
January 13, 2027. No additional developer credential or invitation was issued.

Verification at **2026-10-15 22:08 UTC**: exact-schema offline authorization,
atomic writes/replay, revocation and retaining rollback passed. That rehearsal
uses explicit grants for temporary assertion helpers because staging has stricter
default privileges than the migration-only fixture. The hosted rollback-only
installation rehearsal passed before activation. Live checks passed 13 gateway
cases and the local frontend/proxy-to-staging HTTP chain, including persona
selection/session/switching, admin-only denials and one disabled synthetic draft
with identical replay. Developer/persona audit attribution was verified; revoking
the owner's token returned 401, then the same credential was restored. Hosted
anonymous/cross-production-origin session reads remain 401/403. No new members,
events, cron jobs, outbound requests, emails or enabled announcements were created.
Chrome blocked automated local navigation with `ERR_BLOCKED_BY_CLIENT`;
owner-browser visual acceptance remains pending, not claimed as passed.

Free capacity before activation: 13/500,000 Edge invocations, 39/500 MB database
and 6/60 dashboard database connections. No paid resource or plan change.
Exact SQL, definitions, private server config, deployed bundle and verification
records are owner-restricted at
`%LOCALAPPDATA%/Doji/staging-admin-development/2026-10-15`.
Rollback: set only staging `ADMIN_DEVELOPMENT_ENABLED=false`, disable the private
development login, then run the retained `admin_development_v1.rollback.sql`
equivalent. It disables SQL access before restoring hash-checked definitions and
retains test data, identity mappings and audit. Do not reset staging or run this
adapter in production. Bitwarden handoff, additional developers, hosted-account
onboarding and media/realtime/monitoring integrations remain separate work.

## Shared employee application preparation — October 16 UTC

Owner approval created `Doji Admin Staging`, application
`app_01M51GRQJWFWT205ARJXQXTM8R`, client `client_01M51GRQJVKXFZ98RG21MK7J64`,
inside existing employee environment `environment_01M3VE4WMDRZ1VBVS5MNVVF19J`.
Dashboard verification shows only
`https://admin-staging.dojipro.com/identity/setup-complete` as its redirect,
eight-hour maximum sessions, thirty-minute inactivity expiry, five-minute access
tokens and no CORS origins. No API key, account, factor, invitation or staging
permission was created. The environment already requires MFA and disables signup
and dashboard impersonation; those settings were not changed.

Billing is Pay as you go; the employee directory contains the two existing work
accounts. [Published AuthKit pricing](https://workos.com/pricing) includes the first
million users and MFA. No paid product or subscription was enabled.

Connection stopped before credentials or runtime/SQL changes: the shared JWT
template is exactly `{"aud":"client_01M3VE4WTBYS2XN6NZPH9EDMQD"}`. WorkOS has
[one template per environment](https://workos.com/docs/authkit/jwt-templates),
not per application. A separately approved application-derived audience is needed
so staging tokens do not inherit the production audience. Preserve this exact
template for rollback; verify unchanged production output before saving any
replacement. No production application setting or deployed package was changed.
The new application remains unconnected with no active API keys; leave it unused
to abandon this preparation, rather than deleting identities or resetting staging.

The owner then approved the shared-template correction. The saved template is
`{"aud": {{ application.client_id }}}`; the dashboard validated it, previewed
the unchanged production audience/issuer and retained it after reload. This changes
future employee access-token audience rendering, not passwords, MFA, member Auth,
business identity or deployed application code. The original literal template above
is the exact rollback value; disable shared-staging authentication before restoring
it so staging cannot issue tokens with the old production audience.

Prepared verifier code accepts the shared issuer only with the exact staging
client/audience tuple; the deployed production/business defaults stay unchanged.
133 synthetic verifier/provider/session/runtime tests passed, including wrong
client, issuer and audience, refresh context, MFA and member/business denials.
Portal/tooling typechecks and source-size checks passed. No hosted login or staging
runtime/SQL cutover was performed. API-key creation was blocked by safety review
because the proposed runtime credential was non-expiring and not explicitly
approved; no key was created at that point.

The owner subsequently explicitly approved the non-expiring credential. WorkOS
created `Doji Admin Staging runtime` on October 16 at 7:44 AM MDT. Its generated
candidate configuration is retained as `staging-admin/runtime-shared-employee.json`
outside Git with owner/SYSTEM-only filesystem access; the original runtime remains
unchanged. Read-only requests verified the exact existing provider subjects and
verified work addresses for Gavin and Kedd. No accounts, passwords, factors,
sessions or onboarding emails were changed. The one-use temporary transfer file
and directory were removed after secure placement. The isolated local
browser/PostgreSQL impersonation test also passed again, and the owner's local
server was restarted successfully. Hosted secrets, database mappings and runtime
cutover remain pending; these checks do not establish hosted shared-login acceptance.
The new key can be independently revoked from this application's API-key list;
it has no automatic expiry, so rotation requires an explicit replacement and
verified runtime update. No new paid resource or production deployment occurred.

### Shared employee cutover — October 16

Owner-approved staging deployment installed `admin_development_employees_v2` and
`employee_shared_staging_v1` with separate staging principals for the verified
Gavin/Kedd subjects above. Both have staging Super Admin roles. Previous synthetic
employees/identities are disabled/revoked, not deleted. Only the owner's existing
developer credential received directory access. The immutable-realm trigger is
enabled; only the two reviewed development adapter definitions changed, with
existing ownership/grants intact. Member/profile/event/job counts are unchanged.

The exact Edge package passed 133 tests before rollout. Hosted acceptance then
exposed a controller issuer check still tied to the application client rather
than the shared directory issuer. A regression reproduced the rejection after
MFA; the correction passed all 167 identity/controller tests against the exact
package, including session verification, refresh, logout and wrong-issuer/audience
denials. The corrected staging employee Edge is v7; `admin-development` is v3
after the secret refresh, with its code hash unchanged. Production function and
secret fingerprints remain unchanged. No Pages, member, business or Worker release.

Live local HTTP acceptance listed Gavin/Kedd, selected and switched both, denied
the retired persona, and verified hosted anonymous 401/cross-origin 403. Actual
hosted password/MFA acceptance remains pending after the correction. No new
invitations, emails, authenticator factors or paid resources were created.
Read-only inspection confirmed the existing attention-panel failure is due to both
staff-workflow flags (`enabled`, `extended_enabled`) remaining false in staging;
this identity release did not enable those application workflows.

Protected recovery/receipts are at
`%LOCALAPPDATA%/Doji/staging-admin/shared-employee-20261016`: prior runtime,
exact candidate/correction manifests, SQL, test results and pre/post fingerprints.
The immediate controller inverse is the preserved pre-correction candidate.
Full identity rollback first disables staging gates, restores prior runtime/config,
then applies the shared-identity retaining inverse before directory-v2/v1 inverses.
It does not reactivate the retired directory automatically; review exact mappings
before enabling access. Keep the application-derived JWT template while shared
staging is enabled. Never replace it with production's literal audience live.

The next hosted attempt still failed. WorkOS recorded successful MFA followed by
session revocation at 14:34/14:35 UTC. A composed runtime regression reproduced a
second issuer/audience equality guard in the application adapter (403); this does
not conclusively explain the owner's separate 503 response. Edge v8 pins the
adapter to the configured issuer/client pair and includes a content-free completion
failure stage. Only `employee-application-adapter`, `employee-runtime` and
`employee-http` changed from v7. All 189 targeted tests passed against both the
candidate and downloaded/transpiled runtime; portal/tooling typechecks, lint,
size and hygiene passed. Hosted anonymous access remains 401. Staging secret
digests and production function metadata are unchanged; no SQL/Pages/provider
configuration changed. Fresh owner password/MFA acceptance remains pending.
The protected `authorization-correction` package is the v8 candidate; the existing
`correction` package remains its immediate v7 rollback. Neither test results nor
a successful deploy establish hosted authenticated acceptance.

## Admin workflow acceptance — October 16

The owner confirmed fresh shared employee password/MFA login after v8. With
explicit approval, staging-only staff `enabled`, `extended_enabled`,
`history_reads_enabled` and `safety_queue_enabled` are now true. Internal business
review and privacy gates are enabled, with synthetic terms/privacy versions.
Browser workflow reads no longer implicitly enable realtime. The yellow centered
`DOJI STAGE` strip is shared by local and hosted staging; production has no strip
and hosted builds still exclude developer impersonation.

The manual staging Pages deployment was `b7183a4a` (October 16, approximately
15:29 UTC), built from the dirty working tree, not a merged/CI-qualified head.
Pre-change deployment `b2225370-b47b-45b2-8f53-a4d39ab5c493`, intermediate packages,
accepted package/manifest and retaining flag rollback are protected outside Git at
`%LOCALAPPDATA%/Doji/staging-admin/workflows-20261016`. Dashboard bindings and the
existing encrypted proxy secret were preserved. No production, Edge or shared
Worker deployment occurred.

Retained synthetic records: community ideas `a4100000-0000-4000-8000-000000000001`
(declined) and `a4100000-0000-4000-8000-000000000002` (pending); business application
`a6100000-0000-4000-8000-000000000001` (pending, assigned); content report
`a1100000-0000-4000-8000-000000000001` (pending, assigned). The synthetic business
account is disabled and has no business identity. Existing two synthetic profiles
were reused; real member data was not copied.

Hosted Chrome checks passed for home attention/ownership, idea Start review without
required fields, My work, decline confirmation, same-queue completed filtering,
review history/audit, business details/assignment, and report details/assignment.
Team directory and the existing unpublished announcement draft load. Restricted
safety and privacy show genuine empty queues. Report testing found the parser
rejected the server's empty preserved-evidence manifest before a decision; the
staging fix accepts only the correctly bound empty case and still rejects unbound
media. Its nine regression tests pass; the full web suite passed 305 tests, and
14 targeted tests plus web typecheck passed after final banner simplification.
Bundle size/artifact, lint, tooling typecheck, size and hygiene gates passed.

Final database checks: staff events/business realtime/mail capture/mail sending/
sender all false, business SQL login NOLOGIN, active cron 0, queued external HTTP
requests 0, synthetic profile count 2. Health accurately shows the intentionally
undelivered synthetic outbox (25 overdue at inspection), no Daily Doji and Sentry
not connected; this is not production delivery evidence. Real email, push,
scheduling, full decision/provider/role coverage and CI deployment/promotion are
not qualified by these checks. No announcement was published. The port-4313
isolated browser suite was not rerun while the owner's development server was in
use; hosted checks above used the real staging session. Rollback restores flags
and the prior Pages artifact without deleting test records or audit history.

## Automated admin release acceptance — October 16

PR #16 separately merged the approved compatible Expo patches; no mobile build or
deployment ran. PR #15 merged admin source as
`e347f4f84d328a73f90e3295e27abb683378837f` after all four exact-head checks passed.
Its first database job timed out pulling the pinned test image before tests started;
the isolated retry passed. All 17 coverage areas passed, including 845 browser tests.
The approved port-4313 browser/database suite also passed with synthetic data and
non-expiring/revoked developer credentials; the owner's local server was restarted.

[Main Quality run 38946388075](https://github.com/faheygs/doji/actions/runs/38946388075)
passed and automatically triggered
[Admin staging run 38947921226](https://github.com/faheygs/doji/actions/runs/38947921226).
At 18:32 UTC it deployed Pages `2d75152f-260f-409e-8f1b-1e010a865b7d`, preserving
bindings and recording rollback `b7183a4a-ae70-4f2e-b723-e0155b798d41`.
The live release SHA/configuration, security headers, anonymous 401 and cross-origin
403/no-store checks passed. Owner Chrome restored its employee session after reload;
the yellow stage banner, overview and synthetic audit history loaded successfully.

The downloaded `admin-release` and `admin-staging-receipt` passed exact manifests,
receipt hashes, trusted-run/main ancestry and matching hashes for all 63 frontend
assets. Production remains main-only, owner-approved and bypass-disabled; no
production workflow was dispatched. Its public flags stayed unchanged. Artifacts
expire after 14 days; restage before promotion if expired. No SQL, Edge, shared
Worker, mobile, business/site, email or access-grant deployment occurred. Kedd's
handoff remains held, and no live developer-token expiry was changed. This qualifies
the admin frontend release path, not the still-disabled external integrations.
