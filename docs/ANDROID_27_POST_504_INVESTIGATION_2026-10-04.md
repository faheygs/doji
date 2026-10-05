# Android 27 POST 504 investigation — October 4, 2026

Status: **production 504 unresolved; local diagnostic repair verified**.
The initial investigation was read-only. The subsequent owner-authorized local
repair covers POST observation and command error propagation only. No production
application, provider, database, release policy, or Sentry state changed. No new
store build launched.

## Exact events

| Issue | Event UTC | Operation | Release |
| --- | --- | --- | --- |
| [7772606493](https://doji-i0.sentry.io/issues/7772606493/) | 2026-10-04 16:49:32.845 | query.userEvent | Android 1.0.8, dist 27 |
| [7772609666](https://doji-i0.sentry.io/issues/7772609666/) | 2026-10-04 16:51:58.867 | command.request_friendship | Android 1.0.8, dist 27 |

Event IDs: `aaf79b3411884a2eb591f97621dfa2a0` and
`99dd747056624875af80561d1c90aac0`, respectively. Sentry shows Android API 30.
Current privacy filtering does not establish the physical device, tester,
network, or whether an automated test generated these events.

### Doji state read

`hooks/useUserEvent.ts` calls the direct Supabase POST RPC
`get_current_doji_state`, using a 6,000 ms read deadline.

- Two attempts, total fetch elapsed 339 ms, no abort, app active.
- First attempt: headers at 49 ms, total 54 ms, body read 3 ms.
- Terminal attempt: headers at 14 ms, total 16 ms, body read 1 ms.
- Both HTTP 504, body read completed, missing content type, status text present.
- Cache-only signature false; no native provenance or provider correlation ID.

This is a received 504 response, **not expiry of the six-second app deadline**.
Fast response timing does not by itself identify its source.

### Friend command

`lib/commandGateway.ts` sends POST `/commands/rpc/request_friendship` to the
Worker. Sentry records status 504 and `DOJI_COMMAND_ERROR`; no attempt timings
or native provenance are attached. The Worker's explicit upstream-transport
timeout response uses `DOJI_COMMAND_504`, not that fallback code. This mismatch
does not identify the source; it means the observed error does not match that
specific structured Worker branch. Do not automatically retry uncertain writes.

## Bounded live provider evidence

Queried only October 4 **16:48:00–16:54:00 UTC**.

- Cloudflare doji-orchestrator retained event view: 71 successful execution
  outcomes, zero error outcomes. These labels are not HTTP status guarantees.
  Exact `request_friendship` text search returned zero retained events.
- Supabase API gateway exact-route query returned one row:
  `16:48:05.956000`, `/rest/v1/rpc/get_current_doji_state`, HTTP 200.
  No matching request at the Sentry failure time and no request_friendship row.
- Supabase aggregate for the same six-minute window: **107 rows, all HTTP 200**.
- No raw payloads, identity data, tokens, IPs, or arbitrary headers were saved.

Absence in retained logs is not proof that a request never reached a provider.
Sampling/retention, clock differences, and missing end-to-end IDs limit matching.
Evidence points toward the Android/network path but does not prove a cause.

The Supabase Logs Explorer query used the documented ClickHouse schema:
[official query documentation](https://supabase.com/docs/guides/observability/advanced-log-filtering).

```sql
select timestamp, log_attributes['request.path'] as path,
       log_attributes['response.status_code'] as status
from logs where source = 'edge_logs'
and timestamp >= '2026-10-04 16:48:00'
and timestamp < '2026-10-04 16:54:00'
and log_attributes['request.path'] in
  ('/rest/v1/rpc/get_current_doji_state', '/rest/v1/rpc/request_friendship')
order by timestamp asc limit 40;
```

## Confirmed diagnostic gap and code comparison

Both the native observer (`plugins/android-read-diagnostics/DojiReadResponseHints.java`)
and JavaScript hint reader (`lib/memberReadDiagnostics.ts`) qualify GET/HEAD
reads only. **These POST paths are outside the build-27 native provenance coverage.**
The command error path also lacks the read observer's per-attempt context.
Existing GET/HEAD probe passes do not validate POST diagnostic coverage.

Inspection against repository commit `5458824` (September 22; not independently
verified as the exact formerly working store artifact) shows the same Doji-state
RPC/six-second deadline and friend-command gateway/12-second deadline. Changes
include request-signal lifecycle, auth-refresh handling, and additional failure
reporting. In particular terminal HTTP command errors are now reported, whereas
the earlier command implementation did not report them via reportApiFailure.
Therefore email volume alone is not a valid before/after failure-rate comparison.
This does not discount the failed operations or exclude a regression.

## Required next engineering work

1. Compare the exact last accepted Android artifact/source manifest against 27,
   focusing on fetch implementation, native client setup, cancellation, refresh,
   cache behavior and diagnostics. Do not treat the dirty checkout as a release.
2. Exercise the actual POST RPC and command transport in a controlled Android
   old/new comparison. Test received 504s separately from deadline aborts and
   connectivity loss. Synthetic 504 injection verifies behavior, not origin.
3. Close the verified passive-observation gaps for narrowly allowlisted POST
   endpoints, with no outgoing request, body, cache, auth, deadline or retry
   changes, and no secret/content logging. Validate both Expo and RN fetch paths
   and actual command-to-Sentry context before considering another release.
4. Apply a behavior repair or rollback only to an identified regression; do not
   increase timeouts, bypass the atomic command gateway, add unsafe write retries,
   or mute alerts as a substitute for diagnosis.

No production 504 root-cause repair is established by this investigation.

## October 4 local repair and regression evidence

- A regression test using the installed Supabase SDK reproduced dropped native
  evidence on POST RPCs. Command tests reproduced loss of response/deadline
  evidence when the transport error became the final command error. All three
  original tests failed before the patch and passed after it.
- Native observer now also annotates HTTPS 504 responses for POST
  `/rest/v1/rpc/<function>` on the fixed Supabase host and
  `/commands/rpc/<function>` on the fixed Worker host. These responses use native
  hint version 3. GET/HEAD remain version 2. Other POST routes stay excluded.
- Android command failures retain method, headers/body timing, native provenance
  when present, and deadline-vs-response evidence through final error conversion
  and Sentry normalization. No arguments, tokens or body content are retained.
  Successful commands, iOS dispatch and existing bounded keyed retries are
  unchanged; unkeyed writes are not automatically replayed.
- Eight focused suites: **160 passing tests**. TypeScript and targeted ESLint
  passed. Includes real keyed friend-command dispatch, identical retry body,
  final Sentry context, unkeyed non-replay, deadline cleanup and iOS exclusion.
- Broader `__tests__/lib` plus `__tests__/hooks` run: **115 suites, 1,792 tests
  passed**, including command execution, account boundaries, native transport,
  query recovery and member hooks. This is not a full store-device smoke test.
- Native OkHttp/Expo-builder controls: **96 assertions passed in three runs**,
  including POST comparisons with and without the observer. Evidence:
  `test-results/android-network-lab/native-2026-10-04T18-52-14-871Z.log`,
  `native-2026-10-04T18-52-19-372Z.log`, and
  `native-2026-10-04T18-52-24-062Z.log`.
- Exact local AABs for Android 20 and 27 both contain the configured Supabase
  and Worker host strings and native `okhttp/4.12.0`. This narrow artifact
  comparison is not proof of identical complete transport behavior or of a
  known-good build 20 on the affected tester's network.
- Native controls use the dedicated API 36 emulator; incident API level is 30.
  The controls inject HTTP errors on loopback and do not reproduce the original
  incident or substitute for tester-device acceptance.

Full offline Expo/Hermes POST runtime validation: **52 assertions passed in three
runs** with real native/JSI response bridging and final Sentry formatting. APK
SHA-256 `48ba4210426944604e5ab5cf448426fdc36a026c9ef549509db0a64f2697faa6`.
Evidence under `test-results/android-expo-read-probe/`:
`2026-10-04T18-58-26-298Z.json`, `2026-10-04T18-58-44-117Z.json`,
`2026-10-04T18-58-47-164Z.json`. The runner verified no INTERNET permission;
these POSTs never reached a service or executed a real command. Full keyed
command-to-Sentry conversion is covered by the separate Jest integration test,
not claimed as a real authenticated device command in this offline probe.

The first offline build stalled in a sandboxed Ninja process. Only that verified
build child was stopped; the same build completed outside the sandbox. The
synthetic native-lab package was replaced on its dedicated emulator due to a
debug-signature mismatch. No member package or real account data was removed.

Neither compilation nor injected failures establish the cause of the real
production 504. No new release is authorized by passing these controls. Next
production diagnostic release must be explicitly labeled as diagnostic and use
the verified native POST path; root-cause repair remains gated on evidence from
the affected path/device/network, not absence of errors in these synthetic tests.

## Owner correction: investigate request behavior, not more diagnostics

The owner explicitly rejected treating diagnostic improvements as the requested
fix. No additional runtime/diagnostic change or release was made in this follow-up.

- `__tests__/lib/androidRequestRegression.test.ts` executes historical source from
  commit `5458824` against current implementations, using the installed Supabase
  SDK and controlled responses. Historical source is pinned as text fixtures so
  shallow CI clones need no old Git objects. Four comparisons pass: Doji-state
  POST success and received 504; keyed friend command 504 recovery and exhaustion.
  Request URLs, methods, headers and bodies match; keyed retry count remains two.
  Both historical/current paths fail on persistent 504. This does not reproduce
  the original response source or qualify either APK on a tester's device.
- Published Expo 57.0.24 `runtime.native.ts`, fetch `index.ts`, `NativeRequest.kt`
  and `NativeResponse.kt` match installed 57.0.26 for the inspected files.
  `ExpoFetchModule.kt` differs only by the local passive observer insertion.
  Comparison used the published Expo package on unpkg; no dependency changed.
- September 22 and build-27 lockfiles agree on Supabase/PostgREST/Auth 2.105.3,
  React Native 0.86.3, Sentry 7.11.0, TanStack Query 5.100.9 and whatwg-fetch 3.6.20.
- Historical `docs/PRODUCT_BACKLOG.md` FW-031 already records an Android 1.0.7
  build-17 HTTP 504 on September 22. This predates the later diagnostic releases
  but does not rule out an additional newer regression.
- Play's pre-launch report remains unavailable. Do not attribute these events
  to automated Play testing without evidence.
- New comparison tests, TypeScript and targeted ESLint passed. No rollback was
  performed: no behavioral change has yet been demonstrated to cause these two
  incidents. The exact user-visible failing action has been requested from the
  owner to target acceptance; absence of emails alone is not acceptance.
