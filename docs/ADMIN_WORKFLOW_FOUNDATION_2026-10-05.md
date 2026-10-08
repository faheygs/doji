# Admin workflow foundation and release gates

## October 6 unified safety and personal workspace LIVE — 14:45 UTC

Owner approved deployment after the local preparation gate. Final admin Pages
deployment: `07c321f6-0987-45c0-bfa0-a925dd798ea3`; employee-portal-v2: **v15**.
The additive `get_admin_safety_work_page_v1` and its verified employee bridge are
installed, and only `staff_workflow_private.settings.safety_queue_enabled` was
enabled. Existing atomic commands delegate to the preserved old dispatcher.

Command center has review-area shortcuts instead of a duplicate inbox. My work
defaults to the employee's assignments. Each safety area has one merged table,
source labels, ownership filters and open/closed history. Announcements uses the
whole empty table body; Audit log uses the shared centered spinner and busy pager.
No real case, assignment, review outcome or member session was changed for testing.

Live browser acceptance initially exposed stale cached lazy modules and a stale
stylesheet query version. Both were corrected with a content-derived workflow
revision (`f1afa7052e620457`) on the entry bundle, admin CSS and complete workflow
import graph. Normal reload of the existing signed-in browser then verified the
new overview, My work, one table per safety area, mixed-source closed history,
announcements layout and audit loading. No credential extraction or MFA bypass.

Release checks: 92 exact-runtime tests; 43 workflow browser tests plus the
separately executed exact-release table-height/pager test; exact-artifact merged
safety check; three cache-versioning tests; focused audit-spinner regression;
website/tooling TypeScript. Prior local SQL permission/paging/rollback/member-overlap
qualification remains recorded below. These checks are not an all-role live write
test or a new repository-wide coverage measurement.

Selective artifacts and bounded receipts:
`test-results/admin-unified-safety-20261006` (DB/runtime/static release) and
`test-results/admin-unified-safety-cache-20261006-v2` (final versioned static artifact).
Live file hashes, exact downloaded employee runtime, anonymous 401/cross-origin
403, secret digests, other Edge metadata and business/public deployment identities
were checked. Transactional fingerprints preserved existing member/portal/staff
functions (except the explicitly wrapped dispatcher), ACLs, policies, roles and
realm/session settings. No mobile, Worker, notification, release-policy or other
site release was made. Shared infrastructure remains shared.

Full rollback: restore the pre-release admin artifact/deployment
`dd4561be-15f3-4425-88d8-cbab47c974f1`, restore the saved exact employee v14 source
under `admin-unified-safety-20261006/edge-before`, then apply the separately
reviewed `docs/drafts/staff_safety_queue_v1.rollback.sql`. Restore UI/runtime before
the inverse; do not replay release scripts or retry ambiguous writes. Cases,
ownership and audit history are retained. The dashboard's existing incomplete
health-coverage warning is separate and is not claimed repaired by this release.

## October 6 queue consistency LIVE — 13:28 UTC

Admin deployment `dd4561be-15f3-4425-88d8-cbab47c974f1` replaces exactly seven
static assets: admin CSS, the existing app bundle/controller, business applications,
business privacy, workflow workspace and workflow row view. Baseline/rollback is
`1e6f4822-e01f-4d66-9dcd-2100145a2234`. Existing Worker, provider configuration,
identity/session bundle modules and all other asset bytes are preserved. Live
asset hashes and anonymous 401/cross-realm 403 checks passed. Business/public
deployment IDs and employee/backend deployment metadata are unchanged.

Queues now have fixed-height shells, centered loading/empty/error presentation,
scrollable rows and bottom-right Previous/Next controls. Business applications
use the same table pattern. External, business and privacy rows open by click or
keyboard. Previous uses saved server cursors, not guessed offsets or count scans.
Summaries distinguish page counts from global totals and in-app from external
requests. Disconnected sponsorship is shown as unavailable, not a healthy zero.
Privacy support is expandable and explains that it handles verified data access,
corrections and closure separately from application approval.

External removal drawers expose Case outcome shortcuts including Close request.
They prepare the existing `not_actionable` action; rationale, public response,
confirmation, revision checks and permissions remain mandatory. Completed removal
still requires its original evidence checks. Read-only cases explicitly explain
unavailable actions. No real case, ownership, content or deadline was modified.
Existing report/appeal, application and privacy terminal decisions were regression
tested; this is not a new generic close-all command or a backend permission change.

Verification: 173 review/decision/privacy/editorial browser tests, 40 module-boundary
tests, 37 workflow tests, and 8 exact-artifact integration tests passed (integration
tests overlap the workflow suite). TypeScript website/tooling checks, scoped lint,
source-size policy and diff hygiene passed. Exact-artifact screenshots were inspected;
automated geometry verifies matching business/sponsored/external shell heights and
stable footer placement. Synthetic tests cover 0/1/10/loading/error rows, keyboard,
mobile/dark/light drawers, confirmed closure and read-only denial. Browser actions
used mocked accounts/records, not live moderation or real employee acceptance.

Evidence: `test-results/admin-queue-consistency-20261006-v2/`, including immutable
prepared/deployed/verified receipts. The initial deploy call stopped at a read-only
401 preflight; refreshing the existing Wrangler login succeeded without adding
scopes, and only the subsequent deployment performed an upload. No new costs,
mobile build, shared Worker, database/RLS, push, release-policy or authentication
behavior change is included. Do not deploy the dirty worktree as a whole.

## October 6 section navigation repair LIVE — 12:46 UTC

The all-area Review workspace now appears only on Command center and Work queue.
Businesses, Community ideas, Trust & safety and Restricted safety retain their
own domain UI without the duplicate inbox. Ownership management remains on the
combined queue. Navigation away fences pending inbox reads, clears hidden rows
and discards queued refreshes; returning fetches a fresh authorized bounded page.

Live admin deployment: `1e6f4822-e01f-4d66-9dcd-2100145a2234`.
Rollback: `d3ffeecc-ecdb-4276-8d6e-6d5785bc265e` (includes both sign-in repairs).
Only `admin-portal/workflow-workspace.js` differs from that verified baseline.
All other assets, Pages settings and Edge versions are unchanged; business and
public website deployment IDs are unchanged. No SQL, auth, real-case actions or
member changes. Evidence: `test-results/admin-workspace-scope-20261006/`.

