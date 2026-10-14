# Admin queue consistency — released

Status: UI released October 9 at 18:16 MDT in admin Pages deployment
`09a9d34e-d99c-4373-a511-2ec92ea10487`. Separately approved history reads and Sentry
timestamp repair were released with their own guards and rollback; see
EMPLOYEE_HISTORY_HEALTH_PREPARATION_2026-10-09.md. No member mutation, email,
announcement publication or real-case command was performed.

## Interaction contract

- Community ideas defaults to pending review. All/accepted/declined use the same
  route, table columns and status control; legacy archive links still open. Record
  return links preserve the status, without sending users to a separate history table.
- Business applications default to open (pending and changes requested). Existing
  employee business page reads supply each individual status, including approved
  and declined. These reads are older-update-first; the date column says Updated,
  not Received. No invented all-status server merge is added.
- History list ownership is not in the existing response. Display Not returned,
  rather than misrepresenting null as Unassigned. Record detail retains the existing
  authorized ownership read. No N+1 ownership requests.
- Safety keeps Open/Closed in one queue, preserving restricted-area authorization.
  Privacy keeps its existing state filters and default Open.
- The separately approved employee history contract now supplies My work
  Open/Completed/All personal assignments and announcement Active/history states.
  Open and Active are defaults. Filtering happens in authorized SQL before page
  limits, rather than filtering a single client page. Legacy inbox reads remain.
- TablePagination retains cursor-aware Previous/Next and unknown totals. Work,
  idea, business, announcement and audit page sizes are 5/10/25. Changing size
  resets the cursor and changes the TanStack key. Fixed privacy batches support
  exact divisors (5/25 for queues, 5/10/30 for histories) without fetching ahead.
  Team cards use 8/16/24. Bounded health arrays use local 5/10/25 paging.
- Empty states use MUI icons/Typography inside the existing fixed-height TableFrame.
  MUI Table has no dedicated empty-state component; DataGrid's overlay does not
  justify replacing the existing table implementation. Error and loading states
  retain their own semantics; empty is never an unavailable data source.
- Removed the routine safety allegation reminder and top-level health instruction
  banners. Permission errors, actual failures, evidence controls, confirmation and
  uncertain-command guards remain unchanged. Monitoring scope is expandable detail.

## Health connection diagnosis

The exact employee runtime downloaded after the announcement release is retained at
`test-results/react-admin-announcements-20261009/edge-on-download/supabase/functions/employee-portal-v2/runtime/employee-health.mjs`.
Its successful Sentry result has available=true but no observed_at. The new portal
requires a valid source timestamp, so even successful results cannot be verified as
current. This is a concrete contract mismatch, not evidence of a member-app outage.
There may also be upstream errors; diagnostics now distinguish missing configuration,
401/403, 429, other provider errors, missing timestamps, invalid responses and expiry.

Do not use generated_at or page-load time to freshen a cached observation. A proposed
employee-service-only fix must timestamp the cache load completion, preserve 60s
Sentry/30s operational caching and authorization-before-cache, verify cache reuse,
expiry, permission denial and rollback, and stay deployment-gated. No service code
or deployed package has been changed here. Health-event enabling remains separate.

## Validation and budgets

Typecheck and all 245 web unit tests pass. Added canonical bounded-path/cursor tests,
business status response/permission tests, fixed-batch round trips, standard MUI
page-size interaction and health-source diagnosis cases. Browser acceptance includes
status and size resets, historical navigation, permission denial, empty-state
accessibility, live-read failure clearing and no-polling freshness expiry.

The connected admin bundle remains below its existing 507 KiB total and 180 KiB
sign-in limits. Allocate 4 KiB within that unchanged total to the new business
history reader, page controls and source diagnostics (core cap 290 -> 294 KiB).
No paid component or new dependency is installed. Prior autofill changes and unrelated held backend
work in this worktree are not implicitly committed or approved by this patch.

Final local checks: typecheck, lint, 245 unit tests, connected build and all connected
artifact guards passed. Bundle: 167.1 KiB gzip sign-in, 506.0 KiB all application JS
including deferred routes (existing external Ably SDK excluded). Clean full browser
run: 146 passed, 2 root-release package-only tests skipped, 2.2 minutes. Evidence:
`web/test-results/queue-consistency-final/`. Earlier broad run had an accessibility
scan during MUI menu exit and one privacy interaction failure; the scan now waits
for actual DOM unmount, and both focused cases passed twice before the clean full
run. No privacy command logic was weakened. Screenshots for empty states and health
source cards were visually inspected. These are offline synthetic tests, not hosted
acceptance or authorization to deploy. The owner has been asked separately about
preparing the timestamp fix and the two remaining employee-read contract gaps.

References: [MUI TablePagination](https://mui.com/material-ui/api/table-pagination/),
[MUI tables](https://mui.com/material-ui/react-table/),
[DataGrid overlays](https://mui.com/x/react-data-grid/overlays/).

Follow-up: the owner approved preparation/testing of both backend gaps. The narrow
Sentry backport and additive history SQL/identity bridge are now prepared and tested
offline, with separate rollback. They are not deployed or wired into these UI routes;
see `EMPLOYEE_HISTORY_HEALTH_PREPARATION_2026-10-09.md`. This does not authorize
production changes or enable the independent health-event feed.
