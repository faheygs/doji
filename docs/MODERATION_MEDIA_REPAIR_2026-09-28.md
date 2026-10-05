# Exact-object moderation media repair — preparation history and release

**Current: installed and enabled September 29.** See `SAFETY_LAUNCH_2026-09-29.md`
and the current-production section at the end. Preparation-only statements below
describe earlier checkpoints, not the current deployment.

## Latest continuation — September 29

Production remains unchanged and public acceptance remains disabled. The following
supersedes older preparation-status notes below:

- Actual delete-account and maintenance callers now have a feature-gated guarded
  cleanup candidate. Default flag-off behavior remains the released behavior.
  Held/failed files keep durable intents; separate queue budgets prevent one queue
  consuming the maintenance invocation. Nine offline actual-caller tests passed.
- Parallel real PostgreSQL sessions passed exclusive media/cleanup claiming,
  stale-lease fencing and conflicting real appeal review. No hosted mutations.
- Worker now persists a pre-deletion signed access probe privately, then verifies
  the identical old signed URL (and public avatar URL) in a later durable stage
  after at least 90 seconds. Only genuine Storage object-not-found qualifies;
  expired tokens, authorization/proxy errors, caches still serving content and
  network failures do not. This cannot recall downloaded/browser-cached copies
  or prove every network location. Hosted neutral canary results below remain
  applicable; new actual local Storage adapter tests passed for both buckets.
- Intake closure trigger requires the exact active decision's media slots to be
  verified. Logical hiding, partial progress or legacy/reference gaps cannot close
  a request as removed. Noncanonical/missing/oversized legacy media is kept as an
  explicit attention/gap record, not allowed to block immediate logical hiding.
- Account deletion marks pending restoration cancelled without stealing its lease.
  A cancellation worker does not make new copies; it reconciles any already-copied
  original into exact removal. Evidence access keeps its restricted classification
  when deletion clears report/member foreign keys.
- Media progress is identifier-only on the existing staff moderation channel;
  existing foreground/reconnect reconciliation refreshes the same audited case.
  Portal shows pending/verified/attention states separately from retained evidence.
- Latest combined rollback-only suite: 78 database assertions plus expected errors,
  including actual intake-command closure gating and deletion cancellation.
- Actual installed local Edge runtime, network disabled, processed two synthetic
  100-MiB streams through the real handler/Storage hashing adapter under 2,000ms
  CPU / 256MiB limits: passed in ~823ms wall time. Evidence:
  `test-results/media-edge-runtime-8OqMHv/result.json`. Transport is mocked there;
  this qualifies that local CPU/memory case, not hosted network latency/throughput.
- Live read-only Cloudflare preflight passed with unchanged public/admin deployments
  and no Turnstile widget yet: `test-results/safety-launch-preflight-3CuLHw/hosting.json`.

Still required before activation: complete worker entrypoint/recovery setup,
production guards and retained-evidence rollback, full combined regressions,
actual employee Storage signing and maximum-size HTTP qualification, fresh usage
checks, complete public-site packaging and real disabled-before-enabled intake E2E.

Owner's “You may” approves the separately explained shared-media repair under the
existing no-new-cost restriction. Hosting/connecting the external intake is already
approved too; do not request those same approvals again. Production intake stays off
until its complete removal, evidence, appeal and delivery path is qualified.

## Verified preparation in this turn

- Refreshed read-only production definitions at 2026-09-29 03:44 UTC:
  `test-results/safety-launch-preflight-U8jxVA/database.json`. Includes actual
  Storage policies, appeal implementations, ownership validation and moderation
  chain. No member files were read or moderated. Avatar bucket remains public.
- `supabase/functions/_shared/moderation-media.ts`: bounded exact-object primitive,
  source identity/version checks, copy without overwrite, streaming SHA-256 byte
  verification, durable archive proof before Storage API deletion, replay after
  ambiguous copy/deletion/acknowledgement, separate origin-removal outcome.
  Private evidence bucket is verified before any copy. Restoration is copy-only,
  verifies identical bytes, refuses different content at the destination, and never
  deletes evidence. This primitive does NOT implement appeal authorization itself.
