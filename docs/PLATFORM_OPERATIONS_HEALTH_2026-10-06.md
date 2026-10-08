# Platform operations health — portal live, shared feed gated

Status: portal-only release `5f9c93d5-c72f-4693-b22a-dd32257e8ab8` is live,
with asset revision `fc05ff9ee7be87fc`. Shared health events remain disabled.
Owner approved shared deployment only after capacity/no-additional-cost checks.
The authenticated Ably dashboard shows the current Standard package at $29/month
plus metered usage, not the displayed alternative Free package. No incremental
budget was authorized; the no-additional-cost gate has not passed. No shared SQL,
collector, runtime, billing or provider configuration was deployed or changed.

## October 6 portal-only release evidence

- Exact packaged browser suite: all 14 checks pass, including production-flag
  queue geometry, single safety tables, health reconciliation and permission gates.
  An outdated test expectation was corrected to expect the enabled area-specific
  safety table, while still rejecting the duplicated personal-work table.
- Live changed-asset hashes match the tested artifact. Existing proxy and unrelated
  files are byte-preserved. Backend function, role and policy fingerprints match;
  business/public deployments are unchanged. `healthEventsEnabled` is false.
- Bounded manifests: `test-results/admin-health-ui-20261006/`.
  Exact rollback artifact: `test-results/admin-unified-safety-cache-20261006-v2/site`.
- After owner sign-in, authenticated live Operations DOM and visual checks passed:
  aligned health cards, quiet-window state, separate observation/receipt times,
  connected event transport, bounded 12-event history, expandable coverage details
  and explicit limited-visibility warning. The displayed snapshot at 4:52 PM Denver
  showed no overdue/exhausted outbox events or stale/exhausted push shards and no
  unresolved issues returned by the bounded Sentry query. This is not evidence of
  all-service health or new shared-feed delivery. No case or moderation write occurred.
- The verification counts below describe local candidate qualification, not live
  shared-feed acceptance or a new whole-repository coverage result.

## Portal changes

- Separate incident severity from measurement coverage. Quiet / low-sample traffic,
  first load, failed reads, stale snapshots and actual delivery failures are distinct.
- Command center reads the same bounded 12-row history as Platform operations;
  unloaded history is no longer presented as an absent Doji summary.
- Unresolved Sentry groups mean **Watch**, not proof of a current outage. Delivery
  backlog, exhaustion, credential errors and latency thresholds retain their severity.
  Malformed issue lists and missing event counters cannot produce a healthy result.
- Show observation times separately from snapshot receipt time, event-connection
  state, updating indicator, affected signals, service cards and recent Doji history.
- Keep threshold explanations and the explicitly partial service-monitoring inventory
  in expandable sections. Preserve expansion/focus when readings reconcile.
- Remove the normal manual health-refresh button. Existing authorized Doji events,
  reconnect and foreground reconciliation remain the automatic triggers.
- Coalesce event bursts, serialize event-triggered refreshes, and remember an event
  received during an in-flight refresh. Hidden pages do not start event-triggered
  network work. Lock/logout fences pending replies and clears refresh state.
- No new polling or production writes. The separately approved shared-runtime
  candidate below is local only; existing Sentry calls remain bounded and cached.

## Remaining requirement: genuinely event-driven service health

The existing event connection is NOT a comprehensive health feed. The operational
health monitor does not publish health-change hints; Sentry reads are cached up to
60 seconds and delivery reads up to 30 seconds. A connected browser can still have
an outdated snapshot. The UI states this rather than showing a false universal
live/healthy badge. The local changes must not be described as completing the
owner's immediate, all-service health requirement.

The approved preparation covers items 1–3 below for delivery and Doji summaries.
Items 4–5 remain open; this is not complete all-service visibility:

1. An employee-only operations channel, authorized by `operations_read` independently
   of moderation rights. Never send health payloads or identities over member channels.
2. Identifier/revision-only change hints from existing health producers and finalized
   Doji summaries; authoritative authorized reads remain the data source. No second
   monitor performing repairs, and no new database polling loop.
3. Per-source observation time, expiry and cache invalidation/version semantics so
   a change event cannot re-install an older cached result as current. Include recovery
   hints and bounded replay/reconciliation after disconnect or foreground return.
4. A verified, no-additional-cost Sentry change source before claiming immediate
   error updates. No webhook/credential/provider changes without explicit scope.
5. Explicit monitoring contracts for member API success, auth/session continuity,
   Worker/hosting, storage, WorkOS and email; unsupported signals stay unmeasured.
   Successful portal reads alone do not establish provider-wide health.

Member impact review must bound new reads/messages, preserve existing alarms,
member authentication, delivery/retry semantics, RLS and event authorization.
Regression tests must cover denied subscriptions, no member access, burst load,
replay/deduplication, delayed/stale snapshots, source failure/recovery, cache
invalidation, lock fencing and existing member contracts. Deployment stays gated
with exact previous runtime/artifact snapshots, default-off enablement and rollback
that disables the new feed before restoring previous code. Do not bundle a shared
deployment into the portal release.

## Local verification

- Health model: 41 passing tests; existing health-boundary suite: 104 passing tests.
- Final browser runs: 31 health/loading/portal/queue checks passed, plus 10 packaged
  independent-employee integration checks passed. One unrelated exact-production
  queue-geometry check is intentionally skipped without a production-flag artifact;
  no claim of new live-release qualification. Browser checks cover layout at
  1440/900/390px, light/dark accessibility, first-load
  history, automatic event/reconnect updates, event coalescing/in-flight invalidation,
  permissions, lock fencing, stale reclassification without polling and audit loading.
