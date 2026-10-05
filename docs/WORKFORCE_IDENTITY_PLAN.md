# Separate employee identity — live

September 30 clarification: the live employee role boundary described below still
uses the shared Supabase Auth directory. It does not support three independent
same-email accounts. The owner has now approved completion of independent directories
and production cutover subject to no new costs. Cost-safety review blocked separate
employee production environment creation; implementation and hosted acceptance are
still incomplete. No independent-directory cutover has occurred. See
`ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md` for tested foundations and gates.

## Current owner decision and implementation status

Employee portal cutover is live September 26. `gfahey@dojipro.com` is the active
super administrator with verified email and MFA. Portal entry uses employee identity;
personal member portal entry is denied. Member sessions, profiles and existing member
rate limits were preserved. Shared infrastructure remains; this is not a separate DB.
See `EMPLOYEE_ACCESS_RELEASE_2026-09-26.md` for deployed versions, regression evidence,
confirmed portal login/retained phone session and rollback. Legacy non-portal administrative contracts
and personal profile flags were deliberately not rewritten.

### Historical enrollment-only handoff (superseded by cutover above)

Current September 26 handoff: owner-only registration is live at
`https://admin.dojipro.com/employee-setup/`. The additive enrollment foundation and
two dedicated Edge functions are deployed; the main portal remains unchanged.
Only `gfahey@dojipro.com` can enroll (owner-selected replacement for the initial Gmail
allowlist). Cloudflare forwards it to verified `faheygs@gmail.com`; the route is active.
Pending enrollment is not administrator access.
Do not apply the old foundation draft again: it was promoted into migration
`20260926030000`. The authorization draft, owner bootstrap, MFA/device acceptance
and eventual login cutover remain separate gates. See
`EMPLOYEE_ENROLLMENT_RELEASE_2026-09-26.md` for exact evidence and rollback.

### Pre-enrollment implementation history

September 26 release preflight: owner employee email is `faheygs@gmail.com`; its old
member identity was deleted and is not to be recreated as a member. Read-only production
checks found inherited PUBLIC helpers requiring review and a deletion regression in the
staged actor FKs. The local actor migration now preserves attribution across Auth deletion
and the new regression fixture passes. No employee release has occurred. Full-schema/Auth
testing now has an owner-approved local Podman/WSL Supabase stack. The production public
schema restored without member data. Migration/grant comparisons, local real Auth flows,
11 portal reads and evidence boundaries pass. A clean final combined migration and
full-schema post moderation/replay/restricted-action/appeal/deletion tests now pass too.
Hosted/device and remaining command/content coverage remain gates. See
`LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md` for exact coverage.
See `EMPLOYEE_RELEASE_PREFLIGHT_2026-09-26.md` for evidence and remaining gates.

The owner approved separate employee identities within the existing Supabase project,
email/password self-registration followed by approval, and **no additional charges**.
This supersedes the separate-provider proposal below; no new project/provider is authorized.
The owner reaffirmed proceeding on this infrastructure when tests pass, with a separate
employee database as a future scaling option. That future migration requires its own
cost/impact approval and an authorized bridge for intentional member moderation; the
current system is logically separated, not physically independent.

The registration handler is implemented locally in
`supabase/functions/_shared/employee-registration.ts` and is disabled unless explicitly
enabled. It creates only a new `doji_employee` Auth identity with no approved portal
roles, unconfirmed email, and a fixed server-owned account type. It never converts a
member, resets an existing password, or grants access from caller metadata. A separate
durable registration budget caps requests at five/hour and 100 total attempts pending
review. Confirmation email uses existing Auth delivery with a fixed portal return URL;
SMTP capacity, redirect allowlisting, provider role persistence and confirmation behavior
still require verification. No new email provider or paid feature may be enabled.

The owner explicitly approved the exact shared-system scope below with “Approve”.
Local work now includes registration UI, pre-password employee identity verification,
pending approval, employee portal token validation, staff directory/role commands, and
a mobile employee-account guard that skips member profile hydration and onboarding.
The signup and sign-in handlers, portal configuration and Worker mode remain disabled
by default. No production deployment or mobile build was performed.

Validation completed locally:
- 68 Jest cases across seven targeted auth/isolation/portal/store suites passed.
- Portal client Node tests passed, including pending/disabled staff and personal-login denial.
- Five mocked-browser tests passed: employee registration/denial and existing sign-in/MFA.
- PostgreSQL fixture passed pending approval, AAL2, role scopes, idempotency, last-owner
  protection, actor attribution/history, member reads, cutover and bounded registration.
