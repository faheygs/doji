# Doji authoritative realtime architecture

## Guarantees

- Postgres is the source of truth. Socket messages only announce committed state.
- The handset clock never authorizes participation. `get_current_doji_state`,
  `submit_poll_vote`, and `complete_doji_with_post` use the database clock.
- Challenge pre-live, activation, and close use one durable Cloudflare alarm chain per `daily_event`.
  There is no recurring "look for due events" job.
- Every committed live change writes `domain_event_outbox` in the same transaction.
- The outbox immediately wakes a Cloudflare Queue with retries and a dead-letter queue.
- Ably provides connection recovery. The app also reconciles Postgres whenever it
  connects or returns to foreground. Supabase Postgres Changes is a user-filtered
  safety net for private account, friendship, dismissal, and inventory rows. Shared
  social tables use Ably only; every handset must not receive every raw table change.
- Mutating RPCs are atomic and idempotent. A retried command returns its prior result.
- Friend requests, responses, removals, blocks, reports, moderation, posts, comments,
  reactions, poll votes, and poll-vote likes never rely on multiple client writes.
- Blocking removes the friendship, inserts the block, and creates a pending developer
  report in one transaction. The client hides that account's posts optimistically.
- Comment mention parsing, notification clear/dismiss state, profile writes, and
  suggestion approval also commit inside their owning command. There are no
  client-side cleanup transactions.

## API contract

- Mobile reads use PostgREST/RLS and React Query. Mobile writes use narrow
  `security definer` commands with `auth.uid()` checks, strict field allowlists,
  and explicit grants.
- Server-owned profile fields (admin/ban state, XP, streaks, Sparks, equipped
  inventory, and push-token ownership) are not directly writable by clients.
- Every replayable command carries a stable idempotency key. PostgreSQL takes a
  transaction-scoped advisory lock for that user/key before checking the durable
  receipt, so two simultaneous requests cannot both perform the action.
- Global mutation retries are disabled. Queries retry only transport, timeout,
  rate-limit, and 5xx failures with bounded exponential jitter. An individual
  atomic command may opt into retry only when it reuses its original key.
- Validation, authorization, uniqueness, and business-rule failures are returned
  immediately and never retried as if they were network failures.
- Realtime events contain identifiers, never trusted rows. Socket receipt triggers
  targeted query reconciliation; reconnect/foreground performs one coalesced
  authoritative catch-up from Postgres.
- Active reads are invalidated with `cancelRefetch: false`: a burst cannot perpetually
  abort and restart the same feed or poll request.
- Realtime hints are coalesced for 80 ms by `queryInvalidationBatcher`; all affected
  roots are invalidated in one cache traversal. Refreshes are single-flight with a
  350 ms minimum remote-update cadence. Events arriving during a read produce one
  trailing catch-up instead of overlapping or permanently restarting that read.
- Optimistic mutation completion uses the same batch. A committed challenge response
  never waits for feed/profile refetches before navigation; authoritative reads
  reconcile behind the direct-to-feed transition.

## Runtime flow

1. `schedule-daily-challenge` creates the future `daily_event` and registers its exact
   `fires_at` with `DojiEventAlarm`.
2. At `fires_at - 20 minutes`, the alarm calls `begin_daily_event_prelive`. One
   transaction retires the prior feed, stamps `prelive_at`, and publishes the safe
   `doji.pre_live` event without challenge content or push.
3. At `fires_at`, the alarm calls `activate_daily_event`. One transaction stamps
   authoritative times, fans out `user_events`, and writes global and per-user events.
4. The outbox wakes Cloudflare Queue, which invokes `relay-domain-events` immediately.
5. The relay preloads push profiles in one query, preserves order per Ably channel,
   drains independent channels with bounded concurrency, and submits high-priority push.
6. Connected devices update immediately. Background devices receive remote push.
7. The same Durable Object wakes at `closes_at` and calls `close_daily_event`.
8. After close, that one-shot alarm prepares and registers the next Doji. There is no
   recurring scheduler.

Push providers cannot guarantee OS display. App correctness never depends on push:
connected clients receive Ably events, while launch, foreground, and reconnect always
reconcile authoritative database state.

## Push delivery invariants

- An Expo token identifies one app installation. `profiles.notification_token` is
  unique, and `register_push_token` atomically transfers that installation to the
  currently authenticated account. Sign-out unregisters it when connectivity allows.
