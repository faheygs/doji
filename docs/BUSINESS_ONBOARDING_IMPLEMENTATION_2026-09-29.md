# Business onboarding continuation — local candidate, not released

## September 30 — restricted privacy operator interface (local only)

The owner approved continuing the operator integration and read-only hosted
readiness checks. This increment changes portal source and local QA artifacts
and one separately approved SQL read candidate only. No service executor, Auth
configuration, member app, Worker, production database/portal, legal publication,
signup flag or provider plan was changed.

- Independent `DOJI_ADMIN_BUSINESS_PRIVACY_ENABLED=true` opt-in, false by default;
  employee mode, `operator_manage` and `legal_read` are required for the UI.
  The prepared SQL remains authoritative for actual authorization. No production
  privacy RPCs are assumed installed merely because the UI can call them.
- Six fixed staff RPC mappings, never a generic RPC client or browser Auth
  deletion/service key. Existing session/refresh/authorization fencing is reused.
- Explicitly opened 25-case queue, exact-ID right-side drawer, existing shared
  selects/forms, right-aligned CTAs, theme tokens and oldest-first 30-entry history
  pagination. No JSON blobs. New cases require verified exact business ID, request
  type, opaque evidence reference, explicit assessed deadline and confirmation.
- Read-only access-case review shows current application fields, submitted
  snapshots, signup versions and paged application history. Nothing is automatically
  exported or emailed; this is not a complete provider/support data export.
- Separate confirmed actions for account closure, account-wide hold/release,
  erasure preparation and supported completion/denial. A hold can be released only
  from its owning case. No execution/delete control is exposed. Completion wording
  requires protected evidence and accurate requester response, not a claim that
  primary erasure removed backups or all provider copies.
- Unchanged ambiguous intent reuses the same key across manual retries and drawer
  reopening, within the signed-in session only. There is no persistent retry queue
  or automatic command replay. Lock clears keys/data. Successful command plus failed
  follow-up read is reported as saved-but-unverified, never as failed mutation.
- Current-case revision/hold changes invalidate confirmation without losing notes.
  Malformed or mismatched reads fail closed. Reads coalesce through existing portal
  lifecycle signals; there is no recurring polling or new realtime producer.

### Approved exact-draft read — local preparation complete, deployment gated

`get_admin_business_application_v1` deliberately returns the last submitted
snapshot for review, not the current editable draft. The privacy case reader does
not return draft details/application revision, and the access reader is restricted
to **access** cases. Those contracts remain unchanged. Do not create a fake access
case, edit raw JSON or overwrite the draft using a submitted snapshot.

The owner explicitly approved local preparation and testing, with deployment gated.
`get_admin_business_privacy_correction_v1` is now in the local SQL candidate. It
requires an open verified correction case, employee AAL2, admin.manage + legal.read,
and exact business identity. Its bounded current application/revision response
identifies missing applications, review-locked states and prepared erasure as blocked.
It returns no Auth contact details, staff notes or other cases, and performs no writes.
Only the employee role has an explicit grant; rollback revokes that grant.

The UI explicitly loads this read, then uses the shared structured application form
and select component. Fields become editable only after selecting Save corrected
draft. The existing atomic `correct_draft` command receives both exact revisions and
a stable intent key. Prior address data and submitted snapshots remain unchanged.
Completion is separate from correction and requires fulfillment evidence; correction
history on later bounded pages also enables that separate action. Existing lifecycle
reconciliation detects newer applicant edits and preserves but disables stale inputs.
Auth contact correction/lost-MFA recovery and the service erasure operating procedure
remain separate gates. No candidate SQL was deployed to production.

### Hosted observation

Read-only HTTPS observation at 2026-09-30 14:55:57 UTC confirmed the business root
returns 200 with no signup form and CSP `connect-src 'none'`, `form-action 'none'`.
Access/application routes redirect to the closed root; both proposed business legal
routes return 404. This means public onboarding and legal publication are **not live**.
Cloudflare's saved OAuth API access returned 401; fresh authenticated deployment
metadata could not be verified. No credential refresh or configuration change was
attempted. Evidence: `test-results/business-privacy-20260930/hosted-readiness.json`.
This check is not hosted Auth/email delivery or capacity qualification. Existing
market/retention/provider-copy/coverage/legal URL and no-new-cost gates remain.

Local checks and screenshots are recorded in
`test-results/business-privacy-20260930/browser/`; the repeatable regression command
uses `website/admin-portal/playwright.privacy.config.mjs` and the isolated
`.business-admin-qa-20260930` artifact. Transport checks are in
`website/admin-portal/live-client.test.mts`. Deploy nothing from this QA artifact.

Verified local results for this increment:
- 250 rollback-only database assertions, including narrow role/MFA grants, exact
  business identity, read-only correction behavior and unchanged member permissions.
- 15 true-overlap concurrency scenarios, including applicant edits racing staff
  corrections and duplicate corrections producing one committed result.
- 30 local real Auth/PostgREST workflow checks, including employee MFA, correction
  read/write/replay, unchanged submitted snapshots and surviving member sessions.
- 121 mocked browser regressions across privacy, business review, employee access,
  moderation and editorial flows; all passed. Privacy includes six light/dark
  mobile/desktop accessibility checks and reviewed screenshots. Browser mocks do
  not prove hosted service behavior or production capacity.
- Caller-JWT transport tests and JavaScript syntax checks passed. A final queue
  spacing-only adjustment was followed by the six privacy accessibility checks.

Evidence: `test-results/business-foundation-20260929/database-result.json`,
`concurrency-result.json` in the same directory, and
`test-results/business-auth-20260929/result.json`. The unlinked synthetic Auth stack
was stopped with volumes preserved. No hosted business registration, real requester
case, production correction, erasure, email, deployment or new cost was triggered.

## September 30 — approved agreement and privacy implementation

Owner approved LOCAL preparation/testing, not deployment or public signup. The
closed hosted page remains unchanged. No real data was erased, email sent,
production Auth configuration changed, or paid service enabled.

