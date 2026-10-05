# Local Android network controls

This disposable APK is **not Doji** and does not reproduce the production 504 by
itself. It provides native controls for investigating the Android 24 incident.
It now uses OkHttp 4.12.0, verified from the shipped Android 26 AAB, on an
AOSP API 36 x86_64 emulator. It runs the installed React Native 0.86.3 native
NetworkingModule with its JavaScript event boundary captured by the harness.
It does not run the complete Expo application, Sentry, Supabase, member
authentication or actual UI. Separate Jest tests execute installed RN JavaScript
with a simulated native response boundary and verify Sentry normalization.

All HTTP traffic from the harness targets its own emulator loopback server.
TLS controls trust only a generated localhost certificate; they do not disable
certificate or hostname verification. The production observer has no TLS override.
Only synthetic bearer labels are used. There are no service keys or production
endpoints. The package is `com.doji.networklab`, with debug signing; never upload
this APK to a store. The EAS mobile allowlist excludes this directory.

## Verified October 2, 2026

- Official Google command-line tools 15859902, platform/build tools 36, AOSP
  `system-images;android-36;default;x86_64`, emulator and platform-tools installed
  under ignored `.artifacts/android-tools/sdk` after explicit owner SDK-license
  approval. No paid services, Windows feature changes or global PATH edits.
- Existing JDK 21 reused read-only. Gradle wrapper 8.14.3 / Android plugin 8.12.0.
- WHPX usable. Dedicated AVD `DojiNetworkLab36`, serial `emulator-5580`, 2 GB RAM,
  2 CPU cores, headless software rendering. Boot completed, API 36 / x86_64.
- `assembleDebug` succeeded. SDK schema-version and Gradle-deprecation warnings
  remain; they did not prevent compilation. The harness is not Gradle 9-qualified.
- Initial instrumentation: **33 assertions passed**. Server 504 and forced-cache-miss
  504 are distinguishable natively through `networkResponse`, but both may lack
  provider headers. Default requests do not force cache-only access. Deadline,
  cancellation and connection refusal throw instead of returning an HTTP 504;
  the same client succeeds again afterward. Synthetic no-store responses are
  not served from cache across the two bearer labels.
- Actual RN native controls verify missing reason text, HTTP status/header
  forwarding, cancellation and subsequent recovery. The production observer is
  compiled directly from `plugins/android-read-diagnostics`. TLS controls verify
  network/cache-miss classification, spoofed response-hint replacement, unchanged
  outgoing authorization, no outgoing diagnostic headers or added retries,
  preserved status/body, and exclusion of non-504, writes, Auth and other hosts.
  The install hook is exercised through the real native NetworkingModule, not
  merely by invoking the interceptor in isolation.

These controls do **not** prove production response provenance, real cellular
recovery, account-switch safety in the complete app, push delivery or tester
experience. They do not justify replacing the transport or adding retries.

## Expanded fault run after build 25 — October 2 MDT / October 3 UTC

**63 assertions passed in each of three consecutive runs.** Six additional TLS
faults exercise the real RN native module: disconnect at start, stalled headers,
stalled body, disconnect during body, malformed status line and body transfer
slower than the deadline. Each terminates as an error rather than inventing 504,
and the same module subsequently recovers. Twelve successive reads also recover
from closed keep-alive connections. Traffic remains emulator-local and synthetic.
250 ms fault deadlines / 1 s recovery deadlines bound the lab; they do not change
the member app's deadlines or reproduce a tester's radio/carrier conditions.

An initial lab assertion exposed a harness race: RN text-body error handling may
emit an error followed by trailing success. The old harness overwrote its first
terminal event. Its event capture now fences by request ID and retains the first
completion, matching actual XHR unsubscribe behavior. A test executing installed
RN XHR confirms it ignores the trailing data/success. This was a harness repair,
not a demonstrated production defect; no shipping code or dependency was patched.

Run `node scripts/android-network-lab/run-controls.mts 3` after installing the lab
APK to verify three bounded repetitions and retain non-sensitive logs under
`test-results/android-network-lab`. The runner refuses non-dedicated devices and
fails on missing completion or any FAIL output, not merely adb's exit status.

## Re-run on this workstation

### Full-app synthetic member follow-up

