# Doji production incident investigation — September 13, 2026

Status: SEV-1 user-facing reliability incident  
Scope: iOS public build 71, production backend, realtime and photo-feed paths  
Investigation time: September 13, 2026 (America/Denver)  
Changes made during investigation: none; production was queried read-only

## Executive finding

This was not ten users exhausting a system that otherwise scales. It was a set of
correctness and request-amplification defects that become visible as soon as several
real users open a photo-heavy feed at the same time:

1. **A transient six-second profile request failure is incorrectly converted into a
   full-account failure.** The user is still authenticated and the account is safe,
   but the root navigator unmounts the app and shows “Couldn't load your account.”
   Users understandably describe that as a crash.
2. **Each visible photo-feed card can expand the realtime authorization set and cause
   another server token request.** Production recorded 45 `realtime-token` HTTP 500s
   in the inspected window, with a dense burst around 3:55–4:01 p.m. MDT. One inspected
   public-build request ran for 8.258 seconds and then failed at the function's own
   eight-second upstream deadline.
3. **The realtime outbox wake path acknowledges scheduling, not delivery.** The
   database-to-orchestrator HTTP calls returned 200 with `{"scheduled":true}`, but
   committed events then waited 39–85 seconds before their first and only publish
   attempt. The Durable Object alarm hop is therefore a confirmed latency point.
4. **Photo feeds add a blocking network waterfall before the first card can render.**
   Doji first waits for the feed RPC, then waits for a batch of private signed URLs,
   and only then lets the native image loader download the image bytes. It also
   prefetches the other audience after the first feed arrives. That is why photo Dojis
   feel materially slower than single-card/textual challenges.

The evidence does **not** support a raw database-capacity explanation. The relevant
database RPCs are generally fast; the delay is predominantly in client failure policy,
the external realtime authorization hop, request multiplication, and deferred relay
execution.

## What users experienced

- A signed-in user briefly enters the app and is then replaced by the account error
  screen.
- Photo-heavy Dojis remain on loading/skeleton states much longer than expected.
- Realtime changes and notification state arrive tens of seconds late.
- Sentry reports native fetch cancellation and non-2xx Edge Function responses.

