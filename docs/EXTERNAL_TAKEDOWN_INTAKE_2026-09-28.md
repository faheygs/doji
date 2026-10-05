# External takedown intake — September 28, 2026

## Current status — September 29 production release

The public form, restricted/ordinary portal queues, Cloudflare administrator alerts
and separately approved media safeguards are deployed and enabled. A clearly labelled
synthetic browser request was received, routed correctly, reported delivered by the
email provider on its first attempt, and retrieved through private status lookup.
The owner restored the work session; authenticated browser review, synthetic case
closure and public “Review completed” status were verified September 29 at 16:37 UTC.
No real member/content action was taken. Read
`SAFETY_LAUNCH_2026-09-29.md` for exact deployments, evidence, limitations, coverage
and evidence-retaining rollback. Earlier “not live” sections below are historical.

## Approved media repair in progress — NOT live

Owner approved the separate shared-media scope with “You may”. Exact-object copy,
byte verification, private evidence, origin deletion and restoration primitives now
pass offline fault tests and actual local Storage HTTP tests. Service-only ledger
and retry tests pass, including normal new-avatar upload permissions. These are
prepared components, **not an integrated/released moderation repair**. Appeal
ownership, cleanup races, staff evidence reads and hosted CDN qualification remain.
See `MODERATION_MEDIA_REPAIR_2026-09-28.md` for exact coverage and open work.
Supabase existing allowances/overage restriction were checked read-only. The owner
approved Cloudflare for the new intake alerts; Resend sign-in is no longer a launch
dependency for this path. A single labelled canary was reported delivered by Cloudflare
on September 29 at 04:22 UTC. The dedicated saved credential subsequently passed a
hosted-runtime canary at 13:53 UTC, and the exact email Edge function is now deployed
**disabled**. All existing Edge functions and secret digests are unchanged. Intake SQL,
public form activation, durable delivery and media integration remain pending; see
`CLOUDFLARE_SAFETY_EMAIL_2026-09-28.md`. Nothing has been publicly activated. Existing
hosting and media-scope approvals are recorded; do not ask for them again.

## Live release preflight — September 29, 03:25 UTC (September 28 local)

Owner explicitly approved hosting/connecting the intake. Read-only production
qualification found a concrete shared-media blocker; public acceptance remains OFF.
This is not a missing repeat deployment approval. Repairing media enforcement is an
additional member/storage scope under the standing isolation requirement.

- `scripts/safety-launch-preflight.mts database` captured the actual moderation
  call chain and profile triggers in
  `test-results/safety-launch-preflight-zaccfR/database.json`. `avatars` is public;
  `post-media` is private. The active v3 → v2 → retained legacy implementation clears
  `profiles.avatar_url` for profile-photo removal/quarantine but does not revoke the
  object. Inspected profile triggers do not provide a storage-removal handoff.
  No real member images were fetched or moderation actions executed.
- Supabase's Storage bucket documentation confirms public object retrieval bypasses
  access checks; its download documentation also states signed URLs retain their
  validity until expiration. Profile-row removal is therefore not proof of old-URL
  revocation. No claim of a successful production removal test is made.
- Intake tables and the safety recovery job are not installed. At this bounded
  snapshot there were zero active events, lock waits and overdue outbox rows. This
  is not an app-wide or load-performance guarantee.
- Hosting login refreshed through the existing Wrangler CLI. Read-only Pages checks
  succeeded: `doji-site` deployment `490d9519-49af-4ac5-82e2-f015c54ae394`, admin
  `cea4bd7a-191b-4f34-9ab6-b79a06177bb3`. No Turnstile widget currently exists.
  Evidence: `test-results/safety-launch-preflight-WhGa7e/hosting.json`.
- No database migration, bucket/privacy change, deployment, real submission/email,
  billing change, or public activation was performed. Current allowance verification
  and alert/production E2E qualification remain open, not passed.

