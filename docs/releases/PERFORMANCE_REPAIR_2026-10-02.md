# October 2 relay and administrator latency repair

## Scope and evidence

Owner approved relay deployment separately after its shared impact was explained.
Three independent artifacts: shared orchestrator relay; employee-portal-v2 SQL
transport; admin-only UI. No database migration, member Auth/session changes,
business/public site release, billing change or paid feature enabled.

The October 2 event audit correlated a stalled relay request with a recovery
request 21,001 ms later. The original provider/network cause remains unproven.
This release bounds stalled-request recovery; it does not claim the historical
504 origin, arbitrary network outages, phone delivery or 100,000-user capacity
has been solved.

## Changes

- Relay: five-second normal headers/body budget, twenty-second recovery budget,
  sanitized per-attempt failure diagnostics, invalid-response retry, and one
  durable 150-second uncertain-lease recheck. Existing two-minute SQL leases,
  publication markers, push eligibility, eight-page cap and backoff are unchanged.
- Employee SQL: six sequential SQL round trips become four. Fixed setup and
  login identity validation share one simple-query request; application parameters
  remain bound and execute only after role validation. No connection pooling,
  permission widening, revocation caching or MFA bypass was introduced.
- Portal: authorized session and command-center reads gate initial workspace;
  health loads afterward. Audit, operator directory, resolved cases and event
  history load only on the relevant screen/filter. In-flight reads coalesce and
  late replies are fenced after lock. Local health-age repaint adds no polling.
- Versioned admin JavaScript URL avoids browsers retaining the old loading path.

## Verification

- 470 admin browser checks passed; 29 existing skipped cases were not exercised.
- 188 tests across durable-alarm, operational-alert and domain-relay suites passed,
  including stalled headers/body,
  late replies, concurrent wakes, adaptive deadlines and lease-expiry rechecks.
- Ordered domain-relay cases include publication markers, leases, replay handling
  and friend-scoped fanout. Final versioned-asset smoke checks also passed;
  the unloaded inbox badge is explicitly pending, never zero.
- 34 restricted-SQL/runtime checks, 114 HTTP/proxy/resources/session-boundary
  checks and 23 bundled browser-transport checks passed.
- Orchestrator TypeScript and repository source-size checks passed.
- Bounded hosted SQL probe using an impossible scope: warm trials changed from
  390/395 ms to 326/327 ms. These measure transport to hosted PostgreSQL from the
  development computer, NOT end-to-end user login latency or production p95.
- Live 20:15 UTC: no overdue/exhausted outbox work; no stale/exhausted push shards;
  no APNs credential errors. Zero realtime samples in the five-minute window means
  latency cannot be assessed from that snapshot.
- Existing member profile/realtime authorization passed; member access to the
  employee directory remained denied. Portal unauthenticated access was 401;
  business-origin access to employee API was 403; both responses were no-store.

## Release and rollback

Shared Worker version: `bb415821-fbe9-4d74-8716-7b36ef24a7fa` at 100%.
Rollback version: `3f34bb34-7b7c-44f6-a59e-7ad200c6cee3`.
All Worker settings/bindings/schedules compared equal after upload. The bundle
changed only its relay section; it was not built from the dirty shared workspace.

Employee function version 7: exact deployed source downloaded and compared;
only restricted-sql.mjs changed. Other functions and all secret digests unchanged
(Supabase refreshed timestamps on its managed keys). Rollback is the captured
version-6 source with the existing configuration; no credential rollback needed.

Admin rollback before these changes: `38bb97d7-0bf0-4be4-8a76-d6f132051b41`.
Final verified Pages deployment: `f11c69bd-20d6-46b1-be54-6c34642d0a4a`,
asset `admin-app-20261002b.js`. The live browser confirmed this exact asset,
restored the existing employee session, and displayed on-demand directory loading.
The UI release preserves the existing employee proxy Worker and site configuration.
Business/public deployment IDs and configuration were verified unchanged.

Bounded release evidence and exact rollback artifacts are local/ignored in
`test-results/performance-repair-20261002/`. `portal-verified.json` records the
latest verified Pages deployment. Release helper refuses stale baselines and
checks the event window before shared Worker or employee endpoint upload.

Fresh owner-entered password/TOTP latency still requires owner confirmation;
automated synthetic MFA tests do not substitute for that experience. Existing
employee-session restoration is checked through the authorized live browser.

## Follow-up: remaining employee latency

