# Cloudflare administrator alerts — September 28, 2026

**Current: enabled September 29; real synthetic intake alert delivered.** See
`SAFETY_LAUNCH_2026-09-29.md` and the current-production section at the end. Earlier
disabled-state entries below describe historical checkpoints, not current status.

## Status

Owner approved using Cloudflare for **new external-takedown alerts only**. The local
integration and tests are updated. One explicitly labelled test email was sent from
`safety@dojipro.com` to the already-verified `faheygs@gmail.com`; Cloudflare returned
HTTP 200 and the recipient in `delivered` at **2026-09-29 04:22:01 UTC**. Actual message
ID: `<iNeyGQe5Xwp1JbtwFVR7AQ3dfJmJQw22PsYs@dojipro.com>`.
Evidence: `test-results/cloudflare-safety-email/canary-result.json`.
This is recipient-server acceptance, not independently verified inbox placement.

**Email function deployed, DISABLED (September 29, 13:54 UTC).** The owner saved
the three dedicated email settings and approved the isolated runtime verification.
The saved account-owned token passed a verified-destination read and one labelled
canary from the hosted Supabase runtime. Cloudflare reported `delivered` at
**2026-09-29 13:53:51 UTC**, message ID
`<72dtsLHQvXScFu2aIogupTksmfE2m7C1tlNJ@dojipro.com>`.
This is recipient-server acceptance, not independently verified inbox placement.
No intake case, real moderation action, database migration, scheduler, Worker
deployment, DNS or billing setting was changed.
The public intake remains disabled for its separately documented media-safety gates.
Existing login, member, report and operational Resend email paths are unchanged.

## Account and no-new-cost checks

- Account `04eab92db3126696f42644ede0943a09`; existing `dojipro.com` routing Enabled,
  DNS Locked. Administrator destination already Verified (dashboard and read-only API).
- Email Sending dashboard shows no onboarded sending domains and $0.00 billable usage
  for September 16–October 16. We did **not** onboard arbitrary outbound sending.
- Current Cloudflare docs explicitly make verified-destination sends free on all plans,
  including routing-only accounts, excluded from monthly quota and daily limits.
- Direct HTTPS from the dedicated Supabase Edge function needs no new Cloudflare Worker.
  Supabase execution remains subject to existing included allowance/overage restrictions
  verified separately. Do not claim unlimited zero-cost capacity.
- The canary used existing local Wrangler OAuth once; it is never embedded, logged or
  deployed. `--send-once` writes an attempt marker before network and refuses automatic
  replay, including after an ambiguous outcome. No test resend is needed.

## Prepared contract

- Fixed sender and recipient; no client-defined recipients, CC/BCC, attachments or URLs.
- Read-only verified-destination API check before claims; failed verification makes no
  database claim or send. Recipient removal must block sending, not use a paid fallback.
- Dedicated secrets: `SAFETY_CLOUDFLARE_ACCOUNT_ID` and
  `SAFETY_CLOUDFLARE_EMAIL_TOKEN`. Use an account-owned token with Email Sending Edit
  and Email Routing Addresses Read, scoped only to this account; no DNS, Workers,
  billing, general account administration or member credentials. Verify actual token
  permission labels in the dashboard before creation. Do not deploy broad OAuth.
- SQL acknowledgment accepts Cloudflare's actual bounded Message-ID and persists the
  validated recipient outcome. Queued != delivered != inbox/read. Bounce/suppression
  and permanent 4xx fail to operator attention; 408/429/5xx/transport uncertainty remain
  bounded retry work. No raw provider error strings or sensitive request content in logs.
- Lease/fencing protects simultaneous claims, not exactly-once delivery. No documented
  Cloudflare idempotency key exists. Ambiguous sends/ack failures can duplicate an email.
  The stable case reference and `X-Doji-Alert-Reference` correlate duplicates only.
  Existing 24-attempt/23-hour limit now means an operational ceiling, not a Resend window.
- Provider-reported delivery is accepted only for the exact fixed recipient. Malformed,
  missing, unexpected-recipient or conflicting responses never record success.

## Verified tests

- `node scripts/test-safety-removal-edge.mts`: passed with mocked network. Includes
  auth/disabled behavior, no-send unverified destination, content minimization, fixed
  recipient, identical retry content, delivered/queued/bounce/suppression, malformed
  responses, 408/429/5xx, permanent 4xx, transport uncertainty and failed DB acknowledgment.
- Focused TypeScript no-emit check of both mail modules: passed.
- `node scripts/test-safety-removal-local.mts`: isolated synthetic Postgres passed;
  transaction rolled back. Cloudflare Message-ID/queued status, stale lease protection,
  bounds, permissions, member report compatibility and rollback remain covered.
- `node scripts/test-safety-removal-concurrency.mts`: passed eight duplicate receipts,
  competing staff commands and four concurrent claimers; temporary offline clone removed.

## Remaining production steps

Owner replied **Approved** on September 29. The account-owned `doji-safety-alerts`
credential is now created and its Active status independently verified in Cloudflare's
token list. Token identifier (not credential): `ade49487d36c616e8277064971ab2cbf`.
Its only permissions are `Email Routing Addresses Read` and `Email Sending Write`,
scoped to account 04eab92db3126696f42644ede0943a09. It expires December 28, 2026.
Evidence: `test-results/cloudflare-safety-email/token-created.png` and prior
`token-review.png`. No credential value was printed, stored in the repository or
entered into Supabase by the agent.