- `moderation-media-storage.ts`: actual Storage HTTP adapter, no SQL deletion of
  managed Storage rows. Reads are streaming and size-bounded (5 MiB avatars,
  100 MiB post media); 20-second request bounds; redirects rejected; opaque service
  keys use `apikey`, not a fake JWT. No provider errors/private paths are logged.
- `moderation-media-dispatch.ts`: prepared service-secret/feature-gated coordinator
  for one exact object. Every destructive step requires a current durable lease;
  rejected archive acknowledgement prevents deletion. It returns origin removal,
  never a claim of CDN revocation. No deployed entry point or scheduler exists.
- `docs/drafts/moderation_media_ledger_v1.sql`: private service-RPC ledger, explicit
  grants, immutable archive proof, leases, bounded retries and attention state.
  Exact held-path member write restrictions preserve ordinary new-avatar uploads.
  Internal capture requires a real active removal/quarantine decision and matching
  media reference. The separate local integration draft below connects decision
  creation, but no production command has changed.
- `docs/drafts/moderation_media_restoration_v1.sql`: local decision capture and
  reversal integration. Existing atomic moderation/appeal commands retain their
  authorization, audit and receipts. Reversal queues verification rather than
  immediately exposing a post or linking a missing avatar. Another active hold
  prevents restoration; leased work and a one-minute in-flight grace fence reversal.
  Copied avatars require an exact verified Storage identity tied to that member,
  not a blanket ownership bypass. Newer avatars are preserved. Multi-file posts
  wait for every file. Completion sends the existing identifier-only member
  moderation status event. This is tested preparation, **not a deployable release**.

## Tests completed

- `node scripts/test-moderation-media.mts`: **24** offline fault scenarios passed.
  Includes interrupted copy/save/delete/ack replay, missing/changed source,
  corrupt archive, cancelled lease, public evidence bucket, unsafe path, size
  bounds, missing/changed evidence and restoration collision.
- `node scripts/test-moderation-media-dispatch.mts`: **13** offline coordinator
  scenarios passed: authorization/disabled state, empty queue, success, stale
  lease, rejected archive proof, changed source and lost final acknowledgement;
  restoration also tests stale authorization, conflict and missing/rejected ack.
- `node scripts/test-moderation-media-restoration.mts`: **35** database assertions
  passed, plus expected-error checks, in the network-isolated full-schema fixture.
  Real post/avatar moderation and appeal RPCs, two-file visibility gating,
  quarantine -> no violation, current/just-expired lease fencing, stale completion,
  service-owned restored avatar ownership, unrelated unowned avatar denial,
  restored-source recapture, multiple holds, and newer-avatar preservation passed.
  Storage-copy metadata and additional hold records are explicitly synthetic;
  these are not hosted byte/parallel-session concurrency tests. Scoped avatar
  function definition rollback restores all prior definitions/grants. Every
  fixture transaction rolls back. A test-caught trigger variable reference was
  corrected before any release.
- `node scripts/test-media-storage-http.mts`: actual local Storage API passed for
  **avatars and post-media**, using tiny synthetic byte fixtures. Old public/signed
  URLs fail after origin deletion; private evidence denies anonymous access;
  byte-identical restoration/replay succeeds. This is NOT a hosted CDN test, image
  transformation test, large-video runtime qualification, or employee RLS test.
- `node scripts/test-moderation-media-ledger.mts`: offline full-schema rollback
  tests passed for service/member/staff privileges, claim exclusivity, stale leases,
  proof immutability, mandatory archive, origin/CDN distinction, bounded exhaustion,
  held-path reupload denial and ordinary new-avatar upload permission. The offline
  public-schema fixture lacked member Storage policies, so tests use the actual
  read-only policy snapshot above, not invented permissive policies. Existing
  public functions/grants remain byte-for-byte unchanged in this ledger-only test.
- Existing `scripts/test-safety-removal-edge.mts` passed; all email/network responses
  mocked, no real email sent.
- Existing `scripts/test-safety-removal-local.mts` passed again: intake, staff
  bridge, member report, appeal, categories and guarded rollback regression.
