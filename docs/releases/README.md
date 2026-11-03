# Release and investigation records

These records retain exact artifact, rollback, incident and acceptance evidence.
They are not current setup instructions or authorization to rerun old operations.
Use [current state](../CURRENT_STATE_AND_GAPS.md) and the [handbook](../README.md) first.
Private artifacts remain ignored; source history is recoverable through Git.

## November 3 staging cached health

PR #39 merged as `3d3ebed54f18a18a865507a6b529a480c2ed98e6` after application,
coverage, database, web-migration and security passed on exact head `85967cc`.
The unchanged bundle budgets passed: 167.7 KiB sign-in and 497.6 KiB total gzip;
two source-SHA packages had identical assets and passed packaged browser checks.
The approved staging SQL passed a rollback rehearsal and preserved existing
member/portal function fingerprints. Only `employee-portal-v2`, `admin-development`
and `operational-health` were deployed; downloaded source matched the candidates.
Main quality run `41683775577` passed. Automatic staging run `41686332317`
deployed Pages `4f954aae-f030-4d14-aaf1-44402145ef3f`; public source/config and
the retained receipt match. Pages rollback is `4c155283-e5a5-4dda-b556-76e212df9363`.
The cache is enabled; old SQL health broadcasts and runtime signing are disabled.
The first retained observation was 17:45:46 UTC, one 1,688-byte row; member/business
reads remain denied. Hosted acceptance then exposed a missing restricted SQL
allowlist entry; the unavailable read removed the session. Hosted cache reads
were disabled without re-enabling broadcasts or changing collection. The composed
runtime regression reproduces both the first-read failure and subsequent logout.
PR #40 passed all required/security checks and merged as
`7195f7deabd6ccfca5031909509b931d8087f39f` from exact head `b84c371`.
Its three-file correction adds the missing exact SQL route and returns cache
unavailability inside the verified session lease. The composed test covers both
reads, injected failure, session retention, recovery and explicit logout.
Only the corrected staging employee runtime was deployed and matched downloaded
source; hosted cache reads were re-enabled with unrelated secrets unchanged.
Rollback and exact source/hash receipts are retained with the private evidence
below. Main quality run `41693140828` and automatic staging run `41695990704`
passed. Pages `7c357ed7-492e-49b0-9fc0-bf361bfeb852` serves exact source `7195f7d`;
rollback is `4f954aae-f030-4d14-aaf1-44402145ef3f`. Public release and retained receipt match.
Hosted employee sign-in stayed active; delivery observations advanced 11:55:44,
11:56:45 and 11:57:46 AM Mountain on November 3 without refresh. Sentry advanced
11:55:45, 11:56:57 and 11:57:58. Chrome's tab-level Network Offline mode showed
`Health: offline` and retained the prior timestamps. Restoring No throttling
automatically recovered delivery 11:59:45 and Sentry 12:00:42 without reload/MFA.
The global status remained on Overview, and its shortcut reopened Operations.
This was browser-level network emulation, not a physical network outage or a
synthetic DOM event. Original browser network settings were restored.
Private originals, configuration inverse, candidate/readback and database receipts
are retained under `%LOCALAPPDATA%/Doji/staging-backend/2026-11-03-cache`.
No production, Worker, mobile, email/push, retention or access changes were made.
Rollback disables snapshot reads/capture, restores the captured runtime/config
pair and Pages artifact separately, and retains observations; never reset tables.

## November 2 staging automatic health updates

PR #35 merged as `19edbda49862fb8edcb69d11c5928c3e5140262d` after all four required
quality jobs and GitGuardian passed on exact head `5b9250b`. Production was not
released. Main's repeated idle-expiry browser failure was reproduced as a test
race: unfinished initial reads renewed idle time after its simulated clock jump.
PR #36 (`5ebc0b8`) waits for those reads before advancing the clock; all four PR
checks passed, as did 30 local repetitions. It changes no runtime behavior.
The subsequent main run exposed request-count baselines taken before overview or
health-history reads settled. PR #37 awaits loaded data and tooltip exit without
relaxing request, authorization or accessibility assertions. Local repeated checks
passed 30 layout and 45 Operations tests. PR #37 merged as `36dcafa` after all
four checks and security passed; main quality run `41563923472` then passed.
Automatic staging run `41565454788` deployed Pages
`4c155283-e5a5-4dda-b556-76e212df9363`, verified at source
`36dcafae46bc3aff637aad9e670b2ff4822d2ded` by the public release marker and receipt.
Pages rollback is `f61229d6-c6fb-4cb7-8dd0-94598cb0d6dd`; configuration hash is
`459f643d27aa3e6bd0a2a8b2f1289a10febc7ca23234bf5dccb1e617cc16ad3a`.
Staging-only `employee_health_feed_v1` and
`admin_development_health_events_v1` overlays preserve all 445 pre-existing
public/identity/development function definitions and grants, policies, jobs and
employee realm. The private development registry now has 48 routes. Additive SQL
and its inverse passed an outer-transaction rollback rehearsal before installation.

