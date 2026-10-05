# Member performance investigation — September 27, 2026

Historical investigation status (superseded by the approved repair release in
`PERFORMANCE_REPAIR_2026-09-28.md`): diagnosis and offline reproduction only. No member/portal code, production
schema/policy, compute, session, alert settings, provider configuration or release
was changed. No paid test or live load generation was performed.

This extends `ALERT_DIAGNOSIS_2026-09-27.md`. The original email-only provider/network
classification is not a sufficient diagnosis; historical database evidence below
is stronger. Root cause of the broad database stall is still unconfirmed.

## 1. Confirmed historical database timeouts

Signed-in Supabase Logs Explorer returned eight actual `canceling statement due to
statement timeout` errors in the last-day search (September 27 01:02 to September
28 01:04 UTC). All were clustered in the incident:

| September 27 UTC | RPC / cancellation location |
| --- | --- |
| 19:35:53.981 | `get_current_profile_post` -> `get_post_detail` startup |
| 19:35:55.378 | `get_feed_page_snapshot_v2` authorized page query |
| 19:35:55.747 | `mark_domain_events_realtime_published` outbox UPDATE |
| 19:35:56.709 | `get_friend_fanout_realtime_topics` exact outbox lookup |
| 19:35:56.936 | `mark_domain_events_realtime_published` outbox UPDATE |
| 19:35:57.023 | `get_realtime_token_capabilities` exact profile lookup |
| 19:35:57.128 | `get_post_reaction_voters_page` authorized reaction page |
| 19:35:57.245 | `mark_domain_events_realtime_published` outbox UPDATE |

The final acknowledgement log ID is `df9cf14e-26ca-4e4f-b880-795ce760a24e`.
The feed timeout ID is `f89dba7e-2c82-4fb9-bc0d-0d2cda21163f`.

The relay calls the acknowledgement RPC after provider publication. Its timeout
can therefore lead to another attempt even after provider acceptance. An attempt
count above one does not by itself establish Ably failure. Identifier invalidations
must remain safe to replay, and push receipts/idempotency must remain unchanged.

A separate monitoring query aggregating `extensions.pg_stat_statements` took
11,891 ms at 19:35:35.863 (log `4f8fa66f-5e50-4196-9674-b5f8809fba2f`). Broad
timeouts, including exact lookups, warrant resource/connection/lock investigation,
not speculative indexes on just the feed. Cancellation locations do not identify
the initiating blocker. No historical blocking PID or execution plan establishing
the initiating cause was recovered.

The Sentry feed event at 19:35:29 precedes the retained feed database timeout.
They overlap the same degradation period, but are not request-correlated; do not
claim they are the same request.

## 2. Two reproducible client defects

`node scripts/probe-member-request-lifetime.mts` runs the actual TypeScript modules
with fake transport/timers and the installed React Native AbortController polyfill.
It uses no network and changes no implementation:

- `lib/scaleReadGateway.ts` throws `request.signal.reason` on its deadline. The
  installed `abort-controller` used by React Native has no `reason` property.
  Reproduction: the promise rejects with `undefined`. `isTransientApiError` rejects
  non-object values, so the intended bounded transient-read retry is skipped and
  telemetry reports `non_error` / unexpected. This is a proven failure mechanism
  consistent with the event, not conclusive attribution of that historical event.
- `lib/feedQueries.ts` returns the gateway promise without awaiting it inside its
  `try/finally`. Both locked and unlocked paths run cleanup while transport is still
  pending. Reproduction: zero active outer deadlines and parent cancellation does
  not reach the transport. The gateway retains its own deadline, but the direct
  path loses its outer deadline and obsolete reads are no longer linked correctly.

Repair scope: keep cleanup attached until completion, retain an explicit portable
abort reason/source independent of runtime signal support, normalize true deadlines
without converting lifecycle cancellation into retries, and preserve response-body
timeouts, one bounded read retry, auth recovery, and no direct-read fallback in
scale mode. Test real installed polyfill as well as Node's native controller.
Do not increase global retries or hide unexpected failures.

## 3. Confirmed suggestion-history authorization defect

Nine `permission denied for table profiles` entries appeared between 19:34:36 and
19:35:30. The inspected request matches `hooks/useSuggestions.ts`'s own-submission
read with a safe-field reviewer join. Its SELECT policy still contains a direct
`profiles.is_admin` subquery.

Live contract read at 01:10 UTC confirmed:

- authenticated may SELECT suggestions and safe profile `id`;
- authenticated may not SELECT private `profiles.is_admin` or the full profile table;
- `challenge_suggestions_select_own` still directly references `profiles.is_admin`.

`scripts/probe-suggestion-read-permission-20260927.sql` used a read-only transaction,
`SET LOCAL ROLE authenticated`, a synthetic UUID and LIMIT 1. It reproduced SQLSTATE
42501 without reading member content. The tool's suggestion to grant full profile
SELECT is explicitly NOT the repair: it would violate the privacy contract.

Proposed separate backend scope: use the existing narrow security-definer admin
predicate in the policy while preserving ownership and current member/admin access.
Verify all applicable suggestion SELECT/UPDATE policies and counts. Do not broaden
profile columns, give employee identities member rights, or change reward/approval
commands. Confirm with a local real-role regression before proposing exact migration.

## 4. Capacity evidence and no-cost opportunity

The live infrastructure page shows Pro organization, primary `t4g.nano`, NANO
selected (up to 0.5 GB RAM), 60 database connections, and no read replicas.
MICRO is explicitly labelled **Free Upgrade**, 1 GB RAM, at the same $0.01344/hour
displayed for Nano. No selection or configuration was changed.

