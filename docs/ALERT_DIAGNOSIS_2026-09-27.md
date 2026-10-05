# September 27 feed and realtime alerts — read-only diagnosis

Checked September 28 at 00:40 UTC (September 27, 18:40 MDT). No production changes, alert suppression, builds, or moderation actions were performed.

## Feed error

- Sentry issue `REACT-NATIVE-1A` / `7758078814`, event `a49b40f1619044599863f5b1d2c57fba`, September 27 at 19:35:29 UTC.
- iOS release `com.doit.challengeapp@1.0.8`, distribution 99.
- One recorded event; handled exception, `query.feed`, `unexpected`, API context `error_type: non_error`. No underlying HTTP status or database error code was available in the inspected event.
- This is a reported terminal query failure, not evidence of a native crash. Sanitized user counts do not establish how many people were affected. Telemetry deduplication also prevents treating event counts as exhaustive request counts.
- The available event cannot identify the original failure or establish whether the feed recovered. Existing next-build optional-query changes must not be represented as a proven fix for this feed event.

## Realtime delivery alert

The owner-provided email was observed at 19:38 UTC. It reported a five-minute p95 of 6,072 ms, maximum 26,453 ms, 144 samples, nine events over five seconds, and five events with two publication attempts. No overdue/exhausted outbox work, stale/exhausted push shards, or APNs credential failures were reported.

Bounded read-only production queries confirmed:

| UTC minute | Samples | p95 ms | Maximum ms | Over 5 seconds | Retried |
| --- | ---: | ---: | ---: | ---: | ---: |
| 19:33 | 13 | 791 | 1,011 | 0 | 0 |
| 19:34 | 51 | 613 | 785 | 0 | 0 |
| 19:35 | 27 | 5,953 | 10,265 | 3 | 0 |
| 19:36 | 23 | 25,886 | 26,453 | 6 | 5 |
| 19:37 | 30 | 626 | 660 | 0 | 0 |

All nine delayed rows had both realtime and full-processing publication timestamps. They covered reactions, posts, notification state, a profile update, a leaderboard update, and a user-event update. The final delayed row finished processing at 19:36:20 UTC. Their transient errors were no longer retained. Subsequent recorded minutes through 19:48 had no events over five seconds; the largest subsequent latency was 1,503 ms.

The email's three consecutive unhealthy observations use overlapping five-minute windows. They do not prove that new failures continued for three distinct five-minute periods. A 19:38 alert is consistent with delivery recovery at 19:37 while the previous slow events remained in its observation window.

These metrics measure server-side realtime publication, not confirmed arrival on a member's handset. The provider/network label is a classification heuristic, not a confirmed Ably outage. Publication attempts can include failures during provider publication or subsequent database acknowledgement/lease handling.

At 00:40 UTC there was no overdue or exhausted outbox work, no stale/exhausted push work, and no APNs credential error. The most recent five-minute sample count was zero: this verifies absence of those backlog indicators, not healthy latency under load.

## Conclusion and remaining work

The feed event and delivery slowdown overlap in time, but shared causation is unproven. Retained rows demonstrate eventual processing of the nine delayed events, not universal proof of no data loss or handset delivery.

Further root-cause work requires historical relay/provider/database logs around 19:35–19:36 UTC and improved safe diagnostics for non-Error query failures. Preserve alerting. Any fix to member code or shared infrastructure must be reviewed and approved as its own scope; do not bundle it into portal UI deployment.

Reproduction queries: `scripts/read-alert-window-20260927.sql` and `scripts/read-alert-summary-20260927.sql`. Both run in read-only transactions with a five-second statement timeout and one-second lock timeout. Supabase CLI output presents the last result set only.
