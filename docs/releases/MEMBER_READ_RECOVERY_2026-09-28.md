# Member read recovery and correlation — September 28, 2026

Status: local next-build candidate, **not built or deployed**. This closes known
diagnostic and presentation gaps; it does not establish the source of the observed
HTTP 504s, resolve the production incident, or qualify 100k concurrent users.
The owner does not control the affected external testers' Android devices.

## Additional read-only evidence

The signed-in Sentry issue list filtered to `dist:22`, project `4511550449647616`,
24 hours, showed five read-timeout issue groups plus native Firebase token failures.
The read groups each showed one event at inspection. Inspected exact contexts:

| Operation | Issue / event | Observed final-attempt evidence |
| --- | --- | --- |
| mySuggestions | 7759631063 / 18f65d65ed4b47fda6d424818c0c09f8 | 504, 20ms, abort none, deadline 8000ms (prior trace) |
| friendCount | 7759709892 / c694656b4bce40889d409340a2c44a0f | 504, 305ms, abort none, deadline 8000ms |
| profilePost | 7759693578 / bc8d0365e1c34b23b3cca6738266408c | 504, 161ms, abort none, deadline 8000ms |
| notificationCenter | 7759693622 / 81843407344948ac8f4aba0f4c47b709 | 504, abort none; timing absent |

Reactions issue 7759617167 and Firebase issue 7759415556 also matched the list;
their newest event details were not re-inspected in this batch. Do not conflate
Firebase token acquisition with PostgREST reads. The short final-attempt times
are not proof of slow SQL, total fetch duration, the same device, native cache
failure, or automated Play testing. Earlier bounded Supabase log evidence and its
limitations remain in `ANDROID_22_SUGGESTIONS_504_TRACE_2026-09-28.md`.

Suggestions, friend count, notification snapshots and reaction reads share the
direct Supabase member-read path. Profile/post/feed paths may use the separately
configured scale gateway. The new diagnostics explicitly label these two paths.
There is no evidence justifying another migration, restart, capacity purchase,
larger timeout, increased retry count, or alert suppression.

## Implemented locally

- `memberReadDiagnostics`: signal-scoped WeakMap state records whether the read
  reached fetch, received headers, or failed before a Response; dispatch/header
  timing is bounded. The existing fetch response and request are passed unchanged.
- Collect only UUID-shaped `sb-request-id`, hex-shaped `cf-ray`, allowlisted cache
  status, content-type category, HTTP status and the boolean exact OkHttp
  `Unsatisfiable Request (only-if-cached)` signature. These are correlation hints,
  **not trusted attribution**. Missing headers are not proof of a provider fault.
- No body inspection/clone, request headers, URL, arguments, member IDs, IPs,
  cookies, free-text response messages or credentials are retained. Untracked
  Auth/write fetches are not instrumented by this read observer.
- Shared direct reads and the scale read path attach evidence to their actual
  failure objects. Nested RPC error wrapping preserves the evidence and timing.
  Late results cannot rewrite the settled diagnostic snapshot. Signal entries are
  discarded on settlement and error associations use weak keys.
- `apiQueryCache` keeps first and terminal attempt details plus attempt count and
  bounded fetch-cycle duration in the existing terminal Sentry incident. For the
  normal one-retry policy this covers both attempts. If an explicit caller has
  more retries, only first/final details are retained, not an unbounded history.
  Successful recovery sends no new incident or success event. Query identity and
  raw exceptions are not retained in the diagnostic payload.
- Existing one-retry policy, SDK retry disablement, 6/8-second read deadlines,
  auth refresh, requests/headers, query keys, limits, RLS, commands, cache policy,
  realtime/foreground reconciliation and notification delivery stay unchanged.
- My Submissions now distinguishes cold loading, failed loading and successful
  empty history; transient refresh retains cached rows with a persistent retry.
