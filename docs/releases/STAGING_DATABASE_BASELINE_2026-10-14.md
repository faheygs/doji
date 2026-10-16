# Admin staging baseline and rollback

Provisioned October 14–16, 2026 under owner approval. This is release evidence,
not a bootstrap/deployment runbook. Current commands and access requirements are
in [Local development](../LOCAL_DEVELOPMENT.md); current gaps are
[in the status guide](../CURRENT_STATE_AND_GAPS.md). Superseded intermediate
attempts remain recoverable in Git history rather than repeated below.

## Database baseline

| Item | Verified value |
| --- | --- |
| Project / organization | `ohrcupagdoilkwhecict` / `fjpnwsnnrbjsdvilesmn` (`doji-staging`) |
| Capacity | Free, Canada Central, Nano; no paid add-on enabled |
| Installed schema | 147 application tables, 487 functions at bootstrap, exact RLS/grants |
| Storage | Empty avatars, post-media and moderation-evidence buckets; 19 matching policies |
| Reference fixtures | 9 badge categories, 26 tiers, 31 badges, 16 shop items, two demo members, two inactive challenges |
| Isolation | No member passwords/media, production contacts, sessions, tokens or Vault data copied |
| Defaults | Explicit grants, automatic RLS, member signup/email off, no active jobs/outbound integration |

Reviewed source was `0dd2b1a`. Production had 289 migration ledger entries;
source had 290. `20261005020000_poll_reserved_other.sql` was absent from the live
ledger although its three transformations existed. Staging records 290 baseline
versions; production's ledger was not repaired. Individually deployed overlays
were reconciled through schema-only capture, not blindly reapplied. The business
email wake function was rebound to staging and remains disabled.

The migration-only suite passed 274 pgTAP checks plus isolation/concurrency tests.
The exact-schema restore verified all 487 definitions/grants, 47 moderation and
94 admin assertions. Realtime passed 132/133: the anonymous-function assertion
differs by the existing live grants for `claim_active_app_announcement`,
`record_app_announcement_action` and `moderation_media_is_frozen_v1`. These were
verified and retained, not silently tightened or reported as an unmodified pass.
Staging Postgres 17.11 / pg_net 0.20.4 differs from production 17.6 / 0.20.0.

Bootstrap SHA-256: `242425c70c18aec6741428805f9e4909bbe3eaae48afb7fadb2401c9bfb4436f`.
Schema capture SHA-256: `4da0dca2879467859cee5256a2a573b542d8dd4eea66bd3ad0a2876cb133e516`.
Exact SQL, manifest and verification are owner-restricted outside Git at
`%LOCALAPPDATA%/Doji/staging-baselines/2026-10-14`. Do not rerun the bootstrap
on populated staging or erase later developer data. Restore into a new isolated
target or prepare a reviewed forward repair.

## Deployed identity and local development

Hosted staging uses the same employee identity/password/MFA as production through
a separate application, database authorization and session audience:

- WorkOS application `app_01M51GRQJWFWT205ARJXQXTM8R`, client
  `client_01M51GRQJVKXFZ98RG21MK7J64`, shared employee environment
  `environment_01M3VE4WMDRZ1VBVS5MNVVF19J`.
- Callback: `https://admin-staging.dojipro.com/identity/setup-complete`;
  eight-hour sessions, thirty-minute inactivity, five-minute access tokens,
  no CORS origins. Required MFA and disabled self-signup remain unchanged.
- Shared JWT template: `{"aud": {{ application.client_id }}}`.
  Prior production-only template: `{"aud":"client_01M3VE4WTBYS2XN6NZPH9EDMQD"}`.
  Production preview retained its audience/issuer. Never restore the literal
  template while shared staging is enabled.
- Dedicated staging runtime credential is stored only in protected runtime
  configuration. No password/factor change or setup invitation was sent.
- Applied `admin_development_employees_v2` and `employee_shared_staging_v1`
  map verified Gavin/Kedd subjects to separate staging Super Admin principals.
  Retired synthetic employee identities are disabled and retained for audit.
- Employee Edge v8 corrects issuer/client checks in controller and application
  adapter; 189 exact-package tests passed. Owner confirmed fresh password/MFA
  login. Completion failures expose only a fixed, content-free stage category.
- Separate `admin-development` gateway v3 supports local employee impersonation,
  not fabricated hosted MFA or member tokens. Only the owner's token has
  directory-wide access; its initial expiry is January 13, 2027. Non-expiring
  revocable credentials passed offline tests; no live expiry was changed.

Both SQL logins are NOINHERIT, connection limit two, TLS verified, with bounded
queries and no direct application-table privileges. The development login has
only the development role; parameter/error-parameter logging is disabled.
The assembler pins reviewed definitions and preserves original owners/grants,
with 40 adapted assurance checks against 490 captured definitions. It records
developer and employee attribution, never bearer tokens or request bodies.

