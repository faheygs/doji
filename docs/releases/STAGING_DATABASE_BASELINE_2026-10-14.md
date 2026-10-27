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

## Staging backend foundation

October 25 owner-approved staging-only provisioning: `doji-orchestrator-staging`
has five new Durable Object namespaces, no production bindings/routes, and four
new Edge functions: `orchestrate-doji`, `schedule-daily-challenge`,
`run-data-maintenance`, `operational-health`. Fresh secrets are staging-only;
`STAGING_BACKEND_ENABLED=false` and empty cron keep incomplete integration inactive.
The disabled source deployment is `706ac786-4e08-4c5f-99e6-4eb7a0794d95`; prior
disabled version `4ef72c59-f98c-42ff-a914-fa3fc1285376` retains the same namespaces
and secrets. Production was not deployed. Edge secret installation refreshed the
existing employee/development function versions to 10/5 without changing their source.

Migration `20261025172000` was applied forward with a function fingerprint guard:
`d53835a47acdea37c588c58f05fa7ad9` -> `bdbd6a8c37fb7874a682abb2fe799b88`.
Staging scheduling/retention/activation/voting/retry/600-second timing/permissions
regression passed in a rolled-back transaction. Anonymous Edge calls returned 401,
invalid activation 400, and authorized health 200 with `healthy=false`, not all-clear.
Local workerd tested isolated reads, stalled-request recovery and 40 concurrent
synthetic requests with all upstream network intercepted. Full hosted lifecycle,
portal/relay realtime, test delivery, monitoring, promotion and Kedd handoff remain
unqualified. Owner approved staging's metered Ably usage on the existing Standard
subscription after cost clarification. Separate app `eVKl2g` uses `staging-runtime`
key `eVKl2g.pmnIEA`, publish/subscribe only on documented Doji channel families,
with no queue/push/admin permissions. The secret is installed only in staging
Supabase. A bounded synthetic publish/subscribe passed; subscribe-only publishing
and an unapproved channel were denied. Existing portal config digests and Edge
source metadata remained unchanged. Provider-generated default keys were not
exported or installed. To disconnect this integration, keep execution disabled
and remove only the new staging `ABLY_API_KEY`; never change production keys.
Protected source/configuration/SQL inverse and receipts are at
`%LOCALAPPDATA%/Doji/staging-backend/2026-10-25`; disable execution before rollback.
No real email/push was sent, no plan upgrade or additional subscription was made,
and no production data was copied. Staging Ably usage is billed to the existing account.

### Isolated backend activation and acceptance

October 25 follow-through enabled Worker `63b0feeb-faff-4a6c-a608-0d76867889b3`,
retaining all five staging namespaces and empty cron. Rollback is the disabled
`706ac786-4e08-4c5f-99e6-4eb7a0794d95` version above. Seven handlers now use the
staging fetch guard: the four listed above plus `relay-domain-events`,
`fanout-doji-push` and `realtime-token`. Only exact staging origins and the isolated
Ably credential are accepted; redirects and real email/push endpoints are denied.
Production handler bodies are unchanged. Preserve the guarded package when updating.

The relay published 26 queued synthetic events with zero failures/pushes. Actual
one-shot alarms activated an intervening photo, removed the future poll card,
then recreated exactly one card at poll activation. Authenticated synthetic vote
and identical retry recorded one vote/one completion credit. Both windows were
600 seconds; the photo closed at 19:09:43 UTC and poll at 19:10:27 UTC without
manual close or recurring polling. Their fixtures use the `97000000-0000-4000-8000-`
ID prefix and remain in staging for evidence; next-event chaining was disabled.
The two completed challenge templates were marked inactive so future queues cannot
select these acceptance fixtures. Their events, votes and audit were not deleted.

Employee `staffWorkflowEnabled` and database `staff_workflow_private.settings.events_enabled`
changed from false to true; other gates stayed unchanged. The configuration SHA-256
changed from `1630fd8eaeb335d040d2d04dbe0a7c143b7dc605355bdf782e90628c6d75fd37`
to `0424c7c80db5e6089edb941a2b1eb4a75ae96f3553365f0b861bf39b1fffe7f9`.
Protected `employee-realtime-rollback.env` restores the former runtime flag; disable
only the database events flag to stop new staff events without deleting audit data.

