# Android 1.0.8 build 27 — Expo diagnostics attachment correction

## Authorization and status

Owner requests an Android build and says physical-device testing must wait for
their external Android testers; the owner does not have an Android device.
The earlier pre-release device-check plan is therefore replaced for this closed
test by explicitly deferred tester acceptance, **not a claim of passed smoke**.
One Android-only EAS build is authorized within existing included credit. No
new spend, iOS job, backend/portal/database deployment, enforcement or Sentry
resolution is included. Production 504 origin remains unresolved.

Current state: **FINISHED; exact AAB downloaded and SHA-256 verified**.
The cloud build launched October 4 around 02:04 UTC (October 3 MDT), exact job
`242c9a8b-f1f2-45d8-8e17-0b25cc18bf66`, and finished at
**2026-10-04T02:26:09.463Z**. Completion was verified at 02:36 UTC.
[EAS job](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/242c9a8b-f1f2-45d8-8e17-0b25cc18bf66).
Read only with `node scripts/android-diagnostics-status-27.mts`; after FINISHED,
use `--download` for exact AAB/hash verification. Never launch/retry another job.
Verified artifact: `test-results/android-diagnostics-27/doji-1.0.8-27.aab`,
**95,234,689 bytes**, from this exact EAS job. SHA-256 independently rechecked:
`eb4205782c8fb2f8ad2daf20a163e72cfda5a43391d1a3832e4e7b1476739581`.
Evidence: `latest-status.json` and `android-artifact.json` in the same directory.
Completion heartbeat `finish-android-27-diagnostics-build` is now paused after
verified artifact handoff; all older monitors are left unchanged.
**Submitted for Google Play Closed testing - Alpha review on October 4 around
16:04 UTC**, exact **27 (1.0.8)**, release **17**. Publishing overview verified
**Changes in review**, with quick checks still running; changes reach review
after those checks succeed. Managed publishing remains OFF. Only one change,
the existing Alpha track's full rollout, was submitted. No public production
release, audience/country changes or enforcement changes were made. Device
acceptance remains deferred to external testers, not passed; approval,
availability and installation are not yet verified.
Receipt: `test-results/android-diagnostics-27/play-submitted-review.png`.
[Publishing overview](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/publishing).
Owner subsequently authorized Google Play review submission. Publishing overview
had no pending changes; Alpha showed only build 26 available to selected testers,
one country/region and no conflicting draft. Created the existing-track draft
**release 17** for build 27. Upload control did not produce a usable file chooser
through either semantic or visible-coordinate browser interaction (10-second
chooser timeouts). **No AAB uploaded and no review submission performed.**
The owner subsequently uploaded `doji-1.0.8-27.aab`. Play verified **27 (1.0.8)**
in the same release 17 draft. Entered the release notes below and verified no
unrelated pending changes. Preview showed unchanged device support and one
non-blocking warning: no deobfuscation file associated with the AAB. Native debug
symbols were present. Preserved the 100% rollout within the existing closed
test audience, saved, and confirmed Send changes for review. No duplicate draft.
Existing audience, countries and enforcement remain unchanged.
[Release 17 draft](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/tracks/4699325792611215201/releases/17/prepare).
Build completion is not Play submission, approval, availability
or tester installation. Existing Android minimum remains build 26.

## Exact source

`test-results/android-diagnostics-27/upload` has 356 hash-verified source files.
It starts from the immutable Android 26 uploaded candidate, not the dirty repo.
Exactly 11 files change:

- `app.json`: only Android versionCode becomes 27; version remains 1.0.8,
  package `com.doit.challengeapp`; iOS config unchanged.
- `lib/memberReadDiagnostics.ts`: accept bounded native hints on gateway reads.
- `plugins/withAndroidReadDiagnostics.cts`, native `DojiReadResponseHints.java`
  and new `expoClientPatch.js`: attach the passive observer to actual Expo fetch,
  preserve RN fallback, cover scoped gateway GET/HEAD reads. Expo 57.0.26 source
  is hash-pinned and unknown SDK changes fail closed.
- `.easignore`: include the new helper and existing reviewed URI compatibility
  package; local SDKs, probes, tests, portals and backend remain excluded.
- `package.json`, `package-lock.json`, and three URI adapter files under
  `vendor/decode-uri-component-compat`: exact hashes from the reviewed iOS 103
  security repair. This avoids shipping the known recursive URI decoder from
  older Android 26. No additional dependency upgrade or iOS rebuild.

Observer does not modify outgoing requests, TLS, credentials, cache policy,
retry counts, deadlines, successful responses or bodies. No new event volume,
raw URLs, content, credentials, IP/carrier data or arbitrary failure text.

## Qualification and security boundary

- Fresh six focused regression suites: **108 tests passed**.
- URI parser/security regression: **28 tests passed**, including malformed-input
  termination and installed Router fallback; rerun immediately before launch.
- Exact Android production JS export passed; upstream URI decoder 0.5.0 and
  compatibility adapter are present; old recursive decoder is absent.
- Android-only prebuild passed. RN installer occurs once before native startup;
  Expo observer occurs once; generated Java matches reviewed source.
- Same diagnostic source: native controls **86 assertions in three runs**;
  actual Expo/Hermes/JSI-to-Sentry offline integration **28 assertions in three
  runs**. See `ANDROID_26_FEED_504_INVESTIGATION_2026-10-03.md` for limits/evidence.
- Exact Android export source map contains none of the five previously assessed
  tooling advisory roots: brace-expansion, braces, http-cache-semantics, js-yaml,
  node-forge. Existing lockfile warnings are not patched or suppressed. This
  candidate uses the reviewed dependency set and trusted frozen source/config,
  no custom Metro config, development-client profile or OTA signing config.
  Runtime absence is newly checked for Android, not borrowed iOS acceptance.
  No clearance for untrusted build inputs, CI, development servers or Node
  services is implied. The URI repair is not a fix for the Android HTTP 504.
- No physical-device acceptance yet. External testers will exercise the actual
  installed build; successful synthetic tests do not prove carrier recovery.

## Build and cost guards

Preparation/verification: `node scripts/android-diagnostics-27.mts verify`.
Launch is single-attempt, credentials frozen, production Android medium, no
automatic version increment or submission. Fresh history must have no active
job or Android versionCode 27/newer; ambiguous launches are never retried.

Fresh launch preflight October 4 **02:02:17 UTC**: $45 included, $40 used,
**$5 remaining**. The guard reserves $3 for both known jobs within the provider's
24-hour usage-reporting delay, plus $1 for this job. No overage is authorized.
[Expo billing reference](https://docs.expo.dev/billing/usage-based-pricing/).

## Tester handoff

When the exact cloud job finishes, verify the AAB and SHA-256 before any Play
handoff. Distribution is only to the existing Closed testing - Alpha audience,
track `4699325792611215201`, app `4972908027141050312`, developer
`6661342012009308283`. Never change countries/audience or publish public production.
Inspect current drafts/pending changes and stop for conflicts before submission.
Do not claim tester diagnostics until they install 27. Do not force an update
automatically or alter other monitors. No new builds/retries without authority.

Suggested truthful release notes:

> Improved Android loading-error diagnostics and URI handling security.
> This release helps investigate intermittent loading failures.

Local evidence: `test-results/android-diagnostics-27/manifest.json`,
`regression.json`, `prebuild-proof.json`, `bundle-proof.json`,
`decoder-regression.log`, `cost-preflight.json`, `attempt.json`, `build.json`.
No test alert is sent.
