# Business onboarding rollout — October 11, 2026

## Current status

Owner-authorized gated release is deployed to business.dojipro.com. Approved-owner
branding/setup is enabled. Public signup, publishing and billing remain closed.
Existing test identity, application, approval and enrolled MFA factor are retained.
Member Supabase Auth and employee authentication were not migrated or deployed.
Shared infrastructure is not physically isolated; member contract/RLS fingerprints
and unrelated deployment/source checks are the release boundary checks.

The exact test approval email to faheygs+doji-business-test@gmail.com was accepted
and shown **Delivered** in the authenticated Resend dashboard at approximately
03:28 UTC October 12. Provider ID: `01a12e25-cbcc-7501-9768-7095280afdf2`.
Private outbox job: `be89b5ae-cd7a-4915-bae1-bc7fd4801cfc`.
This is provider delivery evidence, not proof the user read it. Automatic capture,
sending and wakeup were disabled afterward; the one-message budget and receipt are
retained. This does not authorize general approval email traffic.

**October 12 acceptance:** the owner completed setup. Read-only hosted verification
before and after the business email release showed the Testing workspace, saved
logo/colors/profile, approved owner access and active authenticator protection.
Campaign publishing remains unavailable. No existing MFA factor was reset or
replaced during these checks. New factors use issuer
`Doji Business` and the approved company name; QR/manual behavior has automated tests.

## Evidence

- Release folder: `test-results/business-onboarding-release-20261011`.
- Protected rollback/config: `.artifacts/business-onboarding-release-20261011`;
  never copy its contents into tickets, logs or this document.
- 25 exact-package browser tests passed, none skipped; 48 mail SQL checks passed.
- 13 dispatcher/hosted-mail tests and tooling typecheck passed after the sender fix.
- Downloaded business runtime and sender sources matched their deployed packages.
- Hosted UI asset hashes matched; unsigned mail and unauthenticated setup/workspace
  reads are rejected. No portal polling or member relay deployment was added.
- Capacity review: Resend Free 5/3,000 monthly and 0/100 daily before this one test,
  overages off; existing Supabase and Cloudflare included capacity sufficient for
  the bounded rollout. No plan or billing changes made.
- `email-reconcile-*` records preserve the one-shot recovery and final receipt.

## Contained release issues

1. Cloudflare project reads redact secret-text values. An initial settings update
   reused a redacted blank proxy key, causing business API 503 responses. Activation
   and email were stopped. The prior Pages deployment was restored, then the known
   hash-verified business proxy key was restored from protected configuration and
   the tested package redeployed. Auth boundaries and asset checks passed afterward.
   Deployment scripts now explicitly hydrate that known secret, not API placeholders.
2. The hosted sender referenced Node-global `Buffer`, unavailable in the hosted
   Deno environment. Its first wake returned 503 before claiming or sending. Sending
   was disabled. An explicit `node:buffer` import and no-global-Buffer regression
   test fixed it. A signed nonexistent-job probe returned 200/idle while gates were
   off. Downloaded source matched. The original exact job was then reconciled:
   queued, no lease/authorization/provider ID, zero budget consumed, completed
   non-timeout 503 wake, and no recipient result in Resend. One explicit signed wake
   sent that same job. No second job, blind retry or counter reset was used.

## Rollback / containment

Disable business setup and mail capture/sending/wakeup first. Preserve outbox receipts,
consumed budgets, branding records and privacy export/erasure support. Do not replay
accepted or uncertain mail. Restore only business runtime/config and the prior
business Pages deployment from protected release evidence; the original Pages ID is
`4803a3ed-269c-414f-96ec-f504050ddfaf`. API-returned blank secret values are NOT usable
rollback credentials. Never roll back member/employee services as part of this task.

The setup privacy export/erasure addon must remain available for saved branding.
Use the documented business-setup-inclusive privacy operator path. Public signup,
campaign publishing, general mail capture and business realtime remain separately
gated; this release does not turn them on.
