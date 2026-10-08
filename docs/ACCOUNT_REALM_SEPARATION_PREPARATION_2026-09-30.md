# Account separation: implementation and release record

## October 5: first-application submission defect repaired

The owner completed hosted authentication and reached the application form. Bounded
function invocation logs show auth start 200, registration Action 200, callback 303,
session/application GET 200, followed by application POST 400 at 20:13:56 UTC.
A bounded read showed one business account and no application records. No raw
session, provider token or form contents were retrieved for diagnosis.

Root cause reproduced in the browser fixture: a new application draft starts empty,
but the form renders a preselected US country. Since the single-option country
control is never changed, event-only draft capture omits it. The existing database
validator rejects the incomplete submission. URL validation was separately checked
read-only and accepts an ordinary HTTPS URL; no validator/database patch was needed.

The independent applicant UI now reads allowlisted, rendered form values before
Save/Submit, capturing preselected values and browser autofill without requiring
input events. It retains existing atomic commands, idempotency keys, concurrency
checks and drafts on failure. Application HTTP 400 gets an actionable form error,
not the generic sign-in suggestion. No backend, worker, credentials or SQL changes.

Regression evidence: the new first-submission test failed before repair and passes
after it. All 25 focused browser tests and six artifact/browser-client tests pass,
along with website/tooling TypeScript, lint, source-size and whitespace checks.
Exactly three static business scripts changed; live hashes and 401/403 boundaries
passed. Evidence/rollback identity: `test-results/business-submit-default-country-20261005/`.
The previous Pages deployment `abe32036-41ad-4a7d-82e1-6ed17868fc84` is retained for
rollback. Admin/main-site deployments and deployment configuration are unchanged.
Owner was told to Save draft before refreshing; real post-fix submission remains
pending. No real application was submitted or approved by the agent.

## October 5, 20:10 UTC: email-first account form deployed

The owner rejected the consent-only registration screen. Register now opens a
compact form with a required email field, shared controls/theme tokens, compact
consent rows and right-aligned Continue. The redundant current-mode button is gone;
existing users get a Sign in link. Password creation/email verification stays on
hosted WorkOS, with business details collected after verified authentication.

The email is passed directly to WorkOS as documented `login_hint` after the browser
client validates the exact authorization origin/path/callback. It is a UI hint,
never a trusted subject or authorization claim; PKCE/state are untouched. It is
not sent to our `/auth/start`, persisted in browser storage, or treated as a draft.
Reference: https://workos.com/docs/reference/authkit/authentication/get-authorization-url

Deployment: `abe32036-41ad-4a7d-82e1-6ed17868fc84`; rollback:
`94c0d712-faa6-4473-a5d2-83c80e7d760f`. Exactly three static files changed:
account HTML, bundled account script and its new scoped layout CSS. Worker,
deployment config, backend, WorkOS settings, legal text, caps/expiry, employee and
member systems are unchanged. Admin/main-site deployment IDs were checked unchanged.

All 22 focused browser tests passed, including malformed/empty email denial,
encoded email handoff, preserved state/PKCE/callback, no email in our auth payload
or browser storage, consent/security denial and existing session/application/MFA
regressions. Both artifact tests, website/tooling TypeScript, targeted lint and
source-size checks passed. Desktop/mobile light/dark screenshots were inspected.
Live assets matched exact hashes and anonymous/cross-origin session boundaries
remained 401/403. The live form rendered successfully in the browser.

Evidence: `test-results/business-account-form-20261005/`; live screenshot:
`D:/ChallengeApp/DoIt/test-results/business-registration-live-20261005.png`.
Provider navigation was mocked in regression tests; no production account was
created. Real owner signup/callback/application/recovery acceptance remains pending.

## October 5, 19:59 UTC: public business homepage deployed

The owner requested a public business-focused website at the domain root, not an
application landing screen. `business.dojipro.com/` now returns the static public
homepage with the main site's shared design foundation. Header Sign in and Register
links select their exact access mode directly; the account-action dropdown is gone.
The public homepage makes no session/API calls and stays public even when a visitor
has a business session. Only account pages restore sessions and route to onboarding.
Existing application bookmarks still work; their signed-out shell now offers clear
Sign in/Register links. Root/brand links return to the public business homepage.

The business-only Pages deployment is `94c0d712-faa6-4473-a5d2-83c80e7d760f`.
Its predecessor `17cd269f-1431-419d-8d83-f22425f1f49f` is the rollback target.
Only seven presentation/navigation assets changed; the packaged worker, public
runtime configuration, legal documents and deployment bindings are unchanged.
Admin/main-site deployment IDs were verified unchanged. No SQL, Edge, WorkOS,
credentials, member/employee settings, billing, campaign or admission change.
Campaign availability is described as not open; no invented clients or metrics.

All 22 focused browser tests passed, including desktop/mobile root presentation,
direct account modes, consent/security, session restoration, draft preservation,
review states and workspace MFA. Both local artifact tests, website/tooling
TypeScript, targeted lint, source-size and whitespace checks passed. Live root
HTTP 200 and exact asset hashes passed; anonymous/cross-origin boundaries remained
401/403. A live browser visual check confirmed root content and account links.
Evidence: `test-results/business-home-20261005/`; screenshot:
`D:/ChallengeApp/DoIt/test-results/business-home-live-20261005.png`.
This UI release does not complete the outstanding real owner signup/recovery test.

## October 5, 19:12 UTC: owner-approved business signup activated

The owner explicitly approved final business signup/onboarding activation after
the provider-generated signed Action test. WorkOS business Production email/password
is now enabled with its existing policy (minimum ten characters, complexity 3).
Hosted signup was already enabled; no employee setting, paid feature or billing
setting was changed. The exact business JWT audience and default callback remain
pinned to the independent business client and `/auth/callback`.

`scripts/activate-business-onboarding.mts` captured the disabled settings, rehearsed
the exact activation in a rolled-back transaction, and verified valid admission,
idempotent replay, mismatched replay denial and wrong-scope denial. The rehearsal
restored the exact prior settings and did not consume a registration slot.
The subsequent single guarded transaction enabled only the business realm,
encrypted session store, registration, enrollment, reads, commands and private
privacy bridge. Registration/enrollment each retain a ten-account lifetime cap
and `2026-10-07T23:59:59Z` expiry. Flow/session limits remain 100. No account was
created by activation, and counters remained zero at verification.

Post-activation checks passed: existing function/grant/RLS/role fingerprints,
employee realm/session settings, existing business feature settings and all Pages
deployment IDs were unchanged. Anonymous admin and member Auth boundaries and
business static routes returned their expected statuses. These are bounded
contract/health checks, not proof of uninterrupted service or signed-in device
acceptance. Campaigns, billing and business realtime remain disabled.

Evidence and retaining freeze:
`test-results/business-onboarding-activation-20261005/` contains `before.json`,
`rehearsed.json`, `activated.json`, `verified.json`, and `freeze-business-only.sql`.
The freeze disables business access only, keeps consumed caps/accounts/history,
and refuses unexpected directory/generation/policy changes. It does not revoke
member/employee sessions or delete any provider accounts.

The live account page rendered signup, explicit US-business/legal agreement
controls and a completed managed security check. Owner handoff is at
`https://business.dojipro.com/business-portal/access/`: the owner must accept
terms, choose a password and verify email. Actual production signup/callback,
application save/submit, reset and owner acceptance are **still pending**; enabled
configuration and the page rendering are not represented as those tests passing.
Proof: `D:/ChallengeApp/DoIt/test-results/business-signup-live-20261005.png` and
`business-password-enabled-20261005.png`. Local tooling TypeScript, targeted lint,
source-size and whitespace checks passed. No new app build or deployment was needed
for this settings-only activation.

## October 5, 19:04 UTC: business runtime connected; WorkOS-signed test passed

After the owner's specific credential-installation approval, the business-only
Supabase configuration and exact `business-portal-v2` runtime were installed and
verified. The matching server-only proxy key was installed on `doji-business`;
the final Pages deployment is `17cd269f-1431-419d-8d83-f22425f1f49f`.
Member and employee credential values, existing contracts/RLS/roles and other
Pages deployments were checked unchanged. Shared infrastructure is not physical
isolation; these bounded checks are not continuous availability proof.

Hosted qualification identified Supabase's infrastructure `__cf_bm` cookie as
the cause of a proxy 503. The proxy now discards only that upstream cookie and
continues to reject malformed or non-business authentication cookies. Eleven
proxy tests and native Cloudflare runtime checks passed. Hosted same-origin
anonymous reads return 401, cross-origin reads return 403, and browser assets
match the packaged hashes. Only business Pages required this follow-up deployment.

WorkOS business Production now has the registration Action enabled at
`https://business.dojipro.com/auth/workos-registration`, with errors configured
to deny registration. Its own synthetic signed test returned **Succeeded**, an
expected signed **Deny**, and a 1,243 ms response time. This verifies actual
provider-to-hosted signature compatibility, not merely a locally generated HMAC.
No account was created. The business JWT template already pins the exact business
client audience. Evidence: `test-results/business-v2-runtime-20261005/`, plus
`D:/ChallengeApp/DoIt/test-results/business-workos-provider-test-20261005.png`.

The database session, registration, enrollment, realm/read/command and privacy
activation gates remain closed; password login is not yet enabled. Public signup
is therefore **not complete**. Final bounded activation must preserve ten-account
admission, US attestation and October 7 23:59:59 UTC expiry, then qualify the
owner's real signup, verification, callback and recovery. Campaigns, billing and
business realtime remain off. No paid feature or billing setting was changed.

Final tooling TypeScript, targeted lint, source-size and whitespace checks passed.
The final proxy changes have focused/native/hosted verification; they were made
after the full coverage run below and are not claimed to be included in that run.

## October 5: earlier package preparation (superseded by installation above)

The owner saved the existing business Action secret through the protected local
handoff. Its 25-character length exposed an incompatible local 32-character
minimum. After explicit owner approval, the business-only validator accepts a
minimum of 25; HMAC verification, freshness, replay admission and default-deny
remain unchanged. All 41 registration-boundary tests and seven runtime tests
passed, including exact 25-character signatures and rejection with the wrong key.

`scripts/release-business-v2-runtime.mts prepare` captured production baselines,
downloaded the previous business Edge runtime for rollback, and packaged exact
Edge/Pages source. Evidence is `test-results/business-v2-runtime-20261005/`.
Runtime configuration remains only in ignored, ACL-protected local storage.
The configure command was blocked before execution by the safety reviewer pending
explicit authorization of the secret payload and production Supabase destination.
No new production credentials, runtime deployment, Pages binding, Action setting
or signup gate was changed. The owner has been asked to approve business-only
Supabase credentials and the corresponding Cloudflare doji-business proxy secret.

The complete coverage pipeline finished at 18:44:56 UTC with every stage passing,
716 browser tests and 17/17 areas above 90% in all four metrics. The small signing-key
compatibility edit was separately verified with the 41 and seven tests above;
those added tests were not part of that pipeline's earlier offline stage.

## October 5, 18:27 UTC: independent business privacy bridge installed disabled

The approved additive SQL was rehearsed in a rolled-back transaction, then
installed once and verified with `privacyEnabled=false`. Evidence:
`test-results/business-independent-privacy-20261005/verified-1791224829317.json`.
Existing function bodies/grants/RLS/settings and deployment inventories were
preserved. No customer erasure, signup activation or portal cutover occurred.
The clean-room database suite passed all 14 extended suites, including exact-case
privacy, bound-session deletion, rollback and member-permission preservation.
All 34 offline test files passed; full typecheck/lint and local Edge/Cloudflare
runtime qualification passed. The latest native Edge evidence is
`test-results/business-edge-runtime-3IEa34`.

