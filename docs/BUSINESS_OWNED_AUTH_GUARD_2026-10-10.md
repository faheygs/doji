# Business-owned authentication guard — local preparation

Owner approved local shared-database preparation and testing on October 10, 2026.
Deployment, provider calls and email sending remain gated. This is not a migration
queue entry or an enabled production integration. The current local runtime/proxy
composition and release gates are in `BUSINESS_OWNED_AUTH_CUTOVER_2026-10-10.md`.

## Artifacts

- `docs/drafts/business_owned_auth_guard_v1.sql`: additive, default-disabled tables
  and private commands in the existing business session schema.
- `docs/drafts/business_owned_auth_guard_v1.rollback.sql`: retaining rollback.
- `infra/portal-identity-candidate/business-owned-guard.mts`: typed, pinned-business
  server adapter, now composed only in opt-in business runtime/SQL mode.
- `scripts/test-business-owned-guard.mts` / `.sql`: fresh offline PostgreSQL tests.
- `scripts/test-business-owned-guard-adapter.mts`: injected-transport unit tests.
- `business-owned-flow.mts` / `business-owned-session.mts`: guard/ticket integration
  in the default-off candidate runtime; production runtime/proxy remain unchanged.
- `business-owned-reset.mts` / `scripts/test-business-owned-reset.mts`: gated
  pre-dispatch fencing coordinator and offline failure/retry tests.

## Admission contract

`admit_owned_auth_v1` atomically checks all budgets, increments them and issues a
five-minute server-only admission ticket. Duplicate ticket identifiers never allow
another provider call. Denial never partially charges another bucket. The adapter
generates cryptographically random identifiers and sends only scope-separated HMAC
identity/network keys, not email addresses or IPs. Equivalent IPv6 representations
are canonicalized before hashing. Use a separate secret HMAC key, not a provider key.

The conservative candidate limits are 60 total attempts, 30 per source address and
10 per identity in ten minutes, shared across all six auth actions. They need
capacity/UX review before release; this is not a production capacity claim. Each
command expires at most 32 old rows. Hard limits are 256 bucket rows, 128 tickets,
128 reset receipts and 1,000 account fences. Pending reset receipts are not evicted.
Completed receipts remain for at least 24 hours. Fences are retained per account.

Sign-in/recovery composition order: validate exact origin/CSRF/body/trusted ingress,
commit admission, verify the one-use anti-abuse proof, then contact the provider.
An unsuccessful proof still spends the budget. No automatic retry or refund.
Continuation code attempts must use the original identity HMAC from encrypted
server state, not a browser-supplied key or newly generated browser binding.
The local flow now implements this order. Continuations first atomically consume
their valid browser-bound record, then charge admission and verify proof. A failed
budget/proof terminates that continuation without calling the account provider.
Wrong bindings cannot consume another browser's record. The original five-minute
deadline starts before the first durable admission, not after provider latency.

## Reset and session fencing

The original signin/register ticket must survive email/MFA continuations. A newer
code-attempt ticket must never replace it. `put_owned_session_v1` installs through
the existing atomic identity-bound store and rejects tickets from before or during
an account reset. Monotonically increasing database epochs establish ordering,
rather than relying on synchronized server clocks. Tickets still expire by DB time.

The reset orchestrator requires an exact, unexpired, provider-backed
reset-token-to-subject mapping first. WorkOS's create/reset-details responses provide
the subject and token; the recovery adapter now projects minimal hashed metadata
into the encrypted reset-link store. Browser token ingestion remains gated.
Do not derive the target from a posted email/subject or decode an unverified token.

1. `begin_owned_reset_v1` commits the account fence and removes only that account's
   durable business sessions before the provider reset. Only `started` permits the
   provider write. `pending` requires reconciliation; `complete` is an existing receipt.
2. Provider confirmation uses the same durable operation and exact mapped subject.
   Unknown outcomes, aborts and timeouts must leave the fence in place. Never
   automatically repeat a potentially completed provider reset or unlock by time.
3. `complete_owned_reset_v1` checks the original subject, advances the fence, removes
   target sessions again and completes the receipt atomically. Repeated completion
   does not remove sessions established after the first completion.
4. A fresh signin/register ticket can establish a session after completion. Another
   business account's sessions and admissible tickets are unaffected by the fence.

Provider reset plus database completion is not one distributed transaction. Durable
pre-dispatch intent and operator-safe reconciliation are mandatory release gates.
An explicit provider rejection also needs a reviewed reconciliation path; this
candidate deliberately contains no generic unlock command. It does not undo an
application transaction already authorized before the reset fence committed.

## Isolation and cutover gates

