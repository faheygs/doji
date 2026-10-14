# Free local heavy-load test — September 28, 2026 UTC

**Result: the current database query implementation does NOT pass the heavy-load
gate on the synthetic 100k dataset.** Two specific query-design bottlenecks are
confirmed below. No production traffic, deployment, paid service/build, external
email or notification was generated. This is an evidence report, not a repair release.

## Environment and scope

- Existing `doji-local-test` VM: 4 CPUs, 6,144 MiB RAM, 30 GiB disk. PostgreSQL 17.6,
  fsync/synchronous_commit on, 128 MiB shared buffers, 4 MiB work_mem, 100 connections.
  It is **not** a replica of the production Micro hardware or cloud/network topology.
- Existing database container has `network=none`, no published ports, no vault
  secrets and only `@test.invalid` Auth records. New disposable database cloned from
  the synthetic template; production data and credentials were not copied.
- All **331 public function definitions and ACLs matched** the captured released
  baseline after applying the missing local migrations. No application function was
  changed for these measurements. Authenticated reads/writes use the real RPCs and
  `SET LOCAL ROLE authenticated` with synthetic claims. JWT verification/HTTP are
  outside this database-layer test.
- Fixture: 100,000 member profiles/posts, 200,000 participation records (one completed
  occurrence, one initially pending), 1,250,000 undirected friendship edges (25 friends
  each), 500,000 comments, 300,000 reactions and matching shard rollups; about 1.46 GB.
  Two existing synthetic Auth scaffold records are additional to the 100k members.
- Bulk construction bypassed triggers only in its seed transaction. Runtime triggers,
  authorization, economic effects and constraints are enabled for tested commands.
  Fixture relationships/rollups and nonempty authorized reads were explicitly checked.
- The traffic duration is separate from the product window: no change to the
  ten-minute participation window or two-minute launch-push lifetime.

## Workloads and method

Actual PostgreSQL pgbench custom workloads, not arithmetic fanout estimates:

1. Single-client 10-second baselines per RPC, then mixed 30-second ramps at
   8/16/32/64 database clients. Mixed weights: profile 15%, Everyone feed 25%, Friends
   feed 15%, comment reads 15%, notification history 10%, realtime authorization 10%,
   reaction writes 7%, comment writes 3%.
2. Ordinary activity: five minutes, 8 clients, offered 20 transactions/second.
3. Heavy launch target: twenty minutes, 64 clients, offered **1,000 transactions/second**,
   including reactions concentrated on a popular post. This is 1.2 million offered
   operations over the intended window, NOT 100k actual simultaneous socket connections.
4. Recovery: one minute, 4 clients, offered 10 transactions/second.

These traffic mixes and rates are explicit test assumptions, not measured user
analytics. Each transaction calls one principal RPC. Reads hit the database directly;
gateway caching/deduplication, TLS, network latency, media storage and mobile rendering
are not represented. Random uniform users/ring friendships do not cover all real-world
degree skew, poll voting, signup storms or content distributions.

