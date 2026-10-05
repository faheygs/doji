# Portal case reads — local preparation, September 27

Release update: the implemented contracts/UI were subsequently approved and
deployed in `20260927020000_employee_case_evidence`; see
`PORTAL_TRIAGE_RELEASE_2026-09-27.md`. Local-only status below records preparation
history and is superseded by that release. Limitations still apply.

Status: **prepared and tested locally; wired into the LOCAL browser, NOT deployed,
NOT a complete phase B or production-readiness sign-off.** Owner authorized
backend preparation/testing with no additional cost. No paid services, cloud
builds, downloads, upgrades, hosted API/database calls, provider messages or
production moderation actions were performed. Existing cached local tooling was
used. This does not make a guarantee about unrelated ongoing account usage.

## Exact new scope

- `docs/drafts/20260927010000_portal_case_evidence_and_appeals.sql` creates only
  `get_admin_report_case_v3(uuid)` and `get_admin_appeal_case_v1(uuid)` and their
  employee-only grants/comments. Run the whole file in a transaction; it remains
  outside the migration queue. No existing function is replaced. The subsequent
  approved avatar-access draft must now be applied first; see the avatar record.
- Report v3 delegates exact-case, AAL2 and restricted-queue authorization plus
  the existing evidence-access audit to v2. A fixed three-slot projection adds
  photo, front-photo and video paths. Storage authorization still applies when a
  caller requests a signed URL. This is not a grant to list or read unrelated media.
- Available means the Storage object record exists, **not** that playback or
  object bytes were verified. The contract distinguishes missing objects,
  invalid references and missing content. It never returns a signed URL.
- Appeal v1 authorizes the original account consequence and the report queue
  before exposing evidence. It returns the exact appealed decision, rationale,
  member notice, original actor, account consequence and reversal metadata.
  It removes the report's latest-decision fields to avoid confusing them with
  the appealed decision. An `appeal.case_viewed` audit accompanies the existing
  single report-view audit. The opaque original payload is not exposed.
- Review eligibility explains closed appeals and independent-review requirements;
  the super-admin own-decision override is explicit. These are advisory UI fields:
  unchanged atomic commands remain authoritative and must reauthorize at submit.
- Additive gateway routes `/portal/admin/report-case-v3` and
  `/portal/admin/appeal-case` require employee mode, AAL2 and one valid UUID.
  Existing origin/budget/timeout rules apply; caller JWT is forwarded, responses
  remain no-store, no service-role secret or retry is introduced. Old report
  routing remains v2. The shared Worker source is dirty with unrelated changes:
  **do not deploy the working tree as a release artifact.**

## Verification performed

`node scripts/test-portal-case-reads-local.mts` passed on offline PostgreSQL 17.6
with the retained full-public-schema synthetic fixture database. The runner:

- Requires the exact local container, network mode `none`, no published ports,
  empty Vault and exclusively `@test.invalid` Auth users.
- Tests real `doji_employee`, `authenticated` and `anon` database roles; active,
  disabled, unrelated-role and AAL1 callers; routine and restricted report access;
  a restricted original consequence even when the report queue is routine.
- Covers both image slots, video, comment, poll, account, avatar-policy gap,
  missing object, deleted post/comment and retained closed/deleted-member appeal.
- Verifies ordinary same-actor review is blocked, a different/deleted actor is
  eligible, and the super-admin override is marked. No decision command changes.
- Adds a newer decision to prove an appeal still shows its original rationale,
  notice and account consequence; confirms no opaque payload field leaks.
- Runs member own-profile, feed and comments reads, verifies the unchanged
  ten-minute participation fixture, and alternates ten staff reads with member
  reads. This small sequential workload is **not** a concurrency/scale benchmark.
- Compares all prior public/Storage function definitions and privileges, all RLS
  policies and table grants/RLS flags before rollback; compares the full schema
  fingerprint (including triggers) after rollback. Existing contracts are unchanged.
- Exercises the explicit two-function rollback and old v2 reader afterward.
  All fixtures, audit entries, schema changes and generated local events roll back.
  Normal triggers remain enabled. Missing local catalog data was seeded only
  within the transaction; Storage deletion protection was not bypassed.

Four Jest suites passed, **22 tests total**: portalCaseReads, adminPortalIsolation,
adminPortalOperations and employeeTokenIsolation. New gateway tests cover caller
JWT forwarding, UUID errors, no caching, no legacy member-auth access, AAL1 and
method denial, and propagating database denial without replay. Worker TypeScript
and JavaScript syntax checks passed. That backend-only batch did not change the
browser. The subsequent local UI integration is recorded below.

## Local browser integration — September 27 follow-up

Owner approved connecting the prepared case reads. Changes are limited to portal
JavaScript/CSS, test fixtures and context documentation; no new SQL, Storage policy,
Worker change or deployment was made in this follow-up. The employee-only avatar
permission proposal was sent for separate approval. The owner subsequently approved
local preparation/testing; it is now implemented, not deployed, as recorded in
`docs/PORTAL_AVATAR_EVIDENCE_PREPARATION_2026-09-27.md`.

- Report drawers require the v3 manifest; appeal drawers require the v1 original
  decision, report v3 and review eligibility. An unavailable/old/mismatched service
  shows an inline retry state and never substitutes a queue row as full evidence.
