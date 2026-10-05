# Android 1.0.8 build 28 closed test release

The owner authorized building and submitting this Android update to the existing
Google Play Closed testing Alpha audience. This is diagnostic, not a confirmed
repair of the production 504 origin. Physical tester acceptance remains deferred
per the owner, not passed. No iOS, backend, portal, database, enforcement, new paid
service or additional spending is authorized.

## Current status

Cloud build **1.0.8 versionCode 28**, job
`f5c46c14-8eb1-427d-9ca0-7a4ac08e319b`, finished October 5 at
00:07:28.549 UTC; verified FINISHED at 00:08:06 UTC. The exact AAB was downloaded
and independently SHA-256 verified. Completion/submission heartbeat
`finish-android-28-build-and-alpha-submission` now monitors Play review read-only
every ten minutes, quiet on pending/unchanged status. All older monitors were left unchanged.
[Exact EAS job](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/f5c46c14-8eb1-427d-9ca0-7a4ac08e319b).
The owner uploaded build 28; Play displayed `doji-1.0.8-28.aab` and **28 (1.0.8)**
in release 18 on October 5 around 00:47 UTC. **Review submission was verified
October 5 around 00:54 UTC:** Publishing overview shows **Changes in review**,
Closed testing - Alpha, **28 (1.0.8)**, Start full rollout. Quick checks are still
running; approval and tester availability are not yet verified. Never launch/retry another build.
No further EAS check or download is needed. October 4 preflight: EAS had no active job and
no Android 28 or newer; Play Alpha has 27 available to selected testers, one
country/region, no draft, and Publishing overview has no pending changes.
Managed publishing remains off. Recheck before any Play write.

### Verified artifact and earlier upload handoff (October 5 UTC)

- Artifact: `test-results/android-diagnostics-28/doji-1.0.8-28.aab`
- Size: 95,236,084 bytes.
- SHA-256: `e2c2ede3bcd7f790e2a69112f68d9589642a420cdb77182562e1fab124173ee8`
- Evidence: `latest-status.json`, `android-artifact.json`, and
  `play-upload-blocked.png` in the same evidence directory.
- Fresh Publishing overview showed no pending changes and managed publishing off;
  Alpha showed 27 available, one country/region, with no existing draft.
- Opened the new Alpha draft, release **18**:
  [Resume draft](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/tracks/4699325792611215201/releases/18/prepare).
- The AAB input was hidden; the supported visible Upload control did not yield a
  file chooser (10-second timeout). No bundle was selected, and no upload or review
  submission was performed. Do not retry or bypass this blocker automatically.
- Owner handoff: upload the exact verified AAB into this existing draft and confirm
  completion. Then inspect exact versionCode 28 and pending changes, add the notes
  below, and finish the already-authorized Alpha review submission. Reuse release
  18; do not create a duplicate draft. No audience/country/rollout changes were made.

### Earlier control blocker (resolved)

On October 5 around 00:47-00:52 UTC, the owner reported upload completion.
The authenticated release 18 page showed the exact filename, versionCode 28,
version 1.0.8, API 24+, target SDK 36, and native debug symbols. A separate fresh
Publishing overview showed no unrelated pending changes and managed publishing off.
Approved notes were entered. Next and Save as draft did not advance or confirm
persistence through browser interaction. No validation error or JavaScript dialog
was exposed. A page refresh returned the same release 18 but without the unsaved
bundle association/name/notes. Add from library also did not open through the
available browser controls. No second upload, new release, review submission,
audience/country/rollout change, or enforcement was performed.

Owner handoff: in this same draft, open Add from library and check for uploaded
28 (1.0.8), select only that bundle, and click Next. Do not reupload or create a
new release. If 28 is absent from the library, stop and report that state. The
existing heartbeat remained PAUSED until the control blocker was cleared.
Screenshot: `test-results/android-diagnostics-28/play-release-controls-blocked.png`.

### Alpha review submission verified (October 5, about 00:54 UTC)

