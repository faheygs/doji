# Android 21 reliability follow-up — September 28, 2026

Status: mobile candidate locally verified; **not built or deployed**. Android
enforcement stays paused. This is not proof that all historical latency is resolved
or that the system supports 100,000 concurrent users.

## Repair

Five reads (`userEvent`, `mobileReleasePolicy`, `leaderboard`, paged `friends`,
`userBadgeProgress`) discarded PostgREST envelope status and local abort origin.
Wrapped native deadlines could become `unexpected` and miss the transient retry.
`runMemberRead` now retains both through the existing `rpcQueryError`, rejects late
cancelled success, skips pre-cancelled dispatch, and removes timers/listeners.
Real HTTP/auth/SQL errors remain visible. SQL details/hints and request arguments
are not copied into telemetry. Keys, safe fields, limits, enabled conditions, cache
policy, server-clock authority and 6/8-second deadlines are unchanged. The helper
does not retry: existing TanStack policy allows only one transient replay; installed
SDK behavior is unchanged.

`mark_notification_attention_seen` already has one idempotent replay with identical
payloads. Added tests cover successful and failed HTTP 504 replay. No timeout was
raised, no alert was muted and no production write was used for diagnostics. This
command records seen state; it does not send push or clear notification history.

## Live evidence: read-only, 14:21–14:27 UTC September 28

- Supabase recorded 91 gateway, 7 PostgREST and 2 Postgres logs. HTTP status >=400
  returned no rows; grouping verified populated status fields, including badge
  progress HTTP 200. Missing recorded errors do not establish client success.
- Postgres showed checkpoint start/completion, not an identified SQL timeout.
  Seven PostgREST entries said `Warp server error: Thread killed by timeout manager`.
  Upstream documents this can occur during normal operation; it is not proof of
  slow SQL or the cause of these alerts.
- Cloudflare's matching command search returned two invocations and associated
  logs, no error-level records. At **14:23:14.462 UTC**, invocation
  `5ed91a2fcc137b9e8ce1b976c48eed37` returned **HTTP 200 in 313 ms wall/2 ms CPU**
  for Android **21**, Worker `3f34bb34-7b7c-44f6-a59e-7ad200c6cee3`.
  The connection organization was Google LLC. This is NOT a proven match to the
  Sentry 504 at **14:23:22.486 UTC**: sanitized app events lack request correlation.
  Sentry's code is `DOJI_COMMAND_ERROR`, not the Worker's own `DOJI_COMMAND_504`.
- Play pre-launch overview displayed "Upload artifacts to generate pre-launch
  reports", with no report to inspect. Google automated testing remains a hypothesis.
- Play's Test and release page now shows **21 (1.0.8)** serving in **closed Alpha**
  and no unpublished changes. This does not establish all-user eligibility. No
  global update policy was changed or resumed.

The exact cause of the historical 504 and five generic failures remains unproven.
Do not call them harmless or infer database capacity failure, data loss or Google
testing solely from these observations. No new logging product, drain, tracing,
billing agreement, deployment or recurring query was enabled.

## Validation

- Full Jest: **136 suites, 1,073 tests passed**, including 31 added tests.
- TypeScript `--noEmit`: passed. ESLint for all changed code/tests: passed.
- Real TanStack clients execute all five hooks with native wrapped deadlines,
  bounded recovery, terminal HTTP errors and cancellation. Helper coverage includes
  late settlement, pre-cancelled work, cleanup, auth/status precedence, SQLSTATE and
  unknown aborts. Notification command tests verify identical 504 replay payloads.
- No synthetic production member actions or traffic load generated.

## Additional 09:03–09:13 MDT alerts: queued September 28

The owner requested fixes queued for the next build, not another build/deployment
in this turn. `mySuggestions`, `ownedShopItems` and reaction reads (including
prefetch) still used the older raw PostgREST error-envelope path. They now use
`runMemberRead` with unchanged eight-second deadlines, member filters, safe-field
projections, 100-row history/ownership bounds and 50-row reaction cursors. Existing
one-retry query policy is preserved. No shop purchase, rewards, suggestion review,
feed visibility or backend command was changed.

The same read-only Sentry search also surfaced `query.reactionsGiven` issue
7759440110. Its count hook had the identical raw-envelope gap and is included in
this candidate, with the existing `get_reactions_given_count` RPC, member argument,
numeric result, cache key and stale time preserved. Its HTTP/deadline/cancellation
and successful count contracts are covered by the same tests.