- The account master `push_enabled` preference gates every push category at delivery.
  Disabling phone alerts also unregisters the current token; startup and foreground
  reconciliation never re-register while the master preference is off.
- Installed legacy clients are protected by `profiles_transfer_push_token`; direct
  profile updates use the same atomic ownership transfer.
- A social action never calls Expo or `pg_net` from the row trigger. Direct alerts
  write one recipient event. Burst-prone friend participation, reactions, and comment
  likes write an immediate no-push invalidation plus a delayed grouped push row.
- Grouped pushes use fixed 30-second buckets delivered at bucket start + 60 seconds,
  so a recipient gets one aggregate alert 30-60 seconds after the action. The outbox
  `available_at` gate and a singleton Cloudflare Durable Object alarm are durable
  one-shot delivery, not recurring polling. The alarm retains only the earliest
  pending wake, so a large social burst cannot create duplicate timers. Bell history
  remains immediate and authoritative.
- Social recipient fanout is set-based, so one action creates one relay wakeup rather
  than one database HTTP wakeup per friend.
- Every sender calls `claim_push_delivery` before contacting Expo. Database, queue,
  HTTP, lease, and function retries therefore collapse to a successful no-op after the
  first claim.
- Outbox push keys use the immutable outbox event ID and recipient. Legacy direct
  events use their immutable entity ID; payloads without an entity ID are collapsed
  into a five-minute retry window.
- Realtime publication and push display are independent. A duplicate Ably message is
  harmless because clients deduplicate event IDs; a push must additionally pass the
  server delivery claim.
- Doji-live pushes use high priority and iOS time-sensitive interruption. Direct
  social pushes are active; grouped social pushes use normal transport priority.
  Stable `threadId`, `collapseId`, and Android `tag` values keep related alerts
  organized or replaced without changing durable in-app history.

These constraints prevent two historic amplification paths: multiple profiles owning
the same physical-device token, and a retried direct push request sending again after
the underlying social action had already committed.

## Channels

- `doji:global`: pre-live, activation, and close announcements.
- `feed:public`: coalesced feed, reaction, comment, poll-vote, and poll-vote-like
  hints; subscribed only while the feed is focused.
- `profiles:global`: retired; profile changes fan out to the account and accepted
  friends instead of every connected device.
- `leaderboard:global`: five-second-coalesced XP/rank hints; subscribed only while
  the leaderboard is focused.
- `user:{id}:events`: private friendship, block, badge, suggestion, and notification state.
- `moderation:global`: report queue changes; granted only to administrator tokens.

Messages contain identifiers, versions, and event IDs, not trusted application rows.
The app deduplicates event IDs and refetches authorized data through RLS. A shared
reconciliation function invalidates all server-owned surfaces on reconnect/foreground.

## User-visible mutation coverage

| Surface | Authoritative event | Scope | Client reconciliation |
| --- | --- | --- | --- |
| Doji pre-live/activation/close | `doji.*` | global + targeted user | upcoming state, occurrence, banner, feed, notification center |
| User occurrence/completion/buy-in | `user_event.updated` | user | current Doji, feed |
| Poll vote/result | `poll.vote.*` | global | friend/everyone results, voters, feed |
| Posts | `feed.post.*` | public or owner/friends | feed, post, profile posts |
| Reactions | `feed.reaction.*` | public or owner/friends | counts, voters, feed, post |
| Comments/replies/likes | `feed.comment*` | public or owner/friends | thread, counts, feed, post |
| Mentions and social alerts | `notification.*` | recipient | bell history and remote push |
| Friendships/blocks | `social.*` | involved users | graph, counts, feed, requests |
| Public profile/avatar/cosmetics | `profile.presentation.updated` | owner + friends | avatar-bearing active queries |
| Public profile statistics | `profile.stats.updated` | owner + friends | active profile and friends |
| Sparks/theme/preferences | `account.profile.updated` | user | auth profile and account UI |
| Store ownership | `shop.ownership.*` | user | owned inventory and auth profile |
| Badges | `badge.updated` + `notification.badge.*` | global + user | public profile badges, owner alert/profile |
| XP/rank | `leaderboard.updated` | global | active leaderboard/profile |
| Suggestions | `notification.suggestion.*` | owner | submission state and bell history |
| Moderation | `moderation.report.*` | admins | report queue |

Shared poll/WYR cards have community-wide aggregate state, but social alerts are
friend-scoped: only accepted friends of the actor receive participation, reaction,
or comment alerts. Targeted test events additionally require recipient cohort access.