Downloaded employee/development artifacts match the tested packages. Their provider
source digests are `84da192e9706ba0ad2dc41bb58adffc95580afdc0c3a11588b2e4d9a447e2efd`
and `7175b27c52721f46b9c397eca2c2a46db09b3362cb13c52f6cf1abec3180c5ec` respectively.
Only those two handlers changed; the collector already contained the gated sidecar.
Secret updates advanced displayed versions to employee 25, development 22 and
collector 15 without changing the collector's code. The database feed, employee
health-event policy, collector flag and development flag are enabled in staging.
All unrelated secret digests remain unchanged; email and scheduler pruning remain off.

The staging Worker schedule is `*/1 * * * *`. Version
`541f3b8b-5a70-4526-987c-a37f011c95ba`, settings, bindings and all five Durable
Objects were preserved. This enables existing monitoring, not a second challenge
clock. Supabase/Cloudflare capacity was checked; the existing Ably Standard plan
is unchanged, with owner approval for at most $5/month incremental feed usage.
Local connection and server gate are verified. With Operations visible and no
click/reload, delivery observations advanced from 16:32:10 to 16:37:52 and 16:38:49
Mountain time. Sentry refreshed at 16:37:52 and retained its bounded 60-second cache.
The first delivery/history hints published on their first attempt without push
payloads; no overdue outbox rows or lock waits were present. Ably showed two active
connections and seven channels, versus six before enabling the feed. Hosted Pages
restored the employee session and displayed the server-enabled, connected feed.
Without clicks or reloads, delivery timestamps advanced 19:25:47 → 19:26:47 →
19:27:48 Mountain time; Sentry advanced 19:25:34 → 19:26:47 → 19:27:48.
Coverage showed current backend, delivery and Sentry observations. The bounded
queue check found 20 latest health events published on their first attempt, no
push payloads, no overdue work and no lock waits. A real network-disconnection
drill remains untested; synthetic reconnection and permission tests are separate.
Connected transport alone is not freshness, and the seven unmeasured workflow
areas remain explicit gaps rather than implied healthy services.
The post-deployment Ably check showed two connections, seven channels and 171
inbound/176 outbound messages this month, consistent with the bounded feed.

Private exact originals, configuration inverses, source readbacks and database
receipts are retained at `%LOCALAPPDATA%/Doji/staging-backend/2026-11-02-health`.
Rollback: restore the empty staging schedule, disable the database/Edge feed gates,
restore the captured employee and development packages/config, then apply the
development health-event inverse before the employee feed inverse. Retain existing
outbox/audit evidence and the five namespaces; never reset staging or use production
credentials. Restore Pages separately through its release receipt. No member auth,
participation timing, rewards, push, retention policy or mobile artifact changed.

## October 31 backend monitoring and retention

Owner-approved production release followed the automatic staging daily-wake check
at 16:54:54 UTC. Existing Cloudflare/Supabase capacity was verified; no new vendor,
plan or resource class was added. Worker `129aeefe-9440-43ff-a961-8eb74a9bbafe`
preserves the gateway, all five Durable Object namespaces, bindings, schedules and
unrelated modules. Its main module SHA-256 is
`4505053a1491daee826332ff59443ad7b985781f83b5a1b97475319ae120032a`.

Only `orchestrate-doji`, `run-data-maintenance` and the separately packaged
`employee-portal-v2` health bridge were deployed. Downloaded artifacts matched
tested candidates; unrelated functions and prior secret digests were preserved.
The employee v26 source hash is
`6aa2d095cddea234301cfe52df06ce2c74f814d4c4ab41a578aa983eb7489e27`;
existing production authentication/session modules were not replaced with staging
ones. Exact-artifact checks passed: 82 Edge tests, five Worker scheduling cases,
25 employee health/SQL tests and six adapter authorization cases.