After the owner reported continuing slowness, bounded missing-session probes
showed the automatically selected employee function region was `us-west-1`
while the restricted database pooler was in `us-west-2`. A missing-session lookup
performs no real employee/member mutation and calls no identity provider.
Instrumented function time was 233/243 ms in California versus 38/46 ms in Oregon;
cold/request-network overhead is separate. These are a few diagnostic samples,
not production p95 or full authentication measurements.

Deployed separately:

- Employee function version 8 adds request-local fixed numeric stage timing.
  SQL transactions, auth checks, cookies, provider calls, privileges and secrets
  are unchanged. Rollback: captured version 7 source.
- Admin Pages removes the duplicate session read immediately after successful
  employee MFA. It uses the already-authorized operator returned by that exact
  response once; restoration/refresh still read the live session, and commands
  independently authorize. No permission/revocation cache was introduced.
- Owner explicitly approved employee-only Oregon routing after the safety check
  required approval of its failover tradeoff. The proxy overwrites any client
  region input. Pinning disables automatic regional rerouting; never replay an
  uncertain write in another region. Roll back the Pages deployment if needed.
- Safe `Server-Timing` and region headers and fixed-route console timing contain
  no request/response payloads, emails, keys, tokens, SQL or content identifiers.

Final admin deployment: `a1969a92-dbb4-4c2a-90fd-de38db99d658`, asset
`admin-app-20261002d.js`. Pre-region rollback:
`d3879775-44a6-4655-80d0-c3925941ba13` (retains diagnostics and the duplicate-read
repair, restores automatic region selection). Pre-follow-up rollback:
`f11c69bd-20d6-46b1-be54-6c34642d0a4a`.
All business/public deployment identities and configurations stayed unchanged;
other Supabase functions and secret digests stayed unchanged.

The subsequent one-line hover-contrast correction is verified as deployment
`a4ee3e2f-80b6-4dc7-b894-9494d6303822`; JavaScript remains `20261002d` and CSS
is cache-busted with `v=20261002a`. Its immediate rollback is the Oregon-routed
`a1969a92-dbb4-4c2a-90fd-de38db99d658` deployment; the pre-region rollback above
is still the correct choice to restore automatic regional routing.

Live hostname probes after deployment confirmed `us-west-2`, expected HTTP 401
for absent sessions, and 57/42/50 ms function time. Total client-observed time was
831/552/517 ms. The browser loaded the exact new asset and restored its existing
employee session. Fresh password/TOTP elapsed time still needs a user-entered
login; no owner credential or OTP was extracted or synthesized.

After release, single live-browser checks measured roughly 1,565 ms from reload
to the restored workspace and 1,327 ms from opening Access & roles to a returned
operator row. These include browser automation overhead and are not percentiles;
they do not measure a fresh password/TOTP login.

Evidence/rollback sources: ignored `test-results/employee-latency-20261002/`.
Unit/runtime tests cover timing isolation, secret-header rejection, server-owned
routing, no automatic replay, revocation and MFA. Browser regression explicitly
checks no extra session request after MFA and successful portal-only lock.

Follow-up verification: 126 restricted-SQL/HTTP/session/resource/health/timing
checks and 32 proxy/runtime/timing checks passed (timing checks overlap); 23
browser-transport checks passed. Synthetic Deno Edge and Cloudflare runtime
checks passed. Full admin browser run: 469 passed, 29 existing skips, two failures.
The local asset-connection reset passed its isolated rerun. The reproducible
light-theme health-button hover contrast failure was fixed with a single scoped
CSS rule; all six responsive/theme consistency cases, the editorial rerun and
the independent MFA test passed together (8/8). The full suite was not rerun a
second time. Source-size guard passed. Live read-only canaries confirmed member
profile/realtime access, denial of member employee-directory access, anonymous
401 and cross-origin 403. No overdue/exhausted delivery work was observed; zero
recent delivery samples means no latency conclusion for member traffic.

## Primary references

- [Cloudflare Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/): one durable alarm; delivery/retry semantics require idempotency.
- [node-postgres queries](https://node-postgres.com/features/queries): application parameters remain separate from SQL text.
- [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres): retain the existing transaction-mode pooler for short serverless transactions.
- [Supabase regional invocation](https://supabase.com/docs/guides/functions/regional-invocation): database locality may help multi-round-trip functions, but pinning disables automatic regional rerouting. No regional pin was introduced without measured evidence.
