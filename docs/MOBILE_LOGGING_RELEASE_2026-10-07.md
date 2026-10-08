# Mobile logging release — 1.0.9, iOS 104 / Android 29

## October 7, 23:08 UTC — mandatory updates enabled

Owner reported releasing iOS1.0.9 and authorized enforcement on both platforms
when available. Fresh ASC read confirmed exact104 Ready for Distribution. Public
US listing and lookup still returned1.0.8, so enforcement waited for the owner's
explicit confirmation that1.0.9 could be downloaded from the regular App Store,
not TestFlight. Cross-storefront propagation was not independently proven.

Fresh Play release19 read confirmed29(1.0.9), Available to selected testers,
100% rollout,1/1 country. Owner explicitly confirmed all current Android users
remain Alpha-eligible and can download it. This is not public production access
or proof that users installed29.

One concurrency-guarded transaction changed minimum/latest to iOS1.0.9(104) and
Android1.0.9(29), enabled, at `2026-10-07T23:08:13+00:00`. Existing store URLs,
messages and all other fields were preserved. Fresh exact-row checks and the
existing `get_mobile_release_policy` RPC under anon/authenticated roles passed
for both platforms. Ten exact-version decision checks and focused strict
TypeScript compilation and nine existing Jest policy tests passed. The first
Jest attempt hit a sandbox cache EPERM; the bounded workspace-cache run passed.
No client, schema, auth, Worker, portal, build,
store rollout, spending or monitor changes were made.

Operational script and write-once evidence live in the linked primary checkout:
`D:/ChallengeApp/DoIt/scripts/mobile-policy-20261007.mts` and
`D:/ChallengeApp/DoIt/test-results/mobile-policy-20261007/` (before/attempt/after,
apply SQL, concurrency-guarded rollback SQL, verified RPC results).
Never rerun apply or rollback automatically. A newer policy aborts either write.
The existing client discovers policy on query mount; fully close/reopen for a
fresh read. Ordinary foreground alone is not guaranteed to refresh the policy.

Owner authorized both builds on October 7, 2026 (America/Denver). This approval
does not submit to either store, publish, change update enforcement, retry failed
jobs, start recurring monitors, or authorize overage spending.

## Frozen scope

- iOS baseline: immutable 1.0.8 (103), EAS `42873c98-ce5a-430e-b7f8-ea75033bb023`.
- Android baseline: immutable 1.0.8 (28), EAS `f5c46c14-8eb1-427d-9ca0-7a4ac08e319b`.
- Candidate/evidence root: `test-results/mobile-logging-20261007-v109` in the
  `quality-gates/DoIt` worktree. Per-platform SHA-256 manifests freeze upload files.
- Initial 1.0.8 local drafts in `test-results/mobile-logging-20261007` are superseded;
  they were never launched. 1.0.9 is used because iOS 1.0.8 was already released.
- Only explicit diagnostics overlays, `expo-network` 57.0.2, and release metadata
  are changed. Unrelated mobile edits, portal, Worker, database, and release-policy
  changes are excluded. Existing frozen build glue and URI security repair remain.
- No networking deadlines, retries, auth semantics, grouping, alert budgets,
  sampling, challenge timing, or member-write behavior are intentionally changed.
- Diagnostics provide bounded installation/session correlation, allowed device
  facts, navigation/network/lifecycle context, request phases/status/timing,
  retry/recovery evidence, and allowlisted server correlation IDs. No passwords,
  tokens, request bodies, raw URLs, named-member identity, or IP/SSID are added.
- This is not evidence that the production timeout origin is repaired. Missing
  Test Lab attribution is not evidence that a device is a human tester.

## Verification and launch controls

- 105 suites / 1,287 tests passed on the exact overlaid source. Evidence copied to
  the final-version folder without claiming a second test run; only app metadata
  differs from the initial package. App and tooling TypeScript checks passed.
- Exact final-version JavaScript exports on both platforms verify diagnostic
  modules and repaired URI decoder inclusion. Local exports disable bytecode and
  Sentry upload solely for inspection; cloud production settings are unchanged.
- Every non-root candidate lockfile entry matches the installed dependency tree.
- `expo-network` 57.0.2 resolves for both native platforms; Android native generation
  verifies the single preserved observer attachment before React Native startup.
- iOS native compilation and physical-device acceptance are NOT local passes.
- Guarded launcher: `scripts/mobile-logging-20261007.mts`. Launch has per-platform
  write-once attempt records, no automatic retry, frozen credentials, and no auto-submit.
- Preflight initially showed $45 included / $42 used, leaving $3. Medium Android
  is $1 and medium iOS is $2. Latest project history had no active or previous-day
  jobs. Credit and history are rechecked immediately before each launch with a
  conservative reserve for the other new job; stop on uncertainty or insufficiency.
- Pricing basis: https://docs.expo.dev/billing/usage-based-pricing/.

## Release gates after successful builds