- A deliberately introduced PUBLIC function grant was rejected; the authorization
  transaction rolled back as intended. Portal health-model regressions: 32 passed.
- Member-app TypeScript and Worker TypeScript checks passed.

These checks do **not** prove full-schema migration safety, hosted Auth behavior,
physical-device session isolation, billing capacity, or production readiness. The database
fixture intentionally models prerequisites; it is not a full Supabase installation.

### Approved shared-system scope

The earlier review block was resolved by explicit owner approval. SQL drafts remain
outside automatic migration discovery in `docs/drafts/`; do not deploy them until the
full-schema, hosted Auth and session checks pass. In particular, the new employee role's
effective grants must be audited: NOINHERIT does not remove PUBLIC access. The draft
rolls back if unexpected application RPC/table privileges are found, rather than
silently changing member grants to make the test pass.

1. Add a non-login `doji_employee` Postgres role without `authenticated` inheritance;
   grant only exact employee/portal RPCs. Member grants, RLS and RPC bodies stay unchanged.
2. Add private employee records, pending/active/disabled state and audited role commands.
   Bootstrap the owner's exact verified new UUID through a service-only operation, never
   automatically based on registration order or an unverified email.
3. Change only administrative actor foreign keys to support employee Auth IDs. Preserve
   historical actor IDs and read them through a safe member/employee actor directory.
   Reported subjects and all member-content relationships remain member-profile based.
4. Add a separate portal token-validation entry point; member verification continues to
   accept only the existing member role. Employee-mode portal requests reject member tokens
   before MFA enrollment/challenge and never weaken the AAL2 requirement.
5. Add employee-only Storage SELECT for authorized reported evidence, no upload/delete.
   Limit portal realtime grants to admin channels without changing mobile capabilities.
6. Add a mobile employee-account explanation before profile hydration/onboarding; deny
   employee backend access independently of the UI. This would require a separately tested
   mobile release, not a portal-only deployment.

No signup age-hook replacement, global token hook, session-policy change, member conversion,
password reset, billing change, or production deployment is included in current local work.

### Regression, deployment and rollback gates

- Full-schema PostgreSQL tests must cover staff role isolation (including PUBLIC/default
  grants), all portal reads/commands, audit attribution, revocation, last-owner protection,
  idempotency, bounded registration and unchanged member queries/permissions.
- Verify new accounts retain the employee role through email confirmation, password login,
  refresh, MFA and password reset. Verify employee credentials cannot access member data,
  create a member profile, receive member realtime grants, or register member push endpoints.
- Verify profile/comments/feed/participation and member signup continue normally. Run the
  physical-device member-session matrix during portal login/MFA/logout/password reset.
- Enable no registration until the database, role validation, confirmation redirect and
  approval path have all passed. Enroll and verify the owner before switching the portal.
- Cutover must retire legacy personal-account portal authority with an explicit, audited
  identity mapping. Preserve old audit rows and never silently convert a member identity.
- Roll back portal flags/gateway to the prior release if needed, disable employee registration,
  and retain additive employee/audit records. Do not delete members or globally revoke sessions.
- Nothing has been deployed. Local full-public-schema migration and Auth tests now run;
  managed local schemas are not identical to hosted configuration. Do not substitute
  local/unit success for the hosted, command/deletion and physical-device gates.

### Release flags and handoff

1. Validate both drafts against a full disposable Supabase schema, including all portal
   commands and historical actor joins, evidence policies and effective grants. Preserve
   a before/after member-contract comparison. No production migration trial.
2. Validate Admin-created employee role persistence and confirmation/resend against the
   deployed Auth version and configured minimum-age hook. Do not replace the member hook
   or invent a birth date. Local Auth with the real age hook passes: Auth Admin creation
   preserves the employee role without a fabricated DOB; member signup still requires it.
   Failed-email recovery is implemented and locally tested through employee-register's
   `resend_verification` action and service-only `claim_employee_verification_v1`.
   It shares the registration budget and sends only for unconfirmed employee identities
   without member profiles. Unknown/member/confirmed/over-budget requests get a generic
   response and no email; duplicate registrations still cause no account mutation/mail.
3. Check existing Auth/SMTP/Edge usage headroom and spending limits. No new provider,
   paid project or paid build is authorized. Existing infrastructure is still shared.