Required separate scope: design and test exact-object access revocation with restricted
evidence retention and appeal restoration, preserving ordinary avatar delivery and
installed clients. Do not flip the entire avatar bucket private as a shortcut.
Use synthetic fixtures to verify old URLs, authorized evidence, normal member reads,
duplicate commands, failure/retry and appeal restoration. A safe rollback pauses new
intake/commands and retains evidence/holds; it must not republish prohibited content.
No new paid service/capacity is authorized; validate existing allowances before release.

Primary references checked during this preflight:
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/storage/serving/downloads

Status: local intake, alert queue and staff-handoff candidate implemented and tested;
NOT deployed or publicly accepting requests. Production qualification is incomplete.
Owner approved the separate public-intake/backend implementation. Production remains
gated. This is not a claim of legal-program completion.

## Boundary and contract

- Public Safety and Removal Center, no account or payment. Category-driven intake
  supports all 34 existing reporting leaves, including a specific NCII branch for
  real/forged imagery, depicted individuals and authorized representatives.
  Collect location/description, safe contact, signature and good-faith statement.
  No media uploads, automated fetching of submitted URLs or identity documents.
- Atomic server receipt; NCII 48-hour operational deadline starts at initial receipt,
  never staff validation or email verification. A request is an allegation, not a
  violation finding. No automated member action from anonymous intake.
- A 256-bit browser-generated status secret is SHA-256 hashed before storage.
  Reference and secret travel only in POST bodies, not URLs, logs or local storage.
  Retry of identical intent uses the same reference and secret. Status reveals only
  receipt, public workflow status and an explicitly public staff response.
- New private tables/RPCs and dedicated feature-gated Edge entry point. Existing
  member RPCs, RLS, sessions, Worker, alarm/push paths and billing are unchanged.
  The separately approved staff bridge has three narrowly guarded shared trigger
  exceptions, listed below; this is not a purely portal-only release.
  Existing paid infrastructure is shared; additional requests consume allowances.
- Turnstile must be verified server-side (success, hostname, action), with hard
  body/field bounds and durable service-only request budgets. No new paid service.
- Staff access requires active employee, MFA and moderation.read; restricted cases
  additionally require legal.read on paging, detail, target lookup and commands;
  writes additionally require moderation.write. Existing portal drawer, inputs and
  picker; bounded oldest-first paging, stale-version checks, atomic receipts and audit.
- Reviewer associates content through the exact-ID, fingerprint-checked handoff,
  not by guessing from text or linking an unrelated category-matched report.
  Enforcement remains in the existing audited moderation workflow.
  Closing as removed requires a linked actioned report and explicit documented
  identical-copy investigation and old-URL access verification. That attestation is
  not automated proof; the release checklist must test the actual removal path.
- Identifier-only staff events reconcile through existing foreground/reconnect
  paths. No public/member socket, polling or private information in events/audit exports.

## Qualification / release gates

1. Offline real-role SQL: permission matrix, duplicate/concurrent requests, stale
   reviewers, closed-case follow-up, deadlines, and only the three approved shared
   trigger exceptions; no unrelated member-function/grant/RLS changes.
2. Edge: disabled/misconfigured failure, Turnstile replay/hostname/action rejection,
   malformed/oversized input, upstream failures, no credential/body disclosure.
3. Browser: mobile/desktop, keyboard, contextual errors, receipt recovery, private
   status, late response after logout, no raw markup/URLs rendered from requests.
4. Recorded deployment approval plus exact before/after schema and member canaries,
   existing quota/spend-control verification and production-safe rollback rehearsal.
5. Public deployment must include discoverable Safety links, endpoint/Turnstile config,
   monitored contact, durable operator alert delivery/recovery, and end-to-end receipt
   through staff disposition/status. Never publish an unconnected form.
6. Actual content disabling, known-copy investigation, old avatar/signed URLs, evidence
   preservation and legal holds need qualification. Existing public avatars and
   expiring signed URLs are not an immediate revocation mechanism.
7. Owner/counsel approves public notice, safe retention/operational coverage and legal
   applicability. DMCA registration and NCMEC enrollment are separate external actions;
   do not fabricate a registered agent or claim participation in NCMEC Take It Down.

