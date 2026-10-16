# Current state and handoff gaps

Source/release-record audit: **October 12, 2026**. This summarizes checked-in
code and dated acceptance evidence, not a fresh probe of every production service.
Owner: Gavin Fahey. Repository access does not authorize deployment, paid usage,
member actions, email sending or provider configuration changes.

## Current surfaces

| Area | Recorded state | Important boundary |
| --- | --- | --- |
| Member app | Expo 57 / RN 0.86; Supabase Auth; released 1.0.9 iOS 104 and Android 29 | Native binaries are not replaced by a source merge; Android availability is the existing Alpha audience |
| Update policy | October 7 record: minimum/latest 1.0.9, iOS 104 / Android 29, after owner availability confirmation | Recheck stores/policy before enforcement changes; no instant foreground-update guarantee |
| Admin | React/Vite/MUI, independent WorkOS employee identity and authenticator MFA | Portal sessions/roles cannot revoke or replace member Auth |
| Admin history/health | October 9 personal/completed and announcement lifecycle reads plus successful Sentry observation timestamp deployed | Health event feed disabled; bounded reads are not whole-platform uptime or crash-free-session measurements |
| Business | React/Vite/MUI with Doji-owned login, independent WorkOS realm; existing test account retained | Same email is not the same principal |
| Business setup | User verified application, approval, QR authenticator setup, branding and workspace, completed October 12 | Approval/setup/MFA server enforced; public signup, campaigns/billing and business realtime closed/gated |
| Business email | Branded HTML deployed to business runtime and application sender | Automatic capture/sending/wakeup off; budgets/receipts retained; no automatic uncertain-mail resend |
| Public site | Next.js 16 static export; legal and safety routes preserved | No Next server. Safety retains its isolated controller, private status/receipt and approved configuration |
| Shared email branding | Common renderer and code-owned shared/employee messages prepared | Not deployed to shared/member services; provider-owned WorkOS/Supabase templates are separate work |
| Next mobile changes | 1.0.10 iOS 105 / Android 30 finished October 12; iOS available to existing TestFlight group and Waiting for Review; Android closed Alpha Changes in review | See dated build record; physical-device acceptance outstanding, iOS manual release preserved, no mandatory-update change; not in installed 1.0.9 |

Next-build source after 1.0.10: [native read lifecycle recovery](releases/MOBILE_READ_LIFECYCLE_PREPARATION_2026-10-12.md)
pauses offline/background reads and restarts active reads on available foreground
return. Not built, deployed or verified on physical devices yet; does not replace
the existing 1.0.10 artifacts or establish production resolution.

October 13 admin repair: employee logout now confirms already-expired/removed
sessions without trapping the browser in retry-sign-out. The approved one-module
backport is LIVE as employee runtime v24. Exact-package authentication/boundary
tests passed (72); prior React session/reconciliation tests passed (13). Hosted
absent/removed-session retry and negative access checks passed; downloaded source
matches the tested package. v23 rollback retained. No database, member-app,
business, Pages or MFA change is included. A fresh user-authenticated login/logout
cycle was not performed in this release. See
[sign-out recovery evidence](releases/EMPLOYEE_LOGOUT_RECOVERY_2026-10-13.md).

October 13 next-build input repair: signup/profile-edit username fields no longer
rewrite native composing text on each edit. Availability checks and submitted
handles retain existing normalization/validation. Not built or deployed; the
reported Android keyboard duplication still needs physical-device acceptance.
Not included in 1.0.10; the exact duplication trigger remains unconfirmed.
Additional unbuilt signup repairs preserve the mounted draft during same-account
profile refreshes after camera/gallery use, surface picker failures, and prevent
post-commit refresh failures from deleting saved avatars. Automated regression
coverage does not replace Android device acceptance; no backend change is included.

Gateway read recovery (live October 15, 8:46 PM MDT): request-owned origin reads replace
cross-request pending promises; public-key caching stores completed data only.
A six-second gateway budget bounds authentication, cache and origin/body waits
before existing clients' eight-second deadline. Failures identify their phase
without logging credentials or payloads. Simultaneous identical cache misses now
issue independent authorized RPCs; the existing member budget and short response
cache remain. Live version `94343e0b-1447-495b-98c8-1db492864abe` serves 100%;
rollback version `bb415821-fbe9-4d74-8716-7b36ef24a7fa` and its source are retained.
The owner approved the separate production deployment. The narrow package
preserves all baseline code outside the read/authentication blocks. Local workerd
acceptance passed for stalled public-key/header/body recovery, cache isolation and
40 simultaneous synthetic reads; 60 targeted Jest suites / 1,607 tests passed.
Existing client retries and explicit retry recover within the same QueryClient.
Downloaded production source matches the tested package; settings, secret binding
names, five Durable Object namespaces and schedules are unchanged. The bounded
release-window read found no active event, overdue outbox work or lock waits.
Existing Workers Paid capacity was checked; no plan/resource upgrade was made.
Hosted absent/invalid-token reads return 401/no-store. A real signed-in device
feed-load/post-submission acceptance check remains outstanding; local synthetic
burst checks are not a production load qualification. Private release/configuration
receipts and rollback are in `test-results/gateway-read-recovery-20261015/`.
This addresses demonstrated recovery gaps, not proof of the initial cause of the
October 15 canceled requests. No mobile binary, database, write, challenge-timing,
push or portal source was deployed with this patch. Source is not yet merged.

