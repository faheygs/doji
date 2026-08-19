# Doji authoritative realtime architecture

## Guarantees

- Postgres is the source of truth. Socket messages only announce committed state.
- `profiles.is_banned` is authoritative account-access state. Profile hydration or
  realtime reconciliation moves a banned session to the isolated ban route without
  deleting its auth session; normal app routes and push-token registration stay off.
- The handset clock never authorizes participation. `get_current_doji_state`,
  `submit_poll_vote`, and `complete_doji_with_post` use the database clock.
- The existing server-owned signup-day exception remains free through its authorized
  deadline. All other participants close at the shared 10-minute event deadline. A
  successful paid buy-in changes the occurrence to `buy_in_open`, which both
  submission commands accept without the original deadline. A newer Doji supersedes
  the older occurrence.
- Challenge pre-live, activation, and close use one durable Cloudflare alarm chain per `daily_event`.
  There is no recurring "look for due events" job.
- Every committed live change writes `domain_event_outbox` in the same transaction.
- The outbox immediately wakes a Cloudflare Queue with retries and a dead-letter queue.
- Ably provides connection recovery. The app also reconciles Postgres whenever it
  connects or returns to foreground. The handset does not open Supabase Postgres
  Changes subscriptions; using two socket transports duplicated invalidation and
  reconnect work. Every handset must not receive every raw table change.
- Mutating RPCs are atomic and idempotent. A retried command returns its prior result.
  If a client receives an ambiguous transport failure, it reconciles the authorized
  receipt/read model before presenting failure; a committed response is treated as
  success without issuing a second direct write.
- Friend requests, responses, removals, blocks, reports, moderation, posts, comments,
  reactions, poll votes, and poll-vote likes never rely on multiple client writes.
- Blocking removes the friendship and inserts the block in one transaction. It is a
  personal privacy action and never creates a moderation report; only the explicit
  report command enters the admin queue. The client hides that account's posts
  optimistically.
- Comment mention parsing, notification clear/dismiss state, profile writes, and
  suggestion approval also commit inside their owning command. There are no
  client-side cleanup transactions.
- Accepted friend circles are server-capped at 500 and outgoing pending requests at
  100. Accept paths serialize capacity checks with per-account advisory locks, so
  concurrent accepts cannot exceed the bound. Interactive post, completion, community
  reaction, and community-comment transactions enqueue one durable internal command;
  the relay expands that bounded graph only after the source transaction commits.
- New-account profile creation requires a server-clock 13-plus check. The submitted
  birth date is never stored; only the result, method, policy version, and timestamp
  are retained in the owner-only `age_assurances` table.

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
- Ably is the only handset socket transport. The client does not duplicate the same
  commit through Supabase Postgres Changes; transactional outbox delivery plus
  reconnect/foreground reconciliation provides ordered hints and authoritative repair.
- Active reads are invalidated with `cancelRefetch: false`: a burst cannot perpetually
  abort and restart the same feed or poll request.
- Realtime hints are coalesced for 80 ms by `queryInvalidationBatcher`; all affected
  roots are invalidated in one cache traversal. Refreshes are single-flight with a
  350 ms minimum remote-update cadence. Events arriving during a read produce one
  trailing catch-up instead of overlapping or permanently restarting that read.
- Public feed hints use event-specific query roots. Comment likes refresh comments;
  reactions refresh reaction-bearing post surfaces; poll votes refresh poll results.
  A social event never invalidates every public feed query family by default.
- `feed:public` carries only coalesced post-membership hints. Engagement is routed to
  `post:{postId}` and subscribed only while an unlocked card/thread is mounted.
  Friend-feed membership is routed to the author and accepted friends' private
  channels. This removes the previous all-users-by-all-actions amplification.
- Optimistic mutation completion uses the same batch. A committed challenge response
  never waits for feed/profile refetches before navigation; authoritative reads
  reconcile behind the direct-to-feed transition.
- A reaction/comment intent patches the actor's cache synchronously before cancellation
  acknowledgement or the RPC. The cancellation signal prevents stale reads from
  overwriting it; the authoritative response and post socket then reconcile counts.
- Changing a reaction emoji moves its fixed-shard breakdown count in the same database
  transaction as the base reaction row. Feed snapshots and targeted engagement reads
  therefore cannot disagree after a reaction switch.
- Presentation motion never owns server state or delays reconciliation. Cold reads may
  crossfade a shape-matched skeleton into content, while cached reads remain interactive.
  Native sheet dismissal completes before a queued route action is allowed to run.

## Runtime flow

1. `schedule-daily-challenge` creates the future `daily_event` and registers its exact
   `fires_at` with `DojiEventAlarm`.
