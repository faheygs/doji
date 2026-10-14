# Admin portal workflow and readiness audit — 2026-09-27

## Verdict and scope

The portal has working administrative foundations, but it is **not complete enough
to call every workflow connected or production-ready**. Important moderation
review defects and unfinished business, legal-intake, and communication workflows
remain. No production decisions, role changes, deployments, migrations, emails,
builds, or submissions were performed for this audit.

Reviewed current local portal source, browser/auth clients, worker route contracts,
SQL migrations and their later wrappers/rewrites, notification handoffs, tests,
and the adjacent business prototype. The checkout already contained extensive
uncommitted work; it was not reset. This is not a penetration test, load test,
legal-compliance certification, or live end-to-end mutation test.

Read-only public HTTP checks returned 200 for the admin and business entry pages.
The deployed admin bundle `admin-app-20260926health1.js` contains the current
`website/portal.js` source verbatim. Bundle SHA-256:
`2935d32558687d65ac92adaaa9b9ad2520eab5e220a790a845952ce2dd8459e9`.
This verifies the frontend comparison, not that all local SQL/Worker versions are
deployed. No authenticated production backend canaries were run this turn.

## Confirmed defects

### 1. High: access denial does not clear an already-open protected workspace

`website/portal.js:938` retrieves capabilities only when `liveSession` is absent.
During realtime reconciliation, a denied required read reaches the catch at
`:1072`, which only changes the connection label. `live-client.js:213` refreshes
401s but does not turn an authorization denial into protected-workspace cleanup.

A local browser probe loaded a case, changed all mocked portal responses to 403,
and delivered an access-change invalidation. The portal showed “reconnecting”
while the case and reporter details remained visible. Existing idle/manual-lock
cleanup tests pass; this is a different exit path.

Impact: an active browser can retain previously authorized sensitive information
after access is revoked. This does **not** demonstrate new unauthorized backend
reads or writes. Fix by distinguishing session-wide revocation from ordinary
item-level denial, revalidating capabilities, and clearing protected state on
confirmed revocation. Add second-session revocation and role-downgrade tests.
Likely portal-only first, provided existing session contracts suffice.

### 2. High: evidence review excludes video and the second photo

`supabase/migrations/20260924150000_hierarchical_member_reporting.sql:260`
projects only `post.photo_url` into the report's media evidence. It does not
return `front_photo_url` or `video_url`. Later access policies authorize these
paths, but authorization is not an evidence manifest.
`website/portal.js:1743` renders one `<img>` and no video player.

A renderer probe supplied explicitly typed video evidence and confirmed it was
handled as an image, not video. That probe used a synthetic image response to
avoid the image-error fallback; it is not a real video playback test.

Impact: a moderator can decide a report without seeing the complete reported
media. Add a bounded, authorized media manifest and matching accessible media
viewers, including second-photo and video cases, expiry/retry behavior, and
unavailable-evidence handling. SQL/Storage changes require separate approval and
member-isolation verification; they must not be hidden in a UI release.

### 3. High: appeal actions lack the original case and full enforcement context

`website/portal.js:2215` loads report details only for non-appeal items. Appeal
details at `:1828` show the appeal statement, policy and severity, but not the
original evidence, rationale, member notice, or full decision history. The local
probe confirmed Uphold was available without a report-case request.

The paginated appeal payload in
`supabase/migrations/20260926000000_admin_portal_isolated_reads.sql:98` also omits
`account_action`, despite frontend gates at `website/portal.js:1968` depending on
it. This can offer actions that subsequently fail server authorization; no
backend bypass was demonstrated.

Add an authorized appeal-detail contract with original decision, effects,
evidence and timeline. Verify restricted-review and independent-review rules
against real database roles, not permissive HTTP fixtures. This involves a
separately approved portal-read/backend scope.

### 4. Medium: enforcement failures disappear outside the confirmation dialog

`website/portal.js:2353` sends command errors to `showToast`, which clears after
3.2 seconds (`:33`). The toast is outside the native modal
(`website/admin-portal/index.html:189–190`), rather than inside its accessible
interaction boundary. The confirmation stays open without a persistent error.