Verification: 37 mocked browser regressions passed, plus 7 compiled-artifact
integration checks (root uses the exact candidate; preview uses its fixture).
Website/tooling TypeScript, scoped lint, source-size and whitespace checks pass.
Live module SHA-256 and anonymous/cross-origin session boundaries verified.
Browser case/navigation checks use synthetic fixtures, not live member data.

## October 6 sign-in repair LIVE — 12:33 UTC

Owner reported password clearing after a few seconds and an unusable autofill
field. The existing live tab showed `Workspace locked; server sign-out could not
be confirmed.` Offline reproduction confirmed that expired-session cleanup failure
called `onAccessInvalidated`, whose handler called `clearSession` again. This erased
a newly entered password and could repeatedly request logout. Cleanup failure now
uses a separate, epoch-fenced notification; only an idle locked view shows its
warning. It neither clears fields nor moves focus nor requests another logout.
Local access remains revoked even when server sign-out cannot be confirmed.

A second startup race is also repaired: static HTML no longer exposes an editable
form before its controller and initial session check are ready. It shows a neutral
opening state, then either the verified workspace or usable credential controls.
The fields use stable username/current-password semantics. No credential storage,
MFA bypass, expiry extension or automatic write retry was introduced.

Production admin Pages is `d3ffeecc-ecdb-4276-8d6e-6d5785bc265e`, verified at
`2026-10-06T12:33:39.583Z`. First the four-file readiness repair deployed as
`8523fdc1-2cf6-45a2-b1df-b030361df481`; the final two-file follow-up replaces only
the admin bundle and admin-hosted `portal.js`. Exact bundle comparison limits the
browser transport difference to `clearSession`; other transport/provider/MFA rules,
Pages Worker/headers/configuration, Edge versions and other sites are unchanged.
This is not a backend or shared-member deployment. Business/member builds and
sessions are unaffected by the deployed file scope; shared infrastructure still exists.

Validation: the new startup tests failed on the old implementation; the expired
cleanup test specifically reproduced an empty password instead of the new entry.
After repair, 19 focused browser tests, 23 transport tests, all 11 sign-in scenarios
against the exact final candidate, and 31 workflow browser scenarios passed.
Website/portal/tooling typechecks, scoped lint and source-size guard passed.
Live asset hashes and anonymous 401/cross-origin 403 boundaries passed. The actual
Chrome page transitioned from Opening to Admin sign in and the password field
accepted focus. No real password, MFA code, test account or real-case action was used.
Silent DOM autofill assignment is fixture-tested; the owner's saved-password
manager selection and complete real sign-in are not claimed as live acceptance.

Evidence: `test-results/admin-signin-readiness-20261006/` and
`test-results/admin-signin-cleanup-20261006/`. Rollback the final two-file follow-up
using the exact first directory's `site` artifact (or the whole repair using
`test-results/staff-workflow-release/site-promoted-final`, Pages
`04c55826-80a5-4923-a2fa-33a7d4d4f38b`). No database rollback is needed. Reverting
the follow-up reintroduces the cleanup loop, so use only for a verified regression.

## October 6 promotion LIVE — 04:42 UTC

The main portal at https://admin.dojipro.com/ now runs the unified workflow.
Admin Pages deployment is `04c55826-80a5-4923-a2fa-33a7d4d4f38b`; the old preview
URL redirects to the main homepage. Exact deployed HTML, bundle, CSS and workspace
modules matched their manifest. Anonymous session access returned 401 and foreign
business-origin access returned 403. The owner session restored on the main URL,
showing all six authorized queue families, the existing business application and
external intake, current ownership, one overdue deadline and one unassigned item.
No real-case command was issued. Business/public deployments and all unrelated
endpoint/configuration/secret fingerprints remain unchanged.

Employee endpoint **v14** is deployed and its downloaded source matches the
selective release artifact. Only `employee-resources.mjs` changed from v13.
The workflow-enabled token path uses current employee session authority plus the
fixed staff-channel RPC. A business-only reviewer no longer needs moderation
permission to receive business hints. Legacy moderation/global subscriptions are
granted only when both fresh checks authorize moderation; member issuance and
the 900,000 ms token lifetime remain unchanged. The browser likewise avoids
subscribing a limited reviewer to moderation topics.

The root candidate replaces the old report-only counters with a labelled summary
of the **loaded authorized page**, not invented queue-wide totals. Assessed
deadlines and internal report targets are distinguished, overdue rows are labelled,
and unavailable reads hide the summary. Counts include waiting overdue work.
The existing Pages Worker, headers and provider/session configuration are preserved.
Cutover redirects the retired acceptance preview to the main homepage. Health
decoration no longer shows green for incomplete evidence. The exact final
`site-promoted-final` artifact is live; earlier candidate folders are evidence only.

Current local qualification: 169 workflow/transport assertions, 90 assertions
against the exact employee artifact, and 31 compiled browser scenarios pass.
Portal, website and tooling TypeScript, scoped lint and source-size checks pass.
The repeat isolated database run passed 121 assertions, ten ownership race/rollback
scenarios, member read/report coexistence and the exact retaining-release rollback.
An owner-approved live canary uses one clearly labelled synthetic business
application and one temporary `business_reviewer` WorkOS employee. It uses normal
password/TOTP authentication and same-origin portal requests, not forged claims.
No member account, actual business decision, applicant email or owner-role change
is part of the canary. Its exact identifiers and bounded results are recorded in
ignored `test-results/staff-workflow-release/synthetic-*.json` files; secrets,
passwords, TOTP material and session cookies are never saved there.

Live acceptance passed at 04:41 UTC: normal password/TOTP, business-only grants,
other-queue/assignment denial, one committed claim plus idempotent replay,
exact-case Ably delivery, automatic renewal across the original 15-minute token
expiry, reconnect and delivered release hint. After disabling/revoking the exact
test employee, fresh data/token/session access was denied. The provider user was
deleted; the synthetic application was closed and its disabled account, identity
attribution and two ownership audit entries retained. No member account,
organization, applicant email or real-case decision was created. `passed` and
`cleaned` are true in `synthetic-acceptance.json`; the promotion guard required both.
The run made 17 portal HTTP requests and four token authorizations. Observed
password and MFA requests took 1,428/968 ms; individual portal RPC samples ranged
496–1,422 ms. These small serial samples are not load/capacity or percentile claims.
Other case families use the existing local six-source fixtures and owner read
checks; this canary is not a claim of live destructive testing for every queue.

