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
See [username input repair](releases/ANDROID_USERNAME_INPUT_2026-10-13.md).

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
