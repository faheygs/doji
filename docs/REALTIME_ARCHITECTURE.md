# Doji realtime architecture

This is the maintained transport and consistency contract. Read
[product context](../DOJI_CONTEXT.md), [system map](SYSTEM_MAP.md) and
[current release state](CURRENT_STATE_AND_GAPS.md) alongside it.
Historical rollout steps are not instructions to replay.

## Guarantees

- Postgres is authoritative. Atomic commands commit state, receipts and outbox
  together. Socket messages contain identifiers, never trusted application rows.
- Participation is authorized by server time: ten-minute normal window, existing
  signup-day exception and atomic paid buy-in. Push and phone clocks own none of it.
- Each daily event has a durable pre-live/activation/close alarm chain. There is no
  recurring due-event poller; close registers the next event.
- Foreground, reconnect and route entry reconcile authorized state after missed
  events. No recurring handset or general portal polling; the separately gated
  cached admin-health summary is the bounded exception described below.
- Member Supabase Auth and independent WorkOS employee/business identities remain
  separate. Member authorization never depends on portal roles or availability.
- Existing shared infrastructure has residual contention/failure risk. Shared
  changes need explicit impact approval, member regressions and retaining rollback.

## Command and relay path

1. A client sends an allowlisted atomic RPC with its stable command key.
   The member gateway forwards the caller's JWT/RLS context, not service-role access.
2. Postgres authorizes, serializes the intent, commits state and a durable receipt,
   and writes identifier-only outbox rows in the same transaction.
3. The gateway wakes the singleton relay after confirmed commit. Transactional
   `pg_net` is the independent durable fallback. Wake failure does not turn a
   committed command into a failed command.
4. Every wake joins one in-memory drain, installs crash recovery and records a
   rerun latch. Finishing work rechecks that latch around alarm cleanup so a
   concurrent wake cannot be acknowledged and stranded.
5. Bounded claims prioritize critical/user-visible realtime over push-only backlog
   and internal fanout. Ordered channel batches publish before optional push work.
6. Durable publication markers, leases and terminal delivery claims govern recovery.
   An aborted HTTP response or empty later claim does not prove remote work stopped.

Current relay limits: 100-row claims, 16 bounded workers, up to eight pages per
turn, 30-second crash recovery, five-second normal upstream budget and twenty-second
recovery budget across headers/body. Uncertain invocation recovery retains the
150-second lease-expiry recheck. Independent friend-channel batches contain at most
100 channels. No-push leases complete in a set-based command.

Separate committed actions cannot share a published invalidation. Profile hints
may coalesce only within their originating transaction. Empty conflict updates do
not create another wake.

Commands do not automatically retry consequential writes. Where replay is supported,
reuse the exact actor/payload/key and durable receipt. Validation/authorization/business
errors are not transient. A successful receipt followed by failed refresh is still
a confirmed command. Query cancellation is not server rollback.

Mobile gateway attempts enforce their existing 12-second deadline across fetch
and body waits even if native cancellation is ignored. Late completions cannot
turn a timed-out attempt into UI success. Received HTTP rejections remain failures;
the existing keyed/idempotent retry allowance is unchanged. Command session lookup
and 401 refresh each have an eight-second caller deadline. Auth failures settle as
command errors without replaying the write; late credentials cannot resume it.
This does not cancel Supabase's shared session lifecycle or establish device latency.

## Challenge and scale boundaries

Pre-live occurs twenty minutes before activation and advances active-feed identity
without revealing the challenge or deleting old participation/content. Activation
stamps authoritative deadlines; occurrences materialize lazily per member.
Pending normal occurrences follow the shared close; signup-day and paid exceptions
retain their own deadlines regardless of whether the read preceded activation.
Countdown text must not clamp those longer deadlines to ten minutes. Release state
and remaining physical-device acceptance are tracked in the current-state guide.
Poll activation ensures its unique system-owned feed card after retention and
before the activation outbox event, in the same transaction. Scheduling-time cards
are not durable across intervening activations; voting must never depend on them.
Re-registering an event re-arms its alarm even if phase state already exists.

