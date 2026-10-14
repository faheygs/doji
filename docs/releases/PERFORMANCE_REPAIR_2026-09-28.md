# Performance repair — September 28, 2026 UTC

Released during September 27 evening in America/Denver. Owner approved the shared
repair scope with no new costs. This is a bounded repair of confirmed defects, NOT
certification that all historical performance issues are resolved or that 100,000
concurrent users are supported. Historical investigation remains in
`PERFORMANCE_INVESTIGATION_2026-09-27.md`.

## Live changes

### Same-price database compute upgrade

- Primary `tvixsmqxotuvyjqzmjla`: t4g.nano -> t4g.micro, up to 0.5 GB -> 1 GB RAM.
- Dashboard final confirmation: before $9.68/month, after $9.68/month, +$0.00/month;
  both displayed $0.01344/hour. Micro was labelled Free Upgrade. This is not a new
  paid tier, storage expansion, IOPS change, replica or additional database.
- Existing 2 GB GP3 disk, 3,000 IOPS, 125 MB/s and enabled 8 GB spend cap unchanged.
- Existing physical backup September 27 14:20:41 UTC and recovery UI checked first.
- At 01:44:45 UTC: no active Doji, next September 29 00:12:54.305 UTC, no overdue
  outbox/push work or lock waits. Resize completed approximately 01:45–01:48 UTC.
- Database responding at 01:48:17 UTC with no delivery backlog. Dashboard verified
  primary t4g.micro and selected Micro. This reduces a known resource constraint;
  it does not prove memory pressure was the initiating cause of the historical stall.
- Evidence: `test-results/performance-repair-20260928/micro-upgrade.png`.

### Suggestion-history permission repair

Migration `20260928020000_repair_suggestion_profile_policy.sql` committed at
01:50:52.215816 UTC. The SELECT/UPDATE admin predicates on `challenge_suggestions`
now use the existing narrow `is_current_user_admin()` helper. The old direct
`profiles.is_admin` lookup caused SQLSTATE 42501 under the private-profile contract.

No profile fields/grants were broadened. No suggestion, reward, decision, function
body, trigger, member command, employee identity or realtime event was changed.
Authenticated users still cannot directly UPDATE suggestions; staff use the existing
audited employee command. Verification at 01:50:58.620552 UTC confirmed all 331
public function definitions/ACLs, grants, triggers, other policies and indexes unchanged.

Offline full-schema test reproduces the old error, applies the exact migration,
then checks two separate synthetic members (own rows visible, others hidden), safe
reviewer joins, private-profile denial, direct-write denial, anonymous denial,
employee direct-table denial and authorized editorial reads, and legacy admin access
including another member's row. Exact previous-policy rollback reproduces the old
error. The disposable database is removed; no production records are created.

### More accurate incident diagnosis

Worker version `3f34bb34-7b7c-44f6-a59e-7ad200c6cee3` deployed at 01:56:41 UTC.
Only two diagnostic label literals changed in the exact downloaded production
artifact. `send-admin-email` v31 -> v32 changes realtime incident guidance only,
with all four shared dependencies preserved byte-for-byte.

A publication retry can follow database acknowledgement failure after provider
acceptance. A slow first attempt does not isolate the relay wake from publication
latency. New guidance calls for correlated database waits, relay/Edge and provider
evidence; it no longer claims the provider is at fault from attempt count alone.

Thresholds, alert family/cooldown, recipients, authentication, Worker bindings and
schedules, Durable Objects, routes, member push logic and all other Edge Function
versions are unchanged. Portal Pages remains `cea4bd7a-191b-4f34-9ab6-b79a06177bb3`.
No test email or member push was triggered. Shared infrastructure remains shared;
unchanged contracts do not imply physical isolation or zero risk.

## Queued mobile repair — NOT installed

`lib/scaleReadGateway.ts` uses explicit first-abort provenance rather than throwing
`signal.reason`, which the installed React Native polyfill does not support.
Deadlines now produce real retryable `TimeoutError` values rather than `undefined`.
Lifecycle cancellation stays `AbortError`; real HTTP rejection is preserved.

Both paths in `lib/feedQueries.ts` await the gateway before cleanup, retaining
deadline/parent cancellation while transport and response parsing are pending.
Pre-cancelled reads do not send and cancelled late results do not populate the feed.
Direct SDK errors retain HTTP status and use the same deadline classification.

Existing eight-second per-attempt deadline, one transient retry, one 401 refresh,
fail-closed gateway, RPC contracts and pagination remain unchanged. No new polling,
fallback read storm, session policy or economic write. Earlier empty-announcement
and upcoming-Doji fixes remain queued; see `MEMBER_QUERY_FIXES_NEXT_BUILD_2026-09-27.md`.
No EAS build, OTA, app submission or release-enforcement change was made. Installed
iOS 99 / Android 20 can still emit the old errors until a new build is installed.

## Verification

- Full Jest: **133 suites / 1,038 tests passed** after changes.
- TypeScript `--noEmit` and scoped ESLint: passed.
- Actual installed React Native AbortController polyfill probe: real deadline Error,
  active pending feed deadlines and parent-cancellation propagation passed.
