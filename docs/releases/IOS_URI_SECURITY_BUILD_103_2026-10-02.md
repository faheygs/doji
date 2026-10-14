# iOS URI-decoder repair — 1.0.8 build 103

## Cloud status

### October 3, 20:02 UTC — iOS mandatory update enabled and verified

Supersedes the paused-verification note below. Owner explicitly directed immediate
enforcement based on their release/availability confirmation, declining another
independent Apple verification. Apple remains signed out in the agent browser;
availability is owner-attested, not independently verified across storefronts.

- One guarded transaction changed only iOS latest/minimum from **1.0.7 (90)** to
  **1.0.8 (103)**, enabled true, at `2026-10-03T20:02:30.949029+00:00`.
- Both rows were freshly snapshotted, locked and compared before writing. Store URL,
  update message and unrelated fields were preserved; no newer policy was overwritten.
- Android remains byte-for-field identical: enabled, latest/minimum **1.0.8 (23)**.
- Fresh live reads verified the final rows and `get_mobile_release_policy('ios')`
  under both anon and authenticated roles. All checks passed.
- Three focused Jest suites / **85 tests passed**, including older iOS 90/100/101/102
  requiring an update, exact 103 and newer accepted, existing Android comparison,
  policy reads and required-prompt behavior.
- Evidence and concurrency-guarded rollback SQL are in
  `test-results/ios-security-103/enforcement/` (`before.json`, `apply.sql`,
  `attempt.json`, `after.json`, `rollback.sql`, `verified.json`). Do not execute
  rollback automatically or overwrite a subsequent policy change.