Activation does not scan all accounts. Push planning uses only occupied recipient
partitions, up to 128; recipient pages are bounded to 500 accounts. A durable fanout
owner advances active shards until completion or immutable launch expiry.
Expired unfinished work is terminalized and monitored.

Poll, engagement and occurrence totals use 128 fixed write shards. Global summaries
sum those shards; friend reads traverse only the capped accepted-friend graph.
Interactive social writes enqueue bounded fanout work, never synchronously expand
every recipient or call push providers.

Scale-read gateways verify the member JWT and preserve RLS authorization. Source
uses account-scoped response caches, request-owned upstream I/O and a six-second
whole-read budget, including authentication, cache and response-body waits. JWKS
caching retains only completed public-key data for five minutes, not pending I/O.
Phase-specific failures omit tokens, bodies and member identifiers. See current
state for the deployed version and rollback. Configured scale mode fails
closed rather than stampeding Postgres via a silent fallback.
Load models are throughput budgets, not proof of provider capacity or 100k readiness.

## Member subscriptions and cache reconciliation

Ably is the sole current handset socket transport; do not add parallel Supabase
Postgres Changes subscriptions. An account-bound client closes on identity change.
Authorization requests batch mounted post IDs and verify returned capabilities.
Tokens grant exact authorized channels for fifteen minutes, never `post:*`.

| Channel | Meaning / audience |
| --- | --- |
| `doji:global` | Pre-live, activation and close identifiers |
| `feed:public` | Coalesced Everyone-feed membership hints while focused |
| `post:{uuid}` | Mounted unlocked post/thread engagement and poll hints |
| `leaderboard:global` | Coalesced rank/XP/public presentation hints while focused |
| `user:{uuid}:events` | Private occurrence, social, profile, economy and notification hints |
| `moderation:global` | Authorized staff moderation hints |
| `staff:workflow:{area}` | Authorized employee work-area hints |
| `profiles:global` | Retired; never restore all-account profile broadcast |

Local admin impersonation signs subscribe-only grants for the selected staging
employee's authorized channels using the isolated staging Ably app. Its distinct
developer proof is not hosted MFA. Persona switching closes session-owned sockets
and fences late grants; revocation denies new grants but issued tokens keep their TTL.

Mounted post subscriptions are reference-counted and released when their last
consumer leaves. Initial attachment rewinds ten seconds of identifier hints to
close the read/attach gap. Initial capability requests collect for 80 ms with at
most one trailing authorization pass.

One 401 refresh/read retry is allowed under the captured account. A stale capability
gets one reauthorization and fresh channel object. Omitted post access stops retry
and reconciles authorized content; unexpected persistent failures remain reportable.
Expected transport interruptions use bounded jittered recovery, not alert storms.
Cold sockets connect immediately; recovered connections coalesce catch-up for
100–500 ms, not an artificial cold-start delay.

On native background-to-active return, a disconnected client explicitly renews
authorization through the SDK, superseding suspended token work without replacing
channel listeners. Healthy connections are retained. Authorization resets fence
queued/late results and abort token-endpoint reads; token reads have a 15-second
deadline and post-capability authorization a 35-second bound including the provider
exchange/connection update. Neither a nested transport timeout nor its 401 wrapper
alone establishes invalid member credentials. Persistent connection failure remains
reportable; reconnect and foreground reads still reconcile from Postgres.

`domainRealtimeHandler`, `queryInvalidationBatcher`, `reconcileQueries` and
`QueryLifecycle` own targeted invalidation and catch-up. Hints batch for 80 ms;
each query family has an independent in-flight wait and 350 ms minimum refresh
gap, with one coalesced trailing pass. A slow comments/feed refresh cannot hold
challenge-state reads. TanStack retains per-query single-flight behavior and
`cancelRefetch: false` for realtime. Teardown discards pending work and fences old
completions. Unknown events do not refresh everything.

