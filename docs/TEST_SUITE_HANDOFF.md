# Test suite handoff

This guide lets a developer run Doji's automated regression suite from a fresh
checkout and understand what a passing result establishes. Tests do not authorize
deployments, live account actions, notification sends or spending.

The latest merged qualification is PR #3, merge commit `60df53a` on `main`.
Its exact PR head `ce86ebd` passed the
[application, coverage and database checks](https://github.com/faheygs/doji/actions/runs/37311724708)
on October 5, 2026, before merge:

- 240 Jest suites and 4,622 unit/component tests passed.
- 697 browser scenarios and 27 offline suites passed.
- All 17 areas met 90% statements, branches, functions and lines independently,
  covering 446 source files with no missing files. The lowest hosted metric was
  90.52%. This is an area-level policy, not a per-file guarantee.
- The database harness replayed 288 migrations and passed its explicit integration,
  permission, concurrency and rollback checks. Its second source-only run passed.

The previous October 2 qualification (`3160372`, 4,514 tests / 652 browser cases)
remains historical evidence in [Testing and releases](TESTING_AND_RELEASES.md).
PR qualification is not a claim about a new main-push run or any production
deployment. Check the exact commit and status of later changes.

## Prerequisites

Use Node 24, npm, Git, and a local Chromium installation managed by Playwright.
Database tests additionally require a running local Docker or Podman engine and
the pinned images selected by [database configuration](../scripts/database/config.mts).
Image/browser/package downloads need network access and local disk space. Do not
enable paid cloud resources or remote container engines for these checks.

No production `.env` file, service-role key, WorkOS key or member account is needed
for the automated suite. [.env.example](../.env.example) contains public-only
development placeholders, not working production credentials.

Run these commands from the repository root, checking each command's exit status:

```sh
npm ci
npm ci --prefix infra/portal-identity-candidate
npm ci --prefix infra/doji-orchestrator
npx playwright install chromium
npm run typecheck
npm run lint -- --quiet
npm run check:size
npm run test:coverage
```

On Linux, Playwright may need OS libraries; CI uses
`npx playwright install --with-deps chromium`. On Windows, an already installed
Chrome can be selected for the current PowerShell session before the coverage run:

```powershell
$env:DOJI_TEST_BROWSER_CHANNEL = 'chrome'
npm run test:coverage
Remove-Item Env:DOJI_TEST_BROWSER_CHANNEL
```

The browser preflight fails early if the selected browser is missing. Do not
disable browser tests or lower coverage thresholds to work around missing setup.

## Database tests

The default engine is Docker on Linux/macOS and the configured Podman executable
on Windows. To select a locally installed alternative, set `DOJI_TEST_ENGINE` to
its `docker` or `podman` executable. Remote engine endpoints are rejected.

```sh
npm run test:database:prepare
npm run test:database
npm run test:database:repro
```

Preparation explicitly downloads pinned images. Execution creates randomly named,
owned disposable containers with no external network, published ports or host
bind mounts. Cleanup removes only those owned containers. Inspect a reported
cleanup failure; never use broad container, volume or directory deletion.

The source-only run uses another empty database without retained `.env` files,
`node_modules`, Git state or previous test evidence. This is a reproducible test
harness, not a certified one-command full application stack or proof that raw
`supabase db push` matches production. The harness restores specific historical
preconditions and applies explicit later-schema test overlays. Inspect
[replay](../scripts/database/clean-room.mts),
[integration](../scripts/database/integration.mts) and
[concurrency](../scripts/database/concurrency.mts) for their exact scope.

The anonymous announcement EXECUTE revokes remain a separately gated local
candidate in [draft SQL](drafts/announcement_member_execute_v1.sql). Testing that
candidate and its rollback does not deploy it or authorize applying it live.

## Required checks before merging

[Quality gates](../.github/workflows/quality.yml) runs on pull requests, pushes to
`main` and explicit manual dispatch. All three jobs are required on `main`:

| Job | Checks |
| --- | --- |
| `application` | Expo Doctor, strict app/fixture types, lint, source-size caps, Jest, fanout model, critical-level dependency audit, orchestrator types and the two configured Deno entry points |
| `coverage` | Full source-inclusive Jest, allowlisted offline provider/session tests, instrumented browser scenarios, merged results and the independent 17-area coverage gate |
| `database` | Pinned-image preparation, guarded isolated database tests and source-only reproducibility |

Branch protection requires a pull request and an up-to-date branch, binds the
checks to GitHub Actions, and applies to administrators. Force pushes and deletion
are blocked; review conversations must be resolved. No second-person approval is
required while solo development must remain possible. Do not bypass checks when
a test fails. Check names must stay aligned with protection if workflows change.

The existing 15 source-size exceptions freeze those files at their approved caps;
the default limit remains 240 lines. Coverage thresholds and the source inventory
must not be weakened to make a change pass. See
[source-size policy](../scripts/check-source-size.mts) and
[coverage policy](../coverage-policy.mts).

## Focused checks and failure evidence

For a quick unit/component run, use `npm test -- --runInBand`. It does not replace
the coverage/browser or database jobs. For a single regression, pass its test
path to Jest, then run the relevant complete gate before merging.

The application job also runs these separate checks:

```sh
npm run test:fanout-model
npm audit --omit=dev --audit-level=critical
npm ci --prefix infra/doji-orchestrator
npm run typecheck --prefix infra/doji-orchestrator
```

For Deno, follow the exact entry-point command in the workflow with Deno 2. The
workflow does not currently typecheck every Edge Function entry point with Deno.
Do not bulk-run historical `scripts/test-*` files: some scripts use live services
or retained environments. Use the explicit suite entry points above.

Coverage output is under `test-results/coverage/current/`:

- `run-status.json` records each stage's exit status.
- `areas.json` records counts and thresholds by area.
- `jest-results.json` and `browser-tests.json` identify failed scenarios.
- `offline-results.json` records the allowlisted offline scripts locally.
- `index.html` and `lcov-report/` provide navigable local coverage results.

Database evidence is under `test-results/database/clean-room.json` and
`reproducibility.json`. Confirm a passed status and no cleanup error. CI uploads
`coverage-by-area` and `database-regressions` artifacts, including failed-run
evidence when available, with seven-day retention. Keep necessary sanitized
release evidence before expiry. Never commit generated reports, credentials,
member content or screenshots containing private data.

`npm run test:coverage:report` only checks retained output; it does not rerun tests
or prove freshness. A full coverage run replaces its previous `current` output.
For failures, record commit, OS/runtime, exact command, exit status, failing case
and sanitized evidence. Fix the cause and rerun; do not relabel skipped or partial
results as passing or resolve a production incident from a green test alone.

## Independent release acceptance

These gates remain separate from the completed automated coverage milestone.
Record each as passed, failed, blocked or not run against the exact candidate,
with tester, timestamp and bounded evidence. This guide does not authorize live
tests, new builds, provider charges or load generation.

| Gate | Required evidence before claiming completion |
| --- | --- |
| Employee identity | Real invitation, authenticator enrollment/MFA, sign-in, password reset, logout and session expiry on controlled identities; no member-session effects |
| Business account | Real signup, email, onboarding, staff review and correction journey; verify the actual released identity provider rather than assuming the planned WorkOS business cutover is complete |
| Account separation | Same-email member/employee/business password, session, authorization and deletion independence where supported by the deployed contracts; member authentication remains Supabase Auth |
| Mobile devices | Exact Android/iOS build, device and OS; push acceptance versus delivery/display, permissions, camera/upload, keyboard, background/foreground and interrupted-network recovery |
| Schema parity | Reconcile deployed draft SQL with the migration ledger under separate shared-system approval; harness success alone is not live-schema parity |
| Dependency security | Review the last audit's seven high and three moderate findings for reachability and compatible fixes; the critical-only gate is not a clean security audit and forced breaking downgrades are not an approved repair |
| Capacity | Approved production-like workload and provider/database headroom measurements; local fanout models and 90% coverage do not prove 100,000-user readiness |

The admin browser project includes retained legacy employee UI/rollback contracts.
Its mocked sign-in and the offline WorkOS tests do not establish a complete live
owner onboarding journey. Native mocks likewise do not prove phone behavior.

Before any release, follow [AGENTS.md](../AGENTS.md),
[product context](../DOJI_CONTEXT.md),
[realtime architecture](REALTIME_ARCHITECTURE.md) and the approved release scope.
Keep portal, member app, shared database and Worker changes as separate deployment
boundaries. Preserve rollback evidence and verify the exact artifact; merging
code is not a production release.
