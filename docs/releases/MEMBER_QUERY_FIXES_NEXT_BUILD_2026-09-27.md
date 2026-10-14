# Member query fixes — next mobile build

Status: implemented locally, queued for the next separately approved iOS/Android
candidate. **Not deployed, built, submitted or installed.** Existing iOS 99 / Android
20 remain unchanged. No EAS, Sentry, hosting or database settings changed; no paid
service or build was started.

## Evidence and limits

- [REACT-NATIVE-18](https://doji-i0.sentry.io/issues/7757068707/): announcement
  failures on iOS 99. The investigation found no announcement rows in production;
  the SETOF claim returns an empty array. The old client returned `data[0]`, which
  is `undefined`, producing a query failure. Reproduced with the installed query
  runtime. This is a confirmed client bug, not evidence of a native crash.
- [REACT-NATIVE-19](https://doji-i0.sentry.io/issues/7757257598/): one upcoming-Doji
  failure on Android 20. Historical sanitized diagnostics do not establish its
  cause. A request deadline/cancellation classification gap is reproducible, but
  it must not be presented as the proven cause of that specific historical event.
- [TanStack's query function contract](https://tanstack.com/query/latest/docs/framework/react/guides/query-functions)
  requires a defined successful value; `null` represents no result. The installed
  `@supabase/postgrest-js/src/PostgrestBuilder.ts` also confirms SDK fetch/abort
  errors can become plain error objects with HTTP status 0 on the outer response.

## Exact mobile changes

- `hooks/useAppAnnouncement.ts`: empty array/null results become `null`; response
  errors preserve HTTP status. Existing claim/action RPCs, claim retry setting,
  account-keyed cache, infinite stale time, targeting and popup behavior unchanged.
- `hooks/useUpcomingDoji.ts`: preserves response HTTP status and database code;
  normalizes both rejected promises and fulfilled SDK error envelopes; cleans up
  signals on every exit. A late response after cancellation cannot sync the clock.
- `lib/requestSignal.ts`: additive first-abort provenance (`parent`, `deadline`,
  `manual`). Existing timeout, cancellation, cleanup and other callers unchanged.
- New `lib/rpcQueryError.ts`: normalizes only these query errors. Proven client
  deadlines become `TimeoutError`, known lifecycle cancellations become `AbortError`.
  An actual HTTP rejection remains an error even if a signal was also aborted.
  An unexplained SDK abort remains reportable, not automatically suppressed.
- `lib/apiFailureTelemetry.ts`: allowlisted abort origin and absent-response flag
  complement existing HTTP status/SQLSTATE/error type. No raw error message, SQL
  details/hints, request arguments, member IDs, tokens or complete query keys leave
  the device. Existing deduplication, cooldown, error budget and alert rules remain.

Upcoming-Doji keeps its six-second per-attempt deadline, 30-second stale time, and
existing single transient retry with jitter. There is no new retry loop, polling,
schedule, realtime producer, database/Worker/RLS change, portal dependency, session
change, moderation command, new announcement or member push.

## Verification

Regression coverage is in `useOptionalMemberQueries.test.ts`, `rpcQueryError.test.ts`,
`requestSignal.test.ts`, and `apiFailureTelemetry.test.ts`. It runs the actual hook
query functions through real TanStack Query clients with mocked transport. It covers
empty/eligible announcements, preserved atomic dismissal, disabled anonymous reads,
valid/empty upcoming state, wrapped deadline/cancellation, real query cancellation,
late-response clock protection, HTTP/SQLSTATE preservation, bounded recovery and
terminal failure, and privacy-safe telemetry. These are not physical-device tests.

Final local verification (September 27, 2026):

- Full Jest run: **130 suites / 1,002 tests passed** (including notification,
  auth/session, realtime, member-query and existing isolation contract tests).
- `tsc --noEmit`: passed.
- ESLint on all nine changed/new TypeScript source/test files: passed.
- Scoped `git diff --check`: passed.
- No live RPC, claim/action, deployment or build was run as part of these fixes.

## Next-build gates

September 28 release update: the owner authorized both mobile builds and test-store
submissions. The reviewed fixes are now being packaged as iOS **100** and Android
**21** (1.0.8). Fresh verification passed 134 suites / 1,042 tests, TypeScript,
full ESLint, the installed React Native request-lifetime probe, and both production
JavaScript exports. Both builds finished successfully; iOS submission succeeded.
Android's AAB was uploaded after the owner selected the file; Alpha release 21 was
sent for review on September 28, with Play quick checks still running. This is not yet an installed-client
or store-availability claim. See `MOBILE_QUERY_BUILDS_100_21_2026-09-28.md` for exact jobs,
the isolated candidate, included-credit checks, and submission/device gates.

September 28 addition (included in the candidate above): `lib/scaleReadGateway.ts` no longer throws the
unsupported native `AbortSignal.reason`; deadlines become portable `TimeoutError`
values and lifecycle cancellations remain `AbortError`. Both feed paths await the
transport before releasing parent cancellation/deadline listeners and reject cancelled
late results. Real HTTP rejections are preserved. Existing eight-second deadlines,
single transient retry, authorized RPCs, pagination, fail-closed scale routing and
one 401 refresh remain unchanged. The installed React Native polyfill is exercised by
`memberRequestLifetime.test.ts` and `scripts/probe-member-request-lifetime.mts`.
Latest full regression: 133 suites / 1,038 tests passed. See
`PERFORMANCE_REPAIR_2026-09-28.md` for separately approved backend changes; these are
not part of the mobile artifact or a claim that installed clients contain the fixes.

1. Keep this mobile candidate separate from pending admin/Worker/database work.
   `.easignore` includes `hooks/` and `lib/`, so the new helper is in the mobile
   upload boundary. Prepare and inspect a fresh mobile-only archive; do not reuse
   the old hardcoded 99/20 launch script or assume its historical snapshot exists.
2. At build time, recheck included build allowances, select fresh unused build
   numbers and validate both bundles. This turn does not authorize a paid overage.
3. On physical iOS and Android: cold start/foreground with no eligible announcement
   must show no popup/error; test an eligible announcement and dismissal using a
   safe test environment or an explicitly authorized test audience, not a broadcast
   to production members.
4. Verify existing 20-minute pre-live display, its dismissal, activation and the
   server-authorized 10-minute participation/direct-to-feed flow. Exercise offline
   recovery, foregrounding, and account switching; clock state must not be updated
   from a cancelled request.
5. Review new-release Sentry events. Timeout exhaustion must remain visible with
   the new bounded context. Existing installed 99/20 clients can still emit the old
   errors until updated; do not mute or resolve issues just to hide those emails.

Rollback is a separately prepared mobile release reverting only the six production
files listed above, if necessary. There is no server deployment to roll back and no
change to update enforcement. Do not revert unrelated worktree changes.