The two reviewed workflow-health overlays added five functions; all 435 prior
public/identity function definitions and grants remained identical. Observation
and scheduler-retention gates are enabled. The initial scan completed at
17:48:20 UTC, deleting 156,264 successful scheduler runs older than 30 days and
15 failed runs older than 90 days. The 15 failures were exported before deletion.
There were zero eligible old rows, zero unfinished runs and no lock waits at the
final check. Recent rows, existing jobs, holds and the next Doji time were preserved.
347 continuing batches and one successful final attempt were recorded, with no
failed maintenance attempts. Eight expired rate-limit buckets were also removed;
no media or push-endpoint removal was recorded. The single successful close
observation is the approved nonexistent-event no-op used to start maintenance,
not a real Doji or member completion. Hosted admin session restoration, connected
realtime, delivery/Sentry reads and the new backend snapshot passed.

Private originals, candidate manifests, failure exports and receipts are retained
outside Git at `%LOCALAPPDATA%/Doji/production-backend/2026-10-31` and
`2026-10-30-readiness`. Rollback disables observations/retention using the retaining
overlay inverses and restores captured Edge packages before Worker
`5d44589a-b0c0-4734-bfaf-08afccada948`; do not drop measurements/holds or recreate
Durable Objects. Restore the captured employee package independently if needed.
Rollback cannot restore deleted scheduler logs; only the archived failures have
an export. Existing guarded-media deletion was not enabled, and no challenge
timing, rewards, member auth, push, Pages or mobile release was included.

Mobile diagnostics PR #33 merged as `bf2cca9` after all four required checks in
run `41223928970` passed. This is next-build source, not an installed app update.

## October 30 admin health promotion

Owner-approved production run `41125552206` promoted the exact admin package from
staging run `41118118551`, source `ef2cc4bfaa278b4b5d2fc80f1efd5554226b67f0`, without
rebuilding it. Deployment `c21bb73d-ec04-4784-83d8-34cffb590936` passed canonical
release identity, asset/security-header, environment-binding and anonymous/CORS
checks. Rollback Pages deployment is `2a305892-e114-4844-8320-0f1e7aa650ea`.
Signed-in session restoration, connected staff realtime, plain-language health
labels and fresh production delivery/Sentry readings passed. The new Backend &
cleanup view correctly reports unavailable while its production bridge is disabled.
No record writes, SQL, Edge, shared Worker, retention, push or mobile release was
included. This is presentation acceptance, not complete platform-health coverage.

