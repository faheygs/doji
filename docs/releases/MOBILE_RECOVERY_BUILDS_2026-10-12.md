# Mobile recovery builds — October 12, 2026

## Authorization and status

The owner requested iOS and Android builds, then explicitly approved $3 expected
total additional EAS usage: one medium iOS attempt ($2), one medium Android
attempt ($1). Initial authorization excluded automatic retry, store submission,
release and update-policy changes. The owner subsequently explicitly authorized
TestFlight upload, App Store review and existing closed Alpha review on October
12; verified results are below. No public iOS release or mandatory-update change
was performed.

At launch, Starter's included build credit was fully used ($45/$45); the last
20 EAS builds showed no unknown active job, recent unreconciled usage or conflict
with iOS 105 / Android 30. Billing settings and plan were not changed. $3 is the
expected build charge, not a verified final invoice or provider-side spending cap.

| Platform | Version/build | Exact EAS job | Launch state |
| --- | --- | --- | --- |
| iOS | 1.0.10 (105) | [0f532f3d-e133-4ce6-af84-16af6f574e26](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/0f532f3d-e133-4ce6-af84-16af6f574e26) | Accepted; subsequently IN_PROGRESS |
| Android | 1.0.10 (30) | [339a32a2-c5d8-4d40-b6d9-3cab4b580e5b](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/339a32a2-c5d8-4d40-b6d9-3cab4b580e5b) | Accepted |

Both exact jobs subsequently finished successfully: iOS at
`2026-10-12T18:11:07.522Z`, Android at `2026-10-12T18:28:20.161Z`.
Both cloud logs confirm Sentry file upload; iOS also reports uploaded dSYMs.
This is upload evidence, not proof of readable real-device events or behavior.
Never launch another job to check status. The release helper writes an immutable attempt marker before
launch and refuses repeats, including after an ambiguous CLI response.

## Verified store submissions — October 12