2. At `fires_at - 20 minutes`, the alarm calls `begin_daily_event_prelive`. One
   constant-time transaction stamps `prelive_at` and publishes the safe `doji.pre_live`
   event without challenge content or push. Active reads move to the new occurrence;
   prior social content is retained rather than deleted on the launch path.
3. At `fires_at`, the alarm calls `activate_daily_event`. One transaction stamps
   authoritative times, creates 128 fixed push partitions, and writes one global event.
   Eligible `user_events` materialize lazily when an account requests current state.
4. The outbox wakes a singleton Cloudflare Durable Object. It coalesces a 250 ms burst
   and seeds 16 one-message Queue drain lanes; full 100-row claims double their
   continuation lanes up to 128, while small backlogs remain at the initial footprint.
5. The relay claims critical activation and realtime-only rows ahead of push-only
   backlog, explicitly orders each claim, and atomically publishes each channel batch
   to Ably. It durably records that publication before optional push work begins.
   Independent channels drain with bounded concurrency.
6. Connected devices update immediately. Background devices receive remote push.
7. The same Durable Object wakes at `closes_at` and calls `close_daily_event`.
8. After close, that one-shot alarm prepares and registers the next Doji. There is no
   recurring scheduler.

Re-registering the same event phase always re-arms the Durable Object alarm; stored
phase state is not proof that an alarm is still pending after a failed invocation.

Push providers cannot guarantee OS display. App correctness never depends on push:
connected clients receive Ably events, while launch, foreground, and reconnect always
reconcile authoritative database state.

## Push delivery invariants

- `device_push_endpoints` privately stores one native APNs/FCM endpoint per app
  installation. `register_native_push_endpoint` atomically transfers rotating tokens
  to the authenticated account; sign-out disables only that installation. At most five
  recent active installations are retained per account and recipient reads return the
  bounded set rather than silently selecting one device. The unique
  Expo token on `profiles` remains a migration fallback, not the 100k broadcast path.
- The account master `push_enabled` preference gates every push category at delivery.
  Disabling phone alerts also unregisters the current token; startup and foreground
  reconciliation never re-register while the master preference is off.
- Installed legacy clients are protected by `profiles_transfer_push_token`; direct
  profile updates use the same atomic ownership transfer.
- A social action never calls a push provider from the row trigger. Direct alerts
  write one recipient event. Burst-prone friend participation, reactions, and comments
  write one internal command; the asynchronous expansion batch-publishes lightweight
  friend invalidations and creates delayed grouped push rows where appropriate.
- Multiple outbox inserts in one business transaction enqueue one `pg_net` relay wake.
  Statement-level conflict updates with no inserted transition rows enqueue none.
  The singleton Durable Object collapses simultaneous transaction wakes into 16
  initial drain lanes. Repeated full claims scale geometrically to a hard 128-lane
  ceiling; the transactional outbox rows remain durable.
- Grouped pushes use fixed 30-second buckets delivered at bucket start + 60 seconds,
  so a recipient gets one aggregate alert 30-60 seconds after the action. The outbox
  `available_at` gate and a singleton Cloudflare Durable Object alarm are durable
  one-shot delivery, not recurring polling. The alarm retains only the earliest
  pending wake, so a large social burst cannot create duplicate timers. Bell history
  remains immediate and authoritative.
- Social recipient fanout is set-based and asynchronous. One action creates one relay
  wakeup and one internal outbox command rather than blocking the user write or making
  one database HTTP wakeup per friend. Lightweight friend invalidations use Ably's
  multi-channel batch endpoint in bounded 100-channel requests and client event-ID
  deduplication; the database creates per-recipient child rows only for durable grouped
  phone alerts. Per-source/per-recipient once keys prevent a retried expansion from
  incrementing a grouped alert twice, and idempotent child keys make relay retries safe.
- Profile presentation/stats and badge-progress triggers use the same identifier-only
  batch fanout. Buying/equipping a frame or earning a badge never inserts one outbox
  row per friend in the interactive transaction.
- Every sender claims delivery before contacting a provider. The first
  event/recipient/installation insert is terminal; conflicts never reopen an unfinished claim.
  Database, queue, HTTP, lease, and function retries therefore collapse to a no-op.
  provider ticket/outcome recording is telemetry and can never authorize another send.
- Provider handoff is attempted once. An ambiguous timeout is terminal rather than
  retried because APNs, FCM, or Expo may have accepted the request even when its
  response was lost.
  Doji correctness comes from Postgres, Ably, and reconciliation, so the rare missed
  alert is safer than a duplicate-notification storm.
- Every claimed outbox row includes its immutable `created_at`. Doji pushes are
  rejected after two minutes or after `closesAt`, whichever comes first; all other
  pushes are rejected after five minutes. This freshness gate runs before delivery
  claims and before Expo TTL is assigned, so old backlog can drain without alerting.
