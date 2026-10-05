# Doji 1.0.8 — iOS 100 / Android 21

## September 28 follow-up candidate and hold

See `MEMBER_READ_AUDIT_NEXT_BUILD_2026-09-28.md` for the expanded audit and
**140 suites / 1,228 passing tests**. Older member reads now share the same
status/deadline handling, including comments/friendship/nested profile reactions;
poll summary/voter reads, SDK retry multiplication and stalled-auth/body read
settlement are covered.
No replacement build or deployment has occurred. The earlier follow-up below
records the preceding checkpoint, not the final coverage.

See `ANDROID_21_INCIDENT_FOLLOWUP_2026-09-28.md`: nine affected member reads now
retain HTTP status/abort provenance and use the existing bounded recovery correctly.
Reaction prefetch is also covered; native Firebase token failures now use the
existing bounded push-registration retry budget. **Queued only** per the owner's
latest request; no replacement build launched. 137 suites / 1,104 tests,
TypeScript and changed-file lint pass. These changes are
not in iOS 100/Android 21 and have not been built or deployed. The historical 504
remains uncorrelated; mandatory-update monitoring stays paused. Play now lists
21 (1.0.8) serving on closed Alpha, which does not establish global eligibility.

## Scope and approval

Owner requested builds and submissions for both platforms. Destinations remain
TestFlight and Google Play **Closed testing – Alpha**, not public production.
No portal, Worker, database, credentials, billing, OTA, or update-enforcement changes.
No announcement has been created or published.

The mobile candidate includes the previously reviewed empty-announcement fix,
portable request timeout/cancellation errors, awaited feed transport lifetime, and
bounded privacy-safe failure diagnostics. Existing notification behavior, atomic
commands, session isolation, and participation timing remain unchanged. See
`MEMBER_QUERY_FIXES_NEXT_BUILD_2026-09-27.md` and `PERFORMANCE_REPAIR_2026-09-28.md`.

## Validation and no-new-cost preflight

- Full Jest: **134 suites / 1,042 tests passed**.
- TypeScript and full ESLint: passed.
- Installed React Native abort-polyfill / pending feed transport probe: passed.
- Both production JavaScript exports: passed. Local exports disable bytecode only
  for this validation; cloud production native builds retain their normal config.
- Signed-in Expo billing: existing Starter plan, $26/$45 credit used, **$19 left**.
  Medium-size pair uses $3 included credit; an additional $6 delayed-usage reserve
  was allowed for preflight. No overage or new service authorized.
- Sentry Developer: 101/5,000 errors, $0 extra spend; no settings changed.
- EAS preflight: no running jobs, latest finished numbers 99 and 20.
- Play Console preflight: 20 available to Alpha testers, no unpublished changes.

## Exact jobs

- iOS 100: `8336ddad-fda7-4594-a3a2-f05ddca4d7e3`
  https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/8336ddad-fda7-4594-a3a2-f05ddca4d7e3
- Scheduled TestFlight submission: `8b882c40-72b9-4363-97c3-1b9c0c806fd6`
  https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/8b882c40-72b9-4363-97c3-1b9c0c806fd6
- Android 21: `631e2671-f874-42f0-a5da-2d90232984d5`
  https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/631e2671-f874-42f0-a5da-2d90232984d5

Builds launched once at approximately 04:15 UTC. iOS build completed successfully at
04:22:40 UTC; its existing TestFlight submission **succeeded at 04:26 UTC**, confirmed
on the exact EAS submission page with version 1.0.8 (100). Apple TestFlight processing
and availability have not yet been verified in the expired App Store Connect session.
Android build completed successfully at **04:37:37 UTC**. Its exact signed AAB was
downloaded to `test-results/mobile-release-100-21/doji-1.0.8-21.aab` (95,192,369 bytes;
SHA-256 `1fd214c69b852b2c35e3374a71b08b3acb58fc6f754e1cdc9ae66af9528c6915`).

