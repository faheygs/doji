# Member-app code review — September 26, 2026

## Verdict and scope

Not ready for an unqualified “reporting and performance are good.” The architecture
has useful safeguards, but this review identified reproducible reporting and
monitoring defects, a comments recovery problem, and incomplete release gates.

Read-only review of the current working tree: member reporting, comments, command
and read gateways, retries, telemetry, authentication/cache lifecycle, realtime
contracts, and existing tests. Existing uncommitted work was preserved. Only this
report and local characterization tests were added/edited for the audit. No app,
portal, shared infrastructure, database, sessions, deployment, or billing changed.

The working tree is not necessarily the exact code installed on a phone. No new
physical-device test, production load test, or comprehensive security/legal
certification was performed. Historical operational figures below come from the
previous read-only diagnosis, not a fresh live measurement during this review.

## Findings, ordered by urgency

### 1. P1 — Reporting a feed post removes the dialog's owner before the response

Evidence: `hooks/useReportContent.ts:54–69`,
`components/feed/PostCard.tsx:440–450`, and
`components/feed/ReportSheet.tsx:166–184`.

The hook optimistically removes the reported post from feed query data. The feed
card owns the report sheet, so removing that row unmounts the reporting surface
while its command is still pending. The sheet depends on per-call mutation
callbacks to show success, offer the next step, or display a submission error.
Those callbacks are not delivered to the unmounted observer. Rollback can restore
the card, but not its previous open-dialog state.

A local React/TanStack characterization test reproduces the actual hook removing
its owner before the command settles, with no per-call success callback afterward.
This is a component-level reproduction, not a physical iOS modal test.

Fix direction: keep the report workflow mounted independently of the removable
feed row. Preserve content hiding, but do not equate optimistic removal with a
confirmed server receipt. Test success, rejection, timeout, and delayed response.

### 2. P1 — Handled server failures can bypass issue reporting

Evidence: `lib/commandGateway.ts:166–187`, `lib/queryClient.ts:5`, and
`hooks/useComments.ts:25–33`.

After exhausting its HTTP-status retry, the command gateway returns the error
without calling its telemetry reporter. Only the exception/catch exit reaches
that reporter. The query client has no shared query/mutation error capture, and
the comment-read path simply throws the returned database error.

A local test returns HTTP 500 / SQLSTATE 57014 twice from mocked fetch. The gateway
retries, then returns the failure without invoking its telemetry reporter. Thus a
working Sentry connection does not establish coverage of handled member failures.
Unhandled/native error capture is a separate path and is not claimed broken.

Fix direction: bounded, sanitized reporting of terminal unexpected failures,
tagged by operation, release, HTTP status and database error code. Preserve string
SQLSTATE values (the current telemetry helper only preserves numeric codes).
Expected validation/auth failures and recoverable offline events should not all
become high-volume incidents. Never send report text, credentials, or private
content as telemetry context. Test telemetry delivery and deduplication, not merely
that Sentry initializes.

### 3. P2 — A failed comments refresh hides usable cached comments

Evidence: `components/feed/PostCommentsThread.tsx:705–724`.

The component renders a full error state whenever `isError` is true, before it
renders its list. TanStack can retain previously loaded data while setting
`isError`/`isRefetchError` after a failed background refresh. A local observer test
confirms that state combination. The current branch consequently hides comments
that are still available, making a transient read failure look like an empty or
broken thread, including after a successful write.

Fix direction: distinguish initial-load failures from refresh failures. Keep
authorized cached comments visible with an inline retry/status notice on transient
refresh failure. Do not retain data across logout, identity changes, or an explicit
loss of authorization. Test successful posting followed by failed refresh.

### 4. P2 — Retrying a report creates a new idempotency key

Evidence: `components/feed/ReportSheet.tsx:166–176`,
`hooks/useReportContent.ts:40–50`, and
`supabase/migrations/20260925123000_serialize_policy_report_commands.sql:90–95`.

The hook assigns a key to the mutation input object. The sheet creates a fresh
object for each submission. Automatic gateway retries preserve a key, but a user
retry after an ambiguous timeout does not. A hook test confirms different keys
for two submissions of the same report intent.

The server correctly serializes and replays receipts for the same key; it cannot
replay that receipt under a new key. If the first request committed but its response
was lost, a user retry can create another report where the target remains available,
or fail because the original report changed visibility. Neither communicates the
original confirmed outcome reliably.

Fix direction: retain the key for an unresolved intent through retries. Generate
a new key only for a genuinely new intent. Test a committed write with lost response,
then retry, asserting one server receipt/report. Local tests here did not write to
the database or demonstrate a production duplicate.

