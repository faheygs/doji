# Business recovery email — controlled acceptance

The owner approved a controlled business-only acceptance deployment and at most five
verification/reset emails to the separately designated test alias over at most two
hours, including a brief business-login pause and suppressing duplicate WorkOS reset
emails. **Business-owned authentication is now deployed for that alias only until
2026-10-11 18:04:26.959 UTC.** Public signup remains closed. Deployment sent no email
and created no account; user-completed registration and recovery remain pending.
Existing member Supabase authentication and employee authentication are unchanged.
This is not approval for general public enablement.

## October 11 controlled switch — current status

### Registration failure and deployed compatibility repair

The owner confirmed the exact approved alias, but registration returned 503 at
16:06 UTC with no reserved slot, admission ticket or WorkOS test identity. A real
restricted DB connection and the complete Node request composition passed. The
missing `node:buffer` imports in four owned-auth modules reproduced a
`ReferenceError` with the Node global removed. Deno requires the explicit import
in application modules ([official compatibility documentation](https://docs.deno.com/runtime/fundamentals/node/)).

The fix is deployed from `business-owned-candidate-5IQNY1`; all 36 runtime source/
entry/import-map files match the downloaded release. The exact old package is
retained in `test-results/business-buffer-fix-20261011/before`. No secrets, SQL,
provider settings, Pages assets or unrelated function metadata changed. The
release rechecked member/auth function, RLS and role fingerprints. The original
18:04:26.959 UTC cutoff and unconsumed one-account slot remain unchanged.

Regression: 16 focused Node checks, portal/tooling/fixture typechecks and targeted
lint passed. The real network-disabled Edge probe now removes ambient `Buffer`
and passes registration, sign-in, reset/session revocation and signed webhook
checks (`business-edge-runtime-tIt3aI`). Hosted invalid-proof recovery now creates
the expected short-lived admission ticket and stops at proof verification: no
provider creation, password change or email is sent. The actual owner registration
and real email/reset acceptance remain pending; this is not general availability.
Closed diagnostic categories contain no exception content, identities or secrets.
The broader follow-up suite also passed: 97 Node tests including 141 offline
PostgreSQL assertions after replaying 290 migrations. Initial container access was
blocked by the local sandbox; the approved local-container rerun passed unchanged.
The retaining-stop tool now changes only config gates and preserves the currently
installed business runtime; it must not redeploy the older pre-fix package and
break signed reset reconciliation. No stop or gate extension was performed.

### Initial switch evidence

- `scripts/business-acceptance-switch.mts` captured a fresh baseline, rehearsed
  exact-identity/single-slot admission in a rolled-back transaction, then deployed
  an intentional business-only maintenance card before revoking legacy installers.
- Database role impersonation by the deployment login was denied during the first
  rehearsal. No membership was broadened. The corrected rollback rehearsal checks
  exact restricted-role grants, and the real restricted business connection later
  verified both legacy installers and unrestricted admission denied, acceptance
  wrapper allowed. No active business transaction remained; none was killed.
- Initial public verification briefly returned the previous Pages assets. A later
  read-only check confirmed propagation without redeploying. The release tool now
  permits only bounded deploy-time propagation checks (45-second overall deadline).
- Supabase increments every Edge generation on project-secret changes. All sixteen
  other function bundles, timestamps, paths, JWT settings and other metadata remained
  identical; only their version counters advanced once per secret update. Database
  member/employee contracts/policies/roles, other secret digests and admin/public
  Pages releases remain exact. This shared infrastructure is not physically isolated.
- WorkOS business default reset email is now Disabled; verification remains Enabled.
  Reset URL is `https://business.dojipro.com/business-portal/access/?mode=reset`.
  Webhook `we_01M4M2441T2F2Q4PPTN3FRXQ6P` is Enabled, subscribed only to
  `password_reset.succeeded`. Unsigned live POST is rejected with 401.
- Resend Free capacity rechecked: 5/3,000 monthly, 0/100 daily, paid overages off.
  Dedicated domain is Verified, Enforced TLS, no tracking subdomain configured.
  Sending-only domain key is installed only in protected business server config.
- Exact-alias acceptance and one-account enrollment allowance expire at
  **2026-10-11 18:04:26.959 UTC (12:04 p.m. Mountain)**. Public pilot dates/counters
  are unchanged. The five-email owner limit is an operational test cap; the existing
  SQL mail budget is ten/day and must not be misrepresented as a five-email hard cap.
- New test entry shows the first-party MUI create-account form and completed security
  check. Only the approved alias was prefilled. No password or consent was entered by
  the agent, and no account/email was created by the deployment.
- Fresh candidate `business-owned-candidate-AH5Z8a` / Pages
  `business-owned-pages-1eMwaE` passed all 22 Chromium journeys without skips;
  acceptance-route units, tooling typecheck and scoped lint passed.

Evidence: `test-results/business-owned-switch-20261011/` (baseline, rehearsal,
restricted grant check, provider settings, enabled bounds and exact Pages inventories).
The remaining handoff is user password/terms/verification, followed by actual
tracking-free reset delivery, signed success, replay and old-session denial checks.
Do not call this general availability or reopen signup. `node
scripts/business-acceptance-switch.mts stop` closes new acceptance/mail/enrollment
while retaining owned mode, keys, mappings, fences and signed reconciliation. Never
restore legacy installers after owned dispatch. The expiry itself denies new
admission; it does not automatically restore normal business login.

The staging details below are historical.

## October 11 staging status

- Captured protected runtime/Pages backups and downloaded the prior business runtime.
- Rehearsed the additive SQL in a transaction and rolled it back, then installed it
  disabled. Existing function definitions/grants, relation privileges/RLS and policies
  were compared inside the transaction; mail reservations remain empty.
- Deployed the hash-verified runtime from `business-owned-candidate-UbWsa8` and
  downloaded all 36 source files (34 modules, entry and import map) for comparison.
  Current secrets and Pages deployments were unchanged. Session restoration still
  returns 401 without a session; owned bootstrap remains unmounted (404).
- Member/employee contract, policy and role fingerprints remained unchanged, other
  Edge functions and all three Pages deployments were unchanged, and bounded public
  health checks passed. No existing business session was revoked.
- Enabled **Enforced TLS** only for the new Resend sender domain. Created the
  separately approved `Doji business recovery` key with Sending access restricted
  to `mail.dojipro.com`; the existing shared keys and other domain were not changed.
  Its dashboard showed zero uses. Credentials are retained only in access-restricted,
  Git-ignored business release configuration; never in this document or screenshots.
- Prepared `runtime-staged.json` locally with the new mail key, stable independent
  admission/operation keys and existing dedicated webhook secret. Owned mode and
  sending are false; capacity approval is zero and provider attestations remain false.
  Existing configuration is preserved. This staged configuration is not deployed.
- WorkOS default reset email is still enabled; the success webhook remains disabled.
  No maintenance, legacy-grant revocation, acceptance enrollment allowance, frontend
  switch or account mutation has occurred. Qualify the acceptance-only registration
  entry and ordered switch before starting the short window.

Evidence: `test-results/business-recovery-acceptance-20261011/` (baseline, rehearsal,
installation, downloaded runtime qualification and non-secret staged-config digest).

## Contract

The business-owned recovery flow now requires custom delivery; there is no fallback
to WorkOS's default reset email. After existing same-origin/CSRF, action proof and
identity/network admission checks, it performs:

1. Validate explicit delivery settings and an unexpired capacity-review window.
2. Reserve a one-use recovery ticket through `reserve_owned_recovery_email_v1`.
3. Ask the business WorkOS environment to create the reset token, with its default
   reset-email delivery already disabled (a future release prerequisite).
4. Save the validated reset ID, token hash, expiry and encrypted business-account
   binding through the existing reset-link command. Only enrolled active business
   identities can acquire this mapping. Raw token and email are not stored there.
5. Send one plain-text Doji business email through the existing Resend service,
   using a pinned sender and `business-owned-reset/<reset ID>` idempotency key.

The link is `https://business.dojipro.com/business-portal/access/?mode=reset#token=…`.
The credential is encoded in the fragment, never the HTTP URL's query/path. The
browser captures and removes it before React, session reads or the security widget,
holds it in memory for at most five minutes, and submits it once in the protected
reset POST body. Query-token, conflicting, malformed and duplicate links are rejected
and scrubbed. No browser storage, query cache, event, logging or error detail gains
the token. Mail providers and the recipient necessarily receive the email content;
this is not a claim that tokens cannot exist in provider email-content retention.

Responses remain neutral for nonexistent accounts, storage/budget/provider failures
and success. Provider API acceptance is not proof of inbox delivery. No automatic
retry, refund, background queue or polling is added. Unknown outcomes retain their
spent budget. Reset redemption still fences and revokes only the mapped business
sessions before provider mutation; uncertain outcomes require the exact signed
`password_reset.succeeded` evidence to reconcile.

## Capacity and isolation

`business_owned_recovery_email_v1.sql` is a separate additive draft, not in automatic
migrations. The restricted business role can call one new command, but cannot read
or modify its tables directly. Member, employee and service-role callers cannot use
it. The existing business-only lock serializes reservations; it is not held during
provider HTTP calls. Limits are ten reservations per rolling 24 hours and at most
100 retained reservations over 31 days. Cleanup removes at most 32 old rows per call.
This conservatively reserves a small slice of the shared allowance; it does not
reserve capacity against other email consumers or prove those consumers have room.

Both `ownedAuth.recoveryEmail.capacityApprovedUntil` and database mail
`enabled_until` must be in the future and no more than 24 hours ahead. These are
short acceptance-release windows, not a claim of unattended production readiness.
Review a sustainable capacity policy separately before general availability.

Runtime configuration defaults absent/disabled. Required properties are `enabled`,
`workosDefaultEmailDisabled`, `trackingDisabled`, `capacityApprovedUntil`, `apiKey`
and `from`. Use the existing protected Resend key/sender only after qualification;
do not put credentials into the browser, source, test artifacts or logs. Boolean
attestations require real provider checks; tests cannot establish provider settings.

## Remaining live gates

- Signed-in Resend read-only preflight completed: Transactional Free, 5/3,000
  monthly emails, 0/100 daily, paid overages off; initially 1/3 included domain slots
  used (2/3 after the separately approved October 11 sender setup).
  Current capacity covers the bounded acceptance test without a plan change.
  Recheck before sending because other consumers share it.
- The October 10 preflight found only `auth.shipshape90.com`. The inspected
  October 2 Doji operational email uses
  `Doji <onboarding@resend.dev>`, not a verified Doji sender. Resend restricts that
  test domain to the account-owner recipient, so it does not qualify business
  customer delivery or the separate alias. Do not relax the prepared Doji sender
  restriction to bypass this. The owner subsequently approved the dedicated
  sender-domain/DNS setup below, without deployment or sending.
- No tracking subdomain is configured for the new business sender. Configuration
  offers “Enable tracking metrics” through a new-subdomain wizard, which was not
  submitted. Its proposed checkbox defaults and API examples are not persisted
  tracking-setting evidence. Qualify the actual received reset link before release.
- Verify sufficient shared headroom for the bounded test and existing consumers.
  Verify click/open tracking off for this sender, without silently changing shared
  domain settings. Email-security products can also rewrite links; qualify the real
  received link and browser request, not just the API payload.
- Deployment/sending approval is recorded above. Disable default password-reset email
  only in the business WorkOS environment immediately before the controlled switch.
  Default verification delivery can remain WorkOS. No member/employee settings change.
- Mail draft is installed disabled, with preserved business package/config and
  member/employee fingerprints. Next use the existing bounded acceptance gate and
  approved separate test identity. Never use the real owner's existing identity.
- Validate real delivery, intact fragment, expiry, replay and business-only session
  revocation with user-completed new-password entry. Preserve the signed webhook
  route and keys. Public registration stays closed.

## Approved sender setup — October 11

The owner approved creating `mail.dojipro.com` in Resend and adding only its
required Cloudflare DNS records, with tracking disabled. Deployment and sending
were explicitly excluded. Domain ID: `e39a8c58-7bf3-40d4-ae8a-5b6b246d2702`,
region `us-east-1`; this uses the second of three included domain slots.

Added exactly three records, each TTL Auto, with the CNAMEs DNS-only:

| Type | Name under dojipro.com | Value |
| --- | --- | --- |
| TXT | `resend._domainkey.mail` | Exact public DKIM key supplied by this Resend domain |
| CNAME | `rsend.mail` | `rsend.forge.rmta.net` |
| CNAME | `send.mail` | `send.forge.rmta.net` |

The original twelve zone records were compared after saving and remain unchanged,
including apex MX/SPF/DMARC, Cloudflare DKIM and all website aliases. All three new
records resolve through public resolver `1.1.1.1` (TTL 300). Resend recorded
“DNS verified” at 09:03 and “Domain verified” at 09:04 dashboard time. The signed-in
follow-up shows overall status Verified and “Your domain is ready to send emails.”
This clears domain authentication, not proof of inbox delivery.

No tracking subdomain was created. Receiving remains off; the new domain's sending
capability is selected, but no application key/from setting or sending gate changed.
TLS initially used the provider's Opportunistic default; the subsequently approved
acceptance preparation changed only this new domain to Enforced TLS.
No WorkOS setting, deployment, billing option or mail dispatch changed in this step.
Before recovery-mail acceptance, independently qualify tracking-free delivery.
Rollback of this setup, if authorized, is limited
to these three added DNS records and this new sender domain; never remove existing
mail or website records. Do not remove the sender while issued recovery mail depends
on it.

## Rollback

Stop new recovery by disabling its runtime mail flag and clearing database mail
`enabled_until`; replace/drain business instances rather than assuming a captured
configuration refreshes. An already dispatched email cannot be recalled. Apply the
mail rollback to revoke its one command while retaining all spent reservations.
Keep existing reset-link mappings, keys, fences and signed-success reconciliation
until issued links and uncertain resets have been accounted for. Do not automatically
restore WorkOS default reset email, legacy session installers or removed sessions.
No rollback here changes member/employee authentication or other Resend consumers.

## Evidence

- October 11 read-only follow-up: sender Verified; all 58 component-package and 45
  disabled Pages-package hashes match their saved manifests. The 22 focused
  recovery-email/reset/storage tests pass again, with injected transports and no
  external provider call. No code, production runtime or sending gate changed.

- 77 focused Node checks: neutral outcomes, persistence-before-send, explicit gates,
  malformed/expired data, safe errors, idempotency and no automatic retry; existing
  reset replay, session revocation, account isolation and signed reconciliation.
- 141 assertions in fresh network-disabled PostgreSQL after 290 migrations,
  including real concurrent mail-cap/replay checks and retaining rollback.
  Member reads, employee identity resolution and existing contract fingerprints pass.
- Four browser token-capture unit checks; 20 exact-package Chromium journeys pass
  with no skips, including asserting request URLs/referrers contain no reset token.
- Local real Edge runtime passes with synthetic database/provider transports and
  external network disabled: `test-results/business-edge-runtime-b8s178`.
- Component package `test-results/business-owned-candidate-UbWsa8`: 58 verified files,
  34 runtime modules, 199,511 gzip JavaScript bytes. Assembled disabled Pages package:
  `test-results/business-owned-pages-Fm0voH/site` (45 verified files).
- All 266 web regression tests, portal/tooling/web typechecks, scoped lint and
  `git diff --check` passed. None of these tests sent mail
  or changed a hosted setting. Actual provider acceptance remains unqualified.

## Provider references

- [WorkOS custom emails](https://workos.com/docs/authkit/custom-emails): default
  delivery must be disabled before using custom reset delivery.
- [WorkOS password reset](https://workos.com/docs/reference/authkit/password-reset):
  token creation and confirmation contracts.
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys):
  optional send-key deduplication lasts 24 hours; our server never automatically retries.
- [Resend send API](https://resend.com/docs/api-reference/emails/send-email) and
  [domain tracking](https://resend.com/changelog/update-click-open-tracking-via-api):
  tracking settings require separate verification before release.