- Friends and notifications no longer display empty-success copy after a failed
  read. Cached results are retained only for transient failures; explicit access
  failures hide them. Failed friends pagination requires a deliberate retry,
  preventing `onEndReached` from repeatedly retrying the failed page.
- Rankings retain cached results during transient refresh failures. Shop catalog
  and ownership must be available before purchase/equip affordances are exposed;
  failed ownership reads are not interpreted as an empty owned-item list.
  Existing atomic economy commands are unchanged.
- Recovery uses shared themed InlineFeedback/Button primitives with loading and
  accessible disabled state. Shared inline feedback is an accessible alert group.
  Manual retries use `cancelRefetch:false` to avoid repeatedly cancelling active
  reads. No recurring polling or offline write queue was introduced.

## Verification

Tests exercise the installed Supabase SDK and real TanStack query clients with
synthetic fetch responses; they do not generate production traffic:

- provider-shaped 504, exact native cache-only signature, missing/malformed
  headers, header-inspection failure, concurrent out-of-order responses;
- two failed attempts produce one incident with both request IDs; no sensitive
  request/body data survives sanitization;
- HTTP 504 or network rejection then success uses exactly two fetches and no
  incident; repeated 504 remains an incident; 401/403 are not retried;
- stalled body deadline, ignored cancellation/late settlement, expired auth
  dispatch and request cleanup (existing transport suite retained);
- background pauses retry, foreground resumes the same retry, and cancellation
  during backoff prevents another attempt;
- persistent retry feedback, empty/error distinction, cached transient history,
  authorization denial, pagination retry, shop ownership failure and disabled
  repeated taps (native controls/providers mocked where required).

Final local verification:

- Full Jest suite: **143 suites, 1,255 tests passed** (27 added tests).
- `npx tsc --noEmit`: passed after the final code changes.
- Scoped ESLint for the changed implementation and tests: passed.
- Scoped `git diff --check`: passed.
- Metro JavaScript export for both iOS and Android: passed using `--no-bytecode`.
  The initial Hermes bytecode export could not spawn the compiler in this Windows
  environment (`spawn EPERM`); native/bytecode compilation is therefore unverified.
  The no-bytecode flag was used only for this local diagnostic export; release
  configuration and Hermes settings were not changed. Nothing was uploaded.

Physical Android/iOS layout, real radio transitions and production recovery are
**not** qualified by these automated tests.

## Release, investigation and rollback gates

No new SDK/dependency, paid service, Replay, tracing product, log drain, quota,
alert configuration, backend, portal, database, store submission, build number or
minimum-version policy changed. Sentry keeps its existing ten/minute/device cap
and 60-second operation cooldown; only bounded content of existing incidents grows.
Build allowance checks and explicit release authorization remain prerequisites.

After a separately authorized tester build: compare failures by exact build, not
just version 1.0.8. Use the first/final attempt request ID and UTC time to perform
one bounded Supabase or Worker log lookup. If no ID exists, inspect the transport
stage/cache signature and optional tester reproduction before choosing a server
repair. Do not mark existing issues resolved simply because a candidate is built.
No access to testers' devices is required for this correlation, but representative
device acceptance remains needed before claiming the experience is fixed.

Rollback is a subsequent mobile artifact omitting this candidate; keep current
store artifacts and do not raise mandatory minimum builds before qualification.
There is no backend rollback or production data mutation in this scope.

## Primary references consulted

- Supabase API/log correlation: https://supabase.com/docs/guides/troubleshooting/discovering-and-interpreting-api-errors-in-the-logs-7xREI9
- TanStack native lifecycle guidance: https://tanstack.com/query/latest/docs/framework/react/react-native
- OkHttp cache-only semantics: https://square.github.io/okhttp/5.x/okhttp/okhttp3/-cache-control/only-if-cached.html
- Installed `@supabase/postgrest-js` builder and `@tanstack/query-core` query/retryer
  sources were checked for actual SDK response, retry and cache-event ordering.