Staging Pages acceptance package `admin-realtime-v1` enabled scoped Ably CSP/config;
its retained prior Pages deployment is `a078ab9d-5016-4a98-83aa-0c620bb3f1bf`.
Hosted staff tokens connected. Claiming synthetic idea `a4100000-0000-4000-8000-000000000002`
invalidated another tab, but its first refreshed read failed; Retry recovered the
correct assignment counts. A subsequent session failure ended both tabs. Source
inspection found failed session checks request logout; the prepared correction
locks/clears local state without revoking a shared cookie on an unavailable read.
The correction passed unavailable/busy/rate-limited authorization regressions,
preserving fail-closed access, expiry and explicit logout. It is deployed only to
staging Pages `36462b3c-085d-4164-b392-37859729b529` (`admin-realtime-v2`); its rollback
is `1c25bdc1-a6c6-4ffb-95c3-b0f80ea32878`. Live root/config/entry hashes match, with
anonymous 401 and invalid-origin 403. Fresh login succeeded. The next two-tab test
recorded `/api/session` HTTP 409 at 21:53:37 UTC; an explicit session check restored
access without another MFA login. The server's exclusive session lease was being
contended by independently queued browser tabs.

Staging-only Pages `15f9f0cf-bb6e-49a0-a504-dbc582544e41` (`admin-realtime-v5`)
now uses a same-origin Web Lock with a bounded 15-second acquisition wait. It
does not steal locks, retry commands, change server leases or weaken authorization.
Unsupported browsers retain the previous per-tab queue and server-side fencing.
Rollback is `36462b3c-085d-4164-b392-37859729b529`. Shared command context, expiry
handling and deferred-command session checkpoints remove duplication without
raising bundle budgets. The deployed config/entry hashes match the package; HTML
references that entry but Cloudflare injects its analytics beacon, so its complete
response is not byte-identical to the packaged HTML.

At 22:08 UTC, both tabs restored successfully; releasing then reclaiming the same
synthetic idea updated the observing overview from three assignments to two and
back to three without reload, retry or logout. Both remained realtime-connected.
The 15 latest visible invocation rows covering those actions/session checks were
HTTP 200. This bounded check does not establish absence of errors outside its window.
All 309 web tests, 193 transport/workflow tests, strict portal/tooling/web checks,
and six package tests including two browser cases passed. Added regressions cover
cross-tab serialization, failure release, queued logout fencing, acquisition timeout,
no uncoordinated fallback after lock failure and explicit session recovery.

Root Jest passed 255 suites/4,780 tests; staging isolation/egress passed 34 tests;
root strict checks and all 309 web tests/build checks passed after the correction,
along with 82 transport/session-store tests and staging-package browser checks. These are
not exact-head CI or production promotion approval. Manual staging acceptance
packages from uncommitted source must not be promoted as tested CI artifacts.
Monitoring, safe delivery tests, coordinated backend promotion and Kedd's handoff
remain outstanding. Local resource integration is recorded below.

### Local resource integration

October 25: the owner-approved resource upgrade added two private authorization
routes (44 to 46), without changing existing permission functions or direct grants.
Development Edge v9, with `ADMIN_DEVELOPMENT_RESOURCES_ENABLED`,
matches package SHA-256 `f5387c2369ddf2f8bf831d253ed26debc4f0a192b8afedf9b2db64d2a7ac3d5a`.
It reuses hosted media/channel policy with distinct developer proof and checks
revocation again before releasing a signed resource. Hosted MFA and production
were untouched; signing keys remain server-side and staging-pinned.

