# Member reliability repair — September 26, 2026

## Status and boundary

Implemented and verified locally. **Not deployed, not a claim that every app issue
or the historical database slowdown is fixed.** This follows
`APP_CODE_REVIEW_2026-09-26.md` and the project context/architecture contracts.

This turn changes member-client code, tests and documentation only. It does not
change portal code, live sessions, SQL functions/RLS, Worker code/configuration,
push scheduling, release enforcement, provider plans or quotas. Existing unrelated
working-tree changes remain untouched and must not be bundled into this release.
The database regression uses only a hard-coded local container and synthetic data,
and rolls back its transaction. Shared infrastructure is not physically isolated.

## Repairs

| Finding | Implemented behavior | Regression evidence |
|---|---|---|
| Report owner disappears during optimistic hiding | One identity-keyed report host above feed rows; fixed-footer pending/error feedback; confirmed success and separate optional blocking | Actual sheet/hook/cache integration: row unmount, pending dismissal guard, failure recovery, confirmed success |
| Lost report response creates a new intent on retry | Latest unresolved input retains its receipt key through manual retry and sheet reopen; success clears it | UI integration plus real local SQL replay returns the same receipt and exactly one report |
| Late rollback overwrites cache | Original-identity check; restore only an unchanged optimistic cache reference; reconcile ambiguous commits through authorized reads | Logout/cache-clear and newer-feed-data regression tests |
| Handled server errors do not reach monitoring | Terminal command and global QueryCache/MutationCache reporting; safe operation/status/SQLSTATE, error-object dedupe and event budget | HTTP 500/57014, two query observers, privacy filtering, cooldown/budget, expected-error suppression |
| Refresh failure hides cached comments | Keep previously authorized comments for transient refresh errors, with contextual retry; fail closed on initial/auth errors | Real QueryObserver refresh state plus classification tests |
| Scale read failure loses HTTP classification | Structured HTTP status, eight-second response/body deadline, query cancellation, no direct-read fallback | 401/403/429/503 tests, body cancellation and deadline tests |
| Read retry misclassifies errors | Bounded retry recognizes SQLSTATE 57014; explicit auth/validation takes precedence over message text | Auth errors containing timeout/network wording never retry |
| iOS report handoff races native dismissal | Post options, comment actions/comments sheet and poll voters wait for native `onDismiss`; shared opt-in leaves ordinary dismissal unchanged | Native Modal prop/callback integration plus entry-point contract checks |
| Release gates contain stale/generated inputs | Updated two assertions to existing implemented contracts; generated test-results excluded from Jest/mobile TS | Full suite, TypeScript and lint clean |

Manual retry retention is in memory for the latest unresolved intent, not an
offline queue or process-death guarantee. Changing target/reason/notes creates a
different intent. No report notes or retry metadata are persisted to disk.

## Research used