Separate from this loopback harness, the owner authorized one synthetic member
for the real build-25 app. See
`docs/ANDROID_DIAGNOSTIC_BUILD_25_2026-10-02.md` for signed-in Shop, offline
cold-start and reconnect results. `member-account.cjs` must not be rerun to create
duplicates; its ignored credential record is restricted to the workstation owner
and SYSTEM. Never print or commit that file. Its `type` mode targets only the
dedicated emulator after a field has been visually/structurally verified.
`ui-state.ps1` reads that emulator's hierarchy and redacts password fields.
Unlike the loopback harness, the full app makes authorized production reads and
normal onboarding writes for this one account; do not confuse the two scopes.

From the repository root, PowerShell (no global environment changes):

```powershell
$env:JAVA_HOME = 'D:\Rethink Fitness\.tools\jdk-21'
$env:ANDROID_HOME = 'D:\ChallengeApp\DoIt\.artifacts\android-tools\sdk'
$env:ANDROID_AVD_HOME = 'D:\ChallengeApp\DoIt\.artifacts\android-tools\avd'
$env:GRADLE_USER_HOME = 'D:\ChallengeApp\DoIt\.artifacts\android-tools\gradle-home'
& ./android/gradlew.bat -p ./scripts/android-network-lab --no-daemon --console=plain assembleDebug
```

Use a locally installed JDK 21 path instead on another workstation. SDK licenses
must be accepted by that workstation's owner; don't copy license acceptance files.
Start `emulator.exe -avd DojiNetworkLab36 -port 5580 -no-window -no-audio
-no-snapshot -no-boot-anim -gpu software -memory 2048 -cores 2` in a separate
terminal (or a hidden background process). Do not select an attached tester phone.
Confirm `adb -s emulator-5580 emu avd name` returns `DojiNetworkLab36` and
`adb -s emulator-5580 shell getprop sys.boot_completed` returns `1`, then:

```powershell
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s emulator-5580 install -r .artifacts/android-network-lab/build/outputs/apk/debug/DojiAndroidNetworkLab-debug.apk
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s emulator-5580 shell am instrument -w com.doji.networklab/.NetworkLab
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s emulator-5580 emu kill
```

Require the final `PASS 86 native control assertions` output, not just adb exit
code: the instrumentation uses a custom runner rather than JUnit's runner.
Do not use `adb kill-server`, which could disrupt unrelated connected devices.

October 3 diagnostic-v2 follow-up: the harness now has 67 assertions, passing in
three consecutive runs. Added checks verify bounded native protocol/send-to-headers
timing, replacement of spoofed server hints, no network timing for cache-only
misses, existing redirect follow-up count and v2 metadata crossing the native RN
bridge. This is local preparation after build 25, not part of its immutable AAB.

## Expo transport correction — October 3 MDT / October 4 UTC

The earlier RN-only controls did not cover the default fetch implementation:
Expo 57.0.26 installs `expo/fetch`, whose separate client never invokes RN's
`NetworkingModule.setCustomClientBuilder`. This explains missing native hints,
not the source of the production 504. Expo also preserves reason text, unlike
the tested RN XHR bridge. Earlier RN-only conclusions must not be generalized.

The lab now has **86 assertions, passing in three consecutive runs** on OkHttp
4.12.0. Eighteen additional assertions reproduce the old blind spot and exercise
the scoped observer on Expo's provider/builder path, including direct reads,
feed/posts/polls/profiles, network and cache-miss 504s, untouched credentials,
excluded routes and successful recovery. One further assertion checks that the
unrelated context-free client's no-cache default remains unchanged. An early
global-factory candidate was discarded because it could change that default.

The Android config plugin now adds the observer directly to the pinned Expo
fetch builder. It requires exact Expo version and normalized Kotlin source hash;
SDK/source changes fail the build pending compatibility review. One reviewed
Java source generates both Expo-package and RN-fallback helpers. No global client
factory is replaced. Separate Jest tests execute installed Expo fetch/response
JavaScript with a simulated JSI boundary. These layers are not a complete
Expo/JSI end-to-end test and do not reproduce the real production 504.

Incident evidence and remaining release gates:
`docs/ANDROID_26_FEED_504_INVESTIGATION_2026-10-03.md`.

October 4 local POST extension: **96 assertions passed in three runs**. Ten added
checks compare POST RPCs with and without the passive observer, retaining exact
HTTP status/body, credentials and request body without extra requests. This is
synthetic loopback evidence, not reproduction of the production 504. The runner
now requires 96 assertions. See `docs/ANDROID_27_POST_504_INVESTIGATION_2026-10-04.md`.