Immediate promotion rollback artifacts are exact `site-routed` (Pages
`ad01d00e-e153-45c6-9b46-6a91f4e518a8`) and `edge-enabled` (employee v13). The full
workflow rollback below remains available and retains audit/ownership data. Never
re-run the installation/enable scripts against the now-installed objects.

The earlier approved **gated employee preview** ran on October 6 UTC (October 5 MDT)
at https://admin.dojipro.com/identity/employee-preview/ before the promotion above.
At that stage the admin homepage remained unchanged; its preview integrated all
six permission-filtered queues, ownership, existing review surfaces and staff-only
invalidation. The historical record below must not be read as current gating.
The foundation sections below describe the original two-source increment; the
six-source integration and qualification sections describe its evolution. Historical
default-off/not-deployed statements below are superseded by this release record.

## Gated preview release — October 6 UTC

- Admin Pages deployment: `ad01d00e-e153-45c6-9b46-6a91f4e518a8`.
  Only the preview subtree and its obsolete redirect changed. Root HTML/scripts,
  styles and the existing Worker artifact remain byte-identical. Business/public
  site deployment IDs and all Pages configuration hashes are unchanged.
- Employee endpoint: v11 baseline, v12 installed with workflow disabled, v13
  enables the explicit `staffWorkflowEnabled` runtime property. The selected
  adapter/resource/SQL modules and one runtime forwarding property changed;
  deployed authentication, session, provider, proxy, MFA and timing modules remain
  byte-identical. Future endpoint deployment must preserve the intended flag.
- Additive workflow SQL was installed default-off under bounded transaction/lock
  budgets, then enabled only after hosted verification. `enabled`,
  `extended_enabled` and `events_enabled` are now true. Ten staff hint triggers
  share the existing durable outbox; this is shared infrastructure, not physical
  isolation. Existing function/ACL/RLS/role/settings fingerprints were preserved.
- Four indexes were created individually with `CREATE INDEX CONCURRENTLY`,
  checked ready/valid, with existing two-minute statement timeout and fresh
  lock/event-window checks. Source relations were 32–144 KiB, not a load test.
- Secret names and digests were unchanged. Supabase refreshed timestamp metadata
  for its seven reserved keys during deployment; verification permits only that
  timestamp-only difference, not custom-key or value changes.
- The retired `/identity/employee-preview/* / 302` rule initially hid the preview.
  A preview-only routing correction removed it; hosted canonical URLs and hashes
  passed after edge propagation. No duplicate endpoint deployment or write retry.

Qualification: 165 workflow/transport checks, 87 tests against the exact assembled
employee runtime, and the release-shaped isolated database install/index/retaining
rollback checks passed. Previous 29 compiled-browser scenarios remain applicable.
Hosted anonymous requests returned 401; cross-origin requests returned 403.
The existing owner employee session restored, all six authorized queues loaded,
All/Mine/Unassigned filters returned the expected existing records, and business
ownership/eligible-employee reads handed off to the existing business review.
The existing external-intake review handoff also loaded successfully.
No ownership, decision or moderation command was submitted during acceptance.
The realtime connection indicator was observed; actual provider event delivery,
reduced-role live acceptance, token-expiry/revocation and absent-source live review
handoffs are not yet established. Full approval of the redesign is not implied.
The old overview summary cards remain report-scoped, not six-queue totals; they
must not be interpreted as saying an external intake deadline is clear. Aligning
that presentation remains a root-promotion prerequisite. Platform health coverage
was incomplete, including unavailable app-error feed evidence during acceptance;
this preview does not establish the health of those independent providers.
The post-enable bounded health read found no overdue outbox rows in its capped
sample and no nearby Doji window; this does not prove zero incidents or capacity.

Rollback evidence is in ignored `test-results/staff-workflow-release/`: original
admin deployment `a4ee3e2f-80b6-4dc7-b894-9494d6303822`, exact `site-before`, employee
v11 `edge-before`, `install-disabled.sql`, four index statements and
`rollback-retain.sql`. First fence all workflow gates, then restore the original
employee/admin artifacts and revoke only candidate entry points/triggers using the
retaining rollback. Preserve ownership/history/receipts and additive indexes.
No rollback has been executed in production. Original root promotion, real-case
write testing and any permission redesign require their own acceptance/scope.

## Verified problems

- `get_admin_work_queue_page_v1` includes reports, appeals and community ideas,
  but not business applications, external intake or business privacy cases.
- Its suggestion and appeal projections hardcode `Unassigned`; those sources
  have no corresponding assignment command. The existing Claim next command
  claims reports only.
- Business review and privacy are separate modules loaded from Businesses, not
  complete participants in the command center.
- Business reviewers can read applications but decisions still require
  `admin.manage`. Editorial decisions have the same broad permission requirement.
  Giving someone ownership must not silently grant those permissions.

## Local candidate

`docs/drafts/staff_case_ownership_v1.sql` is outside automatic migrations and
disabled by default. It adds private ownership, history and idempotency receipts
for `suggestion` and `business_application`, plus three employee-only RPCs:

- `get_admin_case_ownership_v1` returns source state/version, ownership revision,
  current actor capabilities and the latest 30 ownership history entries.
- `admin_case_ownership_command_v1` atomically claims, releases or explicitly
  assigns one case. It requires both the reviewed source version and ownership
  revision. Changed intent cannot reuse an idempotency key.
- `get_admin_owned_work_page_v1` combines pending business applications and ideas
  using oldest-first keyset pagination, with All, Mine and Unassigned filters.
  It returns at most 50 items, advertises its two-queue scope, and does not invent
  global counts. Business titles come from submitted snapshots, not unsent drafts.

Active operations employees can claim ideas; active operations/business reviewers
can claim business triage. Explicit assignment to another eligible employee
requires `admin.manage`. The owner can release their work; an administrator can
reassign or release it. Claiming never approves a business, publishes a suggestion,
changes a member, sends an email or triggers enforcement.