The owner completed secure entry and replied **done**. Supabase's saved-secret table
shows all three settings updated at **2026-09-29 13:41:31 UTC**. The visible SHA-256
digests for `SAFETY_CLOUDFLARE_ACCOUNT_ID` and `SAFETY_REMOVAL_ALERTS_ENABLED` match
the intended account ID and literal `false`, respectively. The token has a saved digest;
its value was not revealed or retrieved. This confirms storage, not successful runtime
authentication with that token. The earlier canary used Wrangler OAuth and does not
qualify the new credential. No additional test email was sent.
Evidence of the prepared entry: `test-results/cloudflare-safety-email/secret-entry-ready.png`.
Dedicated-credential runtime validation is now complete as recorded below. Never
deploy a public credential-testing endpoint or enable alerts merely to test the secret.
Establish operator rotation coverage before activation so December 28 expiration
cannot silently stop alerts.

1. Dedicated least-privilege credential storage, verification-read and sending permissions
   are verified in the hosted runtime. No further credential entry or repeat canary needed.
2. The exact email Edge function is deployed disabled. Intake/alert SQL, wakeup and other
   release components remain undeployed; use the approved launch process and do not
   bundle unrelated dirty files.
3. Qualify real receipt-to-alert and queued-to-delivery/bounce handling, durable recovery,
   responsible operator coverage and all broader intake/media gates before activation.
4. Preserve rollback: disable only `SAFETY_REMOVAL_ALERTS_ENABLED` and the intake delivery
   config, unschedule only its captured recovery-job ID; retain cases/alert ledger and
   manually cover due work. Do not migrate other email paths or remove verified routing.

## Isolated runtime release — September 29, 2026

- Script: `scripts/release-safety-email-disabled.mts`; exact artifact and evidence:
  `test-results/safety-email-disabled-release-20260929/`.
- New function only: `safety-removal-alerts`, ID
  `de95e4d9-22bc-4054-9c30-96abe6363202`, final version **2**, bundle SHA-256
  `847480711695ffd44eca5c20d654f4a4f8f9e541c0bf405274db62f97aa7bbc8`.
- Temporary verifier accepted only an existing service key, expired after 15 minutes,
  required the disabled flag, rejected caller content, and used the exact mail adapter
  with a clearly labelled test subject. No database access or case creation. Anonymous
  and publishable-key requests returned 401. One send intent was saved before sending;
  no automatic retry or replay. The Cloudflare token remained only in Supabase runtime.
- The temporary verifier was replaced at 13:53:53 UTC, including its dependencies.
  Final downloaded source matches the reviewed production entry and four dependencies.
  Both ordinary and former verification paths return 503 `Dispatcher disabled`.
- All **11** existing Edge function definitions/versions remain unchanged. Every secret
  digest and all custom-secret metadata are unchanged. Supabase refreshed only its
  platform-owned secret timestamps during deployment; the comparison accounts solely
  for those known generated timestamps. CLI-generated linkage metadata is excluded
  from source inventory, not from a deployed runtime dependency.
- Bounded read-only production member canaries passed: own profile, realtime capability,
  feed (one row), comments (one row), notification snapshot, employee session and queue;
  member/employee cross-boundary denials remained intact. No member session was changed.
- `test-safety-email-runtime-probe.mts` passed authentication, expiry, empty-input,
  disabled-only, fixed-recipient, no-send failure and error privacy checks. Existing
  intake/alert mocked-network regressions and focused TypeScript checks passed.
- Rollback/hold state is the currently deployed disabled entry point; no SQL or scheduler
  was installed. Do not redeploy the temporary probe or resend the canary. Retain records.

This qualifies the dedicated **credential → hosted sender → recipient mail server**
path only. It does not qualify public receipt → durable alert → staff disposition,
queued-message eventual outcomes, media revocation/appeals or full public launch.

## Primary documentation checked

- https://developers.cloudflare.com/email-service/platform/pricing/
- https://developers.cloudflare.com/email-service/platform/limits/
- https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/
- https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
- https://developers.cloudflare.com/api/resources/email_sending/methods/send/
- https://developers.cloudflare.com/email-service/reference/headers/
- https://developers.cloudflare.com/email-service/concepts/email-lifecycle/
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/deploy

The API schema includes `message_id` even though the shorter guide's sample omits it;
the live canary confirmed it. Message-ID is provider-controlled; do not override it or
claim the custom correlation header provides deduplication.
# Current production status — September 29, 2026

The existing verified sender is enabled and connected to durable receipt alerts.
The synthetic public-form request `218161a8-a68a-4542-a471-7d2662cbe7c4` produced a
provider-reported delivered alert on attempt one. Recovery job 12 checks due work
every five minutes. Queued-to-later-delivery/bounce reconciliation remains manual;
operator queue coverage is required, not reliance on email alone. See
`SAFETY_LAUNCH_2026-09-29.md` for current operational limits and rollback. Historical
disabled-state notes below are retained for provenance, not current status.
