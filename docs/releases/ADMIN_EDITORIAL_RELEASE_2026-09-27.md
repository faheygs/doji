# Admin editorial release — September 27, 2026

Status: **LIVE, verified September 27, 2026, 19:46 UTC.** Owner's “lets do it”
approved the separately scoped additive DB, Worker, and admin assets.

## Released receipts

- Database migration `20260927030000_employee_editorial_workflows` committed at
  19:44:56 UTC, after successful transactional rehearsal/rollback at 19:44:34 UTC.
- Worker version `461561ec-7d4c-457f-9dda-8f7a16b33c19`, 100% deployment,
  SHA-256 `c618cf1a99e3f0660ff84be28d986de44e4ddded89134ae0e12964651b931e1a`.
- Admin Pages deployment `f57b2692-26a6-4bf3-99fd-7a9f797b5189` on main,
  https://f57b2692.doji-admin.pages.dev and https://admin.dojipro.com.
- Runtime `admin-app-20260927editorial1.js`; all 18 public assets and security
  headers match the exact candidate. Four changed/new assets uploaded; 14 reused.
- Postcommit comparison confirmed all 324 prior public functions/grants and all
  existing policies, relation permissions, triggers, indexes and role settings
  preserved. Outbox overdue 0, lock waits 0, active event windows 0.
- Member profile/realtime/notification/feed/comment read canaries pass. Feed returned
  one real row; sampled thread returned zero comments. This is not device rendering
  proof. Employee access and member/employee denial boundaries pass.
- Live unauthenticated editorial GET reads and POST command denied. First verification
  used GET on the POST-only command and correctly received 405; verification script
  corrected to POST and received expected 401. No valid command was submitted.
- Existing work session restored after page reload, live updates connected, all eight
  historical ideas loaded, a completed idea displayed exact choices and no decision
  controls. Announcement page loaded authoritative empty state and the new form;
  form dismissed without saving. No content, role or moderation decision performed.
- Owner confirmed after release: “Still signed in; profile, feed and comments work.”
  Work-account and personal member-session continuity accepted on the owner's phone.

## Scope and isolation

- Announcement draft, preview, publish/future window, cancellation; bounded history.
- Atomic employee community-idea acceptance/decline, exact options, member-visible
  rationale, existing reward/notification triggers, bounded status history.
- Prior locally qualified admin safety increment: single-flight/retry-safe staff
  actions, authoritative claim-next, complete appeal history, audit late-read guards.
- No mobile source/build/version deployment, business/external intake, authentication
  or session setting, member function/RLS/trigger replacement, new schedule/push
  producer, billing change, or new cloud resource.
- No production announcement/idea decision or staff-role change as a smoke test.
  Deliberate future operator actions have the member effects explained in the UI.
  Shared DB/Worker capacity remains; this is not physical isolation or zero risk.

## Captured baseline and release evidence

Artifacts: `test-results/portal-editorial-release-20260927/`.

- Worker prior version `487ec955-41ed-44d2-a4a1-4e6d0f3f4c7f`, SHA-256
  `bdb7cb6dbbfdf6e82555d7e2fe0bdbad43493cfb5da398c1b7b5a242623aaf43`.
- Prior Pages `17daf056-7d5c-45c9-9512-34cfb2cbcc44`, project `doji-admin`.
- Supabase `tvixsmqxotuvyjqzmjla`: 324 existing public functions/grants captured.
- 19:27 UTC: 0 announcements (16 KiB), 8 ideas (104 KiB), 53 audit rows (112 KiB).
  DB ~322 MB, no overdue outbox, no lock waits. Dashboard CPU 3%, disk 35%,
  RAM 59%, connections 10/60. Ordinary indexes on these small tables use a
  two-second lock/eight-second statement budget; no timeout expansion permitted.
- Next Doji starts 19:33:38 UTC. Shared deployment deliberately waits until its
  ten-minute participation window closes and verifies the next safe window again.

## Included-plan checks (read-only)