This is coordination, not an exclusive lock on domain decisions. Existing domain
commands and their authorizers remain authoritative. The UI must distinguish
ownership from decision permission, and the full redesign must address the
overbroad business/editorial decision permission separately before signoff.

The commands lock employee rows and the source in a consistent order, recheck
permissions after waiting, serialize competing claims, and retain actor UUIDs
without coupling them to member Auth/profile deletion. Source deletion makes the
case unavailable; ownership history is retained. No new public/member RLS policy,
Auth change, subscription, scheduled query, event producer or push is included.

## Qualification

### Independent employee API preparation

`docs/drafts/staff_workflow_employee_bridge_v1.sql` adds a separate, fixed-operation
dispatcher, not a replacement for the existing employee dispatcher. It resolves
the independent employee and verified MFA session inside the transaction, clears
stale caller claims, and restores all five claim settings on success or failure.
Only the restricted employee application role can invoke it. The browser cannot
choose a principal, SQL statement, database role or schema.

The fourth operation, `get_admin_case_assignees_v1`, is restricted to managers
authorized for the exact actionable case. It returns eligible active staff IDs
and display labels only, with keyset pagination and a maximum 50-item page.
Eligibility is rechecked by the existing ownership command when assigning; a
directory result is not a permission grant or a guarantee of future eligibility.

The adapter selects one exact parameterized SQL statement for these four routes.
The same-origin browser transport exposes them only with `staffWorkflowEnabled`
explicitly true; no production configuration enables it. Existing CSRF, cookie,
session expiry and logout fencing remain in place. HTTP failures do not retry
ownership commands automatically. Business-realm SQL transport cannot invoke the
employee bridge. No shared Worker route or member API was added.

The request path is now connected to a local, explicitly gated two-source screen.
This is not a production activation or completion of the all-queue redesign.

### Local screen integration

`staffWorkflowEnabled` defaults to false. The admin artifact builder rejects this
flag without independent employee identity, business review and editorial enabled.
The candidate adds business applications and community ideas to Overview, Inbox,
Businesses and Community Ideas through one movable workspace, not four subscriptions.
It uses the shared portal dropdown, filter buttons, modal, themes and review screens.
The page requests 25 oldest-first items with All pending, Assigned to me and
Unassigned filters. Its scope and page count are explicit; it does not claim a
complete command-center total. The legacy inbox and its remaining source ownership
projections still require consolidation before this becomes a unified experience.

The ownership dialog obtains current server capabilities for the exact case.
Claim, release and administrator reassignment require explicit confirmation and
one atomic command with the reviewed source version, ownership revision and retry
key. An uncertain response retains the identical command for deliberate retry;
there is no automatic replay. Denials clear protected details and disable actions.
Conflicts require a fresh read. Open review hands off to the existing business or
editorial screen; ownership never grants decision authority or submits a decision.

Read bursts are coalesced, pages are bounded, and the existing portal view/session/
foreground reconciliation invokes the workspace. Hidden views do not fetch and
elapsed time does not trigger polling. Lock/logout clears rows, assignees and dialog
state; generation and session-epoch checks reject late results. This does not add
an ownership event producer: targeted staff invalidation remains a release gate.

Run `npm run test:staff-workflow:browser` to build a fresh synthetic employee
artifact and run 21 offline browser scenarios. Requests are mocked and external
network is blocked. Tests cover compiled-portal session restore, flag-off behavior,
inbox navigation, original business-review handoff, claim/release/reassignment,
uncertain responses, conflicts, permission loss, lock cleanup, stale results,
keyboard focus, narrow layouts and dark-theme accessibility. The same scenarios
also run with `DOJI_BROWSER_COVERAGE=1`; the shared coverage preparation now builds
this separate artifact without changing the legacy portal fixture's identity mode.
Focused checks do not requalify the complete repository's 90% coverage target.

### Local verification

Run `npm run test:staff-workflow`. It creates a UUID-labelled, network-disabled
local PostgreSQL container with no published ports or host mounts. It replays all
289 migrations and the relevant independent employee identity overlays. Fixtures
are synthetic; no production credentials or remote database URL are accepted.

The completed run passed 54 ownership SQL checks, 26 independent employee bridge
checks, and six transaction scenarios:
competing claims, overlapping identical retries, claimant revocation, assignee
revocation, a concurrent source decision, and transaction rollback. Overlap tests
verify an actual database lock wait rather than relying on sleep timing. Existing
public/Auth/Storage function definitions and grants, RLS policies, member data and
source records remain unchanged. An ordinary member can still read their profile
without employee MFA and cannot access the new staff contracts. This is focused
isolation evidence, not a replacement for full pre-release member regression tests.

The local performance fixture contains 10,002 source rows, half of the bulk rows
already closed. Each filter runs 20 server-side reads with a 25-item page size.
The initial run measured p95 of 1.283 ms for All, 0.668 ms for Mine and 3.260 ms
for Unassigned. A bridge qualification rerun measured 1.337/0.696/3.382 ms,
respectively; these are separate runs, not pooled samples.
These are local PostgreSQL timings, not browser latency or a production capacity
claim. Index selection, production cardinality and competing workload must still
be assessed before deployment. Returned-page bounds alone do not bound rows scanned.

The focused transport suite passes 126 tests across workflow routing, fixed SQL,
CSRF/session handling, failure/no-retry behavior and existing employee HTTP/runtime
boundaries. Portal, website and tooling TypeScript, targeted ESLint and the
source-size guard pass. `npm run test:staff-workflow` runs this transport suite
before the isolated database suite; it is not yet wired into the shared CI job.

## Expanded backend qualification — local only

The owner approved local preparation of all six queues, missing ownership and
staff-only events. This does not approve production deployment. New draft files:
`staff_workflow_extended_v1.sql`, `staff_workflow_events_v1.sql` and the retaining
`staff_workflow_extended_v1.rollback.sql`. Dependencies are the existing foundation,
business privacy and external intake candidates; none is an automatic migration.