- Hosted revocation canary at **2026-09-29 14:05 UTC** passed for one 631-byte
  synthetic JPEG in each of the existing `avatars` and `post-media` buckets.
  Warmed public avatar URL remained a cache HIT immediately after exact-object
  API deletion; warmed signed URLs already denied access. At **75 seconds**, all
  three URLs denied access with genuine not-found responses. Both exact test
  objects were removed and cleanup verified; no member files were touched.
  Evidence: `test-results/hosted-media-revocation-32ef93a6-c35e-4fc5-840a-7eea8deecea5/`.
  No signed URL/key is recorded. This proves only the observed CDN path, not all
  regions/browser caches. Transformed images were not requested because their
  current included allowance had not been reverified.

Local HTTP environment: separate **unlinked** `media-storage-verify` project,
API 127.0.0.1:54431 and DB 127.0.0.1:54432 (IPv6 loopback too), on existing Podman VM.
No hosted project, production credentials, new paid service or member data copied.
Synthetic fixtures/volumes are retained. Use `node scripts/start-media-storage-local.mts`
to start and its `--stop` option to stop only this project with backups preserved.
The separate pre-existing offline `employee-cutover-verify` DB is not stopped by it.

## Unfinished release gates — do not deploy the current media draft

1. Qualify automatic critical-report quarantine, which currently changes post
   status without inserting a moderation decision. The new capture trigger covers
   explicit staff decision creation only. Test real parallel staff/worker sessions,
   full intake -> media verification -> case closure, and archived-state re-removal.
2. Finish restoration qualification for video/all media combinations and account
   action reversal/deletion. The local post/avatar appeal and no-violation paths
   now pass, including restored-source recapture and multiple independent holds.
   Missing/legacy Storage metadata still fails closed and needs a defined staff
   recovery path. Do not deploy triggers that unexpectedly block normal reporting.
3. Wire the tested cleanup reservation primitive into both privileged callers
   (`delete-account` and `run-data-maintenance`). Those callers are still unchanged.
   Qualify partial-batch acknowledgements, held-item deferral without queue starvation,
   total RPC/runtime limits, account deletion/restoration races and tombstone retention.
   Do not stop unrelated retention or account deletion globally.
4. Restricted employee evidence SQL/manifests and the existing case drawer are now
   prepared and locally tested (see below). Qualify actual HTTP signing with employee
   RLS, query plans on representative history, private bucket configuration, and the
   deployed artifact together. No public-URL authorization fallback is permitted.
5. Qualify actual concurrent sessions and cleanup/deletion against worker leases.
   Database tests cover active/just-expired leases, but not every in-flight Storage
   race. Production rollback must retain evidence and necessary visibility guards;
   the test's full transaction rollback is not a live evidence-retention plan.
6. Finish per-object revocation worker and closure gating; verify transformed URL
   behavior only after allowance checks. The hosted public/signed canary passed
   as described above. No system can retract downloaded/browser-cached copies.
7. Qualify worst-case 100 MiB runtime/CPU/memory/egress before allowing that bound in
   production; tiny local files do not establish hosted Edge runtime capacity.
8. Finish live allowance checks, exact guarded migration/rollback, evidence-retaining
   rollback behavior, event/reconnect integration, alert recovery, and intake E2E.

## September 29 continuation — cleanup reservations and preserved evidence

Still local preparation only; no production migration, function deployment, email,
bucket change, member mutation or new paid service in this continuation.

- `docs/drafts/moderation_media_cleanup_v1.sql` coordinates cleanup, late content
  references and decision capture using the same exact bucket/path advisory lock.
  Cleanup reservations pin source identity, require existing durable eligibility,
  and refuse referenced or held files. Only Storage API deletion is allowed; the
  completion RPC verifies absence. Completed paths stay frozen to prevent a delayed
  retry deleting a replacement. UUID-prefix lookups use typed primary-key predicates.
- `_shared/moderation-media-cleanup.ts` validates the complete claim response before
  deleting anything, rechecks leases/identity, and requires durable completion.
  **The real cleanup callers do not use it yet**. This file alone offers no live
  cleanup protection. Per-file service calls and permanent tombstones require
  throughput/retention qualification before activation.
