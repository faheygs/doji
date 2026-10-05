# Android API 30 request canary

This local test runs a bounded set of live API reads with the existing synthetic
member on Android 11, matching the API level in the October 4 incidents. It uses
installed Expo fetch, Hermes, the Supabase SDK and the actual member read deadline
wrappers. It is not the exact store APK, a full screen test, or proof that an
intermittent production failure is fixed.

## Verified result

On October 4, 2026 at 22:37 UTC, all 37 live read checks returned HTTP 200.
Measured per-check durations were 71–326 ms, excluding the initial password
login. `get_current_doji_state` completed in 100 ms and `ownedShopItems` in 79 ms.
Evidence is in
`test-results/member-api-audit/android-api30-2026-10-04T22-38-06-686Z.json`.
Collection verified that the temporary credential file had been removed.

On the same API 30 emulator, 96 native loopback fault assertions and 52
network-disabled Expo/Hermes assertions passed. Their evidence is
`test-results/android-network-lab/native-2026-10-04T22-32-39-193Z.log` and
`test-results/android-expo-read-probe/2026-10-04T22-33-31-940Z.json`.
The four focused request regression suites also passed all 28 tests.

No unexplained live 504 was reproduced, and no production repair is established
by these results. The native controls deliberately create failures; those are
not the original incident. The APK uses the current local dependency graph and
diagnostic observer, including unshipped POST observation, not frozen build 27.
The canary uses an in-memory session rather than the full app session lifecycle,
and the emulator uses this computer's network, not the affected device's network.

## Safety boundary

- Separate package `com.doji.apicanary`, debug signing, local-only version. The
  release bundle is packaged into a debuggable APK for private test provisioning.
- Only dedicated AVD `DojiApiLab30`, serial `emulator-5582`, API 30 is accepted.
- Existing synthetic credentials enter through stdin into app-private storage.
  The app deletes that file immediately after reading it. No credentials in
  command arguments, source, bundled assets, logs or evidence.
- Sentry is not initialized; native automatic initialization and build uploads
  are disabled. The test does not open member screens or register push tokens.
- One password login and bounded, sequential allowlisted requests. No retries,
  friend commands, purchases, moderation, posting, account deletion or real-user
  social actions. `get_current_doji_state` may create or reconcile this QA
  member's own occurrence; it is not a strictly read-only RPC.
- Results retain only request names, status, timing and bounded failure hints.
  No returned content or member identifiers are retained.

## Build and run

Use the installed JDK 21 and local Android SDK. Set `EXPO_NO_DOTENV=1`,
`SENTRY_DISABLE_AUTO_UPLOAD=true`, blank `EXPO_PUBLIC_SENTRY_DSN`, and
`NODE_ENV=production`. Use the existing verified short Gradle-home junction to
avoid Windows native compiler path limits. No EAS command is involved.

Run the Android Gradle wrapper with project `android`, init script
`../scripts/android-api-canary/init.gradle`, architecture `x86_64`, and task
`:app:assembleRelease`. The APK is at
`.artifacts/android-api-canary/build/outputs/apk/release/app-release.apk`.
Verify its package and local-only version with `aapt2 dump badging` before
installing only on the dedicated emulator.

Once installed, run `node scripts/android-api-canary/run.mts --start`. It refuses
to overwrite an existing credential or result file, preventing accidental
repeated live runs. After completion, run the same script with `--collect`.
Collection verifies credential-file removal, records the APK hash and bounded
results under `test-results/member-api-audit`, and force-stops only the canary.
Stop the dedicated emulator after use; never kill the shared adb server.

## Coverage limits

The initial run covers 31 table/RPC read cases plus the QA occurrence fixture,
gateway profile, and four feed/poll gateway variants when an authorized occurrence
exists. This tests requests, not every parameter, screen lifecycle or device
network. It does not cover authenticated content-detail paths without appropriate
post/comment fixtures, uploads, recovery, push registration or live write commands.
The separate isolated database suite covers controlled command behavior; it is
not evidence of native transport coverage for every command.

Fault controls can be run separately with
`node scripts/android-network-lab/run-controls.mts 1 --api30` and
`node scripts/android-expo-read-probe/run.mts --api30`. These use synthetic local
failures, not live service errors. Keep their evidence separate from the canary.