4. Deploy the database and Edge handlers as a reviewed shared release with flags off.
   `EMPLOYEE_REGISTRATION_ENABLED` and `EMPLOYEE_SIGNIN_ENABLED` default off;
   `EMPLOYEE_PORTAL_ORIGIN` must be the exact approved portal origin. Service credentials
   stay only in the Edge environment. Restrict the confirmation redirect to that origin.
5. Owner supplies a separate work email/alias. After verification and initial sign-in
   creates the pending record, verify the exact UUID out of band and invoke service-only
   `bootstrap_employee_owner_v1` with a reason. Never bootstrap by registration order.
6. Validate MFA and the phone-session matrix in controlled employee mode. Activate the
   database cutover and `ADMIN_PORTAL_EMPLOYEE_ACCOUNTS=true` on the portal gateway,
   then publish portal assets with `DOJI_ADMIN_EMPLOYEE_ACCOUNTS=true`. Coordinate flags
   to fail closed during rollout; do not leave a personal-login fallback after cutover.
7. Release the mobile guard separately after regression testing. Do not include unrelated
   dirty-tree changes in the Worker, database, portal or app release.

Remaining known migration audit: legacy personal `profiles.is_admin` and delegated-role
authority outside the portal helper requires an exact audited owner/staff mapping before
retirement. Do not bulk-clear member profile fields or alter historical actor IDs.
The employee directory is bounded to 100 entries (matching the staged registration cap);
increase capacity only with real paging and an impact review.

## Earlier proposal (superseded; retained for context)

Status: design only. The portal UI release does not change authentication, operator
roles, member profiles, sessions or credentials.

## Outcome

Members keep their existing Doji app accounts. Employees use invitation-only work
accounts with their own credentials, mandatory MFA, staff directory and roles. A staff
account is not a member profile, does not appear socially, and cannot log into the app.
Member sessions do not grant portal access. The owner's work account retains full
super-admin authority; delegated employees retain least-privilege restrictions.

## Isolation and member impact

Use a separate workforce identity issuer/audience and dedicated portal session storage.
Provider selection and any recurring cost require owner approval before provisioning.
The portal gateway accepts only workforce tokens. Staff-to-existing-audit-actor mappings
preserve historic accountability without creating social profiles or rewriting history.
Retain existing atomic, audited moderation commands through a narrowly authorized staff
bridge; never grant broad service-role authority to the browser. Removing an employee
revokes their work access only; it must never revoke a member session.

This requires an approved, separate backend/database scope: portal authorization and
audited administrative commands currently depend on the existing Doji Auth identity.
Changing the login page alone cannot safely decouple that dependency. Member APIs,
Auth configuration, profile RLS and realtime authorization remain unchanged; verify that
their effective grants/policies and runtime behavior are identical across rollout.

## Migration and deployment

1. Select the identity provider, region, cost ceiling and work-email invitation policy.
2. Add workforce validation and staff mapping behind a portal-only feature flag.
3. Enroll a separate owner work account, verify MFA and all super-admin paths in staging.
4. Verify append-only audit attribution for old and new actors and prevent owner lockout.
5. Canary only the owner portal; migrate delegated staff through explicit invitations.
6. Retire legacy member-based portal sign-in only after verified employee access.

## Regression gate

- A member token cannot enter the workforce portal; a workforce token cannot call member
  APIs or join member realtime channels.
- Portal sign-out, idle expiry, password reset and employee revocation leave member
  sessions valid. Mobile sign-out does not revoke staff sessions.
- Moderator/restricted-review/operations roles enforce the existing boundaries, while
  the super admin can exercise all authorized review paths with recorded attribution.
- Comments, profile loads, feed reads, posting, participation, push and realtime pass
  existing member contract tests and physical-device checks.
- No new monitoring polling, user scans, or activation-path load is introduced.

## Rollback

Keep the prior portal auth route behind the feature flag during the canary. Roll back the
portal flag/gateway only; retain additive mappings and audit rows. Do not undo moderation
outcomes, delete staff/audit records, reset Auth globally or change member sessions.

## Monitoring connection follow-up

The UI now distinguishes quiet traffic, limited samples, stale reads, missing telemetry,
Sentry not configured, Sentry access denied and failed reads. These labels do not repair
an absent integration. If the live portal reports an unconfigured/rejected Sentry feed,
approve a separate read-only secret/configuration change: exact org/project, event-read
scope, existing bounded query/cache, no mobile SDK changes and no new paid plan. Test
401/403/provider failure and member route invariance; roll back only that configuration.