### 5. P2 — Transient scale-read errors are not recognized as retryable

Evidence: `lib/scaleReadGateway.ts:49`, `lib/apiRetry.ts:33–50`, and `eas.json:37`.

The read gateway throws a plain error such as `Scale read failed (503)` without a
status property. The retry classifier recognizes structured HTTP status or messages
matching “command/request failed,” not “Scale read failed.” A direct test confirms
503 is classified non-transient. The production EAS configuration has a scale-read
URL, so this is not merely an unused local helper.

Fix direction: preserve structured status on read-gateway errors so configured
bounded retries work for 429/503. Preserve fail-closed authorization and avoid a
fallback that bypasses the gateway. Test 401/403 remain non-transient and 429/503
retry within the existing limit.

## Performance: not cleared for peak traffic

The earlier `docs/RELIABILITY_DIAGNOSIS_2026-09-26.md` recorded 30 statement-timeout
log entries in its investigated period and explicit row contention in reaction
rate limiting. Operations included reactions, notification snapshots, push
registration and the realtime relay. The finalized September 25 Doji had 88
realtime samples, p95 21.588 seconds and maximum 103.938 seconds. Quiet-period
recovery and an empty outbox do not explain or resolve those failures.

That evidence does not prove portal traffic caused the incident, identify the
initial blocker, or establish that buying capacity is necessary. The local
social-fanout scale script uses assumed provider/database throughput; it is a
capacity model, not a benchmark against deployed systems.

Next investigation: isolated, representative concurrency tests of reactions,
notification reads, push-registration profile writes, and relay claims; capture
query plans, lock waits, operation durations, retry volume, and frontend recovery.
Any resulting shared SQL/Worker changes require their own approved impact,
regression, deployment and rollback plan. No production load test or paid service
is authorized by this review.

## Useful safeguards already present

- Atomic server-owned commands and receipt-based idempotency; reporting validates
  target ownership and taxonomy on the server rather than trusting the client.
- Critical report categories route through restricted triage and quarantine
  contracts. Existing tests cover substantial taxonomy/authorization behavior,
  though many are source-contract assertions rather than end-to-end execution.
- Bounded reads, request deadlines, query caching, targeted realtime invalidation,
  foreground/reconnect reconciliation, and durable challenge scheduling.
- Member auth clears account-scoped caches on identity changes and uses local
  sign-out. Employee/member role checks are distinct in the inspected gateway.
  No new portal-induced mobile-session defect was established by this review;
  that is not a guarantee of physical infrastructure isolation.

## Verification results

| Check | Result | Interpretation |
|---|---|---|
| Existing full Jest run | 119/121 suites; 879/881 tests passed | Two assertions fail; release gate is not green |
| Local audit characterization | 2 suites, 5 tests passed | Reproduces current defects/state combinations; does not mean they are fixed |
| Member-source ESLint scan | 310 files; 0 errors, 0 warnings | app, components, hooks, lib, stores, contracts, constants |
| Normal TypeScript check | 16 diagnostics | Generated realtime Edge Function copies under test-results are included in the mobile TS program |
| Same TS program with generated test-results excluded in memory | 0 diagnostics | Source typecheck clears that contamination; repository config was not changed |

The two full-suite failures are:

1. `__tests__/lib/operationalHealthDiagnostics.test.ts`: expects provider/network
   attribution despite the newer relay-stage diagnostic behavior.
2. `__tests__/edge-functions/scale-hardening-contract.test.ts`: expects a literal
   member-role comparison, while implementation now parameterizes the expected
   role with separate member and employee entry points. This mismatch is not by
   itself evidence of an authorization bypass.

Review the intended behavior before updating assertions. Replace brittle
source-string checks with behavioral coverage where feasible. Keep generated
release copies outside the mobile typecheck. The full suite totals above precede
the separately run diagnostic tests added for this review.

## Recommended sequence

1. Repair reporting lifecycle and receipt-key retention; add behavior tests.
2. Repair comments recovery, read-error classification, and terminal error coverage.
3. Restore clean release gates and run physical-device regression tests, including
   report acceptance/rejection/retry, comments, background/resume and member sessions
   while signing into/out of the employee portal.
4. Investigate shared-system contention separately, with explicit approval before
   any shared backend change or production-impacting test.

Keep mobile, portal, and shared-system releases separate. Do not deploy the entire
dirty working tree as a shortcut. These are recommendations; no fix was implemented
or released in this audit.