All benchmark statements have an eight-second timeout. Rate-controlled runs use a
two-second arrival-latency budget; completed latency includes time waiting for a test
client. A skipped arrival was never sent to Postgres and is **not** counted as a
successful request. The heavy run stops on a SQL/client error instead of continuing
with failed clients and reporting a false pass. See
[PostgreSQL 17 pgbench documentation](https://www.postgresql.org/docs/17/pgbench.html)
for scheduled-arrival latency, skipped requests and error semantics.

Notification stress requests used a two-day lookback/20-item limit; the plan probe
also tested the exact app's 30-day/200-item request and reproduced the same costly
work. The smaller stress request is not a claim to cover the whole app history window.

## Measured results

Single-client completed transaction latency, including local role/transaction setup:

| Operation | p95 |
| --- | ---: |
| Own profile | 0.554 ms |
| Everyone feed, 20 items | 4.466 ms |
| Friends feed, 20 items | 19.327 ms |
| Comment thread read | 1.693 ms |
| Realtime authorization | 0.752 ms |
| Reaction write | 5.783 ms |
| Comment write | 174.598 ms |
| Notification history | **2,015.813 ms** |

These are warm local baselines, not phone response times or production SLOs.

| Scenario | Completed | Skipped arrivals | Outcome |
| --- | ---: | ---: | --- |
| Ordinary five minutes | 5,825 | 127 | No SQL errors, but fails no-missed-budget gate; completed p95 2,001 ms / p99 2,951 ms |
| Heavy planned twenty minutes | 452 | 2,037 before abort | **Failed early**; about 11 seconds wall time including setup/collection, 52 client timeout messages; not a completed soak |
| Recovery one minute | 521 | 36 | No SQL errors/deadlocks, but the same slow query still causes arrival-budget misses |

Notification p95 rose from 2.33 seconds at 8 clients to 3.20 seconds at 16 and
6.52 seconds at 32. The 64-client ramp aborted on notification SQL timeouts.
Latency percentiles for that incomplete ramp and heavy run exclude failed requests;
they must not be used to claim satisfactory performance. pgbench's reported zero
serialization/deadlock failures does not negate separate client-abort errors.

The twenty-minute load requirement remains **unpassed**. Continuing a failing test
for the remaining time would not turn it into evidence of readiness.

## Confirmed query-design findings

### P1: notification history processes unrelated global activity

`get_notification_center_snapshot_without_post_context` materializes `comment_rows`
before applying recipient-specific conditions in its consumers. The real nested plan
for one user processes **500,451 comments**, scans 100,000 posts and 100,000 actor
profiles, scans the comment-parent relation, then repeatedly filters almost the entire
materialized result away. The reaction branch also scans about 302,890 unrelated
reactions before selecting the user's relevant activity.

The actual 30-day/200-item app request returned **19 items** in about **2,087 ms**.
Its plan reported 26,598 temporary blocks written (~208 MiB) and 38,954 read (~304 MiB)
for one call. Between the first/last ordinary-run samples (270 seconds), the database
temporary-file counter increased by ~108 GB. This is cumulative PostgreSQL temporary
file accounting, not simultaneous disk occupancy or a physical-device IO measurement.

Required repair direction: select authorized recipient/post/comment IDs through
bounded indexed paths **before** joining actor payloads and grouping. Preserve the
wire format, dismissal keys, friendship-acceptance boundaries, blocks, moderation
visibility, exact replies/mentions, grouping counts, ordering and pending requests.
Do not hide the alert, increase the timeout or reduce notification functionality.

### P1: comment mention resolution scans all profiles even with no mentions

For `Synthetic plan probe` (no `@`), `sync_comment_mentions` scans **100,000 profiles**,
does **99,999 friendship subplan lookups**, and produces zero mention inserts. That
step takes ~206 ms of the ~223 ms instrumented comment command. The earlier
un-instrumented comment-write baseline averaged ~171 ms.

Required repair direction: parse a bounded set of mentioned usernames first, short
circuit empty mentions without breaking removal of old mentions during editing,
then perform indexed exact-username/friendship checks. Preserve friend-only mention
authorization, self handling, idempotency, edit/delete behavior and existing atomic
comment/economy/realtime commands. No implementation or deployment was made here.

These findings establish scale problems on the local dataset. They do not prove the
cause of a particular historical Sentry event or production-wide incident.

## Notification delivery/database safety checks

After the measured load, a separate rollback-only test added 100,000 synthetic native
endpoints (iOS/APNs and Android/FCM) with no real tokens and no reachable network.

- 128 shard plan and **256 pages of at most 500 recipients** cover all 100,000 users
  exactly once (temporary primary key catches duplicate recipients).
- Selection-only measurement: ~836 ms sequentially in the local database.
- Extended test: **100,000 handoff claims plus replay of every page** completed in
  ~3,365 ms including selection; replay produced zero additional claims.
- Exclusive shard lease, wrong/replayed lease rejection, completed advance, duplicate
  suppression, transport-error retry capped at three attempts and expired-launch
  rejection passed. These are database state checks, not actual provider results.
- Separate true concurrency test: 32 database clients replaying one reaction command
  returned identical receipts and one reaction row; 32 simultaneous delivery claims
  produced exactly one successful claim.
- **Actual provider requests: zero.** APNs/FCM throughput, provider limits, handset
  delivery/display times and Worker/Edge orchestration are not proven by this test.

Fixture corrections are recorded to avoid misdiagnosis: the first push test lacked
statistics on newly bulk-inserted endpoints and hit its timeout; after explicit local
ANALYZE, the same selector covered 100k in under a second. This was a fixture/planning
artifact, not proof that production selection takes two minutes. A first concurrency
harness opened 32 Windows-to-Podman SSH sessions and hit an SSH handshake limit; the
passing rerun uses one pgbench process with 32 actual database clients inside the VM.

## Reproduction and evidence

Scripts (all targets hardcoded to the offline synthetic container; no URL override):

```text
node scripts/load/local-heavy.mts prepare
node scripts/load/local-heavy.mts finalize
node scripts/load/local-heavy.mts ramp
node scripts/load/local-heavy.mts soak
node scripts/load/local-heavy.mts recovery
node scripts/load/local-heavy-diagnose.mts
node scripts/load/local-heavy-checks.mts
node scripts/load/local-heavy-concurrency.mts
node scripts/load/local-heavy.mts cleanup
```

The finalized runner exits nonzero for aborted/failed/skipped transactions or a p95
above the provisional two-second budget. The first captured ramp used an earlier
runner which saved exitCode/latencies but did not propagate a failed gate to the parent;
the raw failure remains in `ramp-64.txt`. Do not confuse harness exit status with the
recorded benchmark outcome. Each rerun should archive its evidence before replacing
the fixed output directory. Cleanup drops only the validated disposable database;
the original synthetic template and production are untouched.

Evidence: `test-results/local-heavy-20260928/` contains raw pgbench logs, per-operation
p50/p95/p99/max, statement timings, sampled database counters, function comparison,
`plan-notifications.txt`, `plan-comment.txt`, `push-checks.txt` and `concurrency.json`.
All four runner files passed Node syntax checks. Existing production/member/portal
source and configuration were not changed by this testing task.

## Next acceptance gate

Prepare and validate the two bounded-query repairs in isolation, including output
parity and privacy tests, then rerun these workloads with the same data and weights.
Only after passing the ramp should a complete heavy twenty-minute run count as a
release gate. Add realistic peak-arrival shapes, poll writes, outbox/fanout concurrency,
larger history and skewed friendships next. Actual hosted-provider capacity and
physical-device delivery tests remain separate and cannot be certified for free by
this single-machine database test.
