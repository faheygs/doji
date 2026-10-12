# Business reset storage and recovery — local candidate

## Status

Prepared locally under preparation-only approval. No deployment, webhook
registration, provider request, email, signup reopening or real account change.
Live business authentication is unchanged. Browser reset transport is now prepared
behind the existing default-off owned-auth flag. The HTTP candidate accepts reset
only with the fenced coordinator; the local runtime/proxy now supply it in opt-in
owned mode. Live routes remain disabled. See `BUSINESS_OWNED_AUTH_CUTOVER_2026-10-10.md`
for the current integration, acceptance gates and ordered retaining rollback.

## Connections

- Recovery still passes admission and anti-abuse proof. The provider adapter
  validates reset ID, user ID, matching email, token and future expiry, returning
  only a token SHA-256 hash, reset ID, subject and expiry to the server flow.
- The owned runtime wires `rememberReset` to `createBusinessOwnedResetStore(...).remember`. Metadata
  gets an independent four-second persistence budget if the browser leaves after
  provider success. Recovery responses remain neutral, including storage failure.
- The store encrypts metadata with the existing scoped business cipher and a
  purpose discriminator. Private SQL binds it to an existing active business
  principal. No raw token, URL, password, email, IP or full request body is stored.
- The coordinator resolves this durable mapping. Its `guard.admit` comes from the
  owned guard, but `beginReset` and `completeReset` MUST come from the reset-link
  store. The mapped begin atomically binds the link and commits the account fence
  before provider mutation. Unknown outcomes remain pending; no redispatch.
- `business-owned-reset-events.mts` verifies an exact signed success event and
  atomically completes the matching pending operation. It never changes a password,
  creates a session, calls the provider, or sends mail.

## Browser reset connection (local only)

- Intended provider reset URL: `https://business.dojipro.com/business-portal/access/?mode=reset`.
  WorkOS appends its documented `token` parameter. Provider configuration is NOT changed.
- The entry module captures one strictly bounded token on that exact business route,
  then replaces the current URL before React, session reads or the security widget.
  Duplicate tokens/modes, fragments, extra parameters and disabled flags fail closed.
- Tokens are memory-only, usable for five minutes, consumed once after CSRF bootstrap
  and security proof, and cleared on page hide or leaving the account flow. No token
  field, React state, browser storage, history state or new history entry is created.
  Refreshing the scrubbed page requires reopening the email link.
- The new password field clears immediately on submission. Only the exact same-origin
  reset POST carries token/password/proof. Fetch uses no-referrer/no-store, a 15-second
  deadline and no retry. The candidate caps reset input at 16 KiB, requires CSRF/browser
  binding and rejects existing signed-in sessions and extra identity fields.
- Confirmed completion never auto-signs in. Lost, malformed or unsuccessful reset
  responses after dispatch show an uncertain-result/support screen, never success or
  an automatic retry. A failure before dispatch permits fixing the security check.
- HTML meta and development/preview response headers suppress referrers; the existing
  release response header must remain `no-referrer`. Chromium caught early development
  module requests preceding the meta tag, so the response header is required as well.
- The first navigation necessarily sends the link to the hosting edge. Before live
  enablement, verify query-string redaction in ingress/access logs and that no analytics
  or error collector records the original URL. Browser scrubbing does not erase edge
  logs, email-provider records, or guarantee JavaScript memory zeroization.