Persisted mobile queries warm only the accepted account. The 1.2-second startup
handoff stays bounded; late disk reads remain usable only within the same account
lifetime. Logout/account changes discard pending restoration and deferred writes,
even when returning to the original account; same-account token renewal preserves
them. Hydration cannot overwrite or invalidate a newer network result.

Native lifecycle suspension is separate from realtime invalidation: background or
explicit offline state pauses reads and cancels only the server-read allowlist.
Unknown network state permits reads; it is not a reachability probe. Available
foreground return performs one account/QueryClient-scoped reconciliation.
Mutations remain immediate with existing retry rules, not an offline command queue.
Announcement claims and notification bootstrap are excluded from read cancellation.
These lifecycle changes remain next-build source; check recorded release state.

### Read ownership

- Feed keys use the authorized current daily-event ID and separate Friends/Everyone
  audiences. Returning to an audience revalidates without blanking permitted cache.
- Mounted engagement reads use `get_post_engagement_snapshot_v2` and exact thread
  reads. Partial pages are not totals; one audience never overwrites another.
- A private notification carrying a post ID also reconciles that mounted post,
  covering event-order races. Counter updates do not emit a second feed-wide hint.
- Optimistic callbacks and delayed reconciliation remain bound to the initiating
  member. Stale account results cannot patch, roll back or refresh another cache.
- Persisted snapshots are account-scoped and bounded: first pages, recent-query and
  byte caps; no mutations, search drafts, secrets or signed URLs.
- Protected media signing is bounded and demand-driven. Cache stable references and
  immutable object/variant keys, not bearer URLs. Authorization loss removes content.
  Hidden private cards never expose unsigned references to native loaders. Visible
  media reconciles on native foreground/reconnect without polling; disk and signing
  failures are contained. Decode stalls show local retry feedback after fifteen
  seconds without blocking social controls. Scrolling/count updates do not prefetch
  unopened comment/reaction lists; thumbnails are requested only for dual photos.
- New head-post preparation shares two native slots per mounted feed across realtime
  batches. Every queued row has an eight-second arrival-to-fallback limit; a timeout
  cannot launch more native work while earlier non-cancellable work remains pending.
  Identity/enablement changes and row removal fence queued and late results. Baseline
  and pagination rows render immediately without a page-wide preload.
- Resumable uploads bound session lookup and file preparation, then stop the local
  attempt after sixty seconds without advancing bytes. The remote upload and resume
  fingerprint are retained; a timeout is not rollback or permission to replay the
  submission. Late lookup/progress/completion cannot restart or confirm that attempt.
- Store-release policy uses bounded authorized reads, not push or polling.
  Verify the installed binary's discovery behavior before claiming immediate enforcement.

## Push and activity history

The outbox is the only notification producer. No direct row-trigger push endpoint,
second scheduler or handset-owned challenge notification path may be introduced.

Phone alerts are limited to Doji activation, friend requests, explicit mentions/direct
replies and review/account actions. Ambient posts, reactions, likes, completions and
badges remain in-app. Shared poll totals are global; social recipients are friend-scoped.
Final moderation removal and quarantine have different notice rules; quarantine is
not a finalized violation.

`device_push_endpoints` privately stores installation-bound native APNs/FCM tokens.
Transfer is atomic on account change. At most five recent active installations are
delivered independently. Expo tokens remain compatibility fallback; v3/v2/v1
registration stays compatible with installed clients.

- Create Android category channels before permission/token requests. Registration's
  notification-contract version preserves old-client channel compatibility.
- Master push opt-out and per-category preferences are enforced at delivery.
- Claim immutable event/recipient/installation identity before provider I/O.
  Ambiguous handoff is terminal, never permission to resend.
