# Member read audit — queued September 28, 2026

Status: source candidate only. No build, upload, OTA, deployment, release-policy
change, paid action or synthetic production traffic in this work.

## What is established

The latest owner email names comments, reactionsGiven, profilePost and friendship.
Prior read-only Sentry inspection found Android 21 events for comments
(`bd6618329fcb4e9385952b146c863dc9`), profilePost
(`eb804dd910ef4138a0ade0c265a0c46d`) and friendship
(`b36a0cfb725a4b6b9c26a90133efe7c8`). Retained contexts were generic `api_object` /
`unexpected`, without HTTP status, abort source or device correlation. Nearby
successful backend reads do not identify the failed requests. The historical
network/provider/database cause remains unproven; these changes must not be
represented as proof that all historical failures are fixed.

## Confirmed defects repaired

- The older `runAbortableQuery` path discarded outer HTTP status and local abort
  provenance. It and `runMemberRead` now share one implementation, so older
  callsites receive the repair too. Actual HTTP/SQL failures remain errors;
  proven lifecycle cancellation is separate from a retryable local deadline.
- Comments, friendship and secondary post-reaction summaries bypassed that
  boundary. They now use it; comments prefetch shares its mounted query function.
  Feed and upcoming-state reads also use the central implementation.
  The final component sweep found two more direct readers in `PollResultCard`:
  summary and paged voters now use tested shared helpers with unchanged keys,
  audience, global totals and 40-row voter cursors.
- Installed Supabase/PostgREST **2.105.3** retries GET/HEAD network failures and
  selected HTTP failures internally. Central member reads call `retry(false)`;
  TanStack **5.100.9** retains the existing one transient retry. This avoids
  multiplying transport attempts and does not add a new retry loop.
- A signal alone did not settle a read while the SDK waited for a token or a
  non-cooperating response body. Read observation is now deadline-bound; both
  fulfillment and rejection of late work are consumed, and late success cannot
  populate the cache. Auth work itself is not aborted or revoked.
- The custom Supabase fetch used to detach the caller signal at response headers.
  Caller-bounded reads now pass their signal through the entire body lifetime.
  An already-expired request cannot dispatch after SDK token acquisition. Requests
  without a caller signal retain their existing 15-second transport timeout.
- Gateway reads now include token lookup/refresh observation in their existing
  eight-second budget. They still never fall back to direct DB reads on failure.
- Notification bootstrap cannot block history commands forever on stalled auth.
  Its existing atomic merge is not replayed; timeout does not imply rollback.
  Snapshot reads retain actor checks and pinned authorization. Account changes
  still discard old history, placeholders and completions.
- Own-profile bootstrap retains status/SQLSTATE, its existing three-attempt
  policy, server-authoritative gate, single flight and account checks. No session
  lifetime, refresh policy, portal authentication or logout behavior changed.
- Username availability now exits `checking` on deadline and ignores cancelled
  completions even when the new input is invalid. Validation and debounce remain.
- Failure diagnostics add bounded numeric elapsed/deadline milliseconds only.
  No raw messages, IDs, tokens, arguments or SQL details are sent; existing alert
  suppression/rate budgets are unchanged. Alerts have not been muted or resolved.

## Inventory and boundaries

| Read group | Coverage |
| --- | --- |
| Current/upcoming Doji, release policy, leaderboard | Central 6-second reads; clock updates only after successful current response |
| Feed locked/full; comment pages and prefetch | Authorized RPCs, audiences, 20/50-row limits and cursors unchanged |
| Poll summary and voter detail | Central helpers; totals and viewer-scoped keys unchanged, 40-row cursor bound |
| Profile view, post detail, current profile post | Central authorized reads, including nested reaction summaries; safe fields unchanged |
| Friendship, friends, requests, counts, profile friends, blocks, search, mentions | Older helper now shares normalization, deadline and retry control |
| Badges/categories/tiers/progress, poll/reaction counts | Same projections, member filters and query keys |
| Suggestion history/counts, shop catalog/ownership | Same bounded member reads; no submission/reward/purchase changes |
| Moderation status and legacy in-app pending-report/idea reads | Central read boundary only; no administrative action or portal edit |
| Notification snapshot/bootstrap | Actor checks, local fallback, atomic merge and serialized history commands preserved |
| Own-profile bootstrap and username availability | Explicit caller-owned recovery; no extra TanStack retry layer |

Audited exceptions are intentional, not raw-read callsites to convert blindly:

- Announcement **claim/action** RPCs are write-bearing, not passive reads.
  Existing claim/null-result and action tests remain; no campaign is published.
- Command gateway, committed-post receipt reconciliation, uploads and media
  signing have separate outcome/recovery semantics. They are not wrapped in a
  read retry policy. No atomic write or idempotency key is changed. Media remains
  lazily resolved, not a feed-query dependency.
- Auth restoration and realtime authorization retain their dedicated lifecycle
  policies. The auth event callback remains synchronous (does not await SDK work).
- No new server-owned state, query keys, events, polling, alarm changes or
  reconnect/foreground reconciliation changes are introduced.

## Validation

- **140 suites / 1,228 tests passed** (`npx jest --runInBand --silent`).
- TypeScript `--noEmit` and scoped ESLint passed.
- A 32-query matrix uses actual query functions and real QueryClient execution:
  terminal status, one-retry recovery, cancellation and deterministic permission
  denial. Additional tests cover two parallel count reads, nested summaries and
  comment/reaction prefetch. Existing public-profile and engagement tests pass.
  Seven additional poll-helper tests cover terminal status, retry count, permission
  denial, deadline, late completion, parent cancellation and cursor/audience values.
- Installed-SDK transport tests mock networking (no external traffic) and use the
  native AbortController polyfill: two total network attempts on retryable GET
  failure, stalled token lookup, expired dispatch prevention, body cancellation,
  non-cooperating body/late success, and the unchanged no-signal transport limit.
- Mounted-hook tests cover username timeout/obsolete success, notification
  bootstrap auth stall, rapid dismissals, clear failure rollback and account switch.
- Existing atomic command replay, push registration, auth recovery, participation,
  member/employee isolation and backend contract tests all remain green.

These tests validate client behavior, not 100,000-user capacity, provider uptime
or physical-device push timing. Retained historical incidents remain uncorrelated.

## Release and rollback

Include these files with the prior Android-21 follow-up in the next mobile build;
installed Android 21 / iOS 100 do not contain this candidate. Recheck included build
allowances before any future build. Do not automatically raise minimum versions.

On physical devices qualify profile/feed/comments/friends/shop/history, repeated
navigation and account switching, slow/offline recovery, background/foreground,
notification clearing and registration, and the daily Doji window. Confirm a real
delivered push separately from successful token registration. Compare new-build
Sentry events; do not infer repair from email volume alone.

Rollback is to the previous mobile source/artifact without enforcing the new
minimum version. There is no corresponding DB/Worker/portal migration to reverse.

## Primary references and implementation checks

- [TanStack query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation): propagate cancellation into every participating read.
- [Supabase PostgREST source](https://github.com/supabase/supabase-js/blob/master/packages/core/postgrest-js/src/PostgrestBuilder.ts): retry configuration and error envelopes. Implementation was checked against installed 2.105.3, not assumed from latest upstream.
- Installed `@supabase/supabase-js/src/lib/fetch.ts`: token lookup precedes custom fetch.
- Installed PostgREST builder: body consumption follows fetch headers; network errors become status-zero envelopes.
- Installed React Native fetch/whatwg-fetch: abort and Headers behavior inspected; no unproven header/credential fix applied.
