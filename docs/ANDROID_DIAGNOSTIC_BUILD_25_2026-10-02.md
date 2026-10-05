# Android 1.0.8 (25): bounded native 504 diagnostics

## Authorization and scope

The owner approved another Android build and explicitly approved a diagnostic
build if native controls could not reproduce the production 504. Those controls
did not reproduce the incident. **This is diagnostic, not a confirmed timeout
repair.** iOS remains 102; no Apple action, backend/Worker/database/portal change,
retry increase, release-policy change or paid upgrade is included.

Current status: **FINISHED**, completed October 3 at 01:13:32.714 UTC
(October 2 at 7:13:32 PM MDT). Exact candidate, Expo Android prebuild, production
JS export, 183 focused tests, TypeScript and scoped lint passed. One EAS build
was created October 3 at 00:51 UTC (October 2 MDT):
https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/b8dbbb2d-4590-4836-a5c1-998707da4515
Read-only follow-up: `node scripts/android-diagnostics-status-25.mts`; only after
FINISHED, `--download` verifies and records the exact AAB SHA-256. No Android 25
Play upload/submission or tester installation is claimed.

At 01:16 UTC, the exact finished artifact was downloaded and independently
SHA-256 verified. The AAB contains BundleConfig, base Android manifest, DEX and
the Android JS bundle. This verifies the recorded job artifact and basic bundle
structure, not physical-device installation or runtime acceptance.

- Local AAB: `test-results/android-diagnostics-25/doji-1.0.8-25.aab`
- Size: 95,229,531 bytes.
- SHA-256: `6347cc411f1a32f4514e66e706e73af1955b6624515840b191a4f649f0e395ba`.
- Artifact record: `test-results/android-diagnostics-25/android-artifact.json`.

Read-only heartbeat `finish-android-25-diagnostic-build` completed its build/artifact
monitoring and is being deactivated with the completion notification. No Play
submission, iOS action or enforcement occurred. Existing iOS/Android24 monitors
were not resumed. The dedicated local emulator was shut down after the final
33-assertion pass. Production 504 attribution remains open.

## Incident and demonstrated diagnostic defects

Android 24 event `8962e1b07e3340978e1306a7af6a0b9a`, issue
`7769209637` / REACT-NATIVE-1Y, occurred October 2 at 22:21:19 UTC for
`query.ownedShopItems`. The latest bounded authenticated issue check still showed
one event. Provider log checks could not correlate it to a failing request.
See `MOBILE_BUILDS_102_24_2026-10-02.md` for the exact evidence and limits.

Two evidence-loss defects were demonstrated: RN Android does not forward OkHttp's
reason phrase, and Sentry's default normalization collapses deeply nested attempt
objects. Missing reason text therefore cannot rule out a native cache-only 504.
Neither finding establishes that a cache miss caused the production incident.

## Controlled runtime delta

The immutable build-24 upload is the base, not the unrelated dirty working tree.
`scripts/android-diagnostics-25.mts` verifies every baseline/candidate file hash.
Only six uploaded files differ:

- `app.json`: Android versionCode 25 and Android-only plugin; iOS configuration
  byte-equivalent as parsed to the baseline.
- `.easignore`: two exact plugin files allowed; native harness and all portal,
  server, test, credential and local evidence files stay excluded.
- `lib/memberReadDiagnostics.ts`: unknown status text is not a negative cache
  finding; consume only allowlisted native fields for Android Supabase GET/HEAD.
- `lib/apiFailureTelemetry.ts`: shallow Android first-attempt evidence survives
  normalization; final-attempt fields remain at the existing context root.
- `plugins/withAndroidReadDiagnostics.cts`: reviewed Kotlin startup insertion and
  Java helper copy; fails closed for conflicting startup customization.
- `plugins/android-read-diagnostics/DojiReadResponseHints.java`: passive observer.

The observer calls the existing chain exactly once. It only annotates HTTP 504
responses for HTTPS GET/HEAD on `tvixsmqxotuvyjqzmjla.supabase.co/rest/v1/`.
It does not inspect bodies, credentials, cookies, query values or member IDs.
Writes, Auth, unrelated hosts and non-504 responses are unchanged. Local response
headers (never outgoing) are versioned and overwrite spoofed server hints.

