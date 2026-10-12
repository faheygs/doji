# Business onboarding preparation — October 11, 2026

Status: GATED ROLLOUT IN PROGRESS. Owner explicitly approved private database changes,
business runtime/UI, hosted sender hookup and ONE test email to
faheygs+doji-business-test@gmail.com after capacity/no-added-cost verification.
Public signup, billing and publishing stay closed. Existing approved test business
and its authenticator are retained. This document is evidence, not independent authority.

The setup/privacy/outbox/dispatch SQL and dedicated sender login/wakeup are now
installed, with approved-owner setup enabled. Production transaction rehearsals and post-install member
contract checks passed. Exact-package browser suite: 25 passed, none skipped.
Hosted runtime/UI are deployed and the one test email is provider-confirmed Delivered.
Automatic capture/sending/wakeup are disabled again; signed-in acceptance awaits the
owner's login. Current status and incidents: `BUSINESS_ONBOARDING_ROLLOUT_2026-10-11.md`.
Release artifacts: `test-results/business-onboarding-release-20261011`; protected
rollback configuration: `.artifacts/business-onboarding-release-20261011`.

## Hosted sender and capacity qualification

`business_email_hosted_v1` wakes a dedicated `business-application-mail` function
once per new private outbox job, using pg_net's after-commit asynchronous request.
The body carries job ID, nonce, expiry and HMAC—not a reusable provider or database
credential. The endpoint rejects malformed/unsigned/expired/browser-origin requests
before SQL, claims only the signed job, and uses a dedicated NOINHERIT login with
two connections and three fixed commands. No cron, shared relay, member trigger or
periodic query is added. Wake failure and ambiguous provider outcomes require
explicit operator reconciliation; do not promise guaranteed inbox delivery.

The acceptance runtime permits only the approved test alias. Capture stays off;
the single approval receipt will be backfilled deliberately without reopening or
reapproving the application. Mail budget is one, never reset to repeat a test.
New hosted SQL tests bring mail checks to 48; 13 dispatcher/HTTP tests pass.

Authenticated dashboards at this rollout showed Resend Free 5/3,000 monthly,
0/100 daily, overages off, verified mail.dojipro.com and enforced TLS; Supabase
771,948/2,000,000 function invocations, 1.09/250 GB egress, 24% disk, 12/60
connections; Cloudflare $0 billable usage this period. No plan upgrade or new
storage service is needed for this bounded test. These are point-in-time readings,
not reserved capacity or approval for unrestricted email/public signup.
The new complete frontend chunk set is 227,640 bytes gzip excluding the existing
lazy password dictionary; onboarding packaging uses a 256 KiB aggregate bound.
Reference: [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).

## Intended journey

Application submission → staff approval → emailed Finish setup navigation link →
approved business brand profile → authenticator QR/manual fallback → signed-in
workspace. Unapproved applicants stay in the application flow. Subsequent sign-in
must resume the authoritative application/setup/session state, never a browser flag.

The default-off candidate uses an exact fixed-SQL private atomic command for brand
save/completion and authorized reads for setup/workspace. Identity, approval,
organization membership, revision and MFA are rechecked by PostgreSQL. Receipts
bind actor, request ID and fingerprint; an uncertain client response retains the
same request for deliberate retry. Reopening approval denies workspace access.

Logo, website, short description and two brand colors are future campaign defaults;
there is no campaign writer or retroactive published-Doji change. Billing and
publishing are false. Logo preparation locally rasterizes PNG/JPG/WebP, dropping
original metadata; the candidate stores a bounded private inline PNG (24 KiB max)
with the brand profile. No external image fetch or public storage bucket is added.
This persistence choice still requires the capacity and privacy checks below.

## Authenticator naming and QR

New enrollment sends `totp_issuer: Doji Business` and `totp_user` from the approved
business brand name. Desired label: `Doji Business: <company name>`; authenticator
apps control their own display layout. Control characters/missing names are denied,
whitespace is normalized and company colons become dashes to avoid URI delimiter
ambiguity. The browser cannot override the label. Existing factors are challenged
as-is and are never reset to apply a new name. A manually entered secret cannot
automatically fill an authenticator's label; QR enrollment carries both fields.

