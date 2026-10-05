# Business applications and verification — prepared, not live

## Scope and status

Continuation: see `BUSINESS_ONBOARDING_IMPLEMENTATION_2026-09-29.md` for the
default-off admission handler, applicant/reviewer candidates and updated evidence:
115 offline assertions, six overlapping transaction scenarios, 25 handler tests,
14 client tests and 16 browser tests. These supersede the initial 81-check/no-
concurrency evidence below. Real Auth/email, private realtime, production admin
integration and no-new-cost release gates remain open; nothing is deployed.

The owner approved preparing the applications/verification foundation after the
local business UX pass. This is a separate shared-backend candidate, not routine
portal deployment permission. No business Auth users, production SQL, gateway
routes, email, billing, campaign publishing or mobile changes were released.

Implemented draft: `docs/drafts/business_applications_v1.sql`. It stays outside
`supabase/migrations`, defaults disabled, has no configured legal versions, and
does NOT grant the proposed role to PostgREST's `authenticator`. Neither the
current local business prototype nor the deployed admin portal calls it.

This increment completes the draft data/command boundary and offline qualification,
not end-to-end onboarding. The remaining identity, transport, UI, operating-policy
and launch-cost gates below are required, not optional follow-up polish.

## Identity and member impact

- Propose a new `doji_business` NOLOGIN/NOINHERIT role in the existing project,
  distinct from `authenticated` members and `doji_employee` staff. Separate Auth
  UUID and verified address; never convert a member/employee or reset their password.
- Every applicant command checks JWT role plus live Auth role, server-owned
  `account_type=business`, confirmed email, ban state and a private disabled flag.
  `user_metadata` does not authorize anything. Existing profiles/employees are denied.
- Confirmed AAL1 identities may complete an application. The approved workspace
  requires AAL2. Initial preparation offers only an owner membership, not an
  incomplete team invitation/role-management system.
- Staff reads use existing employee AAL2 + `business.read`; decisions additionally
  require existing `admin.manage`. Current `business_reviewer` is read-only; no
  existing permission matrix is broadened implicitly.
- No member profile, economy row, push endpoint, global session setting, age-hook
  change, member query/RLS grant, scheduler, Worker or mobile code change.
- Infrastructure remains shared. Additional Auth/API/storage/outbox work competes
  for existing resources; bounded work and no-cost headroom must be qualified.
  Separate roles are not physical isolation and are not a zero-risk guarantee.

## Data and command contract

All new rows are private, RLS-enabled, and have no direct client or service-role
table grants. Public entry points have exact role grants in the same transaction.
The installation refuses unexpected effective PUBLIC function/table privileges;
the only legacy helpers allowed are exact source/signature/security fingerprints
already reviewed for the employee boundary. No existing grant is revoked to make
business isolation pass.

One applicant owns one application in the initial bounded pilot:

`draft -> pending -> approved | declined | changes_requested -> pending`

Approved/declined applications can be explicitly reopened into changes requested.
Reopening an approval suspends the organization in the same transaction. Reapproval
reuses its ID and owner membership. It does not mint a duplicate organization.

- Save and submit are atomic commands with a UUID request key, canonical payload
  fingerprint, current revision and durable receipt. Actor/application locks protect
  competing writes; stale revisions fail with `40001`. A changed intent must use a
  new request ID. A retry returns the original outcome plus the current authorized
  application, so a historical successful save is not mistaken for current approval.
- Submitted fields and accepted legal-version identifiers are snapshotted. Editing
  after changes requested never overwrites that snapshot. Staff detail/queue use
  the last submitted version, not unsent applicant drafts. Maximum 50 submissions.
- Applicant fields: legal name, brand name, public HTTPS website, two-letter country
  code, business address, representative name/role, category and intended purpose.
  No logos/uploads, ID documents, card/tax details, arbitrary requester email or
  client-selected status/organization/role. URLs are recorded, never fetched.
- Details are bounded to 8 KiB, supported string fields only, each at most 1,000
  characters and without control characters. Complete submissions require all fields
  and exact configured application/privacy versions. The website field uses a
  conservative HTTPS host allow-shape, not proof of domain ownership or safety.
- Each review requires applicant-visible response and separate internal rationale.
  Applicant reads never return internal notes or employee identity. Staff decisions
  append the existing admin audit with exact application/revision/submission IDs.
