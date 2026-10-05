# Android 1.0.8 (23): tester recovery and request correlation

## Owner authorization / boundaries

Owner approved a new Android build and release to the existing testers after
confirming the purpose: recovery feedback plus diagnostics for recurring read
failures. This is not a confirmed fix for the source of production HTTP 504s.
Do not require physical access to the external testers' devices to collect these
diagnostics. Installation on the exact new build still needs verification.

Android only. iOS remains 101. No backend, database, Worker, portal, billing,
credentials, audience, countries, production track, or mandatory-update changes.
No automatic retry/rebuild if the build fails. Keep Android 21 enforcement paused.

## Verified preflight

- Signed-in Expo Starter billing September 28 at approximately 18:38 UTC:
  $26 used / $45 included, $19 remaining. One medium Android build uses $1
  included credit; reserve $6 for delayed reporting. No new spending authorized.
  Official price: https://docs.expo.dev/billing/usage-based-pricing/
- Fresh EAS history: latest Android 22 finished, no active builds, 23 unused.
- Google Play Alpha: 22 (1.0.8), available to selected testers, released Sep 28
  11:47 AM as displayed. Publishing overview had no pending changes.
- Full Jest rerun: **143 suites / 1,255 tests passed**. TypeScript and full ESLint
  passed. Android JavaScript export with the production profile environment passed.
  Local validation uses `--no-bytecode`; cloud Hermes/native settings are unchanged.
- Mobile-only upload: **349 files** with immutable SHA-256 manifest under
  `test-results/android-recovery-23`. Nineteen paths changed from the actual 22
  candidate: build number plus the approved diagnostics/recovery work. No removed
  files, new dependencies, portal/backend/docs/test files, or local secrets uploaded.
- Existing remote signing credentials frozen, resource class medium, production
  EAS environment, local build numbering, no automatic submission to another track.

Implementation and test limitations: `MEMBER_READ_RECOVERY_2026-09-28.md`.

## Exact accepted job

Android **1.0.8 (23)**:
https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/289458a9-0586-49ff-90cd-3a6dac396c99

Build launch accepted; initial EAS status NEW. Not yet uploaded to Google Play.
Verified at 18:44:37 UTC: IN_PROGRESS, no reported error. Active thread follow-up
`finish-android-23-tester-release` continues this exact build through the authorized
Alpha submission and availability checks every five minutes, notifying only on
submission, availability, failure or required owner action. It must not rebuild.
Never rerun `android-recovery-build-23.mts launch`: the exclusive attempt marker
exists. Read current state with `node scripts/android-recovery-status-23.mts`.
After FINISHED, adding `--download` fetches only this exact AAB, records its size
and SHA-256, and refuses to overwrite an existing unmatched artifact.

## Remaining authorized release steps

1. Wait for this exact build. On failure, report the concrete error; do not retry.
2. Download and verify `test-results/android-recovery-23/doji-1.0.8-23.aab`.
3. Use Google Play **Closed testing - Alpha**, track `4699325792611215201`, for
   package `com.doit.challengeapp`. Inspect pending changes first; do not bundle
   unrelated changes or replace an unfamiliar/newer release. Preserve the audience
   and countries. Upload only 23, use 100% of this existing closed-test audience.
4. Suggested release notes: "Improved feedback and retry controls when content
   cannot load. Added privacy-safe diagnostics to investigate intermittent loading
   failures." Do not claim every timeout or notification issue is fixed.
5. Complete review submission, verify the console says changes are in review,
   and save proof. Upload/build completion alone is not tester availability.
6. Check approval and availability. Report when Google confirms 23 is available
   to selected testers and ask the owner to have both testers update to 1.0.8 (23).
   Do not enforce a global minimum build. Do not claim both installed without evidence.

Console: https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/tracks/4699325792611215201

Filter subsequent Sentry events to **dist:23**. Correlate first/final attempt IDs,
transport and UTC time with bounded provider logs. A quiet interval or successful
build is not proof the historical 504 cause was repaired. No broad alert suppression.

## September 28 submission progress