The owner restored the uploaded 28 from the library into the same release 18.
Approved release notes were entered and keyboard activation advanced the controls.
Preview confirmed only 28 (1.0.8), 100% rollout within the existing Alpha audience,
and no change to supported device counts. Play showed one non-blocking warning:
no R8/ProGuard deobfuscation file. The frozen native build defaults release
minification to false; no build configuration was changed during submission.

Saved the release, then verified Publishing overview contained exactly one change:
Alpha 28 (1.0.8), Start full rollout. Sent that one change for review and confirmed
**Changes in review**, with quick checks running (up to 13 minutes remaining).
Managed publishing remains off. Country/audience configuration and release policy
were not changed. No public production release or iOS action occurred.

Proof: `test-results/android-diagnostics-28/play-submitted-review.png`.
[Publishing overview](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/publishing).
Submission is confirmed; review approval and actual selected-tester availability
remain pending. Monitor read-only and notify once on availability or a blocker.
Tester installation and physical device acceptance remain unverified/deferred.

## Frozen source and checks

`test-results/android-diagnostics-28/upload` contains 360 hash-verified files,
starting from the immutable Android 27 upload. Only ten files change: Android
versionCode 28 in app.json; the existing POST/native command diagnostic repair
in memberReadDiagnostics, commandGateway, apiFailureTelemetry and the Java
observer; the new Android test-environment helper and three native-module files;
and the narrow mobile archive allowlist. Dependencies, EAS profile, URI security
repair, iOS configuration and all unrelated workspace changes are preserved or
excluded. No request/retry/auth behavior change is intended.

The added `firebase_test_lab` tag distinguishes detected, not_detected and unknown
on JS Sentry error events. It never suppresses failures. An absent marker does
not prove a human device and cannot retrospectively attribute old incidents.

- Fresh focused regression: 10 suites, 168 tests passed.
- Exact Android native preparation and release JS export passed.
- Export retains the reviewed URI decoder repair and excludes five previously
  assessed build-tool advisory roots from the runtime source map.
- Prior same-source offline native verification: four 59-assertion marker
  controls passed on API 30 with real Expo/Hermes/JSI and Sentry normalization,
  no INTERNET permission. See scripts/android-expo-read-probe/README.md.
- The earlier POST repair also passed native controls and command regressions;
  see ANDROID_27_POST_504_INVESTIGATION_2026-10-04.md. These checks do not prove
  production root cause or physical tester acceptance.

## Build and cost boundary

`node scripts/android-diagnostics-28.mts verify` rechecks the immutable candidate.
Launch is single-attempt Android production medium, frozen credentials, no
automatic version increment or submission. The guard refuses active/newer jobs,
stale/failed tests, changed source and inadequate included credit. Never retry an
ambiguous launch. October 4 23:38 UTC: $45 included, $41 used, $4 remaining;
reserve $1 for known build 27 within the provider's 24-hour accounting delay and
$1 for this build. Fresh preflight is mandatory at launch; no overage allowed.
The launch preflight reverified those values at 23:43:41 UTC and saved
`cost-preflight.json`; `attempt.json` and `build.json` identify the single job.
[Expo pricing and accounting delay](https://docs.expo.dev/billing/usage-based-pricing/).

## Submission and monitoring

After the exact job finishes, download its AAB and verify SHA-256. Inspect Play
publishing overview, releases and drafts again; reuse an exact build-28 draft,
never duplicate it. Stop for newer conflicts or unrelated pending changes.
Preserve audience, country, credentials and full rollout only within Alpha.
Do not publish public production or automatically enforce an update.

Destination: package `com.doit.challengeapp`, developer `6661342012009308283`,
app `4972908027141050312`, Alpha track `4699325792611215201`.
[Alpha track](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/tracks/4699325792611215201).

Release notes:

> Improved Android error reporting to help distinguish automated testing and
> investigate intermittent loading or action failures.

Verify actual review submission; build completion and AAB upload are not review
submission. Notify on submission and confirmed tester availability, not unchanged
pending states. On failure, access/upload blocker or rejection report the exact
blocker and pause, without retries or bypasses. No Sentry resolution/muting.
Only installed build 28 can supply the new evidence. All older monitors remain
unchanged. Evidence lives under test-results/android-diagnostics-28.
