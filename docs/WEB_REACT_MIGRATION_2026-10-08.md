# React web migration

## October 9: root promotion approved

Owner declined the synthetic live announcement draft test; no real announcement is
authorized by this release. Owner approved committing/merging the migration and
promoting the qualified connected admin at the main URL. The root-only candidate
changes index.html and its no-store headers, preserving the worker/runtime, all
other assets and other sites. Ten intercepted exact-package browser checks passed.
Evidence: test-results/react-admin-root-20261009. Deployment remains subject to final
guards and protected-main checks; older milestone gates below reflect their dates.

## October 9: announcement acceptance deployed (20:20 UTC)

After explicit separate backend approval, the two employee-only SQL functions, scoped
runtime v17 and qualified React package are deployed at /connected. Main admin entry,
business/site deployments, credentials and other functions are unchanged. The runtime
was narrowly backported onto live v15, not replaced by the broader local candidate.
Exact-package browser tests: 135 gate-off + 5 gate-on; emitted-runtime security: 80.
Hosted restore/realtime/list/new-form read-only checks passed. No announcement was
created, scheduled, published or cancelled. Draft-only live acceptance requires the
pending owner response; root promotion and release commit/merge remain outstanding.
Evidence and rollback: docs/ADMIN_ANNOUNCEMENT_CONNECTED_2026-10-09.md.

## October 9: connected announcement writes prepared (local only)

The remaining editor transport, new/edit routes, audited cancellation, exact-retry
session flow and separate employee-only bridge are now prepared and tested locally.
This supersedes the earlier no-transport milestone below, not its deployment gate.
Both client and server activation flags default false; production is unchanged.
See docs/ADMIN_ANNOUNCEMENT_CONNECTED_2026-10-09.md for contracts, evidence,
member-isolation boundaries and the still-gated release/rollback sequence.

## October 9: announcement editor parity preparation (local only)

The approved Home/Team/queue/record design is hosted at the authenticated
`https://admin.dojipro.com/connected` acceptance entry. The default legacy portal
has not been replaced. Earlier "not live" entries below describe their original
milestones, not the current acceptance-entry deployment.

The local React announcement editor now covers title/message, UTC scheduling,
allowed CTA destinations, optional qualifying-idea rewards, display limits,
spacing and priority. Standard Material UI controls and the existing date picker
are reused. Dates explicitly use UTC, including when the browser is in a daylight
saving timezone. Publish-now payload preparation leaves start time to the server.

Pure command preparation creates a complete immutable draft/publish/schedule
intent with an idempotency key and exact record version. Draft hydration rejects
incomplete, unauthorized, non-draft or legacy records rather than defaulting away
saved reward/display settings. The review dialog distinguishes saving a draft
from publication eligibility; neither a preview nor publication implies delivery.

This remains a preview adapter: no command transport, connected draft edit route,
database deployment or announcement sending was added. Final write buttons remain
disabled. The separately prepared atomic compose command remains undeployed.
No auth, realtime, member eligibility, economy, push or provider contract changed.

Validation: 221 unit tests across 39 files; four targeted browser checks including
complete editor, UTC/DST values, keyboard/accessibility confirmation, no outgoing
writes, invalid-field preservation, existing admin preview and business preview.
Typecheck, lint, source-size checks, preview/connected builds and artifact guards
passed. Preview JavaScript totals 403.0 KiB gzip (unchanged 410 KiB total cap);
the non-chart allocation is 315 KiB, up 1 KiB for the deferred complete editor.
Connected output remains 452.3 KiB; its sign-in entry is 166.0 KiB.

Remaining before announcement write parity and default-portal cutover:

- Wire and test the employee-only atomic compose gateway contract separately.
- Connect authorized draft hydration and confirmation to the existing command
  lifecycle, including uncertain-response retries and session fencing.
- Migrate cancellation through the existing audited command and required reason.
- Run shared-command permission, idempotency, rollback and member regression
  checks; retain the separate production approval gate.
- Qualify the exact release package and hosted workflows before root cutover.

The public website and business portal migration are still separate release scopes.

## Status and scope

Owner requested React across the admin portal, business portal and public website on
October 8, 2026, with Next.js for public SEO, Vite for portals, Material UI, TanStack and
realtime connections. This record separates the local foundation from production parity.

**Migration in progress; not live.** The owner authorized connecting and releasing the
replacement portals and site after approving the designs. Production cutover is not yet
qualified: the connected employee candidate covers authentication, queue reads and business
application detail, ownership controls, review decisions, bounded Operations reads,
external-request inspection and atomic report linking, report/appeal commands, open/closed safety navigation, Community
Ideas detail/review/history, employee
access management, bounded privacy reads, verified request creation, draft correction and existing ownership/outcome commands, and bounded audit
browsing/detail/export, not complete workflows.
Existing `website/` production artifacts and
authentication transports remain authoritative. The separately approved moderation replay
repair is live; it is not a React cutover. No billing change, mobile release or provider
setting change is included. Shared-system changes retain their separate approval gates.

The primary checkout contains unrelated pending work. Migration work is isolated on
`codex/web-react-migration` in the attached clean worktree, based on main
`72b8b71cf0cabda9ff813da1e141d42aa3aaa760`.

## Architecture decision

### Platform wide UI exploration

The owner redirected the migration toward the whole platform, with individual workflow
redesigns deferred. The atomic announcement candidate is parked and undeployed; it is
not a prerequisite for building the shared React structure.

The current design preview covers all 12 admin navigation destinations. Overview,
My work, review queues, business review and platform management have separate places.
Synthetic records demonstrate shared search, paging and full-page detail layouts.
They do not represent real work or authorized employee access. Platform health offers
explicitly synthetic design scenarios; actual status stays unknown until verified reads
are connected. Sponsorship and billing stay disabled.

Both portals now reuse `WorkspaceShell`, navigation selection, responsive mobile menus,
page headers, table states, pagination, cards and record sections. The business website
remains a public front door; its clearly marked workspace exploration is under
`/preview/workspace`, not an application redirect or a bypass around authentication.
The public and business homepages reuse a Material UI card-based hero.
No image service, new dependency, external font, socket, polling or provider change was
introduced by this design pass.