`native_response_source` is `network`, `cache`, `local_cache_miss` or `unknown`.
`native_request_cache_only` is a boolean. `network` means native HTTP receipt,
not proof that Supabase itself produced the response. Cache-miss classification
requires no network/cache response, explicit only-if-cached and the exact native
cache-miss reason. Missing fields remain missing, never guessed. RPC POST reads
are deliberately outside this native observer's scope.

The RN custom-client hook currently has no competing installed caller. Future
networking customizations must compose/review this hook; silently replacing it
would lose evidence. No global HTTP client replacement or TLS change is made.

## Verification

- 33 assertions passed on a dedicated API 36 x86_64 emulator: real OkHttp 4.9.2,
  RN 0.86.3 native NetworkingModule and loopback HTTP/TLS controls. Includes real
  HTTP 504 versus forced cache miss, cancellation/recovery, exact install hook,
  preserved status/body, outgoing-header invariance and exclusion boundaries.
- 9 focused Jest suites / 183 tests passed, covering installed RN JS bridge,
  real Supabase SDK/TanStack recovery, actual Sentry normalization, plugin guards,
  shop controls and read-recovery surfaces. Regression evidence is local under
  `test-results/android-25-local`; native harness is nonshipping.
- Scoped diagnostic/plugin coverage exceeds 90% for statements, branches,
  functions and lines. This does not replace full 17-area coverage qualification.
  Combined: 96.89% statements, 94.14% branches, 100% functions, 99.24% lines;
  each of the three scoped files individually exceeds 90% on all four metrics.
- TypeScript and scoped ESLint passed. Exact Expo Android prebuild places the
  helper install once, before native startup, and copies the exact tested Java
  hash. A sandbox-blocked first prebuild clone is preserved; verified generation
  is under `test-results/android-diagnostics-25/prebuild-verified`.
- Manifest and generated proofs: `test-results/android-diagnostics-25` (ignored).

These are controlled native/JS tests, not full physical-device app acceptance,
cellular-provider reproduction, proof of no remaining failures or scale readiness.

## Cost, release and rollback gates

Fresh authenticated preflight showed $9 remaining of the existing $45 Starter
credit before this candidate. The launch guard requires $1 medium Android build
credit plus a $6 delayed-usage reserve, fresh passing tests and exact hashes,
and no existing build 25 or active Android build. Expo documents medium Android
builds at $1 of build credit:
https://docs.expo.dev/billing/usage-based-pricing/
At actual launch preflight (00:51:17 UTC), allowance remained $45 included,
$36 used, $9 remaining. No overage, retry, paid feature or credential change is
authorized. The existing remote keystore was reused with frozen credentials.

One launch attempt is recorded before invoking EAS. Ambiguous failure requires
read-only history inspection, never a blind retry. The build is Android-only,
medium, production-signed, automatic submission OFF and frozen credentials.
An AAB is not a Play submission or tester availability. Existing security
disposition/physical-device gates remain open; no public production rollout or
mandatory enforcement is included. Do not resolve/mute the Sentry incident.

This adds native code, so removal requires another explicitly approved Android
binary; a JS-only update cannot remove the interceptor. Prior build 24 source
and immutable manifest are retained. Never decrease versionCode or minimum policy.

## Owner-requested emulator follow-up — October 2 MDT / October 3 UTC