## Recorded evidence

- [Mobile 1.0.9 release and enforcement](releases/MOBILE_LOGGING_RELEASE_2026-10-07.md),
  [next-build preparation and device gates](releases/NEXT_MOBILE_BUILD_2026-10-08.md),
  [1.0.10 build execution](releases/MOBILE_RECOVERY_BUILDS_2026-10-12.md).
- [React migration](releases/WEB_REACT_MIGRATION_2026-10-08.md),
  [admin history/health release](releases/EMPLOYEE_HISTORY_HEALTH_PREPARATION_2026-10-09.md),
  [queue consistency](releases/ADMIN_QUEUE_CONSISTENCY_2026-10-09.md),
  [public/business frontend release](releases/REACT_PUBLIC_BUSINESS_MIGRATION_2026-10-09.md).
- [Owned auth cutover](releases/BUSINESS_OWNED_AUTH_CUTOVER_2026-10-10.md),
  [recovery email](releases/BUSINESS_RECOVERY_EMAIL_2026-10-10.md),
  [persistent test access](releases/BUSINESS_EXISTING_TEST_ACCESS_2026-10-11.md),
  [onboarding rollout/acceptance](releases/BUSINESS_ONBOARDING_ROLLOUT_2026-10-11.md),
  [email branding](releases/EMAIL_BRANDING_2026-10-11.md).
- [Employee realm separation](releases/ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md),
  [business privacy](releases/BUSINESS_PRIVACY_OPERATIONS_2026-09-30.md),
  [safety launch](releases/SAFETY_LAUNCH_2026-09-29.md).

Later explicit releases supersede earlier preparation notes within dated records.
`candidate`/`drafts` directory names do not establish deployment state.
`website/` still supplies active controllers/contracts/packaging to `web/`.
Do not restore legacy Supabase portal login or delete these dependencies as cleanup.

## Source and verification baseline

