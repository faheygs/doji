# Android 26 feed 504 investigation

Status: local diagnostic attachment correction; **production 504 root cause
unresolved**. No store build, deployment, retry-policy change, iOS change,
backend/database change or Sentry muting/resolution was performed for this fix.

## Observed incident

- Sentry issue `7771260347` / `REACT-NATIVE-1Z`, event
  `9e414faab51941d6ad622c1d2ee6e55f`; Android 1.0.8 dist 26, API 30.
- Event timestamp: October 3, 2026, 19:12:27.211 UTC (13:12 MDT), from the
  authenticated event view. This timestamp precedes the later owner alert.
- Operation `query.feed`, transport `scale_gateway`, GET; app active at start
  and failure. Both attempts returned HTTP 504 after headers, bodies unread.
- First fetch: dispatch 163 ms, headers 175 ms, completion 178 ms. Final fetch:
  dispatch 12 ms, headers/completion 61 ms. Total observed fetch sequence 900 ms;
  configured deadline 8,000 ms; abort source `none`.
- Reason text was present; cache-only signature false. Native provenance and
  provider request IDs were absent. This is not evidence of the app's deadline
  expiring, nor sufficient evidence identifying who generated the HTTP response.

Source: https://doji-i0.sentry.io/issues/7771260347/

## Bounded Worker check

Authenticated retained observability for `doji-orchestrator`, 19:10–19:15 UTC:
65 stored events, no execution errors in the displayed sample; response-status
filter >=500 returned no events. A nearby feed request at 19:12:28.484 UTC
returned 200, outcome ok, 446 ms wall / 6 ms CPU, Worker version
`bb415821-fbe9-4d74-8716-7b36ef24a7fa`. Its user agent identifies OkHttp 4.12.0.
There is no shared request ID establishing that this is either failed attempt.
Sampling/retention and possible failures before Worker execution limit this check.
It does not establish that the backend was uninvolved or that no 504 occurred.

Play pre-launch overview exposed no report to inspect. An automated test-device
origin remains a hypothesis, not a finding. No report was generated or upload
started. No IPs, member content, credentials or private request URLs are retained.

## Confirmed diagnostic defect

The exact build-26 exported bundle installs Expo's default global fetch; the
release environment does not opt into RN fetch. Installed Expo 57.0.26 uses
`OkHttpClientProvider.createClient(reactContext)` in `ExpoFetchModule.kt`.
It never invokes the prior RN-only `NetworkingModule.setCustomClientBuilder`
hook. The old native observer also excluded gateway routes. The lab reproduced
that absence. This explains why build 26's added native fields were missing.
The old RN reason-text-loss assumption likewise does not apply to Expo fetch.

The verified build-26 AAB DEX contains `okhttp/4.12.0`; the local lab previously
declared RN's catalog version 4.9.2. The lab is now explicitly aligned to 4.12.0.
None of these findings proves the source of the production HTTP 504.

## Local correction

- Keep the RN fallback hook and attach the same passive observer directly to
  Expo's Android fetch builder. Do not replace the global OkHttp factory: that
  alternative changed unrelated context-free client cache defaults and was
  discarded before release.
- Android config-plugin integration pins Expo 57.0.26 and normalized upstream
  `ExpoFetchModule.kt` SHA-256
  `3c766cf8a30f00a91f3a6116aa9e7f6a44f26d7fe2179cd7c114cbbfb56b08ea`.
  Unknown SDK/source changes stop the build, not silently omit diagnostics.
  The plugin generates its Expo-package helper from the same reviewed Java
  source used by the RN hook and native lab. The SDK edit is Android-only.
- Observe only HTTPS GET/HEAD 504s on the exact Supabase `/rest/v1/` host or
  gateway `/v1/feed/`, `/v1/posts/`, `/v1/polls/`, `/v1/profiles/` paths.
- Local response annotations distinguish network/cache/local-cache-miss and
  bounded native protocol/header timing. They do not read bodies or send
  diagnostic headers, change credentials, add requests, change TLS, cache,
  cookies, deadlines, retries, or successful responses.
- JS now accepts these bounded native fields for gateway reads as well as
  direct reads. Existing Android-only guards, redaction and Sentry limits remain.

## Verification

- 10 focused Jest suites, **144 tests passed**, covering plugin migration and
  pinned-source guards, installed Expo fetch/response JS, direct/gateway evidence,
  bridge normalization, retries and cancellation. The Expo JSI boundary is mocked.