The owner asked to try triggering the issue on the emulator. Google's official
bundletool 1.18.3 was downloaded from google/bundletool, verified against published
SHA-256 `a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`.
[Google's bundletool documentation](https://developer.android.com/tools/bundletool)
describes generating APKs from an AAB for local testing. The exact recorded AAB
was converted into emulator-specific splits and signed with the existing local
debug key, not the production key. No JavaScript/source rebuild, cloud build or
store upload occurred. The original AAB remains untouched.

Dedicated emulator `DojiNetworkLab36` / `emulator-5580` ran with airplane mode ON,
Wi-Fi and mobile data OFF before installation/startup. The installed package
reported 1.0.8, versionCode 25, target SDK 36. Cold startup succeeded and the UI
hierarchy showed the actual Doji welcome screen. Background/foreground resume
succeeded. The bounded AndroidRuntime/ReactNativeJS error check showed no output.
This is offline welcome-screen acceptance, NOT signed-in shop-flow acceptance.
No login, signup, terms acceptance, purchase or production request was performed.
The local debug signature and AOSP image do not qualify Play signing/services.

The nonshipping native lab expanded from 33 to 63 assertions and passed all 63
in three consecutive bounded runs. Added TLS disconnect/header/body/malformed/
throttled-body faults and 12 closed keep-alive recovery reads did not spontaneously
produce HTTP 504. Explicit network-504 and forced-cache-miss controls still do,
with correctly distinct native provenance. These deliberately injected controls
are NOT reproduction of the unknown production origin. Actual RN XHR regression
also confirms first-error settlement ignores native trailing success; a race in
the harness's old event capture was fixed without touching the shipped app.

The focused JS suite now passes 184 tests (one additional XHR regression), with
TypeScript/scoped lint passing. Frozen build-25 source hashes still match.
Evidence: `test-results/android-network-lab/native-2026-10-03T02-25-*.log`,
`test-results/android-25-local/emulator-followup-regression.json`,
`test-results/android-diagnostics-25/emulator-startup.xml` and `emulator-25.apks`.
Only test harness/tests and this documentation changed after build 25.

At this stage, signed-in testing still needed a dedicated test account. The
owner subsequently authorized creating one; results are recorded below. No
tester credentials or existing member session was borrowed.

## Owner-approved synthetic member app test — October 3, 02:30–02:45 UTC

The owner explicitly requested creating a test user and using it. One synthetic
ordinary Supabase member, `androidqa_8feb9e5e6c` / `Doji Android QA`, was created
with a reserved `.invalid` email, random password and no employee/business roles.
Credentials and the internal account ID remain in an ignored, owner/SYSTEM-only
local file; they are not release evidence. Auth admin creation confirmed this
synthetic email without sending mail, so this does not test public signup/email
verification. Existing global Auth settings were not changed.

The actual build-25 AAB-derived application on `DojiNetworkLab36` was used for
email/password login, profile creation and normal onboarding. Notifications were
skipped. The normal signup grant showed 200 Sparks; none were spent. No post,
friend request, reaction, challenge participation, purchase or moderation action
was performed. The account is retained for authorized follow-up testing.

Observed through the Android UI hierarchy:

- Initial signed-in profile and Shop loaded, with catalog items and a 200-Spark
  balance. The existing Shop flow includes its member-owned-items read; this
  account has no purchased items, so populated inventory is not qualified.
- Cold startup with emulator airplane mode on and Wi-Fi/data off showed the
  recoverable account-load error, not a sign-out. After restoring Wi-Fi and
  pressing Try again, the same profile and Shop loaded without reauthentication.
- Network loss and background/foreground on the loaded Shop retained catalog
  items. A failed refresh displayed “Could not refresh the shop. Previously
  loaded items are shown.” Restoring Wi-Fi and pressing Try again cleared the
  error; the balance remained 200. Automatic recovery before manual retry was
  not established by this test.

These are bounded live reads using the dedicated account, not a load test. No
unexplained 504 was identified during these app checks, but UI error recovery
does not expose the underlying HTTP status and is not proof of zero telemetry
events. Intentional offline failures may appear in diagnostics for this synthetic
account during this window. No Sentry issues were muted or resolved. Native
controls above distinguish explicitly injected 504s; the production origin is
still unproven. AOSP emulator/debug-signed splits do not qualify Play Services,
push delivery, a tester's carrier/device or physical-device release acceptance.

Local helpers are `scripts/android-network-lab/member-account.mts` (single-user
creation guard and secret-safe entry into the verified emulator) and
`scripts/android-network-lab/ui-state.ps1` (password-redacted UI inspection).
No shipping source, backend configuration, iOS, enforcement or store submission
was changed for this test. The build remains diagnostic and not submitted to Play.

## Additional owner-requested logging — October 3 UTC (LOCAL, NOT IN BUILD 25)

The owner requested more precise evidence and error messaging. This follow-up
changes only Android member-read diagnostics and existing Sentry query reports:

- `diagnostics_version: 2`, allowlisted app state at read start/failure, Android
  numeric API level, fetch invocation count and allowlisted HTTP method. App-state
  samples are not a complete transition history or proof of connectivity.
- Observe existing Response `text`/`json` consumers without eagerly reading,
  cloning or retaining their bodies. Record unread/reading/complete/rejected/
  unavailable and bounded consumption time. Keep response identity and native
  method receiver; unsupported immutable responses retain original behavior.
  A finished request's evidence cannot be rewritten by a late response/body.
- Native hint v2 records HTTP protocol, bounded network transmission-to-headers
  time and prior-response count (up to 20, including redirect/auth follow-ups).
  Server-provided hints are overwritten/removed; no diagnostic headers are sent.
  Cache/local-cache-miss responses carry no claimed fresh network timing.
  The JS parser still accepts build-25 hint v1; unknown versions are rejected.
- Android query exception text now includes a fixed-vocabulary evidence summary,
  e.g. `Doji query.ownedShopItems failed (timeout; network HTTP response 504;
  phase=after_body)`. `failure_evidence` and `failure_phase` tags are searchable;
  details and first/final attempts survive the actual Sentry normalization depth.
  Existing operation/status fingerprints keep grouping stable. No additional event
  type, success logging, per-attempt reporting or expanded event budget is added.

Important measurement limits: RN's XHR/fetch path may buffer the native body
before fetch resolves. JS `headers_ms` is therefore fetch-resolution elapsed time,
not guaranteed wire time-to-first-byte. `body_read_ms` measures JS text/json
consumption (including JSON parsing for json()), not necessarily download duration.
Native network time excludes DNS/connect/TLS and response body and is NOT a
database execution measurement. A `network_http_response` finding still requires
provider correlation; it does not identify the service generating a 504. No
device IP, SSID, carrier, content, full URL, token, arbitrary message or user ID
is collected. No new connectivity probe or library is installed.

Research basis: [React Native AppState](https://reactnative.dev/docs/appstate),
[the exact OkHttp 4.9.2 Response contract](https://github.com/square/okhttp/blob/parent-4.9.2/okhttp/src/main/kotlin/okhttp3/Response.kt),
and [Sentry's normalization-depth guidance](https://sentry.zendesk.com/hc/en-us/articles/30338939116955-Why-are-nested-objects-in-the-context-hidden),
checked against installed SDK behavior and executed tests rather than inferring
provider identity from error wording.

Verification:

- 12 focused Jest suites / 220 tests pass, including installed Supabase SDK,
  TanStack retry/recovery, installed RN XHR and actual Sentry normalization.
- Changed TypeScript coverage: androidReadEvidence 100% on all four metrics;
  apiFailureTelemetry 95.34% statements / 94.57% branches / 100% functions /
  98.52% lines; memberReadDiagnostics 98.68% / 95.49% / 100% / 100%.
- Offline Gradle compilation passes. 67 native assertions pass in each of three
  emulator runs, including genuine TLS 504, forced cache miss, spoofed hint
  replacement, existing redirect behavior and v2 fields reaching the RN bridge.
  No production traffic; the member app was force-stopped and radio disabled.
  Native logs: `test-results/android-network-lab/native-2026-10-03T02-58-*.log`.
- TypeScript and scoped ESLint pass. Source-size guard passes (its first sandboxed
  git spawn was denied; the read-only elevated rerun passed).
- Build-25 AAB SHA-256 remains
  `6347cc411f1a32f4514e66e706e73af1955b6624515840b191a4f649f0e395ba`.
  The old build-25 `verify` command now intentionally rejects changed working-tree
  overlays. Do not weaken that guard, rewrite its manifest or relabel these
  additions as being inside build 25. Frozen uploaded files remain unchanged.

This is local preparation only. No new EAS job, store upload, rollout/enforcement,
iOS, paid service, backend/portal/database/Worker change or Sentry resolution.
Release requires a separately prepared, versioned Android candidate including
`lib/androidReadEvidence.ts`, native helper v2 and these tested integrations.
This follow-up is still diagnostic, not a demonstrated production-root-cause fix.