Rollback: disable public writes at the Edge first; retain private cases, receipts,
history and pending alert work. Restore prior portal/static assets. Revoke new entry
point grants; never drop requests or silently stop handling already received cases.
The staff bridge has a guarded restoration script for its three shared trigger
exceptions. It revokes new handoff execution but deliberately retains existing cases,
reports and decisions. It does not reverse moderation already performed by staff.

## Staff-confirmed handoff (prepared, not deployed)

`docs/drafts/external_takedown_staff_bridge_v1.sql` provides exact-ID inspection for
posts, comments, poll responses, profile photos and accounts. Category-target
compatibility is enforced before inspection. Inspection is read-only and
returns bounded text and stored media references, not fetched or signed media.
Staff must confirm the original request matches the exact target. The atomic
command checks the target fingerprint under a lock, requires an internal rationale,
uses a stable receipt and creates a single classification-matched report. The external
requester is not made into a member; reporter_id is NULL and contact details remain
in the private intake. Existing critical-report quarantine applies to supported
content types; a profile photo still needs the normal moderation decision.
No account ban or final violation finding occurs merely from this handoff.

Shared exceptions, guarded against unexpected function source:

- `trg_enforce_write_rate_limit`: allow only a reserved, verified employee handoff;
  keep normal member reporting and its rate ledger unchanged.
- `publish_reporter_visibility_change`: skip NULL-reporter member delivery.
- `trg_report_notify_admin`: skip the generic report email only for an exact
  external-linked NULL-reporter report. Use the minimal intake alert instead.

Rollback: `docs/drafts/external_takedown_staff_bridge_rollback.sql` restores captured
definitions only when installed hashes still match, refusing to overwrite newer work.
The real production preflight must additionally pin complete live function hashes.

## Durable urgent alert contract

Owner selected faheygs@gmail.com. Email contains only the opaque reference, deadline
and the correct portal queue link; no requester/contact/content details. Only
high/critical cases enqueue urgent email; ordinary cases remain in moderation.
Cloudflare REST is used only for these new alerts. No new Worker or paid sending-domain
onboarding is needed. The sender is fixed to safety@dojipro.com and the recipient to
the owner-selected verified destination. Each dispatch verifies the destination before
claiming work; failure closes the send path. Existing member/login/operational Resend
paths remain unchanged. `external_takedown_alerts_v1.sql` claims at most three leased
jobs and freezes the envelope. Cloudflare does not document idempotency keys: delivery
is bounded at-least-once, not exactly-once. A lost response or acknowledgment can produce
a duplicate with the same case reference. The X-header is correlation only.
Retries stop after 23 hours or 24 attempts as an operational ceiling, not a provider
deduplication window. Bounces, suppressions and permanent rejections need operator
attention. Delivered/queued recipient outcomes and the actual provider message ID are
validated before acceptance. Queued acceptance is not delivery; recipient-server
delivery is not proof of inbox placement or reading. Later queued delivery/bounce
qualification remains a release gate.

`external_takedown_alert_wakeup_v1.sql` prepares an insert wakeup and a disabled
configuration. It does not install an active cron job or Vault secret. A separately
approved five-minute server recovery job would service due alert work only; it does
not participate in challenge scheduling or handset correctness. Production activation
requires verified existing allowances, exact endpoint/Vault configuration, delivery and
bounce handling, and a responsible operator checking pending/failed work.

## Verified local evidence

- `node scripts/test-safety-removal-local.mts`: real-role offline PostgreSQL
  transaction passed and rolled back. Permissions/MFA, receipts, deadlines, alert
  leases and backoff, stale-target rejection, one-report retry, original member report
  behavior, existing moderation removal, member appeal and staff reversal passed.
  Closing a restored target as removed is rejected. Three guarded trigger rollbacks
  restored the prior function/grant/policy baseline.
- `node scripts/test-safety-removal-concurrency.mts`: isolated offline clone passed
  eight duplicate intake submissions, conflicting staff updates and exclusive alert
  claims. This does not prove every staff-bridge target branch under concurrency.
- `node scripts/test-safety-removal-edge.mts`: mocked intake and dispatcher checks
  passed, including security verification, projection, safe alerts and provider retry.
  No actual email sent.
