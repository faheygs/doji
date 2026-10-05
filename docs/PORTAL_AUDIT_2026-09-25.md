# Portal audit — September 25, 2026

Remediation update: the four findings below were implemented, tested and deployed
in portal bundle `20260925an`. See
[`PORTAL_ISOLATION_RELEASE_2026-09-25.md`](PORTAL_ISOLATION_RELEASE_2026-09-25.md)
for production verification, unchanged-member-code comparison and rollback details.
The original audit evidence below is retained as a historical record.

## Verdict

Not a complete all-clear. The existing regression suite passes, but an additional
local expiry probe reproduced a sensitive-data display defect. Three further gaps
were identified in the current source contracts. No production mutations or fixes
were performed during this audit.

The publicly deployed `admin-app-20260925am.js` matches the freshly built audited
bundle by SHA-256 comparison. Backend findings below are source-verified, not a
claim that production database function definitions were independently extracted.

## Findings, in priority order

### 1. High: expired sessions leave case details and search accessible

Evidence: `website/portal.js:2339` clears the client session and hides `portalApp`,
but does not close/clear case drawers and dialogs or clear retained work collections.
The case drawer is outside `portalApp` in the HTML. Global keyboard search at
`website/portal.js:2573` is not gated on a live session; `openGlobalSearch` at line
2329 renders retained work.

Reproduction used only the local test server and synthetic fixtures: install a
simulated clock before page startup; open the exact ordinary report; advance 31
minutes. The login form became visible and session storage cleared, but the case
drawer remained `aria-hidden="false"` with case details visible. Close it and press
Ctrl+K: restricted-work references are still shown in search.

Impact: someone returning to an unattended expired portal session can see retained
case information. This does not demonstrate that new protected backend requests
are authorized after expiry. Manual locking also needs the same overlay cleanup.

Required remediation: one session-exit cleanup for manual lock, timeout, and failed
restoration; close all overlays, clear sensitive DOM and in-memory state, gate
shortcuts, and discard late responses from a prior session. Add regression tests
with a case/dialog open at expiry, not just the overview page.

Scope: portal-only code and tests; no member auth/backend change should be needed.

### 2. High for staff rollout: scoped roles cannot complete normal portal loading

Evidence: `website/portal.js:905` requires `commandCenter(50)` before entering the
workspace. `get_admin_command_center_snapshot_v2` delegates through wrappers to
`get_admin_command_center_snapshot`, whose permission gate is `operations.read`
(`supabase/migrations/20260924000000_admin_portal_read_model.sql:253`). The current
permission mapping gives this permission to operations/super-admin/founder, not
standalone moderator, legal_reviewer, or business_reviewer roles
(`supabase/migrations/20260924120000_admin_moderation_workflow.sql:44`).

Impact: assigning a narrow role through Access and roles is not enough for that
staff member to use the normal portal. Granting broader operations access just to
bypass this would undermine least privilege. Current browser fixtures do not model
this database denial and therefore do not catch it.

Required remediation: role-aware landing/read contracts and navigation, plus tests
for each actual role and denied cross-role access. Do not weaken the operations
permission check as a shortcut.

Scope: likely portal and admin database contracts. Requires the separately approved
shared-system impact/regression/rollback review before implementation.

### 3. Medium: monitoring refresh is not a strictly read-only boundary

Evidence: `infra/doji-orchestrator/src/portal-read.ts:387` calls the shared
`fetchOperationalHealth` function. Its protected Edge endpoint invokes
`refresh_daily_event_health_snapshots_v1` on every call
(`supabase/functions/operational-health/index.ts:16`). That RPC writes monitoring
history. Unlike Sentry, this portal path has no dedicated cache/single-flight
wrapper. `refreshLiveData` requests it during whole-workspace refreshes, including
realtime invalidations (`website/portal.js:1021`).

Impact: opening/refreshing the portal can perform monitoring writes and extra
shared backend work instead of only reading a snapshot. This is an isolation/load
gap, NOT proof it caused the reported app outages or changed member content.

Required remediation: keep archival work with the existing monitoring owner;
expose a bounded read-only portal snapshot, with appropriate cache freshness and
coalescing. Avoid adding another recurring job or member-path dependency.

Scope: shared Worker/Edge boundary. Separate approval and member-impact checks
required; do not deploy this as a routine frontend-only fix.

### 4. Medium: active queue search is limited to the first 50 combined items

Evidence: `website/portal.js:905` requests 50 items. The command-center SQL limits
`bounded_work` (`supabase/migrations/20260924000000_admin_portal_read_model.sql:355`).
Active queue filters/search operate on that loaded collection
(`website/portal.js:1112`); only resolved reports and audit have paging cursors.

Impact: with more than 50 combined active items, an operator cannot browse/search
all outstanding work. Counts can describe more work than the loaded rows expose.
This is a scale/visibility defect, not evidence that records were lost.

Required remediation: bounded, authorized, server-filtered active queue pagination;
distinguish total counts from loaded results. Keep the command center a summary.

Scope: portal and admin read contracts; separately reviewed database scope.

## Checks passed

- `npm run test:admin-portal`: authentication-client tests, 28 health-model tests,
  and 21 browser tests passed. Browser backend responses are mocked.
- Two focused Jest suites passed: 20 tests for portal operations contracts and
  hierarchical reporting contracts. Several are source-contract checks, not live
  database authorization tests.
- Existing browser coverage includes MFA gating, normal session lock, role-scoped
  controls, moderation confirmation, audit inspection/export, stale health,
  desktop/tablet/mobile layouts, and serious/critical accessibility checks.
- Public production probes: site HTTP 200 with CSP and frame denial; portal session
  endpoint rejects unauthenticated requests with 401, rejects a disallowed browser
  origin with 403, and returns `private, no-store` on those API responses.
- The deployed portal bundle matches the local audited build.
- Source inspection confirms local-scope portal logout, signature-verified JWT/AAL2
  gateway checks, RPC allowlisting, bounded page inputs, server-held Sentry token,
  server permission checks, and atomic audited admin write contracts.

## Limits and next steps

No real enforcement, user messaging, role changes, or production database writes
were exercised. No authenticated production multi-role tests, database grant audit,
concurrency/load qualification, or complete security penetration test was performed.
Passing fixtures do not replace those checks. Monitoring still lacks direct
account/comment request-success and session-continuity metrics; the UI discloses
these coverage limits rather than claiming app-wide health.

Fix the session-data cleanup first. Then review the three admin backend/read-contract
changes as a separate scope under the standing portal/member-isolation requirement.
Re-run existing tests plus dedicated repro regressions before any deployment.
