# Business-owned authentication: acceptance and cutover

## Current release decision

**October 11, 16:06 UTC: controlled acceptance is now deployed, not public go-live.**
The exact approved alias has one account slot until **18:04:26.959 UTC**. The owned
test entry is `/business-portal/access/?mode=acceptance`; public entry points remain
paused and public registration dates/counters are untouched. Runtime, Pages and
database gates agree. Legacy/unrestricted business installers are revoked and the
actual restricted login passed grant-denial checks. The dedicated webhook is enabled,
the business reset URL is configured and duplicate WorkOS reset email is disabled.
No email/account was created by deployment; user password entry and real acceptance
are the current handoff. See `BUSINESS_RECOVERY_EMAIL_2026-10-10.md` for current
evidence and retaining-stop instructions. Older disabled-stage statements below
are historical, not the current runtime state.

October 11 update: the owner approved bounded business-only acceptance (at most five
verification/reset emails to the separate test alias in two hours). The additive
recovery-mail SQL and 36-file runtime are now installed **disabled**, with member/
employee fingerprints, existing secrets, other functions and Pages unchanged.
The dedicated sender is verified with Enforced TLS and a domain-restricted sending
key is staged in protected configuration. No email, account mutation, login pause or
acceptance window has started. Public registration remains closed. See the current
status and evidence in `BUSINESS_RECOVERY_EMAIL_2026-10-10.md`; older local-only
statements below describe prior stages, not the current installation state.

**Database groundwork and business runtime deployed with owned mode disabled;
NOT cleared for production enablement.** This is a
business-only replacement for hosted WorkOS account screens. WorkOS remains the
independent business identity provider. Member Supabase Auth and employee access
are unchanged. Shared infrastructure is still shared; this is not zero-risk isolation.

The owner subsequently approved a controlled business-auth acceptance deployment,
a brief business-login pause, and verification/reset testing with a separately
designated test alias. The existing owner identity is explicitly excluded. This
does not authorize reopening public registration or skipping the gates below.
October 10: the four additive database drafts are installed with both new gates
disabled and no target/scope configured. Existing business login grants, public
registration policy, member/employee contract fingerprints, deployments and secret
digests were verified unchanged. No account, provider URL, webhook or email has
changed. Evidence: `test-results/business-owned-release-2995nX/`.
The business Edge runtime code was then deployed without changing any custom
secret or gate. All 33 imported runtime modules, the entry point and import map
were downloaded and hash-verified. Direct authorized-proxy/no-session checks
returned 401 for existing session restoration and 404 for disabled owned bootstrap.
Other Edge functions and all Pages deployments were unchanged. Supabase refreshed
timestamps on its managed secrets during deployment; every value digest and all
custom-secret metadata remained exact. Runtime evidence is `runtime-verified-*`
in that same release directory. Public frontend/provider cutover has not happened.
This document supersedes earlier “unmounted candidate” status in the preparation
notes: the runtime, proxy, restricted SQL and browser now compose locally, default off.

## Locally completed

**Latest follow-up:** the owner approved local preparation/testing of custom business
recovery mail, with deployment/sending still gated. See
`BUSINESS_RECOVERY_EMAIL_2026-10-10.md`. This supersedes the earlier query-token
ingestion/default WorkOS reset-mail plan. The new local flow requires verified
default-mail suppression, tracking/capacity checks, a durable mail reservation and
saved account binding before sending a fragment-only link through Resend. Its new
SQL draft is not installed live. Resend capacity is now verified for a bounded
test (Free, 5/3,000 monthly and 0/100 daily, overages off). On October 11 the owner
separately approved creation of `mail.dojipro.com` and its three required DNS
records. Those records are saved and publicly resolve; all twelve prior zone
records remain unchanged. The October 11 follow-up confirms Resend status Verified
(domain verification event at 09:04 dashboard time). No tracking subdomain was
configured. The existing operational
sender remains the restricted `onboarding@resend.dev` test address; no runtime
sender, WorkOS setting, deployment or email sending changed. Tracking-free real
delivery and hosted authentication acceptance remain release gates. The saved
58-file component and 45-file disabled Pages artifacts pass fresh hash verification;
22 focused offline recovery/reset/storage tests pass again.
Fresh component package: `business-owned-candidate-UbWsa8`; fresh disabled Pages
package: `business-owned-pages-Fm0voH`, all 20 Chromium journeys passed, no skips.
Older package identifiers below remain historical evidence, not the current candidate.