Implemented candidate:

- Signup uses the existing themed consent-row components, separate unchecked
  terms/notice fields, exact version payloads and a fail-closed legal precheck.
  `business_signup_legal_v1.sql` records versions and server time in a private
  immutable-through-API ledger. A deferred business-role-only constraint covers
  Auth's actual INSERT → role UPDATE → metadata UPDATE creation transaction.
  The real Auth test found and corrected the earlier insert-only timing gap.
  Missing/stale agreement aborts creation; no fabricated legacy backfill.
- New application forms omit street address; complete server validation requires
  the other eight fields. Historical submitted addresses remain readable and
  unchanged. Draft correction never overwrites a submitted snapshot or its consent.
- `business_privacy_v1.sql` adds default-off restricted request, case/history,
  access-export, correction, closure, hold and erasure contracts. No public
  endpoint, privacy admin screen, scheduler or automatic retention deletion is
  included. Staff commands require real employee AAL2, admin.manage and legal.read.
  Queue pages are 25, history pages 30; submission history is capped at 50 by the
  existing foundation. Reads use exact identity or keyset cursors, never Auth scans.
- Account closure/erasure preparation disables business access and suspends its
  organization. Existing issued JWTs cannot bypass business RPC identity checks.
  No global logout or member session revocation is used.
- An approved, unheld exact erasure case grants one execution ID one Auth DELETE
  attempt. The internal `executeBusinessErasure` primitive is not an HTTP endpoint.
  A retry may check Auth absence and finish cleanup, but cannot blindly repeat an
  ambiguous deletion. A different execution ID cannot take over the case.
- Primary cleanup empties application/submission content, review responses/notes,
  related business-application audit reasons, memberships and legacy email limiter/
  allowlist copies. Auth must be confirmed absent first. Minimal opaque IDs,
  agreement versions/timestamps, decisions, audit references and retry receipts
  remain restricted; these are pseudonymous, not asserted anonymous. No blanket
  claim that all personal information or provider/security logs are erased.
- Holds are account-wide, serialize against preparation/execution, and can only be
  released from the case that owns the current hold. A hold cannot be silently
  replaced through another case. Once Auth execution starts, a late hold request
  reports an immediate escalation condition rather than falsely promising reversal.
- Changed application revisions reuse existing no-push identifier events when
  realtime is enabled; it remains off. Existing manual/foreground/reconnect
  reconciliation applies. Privacy operations use explicit operator reads only.

### Qualification evidence

September 30 local checks: 231 offline PostgreSQL assertions, 13 overlapping
concurrency scenarios, 48 stubbed Auth checks, 13 stubbed erasure orchestration
checks, 26 client-state checks, 37 realtime contracts, 41 browser scenarios, and
29 real localhost Auth/PostgREST workflow checks, plus 10 local artifact checks.
The two changed internal TypeScript modules also pass targeted typechecking.
Browser screenshots reviewed
in mobile dark and desktop light themes; existing components and right CTAs used.
No hosted provider-delivery or public-signup claim follows from these tests.

Evidence: `test-results/business-foundation-20260929/database-result.json`,
`concurrency-result.json`, `test-results/business-auth-20260929/result.json`, and
`test-results/business-application-20260929/browser/`. The Auth evidence includes
source hashes. Synthetic real Auth tests verify email confirmation, MFA/recovery,
exact business deletion and survival of a separate member session. Offline tests
compare preexisting public function definitions/grants, policies and table ACLs.
The disposable concurrency clone is removed after testing; original test data is
retained. Local restoration used preserved test volumes, not a hosted project.

### Restricted operator procedure (future deployment, not a live capability)

1. Receive requests through support. Verify identity and business authority
   proportionately through a protected process; never solicit passwords, MFA
   secrets or identity documents in ordinary email. Store only an opaque evidence
   reference in the case. Do not treat knowledge of a public company name as proof.
2. Assess jurisdiction, scope and deadline using the ORIGINAL request receipt time
   from the referenced support record. Supply the assessed `due_at` explicitly.
   The case's `received_at` is workflow-recording time, not proof of initial email
   receipt. No legal response clock is automatically calculated or paused here.
3. Open exactly one case with a stable request ID. Read its current detail/revision
   before changing it. An access export is only available for an open verified
   access case; page all history and review third-party/internal material before
   secure delivery. This is the business application export, not a complete dump
   of all security/provider/support records; assess those separately as needed.
4. Correct editable application drafts using the exact application revision. A
   pending/approved submission must first go through the existing review/reopen
   path. Original submissions remain historical evidence until justified erasure;
   corrected drafts require the normal new applicant submission/acceptance. Auth
   email/name changes and lost-MFA recovery are NOT silently implemented by this
   application-correction command; keep such cases open for separately verified
   recovery rather than marking them fulfilled.
5. Closure is not deletion. For erasure, document the scope and justified minimal
   retention in the protected evidence record, check current holds, and prepare
   the exact case. Do not pass a manually chosen Auth user ID to the executor.
   Persist the execution ID BEFORE calling it. On timeout or `needs_auth_review`,
   do not create a new execution or run another DELETE. Inspect the exact Auth ID;
   resume the SAME execution only to reconcile confirmed absence. A still-existing
   identity requires a separately reviewed recovery, not bypassing the one-shot
   authorization. Never mutate a member identity to make it pass the guard.
6. `primary_erased` is intentionally not `completed`. Review Resend mail/log
   retention, Cloudflare/security logs, Supabase Auth audit/service logs/backups,
   support mailbox (including forwarded Gmail copies), exports and any authorized
   retained records. Record completion or the lawful retention/expiry basis for
   each copy in protected evidence; mark the request complete only after review
   and an accurate response to the requester. Do not claim backups were edited
   or every provider supports an immediate per-user deletion. If restoring a
   backup, reconcile the erasure ledger before allowing restored access.

### Deployment and rollback boundary

