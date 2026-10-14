# Portal monitoring and queue-health repair — live

## Queue display

The original command-center aggregate named `nearing_target` includes every pending
report at least 20 hours old, including reports well beyond the 24-hour target.
Its old note called all of them "nearing"; the UI also colored any nonempty queue green.
The detail row already knew the correct deadline.

The portal now derives summary display from existing bounded authorized report rows:
within target, due within 4h, overdue, and urgent high-risk overdue. Overdue cards are
red with elapsed time. High/critical priority or level_2/level_3 severity adds stronger
urgent treatment. Missing deadlines or incomplete bounded coverage cannot imply healthy
queue-wide status; partial overdue counts explicitly say "At least". Resolved work is
excluded, empty queues are neutral, and the existing display timer updates ages without
new network reads. The aggregate subtitle now includes both approaching and overdue work.

No deadline policy, database function, polling, member authorization or moderation
command changed. The real case was verified in the live UI as
"1 overdue · Oldest 24h 21m past target", matching its priority row.

## Sentry

The portal previously received Sentry 401/403. The visible existing personal token had
org:read/project:read/project:releases/project:write but no event:read; the other listed
organization token was for source maps. The encrypted old Worker token was not recovered,
so its exact identity was not established.

The owner specifically approved a dedicated event:read-only token and replacement of
the portal-only Worker secret. The token "Doji portal monitoring (read-only)" was created
with only that scope. The owner copied it directly into Cloudflare SENTRY_API_TOKEN and
deployed; the token was not placed in chat, source or release artifacts. Existing build
tokens and app DSN were left untouched. Temporary credential tabs were closed afterward.

The authenticated portal now shows one real unresolved production issue:
REACT-NATIVE-11, issue 7741125030, statement timeout, last seen September 25.
Access denied is resolved. The resulting Degraded label reflects that outstanding issue;
this release does not diagnose or repair the underlying timeout or claim a live outage.

## Release and verification

- Pages: 650e5d01-5789-40ca-b1c3-b04973de5c72.
- Portal bundle: admin-app-20260926health1.js.
- User-deployed Worker secret version: 4855a3d3-782f-4c33-a7a8-482ff5605aad (100%).
- Worker code hash unchanged from employee cutover; existing binding metadata, DO
  namespace IDs and cron verified unchanged. Secret values are not readable via that API.
- Exact live portal asset hashes verified; employee auth/setup preserved.
- 47 health/queue unit tests and 49 browser tests passed, the latter against the exact
  isolated release directory. No production moderation commands used in verification.
- Actual owner portal session restored successfully after release reload. Phone sessions
  were not modified; no new phone interaction was performed during this repair.

Preparation and verification scripts are `scripts/prepare-portal-queue-health-release.mts`
and `scripts/verify-portal-monitoring-release.mts`. Evidence is under
`test-results/portal-queue-health-release/`. Only four new/changed assets uploaded;
the dirty shared Worker/mobile/database working tree was not deployed.

Rollback: restore Pages 75b17f46-b482-433c-b161-e0ef05cfa7c5. The prior Worker version
e326d2cf-55d0-4cc5-932b-4a8c10600362 retains the pre-rotation settings if a coordinated
rollback is needed; that would also restore the failed Sentry connection. Do not revoke
build tokens or alter member credentials. No new service, plan, subscription or mobile
build was created. Existing infrastructure/usage remains shared.