Navigation uses the responsive patterns documented by
[Material UI](https://mui.com/material-ui/react-drawer/). The preview's labels and sample
data are not a new production permission or data contract. Before cutover, navigation
must be filtered using existing server capabilities, real queues must use authorized
server pagination, and no preview records or controls may remain in production.

This is a UI exploration alongside the migration, not completed page/flow parity.
Authentication/session, data and realtime adapters, remaining public routes, and
per-surface production qualification still need implementation. Preserve existing
workflows during that work; revisit their product behavior separately.

### Stack

| Surface              | Target                                                  | Reason and boundary                                                                       |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| dojipro.com          | Next.js App Router with static export initially         | Searchable HTML and route metadata without requiring a new runtime service                |
| admin.dojipro.com    | Vite React SPA with React Router                        | Independent employee application behind existing same-origin WorkOS gateway               |
| business.dojipro.com | Vite React SPA with React Router                        | Public business homepage and independent business onboarding/workspace                    |
| Shared web UI        | MUI and Emotion, TypeScript                             | One accessible component/theme vocabulary; business and employee data stay separate       |
| Server state         | TanStack Query per authenticated portal session         | Authorized reads, stable query keys, targeted invalidation; no persistent sensitive cache |
| Realtime             | Existing Ably infrastructure                            | Identifier-only invalidation hints; no Socket.IO or duplicate provider connection         |
| Forms                | React Hook Form, Zod, MUI X community date/time pickers | Labels, errors, keyboard/calendar input and explicit timezone                             |
| Verification         | Vitest, Testing Library, Playwright                     | Unit, interaction, lifecycle, responsive and browser checks                               |

All installed versions are pinned by `web/package-lock.json`. The separate npm workspace
prevents web dependency upgrades from changing the Expo dependency graph. React/MUI
components are web-only, not replacements for React Native components.

The Next.js site initially uses `output: export`. Dynamic public intake cannot be replaced
with a static page: existing safety intake/receipt behavior needs a separately ported
client and preserved server routing. If server rendering or Next server actions are
later necessary, qualify Cloudflare OpenNext compatibility, capacity, deployment and
rollback separately. Do not enable a new paid hosting plan.

Business marketing SEO is a separate consideration: its Vite homepage is currently a
client-rendered preview. Before cutover, decide whether its public content should be
prerendered or served from a Next-managed public surface. Do not compromise protected
portal routing to solve marketing SEO.

## What exists in this change

- Strict independently locked web workspace and three application entry points.
- Shared default light/dark MUI theme and native component focus states.
- Shared fixed-height table frame with centered loading/empty/error states and stationary footer.
- Admin announcement design preview using calendar/time pickers, explicit timezone,
  inline message preview and bottom actions.
- React business landing page that does not redirect visitors into an application.
- Statically rendered Next.js homepage with canonical metadata and preview noindex protection.
- Memory-only TanStack Query utilities isolating realm, identity, session epoch and read area.
- Unit and browser regression checks for this slice.

These are not full migrated applications. The default business access preview accepts no
credentials and default admin Save draft/Publish/Schedule remain disabled. A separate
employee integration entry is described below; the design preview never uses it as a
fallback. Local tests use intercepted responses and a simulated socket, not production
accounts or records. Remaining areas must not be labelled connected or healthy merely
because a React screen renders.

## Security and data invariants

1. Member authentication remains Supabase Auth. WorkOS is only for independent employee
   and business identities. No portal sign-out/lock may revoke member sessions.
2. Preserve existing same-origin cookie, CSRF, redirect, idle timeout, maximum session age,
   MFA and capability checks. Keep secrets/tokens out of React state persistence, local
   storage, URLs, logs, build variables and static artifacts.
3. Use one QueryClient per authenticated identity/session epoch. On logout, expiry or
   identity switch: stop subscriptions, invalidate the transport epoch, cancel reads,
   clear read/mutation caches and unmount protected screens. Clear query caches alone
   does not stop an already dispatched command; the transport remains responsible for
   lifecycle serialization and stale completion rejection.
4. A session restore gate must render a stable loading state, not editable sign-in fields.
   Never replace focused password fields because of an unrelated async readiness update.
5. Server capabilities remain authoritative. Do not infer permission from visible buttons,
   an event topic, a client-side role label or a record already in cache.
6. Preserve atomic/idempotent server commands, expected versions and audited outcomes.
   A framework change must not split one command into multiple client writes or invent
   successful completion while the server outcome is unknown.
7. Realtime messages carry identifiers, never authoritative rows or sensitive evidence.
   Validate with the existing topic/payload/permission logic before invalidating queries.
8. Foreground/reconnect reconciliation must recheck the authenticated epoch, active
   capabilities and bounded affected reads. Coalesce event bursts and preserve a trailing
   refresh when events arrive during a read. No recurring portal polling.
9. Keep audience, visibility, safety restriction, signed-evidence expiry and public
   safe-profile contracts unchanged. Never move restricted safety rows into an unrestricted
   client cache to simplify filtering.
10. Shared-system changes require their own member-impact review, tests, explicit approval,
    deployment plan and rollback. This frontend migration grants no new shared-system scope.

The new query utilities intentionally disable automatic focus/reconnect refetch until
the authorized lifecycle adapter is installed. Production cutover is blocked until
explicit foreground/reconnect reconciliation is implemented and verified.

## Adapter inventory

| Existing source                                                  | React integration requirement                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `infra/portal-identity-candidate/employee-browser-transport.mts` | Wrap the existing guarded employee transport; preserve serialized reads/commands, epoch and CSRF behavior         |
| `infra/portal-identity-candidate/employee-pages-worker.mts`      | Preserve existing same-origin routing/proxy; no Worker behavior changes bundled into frontend cutover             |
| `website/admin-portal/live-client.mts` and contracts             | Typed adapters for capability-gated reads and existing commands; validate results before cache insertion          |
| `website/admin-portal/workflow-events.mts`                       | Reuse allowed staff topics, event validation, dedupe and coalescing; invalidate active authorized reads           |
| `website/admin-portal/editorial.mts` and editorial contracts     | Preserve draft, publish, cancellation, expected-version and idempotency semantics                                 |
| `website/build-business-identity.mts`                            | Preserve the public root, access/application handoff, legal versions and explicit public configuration projection |
| `infra/portal-identity-candidate/business-pages-worker.mts`      | Preserve independent business identity, admission, MFA, cookies and application commands                          |
| `website/business-portal/business-realtime.mts`                  | Remains disabled unless separately approved; adapter must preserve exact applicant scope and session cleanup      |
| Existing health feed                                             | Preserve deployed feature gates; do not enable Ably usage or monitoring collectors through this migration         |

Do not directly import a module with deployment-side effects into browser bundles. Extract
pure types/adapters only after their dependency graph is reviewed. Do not weaken an
origin check to make local previews talk to production.

## Route and workflow parity checklist

| Surface  | Routes or area                                                     | Acceptance needed before replacing legacy                                                                             |
| -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Public   | `/`                                                                | Approved copy/design, HTML without JavaScript, metadata, canonical, responsive layout, performance budget             |
| Public   | `/business/`, `/support/`                                          | Existing destinations/contact details and redirects retained                                                          |
| Public   | `/privacy/`, `/terms/`, `/community-guidelines/`, `/child-safety/` | Exact policy content/version, anchors, canonical URLs, crawlable HTML                                                 |
| Public   | `/delete-account/`, `/delete-data/`                                | Accurate member instructions and existing request links                                                               |
| Public   | `/safety-removal/`                                                 | Intake, validation, anti-abuse controls, receipt lookup and privacy boundary preserved                                |
| Public   | `/employee-setup/`                                                 | Explicit legacy transition/redirect, not silently dropped                                                             |
| Public   | robots, sitemap, assets, redirects, headers                        | Complete route inventory, no preview noindex on approved release, security-header parity                              |
| Admin    | Sign-in, MFA, recovery, lock/logout                                | Stable restore gate, autofill/focus, cookie/CSRF/epoch and permission regressions                                     |
| Admin    | Command center and My work                                         | Distinct overview vs employee-assigned queue; consistent paging and truthful totals                                   |
| Admin    | Trust and restricted safety                                        | Unified triage where already authorized, source labels, restricted permissions, all existing audited outcomes         |
| Admin    | Community ideas                                                    | Assignment, review, poll-option normalization and existing approval commands                                          |
| Admin    | Announcements                                                      | Simple compose/preview/timing, exact state transitions, server conflicts, cancellation and member eligibility clarity |
| Admin    | Business applications and privacy                                  | Existing review commands, receipts and permission boundaries; no fake email-delivery state                            |
| Admin    | Sponsored Dojis                                                    | Preserve unavailable/disabled capabilities, not zero-data or enabled campaign claims                                  |
| Admin    | Operations, audit, access/roles                                    | Existing health coverage/freshness, audit paging, employee management permissions and confirmations                   |
| Business | `/`                                                                | Public marketing homepage with sign-in/register actions, no automatic application redirect                            |
| Business | `/business-portal/access/`                                         | Existing registration/sign-in/recovery/verification, terms, privacy, Turnstile and admission gates                    |
| Business | `/business-portal/application/`                                    | Draft, validation, submission receipt, pending, changes requested, approved/declined and stable return sessions       |
| Business | Workspace                                                          | Approved identity + MFA, safe empty/error states, billing and campaign publishing gates retained                      |
| Business | `/business-terms/`, `/business-privacy/`, `/auth/*`, `/api/*`      | Legal/version and proxy route parity; never send API requests through SPA fallback                                    |

All admin details should be full-page routes, not cramped drawers. Row activation must
work with pointer and keyboard without swallowing links/buttons inside a row. Shared
table frames do not by themselves solve server cursor pagination: cursor navigation,
sort/filter resets, exact next-page availability and unknown totals need adapter tests.

## Announcement contract gap

The current implementation saves drafts and publishes them through **separate** commands
and requires a reason. Setting a draft's dates does not publish it. Publishing enables
eligible in-app claims during the time window; it does not send a push notification,
force a popup immediately, or guarantee every member has seen it.

The new design removes the routine rationale field, but no production contract has been
changed. The owner approved preparation and local testing of an employee-only atomic
command on October 8; deployment remains gated. Do not auto-chain draft creation
and publication, fabricate an owner rationale, silently drop required data or claim a
draft is scheduled. Overlap checks, expected versions, idempotency, reward/campaign terms
and authoritative UTC timestamps must remain enforced by the server.

The first design slice intentionally covers title/message/timing only. CTA destinations,
rewards, display limits, priority, existing-announcement editing and cancellation require
parity before it replaces production. Validate daylight-saving gaps/ambiguity, local
timezone changes, server time, maximum lengths and double submission in that phase.

### Atomic announcement command candidate

`docs/drafts/employee_announcement_compose_v1.sql` prepares
`admin_announcement_compose_v1(p_action, p_id, p_version, p_input, p_request_id)`.
It is deliberately outside the deployment migration directory. No existing function,
member grant, gateway route, employee bridge allowlist or live frontend is replaced.

- `save_draft` creates or updates a disabled draft.
- `publish` saves and publishes in one database transaction. Its start is the server
  transaction timestamp, matching existing member eligibility. A supplied scheduled
  start is rejected, not silently overridden.
- `schedule` saves and publishes a future window in one transaction. A future draft
  without publication is still only a draft.

New records have null ID/version; edits require the existing ID and exact MD5 version.
The complete existing content, CTA, reward, priority and impression-limit payload is
validated by the existing editorial command. The wrapper never supplies defaults that
would silently remove reward terms. Published records remain immutable; the existing
audited cancellation command is unchanged.

The caller generates one UUID for an explicit submission and retains it with the exact
payload through an unknown outcome. Retry does not create another record. Changed input
requires a new request ID after the previous outcome is reconciled; automatic write
retries remain disabled. A response contains `command` (the committed action) and
`item` (the currently authorized record, or null if unavailable). A later cancellation
must not be displayed as live just because the original command was publish.

The wrapper reuses existing atomic commands inside the database, not separate browser
requests. Publication failure rolls back draft edits, audit entries and receipts.
Existing audit entries retain the actor and action, with explicitly labelled
“System action summary” text instead of a fabricated user rationale. A published
transaction has a linked create/save and publish audit pair. Request keys link them;
the additional receipt contains identifiers/outcome, not another copy of the message.

Every call, including replay, rechecks employee AAL2 and write permissions while holding
the existing employee lock. Members, anonymous callers and service-role callers receive
no execute grant. The independent WorkOS gateway is not wired to this candidate yet.
No member login, push, scheduler, realtime channel, campaign eligibility or reward
implementation changes are included.

Local qualification command:

```text
node scripts/test-announcement-compose.mts
```

It starts a randomly named, network-disabled disposable database using already cached
images; it accepts no remote target. The runner replays the migration history, compares
all existing public/auth function definitions, ownership and grants, tests the candidate,
and removes only its owned test container.

The rollback file checks the candidate body fingerprint before dropping only the new
function. It preserves announcement data, audit history and idempotency receipts. Before
any future rollback, disable the new frontend/gateway route and restore the prior UI;
do not delete receipts or reverse already committed publications.

**Still gated:** independent employee bridge/route preparation and tests, authenticated
React integration, full form parity, current-production schema/permission preflight,
member regression qualification against that release baseline, explicit deployment
approval and a reviewed rollout/rollback record. Passing the local command tests does
not mean the React migration or a production release is complete.

## Migration sequence and release gates

1. Foundation: independent packages, shared components, tests and this contract inventory.
2. Employee session/data/realtime adapters: preserve old contracts; test denied and stale
   sessions before connecting any screen.
3. Admin area-by-area parity across the approved workspace, preserving existing commands.
   Announcement redesign and its atomic candidate remain separate; they are not the focus
   or prerequisite for the whole-platform migration. Use synthetic fixtures only.
4. Business auth/onboarding/workspace parity, without enabling gated services.
5. Remaining public routes, legal content, intake and SEO/performance parity.
6. Per-surface production qualification and an explicitly approved cutover. Each domain
   must be independently reversible. Remove legacy source only after rollback retention
   and acceptance; do not delete current deployable artifacts during preparation.

For every surface require:

- Strict TypeScript, lint, unit/interaction tests, responsive keyboard/accessibility checks.
- Permission-denied, expired-session, offline/error, empty/loading and conflict behavior.
- Auth/session/realtime lifecycle and reconnect tests against controlled fixtures.
- Build output inspection for secrets, production API writes, unsupported routes and CSP.
- Dependency audit and compatible licensing; no Pro/Premium component dependency.
- Baseline vs candidate bundle, route loading and interaction measurements.
- Direct deep links, refresh, unknown paths and non-SPA API route handling.
- Existing mobile/identity regression gates unchanged.

Production auth checks may require owner sign-in. Synthetic writes or employee identities
need explicitly bounded approval; never use real moderation or announcement records for
migration tests.

## Deployment and rollback

No deployment command is provided for these previews. The existing public/admin/business
builds remain the deployment path until qualification is complete.

Before each eventual cutover record its current immutable Pages deployment, artifact hash,
public configuration, routing and headers. Deploy only that frontend with the existing
proxy behavior preserved. Verify read-only routes/session behavior first. If the smoke
checks fail, restore the previous immutable frontend deployment and configuration; do not
roll back a shared database or mobile release as part of a portal rollback.

Next export goes to `web/apps/site/out`; Vite output goes to each app's `dist`.
These outputs are ignored by Git. None are included in EAS's mobile-only upload allowlist.

## Verification record

Execution results are recorded below after tests are run. This section is not a claim
that production parity or deployment gates have passed.

Local verification on October 8:

- Web strict TypeScript and source lint passed.
- 12 unit/interaction/boundary tests passed, including session-key separation,
  cancellation/cache cleanup, announcement validation and mobile upload exclusion.
- All three local production-mode builds passed. Next.js emitted static homepage HTML.
- 3 Playwright browser tests passed: desktop/mobile admin layout and stable table height,
  business root/access isolation, and public rendering without JavaScript/hydration.
- Automated WCAG A/AA checks reported no violations on the three tested preview views.
  This is not a full accessibility certification or authenticated workflow test.
- Desktop/mobile screenshots were inspected locally; no sensitive data was used.
- HTML/canonical/noindex checks and preview JavaScript budgets passed. Current total
  gzip JavaScript is 270.3 KiB for admin (including lazy form) and 133.1 KiB for business.
  Budgets are 300/180 KiB respectively. Vite still reports its default 500 kB uncompressed
  chunk warning for the admin entry; further route/vendor optimization and comparison to
  production remain cutover gates. This is not an optimal-performance claim.
- The newly locked web dependency audit reported zero known vulnerabilities at install.
- Existing repository TypeScript, lint, source-size and documentation/hygiene gates passed.
  The full member Jest suite and existing portal browser suites were not rerun for this
  disconnected frontend foundation; no member runtime or legacy portal source changed.
- A dedicated web quality job is prepared in the existing workflow. It has not run on
  GitHub because this migration branch has not been pushed.

Still outstanding: authenticated React adapters, full route/workflow parity, production
CSP/hosting qualification, complete lifecycle/permission/performance tests, and approved
per-surface cutovers. No live site or mobile app has been migrated by this change.

Atomic command local verification on October 8:

- Replayed all 289 migrations into an offline disposable database.
- Existing public/auth function bodies, ownership and grants matched the baseline.
- Draft/create/edit, immediate publication and future scheduling passed.
- Exact retry, changed-payload rejection, stale version rejection, permissions after
  revocation, inactive employee and missing MFA checks passed.
- Invalid content, CTA, limits, reward configuration, dates and overlap were rejected.
  Failed publication preserved the original draft/version and left no partial audit or
  receipt. Existing reward fields could not be silently dropped.
- Replay after cancellation returned the committed original command alongside the current
  cancelled record without republishing. Prepopulated internal request keys were rejected.
- Member claim, impression cap, dismissal, cross-member isolation and exclusion of
  draft/scheduled/cancelled records passed. No employee member profile or Doji was created.
- Two genuinely contending database connections published the same request exactly once.
  A simultaneous stale draft edit failed without overwriting the successful edit.
- Fingerprint-guarded rollback removed only the candidate function and preserved
  announcements, lifecycle state, audit entries and command receipts.
- Tooling TypeScript, targeted lint, source-size, hygiene and diff-format checks passed.
  Owned test containers were removed. No hosted endpoint was queried and no gateway,
  provider, production database or site was changed.

The current tests exercise the command through the existing employee database role.
Independent WorkOS bridge/session integration and full mobile regression qualification
remain release gates, not completed tests.

## Platform UI verification

Platform-wide UI verification on October 8:

- All 12 admin navigation destinations have a full-page preview route and exactly one
  selected navigation item. Overview is not a second queue.
- Seven local browser tests passed, including personal-queue filtering, mouse/keyboard
  record opening, pagination placement across sample page sizes, audit loading,
  direct route reload, mobile navigation, search page reset and public-root separation.
- Automated accessibility checks on tested views passed after fixing navigation
  semantics and active-link contrast. Desktop and mobile screenshots were inspected.
- The 12 existing unit/interaction tests, strict TypeScript, lint, all three builds,
  HTML/metadata/indexing checks and repository size/hygiene guards passed.
- Total built JavaScript including lazy chunks: admin 282.5 KiB gzip, business 148.7 KiB,
  within the unchanged 300/180 KiB preview budgets. This is not production performance
  qualification; authenticated routes and data workloads are still pending.
- Previews run only on loopback: admin port 4310, business 4311, public website 4312.
  The browser tests own their temporary servers; stop owner-review preview servers
  before rerunning `npm --prefix web run test:browser` (strict port ownership).
- No production source, auth transport, shared database, Worker, member app, dependency
  lock, release policy or provider settings changed during this UI pass.

## Material UI interaction standards

Use standard Material UI components and interaction behavior across the migration.
The owner's latest direction permits restrained Doji branding and supersedes the earlier
literal default-styles rule. A shared theme owns orange/violet colors, warm light and
charcoal dark surfaces, typography and an eight-pixel control radius. One contained-primary
button variant uses deep orange with accessible white labels in both modes, preserving
MUI disabled, focus and loading behavior. Tables, menus, dialogs and inputs retain MUI
structure and behavior. The standard verification-code TextField remains approved.
Marketing layouts reuse the existing Doji icon, stronger editorial headings and a static,
explicitly illustrative hero card; they do not simulate live member data or a running timer.
Production connection and workflow parity remain separate release gates.

Branding qualification: 118 unit tests and 67 browser tests pass, including mobile
overflow, accessible contrast, keyboard controls and existing authorization/command
regressions against synthetic intercepted data. Desktop/mobile marketing screenshots and
the admin overview were visually inspected. TypeScript, lint, source-size/hygiene, three
preview builds and the connected artifact checks pass. Connected JavaScript is 331.2 KiB
gzip (170.9 KiB sign-in entry); preview totals are 385.7 KiB admin and 149.0 KiB business.
No dependencies, provider settings, authentication contracts or production artifacts changed.

Operations now uses the free MUI X Community LineChart instead of a hand-drawn SVG.
The remaining page-specific font weights and custom issue-panel shape have been replaced
with stock Typography and Paper variants. Layout spacing, responsive sizing and accessibility
attributes remain application responsibilities. Shared brand tokens apply to component
colors and shape; semantic status colors remain MUI defaults. This does not establish
complete workflow parity or live cutover.

Default-style verification: 79 unit tests and 41 intercepted browser tests pass, including
standard code entry, default button styles, keyboard menus, stable pagination and permission
boundaries. TypeScript, lint, all three preview builds, connected build, artifact budgets,
source-size and repository hygiene checks pass. The connected sign-in entry is 162.9 KiB
gzip; total application JavaScript is 204.8 KiB, excluding the existing external Ably SDK.
The Vite large-chunk warning remains visible. No production deployment or auth-policy
change is included.

- Tables use native table semantics through MUI Table, column headers and row headers,
  sticky headings, and a TableContainer that scrolls without moving the footer. Loading,
  empty, error and populated states reserve the same frame height.
- All queue footers use MUI TablePagination. Known totals show the actual range and total;
  cursor reads with unknown totals show the current range only. Loading and error states
  do not imply zero records. Previous/next availability comes from the read contract.
  Fixed-size cursor reads do not offer unsupported page-size choices or last-page jumps.
- Keep native record links for open-in-new-tab and keyboard navigation. Whole-row activation
  must not intercept embedded links, buttons or future selection controls. Add sorting,
  selection and bulk actions only when the authorized data/command contract supports them.
- Use MUI navigation lists and responsive drawers for destinations, not action-menu roles.
  Preserve modal focus trapping, Escape dismissal and focus restoration. Current destinations
  use aria-current; the mobile trigger identifies its expanded drawer.
- Use MUI Menu/MenuItem for contextual actions, with a named trigger, anchor, expanded state,
  arrow-key navigation and focus restoration. Use Select for choosing a value, not navigation.
  Do not disable library focus management to work around a layout problem.
- Use a single primary action, secondary actions with lower emphasis, and an overflow menu
  for infrequent actions where appropriate. Confirmation and authorization belong to each
  command, not to decorative UI. Do not add placeholder operational actions to previews.
- Prefer core Table for the current bounded, read-oriented queues. Evaluate MUI X Data Grid
  when actual requirements include richer selection, editing or virtualization; do not add
  paid components or client-only sorting over partial server results without review.

These conventions follow the official [table](https://mui.com/material-ui/react-table/),
[menu](https://mui.com/material-ui/react-menu/), [drawer](https://mui.com/material-ui/react-drawer/)
and [list](https://mui.com/material-ui/react-list/) guidance. Keyboard, narrow-screen overflow,
stable footer placement and automated accessibility checks are regression requirements.

The Material UI pass passed 18 unit/interaction tests and nine browser tests, including
drawer focus trapping and Escape/focus return, select keyboard dismissal, mobile overflow,
known/unknown totals and fixed footer geometry. TypeScript, lint, all three builds,
artifact checks and repository size/hygiene checks passed. Total JavaScript including
lazy routes remains within budget: admin 284.2 KiB gzip and business 148.8 KiB.
Vite reports an admin entry-chunk size warning (546.36 kB minified); route chunking
remains a performance gate as production data screens replace these previews.
Production, authentication and shared-system contracts are unchanged.

## Operations dashboard preview

The local `/operations` screen now separates Overview, Services and coverage, App issues,
and Doji history using Material UI tabs. The default illustrative incident is explicitly
synthetic; disconnected and stale scenarios demonstrate that absent readings are not zero
failures. No live data, provider access, socket or polling was introduced.

The overview has delivery p95, outbox backlog, push-shard and unresolved-issue cards.
Two bounded SVG graphs show per-Doji p95 and unpublished-event observations, with missing
measurements left as gaps and native tables exposing exact values. They are not continuous
uptime graphs or a new percentile aggregation. Service accordions explain source, time,
measurement boundaries and the next investigation step. Issue details are synthetic and
do not link invented evidence to real Sentry incidents.

Existing read contracts cover operational delivery snapshots, at most 25 unresolved Sentry
groups over 24 hours, and at most 12 archived Doji summaries. Sentry occurrence counters
must retain their upstream semantics; they are not automatically 24-hour event totals.
API request success/latency, crash-free sessions, auth continuity, hosting, storage and
email aggregates remain coverage gaps. Current portal reads cannot establish their uptime.

Before connecting the React screen, reuse employee authorization and bounded reads with
per-source observation/expiry and existing reconciliation. Health-feed enablement and
any expanded retention, collectors, queries or provider access remain separately gated
by impact, cost, permission, regression and rollback review. No browser polling is allowed.
See `PLATFORM_OPERATIONS_HEALTH_2026-10-06.md` for the existing feed gates; its release
record does not authorize activation through this preview.

Local verification: 11 browser scenarios passed, including chart value tables, missing
observations, coverage drill-downs, issue details, keyboard tabs, mobile overflow, stale
status and no external telemetry requests. Desktop/mobile screenshots were inspected.
The 18 unit/interaction tests, TypeScript, lint, all three builds and artifact checks passed.
Admin JavaScript including lazy routes is 293.4 KiB gzip within the existing 300 KiB budget;
the pre-existing entry-chunk warning remains. No dependency was added.

## Connected employee candidate

The isolated `connected.html` entry reuses the existing employee browser transport. It
requires the exact production origin and explicit independent-identity configuration;
opening it on loopback makes no session/API call. No runtime configuration is included in
its built HTML. The default design entry remains unchanged and disconnected.

Implemented and tested locally:

- Stable session restore, password sign-in, authenticator challenge/enrollment UI and
  immediate private-cache removal on lock/logout. CSRF and cookies stay in the existing
  transport; no member authentication SDK or persistent portal cache is introduced.
- One QueryClient per employee/session epoch. Capability changes replace cached reads.
  Idle and absolute deadlines lock the UI; suspended-tab return cannot revive an expired
  session. Failed server cleanup blocks another sign-in until cleanup is retried.
- Server-paged My work, unified trust/restricted safety, community ideas, business
  applications and business privacy reads. My work uses the server's `mine` filter.
  Responses reuse existing validators; restricted/private queues require their existing
  capability combinations. No generic administrative command is exposed as a query.
- Foreground/online/focus reconciliation rechecks employee access and invalidates active
  authorized reads. It combines event bursts and does not poll the network.
- One staff-workflow socket per connected session when the existing staff feature gate
  is enabled. Channels come from the employee-authorized read and are checked against
  capabilities before loading the existing Ably browser SDK. Existing event validators,
  bounded deduplication, targeted invalidation and trailing refresh protect read ordering.
  Reconnection reconciles reads; logout and permission changes close the old socket.
  Hidden tabs do not fetch on hints; foreground reconciliation covers the missed changes.

Health events, business realtime, provider plans, shared infrastructure and member behavior
are unchanged. The candidate now connects the approved Operations dashboard to existing
bounded reads, as described below. It adds no collectors or claim of complete monitoring.

Local verification currently includes 43 unit/interaction tests, strict TypeScript, lint,
all three preview builds and a separate connected-admin build. The 14 browser tests cover
MFA, denied queues, logout, local-origin rejection and existing preview interactions using
fully intercepted network routes. Socket tests use a simulated SDK, not an Ably account.
The connected application bundle is 160.2 KiB gzip, excluding the existing
external Ably SDK; production CSP and total loaded-resource budgets remain release gates.
The Vite entry-chunk warning remains; the budget was not raised to suppress it.

CI now installs the repository's locked dependencies without lifecycle scripts for the
existing shared contract types, then installs the independent web lock and builds both
entries. This does not change mobile dependencies. CI has not run remotely yet.

Before cutover, complete full-page record reads and existing claim/assignment/decision
commands, other admin areas, auth recovery and enrollment acceptance,
business flows and public-route parity. Qualify production configuration,
headers/proxy routing, bundle loading, actual authorized sessions and rollback artifacts.
Keep real cases untouched during testing. These are remaining implementation and release
checks, not a request for another design approval.

Build the candidate after the normal build because the normal Vite build replaces `dist`:

```text
npm --prefix web run check
npm --prefix web/apps/admin run build:connected
npm --prefix web run test:connected-artifacts
npm --prefix web run test:browser
```

## Connected workspace navigation

The employee candidate now uses the approved shared Material UI shell instead of a
temporary button strip. Navigation is filtered by current employee permissions, with
My work as its initial destination. Existing authorized queue reads and the session-owned
staff socket remain unchanged. Unavailable routes display a neutral message and make no
queue request. No sample rows or preview-only destinations are used as a live fallback.

Candidate links use `connected.html#/my-work` and the equivalent queue paths. Hash routing
keeps reloads and new-tab links on the isolated candidate entry without changing production
proxy routes. It is not a permission boundary: the session, capability and server checks
still apply. Browser Back after sign-out cannot remount protected content. The shared
skip link focuses the content without changing the hash route.

The signed-in workspace/router chunk loads only after verified employee access. A failed
chunk offers an explicit reload, never an automatic loop. The initial JavaScript budget
remains 180 KiB gzip; the total candidate budget is now 215 KiB including its deferred
navigation/router and Operations chunks. The earlier routed-workspace budget was 200 KiB;
15 KiB is now allocated for connecting Operations, with its own 16 KiB chunk cap and
no sign-in preload. This is an explicit allowance for added functionality, not a reduction
in total bytes. Existing
external Ably bytes and production CSP qualification remain separate release gates.
The Vite large-entry warning remains visible.

Measured candidate JavaScript is 167.0 KiB gzip for sign-in and 208.9 KiB total,
excluding the existing external Ably SDK. The preview totals remain within their
unchanged limits: admin 296.9 KiB and business 152.4 KiB. All 79 unit/interaction
tests and 41 browser scenarios pass, alongside 41 existing health-assessment tests,
TypeScript, lint, builds and repository guards.

Offline browser checks exercise sidebar selection, reload, native hash links, restricted
direct entry without a queue request, Back navigation, mobile menu dismissal, table
overflow, accessibility, capability revocation and signed-out history. The test socket connects explicitly after
initial lazy mounting, then proves one authorized refresh per connection/event burst.
This does not claim an actual hosted Ably connection or a deployed React portal.

Remaining record families and decisions, other admin areas, business integration and
public-route parity still need implementation. Email-code delivery and deployment remain gated.

### Business application records and self assignment

The connected employee candidate now opens business applications as lazy-loaded full
pages from authorized queues. Pointer, keyboard and native links reach the same route.
The record shows submitted application fields, the latest 30 history entries and the
current assignee. Applicant text is rendered as text; business websites are not fetched
or embedded. Older history remains retained but its navigation is not connected yet.

Reads reuse `get_admin_business_application_v1` and `get_admin_case_ownership_v1` under
the existing business capability and feature gate. Both identities and versions must
match before actions are available. These are separate reads, not an atomic snapshot;
a version mismatch requires a fresh read. Record entry always rechecks ownership,
including when a previously dispatched assignment completed after leaving the page.
Actions are disabled during that read. Existing authorized staff-workflow events and
foreground/reconnect reconciliation invalidate the session-scoped `work` cache.

Assign to me needs no form fields. It invokes only the existing atomic
`admin_case_ownership_command_v1` with `business_application`, `claim`, a null target,
expected ownership/source versions and a new request ID. The server selects the actor.
The client validates the receipt and refreshes authorized reads; it never optimistically
invents an assignee. Double clicks dispatch once, uncertain explicit retries reuse the
identical intent, and rejected/conflicting commands require refresh. Navigation/logout
fences late client results but cannot roll back an already dispatched server command.

Business reassignment and release use the same narrow adapter, as described below.
Reports and external requests retain their separate existing ownership commands; this
business-only adapter must not be reused to bypass their contracts. Self-assignment
does not approve an application, enable billing/publishing or send applicant email.

Eight additional unit tests cover strict contracts, authority, version races, command
allowlisting, uncertain outcomes, receipt validation and logout fencing. Five offline
browser scenarios cover full-page navigation, double clicks, identical retries, denied
reads, leaving during assignment, return reconciliation, mobile layout and accessibility.
The navigation regression caught cached ownership on quick return and now verifies its
fresh read. Fixtures intercept all API/provider access; no real case was changed.

Rollback of this undeployed slice removes the business detail route, narrow command
adapter and their tests. It needs no database, provider or member-app rollback. Full
workflow parity and hosted authentication/CSP/realtime acceptance remain cutover gates.

### Business review decisions

The local employee candidate connects Approve, Request changes, Decline and Reopen to
the existing `admin_business_application_command_v1`. The adapter accepts only its exact
six parameters and requires both business-read and operator-management capabilities.
It changes no server permissions, feature gates or decision semantics. Read-only reviewers
can inspect and, when eligible, claim work; they cannot issue review decisions.

The pending-review UI requires assignment to the current reviewer and the server's
`can_decide` indication. Ownership remains coordination, not an added server authorization
rule: the existing decision command rechecks its own authority, state and application
revision. Approved/declined records expose only the existing manager-authorized Reopen
action, whose confirmation states that it suspends any approved business workspace.
Approval enables workspace access only, not billing or campaign publication.

The full-page form uses Material UI select/text fields and a bottom action bar. Assignment
does not require these fields. A decision retains the existing required applicant response
and internal note, with their separate visibility labels and length limits. A confirmation
shows the exact action, revision, response and note. Its initial keyboard focus is Back,
and Escape cancels an unsubmitted confirmation without sending a command.

The command uses an immutable request ID and expected revision. Double clicks dispatch
once; an uncertain response freezes edits and permits only an explicit identical retry.
Refreshing an unchanged revision cannot discard that uncertain intent. A newer authorized
read allows reconciliation without asserting which request produced the new state.
Rejected/stale commands require refresh; foreground changes block a prepared decision.
Receipts validate identity, action, outcome revision and state. Replays may include newer
current application data, so that snapshot is not mistaken for the original outcome.
Confirmed commands invalidate authorized `work` reads; no optimistic approval is installed.

Seven additional unit tests cover exact command routing, input limits/injection, permission
denial/revocation, uncertain retries, replay receipts and late results after logout. Nine
offline browser scenarios cover all four decisions, confirmation/double clicks, keyboard
focus, accessibility, mobile layout, unchanged uncertain recovery, stale data and conflicts.
API/provider traffic is intercepted; no real application or email was touched. Desktop and
390px confirmation screenshots were inspected. This decision slice retained the 180 KiB
initial and then-current 200 KiB total budgets. The later Operations allowance is recorded
below; Vite's large-entry warning remains visible.

Closed-application queue filters and older-history navigation still
need migration. Other record families, business-portal integration and public route parity
also remain incomplete. Rollback removes this undeployed form and narrow decision adapter;
it needs no database migration. Production cutover and email enablement remain gated.

### Business ownership controls and button contrast

The local employee candidate adds an Assignment menu for eligible business records.
Release assignment needs no decision fields and returns ownership to the unassigned
queue after confirmation. Change assignee is available only with both the record's
`can_assign` flag and operator-management capability. Its dialog reads eligible employees
through the existing case-specific `get_admin_case_assignees_v1`, at most 25 per page.
Changing pages clears the selection; a denied or stale read cannot supply a selectable
reviewer. The directory loads only while the assignment dialog is open, without polling.

Claim, release and assign retain the existing seven-parameter atomic ownership command,
server permission checks, source/ownership versions and immutable request ID. Receipts
must match the expected actor, selected employee or null release target. An uncertain
retry cannot change the target or request ID. Conflicts retain an enabled refresh path;
background ownership changes block a prepared action. Assignment controls are disabled
while a decision is prepared or unconfirmed. None of these actions changes application
status, sends applicant email or enables billing/publication.

Eligible-reviewer reads share the authenticated `work` cache and its existing event,
foreground and reconnect reconciliation. Confirmed ownership writes invalidate authorized
reads rather than installing an optimistic assignee. This slice adds no shared-system
deployment, permissions, realtime topic or member behavior.

Filled primary buttons use the shared accessible Doji theme described above. Browser
checks assert white labels, deep-orange fill and hover treatment, shared corner radius
and sentence-case labels on all three surfaces.

Six new ownership unit tests and five intercepted browser scenarios cover exact payloads,
permissions, bounded reviewer paging, release, duplicate clicks, uncertain retries and
stale ownership. Theme contract tests and three cross-surface browser checks cover shared
branding and contrast. The assignment dialog screenshot was inspected, and its automated accessibility
check passed. Tests use synthetic records and intercepted provider/API traffic only.
Rollback removes these undeployed controls/adapters and restores the shared button style;
no database, provider, mobile or email rollback is needed.

## Connected Operations and current cutover blockers

The local employee candidate's `/operations` route reads the existing
`portal_platform_health_v1` and `get_admin_event_health_history_v1(p_limit: 12)` through
the unchanged employee cookie/CSRF transport. Navigation and both reads require current
`operations_read` authority. The view preserves the existing health-model thresholds;
missing, malformed, low-sample, failed or outdated evidence cannot produce an all-clear.
App issues remain a bounded 25-group production query over 24 hours, not an outage count
or a claim that occurrence/user counters cover only that window. Only validated HTTPS
Sentry issue links are displayed. Provider envelopes and unrelated fields are discarded.

The approved tabs now show observed delivery/backlog/push signals, coverage limits,
issue summaries, two graphs and archived Doji rows using authorized responses. Missing
graph observations stay gaps. Histories are per-event server-publication observations,
not continuous uptime or handset-delivery measurements. Failed refreshes remove prior
issue/history contents. Desktop and 390px layouts and automated accessibility passed
against intercepted synthetic responses; no production monitoring read was made.

The two session-scoped `operations` queries reconcile on entry, foreground/online return
and an existing employee-socket connection recovery. Workflow case hints do not trigger
health queries. One local expiry timer reclassifies evidence without network polling.
Permission loss/logout clears the protected view and cache; no member session changes.
Health events stay disabled, explicitly labelled separately from queue connectivity.
No additional provider channel, collector, paid plan or database change is added.
The later chart replacement adds only the MIT-licensed Community chart dependency.

Operations and Community charts load separately after navigation, not in sign-in preloads.
The initial JavaScript guard now counts the entry plus every HTML module preload against
the unchanged 180 KiB gzip limit. The explicit library allowance is 110 KiB for deferred
charts; core connected code has a 230 KiB allowance including the new safety record,
with a 340 KiB combined cap. The preview retains its 300 KiB non-chart allowance plus
110 KiB for charts; business remains capped at 180 KiB without admin charts. These are
local bundle budgets, not measured production latency. Removing the chart dependency and
safety slice restores the previous budgets; no production artifact has been replaced.

The remaining cutover sequence is implementation work, not another design approval:

1. Finish hosted safety/privacy workflow acceptance,
   announcements and the distinct Overview. Preserve existing
   audited commands; the new announcement compose command is still separately gated.
2. Finish business authentication/onboarding/workspace and public legal/support/intake
   route parity. Do not activate email codes or sending through a frontend deployment.
3. Qualify each surface's production artifact, same-origin proxy paths, CSP/cookie/session
   behavior, hosted authorized reads, real realtime reconnection and retained rollback.
4. Release each qualified surface independently. Until then, keep existing production
   portals authoritative; do not replace working moderation with partial React routes.

## External safety records and Community charts

The employee candidate now opens external requests from the unified safety or personal
queue as full-page records. It reads the existing `get_admin_safety_removal_v1` through
the same-origin employee transport, projects bounded case fields and the latest 30 history
entries, and displays the actual assignee. Restricted records require legal-read authority
as well as moderation-read permission. Read failures remove private content rather than
leaving a previously authorized record visible.

Existing `admin_safety_removal_command_v1` handles self-assignment, starting review,
requesting information, recording an already-completed removal, closing and reopening.
Assign to me requires no form fields and only claims ownership; Start review is a separate
state transition in this existing contract. No client sequence pretends those are one
atomic command. Outcomes retain the existing response and evidence requirements, and use
standard MUI fields, confirmation dialogs and the shared bottom action bar. Recording
removal neither removes content nor revokes media access; the server must verify the linked
moderation decision. Restricted intimate-image requests also require identical-copy review.
The exact-content inspection/linking and report/appeal decision interfaces remain incomplete,
so this candidate must not replace the live moderation portal yet.

Commands retain immutable idempotency keys and expected revisions. Double clicks dispatch
once. Unknown outcomes retain the exact intent even after failed detail reads; an unchanged
refresh cannot discard it. Explicit retries reuse the original payload. Stale records and
definite rejection require reconciliation. Session changes fence late results. Validated
receipts invalidate authorized `work` and `safety` reads, never optimistically close cases.
Opening a record sends no command. No real case, email, provider setting or shared service
was changed by preparation.

Both preview and connected Operations use `@mui/x-charts` 9.15.0 Community. Nullable
observations remain gaps; single observations have visible markers, and all-zero series
retain a useful scale. Exact values remain available in a MUI table. An accessible labelled
group surrounds the unmodified chart because this library version puts its `title` label
on a presentational container; automated accessibility checks remain enabled. No custom
chart palette, CSS, slots or library patch is used. The chart uses existing bounded reads
and adds no telemetry, network requests or health-feed subscription.

Current local verification: 88 web unit/interaction tests, 50 intercepted browser scenarios
and 169 existing health/source/boundary tests pass. Nine new safety unit tests and nine
browser scenarios cover strict projection, every exposed workflow outcome, field-free
assignment, restricted evidence requirements, permission denial, stale revisions, failed
reads, identical retries and conflicts. Automated accessibility and 390px layout checks
pass; the resulting chart and safety screenshots were inspected. TypeScript, lint, all
three preview builds, connected build, artifact budgets, source-size and repository hygiene
pass. The sign-in entry plus preloads is 166.5 KiB gzip; the deferred chart is 96.7 KiB,
Operations 13.8 KiB, and the entire connected candidate 310.0 KiB, excluding the existing
external Ably SDK. Admin preview totals 385.2 KiB including lazy routes; business is
148.2 KiB. All checks use synthetic/intercepted data, not production acceptance.

Rollback removes the undeployed safety route/adapters and chart dependency; it requires no
database, Worker, member-app or provider rollback. Production qualification and the complete
cutover sequence above remain required.

## Report and appeal record reads

The local connected employee candidate now opens report and appeal rows from Trust and
safety, Restricted safety and My work as full-page stock-MUI records. Existing authorized
`get_admin_report_case_v3` and `get_admin_appeal_case_v1` reads provide bounded display
projections. Report assignment comes from native triage, not the staff ownership command;
appeals use a separate exact-ID staff ownership read. Unknown payload fields and signed
URLs are excluded from the cached model. The subsequent local evidence slice below adds
bounded authorized storage references to that session-only model.

Appeals bind to the exact appealed decision. A newer report decision or archive cannot
replace it. The screen separates current content from historical evidence, identifies a
missing historical snapshot, and preserves independent-reviewer and restricted-account
consequence checks. Restricted deep links require legal access before reading; a restricted
payload returned to an ordinary route is rejected before display. Server authorization
remains authoritative. Opening records may trigger the existing server evidence-view audit,
but sends no assignment, decision or content-mutation command.

Record queries use the existing session-scoped safety cache and entry, foreground and
reconnect reconciliation. Read errors remove private case content. The subsequent slice
below adds protected media and command adapters locally; evidence linking and workflow
history remain incomplete. Continue using the existing live portal until full parity and
the cutover gates above pass.

Local verification adds eight projection/permission unit tests and four intercepted browser
scenarios. The complete web suite has 96 unit tests and 54 browser scenarios, including
mobile layout and accessibility. TypeScript, lint and all three preview builds plus the
connected build pass. The report mobile screenshot was inspected. The new deferred record
chunk stays below an 8 KiB gzip limit without raising the existing 180 KiB sign-in,
230 KiB non-chart or 340 KiB total candidate budgets. The previous 169 legacy health/source
tests remain the prior slice's evidence, not a new production acceptance check.

The first browser run overlapped a build and failed with local connection resets and timing
errors. A full isolated run at four workers passed all 54 scenarios without test timeouts or
assertions being relaxed. Production deployment, media access, shared services, member
behavior and email gates are unchanged. Rollback removes the undeployed report/appeal
routes and read adapters; no database or provider rollback is needed.

## Moderation command preparation and release blocker

The local candidate now has field-free Start review assignment, confirmed report decisions,
appeal review, report release and priority, and review reopen/reclose adapters. Existing
atomic routes remain authoritative. Stock MUI forms separate assignment from enforcement,
show the selected consequence and require the existing independent-review override when
applicable. The UI adapters remain local; the separately approved server replay repair
below is live. No production case command was invoked during qualification.

Protected media requires an explicit Open action through existing employee authorization.
Only bounded authorized object references enter the session cache. Signed URLs remain
transient, are checked against the requested object, and expire locally after at most
270 seconds without automatic refresh. Current, original-reference and preserved-decision
media are labelled separately; missing historical evidence is not presented as a snapshot.

Local verification passes 107 unit tests and 61 intercepted browser scenarios, including
permissions, stale confirmation, immutable uncertain retries, explicit media inspection,
expiry and mobile accessibility. TypeScript, ESLint and the source-size guard pass. The
connected artifact builds, but its expanded moderation chunk is 9.6 KiB gzip and fails the
existing 8 KiB feature cap; bundle qualification is not complete. The earlier preview-build
results apply to the previous slice, not this expanded candidate.

An offline database test replayed all 289 migrations in a fresh network-disabled container
with synthetic member and employee records. Calling `admin_decide_report_v3` twice with
the same restricted temporary-restriction command and key returned the same decision ID,
but changed both `starts_at` and `ends_at`; the immediate replay extended expiry by
2.584 ms. The wrapper resets these timestamps after the inner function returns a cached
receipt. This proves a retry defect in the replayed repository schema, not a production
incident or the state of a separately patched live database. The test transaction rolled
back and its verified owned container was removed. Production was untouched.

The owner approved a separately scoped repair and deployment after regression and rollback
checks. It deployed at **2026-10-09 03:44:53 UTC** (October 8 in Denver), as migration
`20261009034000_moderation_outer_replay.sql`. This is a server repair, not the React cutover.
The remaining migration parity, artifact-budget and hosted acceptance gates still apply.

Only `admin_decide_report_v3` and `admin_review_moderation_appeal` changed. Their outer
transaction now locks the actor/key and case, rechecks authorization and returns a saved
receipt before repeating any restriction or restoration writes. New receipts store a
SHA-256 request fingerprint and reject changed-payload key reuse. Historical receipts have
no fingerprint: a matching case/action returns its original receipt, never a claim that
new fields were applied. Initial moderation policy, independent-review rules, member login,
challenge timing and push behavior remain unchanged. No live case or member record was
edited, and no new resource, subscription or paid plan was enabled.

Release qualification used the exact captured live function bodies in a network-disabled
disposable database. Temporary restriction and permanent suspension tests passed identical
and historical replay, changed-payload denial, real member appeal and employee reversal,
subsequent removal, no reactivation or repeated restoration, permissions, unchanged audit,
notice/outbox contents, and employee/member receipt separation. Two actual concurrent
connections verified lock contention and identical decision/appeal receipts. Exact prior
function restoration and reapplication passed. Broader integration passed 274 pgTAP
assertions, identity/media/business suites and five member/business concurrency cases.
All test containers were removed after verification.

Before deployment, a production transaction rehearsed the two-definition change and exact
rollback, then rolled back. The committed release used the identical rehearsed artifact,
an eight-second statement timeout, two-second lock timeout, exact definition/permission
preflights and a clear challenge release window. Post-deployment verification confirmed
the two expected hashes, **418 other functions unchanged**, unchanged owners/ACLs, RLS
policies and receipt routing, and no database lock waiters. Verification did not perform
synthetic moderation against live members.

Release tooling: `scripts/release-moderation-replay.mts`; regression runner:
`scripts/test-moderation-replay.mts`. Exact preflight, local regression, rehearsal, commit
and verification evidence is retained under `test-results/moderation-replay-release/`.
The guarded `rollback.sql` there restores the two exact prior definitions only when the
installed hashes still match; rollback would restore the known retry defect, so do not
use it routinely. The migration ledger remains historical if emergency rollback is needed.
No rollback was applied after the successful deployment. Source and release notes are
in the migration worktree; the entire React branch has not been merged or deployed.

## Community Ideas and audit integration

Community Ideas now opens full-page authorized records from both the shared queue and
My work. The record shows submitted content, supported response rules, assignee, challenge
link and recent review history. Start review and release use the existing atomic ownership
command without decision fields. Pending reviews require self-assignment in the UI;
existing server permissions and allowed actions remain authoritative. Acceptance, decline
and reopening use the existing editorial command with a member-visible response and
confirmation. Unsupported response formats cannot be accepted.

Source and ownership revisions must agree before rendering. A changed record blocks a
prepared decision and requires reloading the form. Unconfirmed commands retain their exact
payload and retry key through read reconciliation. The editorial RPC returns the authorized
current item on replay, which may reflect a later decision; the client does not mislabel
that current status as a new application of the original action. Its deleted-item receipt
is checked separately. No command runs merely because a record is opened.

Audit browsing now uses the existing employee-only read, 25 rows per page, explicit search
and category filters. Cursor validation preserves Postgres microseconds and verifies the
returned tail, order and scope. The page uses the shared centered loading indicator,
fixed-height table and MUI pagination. Read errors hide previously displayed audit content.
Shared pagination now allows returning from an empty or failed later page; loading and
forward navigation remain gated. The later employee-access/audit slice below adds detail
and export; the later history/navigation slice also restores related moderation-case links.

Both additions use memory-only employee TanStack caches. Idea reads use the existing work
area; successful decisions invalidate work and audit. Authorized staff hints and socket
recovery invalidate active audit reads, with foreground/online reconciliation retained.
Staff hints do not constitute a complete audit-event feed or prove every audit category is
updated immediately. No new provider channel, polling, backend write contract, member login
behavior, email sending or production release is introduced.

Moderation actions now load separately from record evidence. The read chunk is below its
unchanged 8 KiB gzip limit. The previous 230 KiB non-chart allowance covered fewer features;
the expanded review/Ideas/audit allowance is 242 KiB, with separate 6/5/2 KiB chunk limits.
The original 180 KiB sign-in and 340 KiB total application limits remain unchanged. This
budget change is explicit feature accounting, not proof of improved hosted latency.

Local qualification passes TypeScript, lint, source-size/hygiene checks, 118 unit tests
and all 67 intercepted browser scenarios. Earlier browser runs exposed fixture routing
and timing assumptions and a duplicated stale-form alert; these were corrected before
the full passing run. All three preview builds and the connected admin build pass their
artifact checks. The connected candidate measures 170.4 KiB gzip at sign-in, 234.0 KiB for
all non-chart routes, and 330.7 KiB including deferred charts; the existing external Ably
SDK is excluded. These are local build/fixture results, not hosted release acceptance.
Production is unchanged. Rollback removes these undeployed routes/adapters; no database
rollback is required.

## Employee access and audit completion

The local employee candidate now connects Team & access to the existing independent
employee directory and role command. It does not list or modify member accounts. The
directory is capped at 100 verified employee records with local 25-row presentation;
reaching that cap is explicitly not a whole-organization count. Grant/revoke uses the
existing atomic, audited command with an explicit confirmation and reason. An unknown
outcome freezes editing and retains the exact payload and idempotency key for retry.
Success reauthorizes the acting employee before reconciling directory, work and audit
queries; losing one's own permission removes the protected view and old session cache.

The same session-owned socket can receive employee-access hints on the already authorized
legacy moderation topic. UUID/event identifiers are validated and deduplicated before
coalesced reauthorization and targeted invalidation. Staff without moderation permission
do not gain access to that topic; entry, foreground/reconnect and post-command checks
remain in place. No universal immediate role-change feed is claimed. No provider setting,
new backend contract, polling, email or member-session behavior changed.

Audit rows open full-page details from the authorized bounded page, with metadata rendered
as text. Failed/denied reconciliation removes the open event. Explicit matching CSV export
uses the existing capped 5,000-event server read, preserves the legacy column contract,
omits metadata, escapes spreadsheet formulas and reports truncated history. Filter changes,
logout and permission loss fence late downloads. Related report/appeal navigation is
covered by the subsequent history/navigation slice.

Local checks pass 128 unit tests and the full 74-scenario browser suite. A further audit
failure/revocation scenario passes with both existing export scenarios (75 distinct browser
scenarios across these runs). The browser run exposed a keyboard-scroll gap in read-only
tables; the shared MUI container is now focusable and accessibly named. Offline socket
mocks and exact region selectors were updated for the new subscription/container. No
real employee role or audit export was changed or downloaded during tests.

All three preview artifacts and the connected admin artifact build successfully. Connected
application JavaScript is 173.0 KiB gzip at sign-in, 241.6 KiB for all non-chart routes and
338.3 KiB including deferred charts; the existing external Ably SDK is excluded. The
180/242/340 KiB limits remain unchanged. Team and audit detail/export have additional
deferred-chunk guards; none preload at sign-in. TypeScript, lint and repository guards
also pass. These are local measurements, not hosted performance or production acceptance.

Production is unchanged. The remaining cutover sequence above still applies. Rollback
of this undeployed slice removes its frontend routes/adapters; no database rollback or
member release is needed.

## Case and idea history navigation

The local connected safety queues now expose Open cases and Closed cases through the
existing server-owned unified queue, not a client merge or a second external-request table.
The requested state is included in the session-scoped query key and validated against the
response. The personal inbox remains open work assigned to the current employee; a URL
parameter cannot turn it into another employee's queue. Opening a safety record and
returning preserves its open/closed filter. Returning starts at the first page and
reconciles current authorized data.

Community Ideas links to a separate history view for All, Pending, Accepted and Declined
submissions. It uses the existing editorial page read with 25-row server pagination,
strict status validation and full-precision timestamp/ID cursors. The projection drops
unrendered fields. Detail opens through the existing authorized record/ownership reads;
returning preserves the status filter and starts at the first page. Status changes reset
the cursor, and failed or denied reads clear previous rows. No new editorial command is
introduced; manager reassignment remains a separate parity gap.

Audit details restore Open related case for known report and moderation-appeal IDs when
the employee has moderation-read permission. The link requests current authorized case
data, including restricted-area checks, independently of audit metadata or list presence.
An audit row does not grant access or prove that the record still exists. The record has
an explicit return to the audit log. Other audit entity types do not gain guessed links.

All these views use shared MUI table/loading/paging controls. History reads use the
existing work/safety cache areas and entry, foreground, online and authorized socket
reconciliation. No timers, polling, production writes, provider changes or member behavior
changes are introduced. Local unit coverage is 136 tests; 81 intercepted browser scenarios
pass, including filter return paths, cursor reset, denied history, restricted audit
handoff and mobile accessibility. Production remains unchanged.

The history parser and UI are deferred from sign-in. The new feature has an explicit
5 KiB allowance across archive and navigation code: non-chart and total caps move from
242/340 to 247/345 KiB gzip, while sign-in stays capped at 180 KiB. The measured connected
artifact is 174.4 KiB at sign-in, 246.1 KiB for non-chart routes and 342.9 KiB including
deferred charts; the external Ably SDK remains excluded. The artifact guard separately
checks the lazy history chunk and rejects its parser in initial preloads.
This is local bundle qualification, not hosted latency or release acceptance.

## Verification-code entry and email-alternative preparation

The employee candidate uses the shared Material UI `VerificationCode` component:
a standard MUI TextField with no visual overrides. It supports leading zeros,
formatted paste, selection/backspace, numeric keyboards and the one-time-code autofill
attribute. It has one tab stop, an accessible label, error feedback and an explicit
Verify action. Device autofill still needs acceptance on actual supported devices.
The shared component is available to the business migration; its business sign-in
integration is not complete. The unused `input-otp` dependency has been removed from
the independent web workspace. Mobile dependencies are unchanged.

The owner approved local preparation of an email alternative for employee and business
access, with deployment and sending gated. The draft lives in
`docs/drafts/portal-email-challenge.mts` and its companion contracts file. It is not
imported by a runtime route and has no mail sender, database adapter or session grant.
Existing authenticator requirements remain in force.

The candidate policy is a five-minute code bound to a recent server-verified password
attempt, identity, realm, audience, verified email and browser binding. It proposes a
60-second resend cooldown, three sends and five guesses per actor per 15-minute window.
Resends replace old codes without resetting the attempt budget. Codes are generated
cryptographically, stored only as keyed digests and consumed atomically. Time is
rechecked inside the store transaction, not only before waiting for its lock.
The raw code returned by the draft is server-internal delivery material, never an HTTP
response. Provider acceptance does not assert inbox delivery.

An email observation deliberately grants no session and does not claim TOTP proof,
`aal2` or `mfaVerified`. WorkOS AuthKit's documented MFA flow uses authenticator codes;
Magic Auth and email verification are separate flows, not permission to bypass an
existing TOTP requirement. Provider integration and the resulting portal assurance
policy remain unresolved release gates.

Before enablement: qualify the server-owned first-factor handoff, durable atomic store,
encrypted delivery outbox and unknown-send reconciliation, global/IP abuse budgets,
expiry cleanup, CSRF protection, verified-address changes, recovery and factor switching.
Verify no-added-cost delivery capacity, both portal permission boundaries, member-auth
regressions and live rollback. No mail or provider request is made by the draft tests;
the serialized in-memory adapter does not prove distributed-store correctness.
Preparation rollback removes the draft and its tests; runtime behavior is unchanged.
Any later rollout must preserve the TOTP path and have a separately qualified rollback.

Local verification includes 47 web unit/interaction tests and ten email-draft security
tests, plus web and tooling TypeScript, lint, all three preview builds, connected build,
artifact budgets and repository guards. Browser coverage includes the standard code field,
formatted paste, keyboard replacement, 320px layout and automated accessibility checks.
No production deployment, email sending, billing or member-auth change is included.

## Community Ideas manager assignment

The local connected admin candidate now supports manager reassignment of an actionable
Community Idea. It reuses the business Material UI reviewer picker and the existing
`get_admin_case_assignees_v1` read, scoped to `suggestion`, its case ID and 25 employees
per page. Case kind is part of the session cache key. Directory reads require operations
access and employee-management permission; the server supplies eligible reviewers.

Assignment needs no outcome or member-response fields. Confirmation re-reads the case
and checks its source version, ownership revision and current assignee. Changed ownership
blocks the prepared action. The existing `admin_case_ownership_command_v1` performs one
atomic assignment, and its receipt must match the selected target and next revision.
An uncertain result keeps the exact target and idempotency key for explicit retry. A
server rejection requires refresh. No editorial decision, member notification, email,
provider configuration or shared database contract changes with this UI connection.

The 138 unit tests and full 87-scenario browser regression run passed, including assignment
paging, double-click protection, stale ownership, manager denial, identical retries,
server-rejection recovery and mobile dialog accessibility. Visual inspection caught and
corrected a clipped select label using shared MUI layout spacing.
TypeScript, lint, source-size and repository hygiene checks passed. All three preview
builds and the connected admin artifact passed output checks. The connected candidate
measures 174.4 KiB gzip at sign-in, 247.3 KiB for non-chart routes and 344.0 KiB overall.
The non-chart allowance increases by 1 KiB to 248 KiB for this feature; the 180 KiB sign-in
and 345 KiB overall ceilings stay unchanged. Existing external Ably SDK bytes remain
excluded from those application-bundle numbers.

Rollback removes the idea assignment control and its `assign` adapter branch; the
existing claim, release and editorial commands remain. Keep the eligible-reviewer cache
kind in place if other case types reuse it. This is local preparation, not a hosted
release. Privacy, announcements, remaining safety workflows, a distinct Overview,
business/public route parity and independent production qualification remain open.

## Business privacy workflow migration

The local employee candidate now has a dedicated privacy queue and full-page records.
The queue uses the existing state-filtered, deadline-ordered read with 25-record keyset
pages; timestamps retain microsecond ordering. Records show the current assignee,
verification reference, recorded deadline, legal hold and revision-paged history.
Personal work links open the same authorized record and return to My work.

Both legal-read and operator-management permission are required, together with the
existing runtime gate. Responses are bounded and projected; cleanup email and raw actor
fields are not retained. Ownership must agree with the case source revision. Each history
page re-reads current case and ownership state; it is not a frozen historical snapshot.
Errors, access denial and logout hide private content. Existing identifier-only events,
reconnect and foreground reconciliation refresh authorized reads without polling.

Explicit Start review, release and reassignment use existing atomic staff ownership
commands. Start review has no required outcome fields. The shared reviewer picker reads
only the exact case's eligible employees, at most 25 per page; the server validates the
target again when applying the command. Case and ownership revisions protect assignment
against stale data. Reassignment preserves the exact target on an uncertain retry.

The outcome form supports retention holds, closing business access, preparing erasure,
completion for access/closure/erasure requests, correction completion after recorded correction history, and denial through the existing privacy
command. It requires an opaque protected-record reference and explicit confirmation,
then rechecks case, hold and ownership state. Active decisions require the current UI
reviewer to own the case; closed-case retention maintenance preserves the existing policy.
This is workflow coordination, not a new atomic ownership precondition in the privacy RPC.
Server privacy authority, legal holds and revision checks remain authoritative.

Erasure preparation is not execution. Completion records an assessed result; it sends
no response and does not remove remaining copies. There is no erasure executor in the
React UI. Existing production workflows remain authoritative. No production
deployment, real-case action, email sending or member/shared-system change was performed.

Only a matching receipt confirms success. An uncertain result retains the same immutable
payload and request key, including after case refresh or read failure. A rejection requires
refresh before another attempt. A confirmed command is not replayed because its follow-up
read failed. Logout and permission changes fence late outcomes; no automatic retries run.

Verified request creation now uses the existing atomic open command, with exact business
account ID, request type, opaque verification reference, assessed deadline and confirmation.
The standard MUI date/time picker preserves local entry and sends canonical UTC. An unknown
receipt freezes the exact request and key; a failed follow-up read cannot create a duplicate.
This records a case, not requester verification, fulfillment or email delivery.

Protected application access is an explicit read with bounded snapshots and revision history.
WorkOS-held identity information is clearly identified as a separate export requirement.
Closing the panel disposes its query; denial and refresh hide stale protected fields.
Current-draft correction requires current ownership and fresh case/application revisions.
The address, submitted snapshots and agreements remain unchanged. A correction can only
edit draft or changes-requested applications; review and erasure-prepared cases stay blocked.
Completion is offered after the recorded correction appears in loaded case history, preserving
the existing workflow safeguard. It remains a separate assessed outcome, not automatic delivery.

Verification: 154 unit tests and the full 104-scenario browser suite passed, including
state/cursor paging, history navigation, source disagreement, permission denial, logout,
foreground recovery, coalesced realtime invalidation, field-free claims, reassignment,
stale confirmations, exact uncertain retries and failed post-command reads. Mobile automated accessibility
and screenshot inspection passed. TypeScript, lint, source-size, repository hygiene,
documentation links, all three preview builds and connected artifact checks passed.

The connected candidate measures 174.2 KiB gzip at sign-in, 330.0 KiB across non-chart
routes and 418.8 KiB overall. Privacy workflow chunks contribute 15.9 KiB with a 17 KiB
limit. Creation and deferred shared MUI fields/helpers contribute 68.5 KiB with a separate
72 KiB limit, including the stock date picker. None of those chunks preload at sign-in.
The 180 KiB sign-in and 248 KiB remaining-core limits remain; the total limit is 425 KiB.
Existing
external Ably SDK bytes remain excluded. These are local bundle checks, not hosted
performance or production acceptance.

Rollback removes the privacy controls and command adapter/session entry, restoring the
read-only candidate. Removing the entire feature also removes its routes, queue links,
adapter exports, creation/session method, and four read-policy entries. No database rollback is required because
no server contract changed. Hosted
authorization/realtime acceptance and the remaining portal workflows still gate cutover.

## Report and appeal history

The local React case view now includes an expandable Material UI history section.
Report workflow uses the existing authorized response's latest 50 entries, paged locally
in groups of ten. Paging makes no additional request. The separate evidence-view summary
does not appear as workflow activity. Missing history is labelled unavailable rather
than treated as an empty audit log; reaching 50 entries warns that earlier activity may
exist. Raw audit metadata, contact fields and storage references are not retained.

Appeals show the original decision reviewer, submission and recorded review outcome,
separately from the linked report workflow. Missing legacy reviewers and invalid or absent
timestamps stay explicitly unknown. Current report decisions never substitute for the
appealed decision, and text is rendered literally. This timeline is not a historical
content snapshot or a complete audit export.

History shares the existing case query and authorized reconciliation. Access loss removes
the entire protected record. Access-count changes do not invalidate typed decision forms;
actual workflow, evidence, ownership and decision changes still do. Collapsed history is
unmounted; its standard table scrolls internally at narrow widths and keeps paging fixed.

Verification passed 158 unit tests and all 106 browser scenarios, including local paging,
access denial, draft preservation, original-decision provenance, mobile accessibility and
literal text rendering. TypeScript, lint, source-size, all three preview builds and output
checks passed. The connected artifact is 174.2 KiB gzip at sign-in and 420.5 KiB total,
within the unchanged 180 KiB entry and 425 KiB total limits. The shared accordion is now
accounted for within the existing deferred MUI allowance; no budget ceiling was raised.

Rollback removes the history component and parser projections and restores the previous
case fingerprint. No server rollback is needed. No live read, production release, command,
member behavior, provider setting, email or billing change was performed. Remaining
route parity and hosted acceptance still
gate the migration's independent surface releases.

## Moderation ownership controls

Report and appeal records now expose Start review and Release assignment outside the
outcome form. Neither action requires outcome fields. Managers can reassign an open appeal
using the existing case-specific eligible-reviewer directory and explicit confirmation.
The picker reads at most 25 reviewers per page; the atomic server command checks eligibility,
source version and ownership revision again. Restricted access and independent-review
rules remain authoritative. Reports retain their native claim/release contract; arbitrary
manager transfer of a report would require a separately approved shared-system change.

Each ownership action re-reads the authorized case before dispatch and refuses a changed
snapshot. An uncertain result retains its exact action, target, revision and request key.
Retry remains at record level when the refreshed owner changes or the next read fails.
A confirmed receipt invalidates work, safety and audit; failed follow-up reads cannot
turn a confirmed write into a new attempt. No automatic retry, polling or new server
contract is introduced.

The controls use standard Material UI buttons, dialogs and the existing eligible-reviewer
picker. The mobile assignment dialog passed automated accessibility and screenshot review.
Verification passed TypeScript, lint, 160 unit tests, all 110 browser scenarios with four
workers, source-size, repository hygiene, documentation links and all three preview builds.
A fixture teardown race was fixed by waiting for active route handlers before disposing
the request context. A separate preview startup assertion exceeded five seconds under
twelve workers; the complete four-worker run passed without increasing its timeout.
Connected artifact checks passed with 174.3 KiB gzip at sign-in, 332.6 KiB across non-chart
routes and 421.3 KiB overall, within unchanged budgets. These are local fixture and build
checks, not hosted acceptance or a production release.

Rollback removes the ownership component and appeal assignment adapter branch, restores
report release in the previous outcome selector, and removes appeal support from the shared
picker. Keep exact uncertain-retry protection until outstanding requests are reconciled.
No database rollback is required. Existing live portals remain authoritative; no real case,
provider setting, member behavior, email, billing or deployment changed.

## Exact content inspection and report handoff

The local external-request record now connects to the existing exact-target inspection
and atomic report-creation contracts. An assigned reviewer selects a server-classified
content type and enters an exact ID. Inspection is explicit, bounded and audited; the UI
retains only identity, text, visibility, a fingerprint and whether media exists. It never
fetches a submitted URL, signs media, retains raw storage references or infers a target
from similar wording. Missing category targets disable inspection.

Creating a report requires an identification rationale, a verification checkbox and an
explicit Material UI confirmation. Ordinary reports leave visibility unchanged. Restricted
posts, comments and poll responses can be quarantined by the existing command; account and
profile-photo reviews do not automatically remove them. The confirmation states these
consequences and does not imply an account ban, old-URL revocation or email delivery.
The UI rechecks the case revision, assignment and target fingerprint before dispatch;
the server's existing locked fingerprint/revision checks remain authoritative. UI ownership
coordination does not add a new atomic ownership condition to the existing server command.

An uncertain receipt retains the immutable target, fingerprint, note, revision and request
key for explicit retry, even after the case changes or its next read fails. Other outcome
controls stay disabled while report creation is busy, uncertain or requires reconciliation.
A verified receipt refreshes work, safety and audit without replaying a successful command
when a follow-up read fails. The linked full-page moderation record performs its own
authorized read and has a validated return link to the external request.

All 115 browser scenarios (including five exact-content scenarios) and 163 unit tests passed, covering exact identity,
text-only rendering, permissions, changed-content rejection, immutable retries, failed
reads, duplicate clicks and ordinary/restricted consequences. The mobile confirmation
passed automated accessibility and screenshot review. Connected artifact checks measure
174.4 KiB gzip at sign-in and 424.9 KiB overall. Entry and total ceilings remain 180 and
425 KiB. The measured exact-content feature receives 4 KiB within the core allocation
(248 to 252 KiB); the safety route allowance tightens from 16 to 8 KiB, with separate
1 KiB limits for each deferred target and report adapter.

Final TypeScript, lint, source-size, repository hygiene, documentation links, all three
preview builds and both artifact suites passed. Browser tests used intercepted local
fixtures, not production member records or live moderation commands.

Rollback removes the exact-target component, report hook/session entry, adapter exports
and the target read-policy entry, then restores the existing-portal notice. Retain the
existing live artifact and reconcile uncertain commands before replacement. No database,
Worker, provider, member, billing, email or production change was made. Hosted acceptance
and the remaining route parity still gate independent surface releases.

## Connected Overview and announcement reads

The authenticated root now opens a role-filtered Overview navigation hub. My work stays
the personal assignment queue, and review areas retain their own tables. Overview does
not fetch aggregate counts or present page counts as global totals.

Announcements now has a standard MUI table, shared loading/error/empty states and fixed
pagination footer. Existing editorial reads supply 25-record, newest-first keyset pages
and full-page records. Strict projection, cursor ordering (including Postgres microseconds),
status/filter checks and operations permission guard the connection. Body and CTA text
are rendered as text, not HTML or automatically fetched links. The displayed window,
priority and per-account frequency do not imply actual delivery to a member.

These routes are read-only. Creation, editing, publishing and cancellation remain in the
production portal pending command-flow completion. The separately prepared atomic compose
command and email alternative remain undeployed. No production cutover occurs here.

Announcement events reuse the existing moderation topic only for employees already
authorized for that topic and editorial reads. Event identifiers invalidate authorized
reads; payloads are never records. Operations-only employees reconcile on foreground
and socket reconnect without receiving restricted moderation events. No polling or
provider permission expansion is introduced.

The measured feature adds approximately 4.5 KiB gzip. The explicit total budget rises
from 425 to 430 KiB and core from 252 to 257 KiB; sign-in stays capped at 180 KiB.
Overview, list, detail and parser remain independently deferred with individual caps.
Rollback removes those routes, read-policy entries and announcement hint subscription;
existing production artifacts and all database/provider contracts remain unchanged.

Validation: all 169 unit tests and all 117 browser scenarios passed. The browser suite
includes the distinct post-MFA Overview, authorized announcement navigation, read denial,
failed-read clearing and recovery, filters, no write dispatch, mobile overflow and WCAG
checks. Mobile and desktop screenshots were inspected. TypeScript, lint, source-size,
repository hygiene/documentation links, all three preview builds and both artifact suites
passed. The connected artifact measures 174.6 KiB gzip at sign-in and 429.4 KiB overall.
Checks used local intercepted fixtures, not production announcement reads or writes.

Remaining cutover gates include announcement write flows, business and website route
completion, and hosted acceptance of the independent surface releases. These checks do
not qualify the entire migration for production.

## Hosted admin acceptance on October 9

The connected React candidate is hosted at https://admin.dojipro.com/connected.
Cloudflare deployment `7669938e-8f03-4de7-a841-4c14af5c8b94` passed static asset,
security-header and public authentication-boundary verification. The existing root
homepage, legacy admin HTML and API proxy remain byte-identical to the saved release.
Business and public-site deployment IDs and all three project configurations remain
unchanged. This is an acceptance entry, not the default admin cutover.

The first package exposed a stale fallback HTML response under an immutable asset URL.
Candidate assets now use the isolated `/react-admin/20261009b/` namespace. Acceptance
assets, configuration and both `/connected` and `/connected.html` use `no-store`.
Cloudflare canonicalizes the HTML URL; verification was repeated after header propagation.
The 12 targeted browser tests passed against the exact packaged files under the production
CSP, including authorization denial and idempotent command behavior with local fixtures.
No live commands were dispatched by those tests.

The owner's authenticated Chrome session restored into Overview. Bounded read-only checks
loaded My work, ordinary and restricted safety, business applications, business privacy,
community ideas, announcements, audit, team access and Platform health. The queue socket
reported connected; no console errors or warnings were observed. Real-case commands,
new employee access and synthetic live event delivery were not exercised. Platform health
loaded archived summaries and charts but reports an unavailable Sentry feed. Health push
updates remain disabled, matching the existing deployed configuration; a connected queue
socket does not establish live health coverage.

Evidence is retained under `test-results/react-admin-hosted-20261009-v3/` with the exact
manifest, test receipt, deployment and verification records, and a bounded acceptance
receipt without case content. The original rollback remains
`test-results/admin-record-pages-20261006/site`, deployment
`9f87f318-80a0-4700-9096-b567411c4066`. Intermediate packages are retained as evidence,
not as the preferred rollback. No database, shared Worker, provider permissions, member
authentication, email policy or billing changes accompany this static release.

Announcement writes remain in the existing portal. Business React and public Next.js
route completion, independent hosted acceptance and the admin's remaining write-flow
parity still gate replacing the respective production entry points. The prepared atomic
announcement command and email MFA alternative remain undeployed.

## Framework references

### October 9 approved design update

Deployment `d9130763-8f5f-491e-9756-028c7c890e89` updates only the existing
admin /connected acceptance entry with the approved Home/Team and queue/record layout.
All 133 exact-package browser tests passed. Hosted read-only Home, Team, business
queue/detail, desktop summary geometry and connected queue status were verified.
Release evidence: `test-results/react-admin-hosted-20261009-v4/`.
The preceding v3 package is the immediate acceptance-entry rollback. Default portal,
API proxy, security configuration and other sites are unchanged. Announcement writes
still gate replacing the admin root; no shared-system or member change is included.
See ADMIN_REFERENCE_IMPLEMENTATION_2026-10-09.md for full release scope and limitations.

- [WorkOS AuthKit MFA](https://workos.com/docs/authkit/mfa)
- [WorkOS authentication API](https://workos.com/docs/reference/authkit/authentication)

- [MUI installation](https://mui.com/material-ui/getting-started/installation/)
- [MUI Next.js integration](https://mui.com/material-ui/integrations/nextjs/)
- [MUI X licensing](https://mui.com/x/introduction/licensing/)
- [MUI Community charts](https://mui.com/x/react-charts/quickstart/)
- [MUI date and time pickers](https://mui.com/x/react-date-pickers/quickstart/)
- [Vite guide](https://vite.dev/guide/)
- [Next.js static export](https://nextjs.org/docs/app/guides/static-exports)
- [Next.js metadata](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
- [TanStack Query invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [Cloudflare Next.js deployment](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
