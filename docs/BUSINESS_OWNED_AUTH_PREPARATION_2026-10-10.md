# Business account design and owned-auth preparation — October 10, 2026

## Status and boundary

LOCAL ONLY. Owner approved preparation/testing, not deployment or email sending.
The live business site still uses the existing hosted authentication integration.
New routes are composed locally behind default-off runtime/proxy flags; no SQL, secrets, account, email,
registration policy, member auth or employee auth changes were deployed.
The last bounded registration window expired at 2026-10-10T07:03:14.688Z and was
not reopened by this work. **Current status supersedes the historical increments
below:** `BUSINESS_OWNED_AUTH_CUTOVER_2026-10-10.md` tracks the completed local wiring,
101 database/149 backend checks, component package and outstanding live gates.

## UI

`AccountCard` uses ordinary MUI Paper, Stack, Typography and the shared Doji theme:
a centered maximum 520px account surface, restrained heading, logo/brand accent,
centered explanatory copy and compact actions. It fixes the outer Stack margin
override and stretched controls in the access view. Account-page footer links
are centered. Workspace MFA buttons no longer stretch.

`/preview/access` is an explicitly labelled disconnected design preview, not a
working account service. It demonstrates sign-in, registration, email verification,
password recovery/reset, authenticator verification and registration-closed states.
Its transport is a local mock: no provider calls or emails. The connected production
route map does not expose this preview. Password/code fields clear at submission
and after completion; duplicate submission is blocked and unmount aborts requests.
The standard shared MUI verification-code field is retained.

The subsequent integration adds `OwnedAccessConnected` behind the independent
`DOJI_REACT_BUSINESS_CONFIG.ownedAuthEnabled === true` browser flag (not enabled in
any release config). It uses the bounded same-origin `owned-access-transport`,
per-action security proofs and the existing client restore/application controller.
Signup still respects the UI cutoff and must also pass authoritative server admission.
The browser never sees provider session tokens or chooses an account identity.
Reset-link ingestion/one-shot transport now connect to the explicitly supplied
fenced coordinator. Existing-factor TOTP challenges use the Doji MFA form through
the default-off HTTP candidate.
No automatic POST retry, persistent credentials, socket or polling is introduced.

## Gated backend candidates

- `business-owned-provider.mts`: pinned business provider/client, explicit enabled
  and sending gates, injected upstream, bounded responses/deadlines, no raw provider
  errors or reset tokens returned to UI; verified-user projection only. Provider
  signup cannot set email_verified. Impersonation/organization grants fail closed.
- `business-owned-flow.mts`: durable guard admission, separate anti-abuse proof,
  reservation/enrollment and guarded session install; encrypted, browser-bound,
  expiring one-use continuations carry the original admission ticket and identity
  HMAC through email/TOTP retries. Signup consent is tied to the created subject.
  Recovery uses neutral copy. The unsafe post-provider reset placeholder is removed.
- `business-owned-reset.mts`: separate explicitly composed reset coordinator. Requires a
  durable provider-backed token mapping through the reset-link store, fences before
  dispatch, verifies the returned subject and completes the receipt. Ambiguous
  outcomes stay pending without redispatch or automatic unlock. No reset login.
- `business-owned-http.mts`: exact same-origin route/method/body allowlist, CSRF
  bootstrap, duplicate-cookie denial, bounded input/deadlines and host-only HttpOnly
  binding/continuation cookies. It never returns a provider token or flow handle in
  JSON. Existing signed-in accounts cannot be replaced by another login. Only
  signin/register/verify/mfa/recover and explicitly composed reset are implemented;
  absent coordinator or disabled gates fail closed.
- `business-owned-session.mts`: issuer/audience/subject/session verifier followed
  by existing authorization or enrollment and atomic guarded actor-bound storage.
  The original signin/register admission ticket is mandatory; no legacy fallback.
  It creates the existing business session format and revokes a verified provider
  session if installation fails. The existing session/read routes accept this
  session in offline integration tests. Production mounting remains disabled.

These are initial candidates, NOT a production-ready replacement. Remaining gates:

1. Production qualification of the completed local runtime/proxy/cookie/SQL
   composition. The separate owned admission helper covers all six actions;
   business-only SQL budgets, trusted ingress and existing reservation are wired
   locally. Dedicated deployment flags remain off. No live acceptance is implied.
2. Concrete atomic signup reservation, including ambiguous account creation,
   retry/idempotency, provider registration-action interaction and orphan
   reconciliation. The session installer is now implemented; durable runtime and
   provider acceptance remain necessary.
3. Live verification retry qualification, resend and expired-flow consent recovery.
   Explicit code rejection now rotates the consumed handle with consent intact;
   all steps share the original deadline and five-attempt cap. Unknown outcomes
   remain terminal; no automatic network retry or email resend is introduced.
4. WorkOS MFA enrollment/Radar/organization continuation qualification. Existing
   TOTP factors are connected locally, but unsupported challenges fail closed.
   Successful login does not mint a workspace step-up receipt. Qualify that boundary
   before release so a completed provider factor does not create an unnecessary
   second prompt, and do not infer MFA from email verification or enrollment.
5. Provider reset acceptance. Browser ingestion, durable encrypted mapping
   and signed success-event reconciliation are now locally connected and tested
   against PostgreSQL. No generic unlock for unproven failures. HTTP reset is only
   composed in the default-off owned mode. See `BUSINESS_RESET_RECOVERY_2026-10-10.md`
   for operational recovery and gates.
6. Provider staging acceptance, cost/email-capacity checks, explicit deployment
   approval, release/rollback packages and authenticated end-to-end acceptance.