The [WorkOS reset API](https://workos.com/docs/reference/authkit/password-reset)
returns metadata during creation and sends email; that operation and local storage
are not one transaction. The [success event](https://workos.com/docs/events#password-reset-events)
identifies a reset and user. The handler follows the documented
[signature validation](https://workos.com/docs/events/data-syncing/webhooks), and
also requires the expected business client ID.

## Bounds and retention

- Default-disabled guard/scope; exact business origin/client; restricted business
  session role only; RLS and no member/employee API execution or direct table access.
- Maximum 128 link records, expiry within 24 hours, at most 32 rows cleaned per
  write. Conservative local bounds require production capacity review.
- Pending metadata survives token expiry for late evidence. Completed receipts
  remain at least seven days. Expired unused links are cleaned on demand. No polling.
- Minimal success evidence: event ID and completion time. A dedicated business
  webhook secret is required, never an employee/registration secret.
- Exact POST route; 16 KiB body; strict UTF-8; constant-time HMAC comparison;
  three-minute signature timestamp tolerance. Unknown reset IDs allocate no state.
- The handler acknowledges only after its short atomic DB operation commits.
  Database failure returns a sanitized 503 so evidence can be redelivered.
  Repeated/late evidence never revokes sessions created after completion.
- A known link consumed before our dispatch is burned without inventing an
  operation or releasing an unrelated pending fence.

## Recovery procedure for an eventual approved release

| Situation | Safe action |
| --- | --- |
| Completion committed but response lost | Read the completed receipt through the original valid link; do not repeat the password mutation. |
| Uncertain provider outcome; exact success event arrives | Signature-verified reconciliation completes that pending operation. Require a fresh sign-in. |
| Database outage during evidence delivery | Retain the fence, restore the database path and redeliver the same provider event. Do not resubmit the reset POST. |
| Missed success event | Authorized operator locates the exact reset ID in the business WorkOS environment and uses provider event redelivery through the signed handler. |
| No matching success evidence, explicit rejection, wrong subject or disabled identity | Keep the fence and escalate for identity/security review. Never manufacture success, delete pending rows, restore old sessions, or switch to legacy login. No generic unlock is provided. |
| Creation response or metadata persistence lost | Unmapped links fail closed. A new link requires a new rate-limited recovery action, not an automatic resend. |

Support must not ask for passwords, tokens, MFA codes or reset links in chat/logs.
Use reset/event IDs. Another reset's event or a successful sign-in is not proof
that this pending reset completed. Absence of an event does not establish failure.
Unproven failures are not automatically released; an override policy requires
separate security review.

## Deployment and rollback boundary

The separate `business_owned_reset_links_v1.sql` draft depends on the guard draft.
It adds one private table and five atomic commands, replacing no existing function.
It is not in the migration queue or live restricted SQL allowlist. The candidate
restricted transport explicitly opts in only for the business realm. Shared
infrastructure remains shared, not physically isolated.

Disable new dispatch/sending while retaining owned mode and signed event routing
for recovery. Keep the guard available until pending outcomes are reconciled or
explicitly escalated. Only then apply the retaining link/guard freeze. Keep metadata,
fences and receipts. Never restore removed sessions or silently re-enable an
unfenced legacy callback. See the cutover runbook; rollback is not a legacy fallback.

## Verification and remaining gates

88 offline PostgreSQL checks pass after replaying 290 migrations in a fresh owned
network-disabled container. Real concurrent connections test reset/event races.
A full round trip runs the actual guard/store/coordinator/signature-handler against
PostgreSQL; only provider timeout/success evidence and anti-abuse proof are synthetic.
Existing member/employee functions, grants, policies, data and authorized reads
survive the candidate and rollback. The owned test container is removed afterward.

120 backend regression checks pass, including browser transport through the actual
HTTP/coordinator with synthetic provider/store responses, encrypted persistence,
adapter recreation, signature rejection, neutral recovery and database failures.
266 web checks and 17 Chromium business journeys pass (two packaged-cutoff checks
skipped locally). Typechecks, lint, production business build and the unchanged
200 KiB gzip budget pass. These checks do not establish live provider delivery or
release readiness. The 88 PostgreSQL checks above are prior evidence; no SQL changed
in this browser-wiring increment.

Current continuation: runtime/proxy/cookie/SQL composition passes 149 Node checks;
101 database assertions now include old-grant revocation, guarded installation
after cutover and retaining freeze. Real local network-disabled Edge execution
confirms owned signin/reset and session revocation; local workerd confirms owned
cookie forwarding. All 266 web checks and 18 Chromium business journeys pass (two
package-only cutoff checks skipped in this local development run). The maintenance
journey scrubs/discards reset tokens without submitting or restoring an account.
Fixed-category failure diagnostics use the existing console
only, with no secret or identity payload. No provider call or deployment occurred.

Remaining: ingress-log redaction;
dedicated business webhook and reset-URL configuration;
approved provider acceptance and no-added-cost checks; hosted failure visibility;
deployment/drain of legacy unfenced installers; recovery for un-enrolled/orphan WorkOS users
(currently denied, never auto-enrolled); key continuity across pending operations;
explicit deployment/sending approval.
