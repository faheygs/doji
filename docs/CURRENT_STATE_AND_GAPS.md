# Current state and handoff gaps

**Audit date: October 1, 2026.** This is a source/release-record summary, not a fresh
probe of every live service. Date-sensitive state must be re-read before operating
on production. Owner: Gavin Fahey. Technical access is assigned per developer;
there is no default authorization to deploy, spend or modify members.

## What the next developer should assume

| Area | Recorded state | Do not assume |
| --- | --- | --- |
| Member app | Supabase Auth remains unchanged; app source 1.0.8, iOS 101 / Android 23 | A portal login or password reset controls mobile accounts |
| Android | Build 23 available to the existing Alpha audience; enforcement changed only after owner confirmed eligibility | Public production release, tester installation or the 504 root cause being fixed |
| iOS | Build 101 uploaded and owner reported successful phone checks | Fresh confirmation of public App Store availability or exhaustive platform health |
| Employee admin | October 1 root cutover to independent WorkOS identity and MFA; owner login verified | Every developer already has an identity mapping, role or cloud dashboard access |
| Business | September 30 constrained public application flow released, backed by dedicated Supabase contracts | Independent WorkOS business credentials or the full paid sponsor platform |
| Public safety | September 29 category-based intake, restricted routing and alert/status workflow released | Public reports directly remove content, or an email proves staff reviewed it |
| Announcements / community ideas | Editorial, campaign and retriage releases documented | Permission to publish a campaign or award an arbitrary reward during QA |
| Scale | Local models, query repairs and operational evidence exist | Production-like proof of 100,000 concurrent users or zero errors |

## Latest source-of-truth records

- Employee: [Account realm separation](ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md),
  [Workforce plan](WORKFORCE_IDENTITY_PLAN.md) and the latest dated employee entries
  in [DOJI_CONTEXT.md](../DOJI_CONTEXT.md). Earlier September 26 employee records
  describe the prior Supabase-based employee flow, not the current root login.
- Business: [Live release](BUSINESS_LIVE_RELEASE_2026-09-30.md),
  [Privacy operations](BUSINESS_PRIVACY_OPERATIONS_2026-09-30.md) and
  [Realm separation](ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md).
- Safety: [Launch](SAFETY_LAUNCH_2026-09-29.md) and
  [Media repair](MODERATION_MEDIA_REPAIR_2026-09-28.md).
- Mobile: [Android 23](ANDROID_RECOVERY_BUILD_23_2026-09-28.md),
  [iOS 101 / Android 22](MEMBER_READ_BUILDS_101_22_2026-09-28.md) and
  [Read recovery](MEMBER_READ_RECOVERY_2026-09-28.md).

The latest recorded employee root deployment is
`38bb97d7-0bf0-4be4-8a76-d6f132051b41`. Its runtime still lives in
`infra/portal-identity-candidate`; "candidate" is a historical directory name.
The business deployment is recorded as `b891687f-f7a6-47b3-998d-9c74a27525fc`.
These IDs help locate evidence; do not roll back to an ID without checking what
changed since it was recorded.

## Identity separation: complete versus remaining