Live acceptance: seven subscribe-only Ably channels attached in app `eVKl2g`;
an authorized 634-byte synthetic JPEG signed/downloaded with a five-minute URL.
Unrelated objects, traversal, intermediate HTTP routes and invalid credentials
were denied. SQL audit retained developer/persona attribution for allowed/denied
authorization. Report `a1100000-0000-4000-8000-000000000002` and staging member two's
`staging-resource-acceptance.jpg` are retained synthetic fixtures. Live Chrome
acceptance passed Gavin/Kedd selection and switching, cancel preserving the current
case, reload restoring Kedd, and realtime reconnection. The protected image loaded
from staging storage; returning to Gavin restored his assigned-work count (3 versus
Kedd's 0). No case mutations or messages were sent. The actual localhost
session/channel-list/token/media HTTP flow passed, as did the isolated browser
connection/reload/switch/revocation regression.
Local realtime is enabled; the permission-checked channel-list read is public to
authorized developers, while intermediate evidence authorization remains private.

Isolated database permissions/revocation/rollback, 312 web tests, 4,780 Jest tests
and 845 browser tests passed (one existing skip). All 17 coverage budgets passed
after rerunning the 60 offline scripts with collision-safe report filenames:
Windows PID reuse had overwritten two reports. Thresholds were unchanged.
Strict checks, lint, artifact exclusions, size and hygiene passed; this is not
exact-head CI or production promotion qualification.

Recovery: owner-restricted `staging-backend/2026-10-25/development-resources-v1`
contains apply/retaining inverse and fixture SQL; `development-resources-v2`
contains the final package. `development-resources-rollback-v6`
contains the prior gateway (SHA-256 `8d4ad8fdea9296be7f1dc5c16fec6d805db1801eff932f9e1a6e997a3068c8e6`).
Disable the resource flag, restore that gateway, then apply the definition/route-pinned
SQL inverse. Preserve audit and fixtures; do not reset staging or alter hosted identity.

## Retained recovery

The October 16 development-route correction added six existing staff-workflow
contracts to the staging registry (38 to 44 routes). Live local home, assigned-work
and ownership reads passed. All prior rows, identity/settings and the function/grant
fingerprint `41e99fcfd16c61e6cd034ce6da67153d` remained unchanged; active cron stayed
zero. Offline tests cover authorization, bounded reads, replay, audit and retaining
rollback. No production service, function, grant or flag changed.

| Scope | Owner-restricted recovery location / inverse |
| --- | --- |
| Initial hosted connection | `%LOCALAPPDATA%/Doji/staging-admin`: original employee runtime, configuration and setup/retaining SQL |
| Development adapter | `%LOCALAPPDATA%/Doji/staging-admin-development/2026-10-15`: definitions, package, receipts and exact retaining rollback |
| Development workflow routes | `%LOCALAPPDATA%/Doji/staging-admin-development/workflow-routes-20261016`: before-state, applied SQL, verification and definition/row-pinned six-row rollback |
| Shared identity / v8 | `%LOCALAPPDATA%/Doji/staging-admin/shared-employee-20261016`: prior packages, SQL and fingerprints; `authorization-correction` is v8, `correction` its v7 inverse |
| Workflow flags / manual Pages | `%LOCALAPPDATA%/Doji/staging-admin/workflows-20261016`: previous flags and exact packages; initial Pages ID `b2225370-b47b-45b2-8f53-a4d39ab5c493` |
| CI Pages | Protected workflow artifact/receipt records exact source and previous deployment; retain before 14-day expiry |
| October 27 monitoring/email | `%LOCALAPPDATA%/Doji/staging-backend/2026-10-27`: exact previous employee source/config, Worker source/settings/namespaces, candidate packages, credential recovery and delivery/configuration receipts |

October 27 integration release: reviewed `fc5d4f3` passed main CI `40437463837`
and automatic admin Pages deployment `40438805370`. Staging Worker
`02de84b9-c1be-4b18-afd5-d0f1039d7e01` matches the tested bundle and preserves
all five namespaces, existing bindings and empty cron schedule. Only isolated
Sentry capture bindings were added. Employee Edge source v13 and guarded
`send-admin-email` source v1 were deployed; secret updates can increment the
provider's displayed function version without changing source. The exact employee
artifact passed 26 synthetic authentication/monitoring tests.

Sentry project `4512328707342336` (`doji-staging`) ingested one synthetic event;
the owner-approved `event:read` integration retrieved it with the staging filter.
No default Sentry email alerts or plan changes were enabled. The domain-restricted,
sending-only Resend key delivered one labelled email through the deployed handler
at 14:45 UTC; provider receipt `01a17dd2-fb66-7bb6-a1bf-cd9ce050d2cb` shows
Delivered. Logo, staging branding and staging admin button were inspected.
`STAGING_EMAIL_ENABLED=false` was restored and verified by its provider digest;
anonymous sender access returns 401. Signed-in Platform Health displayed the single
`[STAGING TEST] Monitoring connection check` issue from `doji-staging`, fresh
database observations, connected staff realtime and the yellow stage banner.
The already-open tab first failed to load an old `c434440` lazy-loaded asset;
the explicit Reload workspace action loaded the current release and restored the
session without another login. Long-lived tabs can require this reload after deployment.
No production, push, database schema, recurring job or developer access changes.

Integration rollback: keep email disabled and retain its database receipt; restore
the captured employee runtime plus `employee-config-rollback.env`. Disable
`STAGING_SENTRY_ENABLED`, then restore Worker `63b0feeb-faff-4a6c-a608-0d76867889b3`
with its captured bindings/namespaces. The new capture key may remain stored but
unused; do not copy it to the production DSN binding. Remove/revoke newly provisioned
credentials only after the corresponding runtime is disconnected. Never retry an
uncertain email automatically or delete its claim to force another delivery.

Disable staging gates/logins before identity rollback. Restore runtime/config,
then apply the shared-identity retaining inverse, directory-v2 inverse and
development-v1 inverse in that order. Hash guards reject newer drift; retain
employee/test/audit records and review mappings before re-enabling. A UI rollback
uses the prior Pages artifact without changing SQL, data or WorkOS. Do not reset
staging, remove member data or revoke production identities as rollback.