- Native loopback controls: **86 assertions passed in each of three runs**,
  using actual RN provider/builders and OkHttp 4.12.0 on the dedicated API-36 AVD.
  They include real TLS HTTP 504, local cache-only 504, unchanged outgoing
  credentials, excluded routes, recovery and unrelated no-cache defaults.
- Native logs: `test-results/android-network-lab/native-2026-10-04T00-11-22-830Z.log`,
  `native-2026-10-04T00-11-27-180Z.log`, `native-2026-10-04T00-11-31-211Z.log`.
- Local lab APK compiles. SDK XML-schema/Gradle-deprecation and unwritable
  analytics-settings warnings remain; no paid service or system setting changed.
- Patched real Expo Android module: `:expo:compileDebugKotlin` and
  `:expo:compileDebugJavaWithJavac` **BUILD SUCCESSFUL**, 162 actionable tasks,
  3m 7s. This verifies the generated Expo-package Java helper and Kotlin client
  attachment compile together, not just the standalone lab copy. Initial local
  compilation was stopped after daemon sandbox warnings; the successful run used
  in-process Kotlin, two workers and x86_64 scope. Missing NDK 27.1.12297006 and
  Build Tools 35.0.0 were installed locally under the previously approved free
  Android SDK setup/license. No EAS build or service upgrade was involved.
- Scoped ESLint, repository TypeScript check and scoped `git diff --check` passed.
  The mobile archive allowlist includes the new pinned Expo patch helper; its
  idempotence and generated-source tests also pass against the patched SDK file.
- Final authenticated Sentry recheck still showed one event in this exact issue;
  no newer occurrence supplied missing production evidence.
- Follow-up real Expo/Hermes/JSI integration probe: **28 assertions passed in
  each of three emulator runs** at October 4 01:36:53, 01:37:18 and 01:37:21 UTC
  (October 3 MDT). No mocked fetch or native bridge. It verifies the default
  global fetch is Expo fetch, generates actual native cache-only 504s for both
  direct REST and gateway paths, and confirms the native fields survive the
  application's diagnostics and actual Sentry JS event normalization. Bodies
  remain unread, fetch count stays one and raw error text is excluded.
- The probe is a separate `com.doji.exporeadprobe` APK with **no INTERNET
  permission**, verified from the compiled APK before installation. Sentry uses
  an in-memory transport; no production traffic, account creation or alerts.
  It reuses the installed native module graph with the installed Expo template's
  startup classes and a synthetic JS entry, not member screens. It is not a
  store candidate, full member UI test or exact-release device smoke acceptance.
- Probe APK SHA-256:
  `8b486c19ea997784dff96a3aa4837d80f02f1423d703c0a141fb6bb693e5c6ae`.
  Bounded per-run evidence is under `test-results/android-expo-read-probe/`:
  `2026-10-04T01-36-53-698Z.json`, `2026-10-04T01-37-18-570Z.json`,
  `2026-10-04T01-37-21-715Z.json`. Reproduction instructions and local-only
  compiler/bootstrap adjustments: `scripts/android-expo-read-probe/README.md`.
  Final native probe build passed, 908 tasks (34 executed), 1m 28s. Failed local
  attempts exposed stale generated-shell compiler/bootstrap paths and retained
  Windows-overlong Ninja dependency paths, not failures in production transport.
- Six focused diagnostic regression suites were rerun: **108 tests passed**.
  The probe and shorter local cache alias are excluded from the EAS archive.

## Not yet established / release gates

This is not a production-timeout fix or proof of real cellular recovery. The
previous real-Expo-JSI-to-final-error-payload gap is now closed by the offline
integration probe. Exact-candidate full member-app/device qualification remains
required for device acceptance; the separate synthetic probe does not establish
that qualification. The owner subsequently approved building for external Android
testers because they have no Android device: exact-device smoke is deferred to
those testers, not marked passed. See `ANDROID_DIAGNOSTIC_BUILD_27_2026-10-03.md`
for that separate candidate/build authorization. Build 26 remains immutable and
lacks this correction. No new EAS job,
Play upload or enforcement mutation is included in this work.

The next instrumented failure must first distinguish native-local from network
response. A network response still does not identify a particular upstream
provider. Correlate available provider IDs with bounded logs; do not increase
timeouts/retries or replace transport based only on this email. Any proposed
shared Worker/database change requires its own impact, regression, rollout and
rollback approval under AGENTS.md.

Rollback is scoped to these diagnostic changes, not the dirty working tree:
restore the previous RN installer/observer and JS scope; remove the exact added
Expo observer line and generated Expo helper (or restore dependencies from the
lockfile) before rebuilding. Never broadly reset unrelated local work. No
production rollback is needed because nothing from this correction was shipped.