- Doji pushes expire after two minutes or close, whichever comes first; other pushes
  expire after five minutes. Retries cannot refresh those original deadlines.
- Attention receipts suppress already-seen subjects without erasing Activity Center
  history. Doji visibility is compared with activation, not the pre-live countdown.
- Clear/dismiss actions use durable phase-aware receipts, serialize within the
  mounted account and ignore late results after account change.
- APNs provider JWT rotation is shared under a database lease, not per isolate.
  FCM validates its configuration before dispatch. Preserve exact Play deployment
  certificate restrictions; upload keys are not installed-app signing certificates.
- Provider acceptance, delivery telemetry and actual phone display are distinct.
  App correctness always comes from authorized reads.

Native registration is foreground/account-bound and serialized with unregistration.
Staging registration is separately default-off and cannot acquire provider tokens
before its delivery setup is approved. APNs sandbox/production describes signing,
not the database environment; staging internal distribution requires its explicit
signing value and isolated provider credentials. Production registration is unchanged.
Preserve the existing four-attempt bounded policy, six-hour confirmed receipt,
rotation/release/identity changes and lifecycle cancellation. Interrupted or cached
registration is not newly confirmed recovery. Recovery logging is privacy-filtered,
session-bound, capped and best effort, not proof of notification delivery.

## Employee and business boundaries

The React portals use same-origin proxies and independent WorkOS server runtimes,
opaque host cookies, explicit operation allowlists and private session SQL.
The former shared-member Supabase portal login is not the current sign-in design.
A WorkOS identity alone is not a role grant.

Each QueryClient belongs to a realm, identity and session epoch. Lock/logout/access
loss closes sockets, discards private data and fences late reads. Foreground,
online and reconnect recheck authority before bounded visible reads.
Commands preserve exact uncertain intent for deliberate retry. Role changes
reauthorize before installing new workspace permissions.

Employee workflow hints contain kind/ID or queue-only invalidation, not case
content. Exact channel signing requires fresh area permission. Operations-only
users do not implicitly acquire moderation topics. Existing issued tokens are
short-lived but not instantly revoked; every data read reauthorizes.

Admin health uses authorized bounded reads. Sentry successful-observation time is
fixed at load completion; cache hits cannot make old data fresh. The provider read
has a ten-second headers/body deadline, no automatic retry, and safe failure/phase,
attempt-time and elapsed-time diagnostics. Failed attempts have no observation time.
Successes cache for 60 seconds; failures back off for ten seconds (60 for access
denials/rate limits). Manual refresh, expired-tab selection and foreground/reconnect
reconcile authorized reads; expiry itself never polls.
The React health listener admits only the exact server-granted operations channel,
filters source/revision hints and coalesces invalidations on the existing socket.
The channel must be attached as well as the socket connected to report connected
health updates. Channel reattachment also reconciles authorized reads, including
after lost continuity. Manual refresh is a fallback, not the normal update path.
New observations from the existing one-minute server check drive updates while
Operations is open; Sentry reads retain their shared 60-second cache. This is
automatic observation-based monitoring, not an instantaneous measurement of every
request. A stopped collector must age out, never appear fresh because its socket
is connected. The one-minute staging collector remains enabled; its health-event
producer/signing gates were disabled November 3 in favor of the cache below.
Production health-event enablement remains gated.
Workflow hints are not a whole-platform health feed. Local impersonation's
`admin_development_health_events_v1` route uses existing developer/persona checks,
not MFA substitution. Its server-only `ADMIN_DEVELOPMENT_HEALTH_EVENTS_ENABLED`
gate defaults off for both revision reads and channel signing and is disabled in
staging. Check current release status for hosted acceptance.

Business protected reads use the existing application controller, atomic versioned
commands and session-scoped queries. Dirty forms survive reconciliation while
stale revisions block commands. Business private realtime remains gated; use
foreground/online reconciliation without inventing polling.