The new read combines reports, appeals, suggestions, business applications,
external intake and business privacy into bounded oldest-first keyset pages.
All/Mine/Unassigned and Ready/Waiting are permission-filtered. Only existing assessed
deadlines are used for intake/privacy; report timing is the existing internal
24-hour target, not a statutory promise. No deadline is invented for applications
or appeals. No evidence, requester statements, email addresses or member identities
are returned by this inbox. A failed read fails as a whole, not as a fabricated
empty queue; permission-filtered queues are listed explicitly.

Reports and intake reuse their existing ownership. Appeals and privacy use the new
atomic ownership store. Ordinary original deciders cannot claim their own appeals;
the existing super-admin override remains unchanged, and assignment is never a
decision. Privacy assignment does not create an execution lease or erase data.
Executing privacy cases are waiting work with decision capability disabled.

The employee bridge and default-off `/staff-workflow/inbox` route expose fixed
parameters only. The event-channel allowlist requires current employee MFA and
permissions. Ten disabled triggers cover source/ownership changes plus appeal
decision/account-action dependencies. Queue transitions notify the former audience
without the case ID. Report/appeal deletion uses queue-only hints because dependent
authorization rows may already have cascaded away. Events contain no content.
They use the durable outbox in the source transaction; identical receipt retries
create no duplicate ownership event. The later local integration below connects
signing, subscriptions and UI consumers; no production switches are enabled.

Latest local verification passed:

- 289 real migrations replayed in a disposable, network-disabled PostgreSQL container.
- 54 foundation + 26 bridge + 41 expanded SQL assertions (121 total).
- Ten additional real overlapping-action/rollback scenarios, including competing
  appeal/privacy claims and source changes while an assignment waits on a lock.
- Existing public/Auth/storage function definitions/grants, RLS and selected member/
  domain fixture fingerprints unchanged across the expanded candidate and rollback.
- 132 employee transport tests; portal/tooling TypeScript, targeted ESLint and the
  source-size guard. Earlier compiled-browser qualification remains 21 scenarios;
  those exercise the two-source UI, not an integrated six-source UI.

Expanded read timings with 10,002 synthetic rows: All/Mine/Unassigned p95
3.377/9.912/2.043 ms, each 20 samples and 25-item pages. Bulk data populates only
ideas/business applications; this is not six-queue load qualification, production
latency, or a capacity guarantee. Return bounds do not guarantee scan bounds.
Trigger overhead, indexes, competing member traffic and provider delivery still
need pre-release qualification. Disabled triggers still read a shared settings row.

Rollback checks confirm that expanded routes are disabled, only the ten candidate
triggers are removed, and appeal/privacy ownership history survives. Existing
employee access and source decision functions remain intact. Already committed
outbox hints may deliver after rollback but grant no access or command authority.

## Six-source UI and event integration — local only

The default-off workspace now uses `/staff-workflow/inbox`, not the original
two-source page. It presents all six authorized sources with All/Mine/Unassigned,
queue and Ready/Waiting filters, 25-row keyset pages and explicitly scoped deadlines.
Shared select/button/dialog components and theme tokens are retained. Unknown data
fails closed. Read failure is shown as unavailable, not an empty successful queue.
Unauthorized source options are disabled, and fresh reads remove revoked rows.

Reports/intake open their existing review surfaces and ownership commands; the
other four sources expose the atomic ownership dialog and their original decision
surfaces. Exact case identity/session checks fence review handoffs. This does not
add a generic resolve action or grant approval/erasure permissions by assignment.
The legacy inbox, duplicate priority/queue-health projections and unavailable
combined-unassigned metric are hidden only under the new gate. Separate operational
health/report target metrics remain scoped to their original contracts.

`workflow-events.mts` validates staff channels and actual flattened relay messages,
coalesces 250 ms event bursts, deduplicates 128 IDs, and clears pending work on lock.
It adds no periodic polling. The compiled portal routes staff hints to the workspace
and open-case reconciliation rather than global dashboard reads. Source review
drafts and pending ownership confirmations are not overwritten or auto-submitted.

Employee resource signing adds only fresh database-authorized staff channels when
the separate server flag `staffWorkflowEnabled` is true. It defaults false; the
browser flag and database/event flags must not be enabled independently in release.
No wildcard/member channels are accepted. The existing 15-minute token TTL is
unchanged; fresh read authorization does not mean immediate provider-token revocation.
Real provider revocation/reconnect behavior is still a release qualification gate.
No shared relay changes or live provider calls were made in this integration.

Qualification: 28 offline browser scenarios (including the compiled portal's
subscription-to-inbox path), 163 workflow/transport/resource/contract tests, existing
admin authentication regressions, 160 health/browser-source tests, website/portal/
tooling TypeScript and targeted ESLint passed. Screenshots were inspected in light
and dark layouts; narrow ownership-dialog and axe checks pass. The earlier 121 SQL
assertions and ten overlapping/rollback scenarios remain the backend evidence;
no SQL candidate changed during this UI integration.

## Remaining release acceptance

1. Complete hosted, authorized employee testing across all six real review surfaces
   and roles, including mid-session role changes and provider reconnect/token expiry.
   Offline fixtures do not prove production delivery or every complete review journey.
2. Local six-source/index/trigger qualification is now recorded below. Production
   relation sizes, concurrent-index execution/lock budgets and representative
   competing member load remain unqualified. Run final member regressions against
   the exact hosted release candidate; local timing is not production capacity.
3. Reconcile applicant receipts with the separately gated email outbox; this work
   has not enabled business emails or changed authentication provider screens.
4. The owner has now approved the shared-database/employee-service gated preview
   while preserving the current admin homepage and member authentication, at no
   additional cost. Root-portal promotion and actual moderation/test-case writes
   are not included. No feature/provider gate is live yet.

## Approved preview preparation — October 5 MDT / October 6 UTC

Owner approved the separately scoped gated preview. Read-only live preflight at
2026-10-06 approximately 03:29 UTC confirmed the candidate schema is absent,
employee endpoint version 11 is active, no active/near Doji window, and no overdue
entries in the bounded outbox check. The ten inspected source/dependency relations
are 32–144 KiB each including indexes; row estimates of -1 mean unavailable, not
zero. Index definitions/validity and dependency/member-contract fingerprints were
captured by `scripts/staff-workflow-release-preflight.mts`, which has no apply mode.
This is a baseline, not authorization to bypass deployment drift checks.

