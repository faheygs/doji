# Testing and releases

This is the operational entry point, not blanket permission to deploy. Read
[Security and access](SECURITY_AND_ACCESS.md), [Current state](CURRENT_STATE_AND_GAPS.md)
and the release record for the exact surface. Record checks against a specific
source commit/artifact; old checked boxes are historical evidence only.

October 2 hosted qualification is complete for commit
`316037270239e37961a5948e853197aea3f4d6dd` on
`codex/quality-gates-expo-patches`: [all three quality jobs passed](https://github.com/faheygs/doji/actions/runs/37038471068).
This qualified source snapshot is now on `main`, not a production release. The hosted
coverage artifact verifies all 17 areas, 437 source files, 4,514 Jest tests and
652 browser scenarios; no Jest/browser tests failed or were skipped, and no
browser scenario was flaky. Database replay and source-only reproducibility
also passed. Details and remaining acceptance boundaries are below.

The [main push run](https://github.com/faheygs/doji/actions/runs/37040939610)
also passed all three jobs. Main now requires pull requests, up-to-date branches
and all three GitHub Actions checks, including for administrators; force pushes
and deletion are blocked. See the publishable [test suite handoff](TEST_SUITE_HANDOFF.md)
for fresh-clone commands and separate release acceptance gates. Historical run
entries below retain the state and counts at their recorded times.

## Test layers

| Layer | Entry points | What it establishes / does not establish |
| --- | --- | --- |
| Mobile unit/component | `npm test -- --runInBand` | Mocked logic, state and component regressions; not native-device delivery |
| Root static | `npm run typecheck`, `npm run lint`, `npm run check:size` | Separate strict app/fixture/converted-portal/tooling checks, migration inventory and style/source-size contracts; not backend authorization |
| Admin client/health | `npm run test:admin-auth`, `npm run test:admin-health`, `node website/admin-portal/queue-health.test.mts` | Local client/session and health interpretation logic |
| Admin browser | `npm run test:admin-e2e` | Built artifact with browser mocks, layout and interaction; prerequisites in local guide |
| Employee isolation | `scripts/test-employee-*.mts`, `scripts/test-workos-*.mts`, `scripts/test-portal-identity-*.mts` | Select exact harness after reviewing network/fixture dependencies; not a safe bulk-run glob |
| Business/safety | `scripts/test-business-*.mts`, `scripts/test-safety-*.mts`, associated SQL | Artifact/client, local DB, concurrency and workflow tests have different prerequisites |
| Local DB | `npm run test:database`, `npm run test:database:repro` | Fresh migration replay, real grants/RLS, transaction/concurrency/rollback and source-only reproducibility; see [local database guide](LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md#current-repeatable-database-tests) |
| Worker | `npm ci` then `npm run typecheck` in `infra/doji-orchestrator` | Separate package/type check; does not deploy or schedule an event |
| Edge | Deno checks and handler-specific tests | Imported code/type/runtime behavior; packaging must also be checked |
| Capacity models | `npm run test:fanout-model`, `npm run test:social-fanout-model`, `npm run test:scale-bursts` | Local modeled workload, not a 100,000-user live load test |
| Native/device | [QA checklist](QA_CHECKLIST.md), exact release record | Auth, push, foreground, camera, navigation and real user experience on the candidate |

The full coverage and database jobs are separate from root `npm test`. The
database runner's explicit allowlist no longer needs a retained sandbox. Other
historical harnesses can still depend on retained files or platform runtimes. Inspect
imports, environment resolution, URLs and write operations before running them.
No production load tests or synthetic member actions are authorized by this guide.

## TypeScript source migration

Owner-approved October 4 MDT / October 5 UTC; **maintained-source conversion complete**.
The migration covers employee/business identity runtime, browser sources,
build/browser-test configurations, coverage pipeline, isolated database harness,
regression tests, operational scripts and local load tools.
The explicit Git inventory started at 371 maintained JavaScript files: **371 are
converted and zero remain**. It includes existing tests and operational scripts; dependencies,
ignored SDK/build artifacts and generated site bundles are not migration targets.
SQL, HTML/CSS and native platform languages keep their required formats.

`npm run typecheck` now also executes `typecheck:mocks`, `typecheck:portals`, `typecheck:tooling`, `typecheck:website`
and `check:typescript-migration`. The latter rejects newly introduced JavaScript,
stale/duplicate legacy inventory entries, and `.mts`/`.cts` modules omitted from
the strict projects. It never silently grows its baseline. New converted modules
also reject explicit `any`, `@ts-ignore` and `@ts-nocheck` in lint. The empty
legacy-source baseline prevents maintained JavaScript from being reintroduced.
Generated artifacts are narrowly declared and checked, not permission to add
untyped source or omit modules from strict checking.

These Node entry points use the installed Node 24 runtime's native type stripping
and explicit extensions. Node execution itself does **not** typecheck: the strict
compiler projects are a separate required gate. Browser/deployed artifacts still
need their correct build pipeline; do not serve raw TypeScript to browsers or
rename generated JavaScript assets. No dependency/runtime upgrade was required.

The ESLint config is now `eslint.config.mts`; the root lint command supplies
ESLint's native TypeScript-config flag on the pinned Node 24 runtime, with no
additional config-loader dependency. Edge functions declare their existing ESM
module format in `supabase/functions/package.json`, so Node-based strict test
imports agree with their Deno import/export syntax; no deployed function changes.
Both classic browser scripts and ESM browser modules are emitted by
`website/browser-source.mts`, with their existing public `.js` URLs preserved.
Playwright configuration files remain strictly checked tooling, not shipped
browser source or entries in the production-coverage denominator.
The business prototype also uses the shared typed theme initializer instead of
inline JavaScript. Fresh checkouts and CI install the locked identity and
orchestrator packages before root checks, because those checks use their runtime
types and browser compiler. The mobile archive allowlist retains the renamed
`babel.config.cts` and typed local plugins; no new EAS job was run for this migration.

Root Babel and Jest transform/coverage configuration use checked `.cts` sources.
Jest 29's CLI does not accept a `.cts` config filename, so the coverage runner
loads it with Node and passes the same options through Jest's supported JSON
configuration argument. No extra loader dependency is used. Synthetic runtime
fixtures declare their existing ESM format in `scripts/fixtures/package.json`.

The dependency-free EAS preinstall artifact `scripts/verify-build-env.mjs` is
generated from `scripts/verify-build-env.mts`; it is not independently maintained.
Regenerate with `node scripts/build-bootstrap.mts --write` after editing the
source. The vendored decoder's `vendor/decode-uri-component-compat/index.cjs`
is likewise generated from `index.cts`; regenerate it with
`node scripts/build-compat.mts --write`. The migration gate compares exact
compiler output for both artifacts, and tests verify missing/invalid synthetic
build settings fail without printing secrets. Historical release/capture/verification scripts are
typechecked only; do not execute them as a migration test or assume their old
release-specific authority applies today.

Portal coverage measures maintained `.mts` sources, including the portal controller,
not the generated JavaScript bundles.
The offline hook and zero-hit inventory use the same whitespace-preserving type
stripper before instrumentation, retaining source locations and all four coverage
metrics. Thresholds remain 90% per area; converting a file must not remove it from
coverage. Pure declaration files are not executable coverage targets.

The local rerun uncovered two stale test assumptions from earlier releases: the
admin coverage builder pinned an obsolete output filename, and a relay source
test still expected the pre-repair timeout/telemetry name. Coverage now derives
one validated local bundle path from the generated HTML, and the source test
asserts the documented five-second first request / twenty-second recovery budget.
No relay runtime change was made. Downloaded SDK sources under `.artifacts` are
excluded from lint; maintained application sources are not excluded.
The final controller rename also required updating the explicit shared-website
coverage path and two source-contract test paths. A regression assertion now
requires `website/portal.mts` in the shared-website area; it is not excluded or
silently replaced by generated-bundle coverage.

Source migration is separate from the unfinished business identity lifecycle
and production cutover. Tests, coverage and packaging must still qualify each
future release artifact. The conversion does not itself require a mobile build,
account migration or production deployment. Historical scripts retain their
release-specific assertions; typechecking them does not requalify those recipes
for execution against current production or the changed workspace.

Earlier verified local snapshot completed **October 5, 2026 at 01:41:36 UTC** (October 4
MDT), Node 24.18.0 and installed Chrome: all six coverage stages exited zero.
**241 Jest suites / 4,640 tests, 25 offline suites and 655 browser scenarios
passed**. No skipped Jest/browser tests, unexpected browser failures or flaky
browser scenarios. The 444-source-file inventory has no missing reports; all
17 areas meet 90% statements, branches, functions and lines. The lowest metric
is shared-website branches at 90.23%; portal-identity branches are 92.20%.

Strict app/fixture/portal/tooling checks, seven migration/bundle guard tests,
lint, source-size and handbook checks also pass. In-memory esbuild checks pass
for the employee runtime/Pages entry and business HTTP/browser entry points.
These are local dirty-workspace results, not new hosted CI, device/provider
acceptance, Deno deployment qualification or a business identity cutover.
Evidence: `test-results/coverage/current/{run-status,areas,jest-results,
offline-results,browser-tests}.json`. The fresh complete run replaced the earlier
failed attempt; it did not merge that attempt's partial test results.

The later complete local run finished **October 5 at 05:35:53 UTC**: all six
stages passed, **240 Jest suites / 4,622 tests, 27 offline suites and 684 browser
scenarios**. All 446 runtime sources have coverage; all 17 areas still meet all
four 90% thresholds (admin branches 90.52%, shared-website branches 90.23%). This
snapshot includes the converted admin client, editorial, business review/privacy,
safety review and employee-setup runtimes. Subsequent migration batches need
fresh qualification; this is not hosted CI or production acceptance.

**Final TypeScript migration qualification: October 5, 2026 at 08:06:58 UTC.**
All six stages of a clean local coverage run exited zero on Node 24.18.0 with
installed Chrome: **240 Jest suites / 4,622 tests, 27 offline suites and 697
browser scenarios passed**. No skipped Jest/browser tests, unexpected browser
failures or flaky scenarios. All **446 runtime sources** have reports, and all
**17/17 areas meet 90% statements, branches, functions and lines**. The lowest
metric is shared-website branches at **90.19%**; admin branches are **90.52%**.
The fresh run replaced previous failed/partial output; no failed test was waived.
Additional regressions cover shared-select validation, stale draft preservation,
dialog backdrop boundaries, legacy priorities/appeals and TypeScript coverage
capture across reloads. Thresholds and runtime coverage scope were not reduced.

Root strict typechecking (including mocks, fixtures, portals, website and tooling),
the zero-maintained-JavaScript guard, lint, source-size, static website and handbook
checks passed. Separate URI decoder/browser compilation/admin-client tests,
bootstrap/archive guards, shared theme tests and five database harness safety
tests passed. Full database replay/provider/device tests and historical release
scripts were **not** rerun or executed for this final source-conversion pass.
The synthetic local business-auth registration fixture now supplies the existing
required US country field; its isolated database/provider harness was typechecked,
not run against live accounts.

Evidence remains in `test-results/coverage/current/{run-status,areas,jest-results,
offline-results,browser-tests}.json`. This is local dirty-workspace qualification,
not a new hosted CI run, deployment, store build or account cutover. The final
source inventory is **371/371 converted, zero maintained JavaScript files**;
only the two compiler-verified artifacts described above remain. Android release
monitoring remains paused at the owner's request.

## Local announcement permission candidate

The owner approved local preparation and testing on October 2, not production
deployment. `docs/drafts/announcement_member_execute_v1.sql` removes only the
explicit anonymous EXECUTE grants on the two member announcement RPCs. Their
internal authentication checks already deny anonymous actions. The existing
security-definer allowlist test requires this narrower database boundary; its
assertion is unchanged. No announcement, member session or live setting changes.

`scripts/database/announcement-permissions.mts`, run by
`node scripts/database/clean-room.mts`, compares every public function definition
and canonical ACL before/after the candidate, rehearses repeat application and
exact ACL restoration using the companion rollback SQL, and tests real anonymous
denial, member claim/CTA/dismissal, cross-member receipt protection and the
intentional anonymous mobile release-policy read. Synthetic announcement rows
and receipts roll back. The candidate remains outside the deployable migration
ledger until a separately approved release.

Verified October 2 at 15:06 UTC: the clean-room run exited zero after replaying
288 migrations, checking the candidate and rollback, and passing all three
pgTAP suites plus the included member/editorial/business/identity and five
concurrency/atomicity checks. Cleanup reported no error. The two focused mobile
announcement/system-prompt Jest suites also passed all 52 tests. These results
do not extend beyond the harness's explicit suite and schema list.

The [local database guide](LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md#current-repeatable-database-tests)
documents preparation, isolation, later-schema test overlays and a second run
from a source-only copy. Results go to `test-results/database/clean-room.json`
and `reproducibility.json`. These checks do not establish live schema parity,
raw Supabase CLI replay, hosted CI success or native/provider qualification.

Before any production release, obtain explicit authorization, re-read both RPC
ACLs and definitions, capture rollback evidence, verify no privilege drift, and
apply only the two revokes atomically. The local rollback SQL restores the old
excess grants; do not run it blindly against a different live permission state.

## Required coverage

Previous complete rerun (before later runtime work and the TypeScript migration
snapshot above): **October 2, 2026 at 15:50 UTC**, Node 24.18.0 with the
documented installed-Chrome option. All 233 Jest suites / 4,514 tests, 23 offline
scripts and 652 browser scenarios passed. All six coverage stages exited zero;
17/17 areas meet all four 90% minimums with the same 437-source-file inventory.
The lowest area/metric is shared website branches at 90.30%. No skipped Jest or
browser tests are claimed as passing. An earlier attempt lacked bundled Chromium
and failed; the new browser preflight prevents repeating hundreds of launch
failures for that missing prerequisite. The complete successful rerun replaced
that failed report rather than merging partial results.

The separate final source-only database run completed at 15:47 UTC; see the
[database guide](LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md#current-repeatable-database-tests).
Root and orchestrator type checks, lint, fanout model and handbook link checks
also passed locally. The [source-size exceptions](#existing-source-size-blocker)
were subsequently approved by the owner for the 15 existing oversized files;
their current sizes are frozen and the size check now passes locally. This does
not establish that the entire hosted CI workflow is green.

The owner requires at least **90% statements, branches, functions and lines in
every code area**, not a blended repository average. All 17 areas meet this
target in the fresh local run documented below; this is not a production guarantee.
The executable policy is [coverage-policy.mts](../coverage-policy.mts): mobile
screens, components, hooks, libraries, contexts, stores, utilities, constants,
command contracts, admin, business, public safety, employee setup, shared web,
portal identity, orchestrator and Edge functions each have independent budgets.

Run `npm run test:coverage` with Node 24 and a locally installed Playwright
Chromium (`npx playwright install chromium`). On a machine with Chrome already
installed, set `DOJI_TEST_BROWSER_CHANNEL=chrome` for that command. The runner:

1. Verifies the selected local browser is installed, failing early with setup
   instructions if unavailable. Replaces only `test-results/coverage/current`, then runs the full Jest suite
   with all application source included, even files that no test imports.
2. Runs an explicit allowlist of offline identity tests with real network access
   disabled. Never substitute a `scripts/test-*` glob.
3. Builds instrumented local admin, business and public safety artifacts using
   synthetic credentials. Runs browser scenarios with external hosts blocked or
   explicitly mocked. No private `.env.local` file or live login is required.
4. Merges compatible Istanbul counters, emits HTML/LCOV/JSON and checks every
   named area's exact counts against all four 90% thresholds. Missing reports,
   overlapping areas, test failures and instrumentation failures cannot pass.

Open `test-results/coverage/current/index.html` for the merged report.
`areas.json` lists the independent budgets; `run-status.json` records test,
instrumentation and gate exit statuses. `offline-results.json` retains each
allowlisted script's status and bounded failure output; a long console transcript
is not the only failure evidence. `npm run test:coverage:report` rechecks
the retained report only; it does **not** rerun tests or certify freshness.
Coverage artifacts are ignored by Git. Tests and coverage tools belong in the
reviewed handoff commit, not the generated local site.

The current admin browser project is explicitly named `admin-legacy-contracts`:
its synthetic Supabase employee flows test retained UI/rollback contracts, not
the full live WorkOS sign-in. WorkOS cryptography, admission, HTTP/session,
resource authorization and provider failures are exercised separately offline.
Do not equate either with a real owner onboarding/reset journey. JavaScript
coverage also does not measure SQL/RLS correctness, native push display, camera
permissions, platform background behavior or production capacity. These require
their own integration/device gates. The separate real-DB job below now covers
its explicit SQL allowlist; native and hosted-provider qualification remain open.

Coverage configuration follows [Jest 29.7 source inclusion](https://jestjs.io/docs/29.7/configuration#collectcoveragefrom-array).
Browser scenarios run instrumented source to retain statements/functions/branches,
rather than claiming line-only browser execution proves all four metrics.
See [Playwright coverage](https://playwright.dev/docs/api/class-coverage) for the
limits of its native Chromium coverage API.

`jest.transform.cts` extends Expo's existing Jest transform with the pinned
development-only `babel-plugin-dynamic-import-node` dependency. This follows
[Jest's dynamic-import guidance](https://jestjs.io/docs/29.7/jest-object#jestdomockmodulename-factory-options)
so real lazy native-module loading can execute inside the CommonJS test sandbox.
The Metro/native `babel.config.cts` is unchanged. The offline preload also resolves
extensionless `.ts` sibling imports inside the Worker source directory only;
this lets the employee transport use its actual route mapper in Node tests.

### Verified local snapshot — October 2, 2026

Fresh combined run completed at `2026-10-02T09:28:27.266Z` (October 2 MDT) on Node
`24.18.0`, using installed Chrome and `node scripts/run-coverage.cjs`:
233 Jest suites / 4,514 tests passed; all 23 explicitly selected offline scripts
passed; 652 browser scenarios passed, with no skipped, failed or flaky scenarios.
All six stages (Jest, offline, browser preparation, browser tests, merge and area
gate) exited **0**, as did the overall command. This is a dirty-worktree snapshot,
not a released commit or hosted CI result. The complete run replaced the prior
report; these results are not assembled from separate focused test runs.

The latest increment adds 2,400 Jest tests and 39 browser scenarios over the
preceding 2,114-test / 613-scenario snapshot. It changes tests and documentation
only: no runtime implementation, production service, deployment, coverage policy,
source inventory or exclusion was changed in this increment.

Percentages below include unexecuted source. All four columns must reach 90;
**17 of the 17 areas pass**, covering the unchanged inventory of 437 source files
with no missing files. These are independent area totals, not a promise that every
individual file has 90% coverage. The command-contract area is a small
allowlist, not evidence that every server command is tested. Its empty branch and
function denominators are reported as 100 by Istanbul.

| Area | Statements % | Branches % | Functions % | Lines % |
| --- | ---: | ---: | ---: | ---: |
| mobile-screens | 97.59 | 93.83 | 98.82 | 98.73 |
| mobile-components | 96.94 | 93.44 | 97.35 | 98.10 |
| mobile-hooks | 95.96 | 91.62 | 99.17 | 97.91 |
| mobile-library | 96.69 | 92.55 | 98.12 | 98.33 |
| mobile-contexts | 99.41 | 93.93 | 100 | 100 |
| mobile-stores | 100 | 96.77 | 100 | 100 |
| mobile-utilities | 100 | 97.52 | 100 | 100 |
| mobile-constants | 100 | 100 | 100 | 100 |
| member-command-contracts | 100 | 100 | 100 | 100 |
| admin-portal | 93.81 | 90.66 | 96.50 | 97.53 |
| business-portal | 96.15 | 92.13 | 92.41 | 97.47 |
| safety-intake | 98.28 | 93.24 | 100 | 98.01 |
| employee-setup | 99.04 | 98.43 | 100 | 98.49 |
| shared-website | 94.59 | 90.30 | 97.19 | 97.48 |
| portal-identity | 96.21 | 91.60 | 96.89 | 97.98 |
| orchestrator | 97.54 | 95.56 | 97.18 | 97.84 |
| edge-functions | 98.08 | 96.87 | 97.32 | 98.89 |

The lowest area metric is shared-website branches at 90.30%. Keep the gate strict:
new branches can reduce this margin even when existing tests still pass.

New regression coverage executes real mobile screens, components and hooks;
Worker alarms, command/portal gateways, JWT verification and provider boundaries;
and Edge delivery, moderation, safety, business authentication and maintenance
handlers. Browser additions exercise late responses after lock, coalesced
foreground reads, historical/malformed records, exact linked review targets,
employee MFA failures and persisted business drafts. Native, provider and
database boundaries use synthetic fixtures; no live actions or sends are needed.

The execution-test TypeScript files pass focused type checks and ESLint. Their
formatting checks pass; the expanded browser specs pass syntax checks, with
existing compact formatting retained in the safety-removal spec. Handbook link
validation passes. The 19 Deno/runtime-fixture diagnostics present during this
coverage run were subsequently fixed on October 2 using separate strict runtime
projects; see the type-checking notes below. This did not change the coverage
policy, inventory or runtime application code.

### Integration work beyond code coverage

Keep the 90% policy and complete source inventory intact. High measured coverage
does not replace these independent acceptance gates:

1. **Database:** replayable current-schema SQL/RLS fixtures, real grants,
   transaction rollback, idempotency and concurrent-command checks in an isolated
   database. Mocked database responses do not prove database authorization.
2. **Native devices:** actual push receipt/display, camera permissions, keyboard
   behavior, foreground/background transitions and recovery on candidate Android
   and iOS builds. Native-module mocks do not establish handset behavior.
3. **Provider and account journeys:** real WorkOS invitation, MFA, reset and
   session-expiry journeys, plus same-email account separation and business
   onboarding/corrections against the approved deployed contracts. Offline
   cryptography/session tests and browser fixtures do not prove live availability.
4. **Capacity:** approved production-like workload and provider/database headroom
   measurements. Neither coverage nor local fanout models prove 100,000-user
   readiness. Do not run live load tests or incur costs under this guide.

### Historical coverage increments

The following entries retain earlier evidence; their counts and remaining gaps
describe those runs, not the latest verified snapshot above.

The earlier regression tests exercise actual poll/post mutation hooks, realtime
invalidation, reconnect/foreground reconciliation, and account-state transitions.
They cover late responses after account switching, local-only sign-out, failed
push cleanup, duplicate operations and recoverable errors. The contextual-help
browser regression also exposed a focus-generated scroll dismissal bug; the local
portal fix repositions the open help instead of immediately hiding it. These are
local source changes, not a deployment or proof of complete product coverage.

The follow-up test-only increment adds 171 tests and exercises all six mobile
context providers, including
late theme-cache responses, ownership resolution, dialog navigation cleanup,
duplicate report opening and shared notification state. Upload tests execute the
actual reservation/resume wrappers with synthetic storage, file and TUS boundaries;
they do not upload media or prove native provider behavior. Library tests cover
friendship-cache rollback, badge thresholds, safe error copy, saved suggestion
format labels and bounded telemetry reporting. No production implementation or
coverage exclusion changed in this increment. The nine new test files pass a
focused TypeScript diagnostic check with Jest types; that is not a passing root
or repository-wide test typecheck.

The first follow-up combined run passed all 1,544 Jest tests but failed two of
261 browser scenarios. The privacy pagination test could resolve the applications
pager before the privacy queue mounted; it now scopes the same Next page action
to `#privacyQueue`. A 390px light-theme layout assertion reported 674px body
width once. That overflow did not recur in an isolated run or eight repeated
runs, so its cause is **not confirmed fixed**. The original width limit remains
unchanged, and failure diagnostics now record the view and overflowing elements.
Neither browser scenario is skipped or retried automatically.
Later combined runs passed both scenarios, including the fresh run above;
this does not erase the earlier intermittent overflow observation.

The preceding test-only increment adds 70 Jest tests and 52 offline adapter tests
for native push registration and receipt handling,
permission errors, Expo fallback outages, sign-out races, exact-subject OS
notification dismissal, realtime retry exhaustion and channel cleanup, and
audience-scoped engagement refresh. The real notification loader is tested too.
Employee transport and session-store tests execute their actual adapters with
synthetic HTTP/SQL boundaries: MFA, expiry, CSRF, permission denial, late logout,
conditional flow consumption, lease conflicts and revocation cleanup. These do
not prove database transaction semantics, WorkOS availability or phone delivery.
No application implementation, deployment or coverage exclusion changed.
The five new Jest files pass ESLint and a focused TypeScript diagnostic check;
this does not resolve the separate root TypeScript fixture errors below.

The preceding test-only increment adds a net 212 Jest tests and expands actual
library behavior for signed-media
expiry, bounded cache eviction, failed authorization/transforms, image preparation
and cleanup, native release identification, safe public-profile presentation,
account-scoped local history, session restoration and navigation fallbacks.
Rendered blocked-user and friend-request screens exercise both themes, exact
mutation targets, pending-action guards, pagination, Back navigation and inline
unblock recovery. Shared controls cover search focus/clear, keyboard behavior,
form feedback precedence and screen-reader error announcements. The old button
tests that duplicated implementation logic have been replaced by rendered
interaction tests. Native, router and query/mutation boundaries are synthetic;
no real accounts, provider requests or moderation actions are used.

Both newly exercised screens and the shared `Button`, `Input`, `AppTextInput`,
`SearchField` and `InlineFeedback` components individually exceed 90% on all four
metrics. The screen and component areas as a whole still fall far short of 90%.
No production implementation, coverage exclusions or thresholds changed in this
increment. The first combined attempt could not spawn the browser in the sandbox;
the fresh local-only run above completed with Chrome and external hosts blocked.

The nine added or updated test files pass ESLint, formatting and a focused
TypeScript diagnostic check with Jest types. The root TypeScript check was also
rerun and still fails on the Deno/Edge fixture imports and runtime types described
below; the focused check is not a substitute for that repository-wide gate.

The preceding local follow-up adds 70 Jest tests: 55 real social-hook tests and 15
rendered-screen regressions. The screen tests first reproduced failed reads
masquerading as empty lists, cached identities remaining visible after access
denial, repeated scroll retries and silent friendship-response failures. The two
screens now reuse the shared read-recovery feedback and cache-display policy;
failed friendship actions also show persistent inline feedback. Explicit retry
does not cancel an active read and retries the failed next page when applicable.

Hook tests exercise actual TanStack clients, RPC cursor mapping, safe requester
fields, account-specific read keys, cancellation, atomic command payloads,
idempotency-key reuse, optimistic removal and rollback. Auth and transports are
synthetic; invalidation calls are asserted at their existing boundary. These
tests do not prove server permissions, concurrent database semantics, native
behavior or production availability. No hook, RPC, query-key, backend, provider,
portal, deployment, exclusion or coverage-threshold change is included. The mobile
screen repairs remain local for a future reviewed build.

Both social screens and both hook modules now individually exceed 90% on all
four metrics. They have 100% line/function coverage; branches are 97.56% for friend
requests, 97.36% for blocked users, 96.87% for the friend-request hooks and 90.47%
for the block hooks. This is not 90% coverage of the whole screen or hook area.
The four changed TypeScript files pass ESLint, formatting and a focused TypeScript
check including their dependencies. Root TypeScript still reports 19 existing
runtime-fixture diagnostics. An initial combined run exposed a test harness that
passed rerender props into the hook's `enabled` argument; the harness was fixed
and the complete pipeline rerun rather than retaining a partially passing report.
That combined run passed Jest and browser checks but recorded an offline-stage
failure. All 13 offline scripts passed when isolated afterward; the original
failure detail was lost to console truncation, so its cause is **not confirmed
fixed**. The offline runner now retains per-script status and up to 24,000
characters of failure output, with no automatic retries or weakened assertions.
This preserves diagnostics if the failure recurs; a later passing run does not
erase that observation.

The preceding local increment adds 92 Jest tests: 43 real shop-hook tests and 49
rendered economy-component tests. Tests reproduced two client bugs before repair:
late purchase/equip callbacks could overwrite a different member's profile, and
failed purchases could retain optimistic ownership when the prior cache was
absent. The hooks now use account-scoped mutation keys and fresh-account/profile
guards, with exact cache removal for the absent-cache rollback. Account-switch
tests include rerenders so TanStack cannot silently rebind pending callbacks to
the new member. Signed-out actions and manual ownership refresh make no request.

The tests also cover bounded reads, authoritative server balances, unchanged
atomic command payloads, optimistic theme/frame/title changes, failure rollback,
affordability, pending-action guards, cancellation, inline errors, light/dark
catalogue states, preview fallbacks, live balance gains and timer cleanup.
Shared controls, avatars and economy components are real; only the native sheet
container and auth/provider boundaries are replaced. Reanimated uses its existing
official Jest mock. These tests do not prove native animation/keyboard behavior,
SQL authorization, server concurrency or production performance. The whole shop
screen and simultaneous overlapping purchases remain separate integration gaps.
Server commands, prices, economy rules, query roots, coverage exclusions and
thresholds are unchanged. The client fixes remain local for a reviewed build.

All seven modules in `components/economy` now have 100% measured statements,
branches, functions and lines. The shop hook has 98.05% statements, 93.93%
branches, 100% functions and 98.66% lines; the gain-pulse hook has 100% on all
metrics except branches at 90.90%, and the balance hook has 100% on all four.
These are module-level results, not a passing budget for all components or hooks.

The three new test files and shop hook pass ESLint, formatting and a focused
TypeScript check including dependencies. Root TypeScript still reports the same
19 existing runtime-fixture diagnostics; this is not an all-green static gate.

The preceding local increment adds 76 Jest tests: 71 actual comment/reaction-hook
tests and five engagement-read identity regressions. Four older reaction tests
now import the actual helper instead of testing a copied implementation that
incorrectly modeled multiple simultaneous reactions. The tests use real TanStack
clients, cache transforms, content validation and mutation lifecycles; auth,
command transport and reconciliation transport are synthetic boundaries.

Tests reproduced stale-session defects before repair: old mutation callbacks
could issue commands or restore cleared caches after account switches; delayed
reaction refreshes could run after logout; in-flight engagement snapshots could
patch the next account or be shared between members. Account-scoped mutation
keys, fresh-member guards, viewer-scoped read deduplication and post-read checks
now protect those paths. Invalid comment bodies are checked before optimistic
insertion, and optimistic author details require a matching profile ID.

Coverage includes signed-out actions, logout and switch rerenders, exact atomic
payloads, stable retry keys, failed-write rollback, nested replies, unknown/empty
caches, nonnegative counts, Friends/global reaction totals, timer debouncing and
refresh failure after a committed command. All three hook modules and the
engagement helper exceed 90% on every metric, with 100% lines/functions. No
server command, SQL/RLS, permission, portal, member-authentication, polling or
coverage-policy change is included. Source fixes remain local. Simultaneously
overlapping writes, complete rendered comment/reaction journeys, native-device
behavior and production performance remain separate acceptance gaps.

All eight changed TypeScript files pass focused type checking with dependencies
and ESLint. Old engagement fixtures were corrected to the current post type and
reaction representation; no test-only type suppression was added. Formatting
and handbook-link checks pass. Root TypeScript remains a separate failing gate.

The preceding test-only increment adds 79 browser scenarios and 184 offline tests.
Employee setup exercises rejected sessions, MFA enrollment/verification failures,
expired setup, duplicate actions and safe return-link handling. Public safety
tests cover disabled configuration, failed or expired CAPTCHA, malformed receipts,
ambiguous retries, duplicate submission guards, private status lookup failures
and receipt downloads. Business controls cover MFA cancellation and late results,
single-use CAPTCHA proofs and realtime SDK loading/retry failures.

Offline tests now exercise both actual employee and business session stores,
signed business registration admission, restricted storage signing, the business
browser identity client/provider, employee runtime/Pages composition and retained
business application/controller/realtime contracts. Three existing, reviewed
offline suites were also added to the explicit coverage allowlist. The preload
continues to block real network access; SQL, provider and browser transport
boundaries are synthetic. These checks do not establish real provider onboarding,
database transaction semantics, native-device behavior or production capacity.

No application implementation, deployment, coverage threshold or source exclusion
changed in this increment. All 13 changed JavaScript test/configuration files pass
Node syntax and formatting checks. The root TypeScript gate was not rerun for
this JavaScript-only increment; its previously recorded fixture errors remain
unresolved.

The preceding test-only increment adds 200 offline tests and 50 browser scenarios.
The actual admin client is tested for independent employee transport delegation,
exact command payloads, legacy MFA and account-realm rejection, session expiry,
refresh coalescing, permission changes, evidence URL authorization, realtime
recovery and late responses after local session cleanup. Health-model tests cover
latency boundaries, insufficient samples, invalid measurements, unavailable
Sentry/history reads and incomplete or overdue review queues. They verify that
missing telemetry cannot be presented as an all-clear.

Browser tests exercise the real business-review and safety-intake modules with
synthetic client boundaries: malformed queue responses, bounded paging, reviewed
content identity, mismatched save receipts, coalesced reconciliation and access
loss during reads or writes. Shared-dropdown tests cover keyboard and pointer
selection, disabled options, focus restoration, validation, dynamic options and
theme storage failures. Component fixtures use the public loopback artifact to
load standalone modules; the existing full admin-artifact journeys still run
separately. Neither fixture proves a complete live WorkOS onboarding journey or
database authorization.

All five changed JavaScript test/configuration files pass syntax and formatting
checks. No production source, source inventory, coverage exclusion or threshold
changed. The known root TypeScript fixture errors remain a separate unresolved
gate; this JavaScript-only increment does not claim to repair them.

The preceding increment adds 68 browser tests against the shared portal runtime.
Local business-preview tests cover campaign dates and required fields, storage
failure and explicit retry, poll/Would You Rather choices, answer-rule editing,
stale draft saves, onboarding validation, logo limits, theme/navigation behavior
and reset isolation. These browser-only previews are not production business
signup, publishing or measured campaign delivery.

Administrator tests exercise content-state and evidence rendering, workflow
history separated from evidence access, decision and delivery summaries,
preservation phases, malformed media manifests and failed protected previews.
Archive tests verify exact cursor contracts, bounded pages, duplicate suppression,
retry without losing the current page and local Previous navigation. All records,
media and provider responses are synthetic; no moderation action is performed
against real content.

This increment also repairs coverage collection across explicit reloads. The old
document's asynchronous `pagehide` snapshot could be lost during navigation. The
three existing reload journeys now await `reloadWithCoverage`, which captures the
old document before reloading. A harness regression verifies that repeated
captures replace the same document and that both documents survive a reload.
New tests that reload a page should use this helper; tests navigating away from
an already exercised document should await `captureBrowserCoverage` first.
Some additional coverage therefore reflects retained measurements from existing
tests, not newly tested behavior. Source inventory and the 90% thresholds remain
unchanged.

That preceding combined run raised shared-website coverage from 77.16% to 85.13%
statements, 59.67% to 69.87% branches, 78.07% to 86.66% functions and 83.75% to
89.90% lines. At that snapshot the area failed all four 90% thresholds. The seven changed
JavaScript files pass Node syntax checks; the coverage fixture and four new test
files pass formatting checks. Handbook validation passes. No production source,
deployment or provider configuration changed in this increment. Root TypeScript
was not rerun; its previously recorded runtime-fixture errors remain unresolved.

The preceding test-only increment adds 67 browser regressions. Twenty-seven exercise
live-mode health rendering: authoritative event timestamps, release-policy
display, missing Sentry/health/history reads, invalid queue totals and the
difference between issue-lifetime overlap and confirmed event-window failures.
Fourteen cover operator-directory states and permissions, exact audited role
commands, no-work claim behavior and bounded audit exports, including spreadsheet
formula escaping and truncation notices. All service responses are synthetic;
no real permissions, events, moderation records or release policies are changed.

Twenty-six cover retained local-preview behavior: queue-specific decisions,
required rationale, exact local campaign updates, priority claiming, record
search, drawer keyboard navigation, profile fallbacks, storage reconciliation,
reload persistence and unrelated-account storage preservation. These tests switch
only the packaged fixture's mode configuration. They are not evidence of live
business publishing, production moderation or WorkOS account isolation. The
retained announcement preview has no creation control; its read-only test does
not expose dormant form handlers to increase coverage.

That combined run raised shared-website statements from 85.13% to 90.02%, branches
from 69.87% to 79.49%, functions from 86.66% to 95.43% and lines from 89.90% to
93.28%. Branches remain below target, so this is still 11 passing areas, not 12.
All 525 browser scenarios, 2,064 Jest tests and 23 offline scripts passed in that
run; only the coverage gate failed. Missing branches remained counted.

The three new JavaScript test files pass syntax and formatting checks. Application
source, source inventory, thresholds, exclusions and deployment configuration are
unchanged. Root TypeScript was not rerun; the known runtime-fixture diagnostics
remain an independent unresolved gate.

The preceding test-only increment adds 69 browser regressions against the actual
shared portal runtime. Twenty-two cover follow-up eligibility, reopening and
reclosing without changing enforcement, blocked review states, write-capability
boundaries, stable retry keys, claim/release/priority commands and a successful
triage write followed by a failed refresh. The last case verifies that further
decisions are blocked until authoritative state can be reloaded.

Thirty cover ordinary and restricted moderation: exact atomic payloads, distinct
content/account consequences, warning versus suspension, one-day and seven-day
restrictions, emergency escalation, missing policy/severity/notice validation,
supported evidence types and another reviewer's assignment. Dismissal must not
inherit a previously selected restriction or suspension.

Seventeen cover independent appeal decisions, audited super-admin overrides,
permission and closed-appeal blockers, off-queue audit lookup, optional archive
metadata, mismatched appeal identities, explicit retry and late responses after
closing the audit modal. These are synthetic browser/client contracts, not
database authorization, actual enforcement, live WorkOS onboarding or proof of
appeal independence at the server. The three new test files pass syntax and
formatting checks. No runtime source, deployment, source inventory, coverage
threshold or exclusion changed. Root TypeScript was not rerun; its known fixture
diagnostics remain open.

That combined run passed all 594 browser scenarios, 2,064 Jest tests and 23
offline scripts. Shared-website coverage rises from 90.02% to 93.16% statements,
79.49% to 84.57% branches, 95.43% to 95.96% functions and 93.28% to 96.88% lines.
Branches still miss 90%, so the area count remains 11 of 17. Preparation and
merging pass; the coverage gate alone exits 1. None of the six remaining areas
listed above have been excluded, and their thresholds remain unchanged.

The preceding test-only increment added 50 Jest tests and 19 browser regressions.
The actual read hooks cover missing identities, disabled queries, absent results,
numeric count contracts, bounded badge reads, native release-policy selection,
viewer-scoped profile enrichment, failed suggestion totals and cancellation of
late responses. Debounce tests exercise rescheduling and unmount cleanup; feed
presentation tests cover the exact scroll threshold, automatic reveal and feed
identity changes without carrying over pending rows or scroll state.

Browser tests cover capability-limited reads, missing legacy metadata, unsupported
policy suggestions, superseded queue successes and failures, explicit read
recovery and empty archive pages. They execute the real portal artifact with
synthetic backend responses. These checks do not establish database authorization,
actual moderation outcomes, native scroll behavior or live provider availability.

All three new test files pass ESLint and formatting; the browser file passes Node
syntax checking. Both TypeScript test files and their dependencies pass a focused
type check with Jest types. Root TypeScript was rerun and still reports the 19
existing Deno/runtime-fixture diagnostics. No runtime implementation, deployment,
source inventory, coverage threshold or exclusion changed in this increment.

That historical combined run passed all 2,114 Jest tests, 613 browser scenarios and
23 offline scripts. Shared-website branches rise from 84.57% to 85.90%; hook
coverage rises from 60.30% to 61.17% statements, 59.46% to 60.65% branches,
62.97% to 63.63% functions and 62.81% to 63.23% lines. The release-policy,
reactions-given-count, debounce and stable-feed-presentation hook modules now
measure 100% on all four metrics; that does not make the whole hook area pass.
At that point, eleven of 17 areas met every target. Preparation and merging passed;
only the coverage gate failed. An initial sandboxed attempt could not spawn the offline
workers or browser; the fresh local-only run used the required process permissions.

## Existing CI

[quality.yml](../.github/workflows/quality.yml) installs with Node 24 and runs Expo
Doctor, TypeScript, lint, source-size checks, Jest tests, fanout models and the
configured dependency audit. It separately checks the orchestrator package,
selected Edge code with Deno. Its separate database job explicitly prepares
versioned images, runs owned-container safety guards, the full clean-room suite
and source-only reproducibility, then uploads bounded evidence for seven days.
This replaces the non-reproducible raw CLI bootstrap; it does not claim the
previous `supabase db lint` step or a full hosted schema audit has been run.

The separate Node 24 coverage job runs the combined local-only suite above and
uploads bounded reports for seven days. **It fails if any area falls below any
of the four 90% minimums.** The reviewed branch now has a verified hosted pass;
this does not establish required-check enforcement or merge the workflow to main.

This is not automatic continuous deployment. It does not cover every portal,
identity, business, safety or provider integration harness. A green workflow does
not certify source/live schema parity or store availability. Add the relevant
manual gates and report skipped/unavailable checks in the release record.

### Existing source size blocker

The October 2 testing pass initially found 15 source-size violations. The owner
subsequently chose to defer runtime refactoring and explicitly approved file-size
exceptions for these exact files. `scripts/check-source-size.mts` now freezes
them at their current line counts, rather than excluding them from the check.
The default remains 240 lines; all other existing limits are unchanged.

| File | Previous limit | Approved cap and current lines |
| --- | ---: | ---: |
| `supabase/functions/_shared/business-auth.ts` | 240 | 391 |
| `supabase/functions/_shared/doji-email.ts` | 240 | 246 |
| `app/(app)/(tabs)/friends.tsx` | 256 | 264 |
| `app/(app)/(tabs)/rank.tsx` | 347 | 354 |
| `app/(app)/profile/account-status.tsx` | 240 | 292 |
| `components/feed/PostCommentsThread.tsx` | 893 | 899 |
| `components/feed/ReportSheet.tsx` | 240 | 435 |
| `components/notifications/NotificationSheet.tsx` | 582 | 589 |
| `infra/doji-orchestrator/src/operational-health.ts` | 240 | 243 |
| `infra/doji-orchestrator/src/portal-read.ts` | 240 | 629 |
| `lib/pushNotifications.ts` | 240 | 267 |
| `stores/useAuthStore.ts` | 240 | 253 |
| `supabase/functions/relay-domain-events/index.ts` | 591 | 879 |
| `supabase/functions/run-data-maintenance/index.ts` | 240 | 259 |
| `supabase/functions/send-admin-email/index.ts` | 240 | 422 |

The size check passes locally with these exceptions. In-memory boundary checks
verify that each approved cap passes, one additional line fails for every file,
and an unlisted file still fails above 240 lines. No runtime files, test
assertions, coverage thresholds or deployment settings changed. The 17/17
coverage and database results above remain the last full-suite evidence; the
exception-only change does not represent a new full-suite or hosted CI run.

Decomposition remains deferred maintenance, not a repaired runtime defect.
Future shared auth, Worker, realtime and notification refactoring still requires
the separate scope, member regression and rollback review in `AGENTS.md`.
No runtime refactor, production deployment or app build accompanies these caps.

### Runtime-specific type checks

The October 1 audit found 19 diagnostics because Expo's root project included
server-only fixtures and followed their imports into Deno modules. Excluding
`supabase/functions` alone could not prevent this: TypeScript still follows
[imports from included files](https://www.typescriptlang.org/tsconfig/#exclude).
The October 2 repair assigns `scripts/fixtures` to its own strict, no-emit
[project](../scripts/fixtures/tsconfig.json) and excludes that directory from
Expo's project. No fixture is left unchecked.

Run `npm ci` and `npm ci --prefix infra/portal-identity-candidate`, then
`npm run typecheck`. This runs the app check, the fixture check and compiler
regressions. `npm run typecheck:fixtures` runs only the latter two. The application
CI job now uses this combined command; hosted CI has not been verified here.

The fixture project accepts explicit `.ts` imports, uses the installed Supabase
Edge worker declarations and published `@types/pg` development dependency, and
maps the pinned Deno `npm:` hash import to the matching installed package types.
The minimal Deno declaration describes only the `serve` API these probes use;
it does not substitute for Deno's full runtime checks. The driver probe inspects
its internal TLS parameters through checked property narrowing, not `any` casts.
JavaScript dependencies remain outside `checkJs`, as before; this is not a new
claim of complete static checking for the portal's JavaScript implementation.

Local verification: the combined type-check command exits 0, all five retained
fixture entry points are included, and four intentionally invalid virtual
contracts are rejected (Deno handler, worker options, pg port and hash input).
The regression also verifies that the hash mapping matches the installed version.
The existing safety-email probe passes with mocked transport. Employee and media
probes pass in the installed Edge runtime with container networking disabled:
employee provider/signing calls remain zero, and media processing hashes the
synthetic 200 MiB total. No hosted messages, database writes or deployments occur.

These checks resolve the 19 reported diagnostics, not every independent static,
native-device, database or provider gate. Historical entries above retain the
failing state observed during their earlier runs.

### Hosted CI verification follow-up

October 2 follow-up: authenticated GitHub reads confirm `faheygs/doji` is public.
Its remote `main` is `94e5bf051155c39e7c1d9349f8d9c88fef31a460`; the latest
[hosted quality run](https://github.com/faheygs/doji/actions/runs/36038544953)
tested that September 24 revision, not the current working tree. Its database
job passed, but the application job stopped at Expo Doctor before type checks,
lint, source-size, Jest, audit and runtime checks. Local HEAD and substantial
uncommitted work are newer; do not rerun the old revision and label it current.

The fresh local preflight passed root/fixture type checks, orchestrator type
checks, lint and offline fanout/burst models. Expo Doctor passed 20 of 21 checks
and failed dependency alignment on the following patch versions:

| Package | Installed | Expected by Doctor |
| --- | --- | --- |
| `expo` | 57.0.24 | ~57.0.26 |
| `expo-camera` | 57.0.5 | ~57.0.6 |
| `expo-constants` | 57.0.19 | ~57.0.20 |
| `expo-image-manipulator` | 57.0.19 | ~57.0.20 |
| `expo-image-picker` | 57.0.19 | ~57.0.20 |
| `expo-linking` | 57.0.10 | ~57.0.11 |
| `expo-notifications` | 57.0.20 | ~57.0.21 |
| `expo-router` | 57.0.22 | ~57.0.24 |
| `expo-video` | 57.0.4 | ~57.0.5 |

Following owner approval, all nine package ranges and the lockfile were aligned
to the expected patch versions. Expo Doctor now passes 21/21 checks. The full
local coverage rerun finished October 2 at 17:05 UTC: 233 suites / 4,514 tests,
23 offline scripts and 652 browser scenarios pass; every area still exceeds all
four 90% thresholds across the same 437 source files. No browser scenario was
skipped or flaky. Root/fixture and orchestrator type checks, lint and size checks
pass. The guarded database run and source-only run from the isolated checkout
also pass. Packaging/native acceptance is still required before a mobile release.
Do not suppress Doctor checks or blindly run forced audit fixes.
[Expo's guidance](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
calls for aligning SDK dependencies and rerunning Doctor.

`npm audit --omit=dev --audit-level=critical` exited zero but reported seven high
and three moderate vulnerabilities. A passing critical-only gate is not a clean
security audit. Reported paths include brace-expansion, js-yaml,
decode-uri-component/query-string/expo-router, and node-forge/Expo tooling.
Reachability and remediation remain to be reviewed; suggested forced fixes
include breaking downgrades and were not applied.

The approved source/test snapshot was prepared in a separate managed checkout,
leaving the owner's dirty primary checkout intact. The branch
`codex/quality-gates-expo-patches` was pushed with commit `3160372`; it includes
the existing source needed by the current tests, not just the nine package edits.
The [hosted run](https://github.com/faheygs/doji/actions/runs/37038471068) passed
all three jobs on that exact revision. Its coverage run finished at 17:19 UTC
using Node 24.21.0: 233 Jest suites / 4,514 tests, 652 browser scenarios and all
six coverage stages passed, with no skipped or flaky browser scenarios. All 17
areas exceed the four 90% thresholds across 437 source files with zero missing;
the lowest hosted metric is 90.55%. Local and hosted percentages are recorded
separately rather than merged. The hosted database artifact confirms 288
migrations replayed and a second source-only run from 623 source files; both
passed without reported cleanup errors. The application job also passed Expo
Doctor, type checks, lint, size, Jest, demand model, critical-level dependency
audit, orchestrator checking and both configured Deno entry-point checks.

The snapshot was subsequently fast-forwarded to `main` with owner approval;
the main push run passed. No production deployment, app build or paid service was performed.
Generated evidence and credentials were
excluded; generated test directories now have explicit ignore rules.

Gitleaks 8.30.1 was downloaded from its official release and SHA-256 verified.
The new-commit scan found five reviewed synthetic test/key-template detections,
not production credentials. The full-tree scan also identified an unchanged
Firebase client configuration already present in public main; its Git blob was
verified identical. This is a scoped secret review, not proof of general security
or provider-key restrictions. Redacted scan reports remain local and unpublished.

Standard public-repository hosted runners are free under
[GitHub's documented billing model](https://docs.github.com/en/billing/concepts/product-billing/github-actions);
this does not authorize larger runners or new paid storage.

Native-device tests require the exact installed candidate and tester evidence.
Live-provider qualification requires controlled identities and explicit bounded
test actions; earlier offline provider mocks are not live delivery evidence.
The 100,000-user demand models were rerun, but production-like capacity, actual
provider limits and handset delivery were not tested. These remain independent
acceptance gates, not failures repaired by source-size exceptions.

## Before any release

1. Identify exact scope and approved source baseline; inspect the dirty worktree.
   Stage only reviewed changes. Do not accidentally include secrets, artifacts,
   provider credentials or unrelated untracked work.
2. Confirm member impact. Shared database/RLS/Worker/member API changes require
   separate scope approval, rollback and member regression evidence.
3. Build the exact artifact in a controlled directory and inspect its configuration,
   routes, headers, flags and packaged dependencies. Record its hash/commit.
4. Run contract tests plus visual/native acceptance for the changed surface.
   Include negative authorization and stale/concurrent-write checks where relevant.
5. Capture the current deployment and a tested rollback procedure. For SQL, verify
   compatibility of old and new code and data; rollback is not blind file reversal.
6. Deploy only the approved component with the correct project/account identity.
7. Verify the live result with bounded reads and explicitly approved test actions.
   Record what is verified, what is still pending and who must act next.

## Release boundaries

| Surface | Artifact/runtime | Required caution |
| --- | --- | --- |
| Public site | Cloudflare Pages `doji-site`, selected `website` output | Public content, legal versions and safety configuration are not employee/business config |
| Employee admin | Admin Pages artifact plus same-origin employee proxy | Root WorkOS mode/feature flags must be preserved; no member session revocation |
| Employee server | `supabase/functions/employee-portal-v2` plus packaged identity runtime | Source imports the `infra/portal-identity-candidate` runtime; use the reviewed packaging process, not an unverified raw folder deploy |
| Business | Separate Pages application and dedicated Edge/SQL contracts | Current Supabase-based admission is not the completed WorkOS business realm |
| Shared database | Exact approved atomic SQL scope | Installed drafts and migration ledger must be reconciled; no broad `db push` |
| Orchestrator | `infra/doji-orchestrator`, five Durable Object bindings | Shared alarms, member commands, reads and push; portal UI deploy does not include it |
| Mobile | EAS native binaries, then Apple/Play submission | Build completion, upload, review and user availability are different states |

Use [Service catalog](SERVICE_CATALOG.md) for the full function/service inventory.
Historical scripts named `apply`, `launch`, `configure`, `start`, `retry`, `deploy`
or `sync-production` may mutate live systems. Never run them merely because a
release document links them. Review guards and fresh state first.

## Mobile build and store handoff

- `app.json` currently records version 1.0.8, iOS 101 and Android 23. These are not
  automatically the next unused build numbers; query the authorized store/build
  records before allocating a new one.
- Review `eas.json` environment, signing, project and submission profiles. Its
  Android `production` submission targets Alpha, while the testing profile targets
  internal testing; the profile name is not proof of public availability.
- Verify `scripts/verify-build-env.mjs` against the exact approved environment.
  Public bundle variables cannot contain server secrets. Sentry source-map upload
  credentials are build-only secrets, not `EXPO_PUBLIC_*` values.
- Confirm included build/submission allowances first. Do not create, retry or
  submit jobs without the owner's approved scope.
- Save job ID, exact version/build, artifact hash, submission/track and verified
  status. Never duplicate a pending draft/submission. Keep iOS and Android actions
  separate when only one platform is authorized.
- Use [App Store checklist](APP_STORE_RELEASE.md) and [Google Play checklist](GOOGLE_PLAY_RELEASE.md)
  for the platform steps, rechecking current official requirements at release time.

## Mandatory updates

`mobile_release_policy` is global per platform. Before changing it, confirm the
exact build is available to **every affected user**, not merely approved or in a
closed track. Closed Alpha requires confirmed audience eligibility or verified
production availability. Never strand a user behind an unavailable required build.

Read both live rows, keep a rollback snapshot, preserve the store URL, use a narrow
atomic concurrency-protected update, never downgrade a newer policy and verify the
read RPC/version comparisons plus the untouched platform row. This is a separate
authorized operation, not an automatic side effect of upload.

The Android 23 release record notes a foreground-refresh limitation in the current
update-policy query. Do not promise instantaneous enforcement on foreground;
confirm behavior on the exact binary. See [Android 23 record](ANDROID_RECOVERY_BUILD_23_2026-09-28.md).

## Rollback and incident handoff

- **Static portal:** retain the prior exact Pages deployment and configuration.
  Revert only that surface; changing shared auth/SQL back may need separate work.
- **Backend/identity:** preserve compatible principal mappings and audit history.
  Inspect the exact SQL/runtime rollback with existing sessions and member access.
- **Worker:** retain version/config and validate all five bindings and durable
  state compatibility; do not recreate alarms just to verify a deployment.
- **Mobile:** store binaries cannot be assumed to disappear from installed phones.
  Keep the backend backward compatible and handle release policy deliberately.

For an incident record UTC window, platform/release/build, operation and bounded
correlation/health evidence without member content. Distinguish committed data,
outbox processing, provider acceptance, delivery and actual phone display. Do not
resolve Sentry groups solely because a build finished. The Android 504 origin is
not established as fixed by the recovery/diagnostic release.

## Documentation validation

Run `node scripts/check-onboarding-docs.mts` to check the handbook's relative
links, index coverage and public-only environment template. It is local/read-only;
it does not certify external URLs, live state or every historical claim. Update
the handbook and relevant context/release record when a contract changes.