Business reset fencing commits before provider mutation and survives unknown
outcomes. Signed provider success reconciles only the exact mapped reset.
Business emails have durable one-use authorization, recipient binding and budgets;
sending/capture/wakeup gates are independent. Never automatically resend an
uncertain email or restore an unfenced legacy login during rollback.

## Monitoring and validation

Operational-health reads have one 20-second deadline per attempt covering headers
and body, with one retry. Diagnostics distinguish headers/body/parse failures and
Durable Object alarm-repair failures; they retain only status, elapsed time and a
validated provider request ID, never response bodies or credentials.
Monitor-owned repair/relay waits have five-second deadlines so one stalled
dependency cannot hold subsequent checks; the repair commands remain idempotent.

Health notification attempts are persisted before provider I/O. Keep separate
Sentry/email outcomes: accepted, rejected, disabled, suppressed or unconfirmed.
Duplicate suppression and a fulfilled transport promise are not acceptance;
acceptance is not inbox delivery. A restart must not replay an uncertain attempt.
Legacy `alerted` storage fields remain admission fences for safe downgrade;
only the typed receipts describe provider outcomes.
The monitor retains only its latest issue/check receipts, not an incident history.
See current state for qualification and deployment status.

The separately gated history preparation records fixed Worker state observations
through a two-second, no-retry sidecar after the existing check. SQL serializes each
monitor and rejects older/conflicting observations; a changed incident family is
superseded, not declared recovered. History survives disable/rollback. Its protected
employee read requires Operations/MFA and reauthorizes after I/O; it does not repair
anything or renew timestamps. No UI or independent watchdog is enabled by the SQL.
The prepared incident view uses that same health-detail read and existing summary
reconciliation, not a new query timer or channel. Source observations expire
locally even if no further response arrives. The localhost equivalent retains
developer/persona permission and revocation checks; it does not weaken hosted MFA.
The independent one-shot probe reads only source/receipt timestamps and state with
a separate read-only key. A successful HTTP read cannot make a stale monitor healthy.
Running that probe beside the Worker is not independent uptime monitoring; an
approved separate failure domain, missing-probe detection and alert delivery still
need qualification. Neither provider acceptance nor probe health proves phone delivery.

The separately gated staging Sentry-history importer reads actual external check
results from the existing collector, not from browser activity or the heartbeat GET.
Two fixed GETs (monitor binding, then checks) and at most five ordered watchdog RPC writes share a two-second
deadline, with no retries. Original check IDs/timestamps fence replay and expiry;
provider errors, empty/stale results and schema drift cannot renew health. The
read-only heartbeat credential never gains write authority. The importer is not
an independent runner: Sentry owns external checks/alerts, while loss of the Doji
collector also stops imports and must age the portal evidence out. No new job,
member workflow or alert-routing change is implied; production remains gated.

Optional mobile workflow reporting is foreground-triggered, not polling. It detaches
bounded device counts at most once per fifteen minutes and has a two-second
best-effort deadline, no durable queue and no retry after an uncertain acknowledgement.
Account/session changes fence unsent batches; a request already sent may still commit
under its original verified actor. Member commands never wait for telemetry. Ingestion
requires an exact environment/project and verified non-anonymous member bearer.
Private SQL accepts fixed categories only and atomically fences duplicate/rate-limited
batches. Receipt-hour slots describe when reports arrived, not reconstructed action
times. Counts can be missing, capped or client-forged and must never grant rewards,
establish a success rate, or substitute for authoritative receipts. The independent
reporting package and SQL/binary gates default off; retention rollback preserves data.
The separately gated employee read uses Operations permission and MFA; local parity
uses the revocable staging persona route. At most 1,440 private hourly count rows
are projected into 60 fixed category/platform/outcome totals. Health detail reuses
existing reconciliation; receipt times remain distinct from read-check time.
Disabled, unavailable, empty and outdated reads never establish healthy member flows.