- Full admin browser regression: 129 passed, two public-only tests skipped in that
  run. Focused intake suite subsequently passed 8 tests, including exact target
  confirmation, stable ambiguous retry, identity mismatch, late response after lock,
  and the centered confirmation/Back path preserving drawer rationale. Syntax and
  targeted whitespace checks passed after the final presentation change.
- Existing `website/admin-portal/live-client.test.mts` passed. Four public preview
  browser tests passed: receipt/accessibility, mobile form, ambiguous retry retaining
  receipt identity, and private status with a fixed in-flight identity/literal response.
  These use mocked endpoints/security checks; not evidence of live delivery.

## Remaining launch work (do not silently enable)

Operating coverage confirmed by owner September 29: urgent alerts go to the
existing administrator inbox, including weekends; owner will arrange backup
when unavailable. The receipt-based deadline is unchanged by email delivery or
opening. This satisfies the coverage-confirmation gate, not the technical gates.

Local design revision: the safety page now selects the existing light control theme,
uses public-site colors and a compact hero, groups the original fields into three
sections, and places process guidance beside the form on desktop. Phone layouts stack
without horizontal overflow. No submitted fields, API behavior, permissions or backend
contracts changed. The preview banner is local-artifact-only; submissions remain disabled.

- Qualified production artifact with discoverable Safety links and path-scoped CSP;
  `website/.safety-preview` is local-only and must not be deployed as the public site.
- Production schema/read preflight, exact change manifest, no-cost allowance checks,
  approval and staged deployment of database, disabled Edge services, portal and site.
- Test the complete real receipt → minimal operator alert → exact-target review →
  moderation → private requester status path before public acceptance is enabled.
- Qualify comment/poll/profile-photo enforcement and actual old-media URL access,
  known-copy handling, legal holds and retention. Current staff attestation is not an
  automatic revocation mechanism or a substitute for this work.
- Confirm operating coverage and public policy wording. No claim that these local
  tests establish legal compliance or complete production readiness.

## Primary references checked September 28

- https://www.ftc.gov/business-guidance/resources/complying-take-it-down-act
- https://support.google.com/legal/answer/3110420?hl=en (category-led routing example,
  not a universal legal requirement or copied taxonomy)
- https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- https://www.congress.gov/119/plaws/publ12/PLAW-119publ12.pdf (section 3)
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://supabase.com/docs/guides/functions/schedule-functions
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
  (unguessable secret, safe storage and uniform failures; status is not password reset)
- https://developers.cloudflare.com/pages/configuration/headers/
- https://developers.cloudflare.com/turnstile/reference/content-security-policy/

## Category expansion — local candidate, September 28

Owner explicitly approved one route with category selection and correct queues.
`scripts/sync-safety-taxonomy.mts` generates the public choices and private SQL
allowlist from `lib/reportingTaxonomy.ts`; default mode fails on drift, `--write`
mechanically regenerates. Member taxonomy/code is unchanged. Critical leaves route
to restricted safety, self-harm/violence ordinary leaves retain high priority, and
other leaves retain normal moderation priority. Other categories use a 24-hour
internal review target, not a claimed statutory removal deadline. Initial receipt
anchors every target; closure/reopening cannot extend it.

The form resets reason and declaration consent when classification changes; NCII
shows tailored statement/declaration and the 48-hour qualifying-request notice.
Third-party concerns are accepted without falsely signing as the depicted person.
Child-safety selection gives concise handling guidance. Intellectual-property intake
is explicitly a policy-review request, not an asserted complete DMCA notice or proof
of registered-agent status. The public page is not NCMEC's Take It Down service.

Both ordinary and restricted intake use the existing portal views, shared select
enhancer and side drawers. Exact-target handoff preserves the allegation's category;
ordinary handoffs do not quarantine. Case IDs, public secret, requester identity and
exact content ID remain separate. Arbitrary existing-report linking is disabled;
the verified handoff owns the association. NCII closure requires known-copy review;
all removal closures require existing final moderation plus access-verification notes.
Account enforcement remains a separate existing moderation decision; intake does not
pretend an account was deleted. Reclassification is not exposed in this candidate;
original allegations remain immutable. A production operating procedure must cover
misclassified/multi-category requests and staff escalation before launch.

