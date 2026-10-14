# Native read recovery — next-build preparation

Status: source-only preparation after 1.0.10 (iOS 105 / Android 30). Owner requested
implementation/testing for the next build, not a build, upload, deployment, store
submission or release-policy change. No version/build number has been allocated.

## Evidence and scope

October 12 diagnostics found seven handled read failures in one Android 1.0.9 / 29
session. Six final attempts began with OS connectivity explicitly offline, crossed
a roughly 31-minute background interval, and reported expired client deadlines on
resume without dispatching a fetch. Notification-center evidence was less precise;
its outer auth wait did not attribute the failure phase. This does not prove a
backend outage, crash or root cause for every Sentry issue.

The shared iOS/Android read lifecycle previously reconciled foreground reads even
offline and allowed obsolete requests/retry backoff to survive suspension. Existing
1.0.10 push-registration recovery is separate and does not contain this change.

## Prepared behavior

- Passive `expo-network` observations plus AppState drive TanStack availability.
  Explicit offline or non-active state pauses starts/retries. Unknown connectivity
  permits bounded reads; no new active probes, intervals or dependencies.
- Suspension cancels only the existing server-read allowlist (admin reads only
  under the existing admin scope), preserving cached content and aborting parent
  signals. Late completions cannot replace current cache data.
- Available foreground return waits for cancellation, invalidates active reads
  while paused, then releases once. Inactive surfaces become stale without eager
  fetching. Duplicate events coalesce; old account/disposal callbacks are fenced.
- Ordinary socket hints retain `cancelRefetch: false`. Recovery state is scoped
  to QueryClient, user and role rather than one process-global in-flight promise.
- Native mutations explicitly use `networkMode: always` with existing retry rules:
  commands execute/error immediately, never queue for automatic offline replay.
  Query-shaped announcement claims and separate notification bootstrap commands
  are not cancelled. Auth provider refresh itself is not cancelled or replaced.
- Genuine foreground HTTP failures and client deadlines still reach the existing
  error path. Intentional lifecycle cancellation is not a terminal query error.
  No Sentry suppression rule, quota change, new telemetry field or identity is added.

No backend, portal, RPC/RLS, realtime event, durable alarm, push rule, challenge
window, purchase/submission policy or server timing change is included. This cannot
make an unreachable service reachable or eliminate every network timeout.

## Validation

Local tests use fake clocks, mocked native observations and synthetic promises;
no production users, challenge occurrences, emails or notifications are touched.
The real TanStack QueryClient/QueryObserver tests cover the seven-read suspension,
31-minute delay, reconnect, preserved cache, late responses, retry backoff, auth
wait cancellation, genuine timeouts/HTTP errors and non-replayed commands. Component
tests exercise both native platforms, web exclusion, roles and snapshot races.

Local validation: 253 Jest suites / 4,685 tests passed; application TypeScript,
scoped ESLint, source-size, repository hygiene and handbook-link checks passed.
The 30 focused lifecycle tests cover the three lifecycle/reconciliation files at
100% statements/functions/lines and 96.55% branches combined (the new controller
is 100% on all four metrics). These are focused results, not all 17 area budgets.
Jest's default sandbox temporary
cache hit a filesystem rename restriction; the successful run used the ignored
workspace cache `test-results/jest-read-lifecycle`. No test assertion was bypassed.
Full CI/17-area coverage
and physical-device acceptance remain release gates; local tests are not a device
or production-resolution claim.

## Next build / acceptance

1. Review/merge this source through normal CI. Build a new immutable candidate;
   do not overwrite the already-submitted 1.0.10 artifacts or force an update now.
2. On physical iOS and Android, load feed/polls/notifications/shop/current Doji,
   disable networking, background for longer than the request deadline, then
   return offline and finally restore networking. Verify cached content remains
   and current active content refreshes without the obsolete failure burst.
3. Repeat rapid background/foreground and Wi-Fi/cellular transitions; sign out
   and switch accounts during recovery. Confirm no old-account content appears.
4. Exercise server-authorized participation/completion, purchases and push opt-in
   using approved test conditions. No duplicate command or surprise offline replay.
5. Check Sentry release/build tags and genuine injected test-service failures.
   A quiet alert inbox alone is not proof of recovery or whole-platform health.

Rollback before release: revert this isolated lifecycle source and tests, then
rerun checks. After release, use a separately approved corrective build; there is
no database migration, configuration toggle or backend rollback in this scope.

References: [TanStack React Native lifecycle](https://tanstack.com/query/latest/docs/framework/react/react-native),
[query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).