Local relay → hosted gateway → staging SQL checks passed selection/switching,
permission denials, one unpublished synthetic draft, identical replay, audit and
revocation. Isolated browser/Postgres tests passed reload, switching, writes,
replay, revocation and non-expiring credentials; the owner's port-4313 server
was restarted. Hosted anonymous/cross-origin/direct-ingress boundaries passed.
No member Auth, production schema, production runtime or business identity changed.

## Workflow acceptance

Staging staff enabled/extended/history/safety gates and internal business/privacy
review gates are enabled. Workflow reads do not implicitly enable realtime.
Local and hosted staging show the centered yellow DOJI STAGE strip; hosted bundles
exclude developer impersonation. Synthetic records retained for repeatable tests:

| Record | ID | State at acceptance |
| --- | --- | --- |
| Community idea | `a4100000-0000-4000-8000-000000000001` | Declined |
| Community idea | `a4100000-0000-4000-8000-000000000002` | Pending |
| Business application | `a6100000-0000-4000-8000-000000000001` | Pending, assigned; disabled business account, no identity |
| Content report | `a1100000-0000-4000-8000-000000000001` | Pending, assigned |

Hosted checks passed home attention/ownership, idea Start review without required
fields, My work, decline, same-queue completed filtering, audit/history and
business/report detail assignment. Team and unpublished announcements loaded;
restricted safety/privacy showed genuine empty queues. The bound-empty preserved
evidence parser regression passed nine tests; unbound media remains rejected.

At acceptance: two synthetic profiles, no active cron or queued external HTTP,
business SQL login NOLOGIN, staff events/realtime/mail capture/mail sending off.
Health showed undelivered synthetic outbox work (25 overdue), no Daily Doji and
Sentry disconnected. This is not production delivery or external integration
qualification. No announcement was published or real email/push sent.

## Automated frontend release

PR #15 merged as `e347f4f84d328a73f90e3295e27abb683378837f` after all four
exact-head checks and all 17 coverage budgets passed (845 browser tests).
The first database job failed downloading its pinned image before tests; its
isolated retry passed. PR #16 separately updated compatible Expo patches;
no mobile build/deployment was started.

[Main quality 38946388075](https://github.com/faheygs/doji/actions/runs/38946388075)
triggered [staging 38947921226](https://github.com/faheygs/doji/actions/runs/38947921226)
at 18:32 UTC October 16. Pages deployment:
`2d75152f-260f-409e-8f1b-1e010a865b7d`; retained prior deployment:
`b7183a4a-ae70-4f2e-b723-e0155b798d41`. Bindings, release SHA, configuration,
security headers and anonymous/cross-origin 401/403 no-store checks passed.
Owner Chrome restored its session; stage strip, overview and synthetic audit loaded.
Docs-only [run 38953049163](https://github.com/faheygs/doji/actions/runs/38953049163)
correctly skipped packaging/deployment.

Downloaded manifests, staging receipt, source ancestry and all 63 shared frontend
asset hashes passed production preflight. Production is main-only, owner-approved
and bypass-disabled; its action has not yet run. Artifacts expire after 14 days.
The pipeline deploys admin Pages/proxy only, not SQL, Edge, shared Worker or other
apps. Kedd's credential/vault handoff and all messages remain held.

## Retained recovery

| Scope | Owner-restricted recovery location / inverse |
| --- | --- |
| Initial hosted connection | `%LOCALAPPDATA%/Doji/staging-admin`: original employee runtime, configuration and setup/retaining SQL |
| Development adapter | `%LOCALAPPDATA%/Doji/staging-admin-development/2026-10-15`: definitions, package, receipts and exact retaining rollback |
| Shared identity / v8 | `%LOCALAPPDATA%/Doji/staging-admin/shared-employee-20261016`: prior packages, SQL and fingerprints; `authorization-correction` is v8, `correction` its v7 inverse |
| Workflow flags / manual Pages | `%LOCALAPPDATA%/Doji/staging-admin/workflows-20261016`: previous flags and exact packages; initial Pages ID `b2225370-b47b-45b2-8f53-a4d39ab5c493` |
| CI Pages | Protected workflow artifact/receipt records exact source and previous deployment; retain before 14-day expiry |

Disable staging gates/logins before identity rollback. Restore runtime/config,
then apply the shared-identity retaining inverse, directory-v2 inverse and
development-v1 inverse in that order. Hash guards reject newer drift; retain
employee/test/audit records and review mappings before re-enabling. A UI rollback
uses the prior Pages artifact without changing SQL, data or WorkOS. Do not reset
staging, remove member data or revoke production identities as rollback.