- Local full-schema permission/rollback test: passed, including the two-member
  authorization extension. Early fixture failures were corrected and rerun; they
  affected only disposable offline databases.
- Read-only production checks at 01:56:55 UTC: member profile/realtime, employee
  session/queue, employee-to-member-profile rejection and member-to-employee-directory
  rejection passed. Feed RPC returned one row; comment read returned zero rows.
- Health snapshot: no due/overdue/exhausted outbox or push backlog, no APNs credential
  failures. Three realtime samples: p95 744 ms, max 753 ms, no retries or >5 s events.
  Three samples are insufficient for a representative performance conclusion.
- Owner confirmed still signed in and profile, feed, comments and submitted-ideas
  history work after compute/policy release. Diagnostic-only release followed and
  passed the read-only contract checks above. Physical-device next-build testing is
  still required; synthetic checks do not demonstrate handset push display timing.

## Capacity work and remaining gates

Corrected `scripts/load/social-fanout-model.mts`: immediate targeted OS notifications
are no longer multiplied by every friend and reduced by an invented 30-second grouping
window. Unmeasured provider/database headroom defaults were removed. It now outputs
explicit scenario demand and `capacityVerified: false`, rejects removed options,
and is covered by eight regression tests. The launch arithmetic model also labels
its rates/latencies as assumptions, not verified capacity.

Offline 100k scenario, two friend-scoped events/user, 25 friends, one eligible targeted
push/user and one installation/recipient:

| Burst | Social source events/s | Friend-channel publications/s | Targeted provider requests/s |
| --- | ---: | ---: | ---: |
| 30 seconds | 6,667 | 166,667 | 3,334 |
| 60 seconds | 3,334 | 83,334 | 1,667 |
| 120 seconds | 1,667 | 41,667 | 834 |

These are demand arithmetic, not observed rates or provider billing units. They
exclude launch broadcasts, subscriber deliveries, reconnect/retry traffic, shared
channels and database query/write costs. No production load was generated.

Before declaring the 100k target ready:

1. Separate 100k registered users/recipients from peak simultaneous participation.
2. Verify actual Ably, Cloudflare, Supabase and push-provider account limits and
   included usage/overage controls; paid subscription names alone are insufficient.
3. Exercise representative synthetic data and concurrent launch/feed/comments/reaction/
   token/relay workloads on isolated capacity. Capture p95/p99, query plans, lock
   waits, memory/IO, recovery and duplicate-effect counts. Local arithmetic is not
   a substitute for this and no 100k database/provider test was run in this release.
4. Measure device feedback, background/foreground, slow/offline recovery and
   notification display on both platforms. Pending feedback is not committed success;
   push acceptance cannot guarantee handset presentation.
5. Verify launch completion inside the existing two-minute expiry and preserve
   the server-owned ten-minute participation window, exact-once economic effects,
   access control and reconnect reconciliation under faults.

Hosted scale tests or additional capacity remain blocked until included allowances
are demonstrated sufficient, or the owner changes the no-new-cost constraint.
No new service, paid capacity, scheduled monitor, or paid build was added here.

## Rollback and evidence

- Database: exact guarded rollback is
  `test-results/performance-repair-20260928/rollback.sql`. Recheck current policies
  and release window, run only this narrow rollback if required, then verify member
  and staff contracts. It restores the old broken permission behavior; do not use
  it as routine cleanup. Keep migration history and record any rollback explicitly.
- Worker: previous version `f1f7bb4c-3044-4527-b3ef-f7cf8caef8e2`; exact source/settings
  in `test-results/performance-diagnostics-20260928/worker-baseline.js` and
  `cloud-before.json`. Before restoring, verify no intervening deployment, preserve
  bindings/secrets/schedules, and repeat the read canaries. Do not deploy the entire
  dirty local Worker tree.
- Email: isolated previous source/config/dependencies are under
  `test-results/performance-diagnostics-20260928/baseline`. Restore only
  `send-admin-email` from that directory, preserving its existing authentication.
  Re-download and compare the artifact; do not trigger a real email as a test.
- Compute: do not assume paid Nano is selectable or a resize is instantly reversible.
  For provisioning/database failure use provider recovery/support and the recorded
  backup; do not initiate destructive restore or buy a larger instance silently.
- Mobile: before a build, revert only this repair's hunks if rejected; after release
  use a separately verified mobile replacement. Preserve unrelated queued fixes.
- Detailed sanitized release records: `test-results/performance-repair-20260928/`
  and `test-results/performance-diagnostics-20260928/verified.json`. Retain exact
  baseline artifacts privately for rollback; they are not public website assets.

## Primary documentation

- [Supabase compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk):
  paid Nano/Micro pricing and resize interruption. Final signed-in price confirmation
  was used for this project, not an assumption based only on a public price table.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security):
  narrow RLS predicates, existing security-definer helper and init-plan evaluation.
- [Ably limits](https://ably.com/docs/platform/pricing/limits) and
  [Expo push FAQ](https://docs.expo.dev/push-notifications/faq/): provider limits are
  separate from application fanout arithmetic and handset delivery guarantees.