- Browser -> Pages proxy -> authenticated ingress -> business runtime -> restricted
  SQL/provider adapters, tested with synthetic provider/database I/O.
- Existing business session restoration, authorized application/workspace reads,
  logout and authenticator step-up retained; no member/employee auth migration.
- Per-action Turnstile checks, original admission tickets through email/TOTP,
  existing bounded registration reservation, guarded session installation.
- Reset token scrubbing, memory-only single use, durable mapping, pre-dispatch
  account fence, pending outcome and exact signed-success reconciliation.
- SQL bridge permits existing reads/leases/flow state, never raw session creation.
  Separate cutover revokes the old business role's two unfenced entry points.
  Both role-level bypass denial and guarded installation after revocation are tested.
- Fixed-category existing-runtime diagnostics for uncertain recovery, metadata
  persistence failure, pending reset and reconciliation commit failure. No exception
  details, emails, IPs, IDs, tokens, passwords, URLs or bodies; no new collector.
- Retaining stop/rollback, source closure and offline package assembly. Neither
  the draft SQL nor component package is an automatically deployable migration.
- Explicit business maintenance state: the standard centered MUI account card
  starts no account reads, forms or security widget. The early reset-link scrubber
  discards tokens while paused. Both proxy and ingress reject new business work
  but retain the signed recovery endpoint in owned mode. No automatic refresh.

## Independent gates

### Read-only preflight, October 10

- The owner signed into the business WorkOS production environment. Email/password
  authentication, email verification delivery and password-reset delivery are enabled;
  the default WorkOS email provider is enabled. Magic Auth sign-in is disabled.
