# Notification history repair — local candidate

## Scope and evidence

Member client only; no portal, Worker, SQL/RLS, schedules, push policy, auth settings,
credentials, billing or release-policy changes. No build/deployment started.

The reported pre-live card used a future `sortAt` for receipt comparisons. The existing
20-minute notice remains visible until cleared/dismissed; its countdown/copy are
unchanged. Visibility and unread now share the server-owned `prelive_at` / later
`activated_at` activity time, with legacy `sortAt` fallback. Later live activity can
appear after a pre-live dismissal.

Whole-map snapshots in overlapping dismissals could overwrite newer dismissals.
The client now projects pending intents over confirmed receipts, executes existing
atomic commands in order, and serializes confirmed local persistence. Failed writes
roll back only their own intent; disk failure cannot undo a committed RPC. Repeated
Clear/same-item Dismiss taps share a pending command. Pending requests still survive
Clear, consistent with the existing product contract.

Account change/unmount invalidates the queue and guards late responses, attention
receipt requeue, OS badge cleanup and disk writes. Bootstrap/snapshot tokens are
pinned to the captured user. The optional command guard checks the actor before
dispatch, retry and after refresh; other command callers retain their behavior.
Already dispatched requests may complete for their original actor; this does not
claim that network requests already accepted by the server can be undone.

## Sentry investigation (read-only)

Matched event `a08177e133174c61aace68cb91af1fe9` in
[REACT-NATIVE-17](https://doji-i0.sentry.io/issues/7756991442/events/oldest/).
Release 1.0.8, distribution 98, handled query error. Three events were visible at
inspection. Recorded operation was `query.other`; API context only contained
`kind: unexpected`. The synthetic stack points to the telemetry wrapper, not the
failed query. These records cannot establish the original cause or connect it to
the dismissal symptom. The issue was not resolved/archived or silenced.

Added the omitted static query roots to the privacy allowlist (including upcoming
Doji, announcements, badge/suggestion/shop/profile reads) and a bounded error-type
field. Full query keys, identifiers, member content, arbitrary names/messages and
server details remain excluded. Existing per-operation cooldown and event budget
remain unchanged. This fixes the diagnostic gap, not an unproven underlying error.

## Design references

- [TanStack optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates): distinguish concurrent pending intents and roll back failed work. This hook retains its existing callback API and projects intents separately from query data.
- Existing server contracts: `20260825004000_server_owned_notification_timestamps.sql`
  (atomic, server-timestamped history commands) and the installed PostgREST builder's
  `setHeader` API. No command was split into multiple client writes.

## Acceptance before release

Local verification completed: **127 Jest suites / 964 tests passed**, TypeScript
(`npx tsc --noEmit`) and full repository lint (`npm run lint`) passed. Compared with
the exact build-98 `upload-r2` inputs, only `hooks/useNotificationCenter.ts`,
`lib/notificationVisibility.ts`, `lib/commandGateway.ts`, and
`lib/apiFailureTelemetry.ts` changed; `lib/notificationHistoryQueue.ts` is the new
runtime helper. Tests and documentation are outside those release inputs. Existing
unrelated worktree changes were preserved; none were deployed by this repair.

Automated coverage: pre-live Clear/Dismiss/unread, later activation, legacy payloads,
rapid success/failure, Clear/Dismiss ordering, repeated taps, open ordering, storage
failure, bootstrap rebase, direct account switch, sign-out, unmount, stale response,
token/refresh mismatch, retry cancellation, telemetry privacy and budgets.

On physical iPhone and Android: dismiss and Clear during pre-live; restart and verify
the receipt persists; verify unread clears after viewing and later activation is new
activity; dismiss multiple ordinary items quickly; induce a failed request and verify
visible retry feedback; switch accounts during a pending action; confirm neither
account sees the other's notification state. Inspect newly named Sentry events and
investigate any recurrence. These device checks remain outstanding.

Rollout/rollback: rebuild only reviewed mobile inputs, with allowance verification
and release approval first. No backend rollout is required. Retain the prior binary
for comparison; a client regression requires a corrective mobile release, not a
portal or database rollback.