Runtime secrets and WorkOS Action wiring remain outstanding. The existing Action
signing secret is redacted from browser automation; a loopback-only one-field
handoff asks the owner to save it under protected ignored local storage. This does
not rotate credentials or change WorkOS settings. A fresh complete coverage run
is required after the new privacy sources; the earlier 17/17 report below applies
to the preceding source state, not these additions.

The owner separately approved preparation, testing and deployment of exact-account
business WorkOS export/deletion. The candidate is additive: existing member,
employee and legacy business function bodies/ACLs are not replaced. Privacy operator
functions remain private to the database owner; the business web login receives
only a new bound-session insertion function. An authenticated staff privacy case,
disabled target account, matching directory, no legal hold and a durable execution
ID are required before provider deletion. Replaying an execution never authorizes
a second DELETE. Provider timeout/error does not mean deletion succeeded.

`scripts/business-privacy-operator.mts` is a manual exact-case handoff, not an API or
automatic job. It loads only the pinned production business directory credential.
It saves confidential output under ACL-protected, ignored `.artifacts/business-privacy/`;
no personal data or provider tokens go to the console or release evidence. Export is
labelled identity-profile-only and must be combined with the existing staff case
export. Security logs, retained agreements/audit metadata and backup retention need
separate staff assessment; primary erasure never auto-completes the privacy case.

The SQL candidate and retaining rollback are
`docs/drafts/portal_identity_business_privacy_v1.sql` and `.rollback.sql`.
The release runner checks source hashes, existing contracts/grants/RLS/settings,
the event window, disabled business gates, and unchanged deployment inventories.
It rehearses inside a rolled-back transaction before a single installation.
No actual customer erasure, member/employee mutation, paid feature, signup activation
or production portal cutover is authorized by running this preparation alone.

## October 5, 17:44 UTC: business MFA/provider qualification, local workspace integration

The independent business runtime now supports CSRF-protected MFA preparation and
completion, plus its existing approved-workspace SQL read. Pending challenges and
receipts are bound to exact business subject/session/client inside the encrypted
durable store. Admission is persisted before provider effects, completion consumes
the challenge before verification, and no automatic retry occurs. Five preparations
per local session and a 30-second preparation cooldown bound attempts. A rejected
code preserves the signed-in session but grants no workspace access; the UI clears
the consumed challenge and offers an explicit fresh attempt.

The real WorkOS staging check exposed that unverified enrollment factors are not
listed before first verification. The implementation now uses the exact sealed
enrollment response for that first challenge, then requires provider ownership
after verification. Existing-factor challenges require ownership both before and
after verification. Reusing an already accepted TOTP was rejected; the qualified
second challenge uses the next 30-second code. Setup keys are never logged or
persisted in pending state. No account metadata, email match or factor existence
alone confers MFA assurance.

`scripts/check-business-mfa-staging.mts` explicitly pins the business staging
environment/client, verifies signed token identity, has a 24-request ceiling,
and never connects to SQL or production. Successful evidence is
`test-results/business-mfa-staging/1791222302651.json`, with completed=true,
cleanedUp=true and at=2026-10-05T17:44:30.104Z. Sixteen provider requests verified enrollment, a fresh
existing-factor challenge and session-bound receipts. The run revoked its session
and deleted only its synthetic user. Earlier failed qualification accounts were
also removed; the first cleanup parser was corrected to accept the provider's
empty successful revoke response. No real member, employee or business account
was changed.

Browser presentation reuses the shared business MFA component, including manual
setup-key entry when no compatible QR image is present. Approved status exposes
the workspace action; the server still rechecks MFA and organization approval.
Logout/revocation clears both the key and workspace; paid features stay disabled.
The initial 207 business browser tests passed, and all 19 independent browser
flows passed again after adding wrong-code recovery. The 164 focused server,
SQL boundary, employee-provider and session-reader tests passed.

Final local verification at 17:57 UTC: 4,551 Jest tests across 241 suites passed;
716 browser tests passed with zero skipped, failed or flaky cases; all 33 offline
files passed after correcting optional MFA-state restoration compatibility.
The merged report passes **17/17 areas at 90% or higher in all four metrics**;
business branches are 90.24%, portal-identity branches 92.60%. Missing reports: zero.
The original combined runner retains its initial offline failure in `run-status.json`
(exit 1); it was not rewritten as a clean run. After that correction, the old
generated Node coverage directory was replaced and the entire offline allowlist
rerun successfully before final merging/gating. `offline-results.json` records
that passing rerun; `areas.json` records the passing final coverage gate.
Full TypeScript checks, lint, source-size and whitespace checks passed. Existing
local network-isolated Supabase Edge and Cloudflare runtime tests passed; latest
Edge evidence is `test-results/business-edge-runtime-dsDBWk`.

