# Current state and handoff gaps

Updated November 9, 2026. This separates source, recorded deployments and owner
device reports; it is not a fresh probe of every production service. Owner: Gavin
Fahey. Repository access does not authorize cloud changes, spending or member actions.

## Current surfaces

The comment paging SQL/index is installed and read-qualified in Staging only;
existing reads/writes remain unchanged. Private installation/rollback evidence is
retained outside Git under the November 9 comment-pages staging record. The owned
offline database tests 100K comments, bidirectional cursors, permissions and index
plans; this does not establish native or hosted 100K performance.
The candidate native adapter preserves one newest-first list with multiple inline
reply threads and no Show latest control. It retains three 20-root pages and three
10-reply pages per retained expanded root and evicts only offscreen edges. The
backtrack-cache follow-up is local source: it restores recent root pages synchronously
without a loading spinner, with 20-page / 400-row / 2 MiB serialized-accounting caps
and a two-minute original-read age limit. Refresh, writes and account/privacy changes
invalidate reuse; only a cache miss reads the discarded cursor again.
Offscreen reply observers stop reads;
closing/evicting a thread discards its cache. Head refresh is fenced against scroll
movement; confirmed hearts/edits remain row-local. Activation requires the exact
Staging backend and development/staging release channel; production keeps the old
reader. Android Dev verified the 121-comment fixture opens newest-first, expands
inline and pages down/back to the newest roots. This is functional acceptance, not
a frame-rate benchmark. The owner accepted the inline iPhone Dev layout, then
requested cached backtracking; this follow-up still needs device acceptance.
Installed Staging build 7 is unchanged. Exact-head CI,
iPhone/Android frame qualification and owner acceptance remain required.

The Staging build 7 follow-up is source-only: comment roots now match descending
keyset pagination, unchanged rows are memoized, and the loading footer retains its
height. Loading-time follow-up prepares one page ahead of the viewport and restores
the native list's default render window; fast-scroll device acceptance is pending.
Request-list and notification Accept/Decline controls are row-owned;
confirmed responses update current caches without whole-list rollback. Synthetic
pagination/concurrency tests do not qualify native scrolling. Exact-head CI and
iOS/Android acceptance remain required; production builds and search SQL are held.

Profile action-bar follow-up is source-only after the owner's Staging build 6 report:
resolved labels/menu survive background read errors with commands disabled and
explicit retry; friendship/privacy prefetch also runs on cached-profile entry.
Unknown actions use a fixed-size loading button rather than the gray placeholder.
Exact-head CI and a new native staging artifact/device check remain required;
existing installed builds and production are unchanged by this correction.
Locked text-only task/format cards also have a source-only text-shaped preview;
photo/poll and media-required previews retain their existing presentation. Native
visual acceptance remains required; no hidden content is fetched for placeholders.

Social feedback follow-up is source preparation, not installed in Staging build 5:
comment/poll-answer heart read ordering and targeted rollback, viewer-keyed profile
warming and identity-safe friendship actions, plus public-name search and local
query history. The search client/SQL work was not included in PR #77/build 5.
The isolated SQL fixture verifies search, permissions, indexing and exact rollback;
hosted search installation, exact-head CI and new iOS/Android builds remain gated.
Native smoothness and performance are not established by synthetic race tests.
No production change is included in this follow-up.

Feed smoothness follow-up is source preparation, not deployed: mounted image
retention with two-card lookahead, stale-reaction read fencing and adjacent
authorized feed warming (including a just-confirmed own post). Native scroll/reopen,
rapid reaction and post-to-tab-switch acceptance on both platforms remains required;
synthetic races cannot establish frame-time or network performance. Staging's
Free-tier image transformation difference remains explicit. Production is unchanged.

