# Notification test builds — 1.0.8 / iOS 99 / Android 20

Owner explicitly approved both builds, build-number increments and TestFlight
installation. Created September 26, 2026 MDT (September 27 UTC). These are test
candidates, not public releases. Physical-device acceptance remains outstanding.

## Preflight and cost boundary

Signed-in Expo dashboard showed Starter, $20 / $45 build credit used ($25 remaining),
one included concurrency, and the existing $19 monthly plan estimate. EAS history
confirmed earlier iOS 98 and Android 19 finished; no newer platform build was present.
At medium rates this pair uses $3 in included credit. Even conservatively reserving
$6 for earlier failed/retried jobs not yet reflected by delayed billing, it fits the
observed allowance. No plan/add-on/payment/spending-setting changes were made.

[Expo billing](https://expo.dev/accounts/faheybaby/settings/billing) and
[usage pricing / possible 24-hour reporting delay](https://docs.expo.dev/billing/usage-based-pricing/).

## Verified input boundary

`scripts/notification-test-builds-99-20.mts` prepares and checks 339 mobile files in
`test-results/notification-release-99-20/upload`. Both platforms use that exact
package, with `EAS_NO_VCS=1` and the absolute candidate `EAS_PROJECT_ROOT`.
Only six paths differ from the build-98 input manifest: the four repaired existing
runtime files, new notification-history helper, and `app.json`. App configuration
differs only in iOS build 98 -> 99 and Android versionCode 19 -> 20. Version remains
1.0.8. Dependencies, lockfile and signing/environment contracts are unchanged.
No portal/backend/database files or local environment secrets are in the archive.

The repair passed 127 suites / 964 tests and full lint. TypeScript and manifest checks
were repeated after the version increment. Both platform JS bundle exports passed.
`--no-bytecode` was used only for local bundle validation, not the cloud native builds.
Local prepare initially hit Node's self-subdirectory copy guard; no cloud build was
created by that failed preparation. Packaging was corrected using EAS's existing
ignore rules and verified against the previous manifest before launch.

## Exact jobs — do not duplicate

- iOS build: `bd0f89d6-8b3b-4db1-b5c8-e407b43a3330`, 1.0.8 (99).
  [Build](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/bd0f89d6-8b3b-4db1-b5c8-e407b43a3330).
- Scheduled iOS submission: `0a8a9018-69ed-4033-88b4-203cc7b795ce`.
  [Submission](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/0a8a9018-69ed-4033-88b4-203cc7b795ce).
  Existing signing/API credentials; testing submission profile; no App Store review.
- Android build: `4dae212d-8d6a-4dff-ac56-7db183fe7801`, 1.0.8 (20).
  [Build](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/4dae212d-8d6a-4dff-ac56-7db183fe7801).
  AAB artifact only. No Play submission scheduled; existing submission-key limitation
  is unchanged. Upload to internal testing is a separate remaining step.

One-shot markers and filtered job records are under
`test-results/notification-release-99-20/`. Never rerun a launch marker, rebuild or
submit again without reconciling these exact IDs. Job creation is not successful
compilation, Apple acceptance or TestFlight installability. No OTA, update-enforcement,
portal or backend deployment was made. See `NOTIFICATION_REPAIR_2026-09-26.md` for
device acceptance and the unresolved historical Sentry event.

## Google Play upload and review preparation

The owner subsequently requested making Android build 20 available to current
Android users. Live Play Console inspection showed those users are on Closed
testing - Alpha, version 17 (1.0.7), not Internal testing. Reused the existing
empty Alpha release draft (release 11); did not create a production release.

Downloaded the exact finished EAS build above to
`test-results/notification-release-99-20/doji-1.0.8-android-20.aab`
(95,190,978 bytes, SHA-256
`5856C3E43055B403FBE6E1E0F20C21EE335866C0097A28B2BFC0E2F525A37FF8`).
The owner enabled the browser extension's file access after the first upload
attempt was blocked. The retry completed: Play confirmed one bundle uploaded,
version 20 (1.0.8), API 24+, target SDK 36, with native debug symbols attached.
Validation showed no blocking errors and no reduction in supported devices.
One nonblocking warning remains: no deobfuscation mapping file is attached.

Saved the release and notes to Publishing overview. The only pending change is
Closed testing - Alpha / 20 (1.0.8) / Start full rollout (100%). Managed publishing
is off, so submission can automatically release to eligible Alpha testers after
Google's checks/review. At this checkpoint quick checks are running and the
change had NOT been submitted for review; final submission confirmation was pending.
Physical-device acceptance remains outstanding. No new build, credentials,
backend, portal, iOS, or mobile release-policy changes were made.

[Publishing overview](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/publishing).

### Approved submission

After the owner's explicit approval, submitted the sole pending change and
confirmed Google's "Send 1 change for review" dialog. Publishing overview now
shows **Changes in review**, Closed testing - Alpha / 20 (1.0.8) / Start full
rollout. Quick checks are still running; the page says changes will be sent for
review as soon as checks complete successfully. This confirms the submission
request, not approval or update availability. Managed publishing remains off.
Evidence: `test-results/notification-release-99-20/android-20-submitted.png`.

### Local artifact recovery note — September 27 audit

A test runner's default output cleanup later removed earlier repository-root
test-results artifacts, including the screenshot referenced above and packaging
manifests/launch markers. Those historical paths are no longer available. The
exact Android AAB was recovered from the existing EAS build and its SHA-256
matches the value recorded above. Builds and the Play submission were unaffected.
Missing local markers must never be treated as permission to duplicate release
work. See `PORTAL_WORKFLOW_AUDIT_2026-09-27.md` and the restored download folder's
`RECOVERY-NOTE.md` for the incident and verification limits.