[PR #7](https://github.com/faheygs/doji/pull/7) merged business onboarding/email
source as `96a612b` on October 12. Exact head `6875bbf` passed
[run 38256389247](https://github.com/faheygs/doji/actions/runs/38256389247):
application, database, web-migration and coverage, including 4,667 Jest tests and
all 17 independent 90% coverage areas. This baseline does not qualify a newer dirty
tree. Follow the current PR's exact-head checks.

The [repository handoff audit](releases/REPOSITORY_HANDOFF_AUDIT_2026-10-12.md) records
source reconciliation, cleanup and current validation. Retained owner checkouts
and private rollback artifacts are not a developer copy bundle. Use
[test suite handoff](TEST_SUITE_HANDOFF.md), [system map](SYSTEM_MAP.md) and
root/scoped AGENTS requirements.

## Remaining gates

The isolated **staging database** was provisioned and verified October 14, 2026:
`ohrcupagdoilkwhecict`, Free organization `doji-staging`, Canada Central. Its
147 application tables, 487 functions, RLS/grants and empty storage buckets are
installed, with synthetic fixtures only. The staging employee runtime and separate
`doji-admin-staging` Pages package are deployed; `admin-staging.dojipro.com` loads
over HTTPS with its Staging marker. The WorkOS callback is configured with password
sign-in and required MFA. Gavin and Kedd have approved staging access through their
existing employee WorkOS identities; Gavin confirmed hosted password/MFA login on October 16.
Sessions use a separate application audience, session keys and restricted SQL login.
Member signup/email, outbound integrations,
realtime, scheduling and update enforcement remain off. No production schema or
customer data was changed. This is not yet a full staging portal/mobile stack. See the
[baseline and acceptance record](releases/STAGING_DATABASE_BASELINE_2026-10-14.md)
and [developer connection requirements](LOCAL_DEVELOPMENT.md#hosted-staging-database).

The owner narrowed the current environment work to **admin only**. Business,
public-site and mobile staging are deferred. Staff invitations remain held until
environment preparation is finished. Root `npm run dev:admin` starts the existing
offline sample workspace without login/MFA; it does not access shared staging data.
`npm run build:admin-staging` now builds the
admin site from source without private baseline packages or env files and includes
a staging-only proxy guard; hosted staging uses this package with a yellow `DOJI STAGE` strip.
`npm run dev:admin:staging-login` runs the connected React frontend through a
loopback-only, fixed-staging relay, without developer API/database keys. Synthetic
browser acceptance covers MFA, reload, separate browser sessions, logout and
host/origin denial. Hosted owner login and representative workflows passed;
reproducible backend packaging and deployment/secret handoff remain open. See the
local guide and staging release record; staff invitations remain held.

The owner reports creating the Free Bitwarden `Doji` organization and empty
`admin-staging` project, with authenticator MFA/recovery setup completed. Project
access and scoped secret import remain unverified; no developer invitation or
CLI/CI integration is established.
See [shared vault requirements](SECURITY_AND_ACCESS.md#shared-development-vault).

Staging-only developer impersonation has an enabled private database gateway
and exact-definition-pinned assurance adapter. It uses distinct development proof,
active staging employees and dual-identity auditing, not fabricated MFA.
The local selector, restricted Edge gateway and server-only credential loader are
implemented. `npm run dev:admin:staging` selects approved personas without MFA;
it requires an issued developer credential and the separately activated staging
gateway. Browser → relay → gateway → disposable PostgreSQL acceptance passed,
including actual writes/replay, switching, reload and revocation. The adapter and
gateway were deployed to staging on October 15, with synthetic Super Admin and
Moderator personas and one revocable owner credential, private to the owner's OS
account and expiring January 13, 2027. Live HTTP acceptance covers local relay →
hosted gateway → staging SQL, role denials, an unpublished draft, identical replay,
dual attribution and revocation. Exact-schema offline rollback passed for all 40
patched gates; existing function grants are unchanged. Owner Chrome now verifies
the local yellow stage strip, avatar-menu impersonation dialog and workspace reload.
Staging internal workflow gates and labelled synthetic records are enabled;
workflow reads are independent of the disabled realtime connection. This does
not qualify external integrations. On October 16, the employee-directory
adapter and exact shared-employee realm cutover were deployed to staging. Gavin
and Kedd have separately mapped staging Super Admin roles; old synthetic employees
are inactive with identity/audit history retained. Only the owner's developer token
has directory-wide impersonation access. Live local selection/switching passed for
both employees; old persona access, anonymous hosted access and cross-origin access
are denied. Isolated browser/database tests cover writes/replay/revocation; the
cutover and retaining rollback passed offline and a staging rollback-only rehearsal.

Hosted staging now uses `Doji Admin Staging` in the shared employee directory,
with a dedicated runtime key in staging Edge secrets. The shared JWT template
derives audience from the application; verification pins the staging client and
shared issuer. Hosted acceptance exposed issuer checks in both the controller
and application adapter. Staging Edge v8 corrects both; 189 targeted tests passed
against the downloaded runtime, including composed password/MFA/session/logout
with real adapters and synthetic provider/SQL I/O. The prior package reproduces
the adapter's 403; the separately reported 503 is not yet conclusively traced.
Completion failures now include a fixed, content-free `stage` category.
The owner confirmed fresh employee password/MFA login succeeds; no invitations
were sent and production deployment/configuration fingerprints are unchanged.
The separate application does not automatically grant all production staff access.
Hosted MFA and the offline preview are unchanged; see
[development impersonation](LOCAL_DEVELOPMENT.md#local-developer-impersonation).
Additional developer credentials/vault delivery are still unprovisioned.

Admin-only deployment workflows are prepared locally, not merged or activated.
GitHub `admin-staging` and `admin-production` environments were verified on
October 15: main-branch-only, with owner production approval and admin bypass off.
Separate Pages Write account tokens are saved only in the corresponding GitHub
environment secrets, with the public account ID variable. They expire January 14,
2027; no runtime credentials were copied. CI token use and hosted release acceptance
remain unverified, and the activation variable is not configured.
The workflows build only admin, after repository Quality gates, then separately
promote a verified staging artifact to production without rebuilding. They deploy
no SQL, Edge runtime, shared Worker or other application. Hosted employee login,
idea review/history/audit, and report/business assignment passed manually;
CI deployment/promotion acceptance remains outstanding.
See [admin deployment workflow](LOCAL_DEVELOPMENT.md#admin-deployment-workflow).

| Before doing this | Required evidence/approval |
| --- | --- |
| Build/release next mobile version | Included-capacity check, unused version/build allocation, exact candidate tests, source-map symbolication and physical iOS/Android acceptance |
| Open public business admission | Owner policy/caps/cost approval, capacity and end-to-end isolation/acceptance; retain the test account unless separately authorized otherwise |
| Enable business email/realtime, campaigns or billing | Independent release scope, capacity, permission/uncertainty tests and retaining rollback |
| Enable health event feed | Approved shared impact/capacity plan; metered Ably Standard was not established as no-added-cost; no polling substitute |
| Add email/SMS MFA | Authenticator remains current; email draft is not equivalent TOTP proof; SMS not provisioned |
| Reconstruct production schema | Reconcile individually deployed overlays with migration history under separate approval; harness is not proof of full live-schema parity |
| Grant developer access | Named work identity, verified forwarding, least-privilege roles, MFA and separate vendor invitations |
| Claim root cause or 100k readiness | Correlated real evidence and approved representative load/provider headroom; models/diagnostics alone are insufficient |
| Declare dependencies secure | Fresh scoped audit and compatible remediation; no forced upgrades or old counts presented as current |

## Keep this current

Update this guide, system map and scoped instructions when ownership/stack/gates
change. Keep exact source/artifact, UTC time, tests, member impact, rollback and
unresolved acceptance in the dated release record. Never record credentials,
private payloads or reset links. Source merges do not deploy any of these systems.