Preparation found a real preview-only asset bug: the builder relocated some
single-quoted imports, but compiled imports use double quotes and the employee
realtime import remained root-relative. `website/prefix-admin-imports.mts` now
relocates actual dynamic module specifiers across the complete compiled bundle;
API paths, relative module imports, comments and display strings stay unchanged.
The prefixed browser test deliberately returns 404 for root asset fallbacks and
verifies workspace load, staff event refresh and existing business review. All
29 offline browser scenarios, 165 workflow/transport tests, website/tooling
TypeScript checks passed. No authentication or source-decision behavior changed.

Deployment is blocked on Cloudflare login: API returned 401 and Wrangler confirmed
the existing token expired and could not refresh. A minimal account/user-read +
Pages-write authorization was opened in Chrome, but timed out awaiting owner
authorization. No token was obtained, no production DDL/runtime/static deployment
or gate change occurred, and no costs were incurred. On owner return, finish their
Cloudflare sign-in, start a fresh authorization, then recapture deployment IDs and
preflight. Do not use the expired callback or blindly replay older release scripts.
Current admin homepage/member authentication are unchanged.

## Six-source performance and member coexistence — October 5 MDT

`scripts/test-staff-case-ownership.mts` now seeds 5,000 synthetic source rows per
queue (30,000 total plus dependencies), half open and half closed. Open sources
include both ownership buckets, restricted moderation, waiting applications,
waiting intake and running privacy cases. All fixture transactions roll back in
a network-disabled disposable database with no published ports or host mounts.

Both baseline and indexed phases exercise 63 kind/ownership/state combinations,
20 samples each (1,260 reads per phase). Samples alternate first-page and deeper
keyset reads and assert bounds, ordering, source, state and owner filtering.
Each phase additionally measures 360 real source updates with only the candidate
triggers absent, installed-but-disabled, then enabled. Every sample restores its
row/outbox using a subtransaction rollback; enabled samples must produce exactly
one staff hint and disabled/absent samples none. This is not no-op update timing.

The baseline plan exposed sequential scans/sorts in business applications, intake
and privacy. The additive local index candidate is
`docs/drafts/staff_workflow_queue_indexes_v1.sql`. In this run, combined All/Mine/
Unassigned p95 changed from **8.962/12.387/8.139 ms** to
**2.238/1.675/7.744 ms**. Worst indexed p95 among the 63 combinations was 8.449 ms.
These are small local samples (20/scenario), not production latency promises.
Index-backed combined All plans read six rows from each of those three sources
instead of filtering thousands; Mine likewise used the new indexes. Unassigned
can still scan/join roughly 1,300 qualifying business/privacy rows in this fixture.
Return bounds are not scan bounds, and this does not qualify unlimited growth.

Indexed phase source-update p95 was 0.138–0.495 ms without candidate triggers,
0.163–0.434 ms with disabled triggers, and 0.300–0.606 ms with events enabled.
These timings exclude full command/network/provider latency, commit/fsync and
concurrent production contention. The small sub-millisecond differences are
noisy, not evidence of zero overhead. Plans explain the exact candidate SELECT
with explicit constants, not a guarantee about every cached generic function plan.

A separate overlapping-transaction test proves an ordinary member at AAL1 can
read their profile and complete the existing atomic `submit_policy_report` while
an employee inbox transaction stays open. The member command is rolled back, its
receipt absence checked and the extra synthetic account removed. This is a bounded
lock-coexistence regression, not a sustained load test. The complete run again
passed 121 SQL assertions, ten ownership race/rollback scenarios, member/source
contract preservation and retaining rollback. Tooling TypeScript, targeted lint
and whitespace checks passed. No production data, gates or deployments changed.

Bounded generated evidence (ignored local test output):
`test-results/staff-workflow/qualification-baseline.json` and
`test-results/staff-workflow/qualification-indexed.json`, with candidate/fixture
hashes, scenario timings and reduced plan metadata. The test entrypoint regenerates
both. Older `qualification.json` is superseded by these named before/after records.

## Rollback

### Coordinated release sequence (preview executed; root promotion pending)

1. Capture current database definitions/grants, candidate-object absence or exact
   prior versions, relation sizes/index validity, employee deployment/config hash,
   admin artifact and feature flags. Preserve employee Oregon routing, session keys,
   WorkOS settings, MFA, existing realtime TTL and all unrelated deployments.
   Stop for unexpected drift; old dated release scripts are not reusable blindly.
2. After separately approved shared scope, install the additive database objects
   default-off. Do not replay business/privacy/intake foundations already live.
   Install order for new objects is ownership foundation, extended contracts,
   event triggers, then employee bridge. Confirm exact dependencies before applying.
3. Queue indexes in `docs/drafts/staff_workflow_queue_indexes_v1.sql` are a local
   ordinary-CREATE-INDEX test candidate, **not a production execution script**.
   Production needs a prepared nontransactional `CREATE INDEX CONCURRENTLY`
   procedure with bounded lock/statement budgets, size review, before/after index
   validity checks and explicit handling of an incomplete/invalid index. Never
   automatically retry a failed/uncertain shared write. Existing indexes stay.
4. Release only the employee endpoint with `staffWorkflowEnabled=false`, verify
   existing sign-in/MFA and member-contract regressions, then prepare an owner
   preview artifact. Keep the root portal on its previous artifact until acceptance.
   No shared Worker, member app, mobile release policy or business portal deployment
   belongs in this release. No provider upgrade/new charge is authorized.
5. Enable the database gates and employee workflow flag only for the approved
   acceptance window before exposing the candidate preview. Use authorized reads
   on live records; ownership/decision writes require explicitly designated test
   cases and scope. Do not manufacture real moderation actions to test the UI.
   Validate all six review handoffs, reduced-role denials, refresh/reconnect,
   expired token renewal and lock/logout. An old token may retain subscribe access
   for up to the existing 15-minute TTL; fresh reads must still deny revoked access.
6. Promote the exact accepted admin artifact only after acceptance. Verify one
   authenticated page/read per relevant route and unchanged mobile/session
   contracts. No synthetic production load and no polling added.