The cached-health replacement uses the existing server check, not a new
job. `EMPLOYEE_HEALTH_SNAPSHOT_ENABLED` defaults off and requires the exact
`EMPLOYEE_HEALTH_SNAPSHOT_ENVIRONMENT`/Supabase project pair plus an independently
enabled private SQL setting. Its two-second best-effort sidecar stores a single
allowlisted delivery observation and bounded workflow projection. Older/duplicate
observations cannot replace newer ones; failed workflow collection replaces that
source with unavailable. Reads preserve source times and expire after three minutes.
SQL reads require an MFA-verified operations employee; no member/business grants.
Snapshot and health-event collector modes are mutually exclusive. Before any
cutover, disable the old SQL health-event producer and runtime signing gates too.
The employee HTTP/developer bridges serve fixed cached summary/detail reads,
reauthorizing before and after reads. Hosted access retains MFA; local access uses
the existing staging-only developer/persona grant, never fabricated MFA. The public
and server `healthSnapshotEnabled` gates default off, as does the development
`ADMIN_DEVELOPMENT_HEALTH_SNAPSHOT_ENABLED` binding. Collection and hosted reads
are enabled in staging and production; local reads remain staging-only. Hosted
acceptance is tracked in current state. When enabled, portal-wide
status reads once per visible/online minute and reconciles on return, without
renewing idle sessions. Source age—not successful HTTP—determines freshness.
Only mounted Operations queries reconcile after a successful summary read; hidden/
offline pages pause. Delivery/workflow detail never falls back to aggregate scans.
Sentry detail uses the existing bounded per-runtime cache; summary reads never
call it. Its 60-second cache is not shared persistent storage or a background
Sentry collector. Automatic detail/history reads cannot renew idle sessions either.
No member polling or independent uptime claim is introduced. Hosted qualification
must verify request/provider volume before enabling the gates.

Monitoring and portal display are different contracts. Missing/stale/failed reads
are unavailable, not healthy or zero. No traffic is not measured zero latency.
Sentry's bounded unresolved production issue groups are not per-Doji attribution,
crash-free sessions or feature success rates.

The optional exact-occurrence readiness probe is read-only and service-only.
Scheduling-time poll cards are not required: activation creates them atomically.
Only a live poll requires an available shared card. Option inspection is capped;
oversized sets stay unqualified. Inspection never restores moderated content,
activates/closes a Doji or proves alarm delivery. Collector integration remains gated.

Submission diagnostics reuse the existing 24-step, session-scoped mobile timeline.
An in-memory journey distinguishes upload, command, receipt lookup and feed display;
it expires after fifteen minutes and never emits account IDs, answers or media paths.
Only a confirmed command/receipt permits “Your answer was submitted” after a feed
failure. An optimistic cache update is not confirmation. This is incident context,
not a complete success-rate collector; events already captured cannot gain later steps.

Portal delivery labels use the existing health model: watch at p95 >=1 second or
any sample >5 seconds; degraded p95 >5 seconds requires >=20 samples; any sample
>30 seconds is critical. Evidence expires after three minutes. Label timers make
no network requests. Recent missed targets remain visible after recovery.

Presentation translates publication percentiles into “95% of measured updates
were published within … seconds,” preserving sample counts, thresholds and unknowns.
That duration is not phone delivery time. Coverage gaps remain explicit.

Maintenance recovery preserves bounded retention batches and Storage API
deletion, never direct removal of Storage metadata. Full pages continue; deferred
work recovers after one hour. Two bounded, ID-only queue-presence reads prevent
leased media/account work from masquerading as an empty queue. Failure is unknown,
not drained; existing claims, active references and evidence holds still control
deletion eligibility. Once started, the maintenance object retains a daily safety
wake after draining, independent of challenge close. Deployment must verify its
initial wake, staging storage deletion/recovery, shared-service capacity and rollback.
Release the delay-aware Worker before the maintenance Edge update; an older Worker
would ignore its backoff and retry deferred work every second. Roll back Edge first,
then Worker. No database schema or retention-period rollback is involved in this batch.
This does not introduce automatic pruning of database scheduler logs or change
existing retention periods. See current state for release status.

