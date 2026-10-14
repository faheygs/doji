# Owner employee enrollment release — September 26, 2026

## Deployed scope

- Setup: https://admin.dojipro.com/employee-setup/
- Final Cloudflare Pages deployment: `b11f7837` (`doji-admin`, main).
- Rollback baseline: `7a33db07-c52a-4516-a0f4-1915fb03448d`.
- Existing 11 portal assets preserved byte-for-byte, verified after final deployment.
  Only three setup assets and their no-store cache header were added.
- Supabase migration `20260926030000_employee_enrollment_foundation` applied in one
  transaction with before/after guards on existing public function definitions,
  member/anon execution and table grants, and public/Storage RLS policies.
- Exactly `employee-register` and `employee-signin` deployed. New configuration:
  `EMPLOYEE_PORTAL_ORIGIN=https://admin.dojipro.com`,
  `EMPLOYEE_ENROLLMENT_EMAILS=gfahey@dojipro.com` (owner-requested update after release),
  `EMPLOYEE_REGISTRATION_ENABLED=true`, `EMPLOYEE_SIGNIN_ENABLED=true`.
- No paid project, provider, plan change or mobile build created. Existing shared
  infrastructure and usage limits still apply; this is not physical isolation.

## Safety boundaries

The agent created no production employee or owner grant. Production checks at release
showed zero employees. Registration creates an unconfirmed, pending employee identity
without a member profile or administrative permissions. Non-allowlisted enrollment
requests are rejected before database budget/Auth/email calls. The current portal
continues its existing login; the employee authorization/cutover table is absent.

Setup never reads or writes browser session storage. Temporary employee sign-in is
used only to read the caller's pending status, then locally logged out. Passwords
are cleared before network completion; errors appear beside the form with focus.
Existing member reads, RLS, authentication hooks, session settings, realtime, push,
Worker and administrative commands were not changed by this enrollment release.

## Verification

### Hosted credential-format correction after owner signup attempt

The owner's initial signup returned `Employee registration is unavailable` before
creating an Auth identity. Hosted API logs showed 401 for the registration budget RPC.
A rollback-only service-role SQL call succeeded; the function and grants were present.
Credential fingerprints established that this deployment's runtime `SUPABASE_ANON_KEY`
and `SUPABASE_SERVICE_ROLE_KEY` values match the project's opaque publishable/secret
API keys, not its legacy JWT keys. Do not infer a key format from the variable name.
The original employee code sent the public key as apikey and the opaque service key
as Bearer authorization. A server-user-agent, read-only reproduction returned 401
`PGRST301: Expected 3 parts in JWT; got 1`; service-key apikey without Bearer returned 200.

Added `employee-service-headers.ts`, used only by employee registration/sign-in:
opaque service keys go in apikey only; legacy service JWTs use matching apikey/Bearer.
Public confirmation/password endpoints continue to receive only the public key.
Twenty-six targeted tests pass, including both key formats and fail-closed cases.
Deployed exactly employee-register and employee-signin; no migration, key rotation,
session-policy, Worker, mobile, email-routing, or main-portal deployment was performed.

Hosted post-deploy checks: nonexistent employee sign-in returns the normal 401 denial
(not precheck 503), registration recovery returns 202 after its employee-only budget
check, and corrected Auth admin headers return 404 for a nil synthetic user UUID
(not unauthorized). No actual account/password/role was created or changed by tests.
The owner must retry signup to verify account creation and real inbox delivery.
The recovery probe does not prove that any email was sent.

### Initial release verification

- 23 registration/sign-in unit tests passed.
- Full admin browser suite: 39 passed; three setup tests re-ran after final spacing fix.
- Restored public-schema enrollment test preserved 306 existing function contracts
  and existing policies. Unexpected PUBLIC RPC exposure aborted the transaction.
- Local real Auth v2.197.0 matched hosted Auth: confirmation, role-preserving refresh,
  password recovery/change and MFA passed. Independent member access/refresh survived
  employee recovery, MFA and local logout. No fake birth date or age-hook bypass added.
- Local registration handler and first-email-failure/resend flow passed with Mailpit.
- Hosted endpoints returned 404 while disabled, then expected 204 preflight, 403 bad
  origin/non-allowlisted enrollment and 400 malformed input after enabling.
- Production pending-status execution allowed; member-profile and portal-session RPC
  execution denied for the employee role. Migration ledger entry verified.
- Final live asset hashes passed (11 unchanged baseline files, three setup assets).
- Live setup visually checked; screenshot: `test-results/employee-enrollment-release/setup-live.png`.

## User handoff and remaining gates

Superseded onboarding presentation: see `EMPLOYEE_ONBOARDING_REPAIR_2026-09-26.md`.
Owner email and TOTP have since been verified. The new setup screens now complete
email/password/MFA before showing pending approval; legacy root email returns route
back to setup. Do not re-register or reset the owner's existing authenticator. The
following initial instructions are retained as release history, not current UI copy.

1. Owner creates the employee account using `gfahey@dojipro.com` and their own new password.
2. Open the verification email. The approved redirect returns to the main portal root;
   return to `/employee-setup/` and choose “Already verified? Sign in to request access”.
3. Stop at pending approval. Verify the exact new Auth UUID and confirmed email before
   any service-only owner bootstrap. Real hosted email delivery remains this canary.
4. Separately finish authorization migration release, MFA, approved command/content
   coverage, hosted/member-phone coexistence checks and login cutover. Do not claim
   complete employee administration from enrollment alone.

The authorization draft, actor-FK/receipt changes, Worker integration, realtime-token
integration and mobile guard remain staged, not deployed by this release. Never deploy
the full dirty site/Worker/migration tree as a shortcut.

## Rollback

### Owner work-email update

The owner requested `gfahey@dojipro.com` forwarding to `faheygs@gmail.com`.
Cloudflare's existing dojipro.com routing was enabled with locked DNS; support and
privacy routes already used this Gmail destination. Added only the exact gfahey rule,
verified Active and destination Verified. Existing routes and disabled catch-all were
preserved. No DNS, billing, sending service, plan or app changes were made.
Updated only the employee enrollment allowlist setting; the returned SHA-256 digest
matched the exact new work address. No Auth account was created, renamed or granted
access. No member sessions were touched. End-to-end inbox delivery remains to be
confirmed with the owner's verification email. Screenshot:
`test-results/employee-enrollment-release/gfahey-forwarding-live.png`.

To undo this address-specific update, disable only the gfahey routing rule and restore
the initial Gmail enrollment allowlist after checking for any pending work-email identity;
do not rename/delete an identity or change other mail routes implicitly.

### Enrollment release rollback

Disable `EMPLOYEE_REGISTRATION_ENABLED` and `EMPLOYEE_SIGNIN_ENABLED`, then roll Pages
back to the baseline deployment above if needed. Retain additive pending identities
and audit/budget records for controlled review; do not drop tables or delete identities
blindly. No global logout, member credential reset or session-policy change is needed.
Do not reapply the old foundation draft; its promoted migration is already recorded.
