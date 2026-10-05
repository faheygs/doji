# Android 1.0.8 build 26 — expanded diagnostics

## Authorization and current status

### October 3, 23:22 UTC — Android mandatory update enabled and verified

Owner explicitly requested enforcement and confirmed all current Android users
are enrolled in Alpha and can download build 26. A fresh Play release-16 read
confirmed **26 (1.0.8)** available to selected testers, **100% rollout**, available
in **1 of 1 country/region**, with no staged rollout remaining. The separate
"Available to 0 users" / 0.00% installed metrics were also displayed; these are
not evidence of tester installation. Eligibility/download access relies on the
owner's current explicit confirmation; no installed-build claim is made.

- One atomic transaction changed only Android latest/minimum **1.0.8 (23)** to
  **1.0.8 (26)**, enabled true, at `2026-10-03T23:22:30.416688+00:00`.
- Both policy rows were freshly snapshotted, locked and compared before writing.
  A newer/concurrently changed policy would abort; store URL/message are preserved.
- iOS remains field-for-field unchanged at enabled latest/minimum **1.0.8 (103)**.
- Fresh live reads and `get_mobile_release_policy('android')` under anon and
  authenticated roles passed. Three focused Jest suites / **86 tests passed**,
  including Android 23/24/25 required, 26/newer accepted and iOS 103 comparison.
- Snapshot, exact apply/rollback SQL and verification evidence are retained under
  `test-results/android-diagnostics-26/enforcement/`. Rollback checks the exact
  post-update Android row and must never overwrite a later policy change.
- Older installed clients discover the required, non-dismissible update on a
  successful policy read after app/query mount. Fully close/reopen to initiate
  a new read; ordinary foreground alone does not guarantee policy refresh.
  No lifecycle change, polling, push, app build or other deployment was added.