A simulated 503 reproduced this behavior. Add an inline persistent alert within
the confirmation, preserve the operator's input, and distinguish failed command
from successful command followed by failed refresh. Verify safe retry semantics.
This feedback repair can start as portal-only work.

### 5. Medium: community history filters are exposed but unsupported

`website/admin-portal/index.html:158` includes an Accepted filter, but
`website/portal.js:1250` rejects that active-queue filter. The active SQL query
returns only pending ideas, and resolved records use the report archive, not an
idea archive. Read-only community browsing is therefore incomplete as well as
decision-making being unavailable.

Hide unsupported controls until proper bounded history contracts exist, then
test pending/accepted/declined searches and pagination independently.

## Missing operational capabilities (not claims of regression)

### 6. Business and sponsored Doji lifecycle is a prototype

`website/portal.js:168` implements business accounts/campaigns using browser
localStorage. Sign-in at `:409` enters sample mode rather than authenticating.
Live admin businesses return an empty collection at `:1507`; the admin explicitly
labels business verification and sponsorship review “Not connected.”

Needed before real business use: tenant-scoped authentication and membership,
organization verification, versioned submissions, approve/request-changes/reject,
approved scheduling integration, pause/cancel/take-down controls, notification and
audit receipts, and real authorized analytics. Business users must never gain
staff permissions or access another organization's data. Local demo edits are
not durable submissions and must not be represented as such.

### 7. External legal/takedown intake is not a portal workflow

The live restricted-safety page explicitly says external legal requests are not
handled there (`website/admin-portal/index.html:139`). Its queue contains in-app
reports and appeals. The “TAKE IT DOWN request” in demo seed work is not a real
intake implementation. The child-safety website provides an email contact; no
email-to-case ingestion was found in this code path.

Ordinary **reported-content removal is wired**. External legal requests,
request validation, protected intake, ownership/deadlines, correspondence,
evidence preservation and closure are a separate missing workflow. Define the
applicable process and access restrictions before implementation; this audit
does not certify legal compliance or prescribe statutory deadlines.

### 8. Announcements and community decisions remain read-only

The live announcement page cannot publish or schedule; community ideas cannot
be accepted or declined (`website/admin-portal/index.html:157–162`). Action
buttons in the demo branch are not production integrations.

Add preview/validation, explicit approval, scheduling/cancellation where intended,
atomic audited commands and delivery receipts. Do not replace existing member
writes or activation alarms with portal-side orchestration.

### 9. Staff alerts and deadline management are not a complete operational loop

New report email is a direct `pg_net` handoff through
`doji_notify_admin_email` (migration `20260627120000_moderation.sql:99`) and the
updated report trigger (`20260925135000_enrich_admin_report_email.sql`). The
returned HTTP request identifier is not persisted into a portal delivery/retry
record in this path. `send-admin-email/index.ts:385` sends to a single configured
administrator address, not an assignee or role-based roster.

This does not prove existing emails failed. It means the portal lacks a complete
case-alert delivery/retry/escalation view. All reports in the active queue use a
24-hour target (`20260926000000_admin_portal_isolated_reads.sql:67`); appeals have
no deadline field there. Priority styling is not a severity-specific response
policy or acknowledged escalation workflow. Define those policies explicitly,
then use durable, observable delivery with appropriate deduplication. Changes to
report triggers or shared delivery need separate approval.

### 10. Health is delivery/error visibility, not full app-health assurance

The portal now correctly distinguishes missing, stale and denied telemetry;
retains recent Doji delivery incidents; and does not equate missing data to zero
failures. However, `website/admin-portal/health-model.js:46` classifies the bounded
unresolved Sentry query, not feature success rates or crash-free sessions. The
operations page explicitly discloses this at `website/portal.js:1484`.

Still needed for the owner's desired “what failed during this Doji?” view:
bounded event/release/platform correlation, account/feed/comments/write success
and timeout rates, affected-user counts and crash-free measures, plus clear
incident and recovery windows. Historical delivery summaries are not historical
snapshots of every app error. No new polling, telemetry ingestion volume, paid
services, or app instrumentation is authorized by this audit.