- Exact EAS job FINISHED at **19:07:01 UTC**, no reported error.
- Downloaded artifact: `test-results/android-recovery-23/doji-1.0.8-23.aab`,
  95,197,192 bytes; SHA-256
  `cda9ec387f2451cf86e0e7f12ca71fdd4fe0327937ebf7666a3da75a4e011973`.
- Fresh publishing overview had no pending changes; Alpha still showed only 22
  available to selected testers. Created exact build-23 draft **release 14** and
  uploaded the verified AAB. Play is optimizing it for distribution; review
  submission is not yet complete. Release name and documented en-US notes entered.
- Resume this existing draft, never create a second draft:
  https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/tracks/4699325792611215201/releases/14/prepare

**Submission completed and verified by 19:19 UTC:** Play accepted 23 (1.0.8),
API 24+, target SDK 36, four ABIs, with native debug symbols attached. Supported
device counts match 22 exactly. The only validation warning is the existing
nonblocking missing R8/ProGuard deobfuscation-file warning; no settings changed.

Saved 100% rollout within existing Alpha audience, then submitted the only pending
change (Closed testing - Alpha / 23 (1.0.8) / Start full rollout) and confirmed
Send changes for review. Publishing overview now explicitly shows **Changes in
review**, with quick checks running and automatic forwarding once they complete.
Managed publishing remains OFF. This is not yet approval or tester availability.

Proof: `test-results/android-recovery-23/android-23-submitted.png`.
Submission notification sent to owner in this turn; do not repeat. Remaining
follow-up is **read-only review/availability monitoring**, not another upload,
submission, build, rollout action, or mandatory-update change. iOS remains 101.

## Verified tester availability — September 28, 20:15 UTC

Read-only Google Play checks confirmed **23 (1.0.8), release 14, Available to
selected testers** in the existing Closed testing - Alpha track. Play displays
"Released on Sep 28 2:11 PM". Publishing overview shows last published September
28, with no pending review changes and managed publishing still OFF.

The owner is being notified to have both testers update to **1.0.8 (23)** before
testing. Installation is not yet verified. The release-availability heartbeat is
deactivated after this outcome. No iOS, rollout/audience, enforcement, backend,
or Sentry changes were made. Availability does not prove the production 504
origin is repaired; use build-23 diagnostics for subsequent investigation.

## Android mandatory update — LIVE September 28, 20:44 UTC

After availability was verified, the owner explicitly requested enforcement and
confirmed **all current Android users have access to closed Alpha**. This separately
authorizes the policy change; the original release-monitor boundaries above remain
historical and that monitor stays paused.

Only Android latest/minimum changed from **1.0.7 (17)** to **1.0.8 (23)**, enabled.
The existing official Play URL and message were preserved. One transaction locked
the two policy rows, compared the complete fresh snapshot, then updated Android
alone. No schema, app, portal, Worker, session, billing or iOS change was made.
iOS remains exactly **1.0.7 (90)** including its original timestamp and all fields.

Evidence: `test-results/android-recovery-23/enforcement/{before,after,verified}.json`.
`apply.sql` records the transaction; `rollback.sql` restores the previous Android
fields only if the current Android row still exactly equals this operation's result.
Rollback is not automatic and must not overwrite a newer operator change. The
one-attempt operational script is `scripts/android-23-release-policy.mts`.

Verification: seven app-update tests passed, including older versions/builds
17/20/21/22 required, build 23 accepted, and newer builds accepted. Fresh production
reads match the target, both anon and authenticated executions of the existing
`get_mobile_release_policy('android')` return the target, and iOS is unchanged.

**Client discovery limitation:** the existing hook refetches on mount, but its
six-hour stale time, global `refetchOnWindowFocus: false`, and omission from the
explicit foreground reconciliation roots mean ordinary background/foreground does
not guarantee a fresh policy read. Testers should fully close/reopen Doji to fetch
this requirement, then use the non-dismissible Update now dialog. No session is
revoked. Reliable foreground refresh is a separate future mobile fix, not silently
bundled into this policy-only operation. Installation/device behavior and the
historical HTTP 504 origin remain unverified by these server/test checks.