Mobile performance hardening is source preparation, not deployed. Query-family
refresh scheduling now isolates unrelated in-flight waits while retaining hint
coalescing, per-query single-flight reads and teardown fencing. Disk restoration
waits for the accepted account and discards reads spanning an identity change,
including a switch back to the original account. New head-post media preparation
has a per-feed native-work limit, arrival-time fallback and identity/removal fences.
Profile-setting recovery preserves uncertain patches/keys across navigation and
fences account changes; failed theme ownership reads no longer trigger corrections.
These changes still require exact-head CI and release-build staging qualification.
The performance targets and device/request acceptance matrix are in
[test qualification](TEST_SUITE_HANDOFF.md#mobile-performance-qualification).
Real-device baselines, remaining request/media fixes, exact-head CI and staging
artifact qualification remain pending; no production performance claim follows
from the synthetic regressions.

Mobile staging configuration is merged; Android and iPhone artifacts exist, but native
workflow qualification is unfinished:
distinct Development/Staging identities and schemes, staging-only binding checks,
environment-aware Android diagnostics, and default-off staging push/reporting.
Production app config is preserved. The isolated Firebase Spark Android clients,
Apple development/staging App IDs and main-only GitHub approval environment now exist. EAS
development/preview client destinations were verified; production values remain
unchanged. The approved organization-wide Sentry upload token is stored as an EAS
secret only in development/preview. Android Staging build 2 from `7513c6d` is
installed on the emulator; its identity/signature matched and cold startup passed
with Metro stopped. Staging source-map uploads passed on both platforms; captured
device-error symbolication and broader workflow qualification remain pending. No push-provider credential
was created. Separate Android development/staging
signing keys are now bound in EAS; production signing metadata is unchanged.
The approved API 36 Google Play emulator has both Doji Dev and Doji Staging installed.
Local compilation passed with JDK 17 and software graphics; Doji Dev loads through
loopback Metro and reaches sign-in. Local corrections use typed tab destinations
for appearance/shop fallback and friend-accepted routing; full typechecking now
passes with generated Expo routes present. Profile setup maps the known consent
rejection to safe actionable copy and distinguishes a confirmed save from failed
follow-up loading. These corrections merged in PR #55 as `03a050d` after all
exact-head checks passed. PR #56's local-development launcher merged as `7513c6d`;
main quality run `42169655623` passed all four jobs and the exact-source cloud
candidate check passed. The owner's `D:/ChallengeApp/DoIt` checkout follows
reviewed main, preserving unrelated edits and the recovery stash. Cloud builds use
a separate clean checkout, not those edits.
The local-only launcher `npm run dev:mobile` uses external staging client settings;
`--lan` serves the owner's iPhone and emulator. Android save/Fast Refresh and restoration
were visually verified without reload; the owner confirmed the same change and
restoration on the physical iPhone. The obsolete generated production-identity
Android directory is retained intact outside the repo at
`D:/ChallengeApp/DoIt-android-preserved-20261105`; no production build was changed.
iPhone Dev build 1 and Staging build 2 completed from `7513c6d`. Their embedded
profiles permit only the owner's confirmed iPhone, not the TestFlight tester group.
The owner installed both and confirmed repeated Staging startup with Metro stopped.
Installation/startup and Dev Fast Refresh passed; subsequent account/photo acceptance
and its countdown defect are recorded below.
All three separately approved builds completed within included credits ($5 total,
$33 remaining at the final read). No build retry or production release occurred.
See the [build and device receipt](releases/README.md#november-6-mobile-development-and-staging-builds).
The backend-created `mobile-one@test.invalid` lacked signup consent and profile
creation correctly rejected it. At the owner's request, that exact Auth identity
was deleted (absence verified), and only Doji Dev's emulator data was cleared.
There was no profile or owned media; `mobile-two@test.invalid` and baseline fixtures
were preserved. Staging signup now accepts ordinary test email addresses without
email confirmation, matching the verified production signup settings. The owner
confirmed normal signup works in the installed iPhone Staging app after the
November 6 correction. Before User Created calls the original minimum-age hook
directly; the obsolete alias wrapper is retained but unbound. Age/legal function
definitions and grants, all other Auth settings and production were unchanged.
Use normal in-app signup and atomic profile creation, not fabricated consent or
another Auth-only fixture. The owner confirmed signup/profile creation, session
restoration and sign-out/sign-in on iPhone and Android Staging. A staging-wide photo
Doji produced one post/completion and 50 XP per account, then closed naturally after
600 seconds. The iPhone reported a stuck 10:00 display. PR #58 merged the full
deadline display and signup-day grace correction as `906006d`; main quality run
`42284145134` passed all four jobs. The separately approved trigger-only correction
is deployed in staging, with 13 hosted rollback-fixture assertions passing and
unchanged unrelated contracts. No regression-fixture accounts/events remain.
Staging build 3 completed on both platforms from that exact source; signatures,
staging identities and Sentry uploads passed. The owner confirmed iPhone startup
and retained session; Android update/startup retained its account and feed.
The pair used $3 of included credits ($30 remaining at readback), with existing
signing; push/reporting remain off. Production is unchanged.
In the build 3 regression, the owner confirmed the iPhone pre-live countdown
decreased and caught up after background return without reload, and reported the
Android countdown working. Natural activation/600-second close preserved both
signup-day deadlines. The first-day banner correctly has no timer. In response
to the final in-challenge countdown/background-return check, the owner confirmed
everything looked good, closing this countdown acceptance. See the
[device test and correction scope](releases/README.md#november-6-mobile-doji-acceptance-and-deadline-preparation).
Email-change/recovery recipient safety is still unqualified; do not test those
mail paths with arbitrary destinations. See the [configuration receipt](releases/README.md#november-6-staging-signup-parity-correction).
The signed-in Resend check confirmed available Free allowance with pay-as-you-go
off. The separately approved sending-only staging Auth key was created and saved
in staging Supabase SMTP; its stored-password state and smtp.resend.com:465 were
verified. Signup auto-confirmation requires no confirmation mail. Other Auth mail
delivery is not qualified by the successful signup.
Passwords/signing backups and the removal receipt are restricted outside Git.
Native onboarding and workflow acceptance are not established by API tests.
A read-only exact-main quality preflight does not authorize cloud builds. The
protected build runner, hosted parity and remaining workflow acceptance remain gated. Staging's
Free-tier media path has transforms off and is not production transform parity.
See the [dependency and release checklist](MOBILE_STAGING.md).

Monitoring follow-up is in local preparation, not deployed: bounded provider
acknowledgements and persisted notification attempts distinguish accepted,
suppressed, disabled, rejected and unconfirmed outcomes. Acceptance is not inbox
delivery. Uncertain sends retain their deduplication claim; there is no automatic
resend.

Additional monitoring preparation merged in PR #46 as `6871182` after exact-head
application, coverage, database, web-migration and security checks passed. Its separately approved
staging Worker/SQL/Edge reporting path is enabled and verified at `6632592` after
the workerd transport correction passed all four CI jobs and security. See the
[acceptance and rollback](releases/README.md#november-4-staging-monitor-reporting).
Staging employee/development read bridges and runtimes are installed and verified;
their history/device-read flags are enabled. Mobile capture remains off. Its staging
ingestion endpoint is deployed and disabled after hosted real-Auth qualification.
Two synthetic accounts exercised all 60 platform/category pairs, identical replay,
rate limiting and unauthorized/malformed rejection. The bounded server projection
matched those counts. Temporary Email sign-in and Edge/SQL capture were restored off;
public signup/anonymous sign-in stayed off. Accounts and synthetic counts were removed,
with original identities/contracts and unrelated code/secret digests verified unchanged.
This is endpoint acceptance, not a physical-device or enabled-count portal check; see the
[ingestion receipt](releases/README.md#november-5-staging-mobile-ingestion-qualification).
PR #47's safe release-stage diagnostics merged
as `8249743`; main CI and automatic staging run `41963922156` passed. Exact package,
public identity and rollback receipt matched, and signed-in timestamps advanced
naturally. This clears the current staging release gate without establishing the
cause of earlier run `41953768497`'s post-upload failure. Do not rerun or promote
that historical failed run. See the [current receipt](releases/README.md#november-4-staging-sentry-history).
The default-off Worker writer now
connects fixed observations to retained incident history through a protected Edge
route; reporting never retries or changes alert admission. A separate employee
Operations/MFA bridge returns the latest 25 incidents in cached-health detail when
`monitorHistoryEnabled` is enabled. Its server boundary projects only fixed incident
fields and rejects duplicate monitors, inconsistent outcomes and invalid timelines;
disabled capture does not expose retained rows. The local staging-persona bridge and bounded
Monitor incidents view are connected in source, with disabled/unavailable/stale
states, source timestamps and superseded-versus-recovered outcomes. They reuse
the existing health read/reconciliation, with no extra polling or provider calls.
Synthetic SQL tests cover replay/order, permissions, transitions,
bounded pages and retaining rollback, including the employee bridge after all 291
migrations; local parity tests cover revoked credentials and retaining rollback.
Browser tests cover pagination, permissions and in-place expiry without requests.
Backend evidence/coverage tabs share the existing deferred bundle; package limits
remain unchanged and pass. The prior history preparation passed all 17 coverage gates (4,956
Jest tests, 63 boundary suites, 845 browser checks; one browser check skipped),
331 web unit tests and 11 Operations browser checks. These are worktree results,
not isolated-commit CI or hosted acceptance. The one-shot `scripts/monitor-check.mts`
probe uses a separate read-only secret and fails on stale/missing reports, bad
clocks and transport failures. The HTTP endpoint now applies the same freshness
policy, returning 503 for stale, missing, disabled or unhealthy evidence. Sentry
monitor `10858429` is now enabled for staging with natural authenticated HTTP 200
checks. Support supplied a free seat while correcting its entitlement bug; billing
shows no added spend, with the temporary credit ending November 28. Recheck that
entitlement before expiry; no paid replacement is authorized. The approved
assertion-only drills recovered automatically and owner-only alert `6292687`
recorded four triggers. Gmail verification found only recovery notices at 18:51
and 21:11 Mountain, one per drill. Sentry support confirmed on November 5 that both
failure emails were queued, then intentionally filtered after recovery before
provider handoff. The owner accepted this designed behavior and closed the
investigation; no threshold changes or further drills are required. Short incidents
can therefore have retained history and a recovery email without a failure email.
See the [support closeout](releases/README.md#november-5-sentry-notification-closeout).
The staging read key was rotated and the old key rejected.
Production changes and extra spending remain excluded. The separately approved
Worker reporting path is deployed and natural staging observations advanced
without manual collection; invalid credentials/methods were rejected and existing
database contracts, ten Edge code hashes and 33 secret digests were preserved.
Manual redirects retain 204-only acceptance; the real-workerd regression is required
in CI. This is staging backend acceptance, not complete health or alert delivery.

Mobile counters cover submission/upload/receipt/feed phases and fixed profile,
Doji, feed, social and economy read attempts. They are memory-only, account-fenced,
capped and excluded from Sentry context; retries do not multiply read completions.
Avatar upload outcomes and default-off foreground batch transport/ingestion are
prepared. The independent mobile Edge package verifies the project member bearer;
private SQL validates fixed counts, replay/admission fences and bounded hourly
storage. The prepared Operations/MFA and staging-persona read bridges project at
most 60 device categories across 24 receipt-hour buckets. The Device reports tab
shares existing health reconciliation, separates disabled/unavailable/empty/stale
reads, and labels capped counts without inventing success rates or unique-user totals.
`mobileWorkflowReadsEnabled` and the development read flag default off, independently
of ingestion and binary gates. Synthetic endpoint, lifecycle and SQL/retaining-rollback
tests and exact-head CI passed. Staging SQL/read-runtime acceptance passed with
synthetic fixtures rolled back, unchanged prior contracts and no residual fixture
identities or count rows. Hosted incident timestamps advanced without refresh and
the session persisted; Device reports correctly showed disabled capture. Sentry's
external checks now populate independent-monitor history in staging through PR #48's
tested importer, merged as `ac19f50`. Source timestamps advanced naturally and the
hosted view changed to measured checks passed. The second assertion-only drill
produced retained failure history and recovery at 21:11:44 Mountain; fresh healthy
reports did not erase that incident. Its display labels describe a failed check
without claiming the monitor stopped reporting. Mobile capture, ingestion and
binary release are still gated.
The local ingestion qualification now composes the real HTTP handler, private SQL
and employee projection across all 60 fixed platform/category pairs, with duplicate,
rate, authorization and retaining-disable checks. It runs in the existing isolated
database CI job; synthetic authentication does not qualify hosted ingestion or a
mobile binary. The EAS development/staging/preview profiles now select isolated
staging bindings, but no native artifact is qualified by that source change.
The mobile preinstall guard now rejects enabled reporting with mixed database,
command/read gateway or app-environment bindings, including non-production profiles.
It changes no default flags and does not itself qualify a staging mobile build.
The enabled staging importer reuses the existing collector with a two-second total
budget, two exact provider reads and at most five ordered observation writes. It
retains provider check IDs/timestamps, rejects mixed environments and schema drift,
and never turns a successful fetch or missing result into fresh health. Its Edge
gate defaults off and rejects production. The existing issue-read token receives
HTTP 403 for check results; the approved separate Alerts: Read integration is created
and its credential is installed only in protected staging Edge configuration. Live read-only
configuration verification matched the staging project, endpoint and environment.
Checks with empty environment labels require that exact verified monitor binding;
missing or conflicting configuration fails closed. No SQL, Worker, timer or
alert-routing change is part of this importer.
Auth outcomes, authoritative answer/reward evidence, poll readiness, storage
inventory and phone-delivery evidence remain unfinished.
A default-off, service-only `inspect_doji_readiness_v1` probe is now prepared for
one exact occurrence: poll options, a live poll's shared card and server window
consistency. Missing scheduling-time cards are expected, not failures. It performs
no activation, repair or member write and has bounded option reads. Collector
selection, cached portal presentation and hosted qualification are not connected
yet; this preparation does not close the readiness coverage gap.
These preparations do not establish complete health coverage. Production flags,
mobile artifacts, services, spending and real sends remain unchanged.

Cached admin health and its employee-session correction are merged and deployed
to staging through PRs #39/#40; required PR/main checks and automatic Pages releases
passed. SQL/runtime readback matched. Fresh hosted sign-in, two natural update
cycles, global status outside Operations and browser-offline recovery passed
without reload or reauthentication. Old health broadcasts/signing are disabled.
Exact release/rollback and acceptance evidence is in the
[staging receipt](releases/README.md#november-3-staging-cached-health).
The default-off `employee_health_snapshot_v1` cache and collector sidecar provide
one bounded delivery/workflow observation, fixed source
timestamps, permission-checked summary/detail reads and retaining rollback. They
are connected in source to employee HTTP/local impersonation and a portal-wide
cached status chip and Operations reads. Staging database/local/UI/runtime gates are on;
production cache SQL, collector and employee runtime are deployed and verified;
production Pages is deployed at `9bf78fe` with cached reads enabled and broadcasts
disabled. Production natural updates, global status, persistent session and browser
Offline/recovery passed; see the
[production receipt](releases/README.md#november-3-production-cached-health).
Local tests cover permissions, revocation, idle expiry, cache rollback and visible/online
refresh, including recovery after a failed first read. The full offline coverage
run passed all 17 thresholds (4,949 Jest tests, 61 boundary suites and 845 browser
checks). Final release packaging passes the unchanged bundle-size budgets, including
two source-SHA builds with identical assets and both packaged browser checks.
Hosted sign-in and natural automatic updates passed. Sentry retains its
bounded, per-runtime on-demand cache, not a new background collector. Durable incident history/reconciliation,
missing workflow measurements and independent monitor heartbeat remain unfinished.
The owner requires no additional spending; production health broadcasts
are not approved. Preserve the staging-qualified, broadcast-free cache design.
Production package policy selects cached health with broadcasts disabled. Pages
promotion does not install its separately qualified SQL/runtime prerequisites.
The release guard pins the reviewed predecessor's source, deployment and full
flag set; unrelated drift remains an error. The corrected protected promotion
succeeded after exact-head PR/main checks and hosted staging acceptance.

Admin health reliability source merged in PR #35 (`19edbda`): the bounded Sentry
read now distinguishes provider timeout/HTTP/network/invalid-response failures,
does not fabricate observation times, and supports explicit recovery. React adds
manual/stale-tab refresh and a server-authorized health-event listener without
polling. Provider, browser and isolated database checks passed. Staging's additive
SQL, employee/development runtimes and health gates were deployed to staging;
that release did not change production. The November 2 Pages release deployed
`36dcafa` through the normal staging pipeline;
signed-in Operations advanced across two natural collector cycles without refresh.
The additional workflow measurements listed below remain unfinished. This is not
complete platform-health coverage.
Automatic-update qualification must leave Operations open across multiple real
collector cycles and verify new timestamps without clicks, disconnect/reattach
recovery and denied access. Staging's existing health check runs once a minute;
November 3 replaces its health broadcasts with cached reads at no additional spend.
Real email/push remain disabled. The earlier event-based automatic updates
passed across real collector cycles locally and on hosted staging. Synthetic
reconnect/permission checks passed. The replacement cache passed a hosted Chrome
network-offline/recovery drill November 3; physical device/network faults were not simulated.
See the [staging release and rollback](releases/README.md#november-2-staging-automatic-health-updates).

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
| Mobile source | Expo 57.0.32 patch alignment in source; historical alert-recovery builds recorded above | No new mobile artifact or device qualification from the dependency update |
| Update policy | Owner requested Android 1.0.11 / iOS 1.0.10 minimums | Live policy and store availability were not rechecked in this admin release; do not replay October 7 enforcement |
| Admin production | React/Vite/MUI, employee WorkOS + MFA; sign-out recovery recorded as runtime v24 | Member Supabase Auth and mobile sessions are separate |
| Admin staging | Same frontend; shared employee identity, separate WorkOS application, database, sessions and grants | Hosted login/MFA and representative workflows verified; local impersonation is not shipped to hosted sites |
| Business | Owned React/MUI login, independent WorkOS realm; owner completed application, approval, QR MFA, branding and workspace | Test account retained; public admission, campaigns/billing and realtime remain gated |
| Business email | Branded renderer/runtime deployed | Automatic capture/sending/wakeup remain off; no uncertain-mail auto-resend |
| Public site | Next.js static export with retained legal/safety controllers | No Next server; safety uses its own private receipt/status contracts |
| Shared email branding | Shared/employee renderer changes prepared | Shared/member deployment and provider-owned templates remain separate |
| Health | Bounded cached delivery/workflow and Sentry reads enabled in staging and production | Health broadcasts off; seven workflow gaps remain; not whole-platform uptime or crash-free-session measurement |

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

Platform-health presentation is deployed to production October 30 from verified
staging source `ef2cc4b` through owner-approved run `41125552206`. Session restoration,
staff realtime and fresh delivery/Sentry reads passed. The separately approved
backend release completed October 31: workflow observations, the employee read
bridge and scheduler-log retention are enabled in production. Backend & cleanup
now returns actual measurements. The initial bounded scan removed 156,264
successful runs older than 30 days and 15 failed runs older than 90 days; the
failure records were archived first. It completed with no remaining eligible logs
or recorded maintenance failures. Existing media eligibility/holds remain unchanged.
See the [backend release and rollback](releases/README.md#october-31-backend-monitoring-and-retention).
Deployment and rollback are in the [release receipt](releases/README.md#october-30-admin-health-promotion).
Mobile recovery remains next-build source: actionable submission/feed errors and
privacy-filtered submission context. PR #33 merged as `bf2cca9` after all four
exact-head checks passed. Mutation diagnostics add allowlisted action names and
typed comment-validation rejection reasons; this does not establish the cause of
the older `mutation.other` event or change an installed build.
The maintenance Worker/Edge and workflow observation overlay were qualified in
staging October 30, including the automatic daily wake October 31, before the
separate production release. Participation timing, member authorization and rewards
are unchanged; all 435 pre-existing public/identity function definitions and grants
were preserved. No mobile build or store submission accompanied this release.
Admin, mobile, Worker and maintenance Edge remain separate release boundaries.
See the [staging health receipt](releases/STAGING_DATABASE_BASELINE_2026-10-14.md#october-30-workflow-health-and-maintenance).

Still missing: aggregate signup/session/profile/submission/feed/media success rates,
database resource pressure and device-level notification outcomes.
The gap cards are disclosure, not implemented probes.
Staging and production record fixed-size hourly lifecycle/maintenance attempt counts,
latest cleanup receipts and failed phases. Scheduler pruning (success: 30 days;
failure: 90 days) passed synthetic hosted checks and is disabled again in staging.
Hosted checks covered
33 SQL assertions, real Storage API deletion, leased-work recovery, handler outcomes,
the Worker maintenance wake and data-retaining rollback. Existing bindings, secrets,
unrelated handlers and public function/grant fingerprints were preserved. The daily
wake passed its hosted 24-hour check October 31 at 16:54:54 UTC: one automatic
maintenance attempt completed in 2,973 ms, with scheduler pruning still disabled.
The existing guarded-media feature was not enabled by this release. The service-only
snapshot has an enabled employee read bridge and Backend & cleanup view in both
environments; local impersonation remains staging-only.
The bridge requires the existing verified employee identity/MFA and operations permission;
it adds no browser database credential. Portal runtime `workflowHealthEnabled` defaults
off; qualified deployment packages explicitly enable it. Hosted MFA and localhost
impersonation reads both passed against staging, including database and isolated Sentry. Local access
uses its own private route and revocation checks, not MFA substitution. This manual
staging acceptance package is not a CI promotion artifact. Use main's exact-head
quality checks and subsequent admin staging run for Pages source/release verification.
Legacy/orphan-file reconciliation needs its own hold-aware preparation. No universal
health/readiness claim or additional deletion/mobile release is implied.
Production dependency preflight found separate tooling blockers. The tested
security patch merged as `510a9ee`; all four PR/main quality jobs passed and
automatic staging run `41127321420` succeeded. It pins Wrangler 4.156.0 (clean audit), updates the URI decoder to
0.5.1 with a distinct-malformed-run regression, and patches supported root
dependencies without changing Expo/React Native versions. The November 5 Expo
57.0.32 alignment includes CLI 57.0.33, which removes its Zod production dependency;
the fresh root audit reports zero high/critical findings, with nine moderate and
ten low findings remaining. No forced override or downgrade was used. See the
[patch record](releases/README.md#november-5-expo-compatibility-alignment).
Production qualification and native acceptance remain separate from source patches.

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
