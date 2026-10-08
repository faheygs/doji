# Next mobile build — prepared, owner-triggered only

Status: held for the next owner-requested iOS and Android build. No cloud job,
submission, automatic monitor, schedule, spending approval or update enforcement.
The October 8 request is preparation only, not permission to start at credit reset.

## Included changes

- Foreground/account-bound native push registration on both platforms; cancel
  obsolete waits and reconcile on resume without hiding genuine failures.
- Interrupted notification setup is deferred, not falsely denied or successful.
- Approved privacy-bounded recovery logs correlate a confirmed registration with
  its earlier Sentry event. Maximum three attempts per rolling hour; no account
  details/tokens/bodies, no error muting or alert changes.
- Sentry Expo Metro configuration connects runtime Debug IDs and source maps.
- Settings → Report a problem previews only app/build/platform and existing
  pseudonymous diagnostic installation/session references. Users can select/copy,
  share, or open an email draft to support. Nothing is automatically sent; opening
  a composer is not a submitted report. Account changes discard the old preview.
- The poll suggestion form removes reserved “Other” choices in the UI and submit
  payload (including submit without blur). Would-you-rather options are unchanged.
  This complements the previously released server approval guard; no database
  migration or backend deployment is included here.
- Post detail distinguishes a temporary read failure from an unavailable post,
  offers manual retry and retains permitted cached content on transient errors.
  Access-denied data is not retained.
- Delayed notification-attention acknowledgement checks the current account,
  foreground state and mounted screen before issuing the existing atomic command.
  Native response-cleanup and acknowledgement rejections are observed. These are
  not new polling/retry loops or proof of notification delivery.

Release source: `C:/Users/gfahe/.codex/worktrees/quality-gates/DoIt`.
Do not build the older `D:/ChallengeApp/DoIt` checkout or the entire dirty source
tree. The preparation script stages only the reviewed mobile changes and test
sources under `test-results/push-recovery-next-build-20261008-v4`, with SHA-256 hashes.
The original v1/v2/v3 packages and export evidence are retained, not overwritten.
Use v4: v2 predates the dependency repairs; v3 predates the reviewed native patch guard.

Run from the release source:

```powershell
node scripts/prepare-push-recovery-next-build.mts verify
```

The package is an overlay, NOT an upload-ready application or installable binary.
It records verified frozen 1.0.9 baselines (iOS104 / Android29), 22 runtime files,
21 verification files and platform-specific upload allowlists. Each allowlist
preserves that platform's existing entries and adds only `metro.config.cts`.
The older iOS baseline uses a generated Babel JS config; do not replace its
allowlist wholesale with the working checkout's CTS/Android allowlist.
The six Expo SDK57 patch upgrades and tested lockfile are included in each
platform overlay; original per-platform package scripts/configuration are preserved.
The lockfile also patches the transitive shell-quote vulnerability. Native
diagnostics and platform configuration stay unchanged. Unrelated portal and
backend work is not part of this package.

## Verified now

- 54 unique related suites / 1,171 tests passed on October 8 after the v2 changes.
- App/tooling TypeScript checks, scoped lint and the source-size guard passed.
  Existing gateway transport and push receipt storage were extracted into small
  helpers without changing their behavior or increasing the size limits.
- Local iOS and Android working-source exports include matching runtime/map
  Debug IDs and map error-capture positions back to the correct TypeScript line.
- Export evidence: `test-results/push-recovery-20261008-v2/{ios,android}/proof.json`.
- Focused tests cover notification routes and interruption/account races, upload
  failure/resume behavior, single-flight/idempotent completion and write receipts,
  auth/realtime recovery, support drafts/share failures and poll normalization.
  These are automated source-level checks, not physical-device acceptance.
- No native cloud build, live recovery-log ingestion or new-device acceptance is
  claimed. Existing 1.0.9 acceptance does not validate the next binaries.

## Next owner-requested build checklist

### Additional owner-requested offline testing — October 8

- Expanded regression run: **62 suites / 1,246 tests passed**. Includes notification
  route/readiness checks, foreground recovery, account isolation, upload failure
  and resume, duplicate-submit protection, support share/email fallback, and log
  privacy/correlation. No live service action was used as a test.
- Added `__tests__/lib/pushRecoveryIntegration.test.ts`: ten cases across iOS and
  Android connect the real registration, receipt storage, cancellation and recovery
  logger logic. APNs/FCM, commands, identities and Sentry transport are mocked.
  Verified failure → confirmed recovery exactly once; stale receipts/unconfirmed
  results never count as recovery; late background success cannot log recovery;
  account changes cannot correlate old incidents; token rotation refreshes without
  inventing an incident. Actual emitted log attributes also pass the privacy filter.
- App TypeScript and lint of the new test passed. The v2 runtime/verification
  snapshot still verifies unchanged. The additional integration test is supplemental
  source, not a mutation of the preserved v2 package; include it in future exact-
  candidate regression runs.
- Existing v2 local source-map proofs remain valid for the unchanged runtime.
  This run does not prove OS push delivery, native mail/share UI, physical-device
  suspension/network behavior, native Hermes maps or live Sentry ingestion.
- No app implementation, cloud build, upload, production data, alert rules or
  billing settings changed during this testing request.

### Build-time gates

October 8 dependency revision: Expo 57.0.27, constants 57.0.21,
image-manipulator 57.0.21, linking 57.0.12, notifications 57.0.22, router
57.0.25; shell-quote resolves to 1.12.0. The earlier v2 verification above is
historical, not acceptance of these native dependency changes. Fresh local
exports use `test-results/push-recovery-20261008-v3`; exact native binary/device
checks remain required before release. No cloud builds are authorized here.
The Android passive observer's Expo version guard now permits only 57.0.27:
its normalized ExpoFetchModule.kt SHA-256 remains
`3c766cf8a30f00a91f3a6116aa9e7f6a44f26d7fe2179cd7c114cbbfb56b08ea`,
identical to the previously reviewed source. Hash checking, one-observer insertion,
idempotence and rejection of unreviewed versions/modifications remain enforced.

1. Verify the overlay/baseline hashes and review any subsequent source changes.
2. Recheck Expo plan, credit, delayed usage and active jobs. Last verified credit
   was $0 remaining of $45. The account period ends October 22 00:53:30 UTC
   (October 21, 6:53:30 PM MDT). No automatic start at that time.
3. Confirm current store/EAS versions and choose unused build numbers above
   iOS104 / Android29 and the intended next app version. No numbers are reserved.
4. Compose separate frozen candidates from their recorded 1.0.9 baselines plus
   this overlay and their own allowlist; change only approved release metadata.
   Rerun exact-candidate regression, bundle/source-map, dependency and native
   configuration checks. Working-source exports alone are not release proof.
5. Start only the explicitly requested builds after no-additional-cost gates
   pass. No automatic retry or submission.
6. Verify exact binaries on devices: foreground/background/resume registration,
   account switch/sign-out, permission interruption, token rotation, confirmed
   recovery and readable Sentry stacks. Keep failures actionable, not muted.
   Also check support copy/share/email fallback, large text/light-dark layouts,
   notification deep links, interrupted photo submission, and post retry on both
   platforms. No claim of device success is made by the local mocked tests.
   Store submission/release and update enforcement remain separate decisions.

This addresses registration lifecycle and diagnostic visibility. It does not
claim every timeout/504 root cause is fixed. Production behavior is unchanged
until a later approved binary is built, released and installed.
