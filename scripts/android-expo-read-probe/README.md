# Offline Expo native read integration probe

Local-only, separate package `com.doji.exporeadprobe`. This reuses the project's
native module graph and Expo/Hermes runtime with a dedicated synthetic JS entry.
It is **not a store build, member UI smoke test, or reproduction of the production
504**. All files in this directory must remain excluded by `.easignore`.

The manifest removes `android.permission.INTERNET`, and the runner verifies the
compiled APK lacks it before installation. The probe uses real Expo fetch/JSI,
the app's real read diagnostics and API failure formatter, and Sentry's real
JavaScript normalization with a local in-memory transport. No Sentry envelope is
sent. It does not import member screens or initialize member authentication.

Synthetic cache-only reads generate actual OkHttp 504s without network access.
Checks require native provenance to cross JSI, reach the app diagnostics and
survive the final Sentry event normalization. Direct REST and gateway paths are
both tested. Network-origin controls remain in `android-network-lab`; this offline
probe cannot prove live provider behavior, carrier recovery or server health.

## Build and run

First apply/validate the pinned Android Expo observer through the existing
`plugins/android-read-diagnostics/expoClientPatch.cts` helper. This fails closed on
an unreviewed Expo version/source. Do not substitute Expo Go: it lacks this native
observer. The local native project is reused without editing its build files;
`init.gradle` overrides only this invocation's package, entry, manifest, output
directory, local debug signing and probe-only native bootstrap. It disables any
Sentry artifact-upload tasks. `native/` follows the installed Expo 57.0.26 bundled
`template.tgz`: its `ExpoReactHostFactory` replaces the removed host wrapper in
the older generated shell. The original member native sources are not edited.
The older generated Android shell has a removed Hermes compiler path; the init
script lets the installed RN Gradle plugin resolve its matching installed compiler.

From the repository root, with this workstation's already approved SDK/JDK:

```powershell
$env:JAVA_HOME='D:\Rethink Fitness\.tools\jdk-21'
$env:ANDROID_HOME='D:\ChallengeApp\DoIt\.artifacts\android-tools\sdk'
$env:ANDROID_USER_HOME='D:\ChallengeApp\DoIt\.artifacts\android-tools\android-user'
$env:GRADLE_USER_HOME='D:\ChallengeApp\DoIt\.tmp-codex-g'
$env:NODE_ENV='production'
$env:EXPO_NO_DOTENV='1'
$env:SENTRY_DISABLE_AUTO_UPLOAD='true'
$env:EXPO_PUBLIC_SENTRY_DSN=''
& ./android/gradlew.bat -p ./android --init-script ../scripts/android-expo-read-probe/init.gradle --no-daemon --console=plain --max-workers=2 '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=x86_64' :app:assembleRelease
```

Although the Gradle variant is named release (to run the production JS reporting
branch), this uses the public local debug key and the separate probe package.
Never upload it. Native compiler subprocesses may need normal local execution
permissions on Windows; do not disable security settings to make them run.
On this workstation `.tmp-codex-g` is a verified directory junction to the existing
`.artifacts/android-tools/gradle-home` cache, not a separate cache or dependency
change. Its shorter path avoids Ninja's 260-character header-path limit. Verify
that target before reuse; do not overwrite an existing path. Both the alias and
its target are Git-ignored and excluded from the mobile archive.
When switching an already-compiled tree to this alias, old Ninja dependency
caches can retain the long path. Five exact generated `.ninja_deps` files were
preserved as `.ninja_deps.before-short-path`; Ninja regenerated them. No source,
compiled output or dependency version was removed to bypass compilation.

Boot only the existing `DojiNetworkLab36` AVD on `emulator-5580`, then run:

```powershell
node scripts/android-expo-read-probe/run.mts
```

The runner validates the device and APK, leaves the member app installed and
untouched, and captures only the probe's bounded result. It requires all 59
assertions and a success marker, not merely a successful launch. Results are
saved with the APK SHA-256 under ignored `test-results/android-expo-read-probe`. It force-stops only
the probe afterward. Stop the dedicated emulator after use; never kill the shared
adb server. Do not interpret compilation alone as passing this runtime gate.