Read-only Sentry inspection confirmed issue **REACT-NATIVE-1H / 7759415556**,
event `0ac00475464f459296c79f210954e386`, Android **21**, September 28
**09:03:57.336 MDT**: native token acquisition failed with
`Fetching the token failed: java.util.concurrent.ExecutionException: java.io.IOException: SERVICE_NOT_AVAILABLE`,
operation `push / endpoint-registration`. The existing generic API classifier did
not recognize this native Firebase retryable error, so the foreground registration
loop exited after the first failed attempt. The new `retryPushRegistration`
boundary recognizes Firebase's three exact transient token error endings in the
Expo wrapper, retaining the existing four-attempt maximum and 1/3/10-second
backoff with jitter. Permanent/unknown native errors remain terminal. Exhausted
retries still reach the existing reporter; cancellation/account changes stop
additional attempts. False (registration no longer applicable) stops instead of
retrying and potentially resurfacing an earlier failure. Existing registration
single-flight and receipt logic remain unchanged; a token failure never clears
an existing endpoint/receipt. No recurring timer/poll or notification scheduling
was introduced. The explicit permission-request flow was not changed by this fix.

History check: September 20 commit `4b60b57` already had the raw error-envelope
helper without abort provenance and a one-attempt foreground push registration.
That does not prove the cause of last week's versus today's device experience.
The incomplete read repair and missing native transient recovery are confirmed
code defects; the original network/provider failure cannot be attributed to a
specific release from this evidence. Do not claim all service failures are fixed.

Latest validation supersedes the earlier counts above:

- **137 Jest suites / 1,104 tests passed**, including 31 additional tests for
  these follow-ups. Real query-client recovery, cancellation, terminal status,
  preserved projections/cursors and reaction prefetch are covered.
- Push tests cover the exact observed Java-wrapped error, all three Firebase
  transient variants, deterministic failures, four-attempt exhaustion, cancelled
  work, no-op registration, real registration recovery and receipt preservation.
- TypeScript `--noEmit` and changed-code/test ESLint passed.
- Scoped diff whitespace check passed. Whole-worktree check reports unrelated
  pre-existing whitespace in `website/admin-portal/index.html`; left untouched.
- No cloud build, upload, deployment, enforcement change or paid action performed.

Next-build qualification: Android device launch/foreground with notifications
allowed, transient/offline recovery, account switching during backoff, suggestion
history, shop ownership and paged reaction voters. Confirm endpoint registration
and actual delivered notification separately: obtaining a token is not proof of
on-time delivery. Keep alerts enabled and compare failures by the new build number.

References:

- [Exact Sentry issue](https://doji-i0.sentry.io/issues/7759415556/).
- [Firebase Android GmsRpc source](https://github.com/firebase/firebase-android-sdk/blob/main/firebase-messaging/src/main/java/com/google/firebase/messaging/GmsRpc.java): `SERVICE_NOT_AVAILABLE`, `INTERNAL_SERVER_ERROR`, `InternalServerError` and increasing-backoff guidance.
- [Expo notifications API](https://docs.expo.dev/versions/latest/sdk/notifications/): native and Expo token acquisition are distinct operations; transport failure must be handled.

## Expanded read audit checkpoint

The owner approved completing the remaining member-read/shared-request audit.
See `MEMBER_READ_AUDIT_NEXT_BUILD_2026-09-28.md` for defects, inventory, explicit
write-bearing exceptions, primary references and device qualification. The older
helper and `runMemberRead` now share implementation; comments/friendship/nested
profile reads are included. Stalled token/body observation, expired dispatch,
SDK retry multiplication and username-check recovery are covered. Latest local
validation is **140 suites / 1,228 tests**, TypeScript and scoped lint passing.
The final component sweep also included poll-summary and paged-voter reads.
This supersedes counts above, not the historical evidence or release status.
No replacement native build, production change or paid action was performed.

## Release / remaining work

Requires replacement native builds; installed Android 21/iOS 100 do not contain
this repair. Recheck included build allowances before building. Physical devices
must qualify normal/poor-network navigation, foreground recovery, account changes,
notification acknowledgement and daily Doji. Keep monitoring real failures.
A repeated 504 needs correlated request/edge evidence before choosing a backend
repair; any shared deployment requires separate impact, regression and rollback
review. No cost-bearing infrastructure change is justified by retained evidence.
Rollback: keep previous store artifacts and do not raise minimum builds before
qualification. No DB/Worker rollback is needed for these mobile-only edits.

## Primary references checked

- [Supabase log query guidance](https://supabase.com/docs/guides/observability/advanced-log-filtering): bounded times/fields/limits; proximity is not correlation.
- [PostgREST upstream issue 4799](https://github.com/PostgREST/postgrest/issues/4799): misleading Warp logs during normal operation.
- [TanStack cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) and installed PostgREST `PostgrestBuilder.ts`: SDK error envelopes and cancellation contracts.