New verification: all 34 server mappings, forged queue rejection, invalid reason-pair
rejection, changed-category receipt rejection, ordinary/restricted role matrix on
all case entry points, exact account handoff/replay and target compatibility passed
offline. Existing member reporting, removal/appeal/reversal and guarded rollback
still pass. Concurrent request/command/alert tests passed in a disposable offline
clone. Mocked Edge validation/alert tests and authentication-client tests passed.
Public browser suite: 10 passed, including dynamic guidance, no-preview-submission,
desktop/mobile alignment and accessibility. Focused admin intake: 9 passed before
final completion-field tightening. Full admin browser regression: 132 passed,
10 public-only tests skipped (the separate public run passed all 10). The final
focused admin run also passed all 9 after completion-field and dropdown changes.

The preview is interactive for choosing categories but both submission and status
requests remain disabled. No production database/Edge/site deployment, real email,
member build, cost, provider change or public discoverability change occurred.
The production gates above still apply; local tests do not establish legal compliance.

Dropdown correction: the public form now consumes the same extracted
`website/portal-select.js` component as the admin/business portals, with shared CSS,
labelled comboboxes, dependent-option refresh and keyboard behavior. It does not load
portal authentication, storage or admin runtime code. Tests choose visible options
instead of setting hidden native selects. Production remains unchanged.
Shared-component verification: 132 admin browser tests passed, 11 public-only cases
skipped there; the separate public suite passed all 11, including open-menu axe,
keyboard selection/Escape and desktop/phone screenshots inspected after the fix.
Website local-link validation and JavaScript syntax checks passed.

## Public discovery / release packaging preparation

`node website/prepare-safety-site.mts` now produces a fresh, explicit-file-list
review overlay under `test-results/safety-site-candidate-*`. It is deliberately
NOT a complete deployable site. No deploy or activation command is included.
`manifest.json` outside the served directory records input/output SHA-256 hashes,
`deploymentReady: false`, `acceptingRequests: false`, and remaining release gates.
Never run Pages deploy against this overlay or the entire source website folder.

The candidate adds Safety & removal and Child Safety navigation to nine public
pages, including home, support, Terms and Privacy. Support has separate content
reporting and moderation-appeal routes. The appeal destination was checked against
the current Settings → Account status route; the public intake is not an appeal
submission endpoint. Existing legal article bodies and effective dates are preserved.
Candidate-only public text uses the existing accessible safety accent after the
browser found the older orange text below contrast requirements. This scoped class
does not change existing portal/business themes.

Security headers use non-overlapping document rules; Turnstile scripts/frames and
the exact intake endpoint are allowed only on the safety path. Cloudflare documents
that matching duplicate header values are combined, not last-rule overrides. The
candidate therefore avoids relying on a permissive second CSP overriding a stricter
global one. Safety assets/config are no-store and referrer policy is no-referrer.
Production header behavior still requires actual Pages readback after approval.

`node scripts/test-safety-site-candidate.mts` passed: exact file/hash inventory,
local navigation, legal-body equality, non-overlapping headers, disabled intake,
no external requests, 390/1440px overflow checks, and zero axe violations on Support
and the disabled intake at both widths. Phone Support screenshot visually inspected.
Evidence: `test-results/safety-site-candidate-B6vRri/verification.json` plus screenshots
and manifest. Website validation and the 34-leaf taxonomy drift check also passed.

Before deployment, merge reviewed assets into a verified complete live-site snapshot,
preserving business/admin routes and their headers; compare shared CSS against that
baseline rather than bundling unrelated dirty-worktree changes. A source hash is not
proof of the currently deployed version. Then complete backend fingerprint/member
canaries, existing allowance verification, alert delivery/recovery, real end-to-end
receipt/status and actual media-access qualification. Hosting/release approval is
now recorded above. No live site, backend, cases, emails, billing or member behavior changed.