Abort/rollback: first fence new commands/event production with the shared gates
(bounded locks; stop if fencing fails), then restore the prior employee flag/bundle
and admin artifact. Apply the retaining rollback scripts below after fencing;
remove only the candidate triggers and entry-point grants. Keep assignment/history/
receipt rows and additive indexes. Already committed hints can arrive later and
must not bypass read authorization. Do not disable employee sign-in or revoke
member sessions. A previously cached candidate UI must show unavailable/reload,
never pretend an empty queue or successful command.

The earlier qualification observed only the old portal. The release record above
documents the subsequent hosted preview reads; it is not full all-role acceptance.

`docs/drafts/staff_case_ownership_v1.rollback.sql` disables the candidate and
revokes its employee entry points while retaining assignments, receipts, history
and the candidate index. It does not drop records or modify existing decisions,
member Auth, releases or source functions. Local rollback verification confirms
that access is disabled and history survives. The candidate is now deployed to the
gated preview; production rollback has not been needed or executed.

`docs/drafts/staff_workflow_employee_bridge_v1.rollback.sql` additionally disables
the shared candidate gate and revokes only the new dispatcher. The original
employee dispatcher remains granted; no existing employee sign-in or moderation
entry point is revoked. Its gate lock waits for in-flight workflow transactions
subject to the bounded lock timeout; release tooling must stop if rollback fails.

## Design references

### October 6 follow-up: initial local navigation and unified safety qualification

Initially owner-approved preparation/testing only. The later separately approved
production release and exact rollback information are recorded at the top.

- Command center: operational overview and review-area shortcuts, not another inbox.
- My work: default/reset to server-filtered assignments; team/unassigned optional.
- Safety areas: one bounded server-merged table for reports, appeals and external
  requests, with source labels and open/closed navigation. Exact record review and
  outcome forms retain existing permission checks and atomic commands.
- Announcements: empty row fills its table body. Audit: centered spinner and busy
  paging controls. Removed redundant explanatory pseudo-content.

Candidate SQL and inverse are `docs/drafts/staff_safety_queue_v1.sql` and
`docs/drafts/staff_safety_queue_v1.rollback.sql`. Both the database
`safety_queue_enabled` and build `DOJI_ADMIN_UNIFIED_SAFETY_ENABLED` gates default
off. There are no member table/RLS/index changes and no new event/polling mechanism.
The bridge retains/delegates the exact prior dispatcher for existing operations.

Offline database qualification: restricted/business/member/anonymous denial,
equal-timestamp mixed-source paging without duplicates/omissions, ownership
filters, closed history, verified employee MFA, additive rollback, member profile
read and atomic report coexistence. 240 local timing samples over 15,000 synthetic
safety rows cover both areas, open/closed, all/mine/unassigned. Evidence lives at
`test-results/staff-workflow/safety-qualification.json`; these timings are not
production capacity/latency evidence. No live case or production setting changed.

Local checks passed: 24 new safety SQL assertions; exact prior employee dispatcher
and grants restored by rollback; the existing 54 ownership / 26 bridge / 41 expanded
assertions and race/member-overlap qualification; 43 workflow browser tests (one
older release-artifact geometry test not run without its explicit artifact);
70 editorial/audit/existing-safety browser tests; 47 adapter/transport/UI-contract
tests; website, employee-portal and tooling TypeScript; scoped lint and diff checks.
The additional exact feature-enabled synthetic artifact at
`website/.business-admin-qa-20261012` passed the integrated single-table/no-hidden-
legacy-read browser check. These are local mocked/offline checks, not hosted
acceptance, a production release or a new repository-wide coverage measurement.

Separately approved release sequence: verify current deployed contracts and save
the exact rollback artifacts; install SQL with its gate off; deploy employee-only
runtime allowlist; qualify bounded authenticated preview reads; enable the scoped
gate and publish the verified admin artifact. Do not ship unrelated dirty-tree
changes. Stop on drift or failed checks. Roll back admin/runtime first, then the
additive SQL inverse; retain all existing case, ownership and audit data.