- [TanStack mutation lifecycle](https://tanstack.com/query/latest/docs/framework/react/guides/mutations):
  per-call callbacks do not run after their component unmounts; this supports the
  persistent report owner rather than relying on callbacks in a removable row.
- [TanStack QueryCache callbacks](https://tanstack.com/query/latest/docs/framework/react/reference/interfaces/QueryCacheConfig):
  global callbacks run once per query, avoiding per-observer incident duplication.
- [TanStack query result states](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery):
  a refetch error and existing data can coexist; initial and refresh failures need
  different UI states.
- [React Native Modal](https://reactnative.dev/docs/modal): iOS `onDismiss` is the
  native dismissal acknowledgment. A JavaScript animation frame is not equivalent.
- [Sentry React Native filtering](https://docs.sentry.io/platforms/react-native/configuration/filtering/):
  client filtering avoids unnecessary event volume; `beforeSend` strips sensitive
  fields from these newly captured handled JavaScript failures. This does not claim
  to change/filter all native crash reporting.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html):
  conflicting row changes can wait until the holding transaction ends. Finding a
  cancellation inside a function does not identify the initiating bottleneck.

## Verification

- `npx jest --runInBand --silent`: **125 suites, 921 tests passed**.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed, no diagnostics.
- `npm run test:scale-bursts`: 30/60/120-second arithmetic models passed. These use
  assumed provider/database throughput; they are **not measured capacity or load tests**.
- `node scripts/test-member-report-local.mts`: passed against the existing local
  full schema. Tests include exact receipt replay, one report, critical quarantine,
  restricted triage and visibility denied to reporter and author. Synthetic media
  uses the actual reserved-upload contract; triggers are not disabled/replaced.
  Persistent user/profile/report/receipt counts and public function-definition hash
  match before/after. Empty Vault prevents external admin email delivery. This is
  SQL business-contract verification, not an HTTP authorization or handset test.

New behavior tests are under `__tests__/components/reportFlowRecovery.test.tsx`,
`nativeSheetHandoff.test.tsx`, `__tests__/lib/apiFailureTelemetry.test.ts`,
`commandGatewayTelemetry.test.ts`, and the extended scale-read/retry suites.
Historical characterization tests under `test-results/app-audit-20260926` remain
unchanged as evidence of the old behavior, not current release tests.

## Performance: not cleared

The prior incident includes real database timeouts and a confirmed reaction-limiter
row wait. See `RELIABILITY_DIAGNOSIS_2026-09-26.md`. No new production load was generated.
The local database has no production-sized member data, so fast fixture execution
cannot establish production performance.

Inspection of installed local `register_push_token(text)` confirms an unconditional
profile update for the caller, including when `notification_token` is unchanged.
This reruns profile-update triggers. The limiter uses `(user_id, action, bucket)`
keys, so contention is actor/action scoped; it is not evidence that all members
share one limiter row. Neither fact identifies the historical initiating blocker.

A separate approval was initially requested for the unchanged-token optimization.
The owner subsequently approved deployment; it is now live and verified, with
evidence and rollback in `PUSH_REGISTRATION_RELEASE_2026-09-26.md`. The original
approved scope was:

1. Skip the redundant caller profile update only if the normalized token matches,
   while preserving authentication, profile existence, token transfer from other
   accounts, advisory-lock serialization and atomic rollback. Preserve profile
   content validation and economy triggers for actual profile edits.
2. Test repeat registration, token change, same-token transfer between accounts,
   concurrent registration, deleted/missing profile and injected transaction failure.
   Assert old active endpoint recovery and unchanged mobile sessions. Test through
   the full v3 registration chain, not only its helper.
3. Reproduce mixed reaction writes, notification snapshots, endpoint registration,
   relay claims and bounded portal reads in a synthetic local environment; record
   execution time and actual blocking relationships. Do not weaken abuse limits,
   remove triggers, add speculative indexes or upgrade capacity based on a guess.
4. Deployment is a separate approved shared-system release: capture the existing
   function definition, apply only the reviewed function change in a low-traffic
   window, smoke-test affected member contracts, compare timeout/lock and relay-stage
   telemetry, and restore the captured definition if regressions appear. Rollback
   must retain all committed member data. No portal deployment is involved.

## Required before member-client release

1. Build from an isolated reviewed change set; do not publish this entire dirty tree.
2. On a physical phone, verify post/comment/poll/profile report entry points,
   category/concern correctness, double tap, pending close/back, successful receipt,
   rejected/ambiguous response, retry, optional block failure and repeated reopen.
   Check native modal handoff, no invisible touch blocker, keyboard, VoiceOver,
   Reduce Motion, small screens and both themes. Jest does not prove UIKit behavior.
3. Verify cached comments remain usable during an induced transient refresh failure,
   successful comment submission followed by a failed refresh, empty initial load,
   explicit access loss, logout/account switch, foreground and reconnect.
4. Verify profile/feed/comments and mobile session continuity while separately
   signing into, locking and signing out of the employee portal. This turn does not
   modify any authentication/session or portal contract.
5. In a controlled release, verify an approved synthetic handled failure reaches
   Sentry with the expected operation/release/code and without private context.
   Capture is mocked in automated tests. Check existing quota/overage controls first:
   the new budget is ten unexpected events/minute/device, not an account-wide cap;
   do not infer zero billing risk or increase paid capacity automatically.
6. Verify participation still ends at the server-authorized ten-minute boundary and
   completed participation still goes directly to the feed. Do not change update
   enforcement or submit Android as part of an unrelated portal task.

Member rollback is the previous approved compatible app artifact/update, with no
database reversal or session revocation. No TestFlight build or OTA update was sent
by this repair turn. Device testing, live Sentry delivery and backend performance
remain explicit gates rather than implied successes.