- Website/tooling TypeScript, scoped ESLint and `git diff --check` pass. Desktop
  and mobile screenshots were visually inspected. No claim of new whole-repo
  coverage or live service-event acceptance. No deployments occurred.

## Approved employee health-event candidate — October 6

- `docs/drafts/employee_health_feed_v1.sql` adds private default-off settings and
  at most three source-version rows. No existing RPC/RLS definition is replaced.
  Service-only writes atomically update the version and enqueue
  `staff.health.changed` on `staff:health:operations`; payload is only source and
  revision. Versions are time-seeded to avoid old outbox-key reuse after rollback
  and reapplication, and remain monotonic within each source. Late/duplicate
  observations are ignored. Writer lock timeout is 250ms.
- The existing operational-health collector has an optional nonblocking delivery
  sidecar (`EMPLOYEE_HEALTH_EVENTS_ENABLED`, default absent/off), with one 2-second
  request and no retry. Original health/alarm/archive reads and response remain.
  A trigger on the existing **admin telemetry table**, not a member table, emits
  one history hint per archive transaction. Captured-at-only writes do not emit.
  Sidecar errors cannot abort original summary persistence.
- Independent employee runtime config `healthEventsEnabled` and browser build flag
  `DOJI_ADMIN_HEALTH_EVENTS_ENABLED` default off. Channel tokens require current
  operations permission and the enabled database feed; member/business identities
  cannot use the fixed employee bridge. Current authorization precedes cache hits.
- Health reads compare authoritative versions before and after reading caches;
  changes invalidate cache entries. One reconciliation retry is allowed, then a
  visible unavailable response. Cached Sentry observation times are not restamped
  by a new response envelope. No Sentry producer was installed or configured.
- Browser accepts known sources and increasing revisions, coalesces event bursts,
  refreshes only visible operations/overview, and reconciles on existing reconnect
  and foreground paths. An event during initial navigation reads schedules a fresh
  follow-up instead of accepting the pre-event request. Lock fences old callbacks.

### Load and isolation review — deployment gates remain

The existing monitor runs once per minute. Normal added work is at most one
delivery observation per successful check and one history event per changed
archive transaction (existing archive limit five summaries). With one scheduled
check per minute this is up to 2,880 outbox events/day before subscriber deliveries;
manual/concurrent invocations can add work and are not capped by that estimate.
There is no new schedule or handset work. Each visible health refresh adds two
three-row metadata reads, at most four if source versions change during the read;
history stays bounded to 12 summaries. Tokens add one metadata authorization read.
Delivery/Sentry caches retain their 30/60-second TTLs absent revision changes.

This is shared infrastructure, not physical isolation or zero member impact.
Health events use the existing outbox/relay and therefore contribute to its aggregate
delivery/backlog/latency metrics. Those metrics must not be presented as exclusively
member-device traffic. This candidate does not alter the shared health thresholds
or suppress those events from existing monitoring. Production capacity/free-tier
headroom and load under concurrent employees remain release gates; no claim of
100,000-user readiness or production latency validation is made.

Before any separately approved deployment: preserve exact database definitions and
grants plus current collector/employee/browser artifacts; qualify the exact package,
verify capacity and bounded synthetic delivery/recovery, install disabled, then
enable database/producer/runtime/browser in dependency order. No mobile or shared
Worker rollout is bundled. Rollback disables browser/runtime/producer first, then
the database gate; snapshot the bounded source rows/outbox IDs and run
`employee_health_feed_v1.rollback.sql`. Existing identifier-only outbox evidence
is retained, not bulk-deleted. Re-enable only with fresh connections/caches.

### Candidate verification

- Offline disposable database: 289 migrations replayed, followed by independent
  employee prerequisites and candidate SQL. 28 SQL assertions cover default-off,
  source deduplication/ordering, private payloads, role/MFA/permission denial,
  fixed-bridge arguments and claim restoration, revocation, multi-summary history
  coalescing and forced sidecar failure. Existing function/grant/RLS/member-row
  fingerprints match; inverse removes only candidate objects and restores contracts.
- 11 health-event/cache/authorization tests and 5 actual collector-handler tests
  pass, including disabled sidecar, unauthorized requests and background failure.
  Existing employee health/resource/workflow-adapter suites: 44 passing tests.
- Existing operational-alert contracts: 5 pass. Member auth isolation,
  participation window, realtime recovery/fast lane and push policy: 97 pass.
- Packaged independent browser: 13 pass; one unrelated exact-production geometry
  test remains skipped. New checks cover operations-only subscriptions, targeted
  refresh, duplicate/delayed hints, navigation-read race and lock fencing.
- Final general browser health/loading/portal run: all 31 checks pass. Repeat the
  candidate checks with `npm run test:health-events` and
  `npm run test:health-events:database` (installed offline container images required).
  The two pure candidate suites are also in the explicit offline-coverage allowlist.
- Health model/boundaries: 145 pass. Website/tooling TypeScript, scoped ESLint and
  whitespace checks pass. Standalone employee-RPC integration runner correctly
  refused to run without its owned database target; the new clean-room runner
  qualified the new bridge instead. No live acceptance or deployment is implied.