The mobile feed key includes the authoritative current `daily_event_id`; no client
timezone query determines which occurrence is current. The pre-live transaction
deletes prior posts (and cascading comments/reactions), while historical occurrence,
vote, XP, streak, badge, and analytics data remains durable. Poll behavior is explicit
metadata: generic polls may have one `Other` option; WYR contains exactly two choices.

Unlocked pages come from `get_feed_page_snapshot`; poll cards use the constant-size
`get_poll_results_summary`, while a selected option pages voters through
`get_poll_option_voters_page`. The current Doji snapshot embeds its bounded poll
choices, so participation has no dependent request. Leaderboard and bell history use
bounded server snapshots, and friend lists page in 50-row windows. TanStack Query
restores the first cached feed page and reference data, then reconciles in place.

Opened comment threads use `get_comment_thread_snapshot`, which includes authorized
comments, safe author presentation, friend/everyone and block filtering, and the
viewer's like state in one query. The client does not fetch comment IDs, likes, and
the friend graph serially.

## 100k burst contract

- Pre-live provisions occurrence eligibility with one set-based insert. Activation
  updates the occurrence and commits one Ably event plus one resumable push-broadcast
  command; it never inserts one outbox row per account.
- Push recipients are keyset-paged in 1,000-account windows, claimed in one batch,
  and sent to Expo in paced batches of 100. The Cloudflare queue
  enqueues a continuation until every page and every pending outbox page is drained.
- Expo broadcast batches are paced below its 600-notifications/second project limit.
  Connected clients still receive activation immediately over Ably; if the product
  requires all 100k background devices to alert in materially under three minutes,
  store native device tokens and add direct APNs/FCM transports rather than exceeding
  the Expo service contract.
- Poll, community reaction, comment, and occurrence-participant counters use 128
  deterministic database shards. No launch burst may serialize on a single option,
  post, or reusable challenge row.
- Everyone-view totals sum fixed shards and fetch at most four indexed preview voters.
  Friends-view totals scan only the viewer's bounded social graph.
- Poll and public-feed invalidations coalesce to at most one event per aggregate/type
  per second. Profile invalidations are social-graph scoped; leaderboard invalidations
  coalesce to five-second windows.
- Push delivery remains an alert, never the authority for eligibility or the ten-minute
  server window. Reconnect/foreground always reconciles Postgres state.

## Security boundaries

- Mobile clients receive short-lived, capability-scoped Ably tokens.
- Only administrators receive the `moderation:global` capability.
- Cloudflare holds narrow orchestration and relay secrets, never the Supabase
  service-role key.
- Privileged work stays inside Supabase Edge Functions and `security definer` RPCs
  with explicit authentication and authorization checks.
- Socket payloads do not bypass RLS; clients always refetch Postgres rows.

## Deployment order

1. Create the Ably app/key and Cloudflare queues.
2. Set Worker secrets: `SUPABASE_URL`, `ORCHESTRATOR_SECRET`, `OUTBOX_RELAY_SECRET`.
3. Deploy `infra/doji-orchestrator`.
4. Set Edge secrets: `ABLY_API_KEY`, `OUTBOX_RELAY_SECRET`,
   `DOJI_ORCHESTRATOR_URL`, `DOJI_ORCHESTRATOR_SECRET`.
5. Deploy `realtime-token`, `relay-domain-events`, `orchestrate-doji`, and
   `schedule-daily-challenge`.
6. Apply all migrations in timestamp order and configure the orchestrator Vault values.
7. Invoke `schedule-daily-challenge` once. Every later alarm chains automatically.
8. Run a physical two-device test for activation, completion, social actions,
   friend/block/report actions, reconnect recovery, and close-boundary rejection.

`schedule-daily-challenge` is an internal preparation endpoint despite its legacy name.
It accepts only the orchestrator secret and is not attached to pg_cron.

## Required monitoring

- Alert on non-empty `doji-domain-events-dead-letter`.
- Alert on unpublished `domain_event_outbox` rows whose `available_at` is more
  than 60 seconds overdue; future grouped alerts are healthy, not backlog.
- Track Ably connection failures and Edge Function relay errors in Sentry.
- Track Expo push tickets/receipts separately from socket delivery.
- Alert when a token ownership transfer clears more than one prior profile or when
  duplicate push claims spike; both indicate a client/account or producer regression.