## Verified run

October 4, 2026 UTC (October 3 MDT): three runs passed all **28 assertions** using
the real Expo/Hermes/JSI bridge and final Sentry JS formatter. APK SHA-256:
`8b486c19ea997784dff96a3aa4837d80f02f1423d703c0a141fb6bb693e5c6ae`.
Evidence: `test-results/android-expo-read-probe/2026-10-04T01-36-53-698Z.json`,
`2026-10-04T01-37-18-570Z.json`, `2026-10-04T01-37-21-715Z.json`.
These are synthetic cache-only responses, not reproduction of the production
feed 504. Network-origin controls are separately covered by the native lab.

The October 4 local extension adds two POST RPC paths and requires **52
assertions** across four captured events. The 28-assertion results above apply
only to the earlier GET probe, not this extended runtime check. The manifest
still excludes INTERNET; no POST leaves the emulator or executes a real command.

Verified October 4 18:58 UTC: all **52 assertions passed in three runs**.
APK SHA-256 `48ba4210426944604e5ab5cf448426fdc36a026c9ef549509db0a64f2697faa6`.
Result files: `2026-10-04T18-58-26-298Z.json`, `2026-10-04T18-58-44-117Z.json`,
and `2026-10-04T18-58-47-164Z.json` in `test-results/android-expo-read-probe/`.
These prove native POST hints survive the bridge/formatter, not the production
504 cause or real tester acceptance.

## Test Lab attribution controls

The Android-only local Expo module `DojiTestEnvironment` reads the system marker
documented by [Google Test Lab](https://firebase.google.com/docs/test-lab/android/android-studio).
The app reads once per process and adds `firebase_test_lab` to Sentry JS error
events without suppressing them. This probe now requires **59 assertions**:
the original 52, three real native-module bridge checks, and one final tag check
for each of the four captured errors. No Firebase SDK or new dependency is added.

After building the offline APK and booting only `DojiApiLab30` on port 5582, run:

```powershell
node scripts/android-expo-read-probe/test-lab.mts
```

This tests the actual Android settings read and final Sentry event with absent,
`true`, `false`, and unexpected synthetic marker values. It runs only the separate
no-INTERNET probe, validates each expected result, and restores the original
setting in `finally`. An unexpected preexisting marker stops the runner rather
than overwriting arbitrary device data. The application module itself never
writes settings. Stop the dedicated emulator after verification.

`detected` means the documented marker was present; `not_detected` is not proof
of a human device. Missing module/read failure/unexpected value is `unknown`.
This is not trusted security evidence, does not identify historical events, and
does not prove a production 504 originated from Google testing. Native crash
envelopes are outside the JS `beforeSend` hook. No store build or production
submission is part of this local verification.

Verified October 4, 2026 at 23:36 UTC: all four native controls passed **59
assertions each**, with the original absent marker restored afterward. APK
SHA-256: `a402d47b7452c985e0f4b53d347cb0b2e90ade0e1ccad36058be131ab24e65ee`.
Bounded evidence under `test-results/android-expo-read-probe/`:

- `2026-10-04T23-36-38-075Z.json`: absent → `not_detected`.
- `2026-10-04T23-36-42-879Z.json`: true → `detected`.
- `2026-10-04T23-36-47-312Z.json`: false → `not_detected`.
- `2026-10-04T23-36-51-855Z.json`: unexpected → `unknown`.

All four runs verified no INTERNET permission and no mocked native bridge.
The dedicated emulator was stopped. The sandbox initially blocked emulator
state-file access, Ninja compilation and Node spawning adb; normal local process
permissions completed the same probe without weakening its manifest boundary.
Focused JS regression suites passed 150 tests; the new attribution helper has
100% statement, branch, function and line coverage. TypeScript and targeted lint
also passed. These results do not assert full-app/device acceptance or a 504 fix.