No existing function is replaced. No member/employee auth table, role membership,
policy, RPC, realtime channel, push rule or challenge timer is changed. New commands
are private, fixed-scope, security-definer functions with empty search paths and
bounded transaction timeouts. Only the existing restricted business session role
gets entry-point execution; it cannot directly access the new RLS-enabled tables.
The lock/principal helpers are not granted to any API role. All database transactions
are short; none spans provider HTTP. Shared infrastructure is still shared, not
physically isolated or zero risk.

The existing `put_bound_session` and legacy hosted callback remain unchanged.
**They do not enforce these new tickets. Do not enable reset or owned-auth release
while any reachable login installer can bypass `put_owned_session_v1`.** Cutover must
route every reachable business login installer through the guard, retire/drain old
callbacks/continuations, verify the exact SQL allowlist and prove bypass denial.
The unsafe `business-owned-flow.reset()` placeholder was removed. Its replacement
`business-owned-reset.mts` is deliberately separate and explicitly composed only
in owned mode: no live reset route is enabled. `resolve(tokenHash)` uses the private durable
reset-link adapter, not a decoded browser token or posted identity. Creation sends
mail before returning metadata,
so missing metadata after an ambiguous creation must fail closed, not be invented.

Offline coordinator tests cover stable scoped operation IDs, concurrent duplicate
requests, expired/cross-realm mappings, wrong returned subjects, provider timeout,
lost begin/completion responses, and browser cancellation. A committed completion
receipt is recoverable after a lost response without another provider mutation.
If provider success is known but the completion receipt did not commit, it stays
pending across process recreation until exact signed success evidence arrives.
The local success-event handler now reconciles that evidence atomically. Confirmed
provider success uses an independent four-second completion budget when the browser
disconnects. Explicit rejection/unknown outcome needs operational reconciliation
before release; a locked account cannot simply expire back into the old auth path.

Session removal is observed through existing authorized business reads/401 cleanup
and foreground/reconnect handling. No auth token, ticket, reset intent or HMAC key
is published through realtime. No polling or scheduled cleanup was added.

Before deployment: qualify provider token mapping, ambiguous reset recovery,
admission/Turnstile runtime composition, hosted-cookie behavior,
legacy bypass closure and no-added-cost capacity. Obtain separate release approval.
Preserve exact current runtime/proxy packages and configuration before any cutover.

## Verification

Run from the migration worktree:

```powershell
node scripts/test-business-owned-guard.mts
node --test scripts/test-business-owned-guard-adapter.mts
```

The database runner accepts no remote target or connection string. It uses existing
clean-room machinery: a fresh UUID-labelled local container, no network, no exposed
ports, no host bind mounts and synthetic identities; it verifies ownership and removes
only that container on completion. It replayed 290 migrations and applied the actual
existing business/identity/session prerequisites, not replacement mock SQL functions.

Results: 101 database assertions pass, including real two-connection lock contention,
budget/replay limits, both sign-in/reset race orderings, tickets admitted during reset,
retaining rollback, role denials, cleanup bounds and cross-account isolation. Existing
function definitions/grants, policies, member rows, employee state and role memberships
match their pre-candidate fingerprints. Authorized member profile reads and independent
employee identity resolution still work after the candidate and rollback.

118 offline Node checks pass across guard/provider/flow/HTTP/reset and existing
business HTTP/workflow/runtime/proxy suites. Original-ticket propagation through
email-to-TOTP and rejected-code retries is tested, and reset-fenced installation
returns no cookie and revokes the newly verified provider session. HTTP integration
uses the actual guard adapter with an offline SQL transport. A separate full reset
round trip uses the real store/coordinator/signature handler against PostgreSQL,
with only the provider outcome/event and anti-abuse proof synthetic. No live runtime
mounting is implied. The subsequent runtime composition has 149 backend checks;
the database count includes 13 cutover/rollback checks, with all prior 88 retained.
See `BUSINESS_RESET_RECOVERY_2026-10-10.md` for the procedure.
Portal and tooling TypeScript pass. No provider staging,
live email, production load, actual reset delivery or mobile-device acceptance is
claimed by these tests.

## Rollback

Disable new provider dispatch/sending while preserving owned mode, signed recovery
routing and the guard until pending resets are reconciled or explicitly escalated.
Then apply retaining reset-link/guard freeze to revoke their new entry functions.
Keep fences/receipts. Never restore removed sessions, clear pending
fences, or automatically fall back to an unfenced legacy installer. Old continuations
must expire/be retired before a separately reviewed fallback. The tested rollback
leaves member/employee contracts unchanged. No live rollback was needed in this work.

## Reference

[WorkOS password-reset contract](https://workos.com/docs/reference/authkit/password-reset)
documents provider session revocation and the returned reset subject. Our local
session fencing is additional protection, not a replacement for that provider contract.
