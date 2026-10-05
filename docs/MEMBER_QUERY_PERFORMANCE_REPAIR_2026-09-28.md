# Member query performance repair — September 28 UTC

Status: LIVE, owner-approved database-only release at 2026-09-28 03:55:16 UTC.
All four local load gates pass; live fingerprint and bounded read checks pass.
No paid services, production load generation, external
notifications, app build, portal deployment, provider or session changes.

## Production release evidence

- Applied only `20260928040000` / `20260928040100` (concurrent indexes) and
  `20260928040200` (two query bodies), with matching migration-history records.
  No broad `db push`; unrelated working-tree changes were excluded.
- Refreshed baseline at 03:49 UTC matched all 331 functions and captured schema.
  Supabase Infrastructure dashboard showed 0.45 GB used of existing 2 GB disk,
  Micro selected, spend cap enabled; no settings were changed. Each index is 16 KiB.
- Each `CREATE INDEX CONCURRENTLY` was a separate single-statement Management API
  call, not a multi-statement transaction. The connection's verified existing
  **2-minute statement timeout** bounded these operations (including waits).
  The psql draft's 3-second lock timeout/10-minute statement timeout were **not**
  applied over this transport; no global/role timeout was changed. Preflight rejected
  old transactions, lock waits, concurrent index builds, large tables, active Doji
  windows and overdue outbox work. Both indexes immediately verified valid/ready.
- Function replacement was one transaction with a 3-second lock timeout, 30-second
  statement timeout, exact before/after fingerprints and migration-history writes.
  All permissions/owners, RLS, policies, triggers, role settings, default ACLs and
  other 329 public function bodies remained unchanged.
- Live read checks passed for the member profile, realtime authorization, feed
  (one row), notification history and employee session/queue, including reciprocal
  member/employee permission denials. Comment read completed with zero rows;
  this is not proof of populated-thread rendering or comment writes on a handset.
- Exact installed-app notification request (30 days / 200 items) passed read-only;
  `app-shape-canary.json` contains its single database timing. This is a smoke check,
  not a production percentile or load benchmark.
- Post-release: zero overdue/exhausted outbox work, stale/exhausted push shards,
  credential errors or lock waits. **Zero realtime samples** in the five-minute
  window means that check cannot establish current delivery latency.
- Captured live definitions passed exact local restore/reapply in a network-disabled
  disposable database, then that database was removed. The incident rollback is
  `test-results/member-query-release-20260928/rollback-incident.sql`; it guards the
  exact two deployed bodies/owners/ACLs and restores only them, leaving valid indexes.
  Unlike the deployment gate, incident rollback does not require a quiet window.
  Keep original applied history; document an actual rollback as a new forward release.
- Source hashes, live snapshots, index results, release receipt and rollback are in
  `test-results/member-query-release-20260928/`. Five targeted suites / 34 tests were
  rerun successfully during release; after adding the released-artifact parity test,
  all 35 tests passed again, with scoped ESLint and script syntax checks passing.
  Physical-device comment/reply/mention and
  notification-history confirmation remains required.

The computer-use skill was used only for the read-only storage/spend-cap check.
No browser settings, billing, app, portal, Worker or provider configuration changed.

## Approved scope

Repair the two measured blockers in `LOCAL_HEAVY_LOAD_2026-09-28.md` while preserving
member results and authorization. Two function bodies and two supporting indexes:

- `get_notification_center_snapshot_without_post_context`: recipient-first indexed
  comment/reaction IDs via UNION, then safe profile hydration and existing grouping.
  Own posts, mentions, root replies, prospective accepted-friend community activity,
  blocks, actor previews, counts, limits and pending-request priority are preserved.
  Exact reply and moderation wrappers remain byte-for-byte unchanged.
- `sync_comment_mentions`: parse once; match names against primary-key reads of self
  and accepted friends only. No mentions means no profile/friend lookup. Removing
  mentions still deletes stale rows; retained mentions keep their original identity.
- `comments_author_created_idx` and `reactions_author_created_idx`, both on
  `(user_id, created_at DESC)`. Comment author lookup also supports existing exact
  reply/like branches. No broad profile grants or redundant lower(username) index.

No changes to submit/edit commands, rate limits, reward ledgers, trigger producers,
push eligibility, outbox delivery, realtime, Auth, RLS or portal contracts.

## Design sources