- **iOS 1.0.10 (105):** uploaded through EAS submission
  [`52fc4d37-deb3-4e80-860a-f33e85d05262`](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/52fc4d37-deb3-4e80-860a-f33e85d05262),
  verified FINISHED. Processed Apple build `180d89b3-f4c0-4eda-8223-1c9073b35c22`
  is assigned to the existing Doji Testers internal group (six testers), with
  testing notes saved. App Store submission
  [`95a67fed-9b04-40a7-8090-cdad24f18eff`](https://appstoreconnect.apple.com/apps/6768727326/distribution/reviewsubmissions/details/95a67fed-9b04-40a7-8090-cdad24f18eff)
  shows **Waiting for Review**, submitted October 12 at 2:49 PM MDT, one item:
  1.0.10 (105). Manual release after approval is preserved.
- **Android 1.0.10 (30):** uploaded the exact finished AAB through Play Console
  to existing Closed testing – Alpha, track `4699325792611215201`, release `20`.
  Publishing overview confirms **Changes in review**, 30 (1.0.10), Start full
  rollout. This is only the existing closed Alpha audience, not production.
  Existing managed publishing remains off, so approved changes publish to that
  track automatically. Quick checks were still running at submission. The sole
  preview warning was a missing R8/ProGuard deobfuscation file; native symbols
  were attached. Supported-device counts and audience were unchanged.
- Release notes describe push recovery, support diagnostics, temporary post-read
  retry, poll suggestions and notification activity. Existing Apple screenshots,
  description, review credentials, access instructions and privacy declarations
  were preserved; the review-notes version paragraph was updated to this build.
- EAS rejected the optional CLI TestFlight changelog before creating a job
  because that flag requires Enterprise. The normal upload then succeeded;
  testing notes were saved directly in App Store Connect. No plan change,
  duplicate build or extra submission job was created.

`scripts/mobile-store-artifacts-20261012.mts` verifies pinned finished jobs and
Sentry-upload evidence and downloads exact artifacts to ignored release storage.
It cannot build or submit. Artifact SHA-256 values:

- IPA (26,790,671 bytes): `93fdd65e345a67fc5c62483c63f58c38a67bebeff13d22ecd61307630c675962`
- AAB (95,176,669 bytes): `959c826045a0d6308d45a2ce8e66264cf5854b8b957d34f489ba93d4ede8a9d8`

Private screenshot receipts are under `D:/ChallengeApp/DoIt/test-results/`:
`ios-105-testflight-20261012.jpg`, `ios-105-app-review-20261012.jpg`, and
`android-30-review-20261012.jpg`. Submission does not mean store approval,
physical-device acceptance, public iOS release or mandatory-update enforcement.

## Frozen source and build scope

Prepared from reviewed source `484d882a2913ff8ea512384050ee4e12d329a2d2`, whose
tree matches main merge `55d3eaa69903609872aaa07a542844e9be6a5c35`, at
`C:/Users/gfahe/.codex/worktrees/quality-gates/DoIt`. Do not use the older owner
checkout or root app-version template as the release candidate.

`scripts/mobile-recovery-release-20261012.mts` composes separate frozen uploads
under ignored `test-results/mobile-recovery-20261012/{ios,android}/upload`:

- Verify every file in the preserved 1.0.9 platform-specific baseline manifests.
- Apply 21 reviewed runtime files from the October 8 recovery scope, current
  approved dependency patches and the reviewed lockfile. Preserve each platform's
  native configuration, package scripts and allowlist; add Metro config only.
- Set 1.0.10 / 105 or 30; retain production resource classes and remote signing.
- Android's existing JS plugin entry uses compiler-generated output from the
  reviewed CTS Expo observer patch, now pinned to Expo 57.0.28 and its verified
  source hash. iOS does not gain the Android plugin.
- Keep original release/overlay evidence intact. Exclude tests, credentials,
  backend/portal code, local environment files and private evidence from uploads.

Included functionality is described in [the preparation record](NEXT_MOBILE_BUILD_2026-10-08.md):
account/foreground-bound push registration recovery, privacy-bounded Sentry
correlation, source maps, support diagnostics/share, reserved poll Other handling,
post read retry and notification acknowledgement race guards. This is not a new
backend deployment or a claim that all network timeouts have been eliminated.

## Local verification

- Fresh locked dependency install in each frozen upload.
- Exact-candidate regression: **67 suites / 951 tests passed per platform**;
  zero failed tests. Includes push-recovery integration, auth isolation, realtime,
  notification routing/lifecycle, upload interruption, support and native guards.
- Both local production exports contain matching runtime/map Sentry Debug IDs
  and map the capture site back to the correct TypeScript source and line.
  Local exports used no bytecode solely for inspecting map positions; the EAS
  production configuration retains normal Hermes behavior.
- Native module resolution verifies expo-network on both platforms. Isolated
  Android prebuild verifies one installer before React startup, the exact Java
  helper and one hash-guarded Expo passive observer.
- Release helper tooling typecheck, source-size, hygiene and TypeScript migration
  gates passed. Evidence is private/ignored, not a replacement for device checks.
- The first QA run lacked three test-support dependencies (migration fixtures,
  CTS plugin and an operational-health module). Its failed evidence is retained.
  Adding those files to QA only made the unchanged tests pass; neither upload
  candidate nor test assertions were modified to bypass a failure.

Hashes, manifests, source-map proofs, native proof, test results, cost checks and
launch receipts are under the ignored release directory. Do not commit provider
payloads, signing material, binaries or reset links.

## Remaining acceptance and rollback

The owner authorized store submissions; exact-job and upload checks passed as
recorded above. Still run the physical-device checklist in the preparation record,
including background/resume, account changes, notification permissions, recovery
correlation/readable Sentry stacks, support share/email, post retry, upload and
large-text/light-dark behavior. Automated mocked tests cannot certify those.

No database, Worker, portal, member-auth policy, mandatory-update policy or
provider alert rule was changed. Store version/release metadata and review
submissions changed as recorded above. If acceptance fails, cancel pending review
or halt the closed-track rollout as appropriate; do not manually release iOS.
Already installed binaries cannot be remotely downgraded. Retain the baselines
and failure evidence. Another billable attempt requires owner approval.
