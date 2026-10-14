# Member test builds: 1.0.8 / iOS 98 / Android 19

Owner requested allowance verification followed by test builds, not public release.

## Read-only allowance checks

Checked signed-in account dashboards on 2026-09-26 before launch:

- Expo `faheybaby`: Starter, existing $19/month subscription; $45 build credit,
  $20 displayed usage, $25 remaining. Current usage period September 21–October 21.
  One included concurrent job. No concurrency add-on or upgrade requested/applied.
- Medium Android costs $1 and medium iOS $2: these two builds use $3 of existing
  credit, not additional billed usage. Billing estimates can lag; latest build
  history had no active build and no build newer than September 25. Repeated builds
  or unrelated future account usage must be assessed again, not assumed free.
- Sentry `doji-i0`: free Developer plan, 56 / 5,000 errors, zero additional spend,
  no billing details/payment method. Developer does not support pay-as-you-go
  without a paid upgrade. Quota exhaustion may drop monitoring events; the client
  limit of ten unexpected errors/minute/device is not an account-wide quota.
- No plans, spending controls, sampling, credentials or monitoring settings changed.

Sources: [Expo account billing](https://expo.dev/accounts/faheybaby/settings/billing),
[Expo usage pricing](https://docs.expo.dev/billing/usage-based-pricing/),
[Sentry subscription](https://doji-i0.sentry.io/settings/billing/overview/),
[Sentry Developer pay-as-you-go restriction](https://www.sentry.help/en/articles/13965037-can-i-set-up-an-on-demand-pay-as-you-go-budget-for-my-free-developer-plan).

## Build inputs and destinations

Both platform inputs were verified against the prepared manifest: 338 identical
files, 2,418,482 bytes after the submission-profile change. Source is the isolated
`test-results/mobile-release-20260926/ios-archive-verified` directory for both.
`EAS_NO_VCS=1` and an absolute `EAS_PROJECT_ROOT` prevent the ancestor dirty Git
checkout from becoming the upload root. Existing remote signing credentials are
frozen; no credential creation or rotation is requested.

`eas.json` explicitly selects medium Android and existing m-medium iOS workers.
New `submit.testing` inherits the existing iOS App Store Connect destination and
overrides Android to **internal**, not the existing alpha profile. iOS submission
means TestFlight processing, not App Store review or public release. No OTA or
minimum-version/update-enforcement change is authorized.

Launch evidence is stored in `test-results/mobile-release-20260926/`:
`pre-build-history.json`, `launch-attempt.json`, `launched-builds.json` when complete,
and `launch-error.txt` if the launch has an ambiguous/partial failure. Never rerun
the one-shot launch script without reconciling exact EAS IDs first.

## First attempt and clean-install repair

The first two jobs were created, then failed in `INSTALL_DEPENDENCIES`, before
native compilation or store upload:

- Android: `c2525d69-9f63-4b99-9962-fda30b456fac` (19), ERRORED.
- iOS: `1bf9af99-c63a-4430-a11a-8f9f3ab1cd79` (98), ERRORED.

The root project had `legacy-peer-deps=true` locally; the isolated archive correctly
excluded local npm configuration, exposing incompatible development dependencies
under EAS's normal `npm ci`. The original installed-tree test pass did not verify
clean dependency installation. Corrected the dependency graph rather than bypassing
peer checks: ESLint 9.39.5 is within eslint-plugin-react 7.37.5's published supported
range; React Native test preset 0.86.3 matches jest-expo 57.0.5's required peer and
the app's React Native version. ESLint 9 is marked deprecated by npm; replacing it
with ESLint 10 requires compatible React lint-plugin support, not an unchecked force
install. All direct app runtime dependency requirements are unchanged. Lockfile
regeneration also installs required peers and changes dependency hoisting.

Project npm configuration now keeps normal peer resolution enabled. Jest module
discovery and lint ignore generated test/build archives, preventing duplicate mock
resolution from copied sources. Clean isolated `npm ci --include=dev
--legacy-peer-deps=false --ignore-scripts` passed (1155 packages). This verifies
dependency resolution and installation, not lifecycle scripts. Full tests then
passed: 125 suites / 921 tests, lint and TypeScript. Both Android and iOS release
JS bundle exports passed locally; `--no-bytecode` was used only for this local
bundle check, not for cloud build configuration.

A single bounded retry uses `upload-r2`, comparing all 338 input files with the
workspace and allowing only package manifest/lock differences from the initial
candidate. The two retries consume at most another $3 of included credits, leaving
at least $19 of the initially observed $25 even if the first failed jobs are charged
in full. Recheck allowance before any further retry. Retain both failed build IDs;
do not retry a running/ambiguous job. Build numbers remain 98 / 19 because no first
attempt binary reached either store.

Automatic Android submission failed separately because no Google Play submission
service-account key is configured in EAS. No key or broader access was created.
Existing Play Console access was verified: Doji Connect `com.doit.challengeapp`,
internal testing track, currently 10 (1.0.3), with a Create new release control.
Android retry does not auto-submit; plan is manual AAB upload to that internal track.
iOS retry separately schedules its existing TestFlight submission credentials.

## Corrected candidates created

At 23:50 UTC on September 26, the corrected jobs are:

- iOS 1.0.8 (98): `1e9aadab-ff77-4509-ba39-f84c29efb94d`, IN_PROGRESS.
- TestFlight submission: `122084f8-d7a0-439f-b4e9-8d23308c3790`, AWAITING_BUILD.
- Android 1.0.8 (19): `c8989f5a-e3a0-4133-b4f6-7176757549be`, created successfully;
  no Play submission scheduled. Manual internal-track upload remains pending.

The iOS retry initially failed to schedule submission because EAS restricts the
optional `--what-to-test` / changelog parameter to Enterprise. The binary build
was already running. Read its exact build/submission state (no submissions), then
scheduled **that same build** without the optional parameter. No rebuild, plan
upgrade or duplicate submission was made. Android was then launched separately
from the same verified `upload-r2` input with frozen existing signing credentials.

Do not rerun either launch script. Reconcile the exact IDs above before taking
further action. Created jobs are not yet successful binaries or installable tests.

## Remaining acceptance

Cloud build success, store processing and installability must each be verified.
Physical iOS and Android tests remain required for reporting/modal handoff/retries,
comments refresh and access loss, separate employee/member sessions, native push,
foreground/reconnect, ten-minute participation and direct-to-feed completion.
Check sanitized handled errors in Sentry on the candidate release. Automated tests
and the backend no-op optimization do not establish historical incident resolution
or production peak capacity. See `MEMBER_RELIABILITY_REPAIR_2026-09-26.md`.