[WorkOS pricing](https://workos.com/pricing) lists AuthKit MFA as included.
[AuthKit MFA API](https://workos.com/docs/reference/authkit/mfa) and
[challenge API](https://workos.com/docs/reference/mfa/challenge) define the
enrollment/challenge contracts used. No custom domain, SMS, enterprise SSO,
paid feature or billing setting was enabled. Runtime credentials/configuration,
registration Action wiring, real production signup/recovery acceptance, Pages
cutover and independent-directory privacy export/erasure remain outstanding.
The existing business endpoint is still disabled; signup is **not live**.

## October 5, 17:13 UTC: exact business callback saved

After action-time owner approval, WorkOS business production application
`app_01M3T51386CC5CTSWR69NFWAH7` (client
`client_01M3T51363MDZZK6X8DB7NS32N`, environment
`environment_01M3T5131BPKBR7F6P2MAG6SBJ`) now allows exactly
`https://business.dojipro.com/auth/callback` as its default redirect URI.
The saved application settings visibly confirmed the exact destination. No wildcard,
employee callback, member setting, password method, signup gate or paid feature
was changed. Other application redirect fields remain unset. This allowlist entry
does not mean the business website/runtime is connected or signup is live.
Screenshot evidence: `D:/ChallengeApp/DoIt/test-results/business-callback-saved-20261005.png`.
The four focused offline callback/HTTP/workflow/proxy/runtime test files completed
with 62 reported test entries passing, zero failures/skips. Initial sandbox startup
failed with `spawn EPERM` before assertions; the authorized subprocess-capable run
passed. These synthetic checks are not real provider signup/reset acceptance.

## October 5, 17:02 UTC: restricted SQL login installed and verified

After explicit owner approval of the exact permanent access grant, the prepared
`doji_business_portal_login` was installed once. TLS certificate/hostname verification
and all four restricted-role disabled-gate checks passed at 17:02:25 UTC. The
existing contract fingerprint remained unchanged; the event-window guard was clear.
Role attribute, membership, direct-table denial and member/employee isolation guards
passed. No business realm or account was created and all business gates remain off.
Evidence: `test-results/business-sql-login-20261005/verified-1791219745221.json`
and `apply-started.json`. Do not rerun `apply`; use `verify` for bounded checks.
The server-only credential remains in protected ignored local storage, not installed
in Edge configuration or exposed to the browser. No paid feature was enabled.

## October 5, 16:47 UTC: disabled database bridge installed

The reviewed business enrollment, reads, commands, registration and review overlays
were installed after a rollback-only live rehearsal. Existing member/employee
function contracts, grants, RLS and employee settings were preserved. Six existing
business-only function definitions changed deliberately: application command,
administrative application command, privacy target/access, and erasure claim/finish.
Independent principals cannot silently fall through to legacy Supabase Auth erasure.
The rehearsal verified exact restoration of these six definitions using the saved
rollback. Existing function, secret and Pages inventories stayed unchanged during
this database phase.

Enrollment, reads, commands, registration and session gates remain false. No business
realm, account or independent principal was created. The deployment used a release
lock, bounded lock/statement timeouts, contract concurrency checks and an event-window
guard. Evidence: `test-results/business-independent-bridge-20261005/`, especially
`verified-1791218820173.json`, `rehearsed.json` and `rollback.sql`. Do not reapply the
installation; use the release script's read-only verification mode when needed.

The transport login, `doji_business_portal_login`, was subsequently installed as
recorded above. Its local preparation and rolled-back rehearsal passed at 16:49:55 UTC. Access:
two connections, NOINHERIT, no administrator/bypass privileges, no direct table
access, and only `doji_business_session`, `doji_business_registration`,
`doji_business_enrollment` and `doji_identity_resolver` memberships. No member or
employee role is included. The credential is server-only, protected and gitignored.
Rollback disables the login and revokes those four memberships.

The safety review initially blocked production login creation before execution.
The owner subsequently approved the exact access grant; the single installation
above completed successfully. Preparation evidence remains in
`test-results/business-sql-login-20261005/candidate.json` and `rehearsed.json`.
Sensitive credential/install files remain under
the ignored `.artifacts/business-runtime/` directory and must not be published.

No runtime credential/configuration, WorkOS change or Pages cutover was made in this
phase. Independent signup remains **not live**. Real signup/verification/reset and
session acceptance, approved-workspace MFA, and independent-directory privacy
fulfillment remain activation gates. No paid feature or billing change was enabled.
Tooling type checks, lint, source-size, hygiene and whitespace checks passed.

## October 5, 16:38 UTC: approved disabled business endpoint installed

Owner separately approved installing the endpoint disabled with preservation and
before/after checks. The minimum installation needed only the non-sensitive
`BUSINESS_V2_ENABLED=false` flag. Runtime secrets and `BUSINESS_V2_CONFIG` remain
absent; no new SQL login, schema change, WorkOS setting or Pages cutover occurred.

- Exact endpoint: `business-portal-v2`, ID `df6dbc1e-e7f4-41cf-9cf5-a2019007bef0`,
  version 1. Platform ACTIVE means deployed, **not** business access enabled.
- Bundle SHA-256: `0ea41548d4c2c5f350cd2b86cfab7528776e88ecd9fe9a017f0cb018f612717a`.
  Downloaded runtime sources matched the packaged maintained sources byte-for-byte
  after newline normalization. Type-only imports erased by the provider bundler
  are not runtime dependencies; the checker traverses TypeScript value imports.
- `/api/session`, `/auth/start` and `/auth/workos-registration` returned empty
  no-store 503 responses, before any provider/session/SQL work can initialize.
- All 16 pre-existing function contracts/source hashes were preserved. Supabase
  incremented their version numbers once when the disabled flag was added;
  `employee-portal-v2` is now version 9 with its prior source unchanged.
- All existing secret SHA-256 values were preserved. The current CLI calls that
  digest field `value`; some system-secret `updated_at` timestamps refreshed during
  deployment. Verification resumed read-only after correcting those metadata checks;
  neither the secret write nor endpoint deployment was repeated.
- Public/Auth function/grant, RLS-policy and role fingerprints match the baseline.
  All three Pages deployment IDs are unchanged. Admin session boundary remained
  401 without a cookie, admin HTML 200, business root 302 to its existing application
  page, application HTML 200, and keyless Auth health boundary 401. Response bodies
  match baseline hashes. These are bounded unauthenticated checks, not a real
  member login or continuous availability/cold-start measurement.
- Outside the event window: next event `2026-10-05T22:49:57.700Z`. The bounded overdue
  outbox check returned zero before and after. No extra recurring monitor was started.

Evidence: `test-results/business-independent-disabled-20261005/`, including
`baseline.json`, `configured.json`, exact source package/downloads and
`verified-1791218285003.json` in the managed checkout. Release script is
`scripts/release-business-independent-disabled.mts`; `verify` does not redeploy.
Local tooling type checks, source-size guard and diff whitespace checks passed.

Rollback posture: the new endpoint already remains disabled and no caller/site is
connected to it. Leave its flag false; do not roll back existing function versions
or rotate existing credentials. If removal is required, first verify the exact
endpoint ID/version/hash above and the unchanged disabled flag, then remove only
that new endpoint. Keeping the false flag avoids another project-wide refresh.
Do not run an old whole-project deployment or delete evidence/account records.

Independent signup is **not live**. Remaining provider/runtime credentials,
restricted SQL qualification, real verification/reset/session checks, workspace MFA
and independent-directory privacy fulfillment still gate activation. No paid add-on,
upgrade, billing change, member Auth migration or employee permission change occurred.

## October 5: business runtime and application browser connection

Local preparation now includes `business-runtime.mts`, `business-proxy.mts`,
`business-admission.mts` and `business-pages-worker.mts`. The exact business-only
composition uses pinned provider verification, restricted SQL roles, encrypted
opaque sessions, signed registration reservation, single-use Turnstile admission
and bounded/no-retry requests. No service-role key is passed into this runtime.
The existing US business-country/legal attestation remains; an owner traveling
outside the US is not rejected solely by their IP country.

`website/build-business-identity.mts` creates a dedicated local artifact, with
shared controls and hosted provider password entry/reset. The existing application
controller supplies draft editing, atomic submission, conflict preservation,
read-only decision states and sign-out clearing. Build tests reject broad output
paths, unexpected legal configuration and accidental public secret serialization.
Coverage instruments the maintained sources in a separate synthetic browser project,
not generated JavaScript or real provider sessions.

Verification completed October 5 at 16:00:38 UTC: the clean full coverage run passed
all 17 areas at or above 90% for statements, branches, functions and lines. It ran
4,551 Jest tests (241 suites), 31 offline suites and 713 browser tests, with no
browser skips, failures or flaky retries. The business portal branch result is
90.56%; portal identity branches are 92.46%. Evidence is in
`test-results/coverage/current/run-status.json` and `areas.json` in this checkout.
Focused checks include 20 server/transport/admission tests, 16 mocked onboarding
browser journeys, two package-boundary tests and nine disabled-entrypoint tests.

The local-only `supabase/functions/business-portal-v2` entrypoint returns unavailable
before initialization unless explicitly enabled, validates the exact business
provider/project configuration, and never receives a service-role key. Native
Cloudflare/workerd testing passed with `nodejs_compat` and `enable_request_signal`;
these flags are required for its eventual Pages deployment. The isolated Supabase
Edge-runtime probe also passed: SQL driver loaded, callback 303, session and
application 200, revoked session 401, zero external requests. Its synthetic test
keys use portable WebCrypto rather than a Deno-unsupported Node private-key export.
Evidence: `test-results/business-edge-runtime-Vv3w5M/result.json`. No live database,
provider account, signup or email delivery was exercised by these runtime probes.

Fresh read-only checks at 15:34–15:35 UTC: `business-portal-v2` absent,
`BUSINESS_V2_CONFIG` absent, employee endpoint version 8 active, business Pages
`b891687f-f7a6-47b3-998d-9c74a27525fc` successful and static. Existing Cloudflare
CLI authentication was refreshed normally; no new scopes or paid services enabled.
Owner was asked separately about initially disabled business endpoint/configuration
installation because shared Supabase secret changes can refresh existing Edge
functions. Preserve existing secrets/code, check versions and health before/after,
avoid the Doji window and keep business-only rollback. No live changes yet.

Remaining launch gates: hosted runtime/configuration and exact restricted database
login; provider callback/registration/password settings; real same-email business
verification/reset/session qualification; approved-workspace MFA; independent
directory privacy fulfillment; and any necessary exact legacy account mapping.
The current application candidate hides unqualified workspace access rather than
claiming it works or reducing its MFA requirement. Ten-account/October 7 limits,
member Supabase Auth and employee permissions remain unchanged.

## October 5: business review/privacy overlay and provider readiness check

Prepared in the isolated `codex/business-onboarding` checkout, not the dirty owner
checkout. Nothing in this section is deployed or changes the live employee portal.

- `drafts/portal_identity_business_review_v1.sql` adapts five exact, fingerprinted
  existing function bodies without changing their signatures or grants. Independent
  approval requires the active business registry identity and legal agreement; no
  same-email lookup, fake Auth row or employee/member conversion is introduced.
- Registry presence is authoritative: revocation, disabled/deleted/pending state,
  realm freeze and wrong-realm mappings cannot fall through to legacy eligibility.
  Staff decisions acquire identity locks before the account lock. Existing command
  receipts, revision checks, immutable submission evidence and audits remain intact.
- Restricted privacy access returns `identity_source` and
  `provider_export_required`; WorkOS identity data is not fabricated from Auth.
  Existing correction/closure commands operate on the exact business account.
  Legacy erasure claim/finish fail closed for independent principals, including
  terminal replay: missing Supabase Auth data is not proof of WorkOS erasure.
- The rollback checks installed definitions for drift before restoring the exact
  prior functions. It freezes only business realm/enrollment/read/command gates
  and retains identities, legal evidence and decision history. Member Auth and
  employee realm flags are unchanged. This is an offline rollback, not a live one.
- `npm run test:database` passed at **2026-10-05T14:37:55.330Z**: 288 migrations,
  13 extended suites, including **51 independent-business review assertions**,
  existing legacy privacy regression, member/RLS/function-grant preservation,
  drift rejection and concurrency suites. Bounded local evidence is in
  `test-results/database/clean-room.json`; all synthetic overlays rolled back.

Authenticated, read-only WorkOS inspection after the owner's sign-in confirmed:

- Business production environment `environment_01M3T5131BPKBR7F6P2MAG6SBJ`,
  client `client_01M3T51363MDZZK6X8DB7NS32N`; its bounded first user page is empty.
- Hosted AuthKit and signup are enabled, but **Email + Password is disabled**.
  Application redirects, homepage, initiate-login, sign-out, signup, invitation
  and reset URL fields all show **Not set**. Registration and authentication
  Actions are not configured. No dashboard settings or credentials were changed.
- Live `business.dojipro.com` still serves the legacy Supabase business frontend.
  Do not enable the provider or switch the frontend before the independent
  endpoint, callback, registration guard and lifecycle qualification are ready.

Open cutover work: restricted business runtime/hosting and frontend packaging,
provider settings and registration guard, real same-email signup/recovery/session
qualification, approved-workspace MFA handling, directory-specific privacy
export/erasure, and exact legacy-account mapping if required. The existing
US-only ten-account admission and October 7 expiry are not silently extended.
Owner approved replacing the old 30-email total cap for the independent business
flow with included WorkOS verification/password-reset emails and provider rate
limits, conditional on no added cost. October 5 verification of WorkOS's official
pricing lists AuthKit free for the first one million monthly active users, with
email/password and email verification included; its default-email documentation
covers password reset. The business dashboard shows WorkOS as the enabled email
provider and verification/password-reset emails already enabled. No settings,
billing, credentials or paid add-ons were changed, and no email was sent.

Use the default provider/domain, not paid custom domains or a new paid email
service. Retain the ten-account limit, expiry and anti-abuse registration controls.
The legacy Supabase handler's cap remains unchanged until a qualified business
cutover; this approval is not permission to loosen member or employee controls.
Default provider rate limits are not equivalent to a lifetime cap, nor is published
free-tier pricing a perpetual billing guarantee. Stop if the actual configuration
requires a charge. Shared-domain delivery is best-effort, so real inbox/recovery
acceptance remains required. References:
[WorkOS pricing](https://workos.com/pricing),
[email domains](https://workos.com/docs/custom-domains/email),
[WorkOS Actions](https://workos.com/docs/authkit/actions),
[custom emails](https://workos.com/docs/authkit/custom-emails), and
[rate limits](https://workos.com/docs/reference/rate-limits).

## October 4 MDT / October 5 UTC: approved business follow-up and TypeScript migration

The owner approved the explained business identity/dependent approval/privacy
scope and requested conversion of all maintained JavaScript to TypeScript.
This supersedes the earlier approval wait for that business scope; it does not
declare business WorkOS live or authorize unrelated mobile/shared-service releases.
Member login, passwords, MFA/recovery and sessions remain on Supabase Auth.

TypeScript follow-up: all 371 originally maintained JavaScript files have now
been converted, including the portal controller, regression tests and operational
tooling. The legacy-source baseline is empty; the two retained JavaScript package/
bootstrap artifacts are compiler-generated and byte-verified. Current validation
evidence is recorded in [testing and releases](TESTING_AND_RELEASES.md#typescript-source-migration).
This completes source conversion, not the business lifecycle/cutover described below.

Local first group: twelve existing modules in `infra/portal-identity-candidate`
now use `.mts`, with separate strict, no-emit TypeScript checks. The group covers
business HTTP/browser/provider/application/session/registration, the bounded body
reader, identity verification/provider-session checks and employee admission,
setup return and request timing. Historical `.mjs` paths below describe the old
snapshot; current imports use `.mts`. No production deploy was performed.

Fresh local regression at October 5 01:41:36 UTC: 4,640 Jest tests, 25 offline
suites and 655 mocked-browser scenarios pass; 17/17 coverage areas retain all
four 90% minimums with no missing reports. Strict checking, lint and in-memory
bundling pass. This does not qualify live same-email signup/reset/deletion or
constitute a production business cutover.

Business response validation now uses the actual five application states from
the SQL constraint, including `declined` (not nonexistent `rejected`/`withdrawn`).
Encrypted session/flow payloads and provider responses are validated as unknown
data before use. TypeScript is not a replacement for authentication, MFA, CSRF,
database authorization or runtime input validation. Host-only cookies, deadlines,
atomic store/command behavior and independent identity tuples remain in place.

The business approval/privacy SQL integration, exact legacy identity mapping,
hosting/packaging, provider and same-email lifecycle qualification are still
unfinished. Do not deploy the dirty workspace or reuse dated release recipes
against changed source. Frozen historical artifacts/rollback hashes were not
rewritten to match the migration. Each surface needs a freshly reviewed artifact
and its existing deployment/rollback gates; employee and member releases remain
separate from business. See [testing and releases](TESTING_AND_RELEASES.md#typescript-source-migration).

## October 1: independent employee root login LIVE

This section supersedes prior acceptance-only/disabled statements below.

- Main URL: `https://admin.dojipro.com/`.
- Post-cutover browser verification at the root restored the existing owner
  cookie session, displayed the authorized command center and **Live updates
  connected**, and returned no captured console errors/warnings. Screenshot:
  `test-results/employee-root-20261001/live-root.png`. Connection success is not
  a claim of observing every realtime event or of notification delivery.
- Verified production deployment: `38bb97d7-0bf0-4be4-8a76-d6f132051b41`.
- Owner completed password/MFA. Authenticated acceptance showed Gavin Fahey,
  existing super-admin permissions and restricted-review access; access directory,
  business review list, community ideas and platform-health reads loaded. No
  role assignment, moderation action, business decision or announcement publication.
- Root uses the same accepted browser/application/proxy implementation, with
  dynamic imports relocated from the preview prefix. A matching styled recovery
  link opens WorkOS employee AuthKit with `prompt=login`; visible hosted reset
  form verified. No reset email was sent and no credential reset was performed.
  The completion callback still strips codes and never treats arrival as login.
- Cloudflare project configuration unchanged. Business/public Pages deployment
  IDs unchanged. No Edge redeployment, provider/billing change, database change,
  shared Worker change, mobile build or release-policy update in this root switch.
- Source hashes verified against the accepted preview; final live root HTML and
  bundle verified against the release manifest. Anonymous session request ->401,
  business-origin request ->403; no-store preserved. Preview bookmark and legacy
  setup bookmark redirect to root. Initial redirect probe observed propagation
  lag (200); subsequent bounded checks confirmed302. No redundant deployment.
- Local focused regression:47/47 transport/proxy/health/SQL/setup tests and62/62
  controller/application/resource tests passed. Includes employee-only revocation,
  session races, CSRF/origin rejection, required MFA and evidence/realtime signing
  boundaries. Live production logout/reset/evidence mutations were deliberately
  not performed on the owner's working session; those paths have offline coverage,
  not an asserted live end-to-end test.

Evidence: `test-results/employee-root-20261001/`, guarded release script
`scripts/release-employee-root.mts`. Immediate Pages rollback:
`6d01fb21-b4c7-48aa-9d2f-c3c94022ee1c`; full legacy static fallback:
`a64aeea7-63d6-431d-ab09-24bdb48db756`. Preserve the independent owner mapping and
audit records. If runtime rollback becomes necessary, use the recorded employee-only
gate procedure below after fresh state checks; do not touch member sessions.

Member app authentication remains Supabase Auth. Business independent identity
rollout remains incomplete/separate. No developer invitation has been sent: their
exact email and intended permissions are still needed.

Recovery implementation reference:
[WorkOS authorization URL](https://workos.com/docs/reference/authkit/authentication/get-authorization-url).

## October 1, 18:11 UTC: employee acceptance page live; root cutover pending

This section supersedes older disabled/no-owner-mapping statements below.

- Live acceptance URL: `https://admin.dojipro.com/identity/employee-preview/`.
- Verified admin Pages deployment: `6d01fb21-b4c7-48aa-9d2f-c3c94022ee1c`.
- Preserved root-login rollback deployment: `a64aeea7-63d6-431d-ab09-24bdb48db756`.
- Every existing static asset in that rollback deployment remains byte-identical
  in the acceptance deployment. Business/public Pages deployment IDs are unchanged.
- WorkOS accepted owner `user_01M3W4BF7Y2C1V3216DYNCJ2N3`, verified email
  `gfahey@dojipro.com`, and one TOTP factor were rechecked before binding to the
  exact existing employee UUID `ae62514b-d022-4845-9933-2d10689b5105`.
  No email-only inference, new role grant or developer invitation occurred.
  Existing Auth row hash and complete staff-permission row were verified unchanged.
- Private employee realm, session and application gates are enabled; owner binding
  used the existing audited primitives in one guarded transaction after an exact
  rolled-back hosted rehearsal. Member/public/Auth/Storage/business function and
  RLS fingerprints were unchanged. No member profile or business account was mapped.
- The new `doji_employee_portal_login` is LOGIN/NOINHERIT, connection limit 2, with
  only SET permission for `doji_employee_application` and `doji_employee_session`.
  No direct table, identity-provisioning, service-role or member-role authority.
  Real pooler TLS and both restricted roles were verified. Supabase's published
  root CA is supplied only to this connection; certificate and hostname checking
  remain on. No global trust/SSL/pooler settings changed.
- `employee-portal-v2` was deployed disabled and source-verified, then enabled
  behind its private proxy key. The gateway supplies an internal HTTP URL with
  the exact project hostname and `/employee-portal-v2` prefix; that verified shape
  is accepted only after the proxy key check. Outbound traffic stays HTTPS.
- Cloudflare workerd rejected `redirect: 'error'`. A real local-runtime reproduction
  confirmed the incompatibility. The proxy now uses `manual`, rejects every 3xx,
  and never forwards redirect locations/cookies or sends credentials to another
  destination. Fixed content-free failure-stage headers contain no exception text.
- Hosted direct request -> 403; authenticated proxy without employee cookie -> 401;
  wrong browser origin -> 403. The live Pages `/api/session` checks return 401/403
  as expected. Both original and new HTML/bundles were byte-verified after release.
- Cloudflare requires equal `fail_open` for production and preview: both are now
  false on **doji-admin only**. Only production has the three employee proxy bindings.
  Node compatibility uses the existing compatibility date. `_routes.json` invokes
  the proxy only for auth/API/setup-return paths, not every static asset request.
- Focused combined Node regression: 43/43 passed before the final redirect fix;
  updated proxy suite: 12/12 passed, including no-follow/cookie rejection; local
  workerd constructor/response check passed under both tested flag sets (installed
  runtime supports August 11, not the live September 24 compatibility date).

Evidence: `test-results/employee-sql-login-20261001/`,
`test-results/employee-edge-release-20261001/`,
`test-results/employee-owner-binding-20261001/`, and
`test-results/employee-preview-20261001/`. Credentials remain only in protected,
Git-ignored `.artifacts/employee-runtime/` and server secret bindings, not browser
assets or these evidence records. Existing secret digests/function sources were
checked during endpoint installation. Supabase secret updates incremented version
metadata on existing functions without changing their source or credential values.

Rollback: restore the exact prior Pages deployment above; turn off only
`EMPLOYEE_V2_ENABLED` on the new endpoint; execute the reviewed employee-only gate
rollback in `test-results/employee-owner-binding-20261001/rollback.sql` if needed.
Preserve mappings/audits rather than deleting them; the original employee Auth row
and permissions remain intact for fallback. Transport rollback can set the new SQL
role NOLOGIN/revoke its two memberships using its separately recorded rollback.
Do not overwrite later release state without fresh checks.

**Remaining:** owner enters their new WorkOS employee password and authenticator on
the live acceptance page, then authenticated capability/read/evidence/realtime and
logout acceptance, account-recovery verification, and guarded root-login cutover.
Business independent-auth rollout remains separate and incomplete. No paid feature,
billing change, new member build, shared Worker change, announcement or moderation
action was performed. Member app authentication remains Supabase Auth.

Primary references used for deployment compatibility:
[Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Supabase SSL verification](https://supabase.com/docs/guides/platform/ssl-enforcement),
[Supabase function routing](https://supabase.com/docs/guides/functions/routing),
[Cloudflare Request API](https://developers.cloudflare.com/workers/runtime-apis/request/),
[Cloudflare Pages routing](https://developers.cloudflare.com/pages/functions/routing/).

## October 1: expanded employee bridge released disabled; owner email confirmed

The owner confirmed `gfahey@dojipro.com` for the independent employee owner account.
This is not an identity binding or permission to mark an address verified. After
separate action-time approval, the owner invitation was sent as recorded below.
No developer role or owner mapping has been created.
The member app remains on Supabase Auth; its credentials, MFA and sessions are
outside the portal identity change. This is now explicit in `AGENTS.md`.

The private application bridge now covers 35 captured live application RPC
contracts plus two exact media/realtime authorization operations. Private staff
contacts, directory and role commands no longer require an Auth join for new
employees; audited idempotency, global role-change serialization and last-usable-
owner protection are retained. Durable admission keeps only keyed email/IP hashes,
with bounded attempts/cardinality, and does not use member rate-limit tables.

`scripts/release-employee-application-bridge.mts` prepared, rehearsed with rollback,
applied and verified the exact three private SQL candidates. Evidence is in
`test-results/employee-application-release-20261001/`. Public/Auth/Storage/business
function definitions and grants, RLS/table permissions, foreign keys and triggers,
plus admin/business/site deployment IDs remained unchanged. Bridge/session gates
are disabled, contacts empty, and no employee LOGIN credential exists. The initial
Cloudflare read returned 401; refreshing the existing CLI session recovered access
before rehearsal. No failed/ambiguous database application was retried.

Local integration now includes the opt-in existing-admin client connection,
same-origin Pages proxy, isolated Edge runtime, bounded aggregate/Sentry health
adapter, restricted evidence signer, and existing realtime channel signing. The
browser stores no provider tokens and never reads/writes the old Supabase session
in independent mode. Late session/MFA responses cannot reopen a locked workspace;
their newly installed cookies are sent through the queued logout. Commands are
serialized against the durable session lease and are not automatically replayed.
Existing forms, components, drawer workflows and realtime reconciliation are reused.
`DOJI_ADMIN_INDEPENDENT_EMPLOYEE=true` is local opt-in only, not enabled live.

Validation: 39 real local Postgres checks pass, all fixtures rolled back; 143 focused
Node tests pass across application, transport, HTTP, provider, resources, health,
browser/client integration and setup-return behavior. The isolated admin QA artifact
build succeeds. The existing Edge runtime probe previously passed its mocked
negative paths with networking disabled; that is not successful hosted login or
real restricted-pooler qualification. Earlier 207-test counts below describe a
different historical suite and must not be added to this focused result.

Read-only WorkOS inspection confirms employee signup disabled, MFA Required and
impersonation disabled. After explicit approval, the exact employee return URL
`https://admin.dojipro.com/identity/setup-complete` was configured and verified in
the employee WorkOS application. The static landing page is live in admin Pages
deployment `a64aeea7-63d6-431d-ab09-24bdb48db756`; all existing login/app assets
remain byte-identical. Business and public-site deployments did not change.
Evidence: `test-results/employee-setup-page-20261001/`. Rollback deployment is
`b95ceb19-9515-4e72-a7dc-9f9e665d8f1b`. Cloudflare merges Referrer-Policy headers;
the final recognized value is verified as `no-referrer` per the W3C algorithm.
The return page is only an invitation/setup landing page: it discards
provider query codes, grants no session or role, and does not claim verification.
The owner must choose their own password and enroll MFA; exact provider subject
and verified email must be checked before the operator-only mapping is granted.
WorkOS permits a non-organization invitation to be accepted with another email,
so invitation delivery alone is not sufficient owner-identity evidence.

At 2026-10-01T16:21:55Z, `scripts/invite-employee-owner.mts --send` checked for an
existing exact-email invitation, then sent one AuthKit employee invitation to
`gfahey@dojipro.com`. A fresh GET verified invitation
`invitation_01M3W4BF8X88E8YCNC7XDYWPDG` as pending, expiring October 8 at 16:21 UTC,
with no accepted subject yet. The acceptance origin matches the employee Hosted UI
`https://fascinating-horizon-61.authkit.app`. Evidence is token-free in
`test-results/employee-owner-invitation-20261001/`. Provider acceptance is verified;
inbox delivery and account setup are not yet verified. The owner must complete
their own password/authenticator setup. No invitation was sent to a developer.

Owner-reported invitation failure follow-up: the production employee Methods UI
showed Email + Password disabled and Enterprise SSO enabled. The earlier setup
checks missed that method gate. After explicit owner confirmation, Email + Password
was enabled with the WorkOS Strong policy (minimum 10 characters, complexity score
at least 3, breached-password rejection). Features were rechecked: MFA Required,
public Sign-up Disabled, impersonation Disabled. No SSO connection or paid add-on
was created, and no business/member setting changed. The original invitation email
now reaches Continue with email, name details, then the password-creation page for
gfahey@dojipro.com. Browser handoff is at that empty password field; the owner must
complete credentials and MFA themselves. This verifies the corrected password
route, not completion of setup or the root cause of the separate SSO 404.

At 2026-10-01T16:37:07Z, after the owner reported completion, bounded WorkOS GETs
verified that the exact invitation is accepted by subject
`user_01M3W4BF7Y2C1V3216DYNCJ2N3`, whose email is exactly gfahey@dojipro.com and
email_verified is true. One TOTP factor is listed. This is account/enrollment
evidence, not proof of a new portal session or capability access. The check saves
only safe fields in the existing invitation evidence folder; no factor secret,
password, token or provider session was printed or persisted. No owner database
mapping or live portal cutover has occurred.

Sentry read-only setup inspection found the existing internal integration
`Doji Admin Health Read` (`doji-admin-health-read-524d26`) with only Issue & Event
Read permission; all other displayed scopes and webhooks are off. Its token table
currently shows no authentication tokens. No secret was rotated or revealed and
no integration/token was created. A narrowly scoped new token for the employee
server requires action-time approval before use; shared Worker monitoring is
unchanged and its credential value is not recoverable through the Cloudflare API.

Owner subsequently approved the Sentry token. One New Token action was performed
in the existing integration with only Issue & Event Read enabled; the one-time
generated-token dialog appeared. No integration permission, alert, issue, billing
or shared Worker setting changed. The token was copied through the browser into
a masked input on the owner/SYSTEM-only, Git-ignored loopback receiver at
127.0.0.1:4197 (`scripts/capture-employee-monitoring.mts`). Chrome then blocked
automation because another extension UI was open before Save locally could finish.
A filesystem existence check confirmed monitoring.json was NOT saved. No second
token was created. User must dismiss the extension UI and complete the pending
local save (receiver expires after ten minutes), or allow browser work to resume.
Do not print, paste into chat, or regenerate the pending token. The portal cutover
remains unperformed; credential/API read verification remains pending.

Handoff recovery: Chrome temporary tabs did not remain visible to the owner. The
receiver was subsequently reopened in the in-app browser; native POST navigation
did not complete its save. The helper now uses a nonce-protected same-origin fetch
with explicit success/error feedback on port 4198, retaining Host/Origin/CSRF,
size limits, owner/SYSTEM-only ACLs and exclusive-file creation. A separate
--self-test receiver on 4196 accepts ONLY a fixed non-secret sentinel and saves to
test-results; its actual browser submit displayed Saved securely and the file
exists. No production monitoring.json exists. The one-time token observation was
cleared before the failed save was confirmed, so the existing token could not be
recovered. Sentry displays one unused event:read token ending 6d27, created Oct 1
at 10:45 AM. Revoking that exact unused token and creating a replacement requires
owner confirmation; no replacement/revocation was performed in this recovery.
Never use an unrelated clipboard value as a credential. Existing production
monitoring and member authentication remain unchanged.

After the owner's explicit replacement approval, the unused token ending 6d27
was revoked and the same integration created one replacement ending aae2, with
only event:read. A fresh in-app receiver tab successfully displayed Saved securely;
the protected monitoring.json exists, is Git-ignored, and has only owner/SYSTEM
ACL entries. A single bounded GET to the organization's issues endpoint returned
HTTP 200 with a valid array (production, 24 hours, react-native filter, limit 1).
It returned zero matching unresolved issues; that is credential/read validation,
not proof of zero incidents or live portal health integration. The one-time token
was not printed; temporary token observations were cleared after verification.
No billing, alert, issue, Worker, account or session settings changed. The old
unused token cannot be recovered; the approved replacement is now saved.

Remaining deployment gates: restricted hosted SQL login/configuration and real
connection check; exact Edge packaging/hosted probes; wiring the now-verified
Sentry read credential into the new endpoint with the existing project restriction
(the shared Worker and its credential remain unchanged);
complete employee invitation/recovery handling; exact owner mapping and hosted
MFA/capability/evidence/realtime/logout acceptance; guarded Pages cutover and rollback.
Independent business lifecycle/application/privacy integration is also unfinished.
**Neither portal has switched to WorkOS.** Do not call the whole separation live.
No paid feature, public announcement, moderation decision or member change occurred.

Provider references: [WorkOS invitations](https://workos.com/docs/authkit/invitations)
and [password reset](https://workos.com/docs/reference/authkit/password-reset).

## October 1: approved nine staff references migrated and verified

The owner's explicit approval authorized the shared staff-reference change and
verified portal cutover. The nine references listed below now point to
`portal_identity_private.staff_actors`, preserving their original actor UUIDs and
ON DELETE actions. No historical case/audit row was rewritten. This supersedes
the earlier “approval requested / no foreign key changed” statements.

The private attribution registry distinguishes legacy Auth-backed actors from
explicitly mapped independent employee principals. Seven tightly scoped triggers
maintain compatibility with existing legacy portal writes; they create attribution
only, never accounts or roles. New employees can be prepared without Auth/member
rows through a private operator-only function; neither browsers nor the resolver
can call that provisioning function. No external employee has been provisioned yet.

Twenty-one offline real-Postgres checks passed, plus the full existing moderation,
idempotent receipt, appeal, quarantine/clearance and member-deletion regression with
a new employee UUID having no Auth or member account. Every fixture transaction
rolled back in the network-disabled synthetic container. The production migration
was rehearsed and rolled back, then applied atomically with short timeouts, an
event-window gate and catalog/history drift guards. Post-commit verification proved
nine validated replacement FKs, seven compatibility triggers, unchanged unrelated
FKs, existing public/Auth/Storage/business functions, policies, permissions and
triggers, and unchanged admin/business/site deployment IDs.

Exact release evidence: `test-results/portal-employee-actors-20261001/`;
runner: `scripts/release-portal-employee-actors.mts`. The rollback freezes external
employee identity/session access while retaining attribution and legacy portal
compatibility. Do not blindly restore Auth-only FKs after independent employees
have created history. Retain old employee Auth rows during rollout.

**Independent login is still disabled, not live.** The employee command/media/
realtime adapter, restricted hosted runtime, portal client integration and hosted
owner acceptance remain necessary. Member login, passwords and sessions were not
changed. No paid feature, invitation, announcement or moderation action was used.

The following local work is also complete but **not deployed**:
`portal_identity_employee_rpc_v1.sql` and `employee-application-adapter.mjs` now
connect verified employee identity to eight fixed existing session/case/queue and
moderation operations in one authorized transaction. The private bridge defaults
off, locks identity and staff authorization through execution, and preserves the
original atomic command/audit/idempotency checks. Its transport role cannot call
member functions or read member tables. It creates no Auth JWT or shadow account.
The bridge supplies only a server-resolved employee context to existing RPCs and
restores every legacy/current claim setting on success and error. Function-level
SET of custom claims was rejected by the managed non-superuser role in local
testing; explicit bounded restoration works without changing parameter privileges.
The actual `auth.jwt()` legacy singular claim fallback is included in that cleanup.

Twenty real-Postgres bridge checks pass (all fixtures rolled back), including
case/queue reads, duplicate claims/decisions, reopen/reclose, member appeal and
staff reversal, restricted-case denial, MFA/audience validation, disabled staff,
exact-session revocation, caller-context restoration and disabled rollback.
Sixteen new adapter tests bring the combined offline identity/transport suite to
**207 passing tests**. The existing staff directory and role-change functions still
join `auth.users`; those, the other portal routes, evidence signing, realtime and
account lifecycle are not yet adapted. Do not expose a partial portal or describe
these local tests as hosted login acceptance.

## October 1: private production foundation installed; login cutover still incomplete

The additive private identity registry and separate employee/business session stores
are now installed in production, **disabled and empty**. This supersedes earlier
statements below that no database migration has occurred. No realm is configured,
no LOGIN credential or authenticator membership was created, and neither portal's
login has changed. The WorkOS production credentials remain locally disabled.

`scripts/release-portal-identity-foundation.mts` captured the existing deployment
IDs and a fingerprint of public/Auth/Storage/business function definitions and
grants, RLS policies and table permissions. The exact installation was rehearsed
inside a production transaction that rolled back, then applied with short lock and
statement limits, an advisory deployment lock, contract-drift checks and an event-
window guard. Post-commit verification found the fingerprint and all three Pages
deployments unchanged. Evidence and exact SQL are in
`test-results/portal-identity-foundation-20261001/`; existing freeze rollback files
retain identity/audit records and invalidate session generations without touching
member sessions. An expired Cloudflare CLI token was refreshed by the existing
CLI login; no new login, billing change or service was required.

Local implementation now also includes `employee-http.mjs`, an independent
employee session-store adapter/schema and `restricted-sql.mjs`. The controller
binds required TOTP to a browser cookie and CSRF proof, durably consumes the flow
once, encrypts provider tokens server-side, reauthorizes requests, retains the
original MFA deadline on refresh and deletes local access before remote logout.
The fixed-query executor rejects arbitrary SQL/roles and privileged connections,
requires verified TLS and uses short, separately committed transactions. It is
not yet connected to a hosted driver, provisioned SQL login or deployed endpoint.

Verification this turn: **191 offline identity/transport tests pass**, including
27 employee HTTP/store-boundary checks and 16 restricted-SQL checks. **12 separate
real-Postgres employee-session checks pass** in the network-disabled synthetic
container, covering concurrent flow consumption, session leases, logout fencing,
expiry, capacity, privilege boundaries and rollback. Only that run's temporary
database and role were removed; the restored baseline was retained. These tests
do not establish hosted employee sign-in or portal feature acceptance.

A bounded production catalog read identified nine staff foreign keys across seven
tables still referencing `auth.users`: `admin_employees.id`,
`admin_employee_access_events.actor_id`, `admin_employee_command_receipts.user_id`,
`admin_audit_log.actor_id`, both assignment/resolution columns in
`admin_report_triage`, both deciding/reversing columns in `moderation_decisions`,
and `moderation_appeals.reviewed_by`. Member profile, age-assurance, legal-acceptance
and announcement-receipt Auth references are outside that migration. The standing
repository rules require a separately explained/approved shared-system change;
the owner has now been asked to approve that scoped staff-reference migration and
verified cutover. **No such foreign key has been changed.** Preserve historical
actor attribution and existing member-account deletion behavior; never create
shadow Auth/member accounts or infer identity bindings from matching email.

Remaining work is substantive: the staff-reference migration, employee command/
media/realtime authorization, independent account lifecycle, restricted hosted
connection/runtime, existing portal-client integration, admission controls,
explicit owner mapping and hosted acceptance. Do not call the rollout complete or
invite an unspecified developer; their exact email and authorized role remain
unknown. No paid add-on, SSO connection, billing change, member login/session change,
announcement, moderation action or public identity cutover occurred this turn.

## October 1: approved production-directory and credential setup completed

The owner's action-time **Approved** reply authorized the pending directory and
server-key creation. The original browser workflow succeeded; no alternate API or
staging substitution was used to bypass the earlier block. This section supersedes
the September 30 production-blocker and pending-confirmation notes below.

| Realm | Production environment | Client/audience |
| --- | --- | --- |
| Employee | `environment_01M3VE4WMDRZ1VBVS5MNVVF19J` (Doji Employee Production, newly created) | `client_01M3VE4WTBYS2XN6NZPH9EDMQD` |
| Business | `environment_01M3T5131BPKBR7F6P2MAG6SBJ` (existing Production directory) | `client_01M3T51363MDZZK6X8DB7NS32N` |

One server API key was created in each directory after checking that it had no
active key. Names: **Doji Employee Portal Server** and **Doji Business Portal Server**.
Secrets were not printed, committed, placed in browser application code or sent to
another service. They are in `.artifacts/workos-production/credentials.json`, Git
ignored, with inherited filesystem access limited to the owner and SYSTEM. The
configuration is explicitly `productionOnly: true`, `enabled: false`.

Direct browser-runtime writing was denied by the protected folder ACL. A one-time,
loopback-only native form saver wrote the approved secrets under the owner's file
permissions instead; the agent completed it without asking the owner to re-enter
keys. The saver enforced Host/Origin/CSRF, bounded input, exact directory metadata,
distinct keys and one save per realm. It made no provider requests. It was stopped
after both saves, and the listener was verified absent. No key needs to be recreated.

`node scripts/check-workos-production-directories.mts --read-production` passed
four bounded read-only checks (one users page of size one and public JWKS per
directory). Both returned zero users on that page and one public signing key;
no users, sessions, verification emails or invitations were created by the check.
It does not prove a production sign-in, password reset or deployed portal integration.

Employee production public signup is now **disabled**, MFA is **Required**, and
impersonation remains disabled. The MFA control applies to non-SSO users; the
candidate employee transport supports password/TOTP only, not an SSO bypass.
Both production JWT templates now contain only their own exact client ID as `aud`;
saved values were verified after reload. Issued production tokens are not yet
qualified because no production test account/session was created. Business MFA
and signup settings were not changed. Its pre-existing hosted signup setting was
observed enabled; registration admission/action wiring remains a launch gate.

No paid add-on, SSO connection, Directory Sync, custom domain, billing setting,
member auth setting, database migration or portal deployment was enabled/changed.
These actions do not establish a provider-wide hard billing cap or certify other
pre-existing account usage. The member, admin and business portals still use their
previous live login paths; **the independent-account cutover is not complete**.
Durable employee HTTP/session orchestration, employee command/media/realtime
authorization, actor/FK migration, restricted hosted executor, account lifecycle
adapters and hosted acceptance remain implementation/release gates. Credentials
and directory provisioning are no longer the blocker. Developer email/role is
still unknown; no employee invitation or permission assignment was invented.

Non-secret UI evidence: `.artifacts/workos-employee-production-created.png`,
`.artifacts/workos-production-credentials-saved.png`, and
`.artifacts/workos-employee-production-secured.png`.

As of September 30, the owner has authorized completing and deploying independent
portal identities subject to **no new costs**. The owner personally saved WorkOS
billing details; that is not authorization to incur charges. Production Auth,
portal entry points and member sessions remain unchanged. The live system still has one Supabase Auth directory; separate roles
do **not** satisfy the new same-email, independent-account requirement.

### September 30 follow-up: employee provider implementation

The unmounted `infra/portal-identity-candidate/workos-employee-provider.mjs` now
implements the documented password-to-required-TOTP flow, TOTP enrollment/challenge,
signed-token and active-session verification, refresh and exact-session revocation.
Pending state and MFA receipts use separate AES-GCM purposes bound to the employee
origin/client. Only a successful TOTP grant followed by signature, subject and live
session verification can produce a receipt. Password-only success is rejected as
configuration drift. Refresh preserves the original session and MFA deadline.
No password or OTP is persisted; browser/session controllers must not expose provider
tokens or receipts. The enrollment secret belongs only in the bound setup UI.

This is a provider adapter, **not a deployed login or complete durable login flow**.
Its sealed receipt survives process restart, but durable browser-bound flow consumption,
session storage/leases, employee authorization, recovery and hosted routing remain
unimplemented for employees. The business store must not be reused across directories
without separate scope/role qualification. No member, portal deployment, live database,
WorkOS production setting or billing setting changed in this increment.

Verification: 32 new offline employee-provider tests; 148 combined verifier, session
reader, business HTTP and employee-provider tests pass. The optional
`scripts/test-workos-staging-mfa.mts --run-staging --employee-adapter` run passed
17 hosted staging checks in 38 authenticated requests. Sanitized evidence:
`.artifacts/workos-staging/mfa-1790826704136.json`. All created synthetic sessions
were revoked; synthetic users are retained. This run qualified the adapter's existing
factor login/refresh/receipt path; its new-factor enrollment branch is still only
fixture-tested (the earlier harness separately qualified the real enrollment API).
Two preceding runs stopped safely because the harness reused a previously accepted
TOTP in another login. The final run waited one bounded interval for a fresh code;
no verification was weakened and failed-run synthetic sessions were revoked.

The owner has reaffirmed proceeding after free-tier research. Chrome currently has
the empty `Doji Employee Production` creation dialog prepared, not submitted.
An action-time confirmation for the production directory and separate server-only
employee/business keys is pending; no keys or environment were created this turn.
This confirmation does not replace the remaining runtime/authorization/deployment work.
The new developer's exact email and permitted role are still needed before invitation.

API contracts checked against [WorkOS authentication](https://workos.com/docs/reference/authkit/authentication),
[MFA errors](https://workos.com/docs/reference/authkit/authentication-errors) and
[TOTP enrollment](https://workos.com/docs/reference/authkit/mfa).

### Current production blocker (September 30)

WorkOS production is accessible, but the attempted creation of a separate empty
`Doji Employee Production` environment was blocked by the tool's cost-safety
review. No environment creation was confirmed; do not retry through an alternate
API or use staging for real employee traffic. WorkOS documents basic AuthKit as
free below one million MAUs, with paid enterprise connections and other add-ons;
no hard spending cap was verified. The owner must resolve that exact production
action before it proceeds. Sources:
https://workos.com/docs/authkit/environments and https://workos.com/pricing.

No production key was created, no employee was invited and no portal identity
cutover was performed. Employee runtime/RPC/media/realtime adapters and actor-FK
migration are still implementation gates, not just dashboard configuration.
The new developer's email and permitted employee role have not been provided;
never infer administrator or moderation authority from the title developer.

The safe local follow-up replaced the session reader's potentially unbounded
response cancellation with the existing bounded-body helper. Both stalled-stream
and stalled-cancellation regressions pass: 33 session-reader tests plus 38 verifier
tests (71 total). This code is still unmounted; these are not live-login results.

## Required outcome

The same email may independently own a member, employee and business account.
Passwords, recovery, verification, MFA, sessions, email changes and account closure
must be scoped to the selected directory. Email is a contact attribute, never a
cross-directory identity join or permission grant. Product data stays in Postgres.
Employee MFA remains mandatory. Existing business workspace MFA is not removed.

## What this preparation implements

- `docs/drafts/portal_identity_registry_v1.sql`: additive private realm/subject-to-UUID
  mappings, pending/active/disabled/deleted states, scoped session revocation and
  operator audit. No provider rows are seeded. Member UUIDs and wrong-realm legacy
  Auth identities cannot be mapped. Mapping replay preserves the original binding.
- `infra/portal-identity-candidate/verify.mjs`: an unconnected server-side verifier
  using JOSE signature validation, exact issuer/audience, pinned public keys, bounded
  token lifetime and independent provider-session evidence. Provider email/role/aal
  claims do not grant application authority. Failures and timeouts deny access.
- A non-login resolver role with no authenticator membership or credentials.
  Unexpected effective PUBLIC application/table permissions abort preparation;
  existing member grants are not weakened to make installation pass.
- A freeze rollback that disables candidate realms, revokes resolver access and
  retains mappings/audit. It does not undo a future external-provider migration.
- `docs/drafts/portal_identity_business_reads_v1.sql`: disabled, server-only
  application/workspace reads that resolve the business identity and read its
  authorized data in one transaction. The application read reuses the existing
  applicant-safe projection. Workspace reads retain approval, active organization
  and MFA requirements; campaigns and billing remain off. No Auth row is created.
  The companion rollback freezes these two reads without deleting business data.

- `docs/drafts/portal_identity_business_commands_v1.sql`: disabled, resolver-only
  save/submit adapter. It resolves the fixed business identity, requires an existing
  signup agreement and locks its business account before using the atomic command.
  It extracts the reviewed legacy command body into one private core, changing only
  actor acquisition. The legacy wrapper retains its Auth checks and grants. A source
  hash rejects unknown command bodies. No resolver can call the raw UUID-based core.
  The rollback restores the exact saved legacy definition only if it has not drifted.

The local candidate also includes `workos-session.mjs`, a bounded provider user/session
reader called only after signature verification. It checks the exact active session
and verified email, and requires a trusted session-bound MFA receipt for employees.
It reads at most ten sessions, failing closed if the session is absent. Durable MFA
receipts and their login/challenge lifecycle are not implemented; the hosted harness
uses an in-memory receipt from its own successful TOTP grant, not browser claims.

`portal_identity_business_enrollment_v1.sql` adds a disabled, registrar-only completion
transaction after identity verification: a generated business UUID, exact current
terms/privacy agreement, account and idempotent receipt. Email is not an argument
or identity join. An expiry and lifetime cap constrain new completions. These are
not a substitute for provider signup/mail admission reservations or anti-abuse.
Its rollback freezes entry without deleting agreements, accounts or attribution.

The candidate now includes an **unmounted** business HTTP handler, server-only
WorkOS adapter, browser transport and fixed SQL application adapter in
`infra/portal-identity-candidate/`. Authorization-code login uses browser-bound
single-use state, S256 PKCE and an exact callback. Provider credentials/tokens stay
server-side; the browser receives a host-only Secure/HttpOnly cookie and CSRF value.
Flow/session payloads are encrypted with an origin/client-bound server key. Reads
and commands recheck identity and application authority; logout removes local
access before attempting remote revocation. Input/upstream body reads are bounded
by size and abort, including streams whose cancellation never settles.

The browser transport passes tests with the existing application controller:
restore, read, edit, submit, stale revision and logout. It is **not imported by the
deployed portal**, and no hosted browser signup/callback has been exercised.
The HTTP handler now connects to a local PostgreSQL session-store candidate:
`business-session-store.mjs` and `docs/drafts/business_session_store_v1.sql`.
It stores only hashed browser handles and encrypted envelopes, caps flows/sessions
at 100 each by default, and enforces server-owned expiry. A matching flow is
consumed by one conditional-delete winner. A session operation gets a 30-second
lease; another instance fails promptly with a retryable conflict rather than
polling. Each database call commits separately, so no transaction remains open
while WorkOS responds. An expired lease deletes the uncertain session and requires
fresh sign-in; it is never handed to another refresh request. Logout deletion is
durable and fenced against later writes. Ordinary input/revision errors retain
the session; uncertain processing errors discard it. The rollback disables access,
rotates a generation identifier and prevents retained sessions returning on re-enable.

`business-registration-action.mjs` and `business_registration_gate_v1.sql` add a
separate default-off WorkOS registration gate. It verifies the exact raw-body HMAC,
requires a timestamp within 30 seconds, and reserves a bounded lifetime slot in one
atomic transaction. Identical action retries reuse the receipt; changed-payload
replays are denied. The initial limit is ten, with an operator-set expiry required.
Only action-ID hashes and keyed payload digests are retained, not requester emails
or IPs. The new role has only the reservation function, not session-store access.
This gate is **not configured in WorkOS or mounted on a hosted endpoint**. Provider
error behavior must be Deny, and each environment must have its own Actions secret.
It does not yet control verification/reset mail or bind a provider signup to the
portal CAPTCHA. Portal legal consent still precedes application enrollment.

Seventeen focused checks passed against a disposable local database, covering
fresh handler instances, real competing SQL connections, expiry/capacity, logout,
rollback, signed registration requests, replay/capacity and role boundaries. The
existing function definitions/grants fingerprint remained unchanged. Provider
exchange and identity verification were fixtures for this check, not real hosted
browser login. Only the new local boundary was checked; broad suites were not rerun.
The temporary database and its two test roles were removed; the restored baseline
was retained. No network-enabled database, hosted account, provider configuration,
email, production database or billing change occurred.

The restricted production SQL executor/connection, full admission/mail controls
and hosted endpoint/browser integration remain unfinished. Function-local timeout
settings are not a substitute for executor-enforced transaction/statement deadlines;
the local harness sets them before each short transaction. No production endpoint,
account provisioning, token minting or portal cutover was deployed. This is **not
completed account separation**.

The protocol follows the documented
[WorkOS authorization parameters](https://workos.com/docs/reference/authkit/authentication/get-authorization-url),
[authentication grants](https://workos.com/docs/reference/authkit/authentication)
and [OWASP OAuth guidance](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html).
AuthKit `screen_hint` is navigation, not signup authorization: direct provider
registration requires the provider gate and mail admission enforcement before
launch. The candidate follows [WorkOS Actions](https://workos.com/docs/authkit/actions)
and its official [payload definitions](https://github.com/workos/workos-node/blob/main/src/actions/interfaces/action.interface.ts).
Hosted callback compatibility remains to be verified; local signatures alone do
not prove the provider has installed or exercised the hook.

Resolution locks the realm, mapping and principal before a separate revocation
read, and requires READ COMMITTED isolation. The local command bridge must
resolve the identity and execute its exact authorized command in the same database
transaction. Resolving first and later invoking a generic privileged RPC is not an
acceptable substitute. Fourteen local multi-connection/isolation checks now pass
for mapping, reads, duplicate saves/submissions and command/revocation ordering.
Provider webhook, recovery and hosted-session races still need their own tests.

## Existing dependencies that still need migration

| Boundary                       | Current dependency                                                        | Required cutover work                                                                      |
| ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Business entry                 | `claim_public_business_auth_v1` searches the shared Auth directory        | Replace admission with its own directory; never block on a matching member email           |
| Business application/workspace | `business_private.business_actor`, approval checks and Auth metadata      | Exact external identity to stable business principal; retain membership/state/MFA checks   |
| Business legal/privacy         | Signup agreement trigger, privacy target/export and Auth erasure executor | Directory-specific verification and deletion; preserve consent and audit history           |
| Employee access                | `auth.uid()`, employee Auth role/AAL2 and active staff permission checks  | Verified employee identity plus existing staff permissions; preserve last-owner protection |
| Historical actors              | Auth foreign keys and employee/audit references                           | Preserve stable UUIDs and attribution before retiring any legacy Auth row                  |
| Member app                     | Existing Supabase Auth, profile and member RPCs                           | Keep unchanged; do not accept portal tokens or depend on portal providers                  |

Relevant existing sources are `docs/drafts/business_applications_v1.sql`,
`business_auth_v1.sql`, `business_public_admission_v1.sql`,
`business_signup_legal_v1.sql`, `business_privacy_v1.sql` and
`docs/WORKFORCE_IDENTITY_PLAN.md`. The local candidate refactors only the existing
business save/submit implementation; no production contract has changed.

## Provider and zero-new-cost gates

WorkOS is a researched candidate, not a selected or provisioned production service.
[Applications share a user directory](https://workos.com/docs/authkit/applications),
so separate applications alone do not deliver password/MFA independence.
[Separate environments](https://workos.com/docs/authkit/environments) require
production setup; staging is not the proposed home for real users. Published free
allowances do not establish a hard no-spend guarantee. Billing activation and any
production directory availability need verification and separate owner approval.

Owner sign-in was verified. The original **Staging** environment
(`environment_01M3T51295MF7KN0PSYACY5AQN`) remains available for business tests.
**Doji Employee Staging** was created with **Non-production** selected and verified
at `environment_01M3T5GJ8PRV7JJB3P9CPXRNHF`. No payment details or production
activation were submitted. The owner approved staging API-key use and supplied
distinct keys in a Git-ignored configuration restricted to the Windows owner.
The local browser handoff was unsuccessful and is stopped; the owner completed
the file directly. Keys must never appear in logs, commits or release evidence.

Hosted synthetic qualification now passes **13 checks** with
`scripts/test-workos-staging-isolation.mts --run-staging`. Evidence is retained
locally in `.artifacts/workos-staging/isolation-1790811612652.json` without secrets.
The same synthetic email created distinct users; cross-directory reads and
passwords were rejected. Business refresh worked; business password reset rejected
the old password and refresh session, accepted the new password, rejected
cross-directory use and replay of the reset token, and left the employee password
and existing refresh session working. The successful run made 24 authenticated
requests plus two public JWKS reads. Returned test sessions were revoked. One
earlier issuer-failure fixture session was separately revoked and verified to have
zero active sessions remaining. Synthetic users are retained; no real member,
employee or business accounts were changed.

These are provider API tests, not portal browser acceptance. Test users were
preverified and used `doji-isolation.test`; WorkOS suppresses email to reserved
`.test` domains. Earlier `example.com` fixtures hit WorkOS's built-in Test SSO
scenario; that policy was not disabled. No live account migration, billing setup,
SSO configuration or production activation occurred.

The observed, signature-verified staging tokens use the exact issuer
`https://api.workos.com/user_management/<clientId>` for their respective clients.
Initially both carried the matching `client_id`, but neither carried `aud`, `amr` or `aal`.
Both staging JWT templates now have their own exact client ID as `aud`; newly issued
tokens passed the strict verifier. They still do not carry `amr` or `aal`.
This client-scoped issuer is also documented in the
[Node SDK issuer configuration](https://workos.com/docs/sdks/node).
This candidate deliberately requires an exact audience and separately verified
session/MFA evidence. Default tokens must not be assumed compatible.
[JWT templates](https://workos.com/docs/authkit/jwt-templates) support custom claims,
and [WorkOS's API verification example](https://workos.com/blog/verify-workos-access-tokens-in-your-own-api)
explicitly sets an audience. This resolves the documentation question, not hosted
qualification by itself; the separate hosted test below verifies both templates.
The [API reference](https://workos.com/docs/reference/authkit/session-tokens)
documents HTTPS JWKS and a client identifier. Some reference examples still show
a generic issuer; the test now pins the observed client-scoped issuer rather than
accepting an arbitrary issuer. Key rotation remains a bounded, fail-closed requirement.

The [session API](https://workos.com/docs/reference/authkit/session) lists active
sessions per user; its documented fields include session status and authentication
method but do not establish a per-session MFA completion attestation. An enrolled
factor or a password authentication method is not proof that this session completed
MFA. [Hosted MFA requirements](https://workos.com/docs/authkit/mfa) also exclude SSO
users. Do not substitute a constant `true`, user metadata or mere factor enrollment.
The local provider reader now verifies exact active sessions; it is not activated
in production. The
[TOTP authentication grant](https://workos.com/docs/reference/authkit/authentication)
documents the server-mediated challenge flow tested in staging. Employee staging
MFA is now **Required**; business staging did not inherit it. Twelve hosted checks
passed: password-only employee login blocked, wrong code denied, valid TOTP grant
accepted, replay denied, repeat login challenged, cross-directory challenge denied,
independent same-email business login/factors, exact signed-token verification and
revoked-session rejection in both realms. The run used 26 bounded API requests.
Evidence: `.artifacts/workos-staging/mfa-1790812678546.json`. Synthetic users remain;
their granted sessions were revoked. No production security setting changed.
The earlier 13-check isolation run is historical qualification before mandatory
employee MFA; do not disable MFA to rerun that harness unchanged. Browser signup,
durable pending-login/MFA storage, reset and recovery races remain unqualified.

The subsequent hosted run passes **14 checks**, adding same-subject/session refresh
and exact revocation through the new server adapter. It made **27 API requests**;
evidence: `.artifacts/workos-staging/mfa-1790815999483.json`. Cleanup completed and
all granted synthetic sessions were revoked; synthetic users remain. No real user,
production setting, deliverable email, payment or billing change occurred. This
tests provider API behavior, not the authorization-code browser flow. A later
local-only stream-abort hardening change passed offline tests but was not followed
by another hosted run.

[Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase)
does not make additional paid projects free merely because MAU allowance remains.
[Free-project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
also needs consideration for an always-available admin service. The staging
environments and synthetic fixtures above are the only hosted provider resources
created by this work. No paid features, payment setup or production activation
were performed.

## Verified locally

For the local suites below, hosted upstreams were absent or stubbed. Database checks used the existing
network-disabled, synthetic restored-schema container. Most changes rolled back;
concurrency checks used a temporary clone, removed after the run along with only
the test roles created by that run. The original restored baseline was retained.

| Suite                                  | Result                                             | Limitation                                                                                                               |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| New verifier                           | 38 tests passed                                    | Real signatures; synthetic provider-session evidence                                                                     |
| New WorkOS session reader              | 33 tests passed                                    | Local edge cases including stalled streams/cancellation; hosted paths separately qualified above                          |
| New HTTP/browser/provider/SQL adapters | 45 tests passed                                    | Request/Response and existing controller integration with fake provider/store/SQL; not hosted browser or durable storage |
| New enrollment and onboarding          | 40 assertions passed                               | Atomic signup agreement, draft, submission and rollback; no browser onboarding or concurrent enrollment test             |
| New registry                           | 45 assertions plus 2 unsafe-grant rejection checks | Local schema, not hosted migration or concurrent sessions                                                                |
| New business read bridge               | 32 assertions passed                               | Synthetic businesses; no hosted login or write commands                                                                  |
| New business command bridge            | 38 assertions plus 2 drift guards passed           | Synthetic database; no hosted signup or provider credentials                                                             |
| New concurrency and isolation          | 14 checks passed                                   | Real overlapping local sessions; not provider lifecycle tests                                                            |
| Existing business foundation           | 251 assertions passed through the extracted core   | Existing local database contract suite with candidate flag                                                               |
| Existing business Auth                 | 52 checks passed                                   | Upstreams stubbed; no emails sent                                                                                        |
| Existing admin client                  | Passed                                             | Local transport/session contract tests                                                                                   |

The registry suite compares existing RPC definitions/grants, table privileges/RLS,
policies and Auth/profile row fingerprints. It exercises cross-realm denial,
mapping replay, stale revisions, local session revocation, disabled/deleted
principals and freeze rollback. It does not prove actual same-email provider signup
or password-reset independence. The synthetic database does not contain real
member data; unchanged fingerprints are not physical-device acceptance evidence.

Rerun from the repository root:

```text
node --test --test-isolation=none scripts/test-portal-identity-verifier.mts
node --test --test-isolation=none scripts/test-workos-session-reader.mts
node --test --test-isolation=none scripts/test-business-http.mts
node --test --test-isolation=none scripts/test-workos-employee-provider.mts
node scripts/check-business-durable-session.mts
node scripts/test-portal-identity-business-enrollment.mts
node scripts/test-portal-identity-registry.mts
node scripts/test-portal-identity-business-reads.mts
node scripts/test-portal-identity-business-commands.mts
node scripts/test-portal-identity-concurrency.mts
node scripts/test-business-foundation.mts --identity-candidate
node scripts/test-business-auth.mts
node website/admin-portal/live-client.test.mts
```

## Remaining implementation and release gates

1. Qualify separate production directories and hard no-new-cost controls. Implement
   durable MFA/login state and signed-event revocation handling with replay checks.
2. Mount the implemented session transport/store and registration gate through a
   restricted SQL executor and exact hosted routes. Qualify effective grants,
   deployed multi-instance behavior and actual provider callback configuration;
   add the remaining signup/CAPTCHA and verification/reset mail controls. Complete hosted authorization-code browser
   signup/confirmation/recovery tests and preserve business workspace MFA step-up.
   Complete directory-specific
   privacy adapters, then employee adapters. The post-verification signup agreement
   transaction is locally tested, not a complete hosted signup flow.
   The disabled application/workspace reads and save/submit adapter are locally tested. Preserve
   atomic receipts, permissions and audit; do not add broad service-role authority
   to a browser or the shared realtime Worker. Give any database connection only
   the reviewed role; recheck effective grants whenever its schema changes.
3. Prepare exact legacy-ID mappings and foreign-key migration/rollback. Never infer
   ownership from email or delete legacy Auth rows while references depend on them.
4. Verify three same-email accounts with controlled identities: signup/confirmation,
   login, password reset, MFA enrollment/reset, refresh/logout, email change,
   disable/delete and provider outage. Changes to one account must leave the other
   two credentials and sessions intact. Local duplicate mapping, read and command
   races pass. Test provider webhook and recovery races next.
5. Verify admin permissions, business onboarding/legal/privacy and member profile,
   feed, comments, participation, realtime and push on the actual hosted setup and
   devices before separate cutover approval. No member token or role conversion.
6. Canary business, then employee, with a verified owner recovery route. Account
   restrictions must be rechecked on each authorized command and foreground/
   reconnect reconciliation; clear protected state on denial without polling.

Shared infrastructure remains shared and carries residual risk. No mobile build,
realtime event, challenge alarm, push behavior or update policy changed here.

## Rollback boundary

The registry/read rollback supplies a candidate access freeze. Command rollback
also restores the exact prior legacy definition, refusing intervening changes.
If this drift guard raises, the entire rollback transaction is aborted, including
its freeze; an operator must review and apply a separate targeted freeze before
deciding how to reconcile the intervening command. Before any future
cutover, capture exact config/mapping revisions and confirm the prior login path
still works. Roll back only the affected portal; retain receipts and attribution.
Do not globally revoke member sessions, merge emails, reset passwords or restore
deleted accounts automatically. Password changes or deletions in another provider
cannot be undone by the registry rollback and require a separate recovery plan.

## October 5 business journey and email preparation

Business journey presentation is live (Pages `0f3f7070-ecce-4b8b-9dd0-36dbf658c978`,
verified 21:41 UTC). The release script pins the previous deployment, compares all
asset hashes, permits only five presentation changes, and verifies unchanged
runtime/config plus admin/main website IDs. The live pending applicant receipt,
submission time, activity and next step were inspected without writing a record.
The 30 independent-business browser tests passed at mobile/desktop sizes and in
both themes. No member behavior or employee authentication changed.

Owner separately approved local preparation of submission/decision email, with
deployment and sending gated. The candidate and freeze rollback are in
`docs/drafts/business_email_outbox_v1*.sql`; `scripts/test-business-email-outbox.mts`
creates/removes a labelled, network-disabled clean room. Its 30 checks cover
permission denial, disabled defaults, transactional capture/rollback, dedupe,
realm/account revocation, atomic quota reservation, ambiguous outcomes, unchanged
public/Auth function definitions and grants, RLS policies, and member table ACLs.
The message module has no network/send API and is tested independently by
`scripts/test-business-email-message.mts`.

The candidate queue contains no recipient address. A future sender must resolve
the exact subject through the pinned **business** WorkOS environment, freshly
check `email_verified`, and recheck current business eligibility before dispatch.
Never use member/employee Auth, a form field or an email-matching lookup. Email
contains a reference and a fixed sign-in link, not form details, tokens or reviewer
notes. Disabled/deleted identities are excluded; queue FKs cascade with primary
business erasure. Claimed/ambiguous sends require reconciliation, not blind retry.
The portal does not claim that mail was sent, and its receipt works without mail.

Still required before a separate email release:

- Verify the actual provider plan, remaining daily/monthly capacity and all other
  senders sharing that capacity. Configure a bounded reserved allowance that
  cannot cause overage; the SQL ceiling alone is not evidence of free capacity.
- Implement/test the dedicated sender, provider acceptance handling, cancellation,
  expired-claim reconciliation, privacy retention/export, and monitoring without
  reusing member Workers or introducing unapproved recurring database reads.
- Re-run full business/member regression and concurrency checks, capture live
  definitions/grants, approve deployment separately, then canary one owner-approved
  recipient. No backlog replay or claims of inbox delivery without evidence.
- Rollback: stop/drain the sender, disable capture/sending and revoke its entry
  functions using the candidate rollback. Retain evidence; already in-flight
  provider requests cannot be recalled. Trigger failure would roll back the
  business transaction, so fault behavior is an explicit pre-release test gate.

Research consulted October 5 (primary sources):

- [GOV.UK confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/)
  and [check answers](https://design-system.service.gov.uk/patterns/check-answers/)
  informed receipt, next-step and review patterns, adapted to existing Doji controls.
- [WorkOS user API](https://workos.com/docs/reference/authkit/user) defines the exact
  user lookup and `email_verified` field; its verification/reset emails are not
  arbitrary application-decision mail.
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
  restricts free-plan sending to account-verified destinations; that is not a
  solution for arbitrary new business recipients.
- [Resend pricing](https://resend.com/pricing) and
  [free-tier announcement](https://resend.com/blog/new-free-tier) describe a limited
  free allowance; current account capacity has not been verified or allocated here.

No email candidate has been deployed, no provider send has been attempted, and no
paid service, upgrade or new build was enabled by this work.

## October 5 local admin journey follow-through

The owner requested a cohesive employee sign-in and workspace experience as well
as Doji-owned authentication across both portals. The local admin candidate now
connects its existing credential, authenticator enrollment/challenge, restoration,
workspace and locked states with consistent headings/progress and access guidance.
It prevents duplicate form submissions, clears password/code/QR material, keeps
failed-password feedback visible, and focuses the destination workspace heading.
The mobile sign-in form is no longer below a full-height introductory panel.
Existing sensitive-draft clearing on lock is preserved and disclosed. This is UI
work only: no employee backend, WorkOS setting, database, member app or production
deployment changed.

Do not describe the whole owned-auth request as complete: employee password
recovery and invitation setup still use hosted WorkOS, and business hosted auth
is unchanged. Remaining implementation must use provider-backed password/reset,
verification and invitation APIs with separate employee/business directory keys,
fixed same-origin routes, request bounds, generic account-existence responses,
short-lived one-use state and no credential/token logging or browser persistence.
Employee invitation and mandatory MFA are not optional; business registration
must retain its current admission, agreement, verification and capacity gates.

Primary WorkOS references rechecked October 5:

- [Custom UI example](https://github.com/workos/workos-custom-ui-authkit-example)
  demonstrates using their APIs behind an owned UI; it is not a drop-in replacement
  for Doji's realm separation, admission controls or permissions.
- [Password reset API](https://workos.com/docs/reference/authkit/password-reset)
  creates one-use reset state and revokes that provider user's active sessions on
  reset. Doji's own durable-session invalidation must be verified too.
- [Email/reset URL configuration](https://workos.com/docs/authkit/custom-emails)
  documents the custom reset destination and token parameter. Do not change the
  production URL until the matching token-handling page and server endpoint are
  qualified. Do not disable included provider mail to merely change UI branding.

Release must test the same email across all three account realms, expired/replayed
links, failed/expired MFA, recovery revocation, signed-out/returning-user behavior,
permission denial, and member session survival. Keep the current working hosted
recovery path until its replacement is verified. The business-only mail queue
keeps its independent local-preparation/sending gate; no new cost is authorized.

Local validation for this admin candidate:

- Initial full admin run: 478 passed. The expanded admin/business run had 508
  passes and caught one post-MFA denial-copy regression; the auth-flow revision
  guard was corrected. The final focused auth/loading/lock/permission suite then
  passed all 37 checks, including that exact regression. Eight DOM boundary tests
  also passed after enabling their normal per-document coverage collection.
- All 30 independent-business journeys passed in the expanded run. No provider
  calls or actual account/moderation writes were made; these are mocked browser
  tests, not proof of live custom recovery/invitation behavior.
- 113 source/compiler/admin-health boundary tests passed; website and tooling
  strict typechecks, targeted lint, source-size and whitespace guards passed.
  The TypeScript inventory is clean. The existing local business mail module is
  now explicitly included in the tooling typecheck project, not excluded.
- Matching-source coverage snapshots for `auth-journey.mts`: 69/69 statements,
  55/55 lines, 13/13 functions, 37/38 branches (97.36%). This is component evidence,
  not a new full-repository 17-area coverage certification.
- Desktop and 390px light/dark sign-in screenshots were inspected; mobile sign-in
  fits in the initial 844px viewport. Automated WCAG A/AA checks on that surface
  passed. No production release or hosted recovery cutover was performed.

## October 5 MDT / October 6 UTC: business session continuity released

The reported registration-screen flash came from rendering signed-out copy before
session restoration. Access then performed a full application-page navigation,
which restored the same cookie session again. The business static artifact now
composes the maintained account/application views, hands off the exact verified
client in memory and uses history replacement to preserve the application URL.
No session is serialized to HTML, history, localStorage or sessionStorage.
Direct application entries show neutral loading until the existing server check
settles. Sign-out still clears protected fields immediately; failed application
reads stay in the business home without initiating another login. Hosted WorkOS
sign-in, callback validation, consent, CAPTCHA, MFA, commands and permissions are
unchanged. This is not the remaining custom password/reset/invitation UI cutover.

Verification: all 40 independent-business browser scenarios passed both locally
instrumented and against the exact production artifact, including delayed session
success/401/503, one session request/no second document navigation, direct entry,
read failure, logout clearing, submission/receipt, stale drafts and MFA boundaries.
Two artifact-isolation checks, strict website/tooling typechecks and targeted lint
passed. These mocked-provider tests do not replace real owner-session acceptance.

The guarded release changed only access HTML/JS and application HTML/JS. It caught
an unrelated local admin change in `portal.js`; the exact previously deployed
shared asset was retained instead. No runtime/config/legal/CSS or other site
changes were packaged. Live asset hashes, 401 anonymous session and 403 cross-portal
origin checks passed at 2026-10-06T00:22:04.613Z. No emails or member actions sent.

- Business deployment: `e8ebfc1e-2a64-464a-b252-d25b1d425afc`.
- Exact prior business deployment for rollback: `0f3f7070-ecce-4b8b-9dd0-36dbf658c978`.
- Admin remains `a4ee3e2f-80b6-4dc7-b894-9494d6303822`;
  main site remains `d352e4ed-89ec-47c4-b8e2-bfea5688acc3`.
- Bounded local evidence: `test-results/business-session-flow-20261005/`.
- Release command: `scripts/release-business-session-flow.mts`; recorded modes must
  not be rerun as a new deployment. Rollback restores only the prior business Pages
  deployment; do not change database, WorkOS, shared relay or member sessions.
