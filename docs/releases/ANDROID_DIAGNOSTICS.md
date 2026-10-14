# Retired Android 1.0.8 diagnostic builds

Builds 25–28 are superseded by the 1.0.9 release. Their per-build status helpers
and repetitive launch diaries have been retired; Git retains the original records.
The four hard-coded build-launch wrappers are also retired: current release tools
must not rebuild these superseded versions or reuse their historical price checks.
This ledger preserves artifact identity, not instructions to rebuild, roll back a
store version or replay old update-policy changes.

| Build | EAS job | Verified AAB SHA-256 |
| --- | --- | --- |
| 25 | b8dbbb2d-4590-4836-a5c1-998707da4515 | 6347cc411f1a32f4514e66e706e73af1955b6624515840b191a4f649f0e395ba |
| 26 | 3e226ceb-ebab-406f-832c-11468eea74a8 | bd6d37ad9123ae96dc6904357fd99d8236577ce993aa5cb09df125d76e29a87a |
| 27 | 242c9a8b-f1f2-45d8-8e17-0b25cc18bf66 | eb4205782c8fb2f8ad2daf20a163e72cfda5a43391d1a3832e4e7b1476739581 |
| 28 | f5c46c14-8eb1-427d-9ca0-7a4ac08e319b | e2c2ede3bcd7f790e2a69112f68d9589642a420cdb77182562e1fab124173ee8 |

Private artifacts remain under the existing ignored
`test-results/android-diagnostics-{build}/` directories. Build 26's historical
policy snapshot and guarded inverse remain under its `enforcement/` directory;
they must never overwrite a newer policy.

## Enduring diagnostic findings

- RN's Android bridge can lose native reason text. Missing status text cannot
  exclude a native cache-only 504.
- Build 25 added passive native observation; 26 expanded phase/timing context;
  27 corrected attachment to Expo fetch; 28 included further POST diagnostics.
  A network response does not identify which upstream generated it.
- Native hints are bounded, local response annotations, never outgoing headers.
  Observers do not change retries, requests, TLS, credentials or body contents.
- Shallow first/final-attempt context avoids Sentry normalization losing evidence.
  JS fetch/body timings are not DNS/TLS/database execution measurements.
- Offline loopback tests and injected faults did not reproduce the unexplained
  production origin. Keep the retained native/Expo probes and regression tests.
- The synthetic build-25 member test verified signed-in Shop reads and explicit
  recovery after offline failures. It did not qualify Play signing, push, physical
  devices or automatic recovery. Never recreate that account or expose its
  ignored credentials merely to rerun a test.

See [Expo-fetch investigation](ANDROID_26_FEED_504_INVESTIGATION_2026-10-03.md),
[POST investigation](ANDROID_27_POST_504_INVESTIGATION_2026-10-04.md),
[native controls](../../scripts/android-network-lab/README.md) and
[current state](../CURRENT_STATE_AND_GAPS.md). Current diagnostics and release
requirements live in the product/realtime contracts, not old pricing snapshots.
