# iOS 1.0.8 (103): dependency advisory disposition

Assessed October 3, 2026, approximately 04:30 UTC. Scope: build
`42873c98-ce5a-430e-b7f8-ea75033bb023`, immutable candidate under
`test-results/ios-security-103/upload`, and its already completed Apple upload.

## Decision

**The five remaining root-package advisories are non-blocking for submission of
this exact iOS build. No additional iOS rebuild is required for these findings.**
This is a scoped technical reachability determination, not an assertion that the
packages are patched, a blanket security exception, or clearance for other builds,
Node services, portals, CI jobs or publicly exposed development servers.

The bundled URI-decoder issue was repaired in 103. The owner separately confirmed
103 works in TestFlight in response to the exact-build smoke checklist. Together
with the disposition below, those two previously open technical gates are closed.
Normal App Store metadata/reviewer-access checks still apply. This assessment does
not itself submit a release, authorize unknown declarations, or enforce an update.

## Evidence boundary

- Verified all **352 candidate file hashes** against the pre-launch manifest.
  Lockfile SHA-256:
  `7939d43be0775cf5b524e4bf941fbb9778910788443d5f2825e73fc4e2702fd8`.
- Inspected all **3,032 source entries** in the exact-candidate local production iOS
  export: no source entries for any of the five advisory packages. Ably resolves
  to `ably/build/ably-reactnative.js`, not its Node implementation.
- Source-map SHA-256:
  `ec8ed8d01e2d39b5523b210f93587dc2f7f172a898e5d6aab4ffe5dacefa3687`.
- Read the exact existing EAS job: FINISHED, production profile, STORE distribution.
  Bounded build-log evidence confirms `npm ci`, the production environment guard,
  Hermes, Fastlane/native code signing and successful archive/export. One large
  log was prefix-limited; no claim that every log line was inspected.
- The candidate has no OTA update URL or JS manifest-signing certificate configured,
  and the production profile is not a development client. No custom Metro config
  is in the frozen upload; Babel uses the Expo preset and Reanimated plugin, not
  coverage instrumentation.
- Saved reproducible evidence:
  `test-results/ios-security-103/advisory-assessment-evidence.json`.
  Read-only collector: `node scripts/ios-security-assess-103.mts --cloud`.

The runtime inspection is of a local export of the hash-verified uploaded source,
not a byte-for-byte extraction or attestation of the signed IPA. Static inspection
and successful cloud execution do not prove absence of supply-chain compromise or
all vulnerabilities. No new native penetration test or full device matrix is claimed.

## Findings and disposition

| Package in candidate | Vulnerable operation and local path | Build-103 exposure assessment | Disposition |
| --- | --- | --- | --- |
| `brace-expansion` 1.1.18 / 5.0.9 | Malicious nested/comma brace patterns can exhaust CPU/stack. Reached through minimatch/glob, lint and test tooling. | Not bundled. Inspected export glob is derived from the build's bundle name; other relevant patterns originate in build/tool configuration, not app users, links or member data. This completed trusted-source build did not stall in these operations. This does not make arbitrary future PR/build inputs safe. | Non-blocking for 103. Upgrade the respective maintained branches to at least 1.1.21 / 5.0.12 during a separate tooling refresh, then test the resulting lockfile. |
| `braces` 3.0.3 | Recursive AST walkers process attacker-controlled nested patterns. Through micromatch in Metro file-map/watch and Jest tooling. | Not bundled. Inspected Metro watcher patterns are fixed `**/package.json`, a tooling health prefix, and configured file extensions. File names are matched against patterns; member content is not supplied as a pattern. No custom configuration adds a public pattern input. | Non-blocking for 103. Keep as an open tooling issue; no patched release listed by the checked advisory. Reassess before accepting untrusted pattern configuration or exposing development tooling. |
| `http-cache-semantics` 4.2.0 | Cross-user cached responses can be reused through `max-stale`. Installed via cacheable-request → got → Ably's Node dependency / ngrok tooling. | Not bundled; the mobile export selects Ably's React Native implementation. Independently, installed got defaults have cache disabled, and the inspected Ably Node request builder does not enable it. No shared user-response cache using this package was found in this mobile release path. This finding says nothing about unrelated deployed Node services. | Non-blocking for 103. Keep the dependency finding open; do not downgrade Ably to satisfy the audit. Reassess if enabling got caching or a shared Node proxy. |
| `js-yaml` 3.15.1 | Empty YAML merge sources can cause excessive CPU. This affected copy is used by @istanbuljs/load-nyc-config. | Not bundled. Loader accepts local coverage configuration files. Frozen Babel config does not enable Istanbul; the mobile upload excludes test/coverage configuration. Expo xcpretty and ESLint have separate 4.3.2 copies, which are patched for this advisory. No member-supplied YAML path was found. | Non-blocking for 103. Upgrade the 3.x tooling copy to at least 3.15.2 in the separate tooling refresh. |
| `node-forge` 1.4.0 | Malformed RSA PKCS#1 v1.5 DigestAlgorithm signature verification. Installed under Expo CLI / @expo/code-signing-certificates. | Not bundled. Expo's inspected verification functions serve development/OTA JS-manifest signing, not the installed app's native Apple signature verification. The native-run helper inspected only parses locally obtained keychain certificates for identity fields. The candidate does not configure the JS-manifest signing path; production archive/signing completed through the native build workflow. No attacker-supplied signature verification path was identified in this release. | Non-blocking for 103. Keep the upstream issue open; no patched registry version is listed by the checked advisory. Do not add a custom cryptography patch or treat an unmerged PR as a released fix. Reassess before enabling JS-manifest signing/development-server exposure. |