Deployment tooling came from reviewed `510a9ee` (PR #31); all four exact-head and
main quality jobs passed, including the added Worker-tooling high-severity audit.
The independently successful newer staging run `41127321420` is not the artifact
promoted here. Remaining Expo CLI/Zod findings are documented in current state.
The verified receipt is retained outside Git at
`%LOCALAPPDATA%/Doji/production-admin/2026-10-30/deployment.json` and in the production
workflow artifact. Restore only the prior Pages deployment if needed; do not roll
back shared backend state for this portal release.

## October 25 poll activation incident

Event `4ff51c34-b62c-4dd0-af70-acf799537d2c` activated without its system poll
post, so `submit_poll_vote` rolled back with `Community poll post not found`.
The scheduling INSERT trigger creates that card, but an intervening activation's
retention trigger deletes it. The activation RPC did not recreate it. Synthetic
schedule/intervening-activation/vote tests reproduced this defect before the fix.

Owner-approved repair inserted only the missing system card; five real votes and
completions were verified before the original deadline. No member vote was invented.
The permanent fix ensures the card after retention inside `activate_daily_event`.
It deployed at 17:13:43 UTC; original definition MD5
`d53835a47acdea37c588c58f05fa7ad9`, deployed
`bdbd6a8c37fb7874a682abb2fe799b88`. All grants stayed unchanged. 147 isolated
database assertions passed, including single-credit retry and exact rollback.
Source is `supabase/migrations/20261025172000_create_poll_post_at_activation.sql`;
this targeted emergency application is not evidence of a merged PR or ledger replay.

Separately approved recovery reopened the same event from 17:17:31.98228 to
17:27:31.98228 UTC (11:27:31 AM Mountain close). Seven missed participants returned
to pending; all five completed records retained their exact hash. No recorded
streak loss needed correction and no Sparks, votes or rewards were added. The
existing close alarm was rearmed with `chainNext=false` (next day's chain was already
prepared); request 167984 returned HTTP 200. Reopening invalidation was published,
and a unique delayed closing invalidation avoids the original close's dedupe key.
No additional push was sent. Synthetic tests covered recovery, retained completion
credit, single-credit retry, streak restoration, no push and refusal to reopen twice.

Private before/after definitions, fingerprint-guarded function rollback, one-row
repair SQL and synthetic acceptance receipts are retained at
`C:/Users/gfahe/AppData/Local/Temp/doji-event-correction-20261024/`, using the
`poll-activation-*-20261025` and `recovery-window-*-20261025` names. Retain successful
votes and rewards during rollback; never restore whole participant/profile rows
over subsequent submissions. No mobile rebuild or Worker rollback was required.

## October 25 alert recovery

Monitoring-only Worker version `5d44589a-b0c0-4734-bfaf-08afccada948` serves 100%.
Downloaded live source matches SHA-256
`2d494eeb736706504982b5f9b5e83ae02c6f50e763e8760a39ca0c816e9068ff`;
all settings, secret binding names and five Durable Object namespaces match the
baseline. Absent/invalid-token reads remain 401/no-store. Rollback is
`94343e0b-1447-495b-98c8-1db492864abe`, preserving the October 15 gateway fix.
No database, push, challenge timing or portal runtime changes accompanied it.

Frozen mobile source is reviewed main `c4e7c7b`, with only version overrides to
1.0.12 / Android 32 / iOS 106. Android job
`43ecd109-97f6-405e-ba44-c260b01dad78` and iOS job
`f4a73c48-ae3f-4645-8e5d-09fb3a3717fb` completed without rebuilds. Both have Sentry
source-map upload evidence; iOS also has native-symbol upload evidence. iOS
submission `345676e4-3006-4433-b857-a46cd51666e2` finished, and build 106 is available
to the existing six internal Doji Testers with acceptance instructions saved.
Android 32 was submitted as existing closed Alpha release 22 at 100% of that track;
Google shows “Changes in review” with quick checks still running. Audience and
supported devices are unchanged; native debug symbols are attached. The sole
release-validation warning is missing R8/ProGuard mapping, not a blocking error.
Public Android production and iOS App Store review were not submitted.
Expo reports $3 used from $45 included credit,
not an additional charge. Native device acceptance remains outstanding.

All four quality gates passed in run `40206501007`; PR #24 fixes only two
nondeterministic tests and merged as `1886ab0`. Its staging-only portal redeployment
was separately approved. Postmerge quality run `40208344042` passed all four gates;
staging run `40209294264` deployed `1886ab0` as
`a078ab9d-5016-4a98-83aa-0c620bb3f1bf`, with a verified configuration/package receipt.
Hosted session restoration, assigned-work listing and synthetic report detail reads
passed after deployment; no record writes were performed. Production admin was not
promoted. Private immutable source, hashes, verification receipts
and Worker rollback are retained outside Git in
`C:/Users/gfahe/AppData/Local/Temp/doji-health-release-d840f240f23643b6aefb7dccc7ff871b/`.

## October 24 Doji correction

Owner-approved replacement `dbfd5040-6b43-465d-9f23-a50e677b561f` (“Best way to wind
down?”) activated at 22:11:17 UTC with exactly 600 seconds of normal participation.
Free late access ends at `2026-10-25T06:00:00Z`; existing clients display it as
“BUY-IN OPEN,” but no Sparks are deducted. The occurrence-specific overrides cover
current-state reads, both buy-in overloads, poll/post completion cutoff, close and
push claim wording. All other occurrence paths, function owners and grants were
preserved. Sixteen isolated PostgreSQL checks passed, including guarded rollback.

The erroneous challenge `8877fcf0-8aa7-4dbc-886f-a9d9940cc8ca` is inactive. Its nine
completed participation records remain. Normal activation clears the old feed posts.
Tomorrow's event `4ff51c34-b62c-4dd0-af70-acf799537d2c` is unchanged; the replacement
alarm has `chainNext=false`. Apology fanout completed: 25 provider-accepted device
deliveries for 20 recipients, not proof of handset display.

Private tested SQL, original/patched definitions, launch receipt and fingerprint-
guarded rollback are retained outside Git at
`C:/Users/gfahe/AppData/Local/Temp/doji-event-correction-20261024/`.
Do not restore functions before the promised cutoff or relaunch the fixed event ID.
After expiry, separately review restoring the original bodies; retain participation
and receipts, and never re-enable the erroneous challenge as part of rollback.

## Retained records

- [Staging database baseline and recovery](STAGING_DATABASE_BASELINE_2026-10-14.md)

- [ACCOUNT DELETION REPAIR 2026-09-26](ACCOUNT_DELETION_REPAIR_2026-09-26.md)
- [ACCOUNT REALM SEPARATION PREPARATION 2026-09-30](ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md)
- [ADMIN ANNOUNCEMENT CONNECTED 2026-10-09](ADMIN_ANNOUNCEMENT_CONNECTED_2026-10-09.md)
- [ADMIN COMPLETION 2026-09-27](ADMIN_COMPLETION_2026-09-27.md)
- [ADMIN EDITORIAL PREPARATION 2026-09-27](ADMIN_EDITORIAL_PREPARATION_2026-09-27.md)
- [ADMIN EDITORIAL RELEASE 2026-09-27](ADMIN_EDITORIAL_RELEASE_2026-09-27.md)
- [ADMIN QUEUE CONSISTENCY 2026-10-09](ADMIN_QUEUE_CONSISTENCY_2026-10-09.md)
- [ADMIN REFERENCE IMPLEMENTATION 2026-10-09](ADMIN_REFERENCE_IMPLEMENTATION_2026-10-09.md)
- [ADMIN WORKFLOW FOUNDATION 2026-10-05](ADMIN_WORKFLOW_FOUNDATION_2026-10-05.md)
- [ALERT DIAGNOSIS 2026-09-27](ALERT_DIAGNOSIS_2026-09-27.md)
- [ANDROID 21 INCIDENT FOLLOWUP 2026-09-28](ANDROID_21_INCIDENT_FOLLOWUP_2026-09-28.md)
- [ANDROID 22 SUGGESTIONS 504 TRACE 2026-09-28](ANDROID_22_SUGGESTIONS_504_TRACE_2026-09-28.md)
- [ANDROID 26 FEED 504 INVESTIGATION 2026-10-03](ANDROID_26_FEED_504_INVESTIGATION_2026-10-03.md)
- [ANDROID 27 POST 504 INVESTIGATION 2026-10-04](ANDROID_27_POST_504_INVESTIGATION_2026-10-04.md)
- [Android diagnostic builds 25–28: consolidated evidence](ANDROID_DIAGNOSTICS.md)
- [ANDROID RECOVERY BUILD 23 2026-09-28](ANDROID_RECOVERY_BUILD_23_2026-09-28.md)
- [ANNOUNCEMENT CAMPAIGN DESIGN 2026-09-27](ANNOUNCEMENT_CAMPAIGN_DESIGN_2026-09-27.md)
- [ANNOUNCEMENT CAMPAIGN RELEASE 2026-09-27](ANNOUNCEMENT_CAMPAIGN_RELEASE_2026-09-27.md)
- [APP CODE REVIEW 2026-09-26](APP_CODE_REVIEW_2026-09-26.md)
- [BUSINESS APPLICATION FOUNDATION 2026-09-29](BUSINESS_APPLICATION_FOUNDATION_2026-09-29.md)
- [BUSINESS CLOSED HOSTING 2026-09-29](BUSINESS_CLOSED_HOSTING_2026-09-29.md)
- [BUSINESS EXISTING TEST ACCESS 2026-10-11](BUSINESS_EXISTING_TEST_ACCESS_2026-10-11.md)
- [BUSINESS LIVE RELEASE 2026-09-30](BUSINESS_LIVE_RELEASE_2026-09-30.md)
- [BUSINESS ONBOARDING IMPLEMENTATION 2026-09-29](BUSINESS_ONBOARDING_IMPLEMENTATION_2026-09-29.md)
- [BUSINESS ONBOARDING PREPARATION 2026-10-11](BUSINESS_ONBOARDING_PREPARATION_2026-10-11.md)
- [BUSINESS ONBOARDING ROLLOUT 2026-10-11](BUSINESS_ONBOARDING_ROLLOUT_2026-10-11.md)
- [BUSINESS OWNED AUTH CUTOVER 2026-10-10](BUSINESS_OWNED_AUTH_CUTOVER_2026-10-10.md)
- [BUSINESS OWNED AUTH GUARD 2026-10-10](BUSINESS_OWNED_AUTH_GUARD_2026-10-10.md)
- [BUSINESS OWNED AUTH PREPARATION 2026-10-10](BUSINESS_OWNED_AUTH_PREPARATION_2026-10-10.md)
- [BUSINESS PASSWORD FEEDBACK 2026-10-11](BUSINESS_PASSWORD_FEEDBACK_2026-10-11.md)
- [BUSINESS PASSWORD RELEASE 2026-10-11](BUSINESS_PASSWORD_RELEASE_2026-10-11.md)
- [BUSINESS PORTAL REFINEMENT 2026-09-29](BUSINESS_PORTAL_REFINEMENT_2026-09-29.md)
- [BUSINESS PRIVACY OPERATIONS 2026-09-30](BUSINESS_PRIVACY_OPERATIONS_2026-09-30.md)
- [BUSINESS RECOVERY EMAIL 2026-10-10](BUSINESS_RECOVERY_EMAIL_2026-10-10.md)
- [BUSINESS RESET RECOVERY 2026-10-10](BUSINESS_RESET_RECOVERY_2026-10-10.md)
- [CLOUDFLARE SAFETY EMAIL 2026-09-28](CLOUDFLARE_SAFETY_EMAIL_2026-09-28.md)
- [COMMUNITY IDEA RETRIAGE RELEASE 2026-09-27](COMMUNITY_IDEA_RETRIAGE_RELEASE_2026-09-27.md)
- [EDITORIAL DRAWER RELEASE 2026-09-27](EDITORIAL_DRAWER_RELEASE_2026-09-27.md)
- [EMAIL BRANDING 2026-10-11](EMAIL_BRANDING_2026-10-11.md)
- [EMPLOYEE ACCESS RELEASE 2026-09-26](EMPLOYEE_ACCESS_RELEASE_2026-09-26.md)
- [EMPLOYEE ENROLLMENT RELEASE 2026-09-26](EMPLOYEE_ENROLLMENT_RELEASE_2026-09-26.md)
- [EMPLOYEE HISTORY HEALTH PREPARATION 2026-10-09](EMPLOYEE_HISTORY_HEALTH_PREPARATION_2026-10-09.md)
- [EMPLOYEE LOGOUT RECOVERY 2026-10-13](EMPLOYEE_LOGOUT_RECOVERY_2026-10-13.md)
- [EMPLOYEE ONBOARDING REPAIR 2026-09-26](EMPLOYEE_ONBOARDING_REPAIR_2026-09-26.md)
- [EMPLOYEE RELEASE PREFLIGHT 2026-09-26](EMPLOYEE_RELEASE_PREFLIGHT_2026-09-26.md)
- [EXTERNAL TAKEDOWN INTAKE 2026-09-28](EXTERNAL_TAKEDOWN_INTAKE_2026-09-28.md)
- [IDEA SUBMISSION PRESENTATION 2026-09-27](IDEA_SUBMISSION_PRESENTATION_2026-09-27.md)
- [IOS 103 SECURITY ASSESSMENT 2026-10-03](IOS_103_SECURITY_ASSESSMENT_2026-10-03.md)
- [IOS URI SECURITY BUILD 103 2026-10-02](IOS_URI_SECURITY_BUILD_103_2026-10-02.md)
- [LOCAL HEAVY LOAD 2026-09-28](LOCAL_HEAVY_LOAD_2026-09-28.md)
- [MEMBER QUERY FIXES NEXT BUILD 2026-09-27](MEMBER_QUERY_FIXES_NEXT_BUILD_2026-09-27.md)
- [MEMBER QUERY PERFORMANCE REPAIR 2026-09-28](MEMBER_QUERY_PERFORMANCE_REPAIR_2026-09-28.md)
- [MEMBER READ AUDIT NEXT BUILD 2026-09-28](MEMBER_READ_AUDIT_NEXT_BUILD_2026-09-28.md)
- [MEMBER READ BUILDS 101 22 2026-09-28](MEMBER_READ_BUILDS_101_22_2026-09-28.md)
- [MEMBER READ RECOVERY 2026-09-28](MEMBER_READ_RECOVERY_2026-09-28.md)
- [MEMBER RELIABILITY REPAIR 2026-09-26](MEMBER_RELIABILITY_REPAIR_2026-09-26.md)
- [MEMBER TEST BUILDS 2026-09-26](MEMBER_TEST_BUILDS_2026-09-26.md)
- [MOBILE BUILDS 102 24 2026-10-02](MOBILE_BUILDS_102_24_2026-10-02.md)
- [MOBILE LOGGING RELEASE 2026-10-07](MOBILE_LOGGING_RELEASE_2026-10-07.md)
- [MOBILE QUERY BUILDS 100 21 2026-09-28](MOBILE_QUERY_BUILDS_100_21_2026-09-28.md)
- [MOBILE READ LIFECYCLE PREPARATION 2026-10-12](MOBILE_READ_LIFECYCLE_PREPARATION_2026-10-12.md)
- [MOBILE RECOVERY BUILDS 2026-10-12](MOBILE_RECOVERY_BUILDS_2026-10-12.md)
- [MODERATION MEDIA REPAIR 2026-09-28](MODERATION_MEDIA_REPAIR_2026-09-28.md)
- [NEXT MOBILE BUILD 2026-10-08](NEXT_MOBILE_BUILD_2026-10-08.md)
- [NOTIFICATION REPAIR 2026-09-26](NOTIFICATION_REPAIR_2026-09-26.md)
- [PERFORMANCE INVESTIGATION 2026-09-27](PERFORMANCE_INVESTIGATION_2026-09-27.md)
- [PERFORMANCE REPAIR 2026-09-28](PERFORMANCE_REPAIR_2026-09-28.md)
- [PERFORMANCE REPAIR 2026-10-02](PERFORMANCE_REPAIR_2026-10-02.md)
- [PLATFORM OPERATIONS HEALTH 2026-10-06](PLATFORM_OPERATIONS_HEALTH_2026-10-06.md)
- [POLL RESERVED OTHER RELEASE 2026-10-05](POLL_RESERVED_OTHER_RELEASE_2026-10-05.md)
- [PORTAL AUDIT 2026-09-25](PORTAL_AUDIT_2026-09-25.md)
- [PORTAL AVATAR EVIDENCE PREPARATION 2026-09-27](PORTAL_AVATAR_EVIDENCE_PREPARATION_2026-09-27.md)
- [PORTAL CASE READS PREPARATION 2026-09-27](PORTAL_CASE_READS_PREPARATION_2026-09-27.md)
- [PORTAL CONSISTENCY 2026-09-29](PORTAL_CONSISTENCY_2026-09-29.md)
- [PORTAL HEALTH REPAIR 2026-09-26](PORTAL_HEALTH_REPAIR_2026-09-26.md)
- [PORTAL ISOLATION RELEASE 2026-09-25](PORTAL_ISOLATION_RELEASE_2026-09-25.md)
- [PORTAL TRIAGE RELEASE 2026-09-27](PORTAL_TRIAGE_RELEASE_2026-09-27.md)
- [PORTAL TRIAGE REPAIR 2026-09-27](PORTAL_TRIAGE_REPAIR_2026-09-27.md)
- [PORTAL WORKFLOW AUDIT 2026-09-27](PORTAL_WORKFLOW_AUDIT_2026-09-27.md)
- [PRODUCTION INCIDENT INVESTIGATION 2026-09-13](PRODUCTION_INCIDENT_INVESTIGATION_2026-09-13.md)
- [PUSH REGISTRATION RELEASE 2026-09-26](PUSH_REGISTRATION_RELEASE_2026-09-26.md)
- [REACT PUBLIC BUSINESS MIGRATION 2026-10-09](REACT_PUBLIC_BUSINESS_MIGRATION_2026-10-09.md)
- [RELIABILITY DIAGNOSIS 2026-09-26](RELIABILITY_DIAGNOSIS_2026-09-26.md)
- [REPOSITORY CLEANUP AUDIT 2026-10-05](REPOSITORY_CLEANUP_AUDIT_2026-10-05.md)
- [REPOSITORY HANDOFF AUDIT 2026-10-12](REPOSITORY_HANDOFF_AUDIT_2026-10-12.md)
- [SAFETY LAUNCH 2026-09-29](SAFETY_LAUNCH_2026-09-29.md)
- [SAFETY PORTAL UI REPAIR 2026-09-29](SAFETY_PORTAL_UI_REPAIR_2026-09-29.md)
- [WEB REACT MIGRATION 2026-10-08](WEB_REACT_MIGRATION_2026-10-08.md)