PostgreSQL documents that multiply referenced CTEs can prevent predicate pushdown;
materializing already-selected identifiers avoids the previous all-comment JSON
intermediate. See [CTE materialization](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION).
The existing profile primary key suffices for bounded friend candidates; the
[expression index guidance](https://www.postgresql.org/docs/17/indexes-expressional.html)
was considered, but a new global name index is unnecessary for this contract.
Use [concurrent index builds](https://www.postgresql.org/docs/17/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)
for production; they cannot run inside a transaction and failed builds can leave
invalid indexes requiring inspection. They still consume CPU/I/O and are not zero risk.

## Local evidence

Evidence lives in `test-results/local-query-repair-20260928/`. Same network-disabled,
no-port local PostgreSQL 17.6 container and synthetic 100k-account fixture as baseline.
The original baseline performance logs remain in `test-results/local-heavy-20260928/`.
Candidate uses a new disposable database; no production data or credentials.

- All 331 public function ACLs preserved; exactly the two named bodies change.
- Rollback-only old/new full-snapshot comparisons pass across eight caller/window/
  limit cases, including null/zero/one limits, self/stranger/friends, pre-friend
  activity, both block directions, shared polls, direct/flattened replies, mentions,
  pending requests older than lookback, and removed comments.
- Exact actor-preview equality uses distinct timestamps: original ordering for tied
  activity timestamps is unspecified. Initial failure showed the same three actors
  in different order, not a missing or extra notification.
- Mention comparisons execute old/new helpers from identical starting state and
  cover duplicate/case variants, self, nonfriend, empty/null text, removing/editing
  mentions, retained row identity, wrong-author rejection and role grants.
- Post-load instrumented 30-day/200-item notification plan: ~16.7 ms versus ~2,087 ms
  baseline. Candidate comment set hydrated 6 relevant rows, not >500,000 global rows.
  No-mention helper ~0.66 ms versus ~207 ms; positive mentions use profile primary-key
  lookups. These are local plan probes, not phone
  response-time SLOs or completed load qualification.
- Corrected single-client p95: notification history 3.295 ms (baseline 2,015.813),
  comment write 3.513 ms (baseline 174.598). Same local benchmark, not cloud/device SLOs.
- Corrected mixed 8/16/32/64-client ramps all pass without failed transactions or
  timeouts. At 64 clients: 107,470 completed in 30 seconds, overall p95 54.051 ms /
  p99 84.120 ms; notification p95 36.425 ms, comment write p95 36.095 ms.
- 32 concurrent identical comment submissions return the same receipt with exactly
  one comment and one mention. Reaction replay and push-claim exclusivity also pass.
- 100k recipient selection/claim/replay: 256 bounded pages, 100k unique first claims,
  zero duplicate claims/provider requests; ~2,968 ms local. Lease/expiry/retry checks pass.
- Exact rollback restores all 331 captured definitions/ACLs; guarded reapply restores
  the exact candidate. Production rollback definitions must still come from live capture.
- Full twenty-minute heavy soak PASSED: 1,200,106 completed, zero skipped/failed/
  timed-out requests. Overall p95 14.564 ms / p99 18.645 ms; notification p95 4.492 ms,
  comment write p95 7.397 ms. The slowest completed operation was a hot reaction at
  389.471 ms. This is ~1,000 offered database transactions/second on the local VM,
  not 100k concurrent clients or production Micro capacity.
- Actual app-shape stress (30 days/200 items): 60 seconds at 1,000 offered mixed
  transactions/second, 60,076 completed, zero skipped/failed/timeouts; overall p95
  14.914 ms / p99 19.002 ms, notification p95 6.523 ms.
- Post-load recovery: 578 operations in 60 seconds, zero skipped/failed/timeouts,
  p95 17.127 ms / p99 19.703 ms. Ordinary/heavy sampled temporary-file bytes did not
  increase; sampled blocked sessions and deadlock deltas were zero.
- Maximum 500-friend-circle test passes: self and accepted friends match, stranger
  excluded. Final 32-way replay also confirms one durable mention-alert intent.
  Old/new parity and exact rollback/reapply pass again after the load tests.
- Machine-readable final results and source hashes: `summary.json` in the evidence
  directory. The temporary synthetic database is removed after qualification;
  `cleanup.json` records its exact identity. Evidence and reproducible scripts remain.
- Initial candidate ramps at 16/32/64 clients aborted on existing UGC validation,
  not SQL timeouts: some numeric-only synthetic profile suffixes decode to prohibited
  words. Fixture names/captions now prefix numeric suffixes with `v`; all seeded
  fields are validated by the real unchanged filter. Original failed runs are retained;
  only `validated-*` runs qualify. Parity passes again after this fixture-only repair.
- Existing targeted notification/attention/social-write/engagement/scale-contract
  plus new query-boundary Jest regressions: 6 suites / 36 tests pass. Scoped ESLint passes.
- Five-minute ordinary soak: 5,960 completed, zero skipped/errors, p95 14.697 ms,
  p99 19.003 ms. This run uses the same two-day/20-item notification benchmark as
  baseline; an additional stress run covers the app's 30-day/200-item shape.

## Deployment and rollback gate

Read-only live preflight at 03:16 UTC matched all 331 function contracts and all
captured grants/policies/triggers/indexes/settings. Database size was ~169 MB, with
~320 KiB combined current comment/reaction table+index storage; no active Doji,
overdue outbox or lock waits. This was not a deployment, and its quiet-window/storage
checks must be refreshed at release. Capture: `test-results/member-query-release-20260928/`.

Not a portal deployment. The approved release followed these controls (the actual
Management API timeout difference is documented above):

1. Capture live function definitions/ACLs, RLS, triggers and index inventory; confirm
   expected function hashes in the candidate. Check table sizes, free disk and quiet
   window. Do not increase compute, quotas or spend.
2. Build the two exact indexes one at a time using
   `docs/drafts/member_query_performance_indexes_v1.sql` outside a transaction. Check
   the execution transport: psql executes the file statement by statement; a single
   Management API call with multiple statements can create an implicit transaction
   and is not equivalent. Never remove CONCURRENTLY to work around that boundary.
   Check
   `indisvalid`, `indisready` and full definitions. Abort on unexpected names/definitions,
   lock timeout, pressure or insufficient existing storage; never silently skip.
3. Apply `docs/drafts/member_query_performance_v1.sql` atomically only after all local
   correctness/permission gates pass and performance results have been reviewed.
4. Compare all unchanged function bodies/ACLs, policies and triggers; perform bounded
   authorized live reads. Ask owner to check comment/reply/mention and notification
   history in the existing app. No build is required for these SQL changes.
5. If regression occurs, restore only the two captured original function definitions
   in one transaction. Leave valid indexes in place during immediate rollback (safe
   additive structures), then remove only the two new indexes CONCURRENTLY if needed.
   No member data compensation, session revocation or event replay is required.

The 100k fixture is not 100k simultaneous cloud users. Gateway caching, provider
delivery/quotas, network, mobile rendering, realistic graph skew and real-device
notification timing require separate evidence. Do not claim zero failures or full
100k production readiness from a local SQL benchmark.