- Approval atomically creates/updates organization and owner membership. It grants
  only the proposed empty workspace; campaigns and billing are explicitly false.
- Staff pages are status-filtered, oldest-update-first `(updated_at,id)` keyset reads,
  25 default/50 maximum. Reads have no synthetic counts or unbounded history scan.
  Detail includes at most 30 history records and the latest submitted snapshot;
  older-history/version pagination is still needed for a complete long-lived UI.
- Applicant successful changes are capped at 60/hour per identity. Receipt replays
  do not spend another slot. This is NOT an HTTP or unauthenticated abuse limiter:
  registration, sign-in, reads and rejected commands still need transport budgets.
- Actor IDs are retained opaque identifiers, not cascading member/profile FKs.
  Deleted Auth users cannot reuse old JWTs to read. Account deletion/retention and
  correction procedures for business PII still need an approved policy and command;
  this draft does not promise indefinite retention or silently erase audit evidence.

## Proposed endpoints and client lifecycle (not connected)

| Actor | Prepared RPC | Intended UI |
| --- | --- | --- |
| Applicant | `get_business_application_v1` | Own application/status, no caller-supplied tenant |
| Applicant | `business_application_command_v1` | Save or submit exact revision |
| Approved owner, AAL2 | `get_business_workspace_v1` | Own active organization, no campaigns/billing |
| Staff, business.read | `get_admin_business_applications_page_v1` | Bounded verification queue |
| Staff, business.read | `get_admin_business_application_v1` | Exact submitted form and private review notes |
| Staff, admin.manage | `admin_business_application_command_v1` | Approve, decline, request changes, reopen |

Reuse existing themed inputs, shared dropdown, right-side record drawer,
confirmation and contextual errors. Do not wire live credentials or data into
`setupBusinessPortal()`'s sample/localStorage workflow. Production mode must have
an explicit transport and no demo fallback; no browser service-role key.

The candidate commits identifier-only `business.application.updated` on
`business:<applicant UUID>:events`; submit/review also emit
`moderation.business.updated` on the existing staff moderation topic. Payloads
contain only application ID plus `sendPush:false`, never PII or notes. Draft saves
do not create staff review events. No email producer or phone alert is added.

Before activation, provide a business-only token issuer with exactly its own
private capability; do NOT let businesses reuse member/admin issuance. Qualify
the existing relay's handling of the new topic before enabling the producer.
Client session epochs, logout cleanup and targeted coalesced invalidation must
refresh application/workspace on those events and on foreground/reconnect.
Revocation clears all protected browser state. Missed events reconcile through
authorized reads, not polling. Staff events must refresh only business surfaces,
not create a new all-queue fanout on every applicant save.

## Offline evidence

`node scripts/test-business-foundation.mts` uses only the existing synthetic
`supabase_db_employee-cutover-verify` PostgreSQL container. It verifies network mode
`none`, no published ports, empty Vault and test-only Auth addresses before work.
The complete draft, fixtures and write-pause rollback run in one transaction that
is rolled back. Deliberately leaky PUBLIC grants are separately tested to reject
installation and roll back. No production credentials or data are copied.

81 assertions passed, including:

- default-off, exact role access, forged identity, absent verification authority;
- no member profile/media/RPC access, no business staff access, staff MFA and scope;
- draft/submit, complete/invalid details, legal-version matching, exact retry versus
  payload mismatch, stale write rejection, immutable submissions and private drafts;
- requests for changes, decline, approval, reopen/suspend, same-ID reapproval;
- cross-business reads, private reviewer notes, disabled/deleted identity denial;
- request budget, keyset cursor/timestamp tie break, no member profile creation;
- audit/receipt deduplication, identifier-only/no-push events;
- ALL preexisting public function definitions/grants and table grants/RLS/policies
  preserved in the offline schema; rollback retains submitted evidence and receipts;
- unexpected PUBLIC function/table grants fail closed.

Machine-readable result: `test-results/business-foundation-20260929/database-result.json`.
This is a retained restored schema, not a fresh hosted clone. Single-connection
replay/stale-write checks are NOT simultaneous transaction qualification. Real
parallel duplicate-submit/review/revocation races, hosted Auth and HTTP/session
flows, current-schema drift, full transport, browser and member-device regressions
remain unqualified. No business production-readiness claim follows from this suite.