- [Preserved Play destination](https://play.google.com/store/apps/details?id=com.doit.challengeapp).
  Review/enforcement work is complete and its monitor remains deactivated.
  Diagnostics require installation; the production 504 origin remains unconfirmed.

### October 3, 19:41 UTC monitoring check — available to selected testers

Publishing overview showed an October 3 publication notification and no pending
review entry. The exact Closed testing - Alpha track confirmed latest release
**26 (1.0.8)**, release **16**, **Available to selected testers**, one version code,
released October 3 at 1:34 PM local. Track remains active in one country/region.
This verifies closed-test publication, not public production or installation.
Both testers need to install build 26 to provide its expanded diagnostics.
No enforcement, audience, rollout or iOS changes were made. Review monitoring is
complete and deactivated after this availability notification. The production
504 origin remains unconfirmed; no Sentry issue was resolved or muted.
[Verified Alpha track](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/tracks/4699325792611215201).

### October 3, 19:11 UTC — review submission verified

- Owner selected `doji-1.0.8-26.aab` in existing release 16. Play completed
  processing and confirmed **26 (1.0.8)**, API 24+, target SDK 36.
- Saved the approved diagnostic notes in en-US and release name `26 (1.0.8)`.
  Preview showed no device-support losses and 100% rollout within the existing
  Closed testing - Alpha audience. Audience and countries were not changed.
- One non-blocking warning: no R8/ProGuard deobfuscation file associated with
  the bundle. Native debug symbols were shown as attached. This does not establish
  complete crash symbolication; no build or symbol-upload change was made.
- Publishing overview contained exactly one pending change: Alpha **26 (1.0.8)**,
  Start full rollout. Submitted it with **Send changes for review** and verified
  **Changes in review**, with quick checks still running. Checks must complete
  successfully before Google's review proceeds. Managed publishing remains off.
- [Publishing receipt](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/publishing).
  Not yet approved or available to testers; no installation or enforcement claim.
- Resumed the existing monitor for read-only review/availability checks only.
  No new build, additional cost, iOS action or release-policy change.

### Earlier build and upload handoff (superseded by submission above)

Owner requested an Android build to monitor future errors after approving and
reviewing expanded error evidence. One Android-only EAS job was launched at
2026-10-03 03:08 UTC (October 2 MDT). The owner subsequently explicitly approved
uploading and submitting this exact build to the existing Android closed-test
track when it finishes, then monitoring review and availability. Enforcement is
not authorized by that submission approval.

- Exact job: `3e226ceb-ebab-406f-832c-11468eea74a8`
- [EAS build](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/3e226ceb-ebab-406f-832c-11468eea74a8)
- Version `1.0.8`, Android versionCode `26`, package `com.doit.challengeapp`.
- Verified `FINISHED` at `2026-10-03T03:38:43.884Z`; completion `03:31:22.124Z`.
- Exact AAB downloaded and verified: 95,231,853 bytes, SHA-256
  `bd6d37ad9123ae96dc6904357fd99d8236577ce993aa5cb09df125d76e29a87a`.
  File: `test-results/android-diagnostics-26/doji-1.0.8-26.aab`.
  **Not submitted to Google Play yet.** Artifact reverified at 04:00:35 UTC.
  Publishing overview rechecked: managed publishing off, no pending changes.
  Alpha showed 24 (1.0.8) available, with no newer release or conflicting draft.
  Created closed-test draft release **16** for the approved build-26 upload.
  The upload control did not produce a browser file chooser (10-second timeout);
  the form still shows no uploaded bundle. No review submission occurred.
  Monitor paused for owner file selection; reuse release 16, do not create another.
  On the owner's subsequent request to unblock Android, reverified the local
  SHA-256, clean publishing overview, current Alpha 24 and existing empty draft 16.
  The exact `.aab` file-input chooser attempt also timed out without an upload.
  Draft 16 was shown for owner file selection; submission remains unperformed and
  the monitor remains paused. No new build, audience change or enforcement change.
  [Resume draft](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312/tracks/4699325792611215201/releases/16/prepare).
  Existing audience/country, published release, and enforcement remain unchanged.
- Diagnostic release, **not a confirmed repair of the production 504 origin**.

## Exact source boundary

Candidate `test-results/android-diagnostics-26/upload` contains 352 hash-verified
files. It starts from immutable build-25 uploaded files, not the broad dirty tree.
Exactly five files differ from build 25:

- `app.json`: only Android versionCode becomes 26 in this isolated candidate.
- `lib/androidReadEvidence.ts`: new bounded Android evidence helper.
- `lib/memberReadDiagnostics.ts`: evidence capture and native hint v2 parsing.
- `lib/apiFailureTelemetry.ts`: fixed-vocabulary failure summary and tags.
- `plugins/android-read-diagnostics/DojiReadResponseHints.java`: native timing,
  protocol and prior-response hints, without changing request behavior.

The existing plugin installer, dependencies, runtime profile, iOS configuration,
backend, portals, database, retries, member authentication and release policy stay
unchanged. Existing remote signing credentials were reused with
`--freeze-credentials`; no automatic submission or version increment.

## Diagnostics and limits

Captures Android app state at start/failure, API level, fetch invocation count,
allowlisted method, JS response-consumption state/time, native response provenance,
protocol, bounded transmission-to-headers timing and prior-response count.
Existing first/final attempt evidence remains normalization-safe. Query errors
carry a readable summary plus searchable `failure_evidence`/`failure_phase` tags.

No response bodies, content, credentials, raw URLs, IP/SSID/carrier data or new
success/per-attempt events are collected. Existing event budgets and fingerprints
are preserved. A network HTTP 504 still needs provider correlation to identify
its generator. Native time excludes DNS/TLS/body; JS response consumption is not
necessarily wire download time. See the build-25 record's additional-logging
section for tested contracts and measurement limitations.

## Verification and included-credit gate

- Fresh 12 focused Jest suites: **220 tests passed**, 0 failed.
- Exact isolated Android production JS export passed.
- Android-only Expo prebuild passed; one native installer before RN startup and
  generated helper hash match verified.
- Previous same-source native qualification: **67 assertions, three passing
  runs**; TypeScript/scoped ESLint/source-size checks passed before preparation.
- Immutable baseline hashes and exact delta manifest verified; no unrelated
  working-tree changes included. No claim of physical-device smoke acceptance.
- Fresh EAS preflight `2026-10-03T03:08:21.148Z`: Starter $45 included / $37 used /
  **$8 remaining**. This one medium Android build consumes $1 included credit.
  Guard preserves a $6 reserve for delayed usage; **no additional spend authorized**.
  [Expo usage pricing](https://docs.expo.dev/billing/usage-based-pricing/).

Evidence under `test-results/android-diagnostics-26/`: `manifest.json`,
`regression.json`, `prebuild-proof.json`, `bundle-android/metadata.json`,
`cost-preflight.json`, `attempt.json`, `build.json`, `latest-status.json`.

## Completion / handoff

Read only this job using `node scripts/android-diagnostics-status-26.mts`.
When FINISHED, use `--download` to verify/save the exact AAB and SHA-256, then
update this record. Never launch/retry another build automatically. Upload and
submit only this verified artifact to the existing Google Play Closed testing -
Alpha track `4699325792611215201`, developer `6661342012009308283`,
app `4972908027141050312`, package `com.doit.challengeapp`.
Inspect releases and publishing overview first; reuse an exact build-26 draft or
submission, never duplicate it. Stop for newer-release conflicts or unrelated
pending changes. Preserve audience, countries and credentials; full rollout only
within the existing closed-test audience. Verify actual review submission and
record proof; an uploaded AAB alone is not completion. No public Android release,
iOS action, enforcement, credential/billing changes, new costs, production code
changes or Sentry muting/resolution.
Pause on failed job/access/artifact verification or owner-action blocker; if still
nonterminal after October 4 03:08 UTC, report prolonged status once and pause.

For real tester evidence, build 26 must subsequently be submitted to the existing
closed test, approved/available and installed. Build completion alone does not
enable diagnostics on current tester installations. Preserve all earlier iOS102 /
Android24 release gates and paused monitors; do not resume Android21 enforcement.

Release notes (existing locale; no claim of a repaired 504):

> Improved Android error diagnostics to help investigate intermittent loading
> failures. This update provides clearer technical details for troubleshooting.

Notify once when review submission is verified, then monitor review read-only.
Notify once when exact build 26 is approved and available to selected testers,
with the direct track link. Do not claim installation. Before later global Android
enforcement, require no staged rollout and confirmed availability to all affected
Android users, including verified Alpha eligibility; do not infer that from
approval. Stop monitoring after the availability notification. Pause for access,
file-picker, rejection, verification or other concrete owner-action blockers.