- Billing shows pay-as-you-go. WorkOS publishes an included AuthKit allowance and
  per-recipient sending limits; the dashboard did not expose a numeric remaining
  email quota. Do not describe shared-provider delivery capacity as guaranteed.
  References: [pricing](https://workos.com/pricing),
  [sending limits](https://workos.com/docs/reference/rate-limits).
- The business application has only the existing business callback redirect; its
  password-reset URL is unset. No webhook endpoints are configured in this realm.
  The registration Action is enabled and denies registration on an endpoint error.
  These are observations, not completed cutover steps; no settings were edited.
- The owner explicitly approved the exact business reset URL and dedicated
  success-event webhook. The webhook was created at
  `https://business.dojipro.com/auth/owned/reset-events`, listening only for
  `password_reset.succeeded`, then disabled for staging. Its ID is
  `we_01M4M2441T2F2Q4PPTN3FRXQ6P`; the dedicated signing secret is retained only in
  the access-restricted, Git-ignored release folder. No test event or email was
  sent. The reset URL is deliberately still unset: switch it alongside the ready
  owned reset page, not ahead of that page. Enable the webhook only after its
  signed receiver is enabled. The Pages backup exposes
  no observability, tail-consumer or Logpush configuration; absence of those fields
  alone does not establish first-hop reset-query redaction. That privacy check is
  still required before sending real reset links.
- Subsequent signed-in Cloudflare inspection found **no account Logpush jobs**;
  zone Logpush shows the subscription screen, not an active export. The zone HTTP
  log view exposes path but no matching query field. The reset page is a static
  asset outside `_routes.json` (`/auth/*`, `/api/*` only). A brief header-filtered
  tail and one invalid synthetic reset-link GET returned HTTP 200 and no matching
  Function event; the stream was stopped. This is not proof of query redaction.
  Cloudflare's [firewall-event API example](https://developers.cloudflare.com/analytics/graphql-api/getting-started/execute-graphql-query/)
  explicitly includes `clientRequestQuery`, while [WorkOS default reset links](https://workos.com/docs/authkit/custom-emails)
  carry the credential in `?token=`. Security-event retention remains unqualified.
  No real reset token/email was generated. Do not disable WAF/security monitoring
  or silently switch mail providers to clear this gate; a business-only custom
  recovery delivery scope requires explicit approval and shared email quota review.
- The originally suggested email already belongs to an active, verified business
  identity. The owner selected a separate test alias. Never reset, remove or reuse
  that existing identity as a disposable test record. Keep the alias in private
  release configuration, not committed test fixtures.
- The 21:54:50 UTC database preflight was inside the protected Doji window, with
  zero overdue outbox entries in the bounded sample. Its next event was
  22:13:41.527 UTC; the guard cannot clear before 22:28:41.527 UTC. Freshly recheck
  before any deployment; elapsed time alone is not release authorization.
- The fresh 22:47 UTC check cleared the event window; delivery backlog was zero.
  The subsequent guarded live SQL rehearsal passed and rolled back. The first
  rehearsal stopped on a fingerprint that included the CLI's rotating login expiry;
  two read-only comparisons isolated that timestamp. Only `cli_login_postgres`'s
  `rolvaliduntil` is excluded now; every application role and grant remains checked.
- Exact-alias acceptance admission is now prepared and installed **disabled**.
  `ownedAuth.acceptanceOnly=true` requires public `signupEnabled=false`; every new
  sign-in, verification, recovery and reset admission uses the one configured
  identity HMAC and a database-enforced maximum two-hour window. A separate atomic
  one-slot reservation cannot be refunded or reused after uncertain creation.
  During acceptance, revoke the normal `admit_owned_auth_v1` role grant so a runtime
  mode mismatch fails closed; the wrapper calls it as definer and retains its budgets.
  Signed reset reconciliation remains available after acceptance expires.
  The old public pilot counters/dates are untouched. Existing verified enrollment
  still needs a separately bounded one-account allowance; never forge a principal.

### Exact-package qualification

`scripts/prepare-business-owned-pages.mts` assembles a disabled Pages candidate
from hash-verified component and rollback packages. It preserves legal pages,
headers, redirects, route scope and the expired public-registration cutoff. It has
no deployment mode. Build Vite with
`DOJI_BUSINESS_ASSET_BASE=/react-business/owned-20261010/` first: changing only HTML
paths leaves Vite's lazy-import paths wrong, which the first package test caught.
The assembler now rejects a root-base component build rather than rebasing HTML.

The corrected package passed all **20 Chromium journeys, zero skips**, including
reset success/pending/lost-response, code correction, registration verification,
maintenance, application receipt/idempotency, session expiry, workspace MFA and
both registration-cutoff sides. Owned-auth/maintenance fixture configurations
exercise the same built bundle without editing release files or calling WorkOS.
This is offline qualification, not hosted/provider acceptance. The new component
build is 199,494 gzip bytes of JavaScript (under the 200 KiB budget).
The freshly assembled `test-results/business-owned-pages-5t5Pyf/` also passed all
20 exact-package journeys, zero skips, on October 10. It remains disabled and
undeployed. The local one-use recovery-secret capture passed its two synthetic
origin/CSRF/no-overwrite tests, tooling typecheck and scoped lint. The real secret
was saved without being printed, and the capture listener was stopped afterward.

| Boundary | Gate | Default / required condition |
| --- | --- | --- |
| Browser | `DOJI_REACT_BUSINESS_CONFIG.ownedAuthEnabled` | Absent/false uses existing integration. |
| Pages | `BUSINESS_OWNED_AUTH_ENABLED` | Absent/false denies new routes. True retires old start/callback/registration routes. |
| Edge entry | `BUSINESS_OWNED_AUTH_ENABLED` | Must exactly agree with `BUSINESS_V2_CONFIG.ownedAuth.enabled`; mismatch fails closed. |
| Runtime | `ownedAuth.enabled` | Absent/false keeps existing path. True uses guarded store/SQL allowlist. |
| Acceptance | `ownedAuth.acceptanceOnly`, `owned_auth_acceptance.enabled` | Default off; public signup must be false. Exact approved identity HMAC, one provider-create slot, at most two hours. |
| Provider work | `ownedAuth.sendingEnabled` | False denies new owned auth work, including non-email sign-in. Signed reset evidence remains available. |
| Database | `owned_auth_settings.enabled` and correct scope | Draft starts disabled; admission/reset commands remain denied. |
| Maintenance | `BUSINESS_AUTH_MAINTENANCE` at Pages/Edge; browser `maintenanceEnabled` | False/absent normally. True pauses business account reads/commands; signed recovery remains. |
| Registration | Existing runtime signup flag + DB cap/cutoff | Both must allow. Browser cutoff is not authority. Do not reset the previous pilot. |

All existing `BUSINESS_V2_ENABLED`, realm, session, provider client and origin pins
still apply. Disabled signup must not prevent existing-account sign-in. The mode
flag is NOT a safe rollback switch after resets have begun: legacy sessions must
never bypass retained fences. Keep the owned mode selected during recovery.

## Required acceptance evidence (not yet obtained)

1. **Authorization and test identity:** approve the separate business shared-system
   acceptance release and verification/reset emails to an owner-designated disposable
   address. No real customer case, member identity or owner permissions are changed.
   Any temporary registration allowance needs an explicit bounded cap/cutoff; do not
   infer permission to reopen public signup from permission to create a test identity.
2. **Safe acceptance boundary:** same-realm reset acceptance cannot run while the
   old login installer remains reachable. Either approve a business-only maintenance
   window and complete the revocation/drain sequence below, or separately qualify
   an isolated provider/database environment. Current client/origin pins intentionally
   prevent casually redirecting this runtime to an arbitrary environment. Do not
   revoke production login grants under a “UI-only preview” approval.
3. **Capacity and cost:** inspect current WorkOS email/API capacity, existing hosting
   and SQL headroom. Review conservative guard limits and 1,000-account fence cap.
   No paid feature, higher tier, polling or throughput increase is authorized here.
4. **Provider contracts:** qualify create-user interaction with the existing WorkOS
   registration Action; verification delivery/retry/expiry, duplicate creation and
   lost creation response; existing-factor MFA, unsupported challenges and workspace
   step-up behavior. Synthetic tests do not establish production error formats.
   Orphan/un-enrolled users remain denied; no implicit consent or auto-enrollment.
   A reviewed operator reconciliation path is required before public registration.
5. **Reset evidence:** configure the exact business reset URL and dedicated signed
   success webhook only after approval. Verify actual event context/client/subject,
   delivery, duplicate redelivery, stale signature denial, database failure recovery,
   fresh sign-in after reset and rejection of old/in-flight business sessions.
   Test with the disposable identity only. Never request passwords/codes in chat.
6. **Privacy/operations:** prove edge/access/error logs do not retain reset query
   tokens; a no-referrer header and browser URL replacement cannot erase first-hop
   logs. Confirm existing-runtime categories are visible and an operator can locate
   exact provider reset/event evidence without receiving user secrets. No generic
   unlock exists for an unproven provider failure.
7. **Release artifact:** freshly verify live package/config baselines, preserve legal
   pages, CSP, no-referrer and existing route contracts. Produce a final merged Pages
   artifact, verify hashes, run package-specific browser tests without skipped
   cutoff checks, and execute the actual hosted runtime (local bundling is not Deno
   or Cloudflare deployment acceptance). Recheck member and employee contracts.

## Ordered deployment plan — requires separate approval

1. Outside an active Doji delivery window, capture current business runtime/Pages
   packages, exact flags and function privileges securely. Capture member/employee
   function/grant/policy fingerprints and bounded health evidence. Do not print secrets.
2. Apply additive `business_owned_auth_guard_v1.sql`, then
   `business_owned_reset_links_v1.sql`, `business_owned_store_v1.sql`, and
   `business_owned_acceptance_v1.sql`, with
   guard disabled. Verify scope, permissions, limits and unchanged member fingerprints.
   Prepare the candidate runtime/Pages code with all owned flags off and sending off.
   Default-off deployment is not permission to send email or enable registration.
3. Before any owned login/reset, enter the approved business-only maintenance state
   at ingress, retire old callbacks and stop new business commands. Preserve current
   server keys/encryption key. Change candidate runtime and Pages to owned mode with
   sending false. No frontend-owned flag yet; customers must see an intentional
   maintenance state, not a broken old login. Set the tested browser maintenance
   flag alongside Pages/Edge `BUSINESS_AUTH_MAINTENANCE=true`; verify all three
   boundaries. Runtime configuration is captured on instance startup; drain/replace
   old instances rather than assuming an in-memory handler updates.
4. Commit `business_owned_cutover_v1.sql`. Verify old `execute_store` and
   `put_bound_session` execution is denied for the actual restricted business login,
   and only the guarded installer can create sessions. **Drain already-running old
   requests/transactions after revocation**; REVOKE does not cancel a call already
   executing. Verify no old login traffic can start or remain in flight. Do not kill
   shared/member sessions to achieve this. If drain cannot be proven, remain closed.
5. Configure the dedicated webhook/URL, retain stable admission/operation/encryption
   keys, and enable guard/scope with reviewed bounds. Enable sending and the browser
   owned flag only inside the authorized acceptance boundary. Complete the evidence
   above and real rollback exercise. Keep public registration closed.
6. Only after all checks pass and public cutover is authorized, remove maintenance
   and publish the exact tested package/config. Verify business sign-in, reload,
   logout and application restoration; bounded member/employee probes must pass.
   Publish registration separately only after its provider/orphan gates are cleared.

## Stop and rollback

- Before any owned dispatch: keep all flags closed; additive drafts do not replace
  existing functions. Restore only the verified prior business package/config.
- After owned dispatch: set `sendingEnabled=false` while **keeping owned mode**.
  Do not regrant legacy installers, rotate mapping keys, delete receipts/fences or
  restore removed sessions. Preserve signed-success event routing and the scoped
  guard while reconciling uncertain outcomes. Existing session reads are separate.
- Matching, signature-verified success is the only automated pending-reset recovery.
  Provider event redelivery is preferred; absence of an event proves neither failure
  nor success. Unproven rejection stays fenced for security review.
- `business_owned_cutover_v1.rollback.sql` is a final retaining freeze, not a restore
  of old login. Apply only after pending recovery is addressed or explicitly escalated;
  disabling the guard also prevents normal reconciliation. Full link/guard rollback
  similarly preserves data but closes commands. A legacy fallback needs separate
  review after all pending outcomes and old sessions/continuations are accounted for.

## Reproducible local evidence

Run from the migration worktree, using installed dependencies only:

```text
node scripts/test-business-owned-guard.mts
node --test scripts/test-business-owned-runtime.mts
npm run typecheck:portals
npm run typecheck:tooling
cd web
npm test
npm run typecheck
npm run lint
npm run build --workspace @doji/business
npx --no-install playwright test --config playwright.business.config.ts
cd ..
node scripts/prepare-business-owned-candidate.mts
```

The database runner replayed 290 migrations and passed 122 assertions in a fresh
owned network-disabled PostgreSQL container, removed afterward. Real concurrent
connections exercise races and retaining rollback; only provider/proof inputs are
synthetic. The current Node business/restricted-SQL regression group passed 192 checks,
including 15 full-runtime checks. These are local, not real email or live-user
acceptance. The component packager reads fixed source paths and built assets only,
hash-verifies every output, includes no secrets, and has no deployment mode.

The web suite passes 266 tests; Chromium passes 18 business journeys with two
package-only cutoff checks intentionally skipped in local development. Portal,
tooling and web typechecks and lint pass. Real local Edge/workerd probes also pass:
owned sign-in, reset, old-session denial and host-only cookie handling. Their
provider/database transport is synthetic and containers have no external network.
Hosted deployment and real mail remain unqualified, not “passed by simulation.”
