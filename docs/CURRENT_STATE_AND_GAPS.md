# Current state and handoff gaps

Updated October 30, 2026. This separates source, recorded deployments and owner
device reports; it is not a fresh probe of every production service. Owner: Gavin
Fahey. Repository access does not authorize cloud changes, spending or member actions.

## Current surfaces

October 25 poll incident: the missing community card was repaired; real submissions
resumed. The approved activation-function fix is live and passed 147 isolated
database assertions, including reproduction, voting, retry credit and permissions.
The separately approved recovery window ran through 17:27:31 UTC (11:27:31 AM Mountain);
seven missed participants reopened, five completed votes preserved, no extra push.
Source migration `20261025172000_create_poll_post_at_activation.sql` records the fix;
its production application was targeted, not a bulk migration push or ledger replay.
See [incident and rollback evidence](releases/README.md#october-25-poll-activation-incident).

The October 24 replacement Doji's one-occurrence participation exception expired
October 25 at 06:00 UTC (midnight Mountain Time). Seven deployed function bodies
retain occurrence-specific overrides; restoration needs a separate reviewed release.
See the [correction and rollback record](releases/README.md#october-24-doji-correction).

October 25: phase-specific, bounded operational-health reads are live in Worker
`5d44589a-b0c0-4734-bfaf-08afccada948`; the gateway fix, settings and five Durable
Objects are preserved. Rollback is `94343e0b-1447-495b-98c8-1db492864abe`.
Mobile 1.0.12 contains native disconnected foreground authorization renewal/cancellation
fencing. Both builds completed with Sentry source-map upload evidence; iOS 106 is
available to the six existing TestFlight testers. Android 32 was submitted for
existing closed Alpha review; Google shows “Changes in review” with quick checks
still running, not yet approved or available to testers.
Neither is device-accepted. Admin staging deployed reviewed main
`1886ab0` after all four quality gates passed; production admin was not promoted.
See the [release receipt](releases/README.md#october-25-alert-recovery).
Sentry `REACT-NATIVE-2M` showed an iOS 1.0.10 background/resume provider timeout
while submission/feed reads succeeded; it does not establish the older Android
504 root cause. Supabase staging was `ACTIVE_HEALTHY` when rechecked October 24.

| Surface | Recorded state | Boundary |
| --- | --- | --- |
| Member app | Owner reports iOS 1.0.10 and Android 1.0.11 (31) in use; Android signup retry succeeded | Older 1.0.9 / pending-1.0.10 records are historical, not current store status |
| Mobile source | Expo 57.0.31 and alert-recovery source merged; 1.0.12 Android 32 / iOS 106 built October 25 | Tester/store availability and device acceptance are separate |
| Update policy | Owner requested Android 1.0.11 / iOS 1.0.10 minimums | Live policy and store availability were not rechecked in this admin release; do not replay October 7 enforcement |
| Admin production | React/Vite/MUI, employee WorkOS + MFA; sign-out recovery recorded as runtime v24 | Member Supabase Auth and mobile sessions are separate |
| Admin staging | Same frontend; shared employee identity, separate WorkOS application, database, sessions and grants | Hosted login/MFA and representative workflows verified; local impersonation is not shipped to hosted sites |
| Business | Owned React/MUI login, independent WorkOS realm; owner completed application, approval, QR MFA, branding and workspace | Test account retained; public admission, campaigns/billing and realtime remain gated |
| Business email | Branded renderer/runtime deployed | Automatic capture/sending/wakeup remain off; no uncertain-mail auto-resend |
| Public site | Next.js static export with retained legal/safety controllers | No Next server; safety uses its own private receipt/status contracts |
| Shared email branding | Shared/employee renderer changes prepared | Shared/member deployment and provider-owned templates remain separate |
| Health | Bounded delivery/history and Sentry reads | Health event feed disabled; not whole-platform uptime or crash-free-session measurement |

The [mobile build record](releases/MOBILE_RECOVERY_BUILDS_2026-10-12.md) identifies
the frozen 1.0.10 artifacts. [Native lifecycle preparation](releases/MOBILE_READ_LIFECYCLE_PREPARATION_2026-10-12.md)
describes subsequent source; its inclusion must be checked per platform, not inferred
from main. Android username/avatar signup success is an owner report, not proof of
every device or network path. No mobile build is required to release admin Pages.

Employee sign-out recovery and its retained v23 inverse are recorded in
[the employee release](releases/EMPLOYEE_LOGOUT_RECOVERY_2026-10-13.md).

Gateway read recovery (live October 15, 8:46 PM MDT): request-owned origin reads replace
cross-request pending promises; public-key caching stores completed data only.
A six-second gateway budget bounds authentication, cache and origin/body waits
before existing clients' eight-second deadline. Failures identify their phase
without logging credentials or payloads. Simultaneous identical cache misses now
issue independent authorized RPCs; the existing member budget and short response
cache remain. That release used version `94343e0b-1447-495b-98c8-1db492864abe`;
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
push or portal source was deployed with this patch. The repository includes its
read-recovery implementation and synthetic regressions.

## Admin development and release status

Required target: production-like staging for admin and the backend workflows it
controls, with isolated state and safe test destinations. The Pages release pipeline
works, but the environment is **not yet parity-complete**: safe outbound delivery,
monitoring and coordinated backend/schema
promotion remain gaps. Hosted queue reconciliation and the synthetic
schedule/intervening activation/poll activation/vote/retry/close lifecycle passed,
including single-credit behavior. These checks do not qualify the remaining
integrations. See the standing staging rule in [AGENTS](../AGENTS.md#staging-parity-standing-owner-requirement).

- Staging database: `ohrcupagdoilkwhecict`, Free `doji-staging` organization,
  Canada Central. Reconciled schema and synthetic member data; no production
  member identities, passwords or media copied. Do not reset or replay its baseline.
- Hosted staging: `admin-staging.dojipro.com`, employee Edge v8 source (v11 after
  the staging-secret refresh) and separate
  Pages project. Existing employee password/MFA works through a dedicated WorkOS
  application/audience. Gavin and Kedd have explicit staging Super Admin grants;
  other production staff do not gain staging access automatically.
- Local development: `npm run dev:admin:staging` uses the private developer
  gateway and staging employee directory without MFA. Only the owner's token has
  directory access. Its initial expiry is January 13, 2027; non-expiring revocable
  credentials are supported/tested, but no live expiry was changed. Hosted MFA
  remains mandatory. `dev:admin` is a separate offline sample-data preview.
- Local workflow routes: the staging-only registry corrections are deployed (47
  routes). Live home, assigned-work and ownership reads pass; existing routes,
  function/grant fingerprints, identity and workflow flags are unchanged. The
  existing builder includes definition-pinned upgrade/rollback and database/browser
  regression tests. Production promotion still requires hosted acceptance.
- Local resources: development Edge v9 signs
  permission-checked staging media and subscribe-only staging Ably grants. Actual
  signed-image download and seven-channel attachment passed; malformed paths,
  unauthorized objects, direct internal routes and invalid credentials were denied.
  Developer/persona checks run again before releasing signed results. Hosted MFA
  and production were not changed. The actual localhost-to-staging HTTP flow passed;
  isolated browser tests cover connection/reload/switch/revocation. Live Chrome
  acceptance passed employee selection/cancel/switch, reload restoration, realtime
  reconnection and the protected synthetic image from staging storage.
- Verification: local selection/switching, reload, writes/replay/audit and revocation
  passed against disposable PostgreSQL; live staging selection and hosted
  idea review/history/audit, report/business assignment and session restoration passed.
- Enabled staging scope: internal admin workflows with labelled synthetic records.
  The separate Worker/five objects and seven guarded Edge functions now execute
  against staging only. The poll fix is migration 291. Real one-shot alarms passed
  intervening activation, poll-card recreation, vote/identical retry, single credit
  and natural close with the 600-second window. Fixtures and audit are retained.
  Isolated Ably app `eVKl2g` relayed 26 queued synthetic events without failure;
  hosted staff tokens connect. Two-tab testing exposed session-lease HTTP 409s and
  destructive client cleanup. Staging Pages `15f9f0cf-bb6e-49a0-a504-dbc582544e41`
  coordinates requests across tabs and locks locally on unavailable authorization
  reads. Fresh login, simultaneous restoration and synthetic release/reclaim now
  pass with automatic cross-tab counts, without retry/logout. PR #26 subsequently
  merged as `c434440ba685837dc560b4e00756e9f567979c19`; all four PR/main CI jobs passed.
  Automatic staging run `40286223511` deployed that exact commit. Hosted reload,
  two-tab sessions, realtime, protected synthetic media and integrated history passed.
  Real email/push, recurring health/recovery jobs and member signup remain off.
  Business/site/mobile staging are deferred. See the [backend receipt](releases/STAGING_DATABASE_BASELINE_2026-10-14.md#staging-backend-foundation).
- Staging monitoring/email deployed October 27; monitoring connected, email test delivered.
  PR #27 merged as `fc5d4f3`; main CI `40437463837` and automatic admin staging
  deployment `40438805370` passed. Worker `02de84b9-c1be-4b18-afd5-d0f1039d7e01`
  matches its tested bundle and preserves every binding/five namespaces; rollback
  is `63b0feeb-faff-4a6c-a608-0d76867889b3`. Employee Edge v13 and the eighth
  guarded handler, `send-admin-email` v1, are active. Exact employee artifacts passed
  26 synthetic authentication/monitoring checks. Isolated Sentry project `doji-staging`
  (`4512328707342336`) accepted one synthetic event; an approved `event:read` token
  retrieved it with the staging filter. Signed-in Platform Health displayed that
  staging-only issue, fresh database observations and connected staff realtime.
  One branded, clearly labelled test email to the owner's approved mailbox was
  delivered through the guarded handler; sending was then disabled and its gate
  digest verified. Its key is domain-restricted and sending-only; ambiguous operational
  sends retain their staging receipt. Cron, production and push remain unchanged.
  Member/business/provider-owned mail and coordinated backend/schema promotion remain gaps.
  October 30 adds the separately approved hosted/local workflow-health read; see below.
- Release pipeline: PR #15 merged as `e347f4f`; all four exact-head and main
  quality jobs passed. Run `38947921226` automatically deployed Pages
  `2d75152f-260f-409e-8f1b-1e010a865b7d`. Docs-only main run `38953049163`
  correctly skipped packaging/deployment.
- Production promotion: owner-approved run `40134309699` succeeded October 24,
  promoting staging run `40117275364` at `1a9ef6b9ca36735e5986c7ad4890b27b3f8804d7`.
  Main quality run `40115658338` passed all four jobs on attempt 2; the first
  attempt's moderation-history browser flake remains unexplained (20 focused
  repetitions passed unchanged). Pages deployment `2a305892-e114-4844-8320-0f1e7aa650ea`
  retains rollback `09a9d34e-d99c-4373-a511-2ec92ea10487`. No SQL, Edge runtime,
  shared Worker, mobile, business or public-site deployment was included.
- Handoff: Kedd's individual non-expiring, revocable staging token is issued and
  stored in Bitwarden `Doji` / `admin-staging`. The actual local configuration
  loader, authorized directory/session, unauthorized-persona rejection, audit
  attribution and revoked-token rejection passed against staging. His standard-User
  vault invitation was sent after all four PR CI jobs passed; acceptance, owner
  confirmation and read-only project assignment remain pending. No provider keys,
  production access or shared password collections were granted.

Use [local development and promotion](LOCAL_DEVELOPMENT.md#admin-deployment-workflow)
for commands, [security/access](SECURITY_AND_ACCESS.md#shared-development-vault)
for handoff, and [staging acceptance/rollback](releases/STAGING_DATABASE_BASELINE_2026-10-14.md)
for exact artifacts. The [service catalog](SERVICE_CATALOG.md) owns provider purposes
and secret locations; the [system map](SYSTEM_MAP.md) owns source boundaries.

## Remaining gates

Platform-health presentation is deployed to staging only: plain-language
latency/coverage labels and backend/cleanup receipts. Mobile recovery remains prepared
source: actionable submission/feed errors and privacy-filtered submission context.
The maintenance Worker/Edge and workflow observation overlay
were separately deployed and synthetically validated **in staging only** October 30.
Production retention, participation timing, authorization and rewards are unchanged.
Admin, mobile, Worker and maintenance Edge remain separate release boundaries.
See the [staging health receipt](releases/STAGING_DATABASE_BASELINE_2026-10-14.md#october-30-workflow-health-and-maintenance).

Still missing: aggregate signup/session/profile/submission/feed/media success rates,
database resource pressure and device-level notification outcomes.
The gap cards are disclosure, not implemented probes.
Staging now records fixed-size hourly lifecycle/maintenance attempt counts, latest
cleanup receipts and failed phases. Scheduler pruning (success: 30 days; failure:
90 days) passed synthetic hosted checks and is disabled again. Hosted checks covered
33 SQL assertions, real Storage API deletion, leased-work recovery, handler outcomes,
the Worker maintenance wake and data-retaining rollback. Existing bindings, secrets,
unrelated handlers and public function/grant fingerprints were preserved. The daily
wake is code-tested; a full 24-hour hosted recurrence has not yet elapsed. The existing
guarded-media feature was not enabled by this release. The service-only snapshot now
has a staging-enabled employee read bridge and Backend & cleanup view.
The bridge requires the existing verified employee identity/MFA and operations permission;
it adds no browser database credential. Portal runtime `workflowHealthEnabled` defaults
off; staging explicitly enables it. Hosted MFA and localhost impersonation reads
both passed against staging, including database and isolated Sentry. Local access
uses its own private route and revocation checks, not MFA substitution. This manual
staging acceptance package is not a CI promotion artifact. Use main's exact-head
quality checks and subsequent admin staging run for source/release verification;
production promotion remains gated. Legacy/orphan-file reconciliation needs its
own hold-aware preparation. No universal
health/readiness claim, production deletion, mobile build or release is implied.
Dependency installation also reported existing root and Worker high-severity audit
findings; isolate and test their dependency fixes before production, without forced upgrades.

| Before doing this | Required evidence/approval |
| --- | --- |
| Merge source | All four exact-head CI jobs and all 17 coverage budgets; preserve unrelated dirty work |
| Promote admin production | Verified staging artifact, current capacity/bindings, retained rollback, owner environment approval and hosted acceptance |
| Build/release mobile | Included capacity, unused version/build allocation, exact candidate tests, source-map verification and physical-device acceptance |
| Open business admission or enable mail/realtime/campaigns/billing | Separate policy/cost/isolation review and retaining rollback |
| Enable health events | Approved shared impact/capacity plan; no polling substitute |
| Add email/SMS MFA | Separate security policy; email proof is not authenticator MFA, SMS not provisioned |
| Reconstruct schema | Reconcile deployed overlays with migration history; raw migrations alone are not live-schema parity |
| Grant developer access | Named employee/vendor access, scoped revocable credential and owner-approved vault handoff |
| Claim root cause, security or capacity | Fresh correlated evidence; tests, old audits and models are not production qualification |

## Evidence and maintenance

[Release index](releases/README.md) retains artifact identities, rollback and dated
acceptance; [test handoff](TEST_SUITE_HANDOFF.md) defines current gates. Historical
notes are not commands to rerun. Retained `website/` controllers are active React
dependencies, not disposable legacy code. Keep current guidance here, service/source
ownership in their guides, and compact release evidence in the existing records.
A merge may automatically deploy admin staging; it does not release other systems
or approve production promotion.