- [Preserved App Store destination](https://apps.apple.com/app/id6768727326).
  The non-dismissible Update required prompt appears after a successful policy
  read on app/query mount. Fully closing and reopening ensures a new mount/read;
  ordinary foreground alone does not guarantee refresh because global focus
  refetch is disabled and the policy query is absent from reconciliation roots.
  No lifecycle/client fix was bundled into this configuration update.
- Enforcement is complete. The existing heartbeat remains deactivated, with its
  instructions updated to record completion. No Android enforcement, build,
  portal, Worker, schema/RLS, credential or billing change occurred.

### October 3 — owner-reported manual release and enforcement authorization

Owner reports releasing 1.0.8 (103) and explicitly requests mandatory iOS updates
once public availability is verified. This supersedes the earlier review-only
monitor scope, but does not establish public availability by itself. The current
Apple browser remains signed out. The existing heartbeat has been updated with
exact-103 availability and iOS-only policy verification gates and remains paused
pending Apple sign-in. No release-policy change has been made. Verify the exact
released build, all affected storefront availability, and no phased rollout
before an atomic, concurrency-protected policy change; preserve Android unchanged.

Launched once October 3, 03:55 UTC using included credit:
- Build `42873c98-ce5a-430e-b7f8-ea75033bb023`, initially `IN_QUEUE`.
- [Exact EAS build](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/42873c98-ce5a-430e-b7f8-ea75033bb023)
- Apple upload scheduled once: `f58203f9-773c-45f5-b8da-de05d1543376`.
- [Apple upload job](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/f58203f9-773c-45f5-b8da-de05d1543376)
- Verified October 3 at `04:10:00.161Z`: exact build **FINISHED**, completed
  `04:02:20.404Z`; already scheduled Apple upload **FINISHED**; both errors null.
- Uploaded to Apple. Owner subsequently confirmed: "Confirmed TestFlight is
  working no issues" in direct response to the exact-103 smoke checklist.
  Record this as owner-reported build-103 device smoke acceptance and TestFlight
  availability, not independently observed device telemetry or a full device matrix.
- **Submitted for App Store review**, verified October 3 around 04:45 UTC
  (Apple receipt: October 2, 2026 at 10:44 PM local). Status **Waiting for Review**.
  Submission `a13b57db-12aa-4c5a-ad70-7cb1e0109ef4` contains exactly one item:
  **iOS App 1.0.8 (103)**, Apple build `76b5e8fd-4533-4445-adbc-7fc82f261dff`.
  [Apple review receipt](https://appstoreconnect.apple.com/apps/6768727326/distribution/reviewsubmissions/details/a13b57db-12aa-4c5a-ad70-7cb1e0109ef4).
  Removed the old unsubmitted build-100 review item, selected 103, corrected the
  reviewer notes to 103, and verified the final submission receipt (not just
  "Ready for Review"). Existing reviewer credentials/contact, screenshots,
  public metadata and privacy declarations were preserved. No new reviewer-login
  test was performed during submission; owner-reported device acceptance is above.
  Manual release and no phased rollout remain selected. Approval is not public
  availability; no update enforcement occurred. Read-only review monitoring resumes.
  Build-tool advisory assessment completed October 3 around 04:30 UTC:
  [exact-build disposition](IOS_103_SECURITY_ASSESSMENT_2026-10-03.md).
  The remaining findings are non-blocking for 103 based on inspected reachability;
  they are not patched or suppressed. Device-smoke and advisory gates are closed.
  No dependency, binary, enforcement or Android changes made during submission.
  Read-only checks through October 3 around 06:36 UTC still showed Waiting for
  Review. At the 06:46 UTC check, Apple redirected the receipt to its login page.
  Review monitoring paused pending owner sign-in; no submission or release change.

## Decision and boundary

Owner approved “Let's patch it and do it right” after passing device smoke on
102. This repairs the bundled malformed-link decoder flaw, not Android's 504.
[GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) affects
decode-uri-component <=0.4.2; 102 contains 0.2.2. The upstream fix is 0.5.0.
Published compatible Expo Router 57 releases still depend on query-string 7.1.3,
which expects a CommonJS decoder function. Blindly upgrading query-string 7 to
the ESM-only 9 changes its export contract and risks navigation breakage; see
[Expo issue 35173](https://github.com/expo/expo/issues/35173).

Use the unmodified, exact-pinned upstream 0.5.0 registry package with SHA-512
integrity, behind a nine-line private adapter. The adapter preserves CommonJS
and literal-plus semantics; encoded `%2B` is decoded once. It contains no custom
decoder algorithm, error suppression, retry or timeout change. Remove it when
Router directly supports a fixed decoder, preserving the security regression gate.

`test-results/ios-security-103/upload` starts from immutable 102, not the dirty
workspace. Exactly seven archive files change: app.json (iOS build number only),
package.json, package-lock.json, .easignore and three adapter files under vendor/.
Only decoder/adapter lock entries differ. No app screen, authentication, network,
realtime, backend, portal, database, credential or policy change is included.
Android 26 remains immutable and does NOT include this separate decoder repair.

## Qualification

- Clean candidate npm ci succeeds. 28 direct decoder/query-string/installed Router
  tests pass, covering malformed UTF-8/percent input, Unicode, spaces/plus signs,
  repeated/null/empty/array values, delimiters and single-level decoding.
- Synthetic local before/after: 32,768 invalid encoded bytes time out the old
  decoder at its 2-second child-process limit (2,069 ms observed). Patched decoder
  completes in 46 ms. This is not a physical-device benchmark or 504 reproduction.
- 11 assertions pass executing minified iOS Metro parser/router output in a
  bounded VM, testing the ESM/CommonJS interface after bundling.
- Exact full iOS production export passes; source map contains upstream 0.5.0 and
  adapter, no old recursive decoder. Local inspection disables bytecode only;
  the unchanged cloud production profile still uses Hermes.
- TypeScript and fixture checks pass. Six focused Jest suites / 131 tests pass.
- Broad workspace suite: 4,599 pass, two fail. Poll footer timing passes on focused
  rerun and unchanged baseline. The other failure is an old assertion expecting
  a 20-second Worker timeout, now 5 seconds after a separately approved deployment;
  unchanged baseline passes. No Worker code/test was edited to hide this drift.
  Do not claim the entire workspace suite is green.
- CI explicitly runs `node --test scripts/uri-decoder-security.test.mts`.

Release-folder evidence: manifest.json, before-after.json, decoder-regression.log
(saved at launch), focused-regression.json, jest-regression.json, bundle-proof.json,
bundle-ios/, metro-security/result.json and audit-{baseline,patched}.json.

## Public-release gate disposition

Fresh registry audit: unchanged 102 reports 53 high / 3 moderate / 0 critical
affected dependency entries; patched candidate 53 high / 0 moderate / 0 critical.
The decoder advisory is removed, not suppressed. Earlier audit counts are stale.
Transitive-dependent entries are not separate runtime vulnerabilities.
Remaining root advisory packages: brace-expansion, braces, http-cache-semantics,
js-yaml and node-forge. None appears in the exact iOS runtime source map.
The [completed assessment](IOS_103_SECURITY_ASSESSMENT_2026-10-03.md) also traces
build-time exposure and finds no blocking path for this exact iOS release.
Tooling remediation remains open; no blanket npm audit fix, major downgrade or
implicit blanket risk waiver. Normal App Store submission checks still apply.

Exact 103 device smoke acceptance is now owner-confirmed in response to the
requested sign-in/session, feed, comments/reactions, Shop, background/reopen and
ordinary-links checklist. This is new acceptance, not transferred from 102.
App Store 1.0.8 draft was observed with build100 attached; never submit
that stale draft or 102 as this replacement. Apple upload/TestFlight is not public
review. No release-policy enforcement in this task or on approval alone.

### Follow-up advisory triage after device acceptance

Rechecked the recorded candidate lockfile and iOS export source map. All five
remaining root advisory packages have zero source entries in that local export.
This supports exclusion from the inspected JavaScript runtime, but does not by
itself qualify the cloud build toolchain or prove no build-time exposure.

- brace-expansion 1.1.18 / 5.0.9: minimatch/glob and tooling paths.
- braces 3.0.3: micromatch path.
- http-cache-semantics 4.2.0: cacheable-request path.
- js-yaml 3.15.1: @istanbuljs/load-nyc-config; separate 4.3.2 copies are present.
- node-forge 1.4.0: Expo CLI and @expo/code-signing-certificates paths.

The live advisories for [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
and [http-cache-semantics](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
list no patched version at this check. A blind npm audit fix is not a disposition:
the recorded suggestions include major Expo/Ably downgrades. Build-time call-path
and input-trust review is now documented in the linked assessment; no dependency
or release artifact was changed. This is exact-build reachability disposition,
not a claim that the dependency warnings were repaired.

## Included-credit / rollback gates

Preflight October 3 03:53 UTC: $45 included / $38 used / $7 remaining. One iOS
medium build uses $2 included credit. Launcher reserves another $5 for all four
known jobs in the full 24-hour reporting-delay window, rejects unknown/active/
newer jobs and insufficient credit, and writes a one-attempt guard. No new spend
or automatic retries. Reuse frozen production credentials and schedule Apple
upload once; review remains gated. Preserve old paused release monitors.

No production rollback is needed: none was changed. If qualification fails,
retain evidence and do not submit. Source rollback must undo only the decoder
override/adapter/allowlist additions and associated lock delta, preserving prior
working edits. Restoring the old decoder reopens the vulnerability; it does not
authorize publishing 102. See scripts/ios-security-103.mts and
scripts/ios-security-launch-103.mts for exact manifest and launch guards.
