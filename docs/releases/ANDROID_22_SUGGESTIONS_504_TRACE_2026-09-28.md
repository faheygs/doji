# Android 22 suggestion-history 504 trace

Read-only investigation requested by the owner on September 28, 2026. No app, backend, database, portal, release, alert, or billing setting changed. No synthetic production workload or paid service was used.

## Exact event

- Sentry issue `7759631063`, event `18f65d65ed4b47fda6d424818c0c09f8`.
- https://doji-i0.sentry.io/issues/7759631063/events/18f65d65ed4b47fda6d424818c0c09f8/
- September 28 at 17:05:58.444 UTC / 11:05:58 MDT; Android distribution **22**, release `com.doit.challengeapp@1.0.8`, production, handled.
- `query.mySuggestions`: HTTP status **504**, `elapsed_ms: 20`, `deadline_ms: 8000`, `abort_source: none`, `error_type: Error`.
- The recorded elapsed time describes the final attempt, not the whole fetch/retry sequence. It does not establish where the 504 originated.

## Request path and client inspection

Inspected the uploaded 101/22 candidate, not just the current working tree:
`hooks/useSuggestions.ts` -> `runMemberRead` / `runAbortableQuery` -> Supabase PostgREST GET `/rest/v1/challenge_suggestions` with the existing own-member filter, safe reviewer projection, descending creation order, and limit 100.

This read does **not** use the app's Cloudflare Worker. The central helper preserves the SDK response status and does not manufacture HTTP 504 for a local deadline. Its SDK GET retries are disabled; the existing TanStack policy permits one transient retry. Sentry reporting occurs after the query's retries fail. A normal local deadline would be a `TimeoutError` with deadline provenance, unlike this event.

The installed PostgREST implementation gets status from the fetch Response; network rejections become status zero. The fetch wrapper forwards caller signals and does not set cache-only headers. No `only-if-cached` directive was found in the inspected application request path. This does not rule out native or intermediate-network responses.

## Supabase production logs (bounded Explorer reads)

Project `tvixsmqxotuvyjqzmjla`, ClickHouse `logs` table, explicit UTC filters.

**17:00–17:10 UTC:**

- 138 API gateway entries, **zero HTTP 5xx**.
- Three `/rest/v1/challenge_suggestions` GETs: all **200**, at 17:00:36.124, 17:01:15.531, and 17:02:04.326.
- Four PostgreSQL entries: normal checkpoint start/completion messages, no ERROR/FATAL/PANIC or statement cancellation.
- Thirteen PostgREST entries: `Warp server error: Thread killed by timeout manager`. Two at 17:05:49 are near the Sentry timestamp but have no matching request identifier. These are not proof of a failing SQL query. Upstream maintainers document that this wording can occur during normal operation.
- Logs also contained Auth and Edge-function activity through the window, so this was not an entirely empty log interval.

**16:45–17:15 UTC widened check:**

- No API gateway 5xx entries.
- Six suggestion-history GETs, all **200**, all `DYNAMIC` cache status, all `supabase-js-react-native/2.105.3`:

| UTC | Log ID | response.origin_time |
| --- | --- | --- |
| 16:49:37.069 | b8de4fa5-63da-421f-a0bd-8f58cb590012 | 124 |
| 16:58:03.566 | 5878b00d-1cd6-4671-849b-6da577f43595 | 20 |
| 16:58:45.312 | 0dd99793-3887-4936-9830-9b12fa1602ad | 41 |
| 17:00:36.124 | 8352115d-a43b-4c75-b65e-222037e846a4 | 98 |
| 17:01:15.531 | e0ac21a5-dc4d-49ed-8fc2-1b5d79f01660 | 109 |
| 17:02:04.326 | d1939094-8738-453a-b4cc-ff76f947e031 | 283 |

The timing column is retained as the provider field, not relabeled as end-to-end handset latency. Nearby successful requests are not proven to be the same device or user as the Sentry failure.

Example query used (the UI's Last hour range included this interval at investigation time):

```sql
select timestamp, id,
  log_attributes['response.status_code'] as status,
  log_attributes['response.origin_time'] as origin_time,
  log_attributes['response.headers.cf_cache_status'] as cache_status,
  log_attributes['request.headers.x_client_info'] as client_library
from logs
where source = 'edge_logs'
  and timestamp >= toDateTime('2026-09-28 16:45:00', 'UTC')
  and timestamp < toDateTime('2026-09-28 17:15:00', 'UTC')
  and log_attributes['request.path'] = '/rest/v1/challenge_suggestions'
order by timestamp asc
limit 20;
```

Separate bounded aggregation checked all API paths for status >=500, not only suggestions. PostgreSQL and PostgREST messages were inspected for the ten-minute window. No tokens, member content, full request URLs, or session identifiers were collected into this report.

## What is and is not established

The client recorded a 504 on build 22; the new diagnostics are functioning. It was not the app's eight-second deadline. Available Supabase logs do **not** corroborate a database/API 504 for this event. That narrows the investigation but does not prove the provider was fault-free or identify a native/network/proxy origin: log gaps and missing request-level correlation remain possible.

The privacy sanitizer intentionally removes request, breadcrumbs, user, and ambient contexts. It currently retains neither provider request IDs nor response-origin/header evidence. Historical recovery of those absent fields is impossible from this event. The native network response and the precise device cannot be identified conclusively.

Google Play still showed build 22 in review while investigating. Its pre-launch-details page provided no report. Therefore automated review-device attribution is **unproven** and must not be stated as the cause.

## Proposed next diagnostic scope (not implemented)

Add tightly allowlisted, bounded response-origin/correlation diagnostics at the member read boundary, preserving retry counts, deadlines, auth, RLS, and API payloads. Capture validated provider request IDs only where available, response-type/cache classification, and known native cache-only signatures without raw error bodies, full URLs, headers, member content, or tokens. Retain per-attempt provenance rather than only the final attempt. Test privacy scrubbing, actual HTTP 504, native-generated 504, network rejection, deadline, late response, and cancellation before a separately approved build.

With one exact-device reproduction, correlate the returned ID with gateway/provider logs. Do not increase timeouts/retries, restart services, buy capacity, suppress alerts, or claim a root-cause fix based solely on the current evidence.

## Primary references

- Supabase API/PostgreSQL log correlation: https://supabase.com/docs/guides/troubleshooting/discovering-and-interpreting-api-errors-in-the-logs-7xREI9
- PostgREST maintainers on misleading Warp timeout logs: https://github.com/PostgREST/postgrest/issues/4799
- OkHttp cache-only semantics (a possible mechanism, not event attribution): https://square.github.io/okhttp/5.x/okhttp/okhttp3/-cache-control/only-if-cached.html