- Appeals show original rationale, member notice, actor, consequence/state and
  restriction expiry, plus an explicit historical-snapshot limitation. Restricted
  consequences and closed/independent-review eligibility gate actions. Unchanged
  audited atomic commands are still the final authority at submission.
- All three current media slots can render. Video is controlled, non-autoplay and
  does not preload. Signing uses the caller JWT, a 15-second request deadline and
  a 300-second token lifetime; UI clears previews conservatively after 240 seconds.
  Origin/bucket/path validation rejects unsafe references and returned URLs.
  Missing, denied, failed and expired previews are explicit. No public avatar URL
  fallback or persistence of signed URLs is allowed.
- Existing coalesced invalidation/foreground refresh also reloads an open case,
  closes stale confirmations and rechecks review eligibility. Workspace epochs
  and request revisions prevent old reads overwriting reopened cases. Closing or
  locking clears protected DOM/media and pauses video. No network polling added.
- Appeal rows retain their identity from command-center and paginated queue data.
  Case section headings use accessible theme tokens; the provenance callout has
  consistent padding. Desktop/mobile light/dark layouts were visually inspected.

Verification: **68 browser tests passed**, including nine new employee-mode
evidence/appeal tests with synthetic JWTs and mocked external endpoints. These cover
multiple media slots, expiry/refresh/cleanup, failed preview, no raw avatar fallback,
incomplete detail gating, original consequence gating, stale confirmation removal,
same-ID read races, responsive geometry and serious/critical accessibility checks.
The signing/auth client suite passed including foreign-origin/bucket rejection,
invalid paths, bounded caller-authorized requests and session cleanup. The four
Jest suites above passed again (22 tests), health classification (32) and queue
health (15) passed, 11-page site validation and Worker typecheck passed.
Browser tests do not prove real Storage bytes/video playback, hosted schema/service
availability, actual role enforcement or scale. The earlier offline SQL result is
unchanged; PostgreSQL was not restarted or changed by this follow-up.

Security design follows [PostgreSQL 17 SECURITY DEFINER guidance](https://www.postgresql.org/docs/17/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY):
fixed empty search path, schema-qualified relations/functions, explicit revocation
of default PUBLIC/client execution and transactional creation/grant changes.

## Unresolved gates — no fabricated evidence or broad permission workaround

1. The approved avatar-access draft now authorizes exact current report and original
   appealed-decision references locally. It adds one employee-only helper/policy and
   moderation-reference index, changes only the employee restrictive boundary, and
   has tested role/member regressions and rollback. No deployment yet. The existing
   public avatar bucket remains public; a signed preview is not a confidential
   historical vault. No raw URL fallback is used. See the avatar preparation record.
2. Historical decisions generally saved only prior moderation state (and a
   profile-photo URL), not original post/comment/poll bodies or media snapshots.
   Current evidence is labeled `current_content`; original evidence says what was
   not retained. A prospective retention design requires explicit retention/access
   requirements and impact approval; no historical content can be reconstructed
   from these fields alone.
3. Browser integration is complete locally, not released. The new detail must load
   successfully before appeal actions are enabled; incomplete queue rows are no
   longer sufficient. Deploying these frontend assets before the versioned RPCs
   and routes would fail closed and prevent case review. Live integration and
   real signed image/video playback are required before release sign-off.
4. The old report wrapper includes history/access-count and delivery-summary
   queries. Fixed response sizes do not prove bounded work at production scale.
   Representative large-history query plans and approved mixed-load checks remain
   release gates; no new shared index or monitoring polling was added here.
5. Real signed media playback, gateway-to-PostgREST schema availability, concurrent
   role/decision changes, complete command replay regression and physical-device
   acceptance remain required. Unit tests mock gateway network responses.

## Proposed deployment/rollback sequence — NOT authorized/executed

1. Resolve the gaps above, review exact SQL/source artifact and cost/capacity
   impact. Capture current hosted versions only after approval. Preserve other
   dirty Worker/mobile work; package only approved differences from deployed code.
2. Apply the additive SQL in one transaction with lock/statement deadlines and
   no broad grants; verify member fingerprints and authorized staff reads. Keep
   old RPCs available. The shared project is not physically isolated or zero-risk.
3. Apply the separately approved avatar draft before the dependent case reads,
   with its index/lock review and employee-only policy scope. Release only reviewed gateway additions, then compatible portal assets after
   browser/real-role acceptance. No mobile build, auth settings, member RLS, push,
   scheduling, update-enforcement or paid-resource changes are included here.
4. Roll back portal callers first, then gateway routes. Apply the companion
   `.rollback.sql` in one transaction after no caller depends on the new reads.
   It drops only appeal v1 then report v3, without CASCADE. Then the avatar rollback
   restores the employee boundary and removes its new helper/policy/index. Preserve all audit
   history and real decisions; rollback must not undo authorized moderation.

## Local environment recovery

The retained `supabase_db_employee-cutover-verify` volume survived the earlier
test-artifact incident. Its matching cached PostgreSQL 17.6 image was started
with `--pull never`, `--network none`, no published ports, Unix-socket access only,
and background preload libraries/scheduled jobs disabled. No Supabase project
link/config, hosted rows or secrets were imported. This is a database-only test,
not a full Auth/Storage HTTP stack. The test container and VM are stopped after
verification; the volume is preserved for future offline tests.