- `docs/drafts/moderation_media_evidence_v1.sql` permits only active MFA employee
  moderators to read an exact, byte-verified archive identity in the private bucket.
  Restricted duplicate reports/consequences require `legal.read`; avatar duplicates
  conservatively protect all photos of that member because old reports lack immutable
  per-photo versions. Explicit restrictive rules deny member/anonymous archive access
  even when another PUBLIC policy allows reads. Staff gain no archive write grants.
- Existing audited case readers receive an additive `preserved_media_manifest`:
  report -> newest decision; appeal -> exact appealed decision, never a newer one.
  At most three fixed slots, unavailable paths omitted, no private URLs or raw payloads.
  Function patch anchors and the previous Storage boundary are checked. Definition
  backups are tested, but this is not yet an evidence-retaining production rollback.
- The portal reuses its existing side drawer, evidence gallery, expiry handling and
  staff-session cleanup. It labels preserved files separately from current content
  and does not claim a complete historical text/content snapshot. An absent additive
  field preserves the existing released API behavior; a mismatched decision fails
  closed. No new Worker route or member-app behavior is introduced by this UI change.
- Verification: **69 database assertions** plus expected denial/error cases in the
  isolated rollback-only restoration/cleanup/evidence suite; ledger regression passed;
  **24 byte**, **13 dispatcher**, **15 cleanup** offline scenarios passed; live-client
  unit suite passed; **14 local browser case-evidence tests** passed, including both
  themes at 390/1440px, no serious/critical Axe findings in those tested drawers,
  decision mismatch, preview expiry and stale-response/session cleanup.
- Browser requests were mocked or restricted to localhost. Screenshots retained in
  `website/admin-portal/browser-test-output/`. Neither these browser tests nor the SQL
  role matrix prove hosted employee signing or real simultaneous worker sessions.

Official access/ownership references checked for this continuation:
https://supabase.com/docs/guides/storage/security/access-control,
https://supabase.com/docs/guides/storage/security/ownership,
https://www.postgresql.org/docs/17/explicit-locking.html.

## No-new-cost checks

Read-only Supabase organization Usage UI (DoIt, Pro) on Sept 28 local showed:
overages **not billed** (restrictions instead), uncached egress 0.72/250 GB, cached
egress 0.25/250 GB, average object Storage 0.09/100 GB, Edge invocations
26,633/2,000,000. Those are time-specific usage readings, not unlimited capacity.
No plan, compute, disk, quota or spend setting was changed.

The owner-approved new intake email path uses Cloudflare, not Resend. Its hosted
runtime canary was delivered and its final Edge function is deployed **disabled**;
see `CLOUDFLARE_SAFETY_EMAIL_2026-09-28.md`. Existing Resend delivery is unchanged.
Cloudflare Pages/Turnstile live allowance setup and complete public-site packaging
remain launch gates from the main intake record.

## Official references checked

- https://supabase.com/docs/guides/storage/management/copy-move-objects
  (cross-bucket copy/move and new-object ownership).
- https://supabase.com/docs/guides/storage/cdn/smart-cdn
  (deletion invalidates signed/transformed cache entries; propagation can take up
  to 60 seconds; browser caches are distinct).
- https://github.com/supabase/storage/blob/master/src/http/routes/object/copyObject.ts
- https://github.com/supabase/storage/blob/master/src/http/routes/object/getObjectInfo.ts
- https://github.com/supabase/storage/blob/master/src/storage/renderer/info.ts
  (request schemas and exact identity metadata; local HTTP behavior also verified).

No production migration, bucket configuration change, member object removal,
portal/app/Worker release, announcement, notification schedule or update policy
change occurred during this media qualification. Only the two neutral hosted
canary objects were created and removed. Public intake remains disabled.
# Current production status — September 29, 2026

The integrated owner-approved repair is now installed and enabled. The qualified
cleanup callers, exact-object ledger, private evidence, dispatcher, later old-URL
verification, restoration, restricted staff reads and closure gates are connected.
The live neutral canary passed copy/hash/privacy/original+transformed URL revocation
and restoration; its objects were removed. No real member moderation was performed.
See `SAFETY_LAUNCH_2026-09-29.md`; historical preparation-only notes below are superseded.