Checked current dashboards through the computer-use skill; no billing controls used.
Cloudflare displayed $0 observed/projected usage cost and all usage included:
30.51k/10M requests, 43.92k/30M CPU ms, 40.83k/400k DO GB-seconds. The more recent
Workers overview displayed 33.92k requests / 46,102 CPU ms, also $0 billable usage.
Supabase Pro displayed overages restricted rather than billed, egress 0.70/250 GB,
cached egress 0.21/250 GB, storage 0.09/100 GB, MAU 65/100k, function calls
23,512/2M. This release uses existing resources and no paid add-on. Dashboard
metering may lag; this is not a guarantee about future unrelated usage charges.

## Qualification

- Exact compiled Worker candidate: existing bytes identical after removing only
  the three-route insertion; role/MFA/issuer/audience/expiry/input/flag denials,
  bounded reads, exact command arguments/caller authorization and old routes pass.
- Exact isolated admin candidate: **90/90 browser tests passed**; mocked backends,
  deployed CSP, protected-session/retry/history and editorial accessibility coverage.
- Focused Jest gateway/case/isolation **28/28** passed; auth-client tests passed.
- Offline real PostgreSQL: **40 assertion call sites** plus denial/rollback checks;
  duplicate-create, competing-publish/cancel, and employee-revocation races pass.
- Hosted default privileges grant service_role access to newly created public
  objects. Added explicit revokes for the five new functions and two private tables;
  reproduced defaults in offline tests and verified denial. No existing grants change.
- Full app regression rerun: **131 suites / 1,017 tests passed**, TypeScript passed;
  health 32/32 and queue 15/15 passed. Offline container/VM restored stopped with
  retained data; disposable concurrency-test database removed.

## Deployment and rollback

Guarded SQL compares every existing function/ACL, relation permission, policy,
trigger, index and role setting before and after, and rejects unsafe event windows.
Only five new functions, two RLS-private tables and four indexes are allowed (plus
the two private-table primary-key indexes). Ledger version `20260927030000`.
Production rehearsal applies then rolls back DDL, using bounded reads only, not
publishing synthetic content or invoking real decisions.

Worker upload preserves existing bindings, Durable Object namespace IDs, secrets,
compatibility settings, observability and schedules. It does not deploy dirty Worker
source. Admin upload preserves onboarding assets, configuration and security headers,
adding only `editorialEnabled:true` to the runtime configuration.

Rollback order: restore prior Pages above (or disable editorial feature), restore
prior Worker above, drain new callers, then use guarded `rollback.sql` only if needed.
It removes five editorial functions and retains metadata, indexes, all member content,
audit/command receipts and migration ledger. Do not rerun the initial CREATE migration
after rollback; use a reviewed forward migration for retained objects.

## Reference checks

- [Cloudflare Worker upload metadata](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/):
  `keep_bindings` preserves existing secret bindings; no Durable Object migration sent.
- [PostgreSQL function security](https://www.postgresql.org/docs/17/sql-createfunction.html):
  security-definer search path and grants controlled within the same transaction.
- Further concurrency, authorization and UI references are in
  `ADMIN_EDITORIAL_PREPARATION_2026-09-27.md`.

## Remaining acceptance

Owner direction after release: keep announcement creation/editing/preview wired,
but do not trigger any announcement in the member app yet. Production read-only
check at 19:51 UTC found zero announcements, zero enabled and zero future-enabled
rows. Draft create hardcodes enabled=false; saving and reaching its start time do
not publish it. Publication remains a separate explicit confirmed command. Do not
perform live delivery acceptance without new owner approval for the specific message.

Pre-release observations: a temporarily stale health read recovered on manual
refresh. Existing Sentry groups included a new `query.feed` event first seen at
19:35 UTC, before this release; earlier announcement/upcomingDoji/other groups
remain unresolved. Realtime was Watch (p95 1422 ms, 65 samples, zero over 5s), with
outbox/push/APNs checks healthy. Do not attribute these preexisting observations to
this release or claim this portal increment fixed them. Mobile fixes remain queued.

Read-only production smoke checks do not prove physical-device announcement display,
all historic performance issues, or real-role moderation/media acceptance. Staff-alert
recovery, escalation/deadline and evidence-retention policy remain separate decisions.
Business/external reporting remain deferred. Mobile Sentry fixes remain next-build only.