October 4 MDT / October 5 UTC local follow-up: the owner approved the business
identity/dependent approval/privacy scope and repository-wide TypeScript migration.
All 371 originally maintained JavaScript files are converted across identity,
browser sources, build/test configuration, fixtures, coverage, database testing,
release scripts and local tools; zero remain in the legacy-source inventory.
The two retained JavaScript compatibility/bootstrap artifacts are generated
from TypeScript and byte-verified. The earlier
14-file snapshot passed 4,640 Jest tests, 25 offline suites and 655 browser scenarios;
all 17 areas met all four 90% thresholds. Current migration verification is recorded
in [Testing and releases](TESTING_AND_RELEASES.md#typescript-source-migration).
These are local dirty-workspace snapshots, not a hosted
CI/release result. Business WorkOS cutover and lifecycle acceptance remain open;
no production service, database, account or member session was changed by it.

The employee cutover uses a separate WorkOS account and exact-subject mapping,
authenticator MFA and a same-origin server session. Nine staff attribution
references were migrated to independent employee identities with history preserved.
Member login/password/session ownership remains Supabase Auth.

Business still uses its released Supabase-based dedicated flow. The intended
same-email independence across all three realms is **not yet complete**. Do not
declare it complete because staging identity tests passed or an employee can log
in. Business WorkOS activation, environment separation and an owner-verified
end-to-end business journey require their own cutover evidence.

## Business launch constraints

The September 30 release records US self-declaration, a ten-account lifetime
admission ceiling, a thirty-email total reservation limit and a thirty-email daily
reservation limit, with signup
closure at `2026-10-07T23:59:59Z`. Verify actual configuration before interpreting
a rejected signup; a reservation counter is not proof an email was delivered.
Sign-in and account creation are separate gates.

Business realtime, campaign publishing and billing are disabled. The local
`business-portal` marketing/workspace prototype is not the live business application.
Approved terms/privacy versions are `business-terms-20260930-v1` and
`business-privacy-20260930-v1`; drafts/research records remain provenance, not a
license to substitute member legal terms or bypass acceptance.

## Prioritized handoff gaps

| Priority | Gap | Needed completion evidence |
| --- | --- | --- |
| Before giving a complete handoff to the developer | The secret-reviewed source snapshot `3160372` is on `main`; both qualification and main-push CI passed. The primary workspace still contains modified/untracked release docs and operational evidence | The testing quickstart is in [Test suite handoff](TEST_SUITE_HANDOFF.md). The wider historical documentation bundle still needs separate publication review; do not publish retained credentials/evidence |
| Before independent full-stack development | No certified one-command current-schema local stack; deployed draft SQL and migration ledger differ | Sanitized versioned bootstrap/fixture, migration reconciliation, reset/replay and regression proof |
| Before developer portal access | Exact work email, destination inbox and least-privilege roles not assigned here | Verified forwarding, accepted employee invitation/MFA and explicit principal/role mapping |
| Before claiming three independent account realms | Business WorkOS cutover incomplete | Same-email signup, reset, logout, deletion and permission tests across all three realms |
| Before broader business launch | Admission caps/expiry and incomplete owner business acceptance | Approved configuration plus real signup, mail, onboarding, staff review and corrections evidence |
| Before general Android availability | Current evidence concerns closed Alpha | Play production eligibility/review/availability verified separately |
| Before claiming incident resolution | Android production 504 source not confirmed repaired | Build-23-or-newer correlated request evidence and actual tester outcomes |
| Before 100,000-user claim | Local simulations only cover portions of the workload | Approved production-like capacity tests and actual provider/database headroom, with no surprise costs |
| Test coverage requirement | Verified October 2 local run: 17/17 areas meet 90% independently for statements, branches, functions and lines; unchanged 437-file inventory | [Testing and releases](TESTING_AND_RELEASES.md) records the fresh passing run; preserve the gate and verify hosted CI/fresh-clone results separately. SQL, native-device and live-provider integration gates remain distinct |
| Tooling follow-up | October 2: all 19 root type diagnostics resolved; strict app/fixture checks pass. The portable database runner now replays migrations, runs 12 later-schema suite variants and verifies a second empty-database run from source only, without retained artifacts or dependencies | Hosted CI and the reviewed handoff commit remain separate gates. Live WorkOS browser/device/provider qualification is not supplied by local SQL tests |
| Deferred source decomposition | Owner approved October 2 size exceptions for the 15 existing oversized files; `check:size` passes locally with caps frozen at current sizes | Further growth still fails, the 240-line default and coverage gates remain unchanged. Refactoring is deferred; hosted CI still needs verification. Exact caps are in [Testing and releases](TESTING_AND_RELEASES.md#existing-source-size-blocker) |
| Hosted CI verification | Complete for reviewed source snapshot `3160372` on `main`: application, coverage and database jobs all pass; 17/17 areas meet every 90% threshold, 4,514 Jest tests and 652 browser scenarios pass. Main now requires all three checks and pull requests, including for administrators | No production deployment or app build is included. Native/provider/capacity acceptance remains separate. See [follow-up](TESTING_AND_RELEASES.md#hosted-ci-verification-follow-up) |
| Dependency advisories | Critical-only audit exits zero with seven high and three moderate findings | Review reachability and compatible fixes separately; no forced downgrade or claim of a clean security audit |

This documentation pass does not silently complete those engineering tasks or
change launch limits. Unknowns are explicit so the developer can start safely
without treating a draft, local screenshot or historical checked box as proof.

## Keeping the handoff current

For each release, update the relevant record with UTC time, exact scope,
environment, artifact/commit, checks, member impact, rollback and remaining gates.
Then update this summary if deployment/identity ownership changed. Keep detailed
history rather than overwriting older evidence. Do not store secrets or member
content in an incident/release note.