## Connection inventory

| Area | Current source connection | Remaining qualification |
| --- | --- | --- |
| Employee registration, email verification, MFA, approval | Dedicated employee flow and staff access contracts | Live email receipt not exercised this audit |
| Portal logout/lock | Local auth logout and protected-state cleanup | Revoked-access path needs repair; shared infrastructure remains |
| Work queue, search, paging, claim, priority | Bounded authorized reads and audited triage command | Unsupported idea history; severity/deadline policy incomplete |
| Report decisions, quarantine, restoration | Existing atomic moderation commands | Full media and appeal-context gaps above |
| Restricted account enforcement | Server-gated command with explicit effects | Test against each real employee role before release |
| Audit log, detail, filtered export | Dedicated paginated/export RPCs | Scope of export is bounded; not a universal external records system |
| Employee roles and operator identity | Employee directory, audit, last-super-admin guard | Actor-directory migration rewrites profile joins; not an unfixed name-mapping issue |
| Member notice/email/push | Existing moderation delivery records and downstream paths | No live send performed; admin case-alert loop is separate |
| Monitoring/Sentry | Read-only bounded portal routes, freshness states | Not complete feature monitoring or live health certification |
| Business/sponsored Dojis | Local prototype; live controls unavailable | End-to-end implementation required |
| External legal requests | No connected portal intake | Separate process and implementation required |
| Announcements/community decisions | Reads only | Production commands unavailable |

## Verification performed

- Auth-client checks passed, including MFA, report operations, single-flight
  refresh, local logout and late-response cleanup.
- Health model: **32 passed**.
- Queue-health boundary tests: **15 passed**.
- Existing browser suite: **49 passed**, including responsive layout,
  accessibility checks, confirmation boundaries and staff enrollment/role UI.
- Eight focused Jest suites: **53 tests passed** (portal isolation/operations,
  queue snapshots, employee token isolation, email templates/registration/signin).
- Four isolated audit probes reproduced the defects described above. These are
  characterization probes, **not passing acceptance tests for the broken behavior**.
  See `website/audit-probes-20260927/probes.spec.mts`.

That is **149 counted regression tests plus the auth-client checks**. Most browser
backend responses are mocked. Generic POST fixtures return success, so passing
UI tests cannot prove real command authorization or production integration.
No real-role SQL test environment, staging end-to-end decisions, production
load test, or device regression test was run in this audit.

## Recommended repair sequence and isolation gates

1. Portal-only: revoked-session cleanup, persistent in-dialog error feedback,
   and remove misleading unsupported controls. Expand the regression suite.
2. Separately approve backend/read-contract work for complete media and appeals.
   Preserve member RLS/RPCs, test cross-role denial and employee/member isolation,
   stage migration rollback and deploy independently of the frontend.
3. Define legal intake and business workflow requirements; implement one complete
   vertical workflow at a time, including permissions, commands, receipts and
   audit. “Take down” must identify the exact item and consequences.
4. Finish announcement/community controls, staff alert escalation and feature
   health coverage with bounded load and cost review.
5. Perform controlled end-to-end staging tests, including adverse paths, then a
   scoped release and owner acceptance. Never infer member safety solely from
   portal tests. No app/backend deployment is approved by this audit report.

## Local test-artifact incident

An additional probe configuration initially used Playwright's default output
directory, which cleaned repository-root `test-results` before running. The run
was stopped. Earlier local screenshots, packaging/verification artifacts and
launch markers in that directory were removed; the complete inventory is not
recoverable from the available listing. Source and production were unaffected.
The exact Android 20 AAB was re-downloaded from its existing EAS artifact and
verified against the recorded SHA-256. Some other historical artifacts remain
unrecovered. Existing release IDs and written release records remain authoritative;
do not infer that a build/submission has not occurred from missing launch markers.

Audit probes were relocated to `website/audit-probes-20260927` with an explicit
isolated `runner-output` directory. Subsequent runs completed normally.