Not promoted to `supabase/migrations`; no production install. Future release order:
foundation/auth admission, agreement ledger/constraint, privacy candidate (off),
then exact versioned legal documents and business client/handler. Keep public
registration off until included-capacity, hostname/provider configuration, legal
URLs/version correspondence, assigned request coverage, retention/provider-copy
procedures, market scope and the exact hosted canary pass a separate release review.
Business privacy commands also need a restricted operator integration before
claiming self-service portal triage. No new subscription or quota change authorized.

Rollback files are `business_signup_legal_v1.rollback.sql` and
`business_privacy_v1.rollback.sql`. Close business entry points, disable privacy
execution and revoke only its new grants. Retain agreement/case/audit evidence and
disabled account state. Keep the business-only agreement constraint while closed
so rollback does not reopen unrecorded signup. Feature rollback cannot undelete
Auth or restore erased content; reconcile any in-flight provider operation first.

Implementation references: [Supabase Auth deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
[JWT/deletion behavior](https://supabase.com/docs/guides/auth/managing-user-data),
and [PostgreSQL deferred constraint triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html).
Research informed the candidate; local integration tests establish the behavior
of cached Auth 2.197.0, not every future hosted version. Approved wording was
updated only to match account-stage acceptance and reduced initial collection;
drafts remain unpublished, without an effective date.

## Implemented

- `docs/drafts/business_auth_v1.sql`: separate default-off, service-only admission
  contract. Exact pilot allowlist (maximum 25 addresses), expiry, configurable total
  account/email reservations (default zero), 600 attempts/hour globally, 30/hour per
  admitted address and two-minute mail cooldown. Failed downstream operations still
  consume reservations. No automatic refill of account/email totals. These are
  proposed pilot bounds, not verified provider capacity or public-scale controls.
- `supabase/functions/business-auth`: isolated register/sign-in/resend/recovery
  request handler. Fixed business role and server metadata; no member conversion,
  fake DOB, global logout, arbitrary redirect or request-supplied role. Sign-in
  eligibility checked before password exchange. Exact Auth ID/class rechecked
  before generating mail; confirmation/recovery provider responses validated.
  Uses existing branded Doji email renderer and service-header helper unchanged.
  No production deployment or real mail send occurred.
- Admission and application authorization now reject soft-deleted Auth identities,
  as well as disabled/banned/deleted or wrong-class identities.
- `website/business-portal/application-client.js`: explicit enabled configuration,
  memory-only business session, deduplicated refresh, epoch guards, local-scope logout,
  no demo fallback, exact RPC allow-surface. Opaque/legacy service keys are rejected
  from browser configuration. No browser service credentials or member client reuse.
- `website/business-portal/application/`: applicant form using shared portal theme,
  form fields and accessible `DojiPortalSelect`. Save draft, exact-version consent
  and submission, read-only pending/approved/declined states, requested-change
  response, explicit refresh, protected draft preservation and discard confirmation.
  Missing approved legal configuration disables submission but permits draft save.
  Page is disabled without an explicit configuration; none is shipped enabled.
- `website/admin-portal/business-applications.js`: separately gated review module,
  bounded 25-item status-filtered keyset queue, readonly submitted-form renderer,
  native right-side record drawer, separate applicant response/internal rationale,
  explicit confirmation and stable retry key. Uses existing business-read and
  operator-manage capabilities; server permissions remain authoritative. Existing
  released admin runtime/bundle is NOT wired to this module yet.
- Browser lifecycle: dirty applicant drafts are not overwritten on foreground,
  online or refresh. Newer revisions block stale writes. Reviewer invalidation
  re-reads the exact record and only flags a changed revision; notes are preserved.
  Clear methods discard protected state; integration must connect admin lock/logout
  to review-module clear. No polling or background scheduled member behavior added.

No production database, Worker, portal, member app, Auth setting, email provider,
campaign, billing or release-policy change was made. No cloud capacity was purchased.
The existing local business prototype at port 4188 remains unchanged by this pass.

## Verification

- **118 offline PostgreSQL assertions**: `node scripts/test-business-foundation.mts`.
  All changes roll back in the existing network-disabled synthetic database. Current
  evidence: `test-results/business-foundation-20260929/database-result.json`.
- **6 overlapping transaction scenarios**, each using separate real PostgreSQL
  connections and a held-lock barrier: duplicate initial submission, duplicate
  approval, submit versus stale save, conflicting decisions, disabled applicant
  versus waiting submission, and competing last registration/email slot.
  `node scripts/test-business-concurrency.mts`; evidence `concurrency-result.json`
  alongside the database result. Test-created clone and cluster role removed;
  original fixtures retained. This is not a production-load/capacity benchmark.
- **28 handler contract tests**: `node scripts/test-business-auth.mts`. All Auth
  and email calls stubbed; this does NOT qualify real Auth lifecycle or delivery.
- **20 client/state tests**: `node scripts/test-business-application-client.mts`.
  Includes logout versus late login/read/write, serialized refresh, retry-key reuse,
  stale record handling, readonly form escaping and browser service-key rejection.
- **28 Chrome tests**: `npx playwright test --config
  website/business-portal/playwright.application.config.mjs`. API calls intercepted;
  screenshots checked at 390/1440 in light/dark and reviewer right drawers. Covers
  consent, exact ID/revision, no private data in local/session storage, draft
  preservation, read-only staff, confirmation and lock cleanup. Test document CSP
  substitutes only the intercepted test API host; production headers unchanged.
- Targeted strict TypeScript check of the new handler and entry point passed:
  `npx tsc --ignoreConfig --noEmit --strict --target es2022 --module esnext
  --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck
  supabase/functions/_shared/business-auth.ts supabase/functions/business-auth/index.ts`.
  Full Edge project check remains red in preexisting moderation-media-storage and
  realtime-token imports (`npm:@noble/hashes`, `npm:ably` and derived unknown byte).
  No unrelated workaround was made to declare that full suite green.

## Still required before enabling or releasing

1. **Hosted Auth qualification.** The access route and local create/confirm/resend/
   recovery/MFA flow are now implemented and qualified below. Still verify hosted
   role persistence, current hooks, exact origin/redirect, refresh/deletion lifecycle,
   service allowances and mail delivery in a separately approved controlled canary.
   Local Auth evidence does not prove hosted configuration or delivery.
2. **Protected admin integration and private realtime.** Review module must be
   wired to the existing authenticated admin transport, capability lifecycle and
   lock cleanup under an explicit flag. No protected endpoint should be added to
   a shared Worker incidentally. Business-only realtime token/topic authorization,
   relay qualification and targeted event dispatch remain unimplemented. The browser
   hook is not proof of server authorization or working subscription delivery.
3. **Public abuse and privacy qualification.** Current admission is a closed pilot,
   not public signup. Origin checking is not bot protection; provider/network abuse
   and bounded read/rejected-command budgets still need qualification. Confirm legal
   application/privacy versions, review checklist, retention/deletion, pilot emails,
   pilot expiry and actual low admission limits with the owner. Older submitted
   versions/history pagination remains a UI gap beyond the latest 30 entries.
4. **Fresh no-new-cost allowances.** Actual Supabase/Auth/Edge/database/egress,
   email, Cloudflare and Ably headroom has NOT been checked in this pass. Existing
   fixed-recipient safety delivery does not establish arbitrary business email
   headroom. Reserve pilot capacity without competing with member/safety traffic.
5. **Separate release approval and exact artifacts.** Fresh schema/grant baseline,
   member/admin regression evidence, reviewed deploy/rollback and explicit shared-
   backend release approval are still required. Do not run a broad migration push
   or deploy the dirty website. Application settings and Auth settings stay off;
   authenticator remains ungranted. Billing/campaign publishing stay disabled.

## Rollback

The admission rollback disables its private flag and revokes the service-only claim
RPC; retain budget counters and identity evidence. The application rollback retains
submissions, receipts and organizations while disabling the business entry boundary.
Remove only candidate module/config inclusion when reverting UI. No member/employee
logout, schema drop, history deletion or global Auth reset is part of rollback.

## Documentation basis

The server-only link-generation approach follows [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink).
The explicit token-redemption flow follows [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).
[Supabase production guidance](https://supabase.com/docs/guides/deployment/going-into-prod)
describes one-time-link scanner behavior and Auth rate limiting; it does not replace
the dedicated business admission bounds or prove current account quota. Sources
checked September 29; the pilot numbers and separate identity design are Doji choices.

## Account-access completion — September 29 (local only)

- `/business-portal/access/` now implements create account, resend verification,
  request recovery, explicit link confirmation, new-password confirmation and
  existing-authenticator recovery. The shared dropdown is initialized in its
  keyboard/ARIA-enabled mode; light/dark tokens and right-aligned compact CTAs reuse
  the portal components. No browser session, password, link or MFA secret persists.
- Approved applicants can use **Open business workspace** to enroll/verify TOTP,
  then call the existing candidate AAL2 workspace RPC. This exposes only the
  approved organization summary; campaigns/billing remain false. It is not a live
  campaign workspace or permission to substitute the sample prototype.
- Verification uses the existing Auth OTP API behind `business-auth` after an
  exact-identity admission check. The emailed fragment now contains an opaque
  `ticket`, not a bare Auth token. `business-link.ts` signs its ID/email/type/hash/
  one-hour expiry with HMAC-SHA256, bound to the exact portal origin and a versioned
  business-only purpose. **New separate secret:** `BUSINESS_LINK_SIGNING_KEY`, at
  least 32 characters from a cryptographically random generator; never reuse member,
  service or JWT signing keys. No production secret was created. Rotating it invalidates
  outstanding business links only. Supabase additionally enforces OTP expiry/single use.
- Unsigned/member links cannot reach Auth exchange through this handler. Verification
  consumes the same bounded attempt budget, not another mail reservation. Disabled,
  banned, deleted, non-pilot or wrong-class accounts fail closed. Opening an email
  page removes the fragment without redeeming it; a deliberate click is required.
- Shared `business-mfa.js` supports TOTP setup/manual key, existing factor challenge,
  invalid-code feedback, cancellation/resume and cleanup. QR SVG is an image source,
  never active inserted markup. Only abandoned unverified factors on this business
  identity are cleaned during setup; verified factors are not removed. Password
  recovery requires existing MFA and never provides an MFA bypass. Lost-factor
  support needs an identity-verified operator procedure before pilot launch.
- Auth sessions stay memory-only with epoch guards; late verify/MFA results cannot
  restore a locked page. Verification/password completion logs out only the current
  business session. Existing member Auth/age hooks/settings are unchanged.

**Real local verification:** `node scripts/test-business-local-auth.mts` passed
12 named checks on actual Auth **v2.197.0**, restored synthetic PostgreSQL and
intercepted mail. These cover the unchanged minimum-age hook; member login denial;
business create without fabricated DOB/profile; unconfirmed denial; resend;
one-time verification/replay rejection; TOTP enrollment/challenge; recovery requiring
existing MFA; changed-password login with retained verified factor; independent
member refresh after business MFA/logout. See
`test-results/business-auth-20260929/result.json`.

The runner uses only the explicitly unlinked `media-storage-verify` project and a
new, loopback-bound temporary Auth container using the cached official image.
Business admission is disabled and that temporary container stopped in `finally`;
synthetic identities/evidence are retained. All Resend requests are intercepted,
SMTP is disabled, and non-local service requests fail an assertion. This does not
exercise hosted email or production integrations. The offline foundation and
concurrency runners must run **sequentially**: the concurrency harness temporarily
creates a cluster-wide `doji_business` role and removes its own role/clone afterward.

Documentation checked: [Supabase TOTP lifecycle](https://supabase.com/docs/guides/auth/auth-mfa/totp),
[password recovery](https://supabase.com/docs/guides/auth/passwords), and
[email template/scanner guidance](https://supabase.com/docs/guides/auth/auth-email-templates).
The business-specific signed envelope and admission bounds are our isolation design,
not a claimed Supabase feature. Production remains off; protected admin transport,
private realtime, legal/pilot configuration and fresh no-cost allowance checks still
gate release. No shared Worker or member code was edited by this continuation.

## Protected admin connection — September 29 (local only)

The candidate is connected to the existing employee portal behind independent,
default-off `DOJI_ADMIN_BUSINESS_APPLICATIONS_ENABLED=true`. The build packages the
lazy review module and shared structured-field renderer only when opted in; it does
not package applicant pages or credentials into the admin artifact. An isolated QA
output (`website/.business-admin-qa-20260929`) leaves the normal release output alone.
Output overrides accept only explicitly named business QA artifacts, not source paths.

The client maps three fixed operations directly to the candidate business admin
RPCs, using the existing employee JWT, public anon key, 15-second deadline, refresh
single-flight, capability revocation and session-epoch guards. It never exposes a
generic RPC caller or service credential. Both employee mode and the business flag
must be enabled. No shared Worker route/change is needed for these admin reads/writes.

The visible queue reads at most 25 applications using server cursors. The exact
record opens in the established right drawer with shared fields, dropdown, cards
and theme tokens. Read-only reviewers cannot decide. Confirmed commands retain the
same receipt ID on ambiguous retry; exact record identity is checked on responses.
Foreground/existing admin refreshes reconcile only the visible queue or open record.
Overlapping loads coalesce; a changed revision preserves notes and blocks deciding
until reopen. Lock clears business evidence and rejects late responses. No polling,
new subscription, member action, campaign publishing or billing was introduced.

Verification: the employee client unit suite passes including independent business
flag gates, fixed transport, headers/deadline and late-response rejection. The
isolated browser run passed **84 checks** across business review, existing employee
authentication, editorial and takedown review. Business-specific tests include four
light/dark phone/desktop layouts, axe accessibility, lazy bounded reads, confirmed
retry, capability denial, mismatched identity, coalescing, stale notes and locking.
The final shared-card markup adjustment is also covered by the 13-check business
browser suite. Browser APIs are mocked; this is not hosted integration proof.

Read-only allowance inspection (September 29, current Supabase organization): Pro,
66/100,000 MAU, 27,855/2,000,000 Edge invocations, 0.72/250 GB uncached egress,
0.09/100 GB average object storage. Dashboard says overages are not currently billed
for capped usage; this is not a universal compute/disk billing guarantee. No plan,
spend cap or resource was changed. Resend and Ably both require sign-in, so their
current capacity remains **unverified**. Business stays disabled; no real mail sent.

Remaining gates at that checkpoint (private-realtime preparation subsequently
approved and implemented below): hosted allowance/mail checks;
pilot identity/legal configuration and lost-factor support procedure; explicit
shared-backend release and rollback approval. Do not deploy this dirty tree or enable
candidate outbox producers from the successful admin browser tests. Roll back this
UI connection by disabling the business build flag; retain all business records.

## Private business realtime — September 29 (local preparation only)

Owner approved preparing this separate shared-system scope; production release is
still gated. `business_realtime_v1.sql` is a draft, not an automatic migration.
The existing foundation draft now has independent `settings.realtime_enabled=false`:
application writes still commit while disabled, but create no business outbox work.
No production function, Worker, Auth setting, credential, flag or member app changed.

- Dedicated `business-realtime-token` Edge endpoint accepts only an empty POST,
  exact configured HTTPS origin, and the caller's bearer token. It calls the
  zero-argument `get_business_realtime_capability_v1` with that JWT and public key,
  never a service-role substitute. Database checks live business identity, confirmed
  email, deletion/ban/disable state and rejects members/employees. No caller-selected
  account, topic, post or capability is accepted.
- Ten-minute signed TokenRequest grants only `subscribe` on the exact
  `business:<Auth UUID>:events` topic, with business-prefixed client identity. No
  wildcard, publish, presence-entry, history, moderation or member channel grant.
  Ably's subscribe capability also permits observing presence on that exact channel;
  this feature publishes no presence. Private reads remain authorized separately.
- An atomic private per-account budget allows at most 24 issuance reservations per
  rolling window starting with the first reservation (one hour). Concurrent requests
  cannot overrun the final slot. Failures after reservation consume it; exhaustion
  offers manual Refresh, not an unbounded retry loop. SDK renewals use the same gate.
- Atomic producers bind `applicationId` to the actual applicant's topic and add
  `applicantId`; no details, contact information, response or staff note enters Ably.
  The candidate shared relay strictly validates topic/family/aggregate/payload and
  no-push flag before publishing. Business work gets a separate worker group, so a
  disabled/invalid business envelope cannot block unrelated staff/member messages in
  the same claimed batch. Existing bounded worker count, leases, publication
  acknowledgement and member/push paths are retained. No extra ownership read is
  added to the member relay; the atomic database producer owns that binding.
- The browser starts only with `realtimeEnabled === true` and a business session.
  It loads pinned Ably 2.26.0 only then (public CDN HEAD returned 200), subscribes to
  one exact topic, validates identifier envelopes, and bounds duplicate memory to
  256 IDs. It never installs state from a message. Existing authorized reads run on
  initial attachment, reconnect and channel continuity loss, including `update`
  events whose current state remains attached. Foreground/online/manual refresh
  still work without realtime. Hidden tabs close the socket; foreground can reopen.
  Logout closes it, clears data, and fences late token/message/connection callbacks.
- Reconciliation during an in-flight read/command now queues one trailing read.
  Dirty forms retain their text and require deliberate reload when revision changes.
  There is no application polling or subscription history fetch.

Staff hints retain the existing `moderation:global` permission boundary. Staff with
the existing moderation token authorization receive invalidations through the
existing admin client. A business-read-only reviewer is **not** newly granted
moderation access; manual/foreground authorized reads remain available. A separate
business-only staff realtime subscription, if wanted, needs separate qualification.

Verification this continuation:

- 141 rollback-only offline SQL assertions (including defaults, two-account
  isolation, producer target, budget exhaustion, disabled/unconfirmed/banned/deleted
  identities, privilege denial and unchanged existing public functions/grants/RLS).
- Eight actual overlapping transaction scenarios, including final-token-slot
  contention and disable-versus-token authorization. Temporary QA clone/role removed;
  original synthetic database retained.
- 37 offline realtime/transport/state contracts; installed Ably SDK signed a request
  using only a synthetic key and its HMAC/capabilities were independently checked.
- 20 existing business client/state checks; 31 local Chrome applicant/access/review
  checks (three new private-event/reconnect/logout/foreground scenarios, mocked Ably
  and HTTP); 16 existing member realtime/relay contract checks; targeted strict
  TypeScript check of the new shared helper, syntax and diff checks passed.

These are local qualification, **not** a hosted Ably authorization or end-to-end
delivery test. No real emails, tokens, subscriptions, accounts or public applications
were created. Existing signed requests/tokens are not instantly revoked by a disable
flag; the token TTL is ten minutes, subject to Ably's signed-request redemption rules.
Fresh database reads deny disabled identities immediately after the disabling
transaction commits. Do not rotate/revoke the shared Ably key as business rollback.

Checked official references: [Ably token authentication](https://ably.com/docs/auth/token),
[exact channel capabilities](https://ably.com/docs/auth/capabilities),
[connection recovery](https://ably.com/docs/connect/states), and
[channel discontinuity](https://ably.com/docs/channels/states). TokenRequest retains
the installed SDK/existing system convention; current Ably docs also recommend JWT
for new integrations. Authorization policy, issuer budget and database reconciliation
are Doji-specific design, not provider guarantees.

### Release and rollback gates (not executed)

1. Provider sign-in check completed September 29 (bounded evidence in
   `test-results/business-provider-allowances-20260929.json`): Resend Free showed
   3/3,000 monthly and 0/100 daily transactional emails, with transactional pay-as-you-go
   off. This is shared point-in-time headroom, not reserved pilot capacity. Ably Standard
   charges usage in addition to its base fee; connection/channel limits are capacity,
   not a free traffic allowance. Keep hosted business realtime disabled under the
   owner's no-new-cost constraint. No real email, subscription, plan or credential
   change was made. Exact key capabilities and any later hosted provider canaries
   remain unqualified. Supabase figures above are a prior observation, not a live
   allowance guarantee.
2. Confirm bounded pilot identities, final legal versions/URLs, business email sender
   and lost-factor support procedure. Obtain explicit shared-backend deployment and
   rollback approval against an isolated exact artifact; never deploy this dirty tree.
3. Rehearse the combined foundation/auth/realtime draft with actual business-role
   Auth/PostgREST requests and the hosted gateway's JWT validation. The earlier real
   Auth checks do not qualify the newly added token endpoint. Verify two-account
   hosted channel denial, publisher denial, staff delivery where already authorized,
   token renewal and reconnect using synthetic records only after cost gates pass.
4. Install disabled SQL and exact disabled Edge/relay candidates before producer
   enablement. Preserve current relay source/config and compare member token,
   push, alarm, session and RPC baselines. Keep browser application/realtime, Edge
   `BUSINESS_REALTIME_ENABLED`, relay `BUSINESS_REALTIME_RELAY_ENABLED`, SQL producer
   and admin build flags off until canaries pass; activate only the separately
   approved bounded pilot.
5. Rollback: disable browser connection; run `business_realtime_v1.rollback.sql` to
   stop producers and revoke only the dedicated issuance RPC; disable the business
   token Edge flag. Keep the guarded relay installed and its separate relay flag on
   while queued business work drains, then disable the relay flag; or arrange for
   queued business work to be handled with a reviewed business-only procedure. Do not restore an
   older unguarded relay while business outbox rows remain eligible. Retain all
   applications, submissions, consents, decisions and receipts. No member key/session
   revocation, release policy, campaign publishing or billing changes.

### Applicant read recovery (local continuation; not deployed)

The applicant controller now distinguishes an authoritative empty application from
an initial read that has not succeeded. Until that first read succeeds, the form
is hidden and both edits and commands are blocked in the controller. A malformed
successful RPC response fails rather than becoming `null`/a new application.

Manual/foreground reconciliation has explicit loading, last-successful-check and
refresh-failure feedback. Failed refreshes retain the last authorized record,
unsaved fields and consent. Background status notifications do not recreate dirty
form controls or steal focus. Proven revision changes still block commands and
require deliberate discard/reload; no new polling or automatic command retry was
added. Logout clears read status and fences late reads. All existing server revision,
receipt and authorization contracts remain unchanged.

Verification: 24 isolated client/state checks, 37 offline realtime contracts and
34 local Chrome applicant/access/review tests passed. The browser suite includes
cold HTTP failure, malformed success, retry recovery, focus/consent preservation,
light/dark and narrow/wide layouts. Browser API/Ably traffic was mocked; no hosted
account, email or token was created. New changes are limited to the unshipped
business client/UI and tests/docs. Production rollout and the pilot's legal,
identity, allowance and shared-backend approval gates above remain open.

### Signup-to-review HTTP qualification — September 29 (local only)

`scripts/test-business-local-auth.mts` now invokes
`scripts/test-business-http-workflow.mts` against actual Auth 2.197.0 and PostgREST
14.16 in the explicitly unlinked, synthetic localhost stack. Applicant requests use
the real application client. Employee and second-business sessions are issued by
Auth, and the reviewer reaches AAL2 through a real TOTP challenge. Application
actions cross HTTP/PostgREST; they do not impersonate SQL roles or mock RPC results.
Emails are intercepted in memory, SMTP is disabled and every service URL is checked
against the fixed local origin. Container start uses cached images (`--pull=never`).

The first full HTTP rehearsal exposed a genuine candidate defect: business stale
revision branches raised `40001`, which the tested PostgREST 14.16 retried instead
of promptly returning a conflict. The HTTP probe hit its 12-second deadline; a
bounded 1,000-line local DB log tail contained 332 matching stale-revision errors.
This reproduces a documented [Supabase/PostgREST issue](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
It is **not** evidence that the historical mobile 504s have the same cause.

Only the uninstalled business foundation draft's three optimistic-version branches
now raise `PT409` (HTTP 409), using the documented
[PostgREST custom HTTP error contract](https://docs.postgrest.org/en/v14/references/errors.html#raise-errors-with-http-status-codes).
Atomic locks, revisions, receipts, permissions, grants and payloads are unchanged.
Applicant handling accepts PT409; the optional business reviewer also recognizes
HTTP 409 because the existing admin transport retains HTTP status, not RPC codes.
The old code remains recognized for compatibility. Stale review keeps notes and
disables confirmation until reopening. No generic admin transport or member error
handling was changed. Do not substitute the pre-fix draft during rollback.

The repeat rehearsal passed **26 real Auth/HTTP checks**, including:

- Create, resend, explicit one-time confirmation, separate-role login and MFA;
  unchanged member age gate and member-session survival after business recovery/logout.
- Save, immutable consent-bearing submission and idempotent replay; second-account,
  anonymous and member/business cross-boundary denial using actual signed JWTs.
- Employee AAL1 denial, AAL2 queue/detail, readonly-role denial, requested changes,
  no internal-note leakage, private unsent drafts and exact resubmitted evidence.
- Stale creation/update/review requests all return HTTP 409 (6/8/8 ms observed in
  this local run; not a production latency or capacity guarantee).
- Approval replay produces one organization; reopening denies workspace access to
  the already-issued token; reapproval reuses the organization. Campaign and billing
  capabilities stay false. Disabled employees/applicants and deleted identities are
  denied with existing tokens; disabled applicants cannot replay old receipts.
- Realtime off produces zero business outbox rows for the tested application.
  Non-business public function definitions/grants remain unchanged.

Evidence: `test-results/business-auth-20260929/result.json` includes provider
versions, safe named checks, conflict timings and candidate source SHA-256 hashes;
no password, token, MFA seed or email body is saved there. Local pilot/application/
realtime flags are disabled in cleanup, temporary Auth is stopped, and synthetic
records remain available in local test volumes. The restored local candidate alone
was refreshed to the checked-in function definitions; nothing hosted was installed.

Regression after the repair: **141** rollback-only SQL assertions, **8** actual
concurrency scenarios, **28** stubbed Auth-handler checks, **25** client/state checks,
**37** offline realtime contracts, **34** applicant/access/review browser checks and
**85** isolated admin business/auth/editorial/safety browser checks passed. Browser
traffic is mocked; the real HTTP checks above separately qualify the server path.

Remaining launch decisions/gates are explicit, not another completed local test:

1. **Owner clarified public self-service signup, not an invite-only pilot.** There
   are no initial business email addresses to allowlist. The current closed-pilot
   admission contract does not meet that requirement and must not be presented as
   the public launch solution. Do not guess addresses or simply remove the allowlist.
   A separately approved public admission design must address email verification,
   bot/abuse controls, account/mail capacity reservations and exhaustion behavior,
   while retaining staff approval before business workspace access.
2. Approved business application terms/privacy versions and URLs, retention/deletion
   decisions and identity-verified lost-MFA support procedure. Synthetic test terms
   are never acceptable launch configuration.
3. Fresh hosted baseline/allowances, exact disabled release artifact, independent
   shared-backend deployment/rollback approval, hosted role/JWT/gateway/origin checks
   and a separately approved bounded delivery canary. Local Auth does not prove
   hosted hooks, provider delivery or production configuration.
4. Keep Ably business token/consumer/producer/relay flags off under the no-new-cost
   constraint. This pilot candidate uses manual/foreground authoritative reads.
   No public signup, sponsored content, campaign publishing or billing release.

The owner clarification changed the implementation scope, not the results of
the completed private-flow rehearsal. The local public-admission implementation
below supersedes the invitation requirement; production release remains gated.

## Public signup and onboarding qualification (September 29 local time)

Owner approved preparation: “yes we need that working perfectly. sign up, onboard
the business etc”. This is local implementation/testing, not permission to enable
hosted public traffic or override the no-new-cost requirement.

Public flow: create a separate business account → explicitly confirm the email →
sign in → save/submit company and representative details with exact legal versions →
staff review/request changes/approve → MFA-protected approved workspace. Creating an
account or confirming email never approves a business, publishes a campaign, enables
billing, creates a member profile or changes member sessions. Internal review notes
remain private. Reopening an approval revokes workspace access through the existing
atomic business command. No invitation addresses are needed for this public path.

### Implemented boundaries

- New additive **uninstalled draft** `docs/drafts/business_public_admission_v1.sql`,
  after application/auth drafts; service-only `claim_public_business_auth_v1`.
  Defaults: disabled, registrations closed, all account/mail limits zero.
  Old invitation settings remain independent and disabled; no fallback to them.
- The dedicated handler chooses the public RPC only with
  `BUSINESS_AUTH_PUBLIC_ADMISSION=true`, requires `BUSINESS_TURNSTILE_SECRET`, and
  verifies the exact hostname/action before registration, password exchange or email
  work. Signed, origin-bound one-time verification tickets use their own validation
  plus bounded admission; simply opening an email link does not redeem it.
- Public create/signin/resend/recovery forms use one shared business verification
  component. Proof is kept in memory, consumed once, cleared after each attempt,
  invalidated on action changes/expiry and retried only explicitly after failure.
  No challenge loads when disabled or when opening a signed verification link.
  Dropdowns, fields, light/dark tokens and compact right-aligned actions remain the
  established portal components. Configured privacy/terms links appear before signup.
- Reservations serialize under one settings lock. Lifetime account/mail caps do
  not automatically refill; failed or uncertain downstream work still consumes its
  reservation. Daily mail limit resets on UTC day change only; lifetime cap still
  applies. Conservative configurable schema ceilings are 100 account reservations,
  250 lifetime email reservations and 50 emails/day—**not** enabled production
  budgets or a promise those quantities fit remaining shared provider allowances.
- Global 600 attempts/hour plus 30/hour per hashed address bucket and two-minute
  mail cooldown. Exactly 4,096 preallocated buckets, not one row per supplied email;
  no email/IP/token stored in limiter rows. Collisions conservatively share limits,
  so unrelated addresses can occasionally be throttled together. This is a bounded
  low-volume admission design, not a 100,000-business signup capacity claim.
- Registration close/expiry/cap and email exhaustion return explicit temporary
  availability messages before any identity lookup. Existing business signin and
  signed verification remain usable when new registration or email sending closes.
  The all-access kill switch still intentionally closes the boundary. Unknown,
  duplicate, disabled/member/employee identities do not receive account-specific
  signup/recovery disclosures. Response timing has not been proven constant-time.
- `website/build-business.mjs` creates a separate, default-off `.business-dist`
  artifact. No private env file is read. Enabled builds require public config,
  business challenge site key and approved legal URLs/versions. It excludes the
  sample/localStorage workspace, admin portal and member app. One business-only
  CSP permits the challenge; no global/admin CSP widening or duplicate policy.
  Business realtime is forced off. Marketing signup/signin links in the local
  candidate now target the real access/application routes, not demo auth.

### Verification

- 175 rollback-only restored-schema PostgreSQL assertions, preserving existing
  public functions/grants, policies, table permissions and RLS.
- 10 actual overlapping transaction scenarios, including competing public signups
  for the final account and daily email reservation; no overspending.
- 41 stubbed Auth-handler checks, 25 client/state checks and 37 offline realtime
  contract checks. Missing/bad/expired/wrong-host/wrong-action proof and provider
  failure never reach Auth, database reservation or email work.
- 39 browser checks covering established components, input preservation, proof
  lifecycle, explicit link confirmation, recovery/MFA, application and staff review.
  Browser API responses and the challenge SDK are mocked, not provider proof.
- 26 real local Auth 2.197.0/PostgREST 14.16 checks repeated through **public**
  admission with the invitation gate disabled and no allowlisted addresses. Actual
  Auth tokens, employee MFA, application save/submit/replay, changes/approval/reopen,
  revocation and member-session survival qualified. Turnstile and mail are
  intercepted; **no external email**, hostname/bot or hosted Auth qualification.
- 10 static build checks; final artifact disabled. No deployment or new cost.

Evidence remains in `test-results/business-auth-20260929/result.json` (source hashes,
versions, conflict timings, named checks; no credentials/email bodies), database and
concurrency JSON under `test-results/business-foundation-20260929`, and browser
artifacts under `test-results/business-application-20260929/browser`.

### Still required before public launch

1. Approve business-specific terms/privacy URLs and exact versions, retention/
   deletion policy and identity-verified lost-MFA support process. Do not publish
   synthetic legal content or claim the member terms automatically cover businesses.
2. Confirm the intended business hosting origin, configure a hostname-restricted
   Turnstile widget and dedicated secret, and verify deployed CSP, action binding,
   gateway configuration and actual provider behavior with approved bounded checks.
3. Fresh shared-provider allowance and abuse review. These reservations cap calls
   initiated by this handler, **not** all public Edge invocations, shared Auth
   endpoints, other email senders, MAUs or provider-wide billing. Direct shared Auth
   endpoints retain their existing protections; no member captcha or global Auth
   setting was changed. Bot protection cannot guarantee zero abuse or zero cost.
   Choose positive caps only within confirmed remaining included allowances; leave
   Ably business realtime off. No auto budget refill or paid upgrade.
4. Separately approve/install exact additive backend + default-off business artifact
   + gated admin business module, verify live role/RLS/member regressions, then
   approve one controlled verification/recovery/delivery canary before opening signup.
   Provider email acceptance is not inbox delivery; local tests are not production.

Rollback: public admission rollback disables registration/access and revokes only
its service RPC; turn off the dedicated Auth/public frontend flags, never enable the
old invitation gate as an automatic fallback. Preserve accounts, immutable submissions,
consents, reviews and counters. Existing business application rollback separately
removes access if needed; do not delete evidence or touch member sessions. Current
hosted flags, database, Worker, billing, credentials and release policies are unchanged.

Sources used for the implementation: [Cloudflare mandatory server-side validation,
single-use/expiry and hostname/action checks](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[widget callbacks and explicit retry behavior](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/),
[OWASP authentication response guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
and [Cloudflare Pages header combination rules](https://developers.cloudflare.com/pages/configuration/headers/).

## Owner legal review and hosting verification

On September 29, the owner confirmed business.dojipro.com and requested business
terms/privacy drafts for review. Added local-only drafts under docs/drafts:
BUSINESS_TERMS_REVIEW.md, BUSINESS_PRIVACY_REVIEW.md and BUSINESS_LEGAL_REVIEW.md.
They are not approved, effective, published or packaged into the business artifact.
The operator's legal identity/jurisdiction remains an owner question; operational
retention, erasure and lost-MFA procedures remain explicit release requirements.
The review index distinguishes actual candidate behavior from proposed policy.

Read-only provider verification around September 30 03:25 UTC:

- Resend authenticated usage page: Transactional Free, 3/3,000 monthly emails,
  0/100 daily, 1/3 domains, transactional pay-as-you-go disabled. No mail sent.
- Cloudflare authenticated Workers & Pages page: exactly three applications,
  doji-admin, doji-site and doji-orchestrator. No separate business project listed.
  Dashboard reported $0 billable usage for September 16–October 16; this is a
  current observation, not a guarantee against future shared usage charges.
- A direct read-only Pages/Turnstile API check returned 401 using cached CLI auth.
  Existing browser authentication worked; no new login or permissions were needed
  for the UI check. API 401 must not be interpreted as missing infrastructure.
  Safe API evidence: test-results/safety-launch-preflight-iviX28/hosting.json.

No provider settings, DNS, credentials, database, member sessions, billing or
deployment changed. Existing providers can be reused; separate business hosting,
hostname-restricted bot protection, exact backend release and live canary remain
uncompleted. Ably business realtime remains off. Do not claim signup is live.
