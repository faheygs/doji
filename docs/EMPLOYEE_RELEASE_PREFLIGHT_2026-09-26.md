# Employee portal release preflight — September 26

Current status: employee authorization and portal cutover are live. The separately
approved employee rate-limit fix passed regression checks and shipped in guarded
migration `20260926040000`. See `EMPLOYEE_ACCESS_RELEASE_2026-09-26.md` for release IDs,
verification and rollback. The owner confirmed successful portal login and retained
personal phone sign-in after cutover; see that release record for exact test scope.

The findings below are historical preflight records, not current release blockers.
Do not reapply old drafts or repeat the one-time owner bootstrap.

Initially, release remained disabled. Initial audit used read-only production queries. After exact
owner approval, the portal redirect allowlist addition below was saved in production;
no employee, Worker/function deployment, database grants, or registration activation
were performed. Owner work email is `faheygs@gmail.com`, now free in Auth.

## Initial live findings (before enrollment deployment)

- `doji_employee` does not exist in production. The drafts have not been applied.
- Production has 63 public, 27 Auth and 8 Storage tables, plus managed extensions
  (including pg_net, pg_cron and Vault). The small PGlite fixture is not that schema.
- No user-defined Auth users trigger currently runs in production. The existing
  minimum-age hook still requires a real birth date; its behavior must not be replaced
  or bypassed with an invented value for employee registration. Admin-created employee
  behavior must be verified through hosted Auth before public registration is enabled.
- The strict employee grant preflight would reject 12 existing PUBLIC-executable
  helpers: seven trigger functions and five scalar economy/level calculators. The five
  inspected calculators return values only from their arguments; this finding is not
  evidence of member-data exposure. Local review now permits only their exact signatures,
  source fingerprints, invoker security and reviewed return/volatility properties. A
  changed helper body and an unexpected PUBLIC RPC both fail/roll back the local draft.
  No existing member grants were revoked to make it pass.
- The staged actor-FK migration used RESTRICT on moderation actor/reviewer references.
  That would regress member deletion for a former administrator. The local draft now
  uses nullable SET NULL links and preserves opaque actor references before Auth's
  cascades execute. It requires the already-released deletion repair. This adds a
  narrowly scoped Auth BEFORE DELETE attribution trigger and indexes for triage actors;
  no insert/update/signup trigger or session setting is changed. Still not deployed.

## Local verification

The employee PostgreSQL fixture now uses the production event-helper argument type and
tests deletion of a former member administrator after employee migration. Historical
decision, reversal, appeal, audit and triage actor UUIDs survive while the login/profile
can be deleted. The positive fixture and unexpected-PUBLIC-grant rollback probe pass.

Initial tooling blocker is now resolved with owner-approved Podman/WSL installation.
The unlinked local Supabase stack is running and its database/Auth/services passed
smoke checks; Windows ports are loopback-only. No cloud project or paid service was
provisioned. See `LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md` for the subsequent full-public-schema
migration, local real Auth/session, portal-read and evidence tests. Those pass, but do
not replace hosted checks or the remaining command/deletion/device regression matrix.

The local managed Auth schema rejected grants issued by the migration role (warnings,
not SQL errors). The draft no longer needs those grants: exact SECURITY DEFINER public
entry points read caller claims and the Storage predicate does not expose Auth helpers
or an arbitrary viewer argument. Employee direct Auth-schema USAGE remains false.

Production Storage policies were separately inspected read-only. Existing PUBLIC avatar
reads remain untouched. An employee-only restrictive SELECT policy prevents that or a
future permissive policy from widening the employee's reported-evidence boundary.

## Remaining release gates

### September 26 final local run and live configuration check

- Clean unlinked `employee-release-final` restored the 63-table public schema, then
  applied both latest drafts. Compared 311 existing functions; only allowlisted portal
  definitions changed. Member/anon function grants and existing table grants/RLS stayed
  unchanged; cutover remained off. Both unsafe-PUBLIC-grant probes rolled back.
- Full-schema tests exposed and repaired two draft defects: employee commands could not
  write the profile-FK member receipt ledger, and Auth deletion could recheck a historical
  actor FK during the profile cascade. The fix uses a private employee ledger/routing
  view for five admin command implementations and retains/nulls actors before cascading.
  The shared member receipt table and member commands were not modified.
- Rollback-only tests pass legacy-admin receipts, employee claim/release/priority,
  removal/replay/reopen/reclose, member appeal/super-admin reversal, restricted temporary
  restriction, escalation/no-violation restoration, and member deletion retaining history.
  This is post-workflow coverage, not proof of every content type and command.
- Real local Auth, registration/resend, evidence boundaries and 11 portal reads pass.
  Final portal suite: 36 browser cases, 32 health-model cases and client assertions pass;
  Worker TypeScript passes. Five targeted Jest suites passed 35 cases.
- Read-only Supabase dashboard check: Pro, spend cap enabled; current MAU 63/100,000,
  Edge invocations 21,536/2,000,000, egress 0.68/250 GB. No plan, billing or service
  changes made. These are observed quota headroom, not a perpetual zero-cost guarantee
  or verification of external email-provider quota.
- Owner approved the exact redirect addition. Saved and verified production Auth
  allowlist now contains `doit://**` and `https://admin.dojipro.com/` (two URLs).
  Supabase reported "Successfully added 1 URL". Existing site URL remains
  `https://expo.dev/@faheybaby/doit-challenge-app`; app redirect, hooks, session settings,
  billing and other configuration were not changed. Evidence:
  `test-results/employee-redirect-approved.png`. This permits portal confirmation
  callbacks but does not deploy or activate employee registration or portal cutover.
- Employee receipt retention needs a separate bounded maintenance review before scale;
  no shared member cleanup job was changed or recurring polling introduced.

1. Clean combined local migration and public-schema/grant comparisons pass. Local
   managed schemas are not an identical hosted clone; retain the managed-policy review
   and broader member/content regression gates. Never use production trials or paid branches.
2. Full-schema post command/actor/deletion paths above pass. Complete remaining portal
   command/content-type and physical-device member read/write regression coverage.
3. Local confirmation/login/refresh/MFA/recovery/role persistence and failed-email recovery
   pass. Verify against the deployed Auth version/configuration before enabling enrollment;
   no birth-date fabrication or global hook changes.
4. Check existing delivery/usage headroom before enabling registration. Deploy the
   reviewed shared release with flags off, enroll the owner, verify the exact new UUID,
   bootstrap super-admin, and have the owner complete MFA and the phone-session matrix.
5. Only then activate employee-only portal access. Keep unrelated dirty-tree changes
   and the separate mobile guard/error-feedback release out of that deployment.