The account screenshot is an application error state, not evidence of a native process
crash. Its text matches [app/_layout.tsx](../app/_layout.tsx#L182) exactly.

## Confirmed evidence

### 1. The account gate fails closed on any profile transport error

[stores/useAuthStore.ts](../stores/useAuthStore.ts#L150) gives `get_own_profile` a
hard six-second abort. Any returned transport/API error sets `profileLoadState` to
`error` at line 159. [app/_layout.tsx](../app/_layout.tsx#L182) then replaces the
entire authenticated app with the account error screen.

This happens even when a cached profile was successfully restored. The cache is kept
behind the authorization gate, so it cannot preserve the mounted experience through a
short network or gateway interruption. That policy is safe against stale ban state,
but operationally brittle: one failed read becomes a total lockout.

The Sentry screenshot at 3:55:46 p.m. MDT shows the corresponding iOS networking
symptom: `FetchRequestCanceledException: Fetch request has been canceled` from
`Expo/NativeResponse.swift:63`.

Database statement statistics make a slow profile query an unlikely primary cause:

| RPC signature | Calls in current statistics window | Mean | Maximum |
|---|---:|---:|---:|
| current scalar `get_own_profile` | 2,341 | 28.712 ms | 2,594.705 ms |
| legacy row-returning `get_own_profile` | 685 | 11.846 ms | 286.539 ms |

Neither recorded profile-query maximum reached the client's six-second abort. The
failure can therefore occur in the mobile transport, API gateway, authentication, or
request queue around the database call; the current client treats all of those as an
account failure.

### 2. Public build 71 created a realtime-token failure burst

Supabase Edge Function invocation history showed 45 filtered HTTP 500 responses for
`realtime-token` in the inspected period. The densest visible sequence included at
least 35 failures between 3:55:39 and 4:00:56 p.m. MDT.

The inspected 4:00:56 failure had:

- status: 500 / `EDGE_FUNCTION_ERROR`
- execution time: 8,258 ms
- deployment: `realtime-token` version 25
- authenticated request
- client user agent: `Doji/71 CFNetwork/...`
- Supabase region: `us-west-1`

The implementation has an eight-second deadline for both its capability lookup and
the Ably token request in
[supabase/functions/realtime-token/index.ts](../supabase/functions/realtime-token/index.ts).
The database capability RPC itself is not normally eight seconds: 2,242 recorded calls
average 34.599 ms and max at 2,885.394 ms. No matching “capability lookup failed” log
was present, while the invocation ended at almost exactly the eight-second boundary.
The strongest supported inference is that the external provider authorization call
timed out and escaped as an unhandled Edge Function error.

Ably reported no platform incident on September 13. Supabase reported no new incident
for the day, but its API Gateway was marked degraded and its long-running “401 errors
due to JWT rejections” incident was still being rolled out region by region. That
platform condition can worsen request reliability, but it does not excuse the app's
fail-closed profile behavior or the token-request burst.

### 3. Realtime delivery waited before the first attempt

The operational alert at 4:01:54 p.m. MDT reported:

- 87 recent realtime samples
- p95: 70,696 ms
- maximum: 85,406 ms
- 42 samples over five seconds
- no overdue/exhausted outbox rows at check time
- no APNs credential errors

Read-only inspection of the underlying outbox confirmed the slowest records:

| Event | Realtime latency | Attempts |
|---|---:|---:|
| `account.profile.updated` | 85.406 s | 1 |
| `account.profile.updated` | 84.612 s | 1 |
| `notification.badge.insert` | 84.529 s | 1 |
| `notification.badge.unlocked` | 83.869 s | 1 |
| `account.profile.updated` | 71.503 s | 1 |
| `feed.reaction.insert` | 68.813 s | 1 |
| `notification.state.update` | 46.619 s | 1 |
| `feed.reaction.delete` | 41.004 s | 1 |

Every sampled row had exactly one attempt. This was not an Ably publish retry loop;
the rows waited before being claimed.

During the same interval, all 62 retained `pg_net` responses were HTTP 200 and none
timed out. The relevant response body was `{"scheduled":true}`. The current worker
returns that response immediately after asking a Durable Object to set a nominal
250 ms alarm ([infra/doji-orchestrator/src/index.ts](../infra/doji-orchestrator/src/index.ts#L303)).
It does not wait for a relay claim or publish. Production therefore demonstrated that
“wake accepted” is not a delivery acknowledgement and that the deferred alarm can miss
the realtime SLO by more than a minute.

The alert's `alarm_repairs` entry is unrelated to this root cause. It repaired a future
pre-live challenge alarm and did not create the account failures or the observed token
500s.

### 4. Photo loading is a serial dependency chain with extra speculative work

[lib/feedQueries.ts](../lib/feedQueries.ts#L61) performs the feed snapshot RPC and then
awaits `signPostMedia` before returning any posts. [lib/postMedia.ts](../lib/postMedia.ts#L42)
then calls `createSignedUrls` for all uncached objects. Only after both complete can
`expo-image` begin fetching the actual media.

The first page is 20 posts. Once it resolves, [app/(app)/(tabs)/index.tsx](../app/(app)/(tabs)/index.tsx#L115)
prefetches the opposite audience, which can initiate another feed RPC and another
private-media signing batch. Visible unlocked cards also mount post-scoped realtime
subscriptions; adding a new post channel can call `authorize()` again.

The current database statement statistics show 5,408 calls to the feed snapshot RPC,
with 122.992 ms mean and 7,774.308 ms maximum. That maximum alone can exceed a smooth
startup budget, and it precedes URL signing and image-byte download. The call count is
also disproportionate to a roughly ten-person launch, consistent with refetch and
prefetch amplification rather than human actions alone.

Native disk/memory caching only helps after a stable URL has been obtained and its
bytes downloaded. Expo documents that `memory-disk` checks memory and then disk, but it
cannot remove the preceding signed-URL request. Supabase further documents that a newly
generated signed URL has a distinct CDN cache key; repeatedly generating new signed
URLs prevents reuse of the same warm edge entry unless Smart CDN is enabled and the
same URL is reused.

## Build 73 is also affected

Build 73 is not evidence that the incident is fixed. The inspected realtime-token
failure was definitively from public build 71, but the owner confirms that build 73
still has unacceptably long loading, especially for photo Dojis. That is consistent
with the current source: build 73 still blocks the first feed result on the feed RPC
and private-media signing before image downloads can start, still speculatively
prefetches the opposite audience, and still grows post-scoped realtime authorization
as cards mount. The six-second profile fail-closed code also remains, so build 73 is
still susceptible to the account lockout when its timing crosses that deadline.

## Root-cause ranking

| Finding | Confidence | User impact |
|---|---|---|
| Six-second profile transport error becomes global account lockout | Confirmed | Critical |
| Durable Object alarm hop delays first outbox claim despite successful wake acknowledgement | Confirmed | Critical |
| Per-visible-post capability growth causes token authorization amplification | High | High |
| Realtime provider token request hit the function's eight-second deadline | High | High |
| Photo feed blocks on RPC → signed URLs → bytes and prefetches the other audience | Confirmed | High |
| Supabase's degraded API/JWT incident increased the probability of transient failures | Contributing external risk | Medium |
| Ten users exceeded normal Postgres capacity | Not supported | — |

## Required remediation before another production claim

### P0 — account availability

1. Separate **account authorization state** from **profile presentation refresh**.
2. For a signed-in, previously authorized session, keep the mounted app and cached
   presentation through transient failures; show a nonblocking offline/retry state.
3. Use a dedicated minimal server-owned access check for ban/onboarding authority, with
   bounded retry and jitter. Do not infer “account unavailable” from one generic fetch
   error.
4. Only route to the full account-error screen when there is no usable session and the
   authoritative access check has failed after controlled retries.
5. Add a test that forces the first profile request past six seconds and proves the app
   remains usable and later reconciles.

### P0 — realtime relay

1. Make `/outbox/wake` start a drain immediately inside the Durable Object and retain
   the alarm only as crash/retry recovery. Do not put the normal 250 ms path entirely
   behind alarm scheduling.
2. Return/record a drain correlation ID and claim timestamp, not only
   `{"scheduled":true}`.
3. Alert separately on wake-to-first-claim latency so “outbox empty now” cannot hide a
   one-minute delivery delay.
4. Load-test concurrent inserts and require p95 under one second and p99 under two
   seconds before release.

### P0/P1 — realtime authorization

1. Batch all initially visible post IDs into one authorization request before attaching
   those channels.
2. Debounce channel-set growth and permit at most one trailing authorization, instead
   of serializing one server request for every intermediate set.
3. Catch and classify database vs provider timeouts in `realtime-token`; return a
   structured 503 for transient provider failure and log the timed stage and duration.
4. Reuse valid capabilities until a genuinely unauthorized channel is requested;
   apply jittered recovery without creating one Sentry issue per card.
5. Add request-rate telemetry: tokens per session per minute, post IDs per token, and
   provider-token latency.

### P1 — photo feed

1. Return post records immediately; sign and hydrate media only for the visible window.
2. Persist safe object references and a reusable signed-URL cache with expiry metadata;
   never make all 20 signatures a prerequisite for rendering text/card chrome.
3. Defer opposite-audience prefetch until idle plus an explicit data/network budget, or
   remove it for photo/video challenges.
4. Generate upload-time feed thumbnails and serve appropriately sized assets. Do not
   download camera originals into feed cards.
5. Instrument the stages independently: feed RPC, signing, first image byte, decoded
   image, and first useful feed paint.

## Corrective implementation completed in this working tree

The replacement release candidate now includes the following code-level corrections:

- bounded retry for the initial owner-profile authorization read, plus a verified-session
  invariant that prevents transient background refresh failure from ejecting an active user;
- immediate feed-record delivery with visible-card media hydration, a shared 24 ms signing
  batch, stable object-reference persistence, and no hidden-audience prefetch during media work;
- an 80 ms initial post-capability batch and shared exponential authorization cooldown, so a
  provider outage produces one bounded retry wave rather than one wave per mounted card;
- structured `503` classification and stage-duration logs for capability/provider token failure;
- an immediate, in-memory-deduplicated Durable Object relay drain with a 30-second recovery
  alarm, drain correlation ID, and wake-to-first-claim telemetry.

Automated verification after these changes: app TypeScript, orchestrator TypeScript, ESLint,
the source-size guard, and all 83 Jest suites (673 tests) pass. The device/network and staged
production gates below remain mandatory; automated tests are not a substitute for them.

## Release gates

A replacement build should not be called production-ready until all of these pass:

- 50 cold launches on throttled Wi-Fi/cellular with zero account lockouts.
- Injected 401, 500, eight-second timeout, cancellation, and offline/online transitions
  at session, profile, token, feed, signing, and image stages.
- A photo feed of at least 20 unique images reaches usable card chrome without waiting
  for all media and does not pre-authorize one token per card.
- Ten simultaneous users produce a bounded token-request rate and no token 500 burst.
- Outbox wake-to-publish p95 <1 s and p99 <2 s under concurrent social writes.
- Build/release tags in Sentry distinguish 71, 73, and the replacement build.
- A staged rollout/canary is observed before full release.

The repository's own architecture documentation already says a 100,000-user launch is
blocked until the authenticated read tier is implemented and load-qualified
([docs/REALTIME_ARCHITECTURE.md](REALTIME_ARCHITECTURE.md#L375)). That remains the
correct statement. No current evidence supports claiming the present system is ready
for 100,000 users.

## Sources

### Production and repository evidence

- User-provided account-error, Sentry, and operational-health screenshots dated
  September 13, 2026.
- Supabase production Edge Function invocation history for `realtime-token`, read
  September 13, 2026.
- Read-only production queries of `domain_event_outbox`, `net._http_response`, and
  `pg_stat_statements`, executed September 13, 2026.
- Doji repository source files linked throughout this report.

### Primary external references

- [Supabase status](https://supabase.statuspage.io/) — ongoing JWT-rejection incident,
  API Gateway status, and September 13 incident history.
- [Supabase Edge Function architecture](https://supabase.com/docs/guides/functions/architecture)
  and [slow-function troubleshooting](https://supabase.com/docs/guides/troubleshooting/edge-function-takes-too-long-to-respond).
- [Supabase Edge Function status codes](https://supabase.com/docs/guides/functions/status-codes).
- [Ably status](https://status.ably.com/) — no September 13 incident reported.
- [Ably token authentication](https://ably.com/docs/auth/token) — `authCallback`, token
  capabilities, and explicit reauthorization behavior.
- [Expo Image](https://docs.expo.dev/versions/latest/sdk/image/) — native image cache
  policies and prefetch behavior.
- [Supabase Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn) and
  [Storage production scaling](https://supabase.com/docs/guides/storage/production/scaling).