**Android submitted at approximately 14:19 UTC September 28:** the owner selected
the saved AAB. Play finished processing it and identified version **21 (1.0.8)**,
API 24+, target SDK 36, four ABIs and attached native debug symbols. Supported
device counts are unchanged: phones 12,266; tablets 6,455; TV 3; Chromebook 10;
Android XR 1. No blocking errors. One nonblocking warning remains for the missing
R8/ProGuard deobfuscation mapping file, also recorded for build 20; no mapping file
was invented and no optimization/build settings were changed during submission.
Android's optimization guidance was reviewed at
https://developer.android.com/topic/performance/app-optimization/enable-app-optimization .
This warning remains a diagnostics follow-up, not a claim that all symbolication
paths have been verified.

Only one pending publishing change was present: **Closed testing - Alpha / 21
(1.0.8) / Start full rollout**. Saved and explicitly sent that change for review.
Play now displays **Changes in review**, with its automatic quick checks still
running and submission continuing automatically after successful checks. Managed
publishing remains OFF as before; approval should make the release available to the
existing Alpha audience. It is not yet verified available to testers. No production
track, audience, credentials, billing, or other publishing changes were made.
Proof: `test-results/mobile-release-100-21/android-21-submitted.png`.

Historical upload blocker, now resolved by the owner's manual file selection: both the
Upload button and exact `.aab` file input failed to expose Chrome's file chooser;
neither automated attempt reached `setFiles`. No bundle upload or rollout occurred then. The browser
connection reset on the second timeout and was recovered; the saved draft was then
verified with "Changes saved". User was asked to enable the extension's file-URL access
or manually upload the AAB, after which the same approved submission can continue.
Do not create another cloud build or another Play draft.

Draft: https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/tracks/4699325792611215201/releases/12/prepare

App Store Connect browser login was requested for post-upload verification. A build
or successful EAS upload is not by itself confirmation of TestFlight availability.
Screenshots are saved alongside the candidate as `ios-submission-succeeded.png` and
`android-draft-awaiting-upload.png`. Browser draft retained for handoff.

## Candidate and evidence

`scripts/mobile-query-builds-100-21.mts` prepared a fresh, hash-verified 340-file
mobile-only upload in `test-results/mobile-release-100-21/upload`. The existing EAS
ignore rules exclude portal/backend/database/test/docs files and local secrets.
Only existing remotely managed signing/submission credentials are used. Local build
numbers are 100/21; version remains 1.0.8. Both cloud launches use frozen credentials.

The prior 99/20 source manifests are no longer available (see their release record),
so this is not represented as a byte-for-byte comparison against their old archive.
The current candidate is verified against the tested workspace and fresh manifest.

Evidence directory includes manifest, no-cost preflight, bundle logs, launch markers,
exact build IDs, and filtered status. `scripts/mobile-query-release-status-100-21.mts`
only reads these exact EAS jobs; its explicit download mode saves the finished
Android artifact and SHA-256. Never blindly repeat a launch after an ambiguous error.

## Device and release gates

### September 28 Android 21 alert investigation — enforcement hold

Owner supplied a Sentry digest for 14:22–14:26 UTC (08:22–08:26 MDT).
Read-only Sentry inspection confirmed **dist 21, release 1.0.8**, production,
handled errors in all six issue groups:

- `7759339049` / userEvent (two events; latest
  `e4d0b4e9890141b1ad573823c0f8bacd`).
- `7759346455` / mobileReleasePolicy (`d6c855947ef149e78419bc12a5099b95`).
- `7759342740` / friends (`11840e687c124a67b54a4ee974445e14`).
- `7759342733` / userBadgeProgress (`f26621d73dda4d99b6f2b3a554f4ec30`).
- `7759341088` / leaderboard (`a6c51976d7434e5f998ba7aa51024f69`).
- `7759341502` / mark_notification_attention_seen
  (`1e96f30f54334473879618b597cc909e`): context contains status **504**,
  code **DOJI_COMMAND_ERROR**, kind timeout.