The incident resource charts (19:25–19:45 UTC) show substantial swap occupancy and
IO-wait activity. These are evidence supporting memory-pressure investigation, not
proof of causation; swap occupancy alone is not swap-in/out activity. Some resource
charts were unavailable. Do not equate a headline average or current idle state with
peak capacity or claim CPU saturation from these charts.

Supabase's official docs confirm Nano on a paid organization is charged like Micro;
it is not automatically upgraded because of downtime. Compute changes usually incur
less than two minutes of downtime but may take longer. A no-incremental-cost Micro
change is worth preparing, not applying without a separately approved maintenance
window. Keep storage, spend cap, IOPS, replicas, provider plans and credentials fixed.
Reconfirm the final price before any change; stop on a nonzero incremental charge.

Compute is shared by members and portal. Before a change, verify backups/recovery
access, record settings, check no live/imminent Doji or unfinished delivery, and
obtain explicit approval for interruption. Afterward verify auth refresh, profile,
feed, comments, idempotent commands, realtime reconnect, durable alarms and delivery
recovery. Do not promise an instant Nano rollback: paid projects generally cannot
launch Nano. Recovery planning must account for platform provisioning failure and
support rather than assuming a reversible size toggle.

## 5. 100,000-user readiness is NOT demonstrated

Existing `scripts/load/fanout-model.mts` and `social-fanout-model.mjs` execute arithmetic
capacity budgets. They are not database, provider or physical-device load tests.

Historical default offline results (the social model's unsupported grouping and
headroom assumptions were removed in the September 28 repair; do not reuse these as
current capacity evidence):

- Launch: 100,000 recipients, 128 shards, 16 concurrent invocations; 40-second
  modeled completion assumes a measured native-provider throughput of 2,500/s.
  Expo-only lower bound is 167 seconds at its documented 600/s, beyond the existing
  120-second launch expiry. Actual eligibility, installations and fallback share matter.
- Social: 100k users, two actions each in 60 seconds, 25 friends average produces
  3,334 source events/s, 83,334 modeled realtime deliveries/s and 41,667 modeled
  push upserts/s. The passing headroom depends on assumed capacities, not measurements.
  Its 30-second grouping assumption must also be reconciled with the current immediate
  phone-push policy before treating the model as a current workload specification.

Do not claim that today's Nano, the free Micro upgrade, or current provider packages
are certified for 100k simultaneous participants. Provider/account limits have not
all been verified. Do not buy capacity or run 100k traffic against production.

### Proposed acceptance programme (not yet executed)

1. Treat 100k accounts/recipients as the data-size target. Confirm peak concurrent
   participation separately; exercise 1k, 10k and eventually 100k burst scenarios
   against approved isolated capacity, not members' production services.
2. First reproduce locally with synthetic data: simultaneous launch reads, poll/photo
   completion, feed/comments/reactions, notification reads, token refresh, relay claims
   and bounded portal reads. Record plans, waits, operation latency and resource use.
3. Provisional UX target: visible tap feedback within 100 ms on representative devices;
   pending state is not committed success. Preserve optimistic rollback and authoritative
   reconciliation on ambiguous outcomes. Measure slow networks, app backgrounding,
   dropped sockets and process restarts, not just ideal Wi-Fi.
4. Retain the documented realtime target p95 <1 s / p99 <2 s; measure commit-to-provider
   and actual client-visible completion separately. Define per-command/read SLOs and
   error budgets before gating scale approval; mean latency is insufficient.
5. Validate every due launch partition completes before the existing two-minute expiry,
   and separately measure provider acceptance, receipts and representative handset
   display. Push acknowledgement cannot guarantee handset display time.
6. Preserve zero duplicate economic effects, no lost committed writes, authorization,
   private profile fields, employee/member session separation, and the ten-minute
   server-owned challenge window across concurrency/retry/failure tests.
7. Host-level capacity proof and physical-device tests remain release gates. Current
   no-new-cost constraint permits local preparation, not unapproved hosted load costs.

## Proposed next repair batch and release boundaries

- **Member-only local preparation:** fix the two request-lifetime defects, retain
  existing queued query fixes, add realistic native-runtime tests and device checklist.
  Revert these source changes before building if they fail acceptance. No build yet.
- **Separately approved shared preparation:** narrowly repair suggestion authorization;
  correct stage attribution/safe timing diagnostics only where justified. Preserve
  exact previous function/policy definitions and all unrelated grants/RLS; test own,
  other-member, anonymous and employee identities before a separate deployment approval.
  SQL rollback restores only the replaced definitions, never member data.
- **Separate infrastructure maintenance:** same-price Nano-to-Micro change only after
  explicit downtime approval and final cost verification. It is not a 100k clearance.
- **Scale work:** measured synthetic workload and provider-limit inventory, followed by
  approved isolated tests if existing allowances permit. No portal release bundles.

## Primary references checked

- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/troubleshooting/memory-and-swap-usage-explained-aPNgm0
- https://supabase.com/docs/guides/troubleshooting/exhaust-swap
- https://supabase.com/docs/guides/database/query-optimization
- https://supabase.com/docs/guides/platform/performance
- https://ably.com/docs/platform/pricing/limits
- https://docs.expo.dev/push-notifications/faq/
- https://docs.expo.dev/push-notifications/sending-notifications/

Evidence sources: signed-in Supabase Logs/Observability/Infrastructure UI, existing
Sentry event, source/dependency inspection, offline probe above and bounded linked
read-only SQL. Supabase dashboard error percentages count service/log-specific
denominators and must not be presented as the member-request failure rate.
