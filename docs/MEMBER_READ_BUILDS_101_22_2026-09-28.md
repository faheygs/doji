# Member-read reliability builds: iOS 101 / Android 22

## Authorization and boundaries

Owner requested fresh builds for both platforms on September 28, 2026. Version remains **1.0.8**, bundle/package `com.doit.challengeapp`. iOS uses the existing automatic TestFlight upload workflow. Android produces an AAB only; this run does not submit or roll out a Google Play release. No App Store public review submission, update enforcement, backend, database, Worker, portal, billing, or credential changes are included.

The previous Android 21 enforcement monitor remains on hold. Do not enforce either new build before verified distribution and device qualification. Physical-device testing and sustained-load qualification remain outstanding; passing build checks does not establish 100,000-user capacity or eliminate provider/network failures.

## Preflight evidence

- Signed-in Expo Starter billing showed $26 used of $45 included credit, leaving $19. Official medium pricing is $2 iOS + $1 Android. A $6 delayed-usage reserve was retained; the pair fits existing credit with no additional spend expected. No plan or resource-class change.
- Fresh EAS history showed iOS 100 and Android 21 finished, no active platform builds, and no prior use of 101/22.
- Full regression: **140 suites / 1,228 tests passed**.
- TypeScript and full ESLint passed.
- Both production JavaScript exports passed. Local export validation used `--no-bytecode`; cloud native builds retain the normal Hermes configuration.
- `test-results/mobile-release-101-22/manifest.json` records 345 mobile-only candidate file hashes. Verified against the tested workspace immediately before each launch. Portal, database, infrastructure, docs, tests, and local secrets are not uploaded.
- Existing EAS production environment, medium workers, and remote signing credentials are used with `--freeze-credentials`; auto-increment is disabled.

See `MEMBER_READ_AUDIT_NEXT_BUILD_2026-09-28.md` for repaired contracts and incident limitations. Included work covers shared read deadlines, bounded retries, HTTP/SQL error classification, poll reads, auth-wait recovery, and native push registration retry. Alerts remain enabled; historical generic events are not claimed conclusively diagnosed.

## Exact jobs

| Target | Job | Initial result |
| --- | --- | --- |
| iOS 1.0.8 (101) | [EAS build](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/656091cd-e218-46fc-86c9-be9bb3c61b46) | Accepted |
| iOS TestFlight upload | [EAS submission](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/5b8137ba-b1cd-44f7-aead-8e3217e0dd26) | Scheduled after build |
| Android 1.0.8 (22) | [EAS build](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/cf3d2743-b4e5-4712-8319-555ed8986619) | Accepted; AAB only |

Both launch commands returned successfully. Preserve exclusive `*-attempt.json` markers and saved job results under `test-results/mobile-release-101-22`; never retry an ambiguous launch or failed build automatically.

Read-only verification: `node scripts/mobile-read-release-status-101-22.mts`. It validates the exact project/version/build and records `latest-status.json`; it cannot create, retry, submit, or publish builds. EAS submission completion is not proof that Apple has finished processing or that the build is visible to testers.

## Verified completion updates

- September 28, 2026, 16:26 UTC: iOS 101 build and its exact scheduled EAS submission both verified `FINISHED`, with no reported error. Upload to Apple is complete; TestFlight processing/visibility is not independently verified. This iOS outcome was reported to the owner; do not notify it again.
- At the same check, Android 22 remains `IN_PROGRESS`. Continue the read-only monitor for its terminal outcome; no Play submission is scheduled.
- September 28, 2026, 16:31 UTC: Android 22 verified `FINISHED`, completed at 16:30:20 UTC with no reported error. AAB build only; not submitted to Google Play. Android completion reported to the owner and the build heartbeat deactivated; both platform outcomes are now reported. Device qualification and store rollout remain separate steps.

## Android tester submission follow-up

Owner subsequently requested submission so testers can receive Android 22. Scope is the existing **Closed testing - Alpha** track (`4699325792611215201`), preserving its audience, countries, production track, and update enforcement. Fresh Play inspection confirmed 21 available to selected testers and no unpublished changes before starting.

Downloaded the exact finished EAS build to `test-results/mobile-release-101-22/doji-1.0.8-22.aab`: 95,192,910 bytes, SHA-256 `e99017df8e267728dcef822108d690dcb9803440e6922b819989efb5100f9d1a`. Uploaded through Play Console to release **13**. Do not create a duplicate draft or rebuild.

Draft: https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/tracks/4699325792611215201/releases/13/prepare

Release name: `22 (1.0.8)`. English release notes describe loading/recovery and notification-registration improvements without claiming all failures resolved.

**Submitted September 28, 2026:** Play processed the AAB as 22 (1.0.8), API 24+, target SDK 36, four ABIs, with native debug symbols attached. Supported-device counts are unchanged (phones 12,266; tablets 6,455; TV 3; Chromebook 10; Android XR 1). No blocking errors; the existing nonblocking missing R8/ProGuard mapping-file warning remains. No mapping file or optimization settings were invented/changed.

Saved 100% rollout to the existing Alpha audience. Publishing overview contained exactly one change: **Closed testing - Alpha / 22 (1.0.8) / Start full rollout**. Clicked Submit 1 change for review and confirmed Send changes for review. Verified **Changes in review**, with quick checks running and submission continuing automatically once checks complete successfully. Managed publishing remains OFF. Approval and actual tester availability are not yet verified; this is not a public-production rollout. No audience, countries, credentials, billing, or mandatory-update policy changes.

Proof: `test-results/mobile-release-101-22/android-22-submitted.png`.

## Device qualification checklist (required before wider rollout)

Install the exact new build and check signed-in startup, profile/feed/comments, friends and reactions, leaderboard, submitted ideas, owned shop items, poll totals/voters, notification dismissal/clear, and push registration. Exercise Wi-Fi/cellular changes, brief offline recovery, background/foreground, and the daily challenge window. Correlate any new Sentry events by exact distribution (101 or 22), status/deadline telemetry, and timestamp. Do not declare failures resolved solely because older-build alerts continue or cease.
