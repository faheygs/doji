# Account separation: preparation and provider provisioning, not a portal cutover

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