## No-new-cost review

This preparation uses the already-running offline local PostgreSQL environment;
no hosted branch, cloud project, package/service purchase, deployment, email send
or billing change occurred. There is no added provider cost from this work.

Existing project/provider usage headroom has NOT been freshly verified for business
launch. Prior safety-email checks only proved fixed verified-destination delivery.
They do not authorize or establish free sends to arbitrary applicants. Use the
existing transactional email service only after a read-only quota/usage check and
a bounded reservation that leaves headroom for member and safety traffic; do not
onboard a new Cloudflare sending domain or silently enable overages.

Before registration: record current Supabase Auth MAU/Edge/database/egress headroom,
Cloudflare/Ably usage and current email remaining quota/spend protection. Preserve
all settings. Reserve a small capped pilot registration/resend budget, fail closed
when it is exhausted, and reuse free TOTP rather than SMS. Spend caps cover only
certain items and quota exhaustion can restrict service: do not use shared quota
exhaustion as the business admission-control mechanism. No capacity purchase is
approved. If current allowances cannot safely cover it, stop before launch.

## Controlled release and rollback (not executed)

1. Complete isolated registration/sign-in/resend/reset: server-owned role at Auth
   creation, duplicate/member/employee requests generic and non-mutating, no fabricated
   DOB or global auth hook replacement. Verify identity class BEFORE password exchange,
   as the employee handler does, to avoid creating an unintended member session.
2. Qualify local Auth create/confirm/login/refresh/MFA/recovery/expiry/deletion;
   verify same-email member/employee collisions never convert accounts. Complete
   registration/read/write abuse budgets, legal text/retention and signup-support UX.
3. Run real parallel transaction tests plus a fresh schema/grant/role baseline.
   Verify member signup/profile/feed/comments/participation, member realtime/push,
   admin login/MFA/logout, and existing employee command regressions unchanged.
4. Produce an exact isolated database release with flags off, fixed endpoint/origin
   allowlists, private business realtime and no shared Worker/billing deployment
   bundled in. If shared routes or Auth configuration must change, present that exact
   diff and member-impact/regression/rollback evidence for separate release approval.
5. Fresh no-cost usage check. Owner approves application/privacy terms, minimum
   verification checklist, retention/deletion and initial admission budget. Terms
   must describe applications, not acceptance of unimplemented campaigns or payments.
6. Only after approval, grant exact role membership to authenticator, connect the
   independently packaged business UI/admin queue, and canary one explicit business
   test identity. Verify email delivery, all lifecycle states, closed permission
   boundaries and retained personal member sessions before public registration.
7. Campaigns, invitations, assets, analytics, billing and sponsored mobile content
   remain separate scopes. Business approval never means approval to publish a Doji.

Rollback: stop registration/sign-in and new business commands, disable the private
settings flag, apply `business_applications_v1.rollback.sql`, roll back only the
qualified business/admin artifacts and stop business-only subscriptions. Drain
bounded in-flight commands before declaring the pause complete. Retain Auth IDs,
organizations, snapshots, consents, receipts and audit. Do not drop schema/data,
change member/employee sessions or replace any member function. Retention deletion
is a distinct authorized operation, not release rollback.

## Primary-source basis (checked September 29, 2026)

- [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles): role
  separation and PostgREST authenticator switching; role membership alone is not
  tenant authorization.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security):
  do not trust mutable user metadata for authorization; live server records remain
  authoritative when role/token information is stale.
- [PostgreSQL 17 CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html):
  fixed safe search path, exact function grants and removal of default PUBLIC execute.
- [OWASP multi-tenant security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html):
  authorize tenant/resource on every request, including caches and queued work.
- [Supabase cost controls](https://supabase.com/docs/guides/platform/cost-control):
  spend-cap scope and restriction risk, not a blanket zero-cost guarantee.
- [Cloudflare email pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
  and [limits](https://developers.cloudflare.com/email-service/platform/limits/):
  fixed verified destinations are distinct from arbitrary outbound recipients.
- [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits):
  provider account quota must be checked; documentation is not current account usage.

The state machine, proposed pilot limits and conservative approval permissions are
Doji design decisions informed by those sources, not claims that an industry standard
requires these exact numbers or that legal compliance has been certified.
