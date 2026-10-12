# Existing business test account access

Owner approved persistent access for the already-created exact test account,
without deleting its application or opening public registration.

## Contract

Default-off private `existing_account_access` permits exact scope/identity-HMAC
sign-in, verification, MFA and recovery/reset admission after the creation cutoff.
A spent creation reservation is required and cannot be cleared while enabled.
Registration retains its original window and single-use reservation. Public signup,
enrollment, email capacity and all counters stay unchanged. Credential, proof, CSRF,
rate limits, reset fences, account state and session lifetimes still apply.

Frontend `acceptanceExistingAccount` permits the normal sign-in entry and hides
registration; it grants no server authorization. No Edge runtime/secrets, member or
employee auth/functions/RLS, realtime, push, or challenge timing changes are included.
Recovery email capacity remains separately expired; this release does not enable
recovery delivery or receipt/decision mail.

## Checks and release

173 offline PostgreSQL assertions passed, including after-expiry sign-in, rejection
of other identities, registration denial, restricted permissions, rate limits,
five-minute admission tickets, reset fences, concurrency, member/employee reads and
retaining rollback. Four presentation unit tests and web/tooling typechecks passed.

`scripts/release-business-existing-test-access.mts` captures production baselines,
verifies the existing verified provider identity, stops during a protected Doji
window or backlog, and checks member contracts, roles/RLS, Edge, secrets and unrelated
Pages for drift. SQL activation preserves all original policy fields and counters.
A live rolled-back role test must allow exact-account sign-in and deny other
identities and registration before frontend deployment.
Evidence: `test-results/business-existing-test-access-20261011/`.

Release completed: live restricted-role rollback check returned sign-in allowed,
other identity denied, registration denied. All 23 exact-package browser tests pass
after fixing outdated legacy-gate fixtures and ambiguous password selectors.
Hosted frontend/config match the package. Member function/role/RLS fingerprints,
Edge sources/settings/versions, secret digests and unrelated Pages are unchanged.
Existing policy, enrollment and mail fields match the captured baseline; only the
new persistent-access field is enabled. No provider account, password or email
mutation was performed by the deployment. User return sign-in subsequently passed:
the live browser reached the saved changes-requested application after the old
cutoff, preserving details, applicant feedback and activity history.

## Retaining rollback

Use `docs/drafts/business_owned_existing_test_access_v1.rollback.sql` to disable
persistent admission. Restore business Pages
`0b207767-a256-4b39-9a36-fb4ac2bfbcbb` from the preserved previous package if needed.
Keep the account, application, reservation, audit, email budgets and reset fences.
Existing sessions retain normal lifetimes. Never restore legacy installers or
refund signup reservations as rollback.

## Live acceptance so far

Signup, email verification, draft, initial submission and persistence passed.
Assignment and requested-changes feedback passed; applicant UI withheld the internal
staff note. Return sign-in passed and revised purpose was saved at 1:32 p.m. Mountain.
Resubmission passed at 4:09:38 p.m. Mountain on October 11, 2026: both portals showed
submission 2, revision 5, with the saved revised purpose. The previous change-request
note still appeared prominently above the received receipt; retain it in activity
history but review that current-status presentation separately.

After explicit owner confirmation, approval passed at 4:13:07 p.m. Mountain,
revision 6. The business page reconciled to approved without a manual refresh and
displayed only the applicant response, not the internal staff note. Billing and
campaign publishing remain disabled. Open business workspace reached authenticator
enrollment; credential setup and submission were handed to the user. The user then
completed manual authenticator enrollment and the authorized workspace summary
showed `Testing · owner`. This confirms the existing summary, not the new branding
dashboard candidate. Actual password recovery remains unverified. No recovery or
receipt/decision email delivery was enabled by these checks.
