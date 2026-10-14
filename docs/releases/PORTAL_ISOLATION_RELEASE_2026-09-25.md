# Portal isolation fixes — release record

## Deployed

- Database migration `20260926000000` applied and recorded in the migration ledger.
  Deployed function bodies were normalized/hashed and matched the tested local SQL
  before commit. Anonymous EXECUTE denied for all three new RPCs.
- Worker `d9912867-421b-4b6c-84b4-527639418dfb` deployed, with existing bindings,
  cron and Durable Object migrations unchanged.
- Admin Pages deployment `5842ffb9`, bundle `admin-app-20260925an.js` live at
  `https://admin.dojipro.com/`.
- Live bundle SHA256 matches local tested output:
  `5512b7665207645a15a181df819a0459d89c054cdaee913e71962c6066c59f24`.
- Live session/work-queue/platform-health routes each return 401 without credentials
  and `no-store, private`; untrusted Origin returns 403. Main page HTTP 200 references
  the new bundle.
- Existing deployed function-definition hashes remained unchanged:
  `admin_user_has_permission`: `186bd7601a923e06ab84299d914cccbc`;
  `get_admin_portal_session_v2`: `d390843110e65e60e1fd94d82f525fc9`;
  `get_operational_health`: `2f41dd049fcd9f57601aaa4377566397`.

The SQL editor's set-value action initially replaced only the current editor range,
causing duplicate-definition/syntax errors in subsequent verification attempts.
The buffer was fully replaced with Select All + paste; a separate read confirmed
zero functions after the rollback-only preflight. The clean deployment then passed
the source-hash assertions, committed, and its grants and ledger were verified.
No fallback dropped/replaced an existing function or touched member data.

## Scope and safety boundary

Four audit fixes: erase protected UI on lock/expiry (including late responses),
load only role-authorized workspace data, paginate/search all authorized active
reports/appeals/ideas, and make portal monitoring reads genuinely read-only.

No mobile files were changed for this task. No member schema, RLS policy, existing
RPC definition/grant, moderation command, notification, alarm, realtime delivery,
or release-enforcement policy is changed by the new migration. Existing legal-only
and business-only staff may sign in but are not silently granted moderation rights.
Their empty queue explicitly explains the additional role needed.

The active queue is oldest-first with a deterministic `(timestamp, type:id)` cursor,
25 rows per UI request, maximum 50 at the RPC. Search and filters execute before the
page limit. Urgent filters select high/critical work across the full authorized set.
Visible counts are labelled loaded matches rather than misleading total counts.
Resolved/archive pagination remains separate. Page failures remain visible/retryable.

Operational health is a 30-second, single-flight aggregate cache per worker isolate;
every caller is still authorized before cache access. Sentry retains its existing
60-second cache. Portal reads never call the Edge monitor that persists event health
snapshots. Scheduled monitor behavior is unchanged. This is logical isolation, not
a claim of separate database/compute infrastructure or zero resource cost/risk.

## Verification

- Authentication client tests: pass, including late session/evidence reads after lock.
- Browser regression: 26 pass, mocked backend; includes idle-expiry drawer/search,
  standalone moderator/legal/business roles, cursor append, server-side search,
  existing moderation confirmation, health, responsive header and accessibility.
- Health model: 28 tests pass.
- Portal isolation/operations/reporting Jest suites: 24 tests pass.
- Worker TypeScript check and website link validation pass.
- Ephemeral PostgreSQL (PGlite 0.3.14): migration compiled; 166 synthetic records
  traversed with tied timestamps, no duplicates; role filters, literal search,
  cursor validation, MFA/banned/revoked/member/anonymous denial and grants passed.
  Fixture uses real permission/session definitions but a stub underlying health
  function. This does not replace a full production-schema verification.
- Production rollback-only preflight compiled the three functions and exercised
  authorized session, queue and health reads without member commands.
- Downloaded production Worker version `78bb69c0-45a6-401a-bae4-35a64e2d70bf` and
  compared it to the dry-run candidate: changes occur only inside `portal-read`.
  All compiled member/alarms/outbox/monitor paths are unchanged.
  Production bundle SHA256: `6621d387670875a7c5cdba20564effdfea0bb66c0f17f8e7d73761140f4bd4d4`.
  Candidate bundle SHA256: `3f2a6fb3c09041f353bb456ecd7aede8b5d94d7efc5920f6963729294e9fc675`.

## Release order and rollback

1. Apply only `20260926000000_admin_portal_isolated_reads.sql`; verify the three
   function bodies match the tested source, anonymous EXECUTE is false, authenticated
   EXECUTE is true, and the functions themselves enforce AAL2 and permission checks.
2. Deploy the compared Worker candidate with unchanged bindings, migrations and cron.
3. Deploy only the `doji-admin` Pages build, bundle `admin-app-20260925an.js`.
4. Verify the deployed bundle hash, unauthenticated/origin rejection, and authenticated
   portal reads. Do not trigger real enforcement or notifications as smoke tests.

Rollback static Pages to its prior deployment, then roll the Worker back to
`78bb69c0-45a6-401a-bae4-35a64e2d70bf`. Leave the three unused additive read functions
in place; no member data restoration or mobile rollback is needed. Reconfirm the
baseline version before using this rollback after any subsequent deployment.

## Limits

No two-device mobile test, load/penetration test, real enforcement or notification
send is part of this release. Broad app-availability certification is not implied.
Authenticated browser testing used fixtures; production authorized RPCs were checked
through the signed-in SQL console, not through a new portal MFA sign-in. The owner
should refresh/sign in and check their queues and Platform operations after release.
Physical separation into independent backend infrastructure would be a separate
architecture/cost decision, not part of these fixes.
