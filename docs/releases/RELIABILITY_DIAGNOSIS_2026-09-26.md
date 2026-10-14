# Read-only reliability diagnosis — September 26, 2026

Scope: investigate Sentry REACT-NATIVE-11 and September 25 Doji delivery latency.
No production code, configuration, database data, sessions, or moderation decisions
were changed. Diagnostic SQL used read-only transactions and 5–8 second limits.

## Findings

### Sentry is one symptom of a wider database slowdown

Sentry issue 7741125030 contains three events across three users since first seen
eight days earlier. Its latest event, `1a829c5670314d09ac5fb232834acbff`, occurred
September 25 at 22:12:09.808 UTC (4:12 PM MDT), on iOS 1.0.7 build 91.
The operation was `push/endpoint-registration`, specifically
`register_native_push_endpoint_v3`. A request started at 22:11:58.147 and returned
HTTP 500 at 22:12:09.803. A preceding registration request also lasted about
12 seconds. This is a handled error, not proof of a native crash or logout.

The corresponding Postgres error at 22:12:07.082 identifies this call chain:

`register_native_push_endpoint_v3 -> v2 -> register_native_push_endpoint -> register_push_token -> profiles UPDATE -> reject_objectionable_ugc -> assert_acceptable_content`.

Another push-registration cancellation at 22:12:03.017 stopped in
`trg_award_streak_shields` during the same profile update. These are cancellation
locations, not proof those individual functions consumed all the execution time.
Live trigger definitions confirm both triggers run on every profile UPDATE;
the streak-shield function has an early return when level is unchanged.

The retained Postgres log search from September 24 22:03 UTC to September 26
22:04 UTC returned **30 statement-timeout records**, with the newest at September
25 22:12:17. A single Sentry issue therefore understates server-side failures.
Examples directly inspected in the log explorer:

| UTC time on September 25 | Operation / cancellation context |
|---|---|
| 21:24:35.678 | `set_post_reaction`, in `can_view_full_post` |
| 21:24:36.032 | `get_post_reaction_voters_page` |
| 21:24:46.771 | Notification-center bootstrap and snapshot |
| 22:10:33.713 | `get_operational_health` |
| 22:11:41.290 | Reaction insert / count-shard update |
| 22:11:50.582–22:11:58.767 | Reaction rate-limit insert/update; one explicitly waiting on a tuple in `api_rate_limit_buckets` |
| 22:12:01.946 | `claim_domain_events_v2` — realtime relay database claim |
| 22:12:02.816 | Reaction-voter list / relationship lookup |
| 22:12:03.017 and 22:12:07.082 | Push registration / profile triggers |
| 22:12:17.814 | Portal command-center snapshot |

These establish database timeouts across member and operational paths, with
confirmed row contention in reaction rate limiting. They do **not** establish the
initiating cause, historical CPU/IO saturation, a specific blocking transaction,
or that portal traffic caused the incident. Do not label this provider-only.

### Slow Doji delivery is real, but its stages cannot be reconstructed fully

The finalized September 25 cup/mug Doji summary covers 21:17–21:37 UTC:

- 88 realtime samples, p95 21,588 ms, maximum 103,938 ms; nine over five seconds.
- No unpublished or exhausted outbox work in the finalized event summary.
- 16 of 16 push shards completed, none expired or exhausted. This is not proof
  every handset displayed a notification.
- 12 participants and 10 posts.

The Sentry event is roughly 50 minutes after activation and outside that summary
window. Database timeouts occurred in both windows. That is correlation, not proof
that one operation caused the other.

Retained outbox rows for the incident have no `realtime_publish_attempts` values:
stage instrumentation was added later. A caught-up queue alone cannot distinguish
slow relay wake, database/Edge Function delay, or provider publication latency.
Rows without `realtime_published_at` are not automatically unfinished backlog;
internal non-realtime events must not be counted as failed publication.

### Current evidence is improved, not a full peak-load clearance

Read-only production check at September 26 22:02:57 UTC:

- Zero overdue or exhausted outbox work.
- No active client queries waiting on locks; eight other client connections idle.
- Successful push registrations after the incident on iOS builds 91, 95, 96, 97,
  and Android build 17. This does not establish recovery of the exact Sentry device.
- Push-registration function hashes match the pre-employee-access member baseline.
- Authenticated and authenticator statement timeouts are eight seconds;
  authenticator lock timeout is also eight seconds.

Later read-only check: eight realtime samples in the last six hours, all with
publication-attempt telemetry, zero retries, p95 2,250 ms and maximum 2,287 ms.
This quiet-period sample is too small to claim burst reliability.

The September 25 comment-permission repair migrations are applied. The deployed
comment snapshot is security-definer and uses the reporter-relative predicate.
Earlier comment failures had a separate documented authorization defect; this
push-registration event does not prove comments or account loading failed then.

## Recommended next scope — approval required before shared changes

1. Reproduce the observed member burst in a local/test database, with concurrent
   reaction writes, notification snapshots, endpoint registration, relay claims,
   and bounded portal reads. Identify execution plans and blocking relationships.
   Do not load-test production.
2. Evaluate eliminating unnecessary profile work on unchanged push-token refreshes
   while preserving atomic token ownership, old active endpoint survival on failure,
   bans, content validation on actual profile edits, and economy triggers.
3. Review reaction rate-limit contention without weakening limits or splitting
   atomic commands. The live member limiter must not be changed speculatively.
4. Add content-free operation/duration/outcome correlation where existing telemetry
   cannot identify the limiting stage. No tokens, message text, or personal data.
5. Verify already-present single-flight/retry/cache behavior on physical devices;
   backlog FW-031 is still pending this verification. Do not assume source code
   proves the affected build contained it.

Any implementation is a separate member/shared-backend release, not a portal UI
release. Before deployment, require concurrency and rollback tests, comment/feed/
profile authorization regression tests, moderation privacy tests, push-token
rotation and failure recovery, unchanged mobile session behavior, and durable
activation/close/realtime tests. Preserve the ten-minute participation window.

Deployment must contain only the reviewed changes, with captured previous function
definitions/Worker artifact for rollback and a low-traffic deployment window.
Rollback must not discard committed member data. No new paid service or larger
database is proposed by this diagnosis. No backend fix or mobile release was made.

## Evidence locations

- Sentry: https://doji-i0.sentry.io/issues/7741125030/
- Supabase: project `tvixsmqxotuvyjqzmjla`, Postgres logs and Logs Explorer.
- Matching push-registration database log: `fd28ad2b-46a9-479a-a3eb-6691be27b819`.
- Notification bootstrap log: `ba5cf0cb-4e4b-4a48-b281-957c3c18ca02`.
- Read-only queries: `test-results/timeout-diagnosis-20260926.sql` and
  `test-results/timeout-contracts-20260926.sql`.