No existing member RPC, RLS, realtime stream, challenge timer or push behavior was
changed. No polling was added. Any eventual business account/session install must
reuse existing authorized reads and foreground/reconnect reconciliation. Shared
infrastructure is not physically isolated; runtime deployment remains a separate
reviewed boundary.

## Verification

- Ten offline Node candidate tests pass: gates, provider grant checks, signup
  verification, encrypted browser binding, concurrent one-use consumption, expiry,
  cross-subject rejection, neutral recovery and required reset invalidation.
- Four isolated Chromium design tests pass, including 1920px desktop centering,
  compact buttons, local form transitions, standard MFA and 390px overflow checks.
- Three component tests pass: immediate credential clearing, duplicate suppression,
  error sanitization, unmount abortion and synchronous adapter failure recovery.
- Existing web regression suite: 249 tests pass. Web typecheck/lint and business
  production build pass. These offline checks do not establish live provider behavior.
- Screenshots are under `web/test-results/business-access/` and were visually checked.
- Existing business browser regression suite: ten pass; two packaged-release
  cutoff tests are intentionally skipped in this local-dev run.

### Subsequent transport/session integration checks

- 84 Node checks pass across owned provider/flow/HTTP and existing business
  HTTP/runtime/proxy suites. Eleven new HTTP tests cover CSRF/cookies, signup gates,
  verified enrollment, existing session/application reads and failure cleanup.
  One joins the actual browser transport to the candidate HTTP handler, then reads
  the application through the existing authorized HTTP adapter.
- Six browser-transport unit tests pass (nine including the existing three form
  tests). Real Chromium exposed an illegal native-fetch receiver; using an unbound
  function invocation fixes it and both connected-form journeys pass.
- Portal/server TypeScript now passes; the cipher gained an explicit generic seal
  type for the new continuation shape, with unchanged default session semantics.
- All integration providers/stores/API responses remain offline fixtures. None of
  these counts constitute provider staging, email delivery or live write acceptance.
- Final web suite: 258 tests pass. Business browser suite: 12 pass, two release-package
  cutoff tests skipped locally. Web/portal/tooling TypeScript and web lint pass.
- Business build and existing artifact budgets pass: 193.9 KiB gzip total scripts.
  The development-only account preview is excluded at build time, rather than
  increasing the budget. The previous public/business release script also gained
  an explicit string assertion before CSP matching, fixing its nullable-header
  TypeScript error without relaxing the release check.

## October 10 continuation hardening evidence

- Existing verified-user TOTP factors are accepted only with validated provider
  factor/challenge IDs, matching factor ownership and a future provider expiry.
  Pending provider tokens, subject and challenge ID remain in encrypted server
  continuation state; HTTP JSON exposes only the display step.
- Email and TOTP code attempts consume the old handle before contacting WorkOS.
  An explicit negative HTTP 401 code response with no tokens/pending grant can
  return `codeRejected: true` and a newly issued HttpOnly continuation. Neither
  provider error text nor credential data reaches the form. This is a bounded
  rejection classification, not a claim that every provider error means a typo.
  Network/5xx/429/malformed/ambiguous responses do not restore the consumed flow.
- Consent, expected subject, original deadline and attempt count survive all
  continuation transitions. At most five code submissions are allowed within
  the original five minutes. This per-flow cap does not replace the pending
  server-owned cross-flow/account/network admission budget.
- 91 offline Node checks pass, including existing business HTTP/runtime/proxy
  suites. 259 web tests pass. Chromium business suite: 13 pass, two package-specific
  cutoff checks skipped locally. Web/portal/tooling typechecks, ESLint, production
  business build and unchanged artifact budgets pass (193.9 KiB gzip).
- New checks cover rejected-code correction, handle rotation/replay, preserved
  consent, attempt exhaustion, non-extending expiry, late provider success,
  cross-account MFA denial and actual transport-to-HTTP session installation.
  Chromium verifies the standard MUI code field stays usable, security proof
  refreshes, and application reads wait for successful authentication.
- These are offline fixtures, not provider staging or live email acceptance.
  No shared database file, runtime mount, proxy, deployment, member/employee auth
  or registration setting was changed in this increment. Local shared-database
  preparation for admission/reset revocation was subsequently approved. The
  default-disabled candidate, 51 PostgreSQL assertions, retaining rollback and
  remaining composition gates are documented in
  `BUSINESS_OWNED_AUTH_GUARD_2026-10-10.md`. It is not deployed or runtime-wired.

## October 10 reset-browser connection

The default-off business browser now captures and immediately scrubs reset links,
keeps a one-use token in memory, and sends the new password through the explicitly
composed CSRF-protected HTTP candidate. Confirmed and uncertain outcomes have
separate MUI screens; neither installs a session or automatically retries.
The owned-auth runtime/proxy, provider configuration and sending remain gated.
See `BUSINESS_RESET_RECOVERY_2026-10-10.md` for exact contracts, evidence and remaining
release requirements. This increment changes no SQL, member or employee contract.

## Primary references

- [MUI templates](https://mui.com/material-ui/getting-started/templates/)
- [MUI Card](https://mui.com/material-ui/react-card/)
- [WorkOS authentication](https://workos.com/docs/reference/authkit/authentication)
- [WorkOS authentication errors](https://workos.com/docs/reference/authkit/authentication-errors)
- [WorkOS password reset](https://workos.com/docs/reference/authkit/password-reset)
- [WorkOS custom UI example](https://github.com/workos/workos-custom-ui-authkit-example)
- [WorkOS emulator code-failure behavior](https://workos.com/docs/cli/emulate)

## Rollback

There is no live change to roll back. Keep these candidates unmounted/default-off.
The visual changes can be reverted independently without touching the currently
deployed authentication runtime, sessions or database. Do not discard unrelated
uncommitted migration work when preparing that diff.
