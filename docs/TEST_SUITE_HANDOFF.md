# Test suite handoff

This guide lets a developer run Doji's automated regression suite from a fresh
checkout and understand what a passing result establishes. Tests do not authorize
deployments, live account actions, notification sends or spending.

Every source change needs passing checks on its own exact commit. Historical
results in the [handoff audit](releases/REPOSITORY_HANDOFF_AUDIT_2026-10-12.md)
and [release records](releases/README.md) do not qualify a newer checkout or a
production deployment. All 17 coverage areas independently require 90%
statements, branches, functions and lines; this is not a per-file guarantee.

## Prerequisites

`npm run typecheck` also compiles the Jest sources through `__tests__/tsconfig.json`,
using the checked-in Worker/Deno declarations and local SDK mappings. Passing Jest
alone is not a typecheck. `scripts/tsconfig.json` supplies the tooling project to
both the compiler and editors; fixtures retain their own stricter runtime contracts.

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
npm ci --prefix infra/portal-identity
npm ci --prefix infra/doji-orchestrator
npm ci --prefix web
npx playwright install chromium
npm run typecheck
npm run lint -- --quiet
npm run check:size
npm run test:coverage
```

On Linux hosts, Playwright may need `npx playwright install --with-deps chromium`.
CI instead uses digest-pinned official Playwright Noble images with browsers and
OS libraries already installed; it does not download Ubuntu fonts during tests.
Root and web keep separate lockfiles. The image tag must match its primary locked
client; coverage additionally rejects incompatible root/web Chromium revisions.
Both clients launch locally before coverage starts. Update image tags/digests and
qualify CI together when upgrading Playwright; never substitute a system browser.
The web job bounds setup and each suite separately, with Playwright global timeouts
below step limits and job headroom for retained failure traces. Registry/npm outages
can still fail setup; missing browsers never skip tests or count as passing.
On Windows, an already installed
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
candidate in [SQL overlays](../supabase/overlays/announcement_member_execute_v1.sql). Testing that
candidate and its rollback does not deploy it or authorize applying it live.

`npm run test:health-events:database` also composes the real mobile-report HTTP
handler, private PostgreSQL ingestion and employee data projection. It exercises
all 60 fixed platform/category pairs, duplicate and rate admission, malformed and
unverified callers, mixed-environment denial and evidence-preserving disable.
Only the Auth boundary is synthetic; this does not replace hosted project-Auth,
capacity or physical-device acceptance. The test uses the owned network-disabled
database room and leaves no synthetic count rows for later cases.

## Required checks before merging

[Quality gates](../.github/workflows/quality.yml) runs on pull requests, pushes to
`main` and explicit manual dispatch. All four jobs must pass for this handoff;
verify branch protection/check contexts before merge rather than bypassing them:

| Job | Checks |
| --- | --- |
| `application` | Expo Doctor, strict app/fixture types, lint, source-size caps, Jest, fanout model, root critical-level and deployment-tooling high-level dependency audits, orchestrator types and the two configured Deno entry points |
| `coverage` | Full source-inclusive Jest, allowlisted offline provider/session tests, instrumented browser scenarios, merged results and the independent 17-area coverage gate |
| `database` | Pinned-image preparation, guarded isolated database tests and source-only reproducibility |
| `web-migration` | Separate locked web install, strict types/lint/Vitest, Vite/Next and connected artifact builds, Playwright and high-level dependency audit |

Run the web gate locally after installing its locked dependencies and Chromium:

```sh
npm run check --prefix web
npm run build:connected --prefix web --workspace @doji/admin
npm run test:connected-artifacts --prefix web
npm run test:browser --prefix web
```

Root coverage browser tests accept `DOJI_TEST_BROWSER_CHANNEL=chrome`; the web
suite uses its own Playwright configuration/browser installation. Default web
tests intentionally omit dedicated exact-package suites; those require an explicit
artifact and config. Do not report an omitted suite as passed.

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

`node scripts/test-scale-read-runtime.mts` runs the shared read gateway in local
workerd with synthetic JWTs and intercepted upstreams. It checks authentication,
member/audience cache isolation, stalled key/header/body recovery and concurrent
reads. An optional first argument selects an exact packaged Worker file instead
of current source. It requires loopback networking but never contacts providers;
its synthetic burst is not a production database-capacity test.

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

### Mobile performance qualification

Use release-mode staging artifacts, exact source/build identities and synthetic
data. Dev/Fast Refresh and emulator timings are functional evidence, not physical
device performance qualification. Measure an agreed iPhone and representative
physical Android separately; record OS, device, thermal state, network latency/
bandwidth, cache state, sample count and p50/p95/p99. Do not infer a reliable tail
percentile from a handful of actions. Keep sampled diagnostics bounded and free
of identities, credentials, content and signed URLs; existing reporting gates stay
off unless separately approved. No new telemetry service or paid runner is required.

Initial acceptance targets on the defined reference network/device:

| Journey | Target |
| --- | --- |
| Tap/submit feedback | p95 <=100 ms, independently of server confirmation |
| Cached screen navigation | Useful content p95 <=250 ms |
| Signed-in cold launch with cached content | Interactive primary screen p95 <=2 seconds |
| Ordinary foreground reads/confirmed writes, excluding uploads | End-to-end p95 <=1 second and p99 <=2 seconds |
| Scripted feed/navigation at 60 Hz | <1% missed frames; inspect individual long stalls |
| Media upload | Immediate progress state, bounded progress-aware stall detection and safe recovery |
| Slow/offline recovery | Usable navigation/cached content; no unexplained indefinite spinner |

Feed smoothness qualification includes cold/warm scrolling through photo pages,
background-return without image blanking, reaction taps during delayed reads, and
posting in Everyone followed by switching to Friends. Verify both platforms,
account/permission changes and slow/offline recovery; record frame stalls and media
readiness rather than treating emulator impressions as physical-device timing.
The two-card media lookahead is a bounded initial window, not a measured optimum.

These are targets, not measured results or provider guarantees. Record unmet
targets and their causes rather than silently relaxing them. Latency includes
auth, scheduling, network, backend, parsing and UI update; upload transfer is
measured separately by payload size. Faster requests cannot justify duplicate
writes, weaker authorization or stale challenge eligibility.

Maintain an exact-candidate acceptance record for all routes, grouped as:
launch/auth/onboarding; feed/post/comments/reactions; challenge capture/upload/
poll/receipt; profiles/friends/search; rank/shop/appearance/suggestions; settings/
notifications/moderation. Include cold/warm caches, deep scrolling, background
return, reconnect, account switching, expired sessions, stalled images/uploads
and lost write acknowledgements. Compare request counts/bytes, memory growth and
frame timing as well as elapsed time. Screen inventory alone is not acceptance.

The offline `queryInvalidationBatcher` and `queryInvalidationRequests` suites
reproduce stalled-family isolation, mixed-family completion, 100-hint coalescing,
per-family cadence, teardown and real QueryObserver request counts. They never
contact providers and do not establish hosted/device latency. Add equivalent
fault regressions before changing each subsequent request/media path. Preserve
all ordinary quality/coverage gates. Backend changes, staging capacity tests,
native builds and production promotion retain their separate release gates.

These gates remain separate from the completed automated coverage milestone.
Record each as passed, failed, blocked or not run against the exact candidate,
with tester, timestamp and bounded evidence. This guide does not authorize live
tests, new builds, provider charges or load generation.

| Gate | Required evidence before claiming completion |
| --- | --- |
| Employee identity | Real invitation, authenticator enrollment/MFA, sign-in, password reset, logout and session expiry on controlled identities; no member-session effects |
| Business account | Independent WorkOS business signup/recovery, approval, branding/setup/MFA, workspace and corrections; current owner acceptance is dated evidence, not qualification of a changed candidate |
| Account separation | Same-email member/employee/business password, session, authorization and deletion independence where supported by the deployed contracts; member authentication remains Supabase Auth |
| Mobile devices | Exact Android/iOS build, device and OS; push acceptance versus delivery/display, permissions, camera/upload, keyboard, background/foreground and interrupted-network recovery |
| Schema parity | Reconcile deployed draft SQL with the migration ledger under separate shared-system approval; harness success alone is not live-schema parity |
| Dependency security | Run fresh scoped advisory checks and review reachability/compatible fixes; critical-only root and high-level web gates are not a security certification; forced breaking downgrades are not approved |
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