The live canary exercises the SDK's existing `authCallback` renewal through the
full token lifetime, following [Ably token authentication](https://ably.com/docs/auth/token).
It does not shorten the production TTL or introduce a polling refresh loop.

Server-side permission checks and denial by default follow the
[OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
Transaction coordination follows the
[PostgreSQL locking documentation](https://www.postgresql.org/docs/18/explicit-locking.html).
The remaining UI acceptance includes accessible save/error feedback under
[WCAG status message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

## October 6: fixed safety-case action footer — live

Admin-only deployment `2208e64e-3ad0-4ec4-aa77-350394b574ca` (asset revision
`bb606028072ff901`) places removal-request outcome choices and Review change in
a fixed drawer footer, outside the independently scrolling evidence/form body.
The submit button remains associated with the original form for native validation.
Outcome shortcuts only select an intent and focus the rationale; existing final
confirmation, permission checks, stale revision protection and idempotent commands
remain required. The footer hides for confirmation and returns with the saved draft
on Back. Read-only cases expose no decision buttons; closed cases retain reopening.

27 mocked safety-browser tests and 14 exact-package integration checks pass.
Footer geometry/accessibility passed at desktop, mobile and short viewport sizes
in light/dark themes. Website/tooling TypeScript, scoped ESLint and whitespace
checks pass. Live asset hashes match the package; existing backend contract/role/
policy fingerprints, proxy, authentication and business/public deployments match
the prior release. No live moderation command or new health-feed activation occurred.
Evidence: `test-results/admin-case-footer-20261006/`; visual fixtures:
`test-results/safety-footer-*.png`. Rollback artifact:
`test-results/admin-health-ui-20261006/site` (prior admin deployment
`5f9c93d5-c72f-4693-b22a-dd32257e8ab8`). This is not a new full-repository coverage
measurement or destructive live-case acceptance.

### October 6: simplify case actions — live follow-up

Deployment `5fa1725e-9bb0-4e54-bea7-d8d671284e8c`, asset revision
`69447c9b3c76646d`, supersedes the preceding footer presentation. The duplicate
outcome shortcut buttons are removed. The existing form action selector is the
single choice; the fixed footer contains Cancel and one primary button labelled
for that choice (Assign to me, Start review, Request information, Record removal,
Close request or Reopen request). Confirmation repeats the exact selected action
rather than "Review change" / "Confirm change". Selection itself does not write.
Existing required fields, confirmation, source revisions, permissions, idempotency
and command payloads remain unchanged; no live case was modified in qualification.

34 safety-browser tests and 14 exact-release integration checks pass. All six
action-to-confirmation/payload mappings, Cancel without saving, stale denial,
retry identity, read-only/closed cases and desktop/mobile light/dark footer
geometry were checked. Website/tooling TypeScript, scoped ESLint and diff checks
pass. Live changed-asset hashes match; backend fingerprints, proxy, authentication,
other sites and disabled health events remain unchanged. Release manifests are in
`test-results/admin-case-actions-20261006/`. Exact rollback artifact:
`test-results/admin-case-footer-20261006/site`.

### October 6: one-click case assignment — live follow-up

Deployment `5e708fad-1af4-4fca-a916-427a77029466`, asset revision
`31e1d1de9112cbfa`, makes Assign to me a direct ownership action. An unassigned
open removal request hides decision fields and offers Cancel / Assign to me.
Claim sends the existing atomic, revision-protected command with a factual
internal audit note, `Self-assigned for review.`, and no requester message.
It requires neither user-entered fields nor a second confirmation. After the
successful save and authorized reread, the decision fields/actions are shown.
Assigned cases no longer offer Claim; substantive decisions retain validation
and explicit confirmation. Server permissions and ownership rules are unchanged.

37 safety-browser tests and 14 exact-package integration checks pass, including
empty-form assignment, no decision-draft leakage, pending duplicate-click denial,
explicit retry with the same idempotency key, stale revision denial, and existing
decision/lock/layout behavior. Website/tooling TypeScript, scoped ESLint and diff
checks pass. Live changed-asset hashes match the package; backend fingerprints,
proxy, authentication, other site deployments and disabled health events remain
unchanged. No real case was assigned or moderated during verification.
Evidence: `test-results/admin-case-claim-20261006/`. Exact rollback artifact:
`test-results/admin-case-actions-20261006/site`.

### October 6: display the case assignee — live follow-up

Admin deployment `f665e30a-111e-48b6-a2aa-fa919a083632`, asset revision
`e3db2f4be44af8ad`, adds the missing read-only Assignee field near the top of the
removal-request drawer. It uses the existing authorized case `assigned_to` and
employee session `user_id`: self is "Assigned to you", null is "Unassigned", a
different employee shows their identifier, and missing data is "Unavailable".
No employee-name lookup, new read, assignment write or command behavior is added.
The separately proposed atomic Start review / auto-assignment change is not part
of this release and remains gated on shared-system approval.

41 safety-browser tests and 14 exact-artifact integration checks pass, including
self/other/unassigned/missing ownership, read-only display, post-claim reread,
and existing action, stale, lock and layout regressions. TypeScript, scoped lint
and diff checks pass; the mobile Assignee screenshot was visually inspected.
Live changed-asset hashes match. Backend fingerprints, proxy, authentication,
business/public deployments and disabled health events remain unchanged. No live
case was modified. Evidence: `test-results/admin-case-assignee-20261006/`.
Rollback artifact: `test-results/admin-case-claim-20261006/site`.

### October 6: full-workspace record pages — live

Owner-authorized publication completed October 7 at 03:16 UTC (October 6 MDT):
admin deployment `9f87f318-80a0-4700-9096-b567411c4066`, revision
`44f8a4109ab0852d`. The exact previously tested artifact was reused without rebuilding.
Live changed-asset hashes, backend function/role/policy fingerprints and configuration
checks passed; business/public deployments are unchanged. Bounded HTTP checks passed:
admin root 200, unauthenticated session 401, business root/application 200.
No authenticated live moderation action was performed. Existing rollback remains
`test-results/admin-case-assignee-20261006/site`. Evidence is in
`test-results/admin-record-pages-20261006/verified.json`. The newly prepared iOS
diagnostics are not included. Shared health events and automatic Start review /
assignment remain gated. The preparation history below records the earlier pause.

The owner requested replacing cramped review drawers. The admin-only presenter
now opens reports/appeals, removal requests, editorial records, business reviews,
privacy cases and audit details in the main workspace beside navigation. Back to
queue/browser Back preserves the mounted queue's filters and paging; sidebar
navigation uses existing cleanup and is blocked during pending commands. It does
not create bookmarkable record routes or persist protected content in history.
Long-form actions occupy a reserved footer, not an overlay covering fields.
The Assignee field remains visible from the existing case response. Commands,
required decision fields, confirmations, role checks, source-revision validation,
idempotency, realtime/foreground reconciliation and lock cleanup are unchanged.
The separate Start review / auto-assignment database proposal remains gated.

189 scoped browser checks passed across safety, editorial, business application,
privacy, moderation/appeal/audit, evidence and contextual-help suites. Coverage
includes desktop/mobile light/dark layout/accessibility, form associations,
filtered/paged Back navigation, pending navigation blocking, late responses,
read-only/stale denial and lock cleanup. Website/tooling TypeScript, scoped lint,
four cache-versioning unit tests and diff checks passed. Screenshots of desktop
editorial/business views and mobile appeals were inspected. This is scoped
regression evidence, not a new repository-wide coverage claim or a live decision.

Release package: `test-results/admin-record-pages-20261006/site`, revision
`44f8a4109ab0852d`. Its guard preserves authentication/health/read code (apart from
lazy-module cache query versions), workflow behavior, config, proxy, headers and
unrelated assets. All 14 exact-package integration checks passed (203 browser
checks total). Deployment was stopped by the existing Doji release exclusion
window guard before `deploy-started.json` or any Pages publish command. The
record-page changes were not live at that point. The same tested artifact was
subsequently released through deploy/verify after the guard cleared, as recorded
above; no guard bypass or unrelated rebuild occurred. The prior baseline was the
assignee-field release.
Rollback: `test-results/admin-case-assignee-20261006/site` (admin deployment
`f665e30a-111e-48b6-a2aa-fa919a083632`). No mobile, shared service/database,
business/public deployment, billing or health-event activation is included.
