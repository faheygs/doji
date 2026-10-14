# Employee onboarding repair — September 26, 2026

## Cause and scope

A read-only query confirmed the owner's `gfahey@dojipro.com` identity has role
`doji_employee`, verified email and verified TOTP. MFA itself completed. The main
legacy portal then failed employee authorization, retained the consumed enrollment
screen, and a second click displayed “Choose Authenticator app to begin setup.”

This repair does not enable employee workspace access, grant owner permissions, or
deploy the authorization/actor-FK migration. Existing pending-approval gates remain.

## Changes

- Signup transitions to a dedicated, keyboard-focused Check your email screen.
- A separate employee setup flow handles password sign-in, existing TOTP challenge,
  first-time TOTP enrollment, invalid-code retry, and truthful pending/approved states.
- Pre-auth employee checks occur in employee-signin before password authentication.
  Temporary setup tokens/secrets are memory-only, expire from the UI after ten minutes
  on the next action, and are locally logged out on completion/cancel. Closing the tab
  drops local state; it does not promise server revocation on browser close.
- Email returns at the existing approved root redirect are routed to setup based only
  on a presentation hint. Tokens are discarded; the hint never grants access and fresh
  server-validated credentials/MFA are required.
- Legacy main portal rejects employee identities before enrolling/challenging MFA.
  Completed MFA plus failed workspace loading resets the form with the actual access
  error, rather than leaving a dead QR setup.
- Employee-register uses existing Resend credentials and a dedicated responsive
  HTML/plain-text email with prominent verification CTA and clear next steps. A bounded
  Auth lookup independently checks the exact unconfirmed employee before generating a
  signup link. No password/metadata arguments are sent. Generated identity, verification
  type and URL/redirect are checked again; provider idempotency uses a token digest.
  Existing five/hour and lifetime employee registration budgets remain enforced.
- Shared member Auth templates, SMTP, hooks, redirect allowlist and session policies
  are unchanged. No paid service, DNS, database migration, Worker, mobile or push release.

## Verification

- 35 employee registration/sign-in/email unit tests pass.
- Full source-tree portal suite: 43 browser cases passed before the additional
  legacy-employee guard case; that case also passed independently.
- Exact isolated production-runtime artifact: ten signup/MFA/return cases passed,
  plus the legacy-employee guard case. The initial release rehearsal caught the older
  live runtime lacking the staged `employeeMode` variable; the patch now uses its
  existing `config` object. Staged employee-cutover tests are not applied to legacy
  production: that UI is deliberately absent from this release.
- Actual local Auth 2.197.0: registration, custom mail (intercepted locally), resend,
  confirmation, password, TOTP, returning-factor reuse and local logout passed. A
  separate synthetic member refresh survived. Member-address resend sent no mail.
- Desktop/mobile setup and email rendering inspected; no horizontal overflow.
- Actual local registration also recovered from a simulated first-email provider
  failure through the bounded employee-only resend; unknown recipients sent no mail.
- Production read-only secret-name check confirms existing Resend and sender config;
  no secret values were printed. No production MFA reset or synthetic staff created.

## Deployment boundary / rollback

Use `scripts/prepare-employee-onboarding-release.mts`, not the dirty full site build.
It downloads the prior live files, preserves their hashes, creates a new bundle with
only two reviewed auth branches, updates the two entry HTML files, and adds setup assets.
Deploy only this artifact to `doji-admin`, and only `employee-register` to Supabase.
The employee-signin backend, shared Worker and all database contracts stay unchanged.

Previous Pages deployment: `b11f7837` (enrollment-only). To roll back presentation,
restore it. To roll back employee mail, restore the prior employee-register handler
using the built-in bounded resend endpoint. Retain all identities, verified MFA and
pending employee records. Never reset credentials or use global logout as rollback.

## User handoff

The owner should use `/employee-setup/`, sign in with the existing work account and
existing authenticator, and see the explicit access-approval state. Do not re-register
or reset verified MFA. Permission bootstrap, shared authorization integration and the
main portal cutover remain separate release gates. The new production email template
requires a future legitimate unconfirmed enrollment/resend to prove inbox rendering;
local rendering and provider configuration are not a delivered-email receipt.

## Release result

Deployed portal-only Pages artifact `36f9d277` to `doji-admin`; deployed exactly
`employee-register` with the dedicated employee email helper. Every released live
asset matched the tested artifact by SHA-256; nine unrelated existing portal assets
remained byte-for-byte unchanged. Employee authorization/cutover is still off.
Post-deploy non-creating checks passed: malformed same-origin request 400, disallowed
origin 403, and CORS preflight 204. These prove the handler boundary/configuration,
not new production inbox delivery. No actual email was sent during these probes.