The five query event contexts contain only api_object/unexpected, with no retained
HTTP status, SQLSTATE or abort provenance. The corresponding query code still
throws raw API error envelopes; previous normalized-query fixes did not cover all
these paths. This is a confirmed diagnostic gap, not proof that cancellation,
network, database load or any particular server was the historical root cause.
No device/user correlation is possible from these sanitized events, and no crash,
data-loss, or failed push-delivery conclusion follows from them. Notification
attention acknowledgement is not itself the push-send or notification-dismiss RPC.

The Android approval/enforcement heartbeat is **PAUSED** on this concrete release
readiness blocker, under its stop-for-direction rule. No update policy was changed,
no Play release cancelled, and no Sentry issue resolved/archived/muted. iOS public
review submission remains unsent. Do not resume mandatory enforcement solely on
Alpha availability/eligibility until this incident has been investigated and owner
direction recorded. Next investigation: correlate the exact UTC window with
existing command-gateway and Supabase logs, then reproduce deadline/error handling
locally before deciding corrective scope. No production code change was made.

### September 28 follow-up: store review and Android enforcement

Owner requested mandatory Android 21 updates after approval and public App Store
review for iOS 100. The heartbeat
`watch-android-21-approval-and-safe-update-enforcement` checks every five minutes,
remaining quiet on unchanged pending review. It must verify actual full availability,
not merely review approval, before any enforcement write.

Safety gate: Android 21 was submitted to **closed Alpha**, while the current update
policy applies globally to all Android installs. Owner confirmation that all current
Android users can access Alpha is pending; otherwise enforcement must remain held
until the release is accessible to all affected users. The heartbeat must report
and pause on a concrete blocker, never lock out ineligible users.

Bounded read-only production check found Android latest/minimum **1.0.7 (17)**,
enabled, and iOS latest/minimum **1.0.7 (90)**, enabled. Neither row was changed.
These are evidence snapshots, not values to blindly restore over newer changes.
Any authorized Android write requires a fresh two-row snapshot, atomic concurrency
protection on Android alone, version-comparison/RPC verification, and unchanged iOS
verification. Rollback restores the captured previous Android policy only if no
subsequent policy change has occurred. No app, portal, Worker or database schema
deployment is included in this scope.

App Store Connect still redirected to expired login. A sign-in handoff is open for
app 6768727326; iOS build 100 has **not yet been submitted for public App Store
review**. Owner was asked to confirm exact-build device checks. Do not claim those
checks or public review are complete based on the successful EAS/TestFlight upload.
Do not change iOS update enforcement as part of this request.

After the owner restored Apple sign-in, created the missing public **1.0.8** version
(the existing public version is 1.0.7, build 91), attached processed **build 100**,
saved the release notes, corrected the review-note version/build, and selected
**manual release**. Existing screenshots, review credentials, privacy metadata and
rating were preserved. Removed the unverified historical 4,000-Sparks balance
claim from reviewer notes. Apple accepted Add for Review and now shows a draft with
one item **1.0.8 (100), Item Ready to Submit**. The final **Submit for Review** button
has NOT been clicked: exact-build device and reviewer-login confirmation remains
pending. Proof: `test-results/mobile-release-100-21/ios-100-ready-for-review.png`.
The draft is retained at App Store Connect for the next turn; do not create another
version or duplicate submission. No new builds, costs, backend changes, or update
policy changes were made.

After installation on both platforms: cold start / foreground, profile, feed,
comments, idea history, no-eligible-announcement state, offline/reconnect, account
switching, notification swipe / clear-all, 20-minute pre-live and 10-minute authorized
participation/direct-to-feed. Do not publish an announcement to production as a test.
Review new-build Sentry failures without muting old-client errors.

Automated success is not proof of physical-device behavior or 100,000-user capacity.
No large production load test was run. If a regression appears, pause further test
distribution and prepare a narrowly scoped corrective build under separate approval;
do not revert unrelated changes or change the already-deployed backend.