The separate `workflow_health_v1` overlay observes only authorized
pre-live/activation/close and maintenance **attempts**, not unique member actions.
Its Edge sidecar is best effort, runs after the handler outcome, has a two-second
deadline and no retry. A failed attempt does not prove the database rolled back.
Missing observations (including terminated isolates) remain a coverage gap.
Five fixed workflow names and three outcomes use 24 hourly slots (360 rows maximum),
plus the last success/failure/deferred receipt per workflow. This gives a current
hour plus 23-hour trend, not an indefinite per-request archive. Receipts contain
allowlisted phases and confirmed cleanup counts; no identities, answers, media,
credentials, raw errors or request payloads. Historical Doji summaries stay intact.
The `employee_workflow_health_v1` bridge exposes this bounded snapshot only
after verified employee identity/MFA and `operations.read`. The portal's
`workflowHealthEnabled` flag defaults off; enabled reads share a 30-second cache
and five-second database deadline after authorization. Cache hits do not refresh
observation timestamps. Backend & cleanup uses the existing session-scoped health
query and foreground/reconnect/manual reconciliation, not polling. Invalid, missing
or three-minute-old observations remain unavailable. The bridge does not grant
browser access or enable retention. Staging also uses the separate
`admin_development_health_v1` private route and `admin-development-health.mts`
aggregator: existing developer/persona authorization before reads and again before
return, exact staging Sentry scope, no fabricated MFA. Hosted and local health
reads are enabled in staging; the separately released production employee bridge
is also enabled. Local impersonation remains staging-only. See current state for
exact deployed versions and rollback.

Both `WORKFLOW_HEALTH_ENABLED` and the private database observation gate default off.
The Edge requires explicit `DOJI_ENVIRONMENT` and the matching Supabase project.
Scheduler pruning additionally requires `SCHEDULER_LOG_RETENTION_ENABLED` and its
independent database gate. It scans at most 500 indexed run IDs per maintenance
turn, with a persisted cursor, and removes only completed `succeeded` runs older
than 30 days or `failed` runs older than 90 days. Unknown status or missing end time
is never eligible. Database-owner-managed `scheduler_holds` supports global, job
and run holds; a table lock serializes holds against deletion. Before activation,
inventory/export any evidence needed from old scheduler logs and establish holds.
Neither enabling monitoring nor releasing UI authorizes deletion. Confirm managed
pg_cron permissions, staging recovery, execution cost and cursor completion before
production. Rollback restores the prior Edge package and disables both database
gates, retaining measurements/holds/receipts; it cannot restore already-deleted logs.
No member RPC, reward, timing, auth, push or storage retention rule is changed by
this overlay. No new vendor or recurring scheduler job is introduced.

The server monitor runs once per minute with bounded failure recovery and hourly
deduplicated incident families. It may wake overdue outbox work; it is not a
challenge timer. Event-health summaries settle after close and finalize thirty
minutes later. Browser health reads cannot write those summaries or repair alarms.
Safety/media due-work recovery is separate from challenge scheduling.

Tests must cover atomic replay, permission denials, account/realm isolation,
concurrent leases, event targeting, foreground/reconnect, uncertain delivery,
bounded reads and data-retaining rollback. Preserve all independent coverage
budgets. Local models/mocks do not replace physical iOS/Android, real provider
delivery or authenticated hosted acceptance.

Use [testing and releases](TESTING_AND_RELEASES.md), scoped AGENTS files and
[service catalog](SERVICE_CATALOG.md). Never run historical release scripts or
bulk-apply database overlays as a cleanup check.