The recorded npm audit has **53 high affected dependency entries**, not 53 distinct
runtime vulnerabilities. It remains nonzero. The five roots above account for the
remaining recorded advisories; they have not been removed or suppressed by this
assessment. `npm audit fix --force` suggestions that downgrade Expo/Ably or change
major Jest versions are not an appropriate release repair.

## Inspected installed-source anchors

Paths below are relative to the immutable candidate's `node_modules`:

- `expo/node_modules/@expo/cli/build/src/export/embed/exportEmbedAsync.js`:
  trusted build-bundle-name glob.
- `metro-file-map/src/Watcher.js` and `src/watchers/common.js` (also Expo's
  file-map copy): pattern construction and micromatch use.
- `ably/package.json`, `ably/src/platform/nodejs/lib/util/http.ts`,
  `got/dist/source/index.js`, `got/dist/source/core/index.js`: platform selection,
  request options and optional cache handling. Runtime assertion checked got's
  installed default cache value; no network request was made by that assertion.
- `@istanbuljs/load-nyc-config/index.js`: local file discovery and YAML loading.
- `@expo/code-signing-certificates/build/main.js`,
  `expo/node_modules/@expo/cli/build/src/utils/codesigning.js`,
  `expo/node_modules/@expo/cli/build/src/start/server/middleware/ExpoGoManifestHandlerMiddleware.js`,
  and `expo/node_modules/@expo/cli/build/src/run/ios/codeSigning/Security.js`:
  signature-verification call sites and local certificate parsing.

## Sources checked

- Brace expansion: [nested expansion](https://github.com/advisories/GHSA-qhr7-859c-m2p7),
  [comma parsing](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), and
  [quadratic rewriting](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- Braces: [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and
  [upstream report](https://github.com/micromatch/braces/issues/70).
- HTTP cache: [advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) and
  [upstream report](https://github.com/kornelski/http-cache-semantics/issues/56).
- YAML: [maintainer advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
- Forge: [advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and
  [upstream proposed repair](https://github.com/digitalbazaar/forge/pull/1152).
- [Expo's iOS build process](https://docs.expo.dev/build-reference/ios-builds/)
  documents the isolated build VM, credentials workflow and native archive step;
  the exact job's bounded logs corroborate the production archive path.

## Follow-up and invalidation

Track tooling remediation separately; do not describe these packages as fixed or
disable their security alerts. Reassess this disposition on any dependency,
platform entrypoint, Metro/Babel, update-signing, shared-cache or build-input trust
change. Do not reuse this decision as Android, backend, portal or CI clearance.
No new build, cost, dependency modification, production deployment, credentials
change, App Store submission or release-policy update occurred during assessment.