Provider-generated bounded inline PNG is shown in the MUI enrollment flow. Manual
key remains available; secrets/QR are not saved into durable session state. Verify
requires exact subject/session/factor/challenge bindings, one-use challenge and
provider-confirmed factor ownership. Reference:
[WorkOS enrollment contract](https://workos.com/docs/reference/authkit/mfa).

## Qualification so far

- Latest local run: 110 business runtime/HTTP/proxy/MFA/message tests and 37
  business UI tests pass. Portal-runtime, tooling and web TypeScript checks pass;
  `git diff --check` passes. No live/hosted test or deployment was run for this candidate.
- Offline network-disabled PostgreSQL clean-room tests passed 30 assertions,
  including gate/approval/MFA/ownership, malformed branding, idempotency/conflicts,
  disable/revoke, preserving records on rollback and unchanged public/Auth function,
  grant, policy and member-row fingerprints.
- Synthetic React flow tests cover saved branding → QR/manual fallback → verified
  dashboard, ambiguous-save exact retry, current-session MFA, failed initial and
  reconciliation reads, and session cache clearing. These are not hosted acceptance.
- MFA/runtime tests cover authorized company labels in both legacy and setup routes,
  rejecting unapproved/browser-overridden names and preserving existing factors.
- Approval-message preparation contains a plain authenticated navigation link,
  no password or bearer token. Sending is not integrated/enabled by this work.

## Required before release

Completed locally in the wrap-up pass:

- Final rerun: 23 browser tests passed, two immutable-package-only checks skipped
  pending release packaging; all 37 business UI tests passed. Web TypeScript,
  focused React lint, tooling TypeScript and diff whitespace checks passed.
- `business_setup_privacy_v1.sql` adds an operator-only brand export and cleanup in
  the existing authorized erasure transaction. Holds/provider evidence still block
  erasure. The operator supports `--include-business-setup`; this option must be
  used for business identity exports once branding is enabled. Retain the cleanup
  hook when rolling back setup. New API roles receive no privacy grants.
- Setup/private privacy checks and four real overlapping-connection races pass:
  same-key replay, revision collision, concurrent disable and approval reopening.
  The clean-room suite reports 45 passing checks including retaining rollback and
  unchanged public/Auth functions, grants, policies and member rows.
- The mail outbox/dispatch database suite reports 38 passing checks. The dispatch
  primitive reads the verified WorkOS recipient, rechecks current application
  revision/state and capacity, then spends one-use authorization before Resend.
  Stale approvals are cancelled; uncertainty/receipt loss never resends. Acceptance
  means provider acceptance, not inbox delivery. Seven synthetic dispatcher tests
  and ten privacy-operator tests pass. No real provider call occurred.
- Browser coverage now includes brand → QR/manual MFA → dashboard, accessibility,
  desktop overflow and unsaved navigation/sign-out safeguards. Screenshot review
  caught narrow color inputs; they were widened. Upload uses a keyboard-operable
  MUI button, not an invalid button-role label. Existing business auth browser
  regressions pass; immutable-package-only tests require the release package.
- The production business build succeeds. Its pre-existing lazy password-strength
  dictionary still produces a large-chunk warning; it is not loaded in onboarding.

Remaining release work (not represented as completed or authorized):

1. Connect the one-job dispatch primitive to the separately reviewed hosted runner
   and dedicated restricted SQL login/secret configuration. No scheduler or relay
   hook is added in this candidate. Do not enable capture/sending until that path
   is qualified. Recheck included email/hosting/database capacity first.
2. Test the exact immutable package and deployed proxy/runtime/SQL combination,
   current-account resume, one approved exact-recipient email and rollout rollback.
   The existing test account/factor must not be deleted or reset. A changes-request
   or revoke after provider send may still leave a delivered email, but its plain
   link cannot bypass current approval, ownership or MFA.
3. Review bounded production cost/performance: one private logo is at most 24 KiB,
   no original files/remote images, and saves share the existing 30-command/hour
   account budget. This bounds payloads but is not a production capacity guarantee.
   If enabling business realtime, qualify hints/reconnect end to end separately.
4. Review shared-system impact and rollback with the owner; retain approval gates
   for DB, runtime and Pages activation. Snapshot current packages/config before any
   approved release; stop on failed checks. Member auth, sessions, challenge window,
   alarms, push and economy must remain unchanged and pass regression checks.

## Deployment boundaries and retaining rollback

`docs/drafts/business_setup_v1.sql` is not in automatic migrations. SQL, runtime
`setupEnabled`, Pages `BUSINESS_SETUP_ENABLED` and frontend `setupEnabled` all stay
off until separately qualified and approved. Deploy the privacy addon together
with setup before enabling writes; the email dispatch addon requires the base
email outbox candidate. Shared infrastructure is not physically
isolated; new persistence/reads can consume resources even though contracts are
business-only. No member feature or release-policy deployment is bundled here.

Rollback freezes new setup with `business_setup_v1.rollback.sql`, revokes its
execute grant and restores prior business runtime/Pages packages/config. Keep
profiles, receipts, identifiers and existing authenticator factors. Never delete
the test business or reset MFA as rollback. Stop/drain the sender, apply its dispatch
rollback and the base outbox rollback to revoke access and retain evidence. Keep
the private branding erasure trigger installed. Do not enable an approval-mail sender
as part of restoring the previous portal.
