# Employee avatar evidence — approved local preparation

Release update: subsequently approved and deployed as part of
`20260927020000_employee_case_evidence`; see `PORTAL_TRIAGE_RELEASE_2026-09-27.md`.
Local-only status below is preparation history. Public-avatar, immutable-snapshot
and live-media acceptance limitations remain unchanged.

Status: **implemented and tested locally, NOT deployed.** The owner approved
employee-only avatar permission preparation after the portal UI integration.
No production requests, paid resources, image downloads/installations, member
changes, auth/session changes or provider sends were made by this work.

## Exact scope and access contract

- `docs/drafts/20260927011000_employee_avatar_evidence.sql` adds one boolean
  employee-only authorization helper and one permissive employee SELECT policy.
  It widens only the existing employee restrictive boundary's avatar branch;
  the existing post-media branch and all member/PUBLIC policies stay unchanged.
  An exact preflight check refuses an unexpected preexisting employee boundary.
- Current avatars require an exact profile-photo report and the current profile
  reference. Account-behavior reports alone do not grant photo access. Preserved
  avatars require the exact original reference on a profile-photo decision with
  an appeal. Its stable content ID must match the avatar owner-path prefix even
  when member FKs are detached. Unrelated images in the same folder are denied.
- Every authorization checks employee JWT role, AAL2, active employee status and
  moderation.read. Any restricted queue association or restricted original appeal
  consequence requires legal.read. A duplicate routine report cannot bypass a
  restricted association for the same bytes. Closed appeals remain inspectable
  but not actionable. No upload/update/delete permission is added.
- Canonical UUID-owned paths only; traversal, encoded separators, URLs, empty
  segments and oversized paths fail closed. Members/anonymous users cannot execute
  the new helper. SECURITY DEFINER has an empty search path and explicit grants.
- A partial expression index on profile-photo decision references supports exact
  historical lookup; current references use existing profile/subject indexes.
  This is not proof of bounded scan cost for arbitrarily many same-image reports.
- The earlier local case-read draft now depends on this avatar draft. Report v3
  exposes the current authorized avatar path, not a public fallback URL. Appeal
  v1 exposes a separately labeled original-reference manifest. Missing objects and
  denied/invalid references remain explicit; an authorized path is not proof that
  bytes still exist or play correctly. No decision/moderation command changed.

## Important limitations

The existing avatar bucket is public in the checked-in schema. Employee RLS controls
metadata/signing access; it **does not make known public avatar URLs private**.
Changing bucket publicity, member avatar delivery, object retention or cleanup is
outside this approval. A public-to-private migration needs separate impact/design
approval. No claim of a confidential evidence vault is made.

A saved reference is not an immutable image snapshot. If bytes at that path were
replaced, a preview is not proof of historical appearance. The UI says this explicitly.
Deleted objects are reported missing, never reconstructed. Existing cleanup continues.
Already-issued signed URLs can remain usable until expiry after role revocation;
the portal's local removal cannot revoke a copied bearer URL. The existing five-minute
token lifetime / conservative four-minute UI expiry remains unchanged.

## Verification

`node scripts/test-portal-case-reads-local.mts` runs against the retained PostgreSQL
17.6 fixture container with network mode `none`, no published ports, empty Vault
and synthetic `@test.invalid` accounts only. All schema/data/audits roll back.

It now includes `scripts/test-portal-avatar-evidence-local.sql` and verifies:

- Actual employee/member/anonymous DB roles, MFA/status/role denial, ordinary and
  restricted access, original account restriction on a routine report, duplicate
  restricted report precedence, exact current versus original paths, and no
  bucket-wide or employee write grants.
- Retained references with detached member FKs, closed appeals, removed current
  avatar and missing original object; malformed path denial and no raw URL fallback.
- Existing member profile/feed/comments and participation-window checks, alternating
  staff/member reads, unchanged member function/grant/RLS fingerprints, unchanged
  table privileges/flags, identical member avatar row sets before/after rollback,
  and exact restoration of the employee boundary and full schema fingerprint.
- Index applicability via EXPLAIN with sequential scans disabled for the tiny
  fixture. This establishes an index path, **not** a representative load benchmark.

The recovered fixture contains the public schema but omitted legacy member Storage
policies. The runner recreates the exact checked-in PUBLIC `avatars_read` policy
only inside the rollback transaction. This explicitly tests permissive PUBLIC
policy coexistence and unchanged public/member avatar reads. It is not a hosted
Storage HTTP test or a complete reconstruction of all member upload policies.

The browser fixture verifies caller-signed current and original avatars separately,
historical-reference disclosure and cleanup; all external requests are mocked.
The full **69-test browser suite passed**, as did the four gateway/employee-isolation
Jest suites (**22 tests**), auth/signing client suite, syntax checks and 11-page
site validation. The offline SQL apply/rollback suite passed after the final draft.
Real signed image bytes, hosted schema-cache availability, representative query
plans and concurrent role/decision changes remain release gates.

## Deployment and rollback — not authorized in this batch

1. Inspect the deployed policy/function signatures and exact release artifact.
   Assess historical row counts and index size/lock impact. For a large table,
   prepare a separately reviewed concurrent index build; do not run this local
   transactional CREATE INDEX blindly against production. No capacity upgrades.
2. Apply the approved avatar helper/policies/index, then the dependent case RPCs,
   then reviewed gateway additions, then compatible portal assets. Keep old report
   readers and member paths intact; never deploy the entire dirty working tree.
3. Verify exact role boundaries and member contracts, real Storage signing/playback
   and owner acceptance. Sharing Postgres/Storage still carries capacity risk.
4. Roll back portal callers/gateway first, then the two additive case RPCs using
   their rollback file. Run the avatar rollback to restore the prior employee-only
   boundary and drop only the new policy/helper/index. No CASCADE or member-policy
   change. Preserve real audit and moderation history. Both local rollbacks pass.

Design references: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[PostgreSQL permissive/restrictive policy composition](https://www.postgresql.org/docs/17/sql-createpolicy.html),
and [Supabase asset serving and signed-URL lifetime](https://supabase.com/docs/guides/storage/serving/downloads).