- Outbox push keys use the immutable outbox event ID, recipient, and installation. Legacy direct
  events use their immutable entity ID; payloads without an entity ID are collapsed
  into a five-minute retry window.
- Realtime publication and push display are independent. A duplicate Ably message is
  harmless because clients deduplicate event IDs; a push must additionally pass the
  server delivery claim.
- Push backlog never sits in front of live app state. The
  relay publishes the full ordered Ably channel batch first and only then performs
  slower Expo side effects. A durable `realtimePublished` marker prevents a relay retry
  from republishing or delaying the corresponding socket event.
- Doji-live pushes prefer direct APNs or FCM, with Expo as a transitional fallback
  until an installation has registered its native endpoint. This avoids Expo's 600/s
  project cap. Required secrets are `APNS_KEY_ID`, `APNS_TEAM_ID`,
  `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and
  `FCM_PRIVATE_KEY`. Doji pushes use high priority and iOS time-sensitive interruption. Direct
  social pushes are active; grouped social pushes use normal transport priority.
  Stable `threadId`, `collapseId`, and Android `tag` values keep related alerts
  organized or replaced without changing durable in-app history.

These constraints prevent three historic amplification paths: multiple profiles owning
the same physical-device token, duplicate producers for one action, and a provider
handoff being repeated when its database acknowledgement failed.

## Channels

- `doji:global`: pre-live, activation, and close announcements.
- `feed:public`: coalesced public post-membership hints only; subscribed only while
  the feed is focused. Engagement and poll-vote changes use mounted post channels.
- `profiles:global`: retired; profile changes fan out to the account and accepted
  friends instead of every connected device.
- `leaderboard:global`: five-second-coalesced XP/rank hints; subscribed only while
  the leaderboard is focused.
- `user:{id}:events`: private friendship, block, badge, suggestion, and notification state.
- `moderation:global`: report queue changes; granted only to administrator tokens.

Messages contain identifiers, versions, original occurrence time, and event IDs, not trusted application rows.
Friend fanout batch envelopes use the durable outbox UUID as both Ably's client-supplied
message ID and `data.eventId`; other messages retain `data.eventId` for application
deduplication. Clients still treat every event as an invalidation hint and refetch.
The app deduplicates event IDs and refetches authorized data through RLS. A shared
reconciliation function invalidates all server-owned surfaces on reconnect/foreground.

## User-visible mutation coverage

| Surface                           | Authoritative event                      | Scope                   | Client reconciliation                                         |
| --------------------------------- | ---------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| Doji pre-live/activation/close    | `doji.*`                                 | global + targeted user  | upcoming state, occurrence, banner, feed, notification center |
| User occurrence/completion/buy-in | `user_event.updated`                     | user                    | current Doji, feed                                            |
| Poll vote/result                  | `poll.vote.*`                            | mounted post            | friend/everyone results, voters, feed                         |
| Posts                             | `feed.post.*`                            | public or owner/friends | feed, post, profile posts                                     |
| Reactions                         | `feed.reaction.*`                        | mounted post            | targeted engagement snapshot and voters                      |
| Comments/replies/likes            | `feed.comment*`                          | mounted post            | exact thread and targeted engagement snapshot                |
| Mentions and social alerts        | `notification.*`                         | recipient               | bell history and remote push                                  |
| Friendships/blocks                | `social.*`                               | involved users          | graph, counts, feed, requests, open profiles                  |
| Public profile/avatar/cosmetics   | `profile.presentation.updated`           | owner + friends         | avatar-bearing active queries                                 |
| Public profile statistics         | `profile.stats.updated`                  | owner + friends         | active profile and friends                                    |
| Sparks/theme/preferences          | `account.profile.updated`                | user                    | auth profile and account UI                                   |
| Store ownership                   | `shop.ownership.*`                       | user                    | owned inventory and auth profile                              |
| Badges                            | `badge.updated` + `notification.badge.*` | global + user           | public profile badges, owner alert/profile                    |
| XP/rank                           | `leaderboard.updated`                    | global                  | active leaderboard/profile                                    |
| Suggestions                       | `notification.suggestion.*`              | owner                   | submission state and bell history                             |
| Moderation                        | `moderation.report.*`                    | admins                  | report queue                                                  |

Shared poll/WYR cards have community-wide aggregate state, but social alerts are
friend-scoped: only accepted friends of the actor receive participation, reaction,
or comment alerts. Targeted test events additionally require recipient cohort access.

The mobile feed key includes the authoritative current `daily_event_id`; no client
timezone query determines which occurrence is current. Pre-live changes that logical
feed identity without deleting prior posts, comments, or reactions. Historical
occurrence, vote, XP, streak, badge, and analytics data remains durable. Poll behavior
is explicit metadata: generic polls may have one `Other` option; WYR contains exactly
two choices.

Unlocked pages come from `get_feed_page_snapshot`; poll cards use the constant-size
`get_poll_results_summary`, while a selected option pages voters through
`get_poll_option_voters_page`. The current Doji snapshot embeds its bounded poll
choices, so participation has no dependent request. Leaderboard and bell history use
bounded server snapshots, and friends, friend requests, blocked users, and social
voter sheets use stable keyset cursors. Count-only UI calls constant-size count RPCs
instead of downloading each collection. `get_post_detail` owns both locked-post/block
authorization and its nested safe profile projection. TanStack Query restores the
first cached feed page and reference data, then reconciles in place.

Block filtering applies bidirectionally to social content and activity, but not to
the global leaderboard. `get_public_profile_view` exposes an explicit access state:
when the target blocked the viewer, it returns no profile fields. Both accounts receive
the identifier-only block event so an already-open profile reconciles immediately.
Administrators read pending report evidence through a bounded safe-field snapshot that
is not suppressed by viewer-relative content blocking.

Opened comment threads use `get_comment_thread_snapshot`, which includes authorized
comments, safe author presentation, friend/everyone and block filtering, and the
viewer's like state in one query. The client does not fetch comment IDs, likes, and
the friend graph serially.
The mutation actor inserts a stable optimistic comment and updates the cached post
counter before the network round trip. Other mounted clients receive canonical
`feed.comment.*`/`feed.reaction.*` post-channel hints, then reconcile through the
bounded `get_post_engagement_snapshot` and exact active thread. Counter maintenance
must not emit `feed.post.*`, because that would turn every engagement action into a
feed-wide refresh.

## 100k burst contract

- Pre-live and activation are constant-time with respect to account count. Activation
  commits one Ably identifier event and exactly 128 resumable push-shard rows; it never
  inserts one occurrence or outbox row per account.
- Current-state reads lazily and idempotently materialize the requesting account's
  authorized occurrence. Push delivery and participation correctness are independent.
- Each deterministic shard is independently leased. Recipients are keyset-paged in
  500-account windows, their bounded active installations are terminally claimed in
  one batch, and delivery uses bounded
  native-provider concurrency. Cloudflare Queue runs up to 16 shard messages
  concurrently and enqueues continuations until completion or expiry. Expo batches
  are used only for installations not yet migrated.
- The checked-in launch model separately models database/queue orchestration and
  provider capacity. It explicitly fails if Expo's documented 600/s limit is treated
  as the 100k scale path. Direct native delivery must sustain the modeled provider-rate
  target in a staging load test before a 100k launch.
- `npm run test:social-fanout-model` makes the friend-degree and ten-minute burst
  assumptions explicit. Its output is a required-throughput budget, not evidence that
  Supabase or Ably achieved it; staging must exceed the reported Ably request and
  grouped push-row rates with at least 25% relay and direct-provider headroom, and
  Postgres must sustain the reported set-based grouped-upsert rate. The model includes
  both internal source commands and their grouped push children.
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
- `PUBLIC` and `anon` have no execution privilege on `security definer` functions.
  Mobile RPCs are allowlisted to `authenticated`, fixed `search_path` values prevent
  caller-controlled name resolution, and RLS auth helpers are statement-cached.
  Security-definer helpers referenced by authenticated RLS policies retain explicit
  `authenticated` execute grants; revoking those grants makes the policy fail closed.
- A clean database bootstrap does not require an existing Apple reviewer Auth user;
  reviewer profile setup is an optional, idempotent post-bootstrap action.
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

The checked-in `wrangler.staging.jsonc` uses a separate worker, queues, dead-letter
queues, Durable Object namespace, Supabase project, and credentials. Never point the
production worker at a staging database or reuse production delivery queues for a gate.

`schedule-daily-challenge` is an internal preparation endpoint despite its legacy name.
It accepts only the orchestrator secret and is not attached to pg_cron.

## Required monitoring

- Alert on non-empty `doji-domain-events-dead-letter`.
- Alert on unpublished `domain_event_outbox` rows whose `available_at` is more
  than 60 seconds overdue; future grouped alerts are healthy, not backlog.
- Alert when `get_doji_push_fanout_health` reports pending/processing shards 60 seconds
  after activation, any failed shard, or acceptance materially below claimed delivery.
- Track Ably connection failures and Edge Function relay errors in Sentry.
- Track Expo push tickets/receipts separately from socket delivery.
- Alert when a token ownership transfer clears more than one prior profile or when
  duplicate push claims spike; both indicate a client/account or producer regression.