Confirm exact artifacts, source-map upload and readable events for each exact build.
Test sign-in/session, today's Doji, submission/feed, comments/reactions, Shop,
background/reopen, and network recovery on native devices. Do not transfer prior
103/28 acceptance. Android tester acceptance remains outstanding.

Review App Store privacy and Play Data Safety for the new diagnostic installation
identifier before submission. Store availability and enforcement require separate
verified steps. No app users receive this logging merely because EAS finishes.

## Status

Both exact cloud jobs were successfully created on October 7, 2026:

- Android 1.0.9 (29): `10041d43-e34e-4baa-b4e6-802668e3f345`, created
  `2026-10-07T14:38:49.927Z`; observed IN_PROGRESS at the iOS preflight.
  https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/10041d43-e34e-4baa-b4e6-802668e3f345
- iOS 1.0.9 (104): `707f0753-3f70-4a22-a8f5-ce3d0aac6a49`, launch response NEW.
  https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/707f0753-3f70-4a22-a8f5-ce3d0aac6a49

Each platform has a write-once `attempt.json`, `cost-preflight.json`, and
`build.json`. The first iOS execution request was rejected before process creation
because review referenced the superseded prepare-only request. A fresh read-only
credit check and the latest explicit owner build authorization cleared the same
guarded launch; there was only ONE actual iOS launch. No cloud job was retried.

## Verified completion and store handoff — October 7

Owner subsequently authorized submission to Android and Apple, and explicitly
approved the accurate Apple Other Diagnostic Data disclosure update.

- Both exact jobs FINISHED: Android at `2026-10-07T15:01:08.857Z`, iOS at
  `2026-10-07T14:47:48.711Z`. Both cloud logs confirm Sentry source-map upload;
  this is not confirmation of readable future production events or device acceptance.
- Downloaded artifacts are recorded under the frozen evidence root:
  - `android/doji-1.0.9-29.aab`, 95,251,200 bytes, SHA-256
    `fd99d354a6d573e6a6b0861aa6842520a3e970d5ba05001324c266ae3b037180`.
  - `ios/doji-1.0.9-104.ipa`, 26,827,455 bytes, SHA-256
    `7765a083aa48790ae680c0ef199ca6c38921a66cfcc5473c0c9d0c5e89c6a134`.
- Android exact29 uploaded once to existing Closed testing Alpha track
  `4699325792611215201`, release19. The sole pending change was 29 (1.0.9),
  Start full rollout within existing closed testers. Country/audience unchanged;
  supported devices unchanged. The preview had no blocking error and one
  deobfuscation-file warning. Publishing overview now verifies **Changes in
  review**, quick checks running. Managed publishing remains off; no public
  production release or enforcement was performed.
  https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/publishing
- Existing Play Data Safety already selects Crash logs, Diagnostics, and Device
  or other IDs. Inspected without changing or saving the declaration.
- Apple upload `4b510b3b-7acb-45bb-87a0-552b32b50560` FINISHED, error null.
  https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/4b510b3b-7acb-45bb-87a0-552b32b50560
- Apple TestFlight confirms **1.0.9 (104)**, Apple build
  `5d588724-9fa5-4ee9-9795-56d230062f4a`, existing Doji Testers internal group
  (six testers). Saved focused What to Test instructions. No tester installation
  or acceptance is claimed.
- Apple privacy update published: Other Diagnostic Data, App Functionality,
  linked to identity/device, not used for tracking. Existing categories preserved.
- **App Store public review has not been submitted. Exact104 device smoke remains
  outstanding**; 103 acceptance does not transfer. Android physical acceptance
  remains deferred to closed testers, not passed. No new builds, costs, retries,
  publication, update enforcement, or recurring monitors were initiated.
- UI evidence: `D:/ChallengeApp/DoIt/test-results/android-29-review-20261007.jpg`
  and `D:/ChallengeApp/DoIt/test-results/ios-104-testflight-20261007.jpg`.

## Apple review submitted — October 7, 17:20 UTC

- Owner confirmed that everything appeared in order in TestFlight in direct
  response to the exact104 device-check request. Recorded as owner acceptance,
  not an agent-executed device test; this supersedes the outstanding iOS gate above.
- Created version1.0.9 once, selected exact Apple build104
  `5d588724-9fa5-4ee9-9795-56d230062f4a`, and saved truthful diagnostic release
  notes. Existing reviewer access, description and contact metadata preserved.
- Manual release remains selected; phased release is off; ratings preserved.
- Submitted one item: **iOS 1.0.9 (104)**. Apple receipt confirms **Waiting for
  Review**, submitted October7 at11:20AM MDT, submission
  `5a7fca0d-62af-427e-9f11-1b06f48db1fd`.
  https://appstoreconnect.apple.com/apps/6768727326/distribution/reviewsubmissions/details/5a7fca0d-62af-427e-9f11-1b06f48db1fd
- Evidence: `D:/ChallengeApp/DoIt/test-results/ios-104-app-review-20261007.jpg`.
- No publication, enforcement, rebuild, additional cost or automatic monitor.
  Android submission remains as previously recorded; no Android mutation here.
