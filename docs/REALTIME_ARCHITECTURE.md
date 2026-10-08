# Doji authoritative realtime architecture

October 6 MDT expanded mobile diagnostic candidate (LOCAL ONLY): a dedicated random
installation ID is stored asynchronously on the handset, with per-process/account-
transition session IDs. This is not a server identity, authorization input or push
registration key. Request-local snapshots and WeakMaps keep errors attached to the
original session; an account transition clears the bounded in-memory timeline.
No member identifiers or content are added to API telemetry. Code-owned screen and
endpoint templates, concurrency, capped timing, safe SDK-native device facts and
first/final retry evidence are included. Other JS errors are labeled processing-time,
not request-time. Existing native Sentry scope receives only diagnostic correlation
tags; native-envelope acceptance remains unverified until device testing.

The SDK-matched `expo-network` 57.0.2 listener plus startup/foreground state reads
are passive OS observations, not network probes or recurring polling. They neither
set TanStack online state nor change query execution, transport, retries, auth or
reconnect handling. Stale async snapshots lose to newer events and post-cleanup
callbacks are ignored. Success/recovery entries stay in the bounded local timeline;
they are not extra Sentry events. Privacy allowlists, failure budgets and grouping
remain in force. No server, Worker, database, event payload, invalidation, durable
alarm, participation-window, push or portal deployment is included. New iOS/Android
binaries, native acceptance and store disclosure review remain separate release gates.

October 6 MDT iOS diagnostic parity (LOCAL ONLY): request-scoped JS evidence and
shallow Sentry retry context now apply to both mobile platforms. iOS command error
conversion preserves the final request's phase, bounded timing, app state and
allowlisted response correlation hints. Existing text/json consumers are observed;
logging does not consume or clone bodies. Android native hints remain Android-only.
No event, invalidation, reconciliation, subscription, polling, alarm, push, session,
request/retry/deadline or server contract changes. No recovery or network-transition
events are introduced. Local JS/SDK tests are not native iOS acceptance or a shipped
fix; iOS build 103 remains unchanged and a new release is separately gated.

October 6 admin browser cleanup follow-up: a failed server sign-out is reported
separately from access invalidation. Expiry still clears protected data and stops
realtime locally, but a cleanup failure cannot recursively reset the sign-in UI
or enqueue another logout. No new polling, subscriptions, token lifetime, provider
or server contract is introduced. The credential form becomes visible only after
startup/session restoration settles. Member and business sessions are untouched.

October 6 UTC employee endpoint v14: workflow-enabled token issuance authorizes the
current employee session and exact staff-channel allowlist. It no longer calls the
moderation-only legacy capability RPC for business-only reviewers. Legacy
`moderation:global`/`doji:global` subscribe grants require moderation authority in
both fresh checks; a limited reviewer receives only their allowed staff topics.
The main admin browser follows that same distinction. Flag-off behavior and
member token issuance remain unchanged. This changes only the employee resource
module; no relay, schema, role, provider/session or paid-setting change occurred.
The 15-minute TTL remains explicit: revocation blocks new authorized reads/tokens,
not already-issued identifier-only subscriptions immediately. Live synthetic
delivery, renewal across the original token expiry, reconnect/release delivery and
revoked-access denial all passed; temporary provider access was deleted and
labelled audit retained. Main admin Pages `04c55826-80a5-4923-a2fa-33a7d4d4f38b`
was promoted at 04:42 UTC with existing Worker/configuration preserved. Member
issuance and shared relay behavior are unchanged. See the promotion record in
`ADMIN_WORKFLOW_FOUNDATION_2026-10-05.md` for final evidence.

Historical October 5 MDT / October 6 UTC gated staff-workflow release: the separately
approved gated employee preview is live at `/identity/employee-preview/`, with
employee endpoint v13 and all three workflow database gates enabled. The current
admin homepage, business/public deployments, shared relay code/config and member
Supabase authentication are unchanged. Ten additive staff-only hint triggers use
the existing durable outbox; four concurrently-created indexes are valid/ready.
Existing member/domain functions, ACLs and RLS fingerprints were preserved.
Hints remain identifiers only and lead to authorized, bounded reads; no polling.
The existing owner session and queue/review reads work. A connected realtime
indicator does not prove actual event delivery. Existing 15-minute token TTL is
unchanged; current authority is checked on reads, with no immediate subscription
revocation claim. Full provider/token/reduced-role hosted acceptance and root
promotion remain pending. Shared gate/trigger/outbox overhead still exists.
Rollback fences all gates before restoring employee v11/admin baseline, then
removes only candidate grants/triggers, retaining ownership/history/indexes.
See `ADMIN_WORKFLOW_FOUNDATION_2026-10-05.md` for exact evidence and limits.
The following preparation history describes earlier default-off states and is
superseded by this release status.

October 5 MDT staff-workflow preparation: `staff_case_ownership_v1.sql` is a
disabled local candidate for business/idea ownership only. It emits no events,
push or applicant messages and creates no polling. Activation is blocked until
targeted staff invalidation and remaining-source integration are qualified. The
independent employee bridge and default-off browser workspace are locally tested.
Existing portal view/session/foreground reconciliation invokes bounded, coalesced
two-source reads when visible; no timer polling or new event producer was added.
Session epochs/generations prevent late responses restoring data after lock, and
source/ownership versions prevent stale confirmed commands. Enabling the candidate
in production remains separately gated.
Subsequent owner-approved LOCAL expansion adds `staff_workflow_extended_v1.sql`
and `staff_workflow_events_v1.sql`, both disabled by default. The bounded six-source
read uses current employee authority; the employee bridge accepts only fixed
operations and verified MFA identity. In the isolated database only, enabling the
gates produces durable outbox events in the same transaction as source/ownership
changes. Topics are `staff:workflow:{moderation,restricted,ideas,business,privacy}`.
Case events contain only kind/ID; queue-only events contain kind, with no case ID
for former audiences, deleted reports/appeals or appeal-dependency changes.
Account-action and original-decision changes invalidate the affected appeal queues.
Receipt retries create no duplicate write/event; rolled-back writes leave no event.
Local six-source qualification now measures absent/disabled/enabled candidate
triggers with real source updates and per-sample rollback: disabled/absent emit
zero staff hints; enabled emits exactly one. Shared gate reads/locks and durable
outbox writes still have overhead. An open employee inbox transaction coexists
with an ordinary member profile read and atomic report command in the isolated
database; this bounded test is not production load or provider delivery evidence.
The local employee resource adapter now optionally adds only the database-returned
allowlisted staff channels to its existing subscribe-only token. The server runtime
flag defaults false; no production config is enabled. The fixed `/staff-workflow/channels`
route provides the same authorized list to the independently authenticated employee
browser. Unknown/wildcard/duplicate channels are rejected before signing/subscribing.
No member token is used. Existing realtime token TTL remains 900,000 ms: this is
not an immediate provider-side revocation mechanism; reduction/revocation behavior
must be qualified before release and current authority is rechecked on all reads.

`workflow-events.mts` consumes the actual relay's flattened payload envelope,
deduplicates up to 128 event IDs, and coalesces bursts using one event-driven 250 ms
timeout (not interval polling). Staff hints refresh the authorized inbox and open
review state, not the entire dashboard. Existing review reconciliation preserves
drafts; ownership confirmations are not silently rewritten or submitted. Hidden
documents do not consume hints into reads; foreground/reconnect reconciliation
fetches current state. Lock clears queued work and epoch checks fence late callbacks.
Offline compiled-portal tests exercise the subscription-to-inbox path. No shared
relay code/config changes were needed: its existing generic publisher and message
builder support these topics. Provider delivery has not been tested or enabled.
No polling is added. Even disabled triggers read a shared settings row: this is not
physical isolation or proof of zero member performance impact. Production lock,
cardinality, competing-load and full member regression review remains gated.
The retaining rollback disables both gates and removes the ten candidate triggers,
preserving ownership/history/receipts and already committed identifier events.

Existing report/takedown ownership,
domain decision commands, member authorization and realtime behavior are unchanged.
See `ADMIN_WORKFLOW_FOUNDATION_2026-10-05.md` for qualification and remaining gates.

October 5 MDT / October 6 UTC business session-flow release: the access entry
hands its already verified in-memory business client to the application controller
inside the same document. It removes one redundant session read and document load;
direct application entries still restore through the existing server boundary.
Existing atomic commands, session epochs, sign-out cleanup and bounded foreground/
online reconciliation remain intact. No polling, new events, subscription,
backend/Worker configuration, member or employee change. Hosted provider navigation
and MFA remain authoritative and unchanged. Exact-artifact browser tests and live
static/access-boundary checks passed; owner-session acceptance remains pending.

October 5 business submission repair: the independent applicant UI snapshots its
rendered form before the existing atomic Save/Submit command, so defaults/autofill
are included. No additional writes, retry, polling, event or backend changes. The
existing concurrency and idempotency controls remain intact; all changes are in
business static scripts. Owner signup succeeded; post-fix submission is pending.

October 5, 20:10 UTC account-form presentation: business registration collects an
email and forwards it as an untrusted WorkOS UI hint after existing authorization
URL validation. No new API, storage, polling, event or session-authority contract;
verified provider identity remains authoritative. Only three static account-page
assets changed; proxy/runtime/config and member/employee systems are unchanged.

October 5 public business homepage: the domain root is now a static marketing
entry with explicit Sign in/Register links, not an application redirect. It makes
no session/API read and creates no polling, subscription or realtime work. The
business-only presentation deployment leaves the bundled proxy/runtime, database,
auth providers, member/employee contracts and business realtime gate unchanged.

October 5, 19:12 UTC business activation: owner-approved independent business
realm, session, registration, enrollment, reads, commands and privacy gates are
enabled with the retained ten-account cap and October 7 expiry. WorkOS password
sign-in is enabled. Existing business realtime remains false; no new event
producer, polling, subscription, Worker, push, challenge alarm or release-policy
change was made. Member/employee contracts/settings and other deployments passed
bounded preservation checks. Real owner signup/application/recovery acceptance is
pending. The account-separation release record contains the exact retaining freeze.

October 5, 19:04 UTC business connection update: the independent business Edge
runtime and Pages proxy are deployed; WorkOS's signed registration test succeeded
with Deny while database admission remains closed. The only hosted forwarding fix
discards Supabase's upstream infrastructure cookie; business-auth cookie validation
remains fail-closed. No realtime producer, polling, member authentication, Worker,
push, alarm or release-policy change was made. Business realtime stays disabled.
Final business activation and real owner signup/recovery are still pending.
The following entries are historical preparation states.

October 5 business workspace MFA (LOCAL / STAGING ONLY): verification uses the
existing serialized encrypted business-session lease and exact WorkOS subject,
session and challenge bindings. Approved workspace reads still use the existing
authorized SQL contract; no client-owned organization or approval claim is trusted.
There is no polling, new event producer, subscription, member call, push, alarm or
release-policy change. The browser clears private state on logout and rejects late
responses. Real staging first-enrollment and existing-factor verification passed;
the production endpoint remains disabled and the business Pages cutover is pending.

October 5, 16:47 UTC business bridge installation: the reviewed business enrollment,
reads, commands, registration and review overlays are installed but their gates
remain disabled. Six existing business-only function definitions changed; existing
grants, RLS, member/employee contracts and employee settings were verified preserved.
The rollback rehearsal restored the six original definitions exactly. No realtime
producer, subscription, polling, push, alarm or release-policy change was deployed.
Business realtime remains disabled. Following explicit owner approval, the separate
SQL login was installed and verified at 17:02:25 UTC with two connections and only
four reviewed role memberships. TLS and disabled-gate checks passed; existing
member/employee contract fingerprints and isolation guards were preserved. The
credential remains local; no Edge runtime credential, WorkOS setting or Pages
cutover occurred.
Earlier LOCAL ONLY notes below record preparation before this disabled installation.

October 5, 16:38 UTC disabled business endpoint installation: only the exact
`business-portal-v2` function and `BUSINESS_V2_ENABLED=false` were installed.
It denies requests before session/provider/SQL initialization, so no business
producer, subscription, polling or member work is enabled. Existing functions,
secret values, RPC/RLS/role fingerprints and Pages deployments were verified
preserved. No Worker, database, push, alarm or release-policy deployment occurred.
Shared secret installation refreshed existing function version metadata once;
anonymous boundary checks matched before/after, not a continuous availability proof.

October 5 business runtime/browser assembly (LOCAL ONLY): the independent business
application renderer preserves drafts on revision conflict, clears protected state
before sign-out completes, and reconciles authorized reads on online/foreground
events without polling. Writes still use the existing atomic command adapter.
The new Pages proxy forwards business-only cookies to its exact dedicated endpoint;
it does not forward employee credentials or copy the employee Oregon routing pin.
No member reads, channels, push, activation/close alarms or release policies change.
Application onboarding is not approved-workspace MFA or provider-erasure acceptance.

October 5 business review compatibility (LOCAL ONLY): the new
`drafts/portal_identity_business_review_v1.sql` overlay resolves staff approval
against the independent business principal, preserving the existing atomic review
command, receipts and identifier-only event behavior. Identity/realm shared locks
precede the account lock to serialize decisions with revocation. Privacy correction
and closure retain their existing business-only commands; legacy Auth erasure is
denied for independent principals pending a directory-specific executor. No event
payload, channel, alarm, push eligibility, polling or member session changes.
Business realtime, billing and campaign publishing remain disabled. The offline
clean-room regression passed October 5 at 14:37:55 UTC; no live rollout occurred.

October 4 MDT / October 5 UTC TypeScript migration (LOCAL ONLY): identity boundary
source imports are moving from `.mjs` to strictly checked `.mts`. This changes no
realtime event, authorization grant, channel, alarm, push, member session or
deployment. Business realtime stays disabled. The approved business identity
follow-up must preserve atomic commands and the existing member/portal release
boundaries. Historical release artifacts are not rewritten; current source needs
new packaging/regression evidence before any separate deployment.
Browser health/help, shared dropdown/theme, business MFA/verification,
business realtime/form rendering, account access/application pages, identity returns,
admin client/editorial/business-review/privacy/safety-review, employee setup and preview configuration have
maintained TypeScript sources. A build-only registry compiles those files to the
same public `.js` URLs; coverage instruments their maintained `.mts` sources.
This is not a realtime rewrite or a new client polling mechanism.

October 3 MDT / October 4 UTC (LOCAL ONLY): Android 26 feed-504 investigation
confirmed a diagnostic attachment defect, not a realtime or backend root cause.
Expo's global fetch bypasses the old RN-only hook. The candidate attaches the
same bounded observer directly to the pinned Expo Android client and covers
authorized gateway read paths as well as direct REST reads. No global factory,
request, retry, cache, lifecycle, event, Worker, database or iOS behavior change
is intended. A separate no-INTERNET emulator probe now verifies actual Expo/JSI
native annotations through final Sentry JS normalization (28 assertions, three
runs). This synthetic integration result is not full member-app release/device
qualification, real-network recovery or production 504 reproduction.
See `ANDROID_26_FEED_504_INVESTIGATION_2026-10-03.md`; production 504 origin remains
unresolved and the correction is not yet deployed.

October 3, 23:22 UTC: Android release policy now requires 1.0.8 (26), following
100% Alpha availability and current owner-confirmed eligibility for all Android
users. iOS 1.0.8 (103) is unchanged. The guarded configuration transaction and
live public/authenticated policy RPC checks passed. No event, lifecycle, push,
schema, auth or transport change; policy discovery remains query-mount based,
not guaranteed ordinary foreground refresh. See the Android 26 release record
for rollback and evidence; tester installation is not asserted.

October 3, 20:02 UTC: the explicitly owner-authorized iOS release-policy row now
requires 1.0.8 (103); Android remains 1.0.8 (23). This configuration-only guarded
transaction relied on owner-confirmed store availability and passed live policy
RPC reads. No event, push, auth, schema, transport or lifecycle change occurred.
The existing policy query refreshes on mount, not guaranteed ordinary foreground;
full close/reopen initiates a fresh read. Evidence and rollback are recorded in
`IOS_URI_SECURITY_BUILD_103_2026-10-02.md`.

October 3 Android follow-up (Android 26 building, not on Play): request-local diagnostic
snapshots now include start/failure AppState, Android API level, fetch count/method
and JS text/json consumption state. Native hint v2 adds bounded network
send-to-headers duration, protocol and prior-response count only on the existing
exact-host REST GET/HEAD 504 boundary. Prior responses mean redirect/auth follow-ups,
not query retries. JS fetch/body timing is not DNS/TLS/database timing; RN may
buffer the native body before resolving fetch. No raw bodies, URLs, identities,
addresses, credentials or arbitrary error text enter this evidence. Query summaries
explicitly keep unknown origins unknown. Existing event limits/fingerprints,
requests/retries/cancellation, lifecycle reconciliation and iOS/web remain unchanged.
No server, Worker, portal, push or database contract/deployment is included.
Build 25 is unchanged; the added fields require installation of build 26 or later.
See `docs/ANDROID_DIAGNOSTIC_BUILD_26_2026-10-02.md` for exact job and status.

October 2 Android diagnostics (LOCAL ONLY): terminal `contexts.api` keeps the
final failed attempt plus a shallow `first_attempt` object when retried, avoiding
Sentry's default depth-three normalization of the older `attempts` array into
`[Object]`. Android `status_text_available: false` on a 504 means the native
reason phrase is unavailable; `cache_only_signature` is omitted, not false.
No arbitrary reason text, URLs, bodies, identities or credentials are collected.
Other-platform payloads and all transports, retry counts, deadlines, sessions,
events, reconciliation and durable alarms remain unchanged. Native controls in
`scripts/android-network-lab` use synthetic loopback traffic only; passing these
controls does not identify the origin of an observed production 504.

New developer navigation: [Onboarding](DEVELOPER_ONBOARDING.md),
[service catalog](SERVICE_CATALOG.md), [testing and releases](TESTING_AND_RELEASES.md).
Chronological notes below retain earlier states; see [Current state and gaps](CURRENT_STATE_AND_GAPS.md)
for the latest recorded cutovers and remaining handoff work.

October 2 performance release: employee portal reads now load by visible view,
with pending/error states and epoch fencing on lock. Sign-in does not wait for
hidden archives, audit, operator directory or event history. Fixed SQL setup and
identity validation share one round trip; per-operation role checks, bound
parameters, fresh transactions and connection closure remain mandatory. No
member Auth, schema/RLS, business deployment or paid infrastructure change.
The separately approved relay recovery release is described in step 4 below and
`PERFORMANCE_REPAIR_2026-10-02.md`.

The follow-up employee-only admin proxy routes to the database's Oregon region
(`us-west-2`). Owner approved its no-automatic-regional-rerouting tradeoff; no
uncertain write is retried elsewhere. Other Edge functions/realtime/member paths
are not pinned by this change. Initial workspace entry can use the completed MFA
response's freshly authorized operator; all later refreshes recheck the session
and all commands retain server authorization. Fixed, numeric request timing is
request-local and contains no employee/member payloads or credentials.

October 2 local announcement permission candidate (not deployed) removes only
anonymous EXECUTE from the two member announcement RPCs. It does not change
function bodies, authenticated access, eligibility, receipts, rewards, query
invalidation, realtime events, push, alarms or member Auth. No announcement is
published by the candidate. Rollback and member/anonymous execution tests run
only in an isolated synthetic database; production deployment remains gated.

October 1 local comment/reaction recovery follow-up (not deployed): member-scoped
mutation keys and current-member guards stop stale callbacks from patching,
rolling back or reconciling a different account's caches. The existing 1.5-second
reaction settle timer now checks membership before dispatch. Engagement read
deduplication is scoped by member/post/audience and rechecks the member after the
read; signed-out active-refresh calls are inert. This applies to the shared mobile
engagement helper used by mutation and identifier-event reconciliation, not a
portal or server transport. Existing query roots, event payloads, active-audience
selection, Friends/global aggregate separation and atomic command payloads are
unchanged. No polling, alarm, push, database or WorkOS change is included.

October 1 local shop recovery follow-up (not deployed): purchase/equip mutations
are keyed by member identity so account-switch rerenders cannot attach a pending
result to the new member's callbacks. Fresh-account guards prevent stale profile
writes, invalidations and refreshes after logout/switch. Failed optimistic
purchases also clear newly introduced ownership cache entries. Existing
`ownedShopItems`, `profile` and `feed` invalidation roots, identifier events,
foreground/reconnect reconciliation and atomic server commands are unchanged.
No new polling, server permissions, provider or portal dependency is introduced.

October 1 local mobile recovery follow-up (not deployed): blocked-user and
friend-request screens now display existing shared retry feedback for failed
reads, retain cached rows only for transient errors, and stop automatic scroll
pagination during an active read or error. Manual retry preserves an in-flight
request with `cancelRefetch: false`. This is presentation/recovery only: existing
friend/block query roots, identifier events, batched invalidation and foreground/
reconnect reconciliation are unchanged. No new polling, event producer, RPC,
server write, alarm, push behavior or portal dependency is introduced.

October 1 employee root cutover supersedes the acceptance-only state below:
admin Pages deployment `38bb97d7-0bf0-4be4-8a76-d6f132051b41` serves independent
employee authentication at `/`; `/identity/employee-preview/*` redirects to `/`.
The accepted same-origin proxy, cookie transport, bounded RPC adapter and existing
identifier-only realtime channel contract are unchanged. Owner login/MFA and
authorized role/business/ideas/health reads were observed live. Offline tests
cover exact evidence signing authorization, realtime capability limits, employee
logout/revocation and member/business identity rejection. No synthetic production
event, evidence access or moderation action was generated to test this release.
No member authentication, shared Worker, alarm, push, database or release-policy
change was included in the final Pages switch. This is not a performance/load or
notification-delivery certification; business independent authentication remains
a separate rollout.

October 1, 18:11 UTC employee acceptance update supersedes disabled/unmapped notes
below: the employee-only SQL login, exact owner mapping and private session/RPC
gates are now enabled for the independent live acceptance page. The hosted
same-origin proxy and Edge endpoint reject anonymous/cross-origin access, with
server-only keys, bounded SQL transactions and verified pooler TLS. Root admin
login/assets and business/public deployments remain unchanged pending owner
acceptance. No shared Worker, alarm, push, event, member Auth or release-policy
change was made. Existing identifier-only realtime invalidation and reconnect/
foreground behavior are reused; actual authenticated hosted signing and logout
still require owner acceptance. Do not infer member scale or delivery guarantees
from these portal transport checks.

October 1 staff-attribution rollout is live after explicit approval: nine staff
references now support independent employee principals while preserving old actor
IDs and legacy Auth deletion behavior. No realtime/Worker/alarm/push/member-auth
or portal deployment changed. The production rehearsal/application verified
unchanged existing contracts and historical rows. Employee identity/session gates
remain disabled; command/media/realtime and foreground/reconnect integration still
must be qualified before login cutover. The earlier pending-FK-approval notes are
superseded; see the account-separation record for exact tests and evidence.
Subsequent October 1 release installed the expanded employee-only application
bridge, staff-directory adapter and durable admission **disabled**. Thirty-five
application RPC contracts plus exact evidence and realtime authorization remain
server-resolved and atomic. Existing shared contracts/deployments are unchanged.
Local resource signing preserves the 15-minute subscribe-only doji:global and
moderation:global capabilities and 5-minute exact-object evidence URLs. The local
admin transport reuses existing foreground/reconnect invalidation and fences late
responses after logout; no new polling is added. Thirty-nine real-DB checks and
143 focused offline checks pass. No new live socket, LOGIN credential, owner mapping
or portal cutover exists yet; hosted signing and owner MFA acceptance remain gates.
The later static employee setup-page deployment and approved owner AuthKit invitation
do not change this: existing admin login assets, realtime and member Auth are
unchanged. The invitation is pending; no owner mapping or developer role is granted.

October 1 later update: the private identity/session foundation is installed in
production but disabled, empty and unreachable by browser roles. No realtime,
member Auth, Worker, alarm, push or existing portal deployment changed. Existing
member/portal database contracts were fingerprint-verified unchanged. The local
employee HTTP controller now has its own durable store and exact-session TOTP
proof; 191 combined offline checks and 12 real local database checks pass.
It is not a hosted portal login. Employee command/media/realtime authorization and
foreground/reconnect integration remain required before cutover. Shared staff
actor/FK migration is awaiting separately requested approval; no member identity
or historical moderation reference was altered. See the account-separation record.

October 1: approved WorkOS production directory/key provisioning is complete, with
employee MFA required and distinct production token audiences configured. This is
provider setup only, not a portal auth cutover. No member auth, Worker, socket,
event, alarm, DB or push change was made. Employee portal session/command/media/
realtime adapters and deployed reconciliation still require implementation and
verification; member authorization must not depend on these new directories.

September 30 employee identity follow-up remains unmounted: the new employee
provider adapter issues encrypted MFA receipts only after a successful TOTP grant,
signed JWT verification and a bounded active-session check. Refresh cannot renew
MFA age or change subject/session. The hosted staging qualification passed 17 checks
in 38 requests and revoked its synthetic sessions. This does not implement durable
employee browser/session orchestration, employee command adapters or a production
cutover. It adds no polling, realtime dependency, Worker deployment or member change.

September 30 identity-directory candidate is local preparation only: no Worker,
member token, push, socket, alarm or event producer changed. Future portal identity
adapters must reauthorize exact commands and reconcile on foreground/reconnect;
no polling or member dependency on portal identity availability is permitted.
Registry resolution alone is not a command permission. See
ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md for unimplemented release gates.
Latest no-new-cost production authorization has not resulted in a cutover: the
separate employee production environment action was blocked by cost-safety review.
The local session reader now uses abort-bounded response consumption without
waiting for stream cancellation; 33 reader and 38 verifier checks pass. This adds
no production provider calls or dependency to member/realtime paths.
The local business identity read bridge performs identity resolution and a bounded
authorized read in one transaction; it adds no events, polling or realtime grants.
The disabled local save/submit bridge resolves and executes the same atomic business
command core in one transaction. Fourteen local concurrency/isolation checks pass,
including write/revocation ordering and duplicate submissions. No new event contract
is introduced; hosted provider revocation and recovery remain unqualified.

The local provider reader now denies revoked hosted staging sessions even for
unexpired signed tokens; webhook/recovery races and durable MFA evidence remain
unqualified. The disabled business enrollment candidate commits identity, account
and legal agreement in one transaction, with no member/Auth write or event. Forty
local checks cover enrollment through application submission and rollback. No new
polling, socket, shared Worker, push behavior or production dependency was added.

The next local-only identity transport adds opaque host-only business sessions and
fixed authorized application reads/commands, tested against the existing browser
application controller. Logout fences late browser responses. A local PostgreSQL
session store now uses short atomic calls and a per-session fenced lease, not a
transaction spanning provider requests. Busy operations return promptly; expired
crash leases require fresh sign-in. A separate local signed registration gate
reserves lifetime capacity atomically. Seventeen focused local checks pass; hosted
connection, callbacks and deployed-instance qualification remain unfinished. No
deployed page imports this transport. It adds no polling, event producer, shared
Worker dependency, member auth change or paid realtime.

September 30 release update: business application/privacy contracts and their
restricted admin UI are installed, but business realtime remains false. No business
token/relay contract, shared Worker, recurring refresh, push or member transport
was deployed or changed. Explicit bounded staff queue reads are live; public
business signup/Auth access is now enabled with the owner-approved US-only
10-account/30-email caps and October 7 admission expiry. Signup uses the dedicated
business callback and role, not member/employee role conversion. Application and
workspace reads reconcile manually/on foreground; no timer or paid business socket
was enabled. Existing member and employee read
contracts passed production checks. See BUSINESS_LIVE_RELEASE_2026-09-30.md; older
local-only descriptions below are historical, not current deployment status.

September 30 business privacy candidate (LOCAL ONLY): privacy correction, closure,
erasure preparation and primary cleanup serialize through the existing business
account/application locks and advance the affected application revision. When
business realtime is enabled, they reuse identifier-only business.application.updated
and moderation.business.updated hints with sendPush=false. Existing applicant and
reviewer reconciliation remains authoritative; no new transport or polling. The
restricted privacy case/history APIs are bounded, explicit operator reads only;
no privacy queue UI or background refresh is deployed. Both privacy execution and
business realtime remain independently default-off. Ordinary member Auth writes
do not invoke the agreement constraint (its WHEN condition selects doji_business).
No existing member function/grant/policy or global Auth setting is modified by the
candidate. This is logical scoping on shared infrastructure, not physical isolation.

September 30 local privacy UI continuation: existing employee-session transport
adds six fixed caller-JWT RPC mappings behind an independent default-off flag.
The queue is read only after an explicit operator opening; subsequent visible
queue/open-case reads use existing coalesced portal reconciliation and manual
refresh, not a timer or additional socket. Open drafts retain entered references
while exact revision/hold changes block confirmation and clear access information.
Read failures never become an empty healthy queue. Session/drawer generations
discard late reads/commands and lock clears sensitive state. No service erasure
execution endpoint, new event producer, shared Worker or member contract is added.
The owner separately approved local preparation of the exact current-draft correction
read. It is employee-AAL2-only and restricted to an open verified correction case.
Once a draft is explicitly loaded, existing coalesced foreground/reconnect signals
also re-read that exact application revision; changed revisions preserve entered
fields but disable stale confirmation. The read creates no events or writes.
Production remains unchanged; the SQL/read/UI deployment is still gated.

September 28 release-policy verification: Android minimum/latest 1.0.8 (23) is
live following verified Alpha availability and owner confirmation of all users'
eligibility; iOS remains unchanged. This changes only the Android configuration
row, not transports, sessions or database contracts. Contrary to older lifecycle
wording below, policy refresh is guaranteed by query mount, not ordinary foreground:
focus refetch is globally disabled and `mobileReleasePolicy` is absent from the
explicit reconciliation roots. Testers must fully close/reopen to pick up a changed
minimum. No recurring polling or client repair was added by this operation. See
`ANDROID_RECOVERY_BUILD_23_2026-09-28.md` for the guarded rollback and verification.

September 28 read recovery/correlation is a LOCAL mobile-only candidate. The
existing Supabase and scale fetches gain signal-scoped, allowlisted response
metadata; terminal query incidents retain the first/final failed attempts without
per-attempt telemetry or new requests. Reconnect/foreground reconciliation, retry
counts, deadlines, auth, domain events, atomic commands, notification delivery and
durable alarms are unchanged. Read-error presentation no longer implies empty
history/ownership. Production HTTP 504 attribution and real-device recovery remain
unqualified. See `MEMBER_READ_RECOVERY_2026-09-28.md`; no shared release is included.

September 28 query repair (LIVE at 03:55 UTC) changes only notification snapshot internals,
mention matching and two supporting indexes. The same atomic submit/edit commands
own mentions and their existing events. No event, recipient, push lifetime, alarm,
reconciliation, session or portal contract changes. Two bodies/two indexes deployed;
all 331 function permissions and unrelated bodies, policies and triggers verified.
No pending delivery work in the post-release check; zero recent realtime samples
means delivery latency was not measured by that check. Qualification and
rollback are in `MEMBER_QUERY_PERFORMANCE_REPAIR_2026-09-28.md`.

September 28 approved performance repair: same-price Micro upgrade and narrow
suggestion-policy fix are live. The Worker diagnostic labels and email guidance now
describe relay/publication or publication/database-acknowledgement uncertainty instead
of attributing failure to a provider from attempt counts alone. Thresholds, schedules,
bindings, alarms, push, event contracts and all existing function bodies are unchanged
by the database migration. Mobile-only gateway/feed cancellation/deadline repairs are
queued locally for the next build; no polling, fallback storm or additional retry loop
is introduced. See `PERFORMANCE_REPAIR_2026-09-28.md`. 100k capacity is not certified.
The subsequent free local 100k-data load test failed its mixed heavy-load gate on
notification reads. Local recipient selection, delivery-claim replay and 32-client
idempotency checks passed, but no provider/handset timing was measured. See
`LOCAL_HEAVY_LOAD_2026-09-28.md`; no runtime contract changed during those tests.

September 27 original-submission presentation repair is portal-only: existing exact-ID
editorial reads populate the same readable preview in detail and confirmation.
Mismatched IDs fail closed; no new read, event, polling or command contract is added.
Member code, data, authentication, Worker and database are unchanged. See
`IDEA_SUBMISSION_PRESENTATION_2026-09-27.md`.

September 27 announcement campaigns (LIVE): separately approved migration
`20260927040000` adds atomic once-per-member submission rewards and excludes
completed campaigns from announcement claims. Existing profile/economy events and
foreground/reconnect reads reconcile balances; no new event/push/polling/Worker
contract or session change. No announcements were created or published. See
`ANNOUNCEMENT_CAMPAIGN_RELEASE_2026-09-27.md` for limits, checks and rollback.

September 27 employee editorial release (LIVE): new announcement
lifecycle commands emit identifier-only `moderation.announcement.<action>` events
on the existing `moderation:global` staff channel. Existing coalesced invalidation,
foreground and reconnect reconciliation refresh the visible bounded editorial page.
Open drafts/confirmations are not overwritten; server versions reject stale writes.
Community review performs one existing suggestion UPDATE; current member/staff events,
reward and review-push triggers remain the only producers. No member announcement
event/push, polling, alarm or mobile dependency added. Details/release isolation gates:
`ADMIN_EDITORIAL_RELEASE_2026-09-27.md`. Feature flag remains off by default in
generic builds and is explicitly on in the isolated production admin artifact.
All 324 preexisting functions/grants, member policies, triggers and Worker alarm
code/bindings/schedules were verified unchanged in this additive release.

September 27 mobile-only query repair (LOCAL, not released): empty announcement
claims settle successfully as `null`. Upcoming-Doji preserves the existing six-second
request deadline and one transient query retry; first-abort provenance distinguishes
deadline failures from foreground/account/query cancellation. Late cancelled results
cannot update the server clock. HTTP status, SQLSTATE, and allowlisted request metadata
improve terminal diagnostics without raw payloads. No new polling, event, write, alarm,
push dependency, or portal/shared-infrastructure change. See
MEMBER_QUERY_FIXES_NEXT_BUILD_2026-09-27.md for verification and device release gates.

September 27 internal-admin UI increment (LOCAL, not deployed): staff access writes
reuse existing receipt keys on unchanged manual retry, then use existing coalesced
session/workspace reconciliation. Claim-next reads its case before the existing
triage command. Audit exports/navigation discard late responses after lock. No new
endpoint, event, polling, member dependency or shared deployment. Internal workflow
backend work remains separately gated in `ADMIN_COMPLETION_2026-09-27.md`.

September 27 production status: the staff case reads, avatar boundary and portal
hardening below are LIVE under migration `20260927020000_employee_case_evidence`.
The release changes only two additive Worker routes plus their employee-mode
guard, staff database contracts and admin assets. All preexisting Worker code,
bindings, DO namespace IDs, cron and 321 existing database functions/grants are
preserved. No member/mobile/realtime/push/retention change. The admin site's CSP
now permits evidence video from the existing Supabase Storage origin. Browser
tests exercise the packaged CSP. See PORTAL_TRIAGE_RELEASE_2026-09-27.md. Earlier
local-only status notes below are preparation history, superseded by this release.

September 27 portal case-read draft (subsequently deployed):
`/portal/admin/report-case-v3` and `/portal/admin/appeal-case` forward an AAL2
employee JWT to additive case RPCs, without caching, polling or a service-role
key. Old report routing stays on v2. The reads retain report evidence-access
auditing; appeal detail also appends `appeal.case_viewed`. They never emit domain
events or execute moderation commands. No member function, trigger, grant, RLS,
session, realtime producer, alarm or push contract changes. Existing coalesced
workspace invalidation/foreground reconciliation now reloads the open report or
appeal after session verification and before another decision. No new event producer,
channel or polling is introduced. Loading/error states disable decisions and dismiss
stale confirmations; workspace epochs and case-request revisions reject late data.
Media previews expire locally before their five-minute Storage token lifetime;
that one-shot expiry only clears UI state and does not fetch or determine correctness.
Drawer close and session cleanup remove image/video sources and pause playback.
The browser integration is local-only until the additive RPCs and gateway are
separately approved, released and verified; do not deploy portal callers first.

September 27 employee avatar-access draft (approved local preparation only): an
employee-only Storage SELECT helper/policy admits exact current reported avatars
and preserved appealed-decision references. AAL2, active staff and moderation.read
are required; any restricted association also requires legal.read. The existing
employee restrictive boundary gains this branch without changing member/PUBLIC
policies, bucket publicity, sessions, retention, triggers or event producers.
An exact-reference moderation-history index avoids an unindexed payload lookup;
production cardinality/lock impact remains a release gate. Current and original
avatar manifests use the existing case refresh/signing/expiry flow. No new polling.
Saved references are not immutable byte snapshots; existing public avatar URLs
remain public. See PORTAL_AVATAR_EVIDENCE_PREPARATION_2026-09-27.md.

September 27 local portal-only hardening (not deployed): existing coalesced
reconciliation now checks the bounded employee session/capability contract before
workspace reads, including return-to-foreground. Confirmed access loss or changed
permissions clears protected state; concurrent item-level 401/403 responses share
one session check and never automatically replay a denied command. Reconciliation
adds no timer polling, channel, Worker route or member dependency. Late command
callbacks respect the workspace epoch. Unchanged failed moderation/triage intents
retain their existing RPC receipt key for manual retry; success is acknowledged
separately from read refresh. No database, push, alarm or mobile change is included.

September 26 portal queue-health correction uses the existing bounded command-center
work items and their server-owned deadlines. Browser time classifies display state only:
four hours remaining is Watch, passed target is Overdue, and high/critical-priority or
serious/emergency-severity overdue work is urgent. Incomplete snapshots cannot assert
queue-wide health. The existing session display timer updates the labels without reads.
No database, alarm, notification, realtime or paging contract changed. The owner-approved
Sentry fix rotates only `SENTRY_API_TOKEN` to dedicated `event:read` access; the app DSN
and build upload tokens are untouched. Shared Worker code and infrastructure settings
were verified preserved after the secret deployment.

September 26 employee portal cutover: `/portal/admin/*` accepts `doji_employee`
JWTs with AAL2; member routes still require `authenticated` and use the existing
validator. Employee authorization is private/active-role scoped and the database
portal gate denies legacy member portal sessions. Approved commands remain atomic,
audited and identifier-event producing. Their private receipt ledger avoids member
profile FKs. Employee-only, status-only comment/poll moderation UPDATEs dispatch to
a bounded private limiter; original member limits/ledger/helper stay unchanged.
`realtime-token` admin mode mints only `doji:global` and `moderation:global`; member
issuance and capabilities remain unchanged. Employee access-change events use the
existing moderation channel and portal reconciliation. No alarms, schedules, push
policy, member session configuration or mobile build changed. Shared infrastructure
is not physical isolation. See `EMPLOYEE_ACCESS_RELEASE_2026-09-26.md` for evidence.
Earlier pending/enrollment-only status below is historical.

Employee onboarding repair (September 26): setup now supports explicit email-confirmation,
TOTP challenge/enrollment and completion states without loading protected portal data.
It uses only employee-signin, the existing pending-status RPC and Auth endpoints for
that server-validated employee. No refresh persistence, polling, event producer or
role grant is added. Temporary sessions are locally logged out on completion/cancel.
Employee-register sends its own branded verification through existing Resend, after
bounded employee-only claims and identity checks; global member Auth mail is untouched.
The main portal resets consumed MFA UI after post-verification access failure and
routes employee email returns into setup. Worker, member sessions, DB/RLS and mobile
contracts are not part of this release. Employee authorization cutover remains gated.

Account deletion (approved September 26 scope): Auth deletion and profile/history
detachment are one database transaction. The profile BEFORE DELETE trigger retains
opaque references and closes pending appeals without rewriting resolved outcomes.
If history was retained, it enqueues `moderation.account.deleted` on the existing
authorized `moderation:global` channel with identifiers only. The portal's existing
channel-wide invalidation and reconnect/foreground reads reconcile the affected cases;
no new polling, push, Worker release, member read/RLS or session-policy change is added.
Storage cleanup retains its existing durable intent/retry contract. See
`docs/ACCOUNT_DELETION_REPAIR_2026-09-26.md` for release verification and rollback limits.

Current employee enrollment release (September 26): additive migration
`20260926030000` and only `employee-register`/`employee-signin` are live, restricted
to the owner enrollment email. The separate setup page persists no session, reads only
the pending employee status, and locally logs out its temporary employee session.
No realtime transport, member read/RLS, session policy, Worker, mobile or moderation
command changes were deployed. Existing portal remains legacy; authorization and
cutover remain gated. See `EMPLOYEE_ENROLLMENT_RELEASE_2026-09-26.md`.
Employee enrollment's server HTTP boundary supports opaque secret apikeys and legacy
service JWTs explicitly; never use an opaque key as a user Bearer token. Its September 26
credential-header repair redeployed only employee-register/signin and changed no
member session, database/RLS, realtime, push or Worker contract.

Pre-enrollment implementation history (superseded by the current status above):
Employee identity migration status: shared scope explicitly approved, local implementation
behind disabled flags and non-deployable SQL drafts; no production change. Employee
tokens have a separate portal validation entry point; member validation still accepts
only authenticated member tokens. Portal realtime requests exclude member channels.
The database draft fails closed on unexpected effective PUBLIC/function/table grants.
Release still requires full-schema and hosted Auth/session regression tests in
`docs/WORKFORCE_IDENTITY_PLAN.md`. Local logout scope does not isolate MFA effects when
the same underlying Auth identity is used in both clients.
The September 26 employee draft additionally preserves historical actor UUIDs before
Auth deletion and uses nullable actor links so a former member administrator can still
delete their account. This is local-only, requires the released deletion repair, and
must pass full-schema tests; it changes no signup hook, sessions, or live transport.
Local verification now includes the restored public schema, unchanged member grants,
real Auth token/MFA/recovery flows and reported-evidence role tests. Employee evidence
uses a server-bound report/permission check and an employee-only restrictive Storage
policy; shared member policies are not rewritten. Verification-email recovery shares
the five/hour, 100-total employee registration budget and creates no domain events.
Full-schema post command/replay and former-member-admin deletion regressions now pass.
Five existing administrative command implementations route receipts through a private
portal view: member actors retain the existing member ledger; employee actors use a
separate private employee ledger. This preserves atomic transactions, advisory locking,
idempotent replay and existing domain-event invalidations, without changing any member
command or its receipt table. Auth BEFORE DELETE retains and nulls actor references
before the profile cascade; no new transport or recurring maintenance is introduced.
These remain staged contracts only; hosted checks and physical-device gates remain.

## Guarantees

- Postgres is the source of truth. Socket messages only announce committed state.
- `profiles.is_banned` is authoritative account-access state. Profile hydration or
  realtime reconciliation moves a banned session to the isolated ban route without
  deleting its auth session; normal app routes and push-token registration stay off.
- The handset clock never authorizes participation. `get_current_doji_state`,
  `submit_poll_vote`, and `complete_doji_with_post` use the database clock.
- The existing server-owned signup-day exception remains free through its authorized
  deadline. All other participants close at the shared 10-minute event deadline. A
  successful paid buy-in changes the occurrence to `buy_in_open`, which both
  submission commands accept without the original deadline. A newer Doji supersedes
  the older occurrence.
- Challenge pre-live, activation, and close use one durable Cloudflare alarm chain per `daily_event`.
  There is no recurring "look for due events" job.
- Every committed live change writes `domain_event_outbox` in the same transaction.
- Authenticated mobile commands pass through an explicit Cloudflare RPC allowlist.
  The gateway preserves the caller's Supabase JWT/RLS context and immediately wakes the
  singleton 250 ms burst coalescer after the atomic RPC commits. The coalescer seeds
  bounded parallel leased outbox drains, preventing one relay invocation per tap at scale.
  Database `pg_net` remains a second, durable wake path rather than the latency-critical
  path.
- Ably provides connection recovery. The app also reconciles Postgres whenever it
  connects or returns to foreground. The handset does not open Supabase Postgres
  Changes subscriptions; using two socket transports duplicated invalidation and
  reconnect work. Every handset must not receive every raw table change.
- Mutating RPCs are atomic and idempotent. A retried command returns its prior result.
  If a client receives an ambiguous transport failure, it reconciles the authorized
  receipt/read model before presenting failure; a committed response is treated as
  success without issuing a second direct write.
- Friend requests, responses, removals, blocks, reports, moderation, posts, comments,
  reactions, poll votes, and poll-vote likes never rely on multiple client writes.
- Blocking removes the friendship and inserts the block in one transaction. It is a
  personal privacy action and never creates a moderation report; only the explicit
  report command enters the admin queue. The client hides that account's posts
  optimistically.
- New clients submit the exact report target, broad category, and specific leaf reason
  through `submit_policy_report`. Post media/caption, comments, custom poll responses,
  profile photos, and account behavior are distinct targets. The server binds content
  targets to their authoritative owner, routes safety-critical leaf reasons to the
  restricted queue, and never infers an emergency from a broad category alone. The
  report command serializes retries by `(reporter, command ID)` before reading its
  receipt. On commit it emits an identifier-only private invalidation for the
  reporter. Feed, post-detail, comment-thread, and poll snapshots exclude that
  reporter's exact pending target; critical leaves additionally quarantine the exact
  row globally in the same transaction. Reconnect and foreground reads enforce the
  same visibility even when the socket hint was missed. The legacy
  `submit_content_report` command remains available for installed clients.
- Comment mention parsing, notification clear/dismiss state, profile writes, and
  suggestion approval also commit inside their owning command. There are no
  client-side cleanup transactions.
- Accepted friend circles are server-capped at 500 and outgoing pending requests at 100. Accept paths serialize capacity checks with per-account advisory locks, so
  concurrent accepts cannot exceed the bound. Interactive post, completion, community
  reaction, and community-comment transactions enqueue one durable internal command;
  the relay expands that bounded graph only after the source transaction commits.
- New-account profile creation requires a server-clock 13-plus check. The submitted
  birth date, result, method, policy version, and timestamp are retained only in the
  access-restricted `age_assurances` audit table. They are excluded from public
  profiles, client reads, realtime events, and notification payloads.

## API contract

- Mobile reads use PostgREST/RLS and React Query. Mobile writes use narrow
  `security definer` commands with `auth.uid()` checks, strict field allowlists,
  and explicit grants.
- Server-owned profile fields (admin/ban state, XP, streaks, Sparks, equipped
  inventory, and push-token ownership) are not directly writable by clients.
- Every replayable command carries a stable idempotency key. PostgreSQL takes a
  transaction-scoped advisory lock for that user/key before checking the durable
  receipt, so two simultaneous requests cannot both perform the action.
- Media submission retries reuse and upsert the exact actor-owned object path reserved
  for the occurrence command. The atomic completion RPC remains the only operation that
  commits participation, content, rewards, and the outbox event.
- Global mutation retries are disabled. Queries retry only transport, timeout,
  rate-limit, and 5xx failures with bounded exponential jitter. An individual
  atomic command may opt into retry only when it reuses its original key.
- Validation, authorization, uniqueness, and business-rule failures are returned
  immediately and never retried as if they were network failures.
- Realtime events contain identifiers, never trusted rows. Socket receipt triggers
  targeted query reconciliation; reconnect/foreground performs one coalesced
  authoritative catch-up from Postgres.
- Ably is the only handset socket transport. The client does not duplicate the same
  commit through Supabase Postgres Changes; transactional outbox delivery plus
  reconnect/foreground reconciliation provides ordered hints and authoritative repair.
- Active reads are invalidated with `cancelRefetch: false`: a burst cannot perpetually
  abort and restart the same feed or poll request.
- Realtime hints are coalesced for 80 ms by `queryInvalidationBatcher`; all affected
  roots are invalidated in one cache traversal. Refreshes are single-flight with a
  350 ms minimum remote-update cadence. Events arriving during a read produce one
  trailing catch-up instead of overlapping or permanently restarting that read.
- Public feed hints use event-specific query roots. Comment likes refresh comments;
  reactions refresh reaction-bearing post surfaces; poll votes refresh poll results.
  A social event never invalidates every public feed query family by default.
- `feed:public` carries only coalesced membership hints for every non-demo post eligible
  for the authoritative Everyone feed, independent of its friend-alert visibility.
  Engagement is routed to `post:{postId}` and subscribed only while an unlocked
  card/thread is mounted.
  A newly inserted realtime media post is not passed into stable feed presentation until its
  authorized image has been downloaded, decoded, and cached; therefore "New posts"
  counts only presentation-ready rows. A bounded failure fallback keeps a bad object
  from blocking unrelated rows or pagination. Preparation is per-post and limited to
  two concurrent native decodes; each decoded image reference is released immediately
  after its stable cache entry is written.
  Friend-feed membership is routed to the author and accepted friends' private
  channels. This removes the previous all-users-by-all-actions amplification.
- The handset Ably client is bound to one authenticated account and is closed before
  an account identity changes. Post-capability requests share an in-flight batch;
  initially visible cards collect for 80 ms, and posts mounted after that batch's
  snapshot receive at most one trailing authorization pass. Token issuance logs the
  database/provider stage duration and returns a retryable structured 503 when either
  upstream is temporarily unavailable.
  The client verifies the returned token capability instead of assuming every
  requested post passed RLS authorization.
  Each client instance has a lifecycle generation. Closing or replacing it invalidates
  in-flight subscriptions before the provider result is handled; the stale attempt ends
  without a retry or Sentry incident, while wrapped `Connection closed` errors and
  provider `Channel attach timed out` errors remain recoverable transport breadcrumbs.
  Genuine capability, authorization, and unexpected provider failures keep their
  existing incident path.
- Cold start has one shared persisted-session restoration request. Cache hydration and
  font loading are bounded, and the native splash never waits indefinitely on the auth
  storage lock or a profile network read. Its React handoff uses the same bundled logo,
  explicit 100-point size, centered placement, and white background as the native launch
  screen, so the two technical phases present as one continuous surface. A timeout reveals
  a retryable in-app surface while the original session request remains observed for
  automatic recovery; no concurrent retry is allowed to queue behind the same Supabase
  auth lock.
- The first owner-profile authorization read retries bounded transient failures. Once
  that read has verified the active session, a later presentation refresh failure leaves
  protected routes mounted and reconciles later instead of showing a global account error.
  The cold-start profile request uses a 10-second per-attempt deadline rather than the
  former 3-second deadline, because production activation-burst requests can complete
  successfully after three seconds. Exhausting all attempts records one rate-limited
  `startup/profile_bootstrap_failed` Sentry incident without weakening the server-owned
  ban or onboarding gate.
- Comment-thread snapshots keep member-table RLS and use the narrow
  `has_pending_own_comment_report` security-definer predicate for reporter-relative
  hiding. App clients never receive SELECT access to `reports`, avoiding both report
  disclosure and the 403 caused by an invoker snapshot reading an admin-only table.
- Store-update discovery is a bounded Postgres read, not a socket event or handset
  polling loop. `get_mobile_release_policy` exposes only an enabled platform policy;
  the client rechecks through the normal startup/foreground query lifecycle and compares
  native build as well as semantic version. Release operators enable the row only after
  the exact Apple/Google build is available in that store.
- The bottom tab navigator owns the native bottom safe-area inset. Tab-root screens
  exclude that edge, while the tab bar adds the measured inset to both its height and
  bottom padding; no screen or platform branch reserves the same Android space twice.
- Feed RPCs return authorized records and stable private-media references immediately.
  Stable references, but never signed bearer URLs, may be persisted. Existing and
  paginated cards render immediately; visible cards coalesce signing and keep their
  media surface behind a card-local skeleton until native display. Only new realtime
  head inserts use the two-worker readiness queue before entering stable presentation,
  so a cold feed never waits for a page-wide preload. Readiness downloads the authorized
  derivative to a temporary file, verifies it decodes, and seeds the stable cache with
  those exact encoded bytes. A cached image is never decoded and re-encoded into itself.
  The native image cache is keyed by the immutable private object path, not the
  rotating signed bearer URL. Query persistence flushes on background, and a
  local snapshot that misses the bounded splash deadline can still hydrate
  unfinished queries without replacing newer authoritative results.
  Camera/library photos are normalized once before the approval preview. The
  orientation-baked, longest-edge-bounded JPEG shown there is uploaded directly,
  so no post-approval transform can rotate, mirror, or crop a different file. Main
  media surfaces contain the full frame; only explicit thumbnails crop it.
  Recent comments, comment-like/reaction voter lists, profiles, friend state,
  leaderboards, badges, poll detail, and shop ownership use the same bounded
  stale-while-revalidate contract. Infinite queries retain only their first
  page; persisted query count and serialized size are capped; mutations,
  search drafts, and signed bearer URLs are never persisted. Comment-like
  voter lists participate in both foreground and targeted realtime repair.
- Optimistic mutation completion uses the same batch. A committed challenge response
  never waits for feed/profile refetches before navigation; authoritative reads
  reconcile behind the direct-to-feed transition.
- Friends and Everyone retain separate cached query identities. Returning to either
  audience or reconnecting the network displays its cache immediately and performs one
  background authoritative read, even during the normal stale window. This repairs a
  missed socket hint without recurring polling or a loading-state regression.
- A reaction/comment intent patches the actor's cache synchronously before cancellation
  acknowledgement or the RPC. The cancellation signal prevents stale reads from
  overwriting it; the authoritative response and post socket then reconcile counts.
  A successful reaction receipt is applied immediately. Its targeted engagement
  refresh waits beyond the one-second scale-cache TTL and newer reaction intents
  replace older timers, so a pre-command cached snapshot cannot visually undo a
  committed reaction while realtime is recovering.
- Changing a reaction emoji moves its fixed-shard breakdown count in the same database
  transaction as the base reaction row. Feed snapshots and targeted engagement reads
  therefore cannot disagree after a reaction switch.
- Friendship request/accept commands likewise patch the relationship and every mounted
  viewer-relative search/voter row synchronously, then roll back on RPC failure and
  reconcile through the private friendship event.
- Presentation motion never owns server state or delays reconciliation. Cold reads may
  crossfade a challenge-shaped skeleton into content, while cached reads remain interactive.
  Shared polls render one placeholder; per-user post types render five scrollable
  placeholders that match their photo/video or text card geometry.
  Native sheet dismissal completes before a queued route action is allowed to run.
- A native notification tap is registered before auth/profile restoration, retained
  while the protected navigator mounts, and consumed only after `safeReplace` accepts
  its canonical route. The OS response is cleared only after that acceptance. Relay
  payloads preserve `commentId`, so native mention/reply taps and Activity Center items
  share the same post/comment routing contract. Post notification routes open the exact
  canonical current-post screen and open comments when requested; they never scan or
  reposition feed pages. Profiles resolve one bounded current-occurrence post preview,
  while feed cards remain non-navigating feed interactions. Advancing to pre-live makes
  the prior profile preview and direct post route unavailable without deleting history.
  Protected navigation is composed as one outer Stack with the five-tab navigator as
  its anchored root. Member profiles, post detail, friends children, settings, shop,
  legal, notification, admin, and challenge pages push above that root; Back pops one
  real entry at a time. Native and in-app notification destinations use the same push
  contract. `returnTo` remains only as a no-history cold/deep-link fallback and never
  overrides valid stack history, eliminating stale hidden-tab page flashes.

## Runtime flow

1. `schedule-daily-challenge` creates the future `daily_event` and registers its exact
   `fires_at` with `DojiEventAlarm`.
2. At `fires_at - 20 minutes`, the alarm calls `begin_daily_event_prelive`. One
   constant-time transaction stamps `prelive_at` and publishes the safe `doji.pre_live`
   event without challenge content or push. Active reads move to the new occurrence;
   prior social content is retained rather than deleted on the launch path.
3. At `fires_at`, the alarm calls `activate_daily_event`. One transaction stamps
   authoritative times, creates 128 fixed push partitions, and writes one global event.
   Eligible `user_events` materialize lazily when an account requests current state.
4. The outbox wakes a singleton Cloudflare Durable Object. Each POST starts one
   in-memory-deduplicated drain immediately and first arms a 30-second crash-recovery
   alarm. Concurrent wakes share that drain; Postgres leases preserve idempotent
   continuation without making normal delivery wait for an alarm. The wake response
   carries a drain ID and the worker logs wake-to-request latency under that ID,
   not a claimed database execution time. Normal requests have a five-second
   deadline across headers and body; recovery requests retain twenty seconds.
   Failures retain a durable 150-second uncertain-lease recheck, including after
   successful empty claims. An aborted HTTP response does not prove the remote
   function stopped. Existing two-minute leases, publication markers and bounded
   exponential retry remain authoritative; no recurring relay polling is added.
5. The relay claims critical activation and realtime-only rows ahead of push-only
   backlog, explicitly orders each claim, and atomically publishes each channel batch
   to Ably. It durably records that publication before optional push work begins.
   Independent channels drain with 16 bounded workers per 100-row claim. The relay
   emits per-page drain duration/counts and p50/p95/max queue-to-publication latency;
   command responses expose content-free database/wake `Server-Timing` measurements.
6. Connected devices update immediately. Background devices receive remote push.
7. The same Durable Object wakes at `closes_at` and calls `close_daily_event`.
8. After close, that one-shot alarm prepares and registers the next Doji before it
   attempts the recoverable realtime relay wake. A relay outage therefore cannot break
   the daily event chain. There is no recurring scheduler.

Re-registering the same event phase always re-arms the Durable Object alarm; stored
phase state is not proof that an alarm is still pending after a failed invocation.

Push providers cannot guarantee OS display. App correctness never depends on push:
connected clients receive Ably events, while launch, foreground, and reconnect always
reconcile authoritative database state.

## Push delivery invariants

- `device_push_endpoints` privately stores one native APNs/FCM endpoint per app
  installation. `register_native_push_endpoint` atomically transfers rotating tokens
  to the authenticated account; sign-out disables only that installation. At most five
  recent active installations are retained per account and recipient reads return the
  bounded set rather than silently selecting one device. The unique
  Expo token on `profiles` remains a migration fallback, not the 100k broadcast path.
- Android creates `doji-live`, `direct-activity`, and `reviews-account` before requesting
  permission or reading either native/Expo tokens. Direct FCM and Expo fallback payloads
  select the same category channel, so Android 13+ registration and display use one
  contract across transports.
  Endpoint registration advertises notification contract version 2; contract 1
  installations keep the legacy `doji-alerts` channel during a rolling store upgrade.
  Endpoint registration v3 adds app version, native build number, and release channel
  to the private endpoint record for service-role-only aggregate rollout reporting.
  The native client prefers v3 and falls back through v2/v1; notification delivery never
  depends on release telemetry. Sentry and content-free command timing carry the same
  release identity so mixed rollouts can be compared without logging command bodies.
  Registration and unregistration are serialized per app process, and concurrent
  startup/foreground/settings requests share one registration promise. The client
  persists only a fingerprint of the successful identity and skips unchanged refreshes
  for at most six hours. Token, account, environment, contract, release/build, or
  preference changes bypass that cache. Transient gateway failures receive bounded
  jittered one-, three-, and ten-second recovery attempts; lifecycle-superseded runs
  stop before another command, and only exhausted recovery is reported as an incident.
- That fallback is only a delivery transport selected by the authoritative outbox
  relay. There is no direct `notify-user` endpoint, row-trigger HTTP push, recurring
  push dispatcher, or second notification producer. Historical migrations that
  created those objects remain immutable; the current hardening migration drops
  their callable runtime and cron references.
- The account master `push_enabled` preference gates every push category at delivery.
  Disabling phone alerts also unregisters the current token; startup and foreground
  reconciliation never re-register while the master preference is off.
- Installed legacy clients are protected by `profiles_transfer_push_token`; direct
  profile updates use the same atomic ownership transfer.
- A social action never calls a push provider from the row trigger. The database and
  relay independently enforce the only phone-alert categories: Doji live, friend
  requests, explicit mentions/direct replies, and challenge-review/account actions.
  All other social activity remains query-backed and realtime in the Activity Center.
- Multiple outbox inserts in one business transaction enqueue one `pg_net` recovery wake.
  Statement-level conflict updates with no inserted transition rows enqueue none.
  The singleton Durable Object collapses simultaneous transaction wakes into one
  immediate drain and processes at most eight bounded pages per turn. Its alarm is a
  recovery/continuation mechanism; the transactional outbox rows remain durable.
- Approved phone alerts are handed to APNs/FCM immediately; there is no intentional
  handset-notification delay. Provider/OS display remains best effort and correctness
  stays with Postgres, realtime invalidation, and foreground/reconnect reconciliation.
  `notification_attention_state` stores subject-level visibility receipts only after
  matching content is visible or a push is opened. Endpoint claims reject already-seen
  subjects and stale retries, while Activity Center history remains intact. For a Doji,
  the final claim compares the receipt to `daily_events.activated_at`, so viewing the
  pre-live countdown cannot suppress that event's later live phone alert.
- Social recipient fanout is set-based and asynchronous. One action creates one relay
  wakeup and one internal outbox command rather than blocking the user write or making
  one database HTTP wakeup per friend. Lightweight friend invalidations use Ably's
  multi-channel batch endpoint in bounded 100-channel requests and client event-ID
  deduplication. Ambient friend activity does not create per-recipient phone-alert rows;
  idempotent source commands and client query invalidation keep retries safe.
  Community reactions must use this command path; recipient graph expansion and
  per-recipient authorization are forbidden inside the interactive reaction transaction.
- Profile presentation/stats and badge-progress triggers use the same identifier-only
  batch fanout. Buying/equipping a frame or earning a badge never inserts one outbox
  row per friend in the interactive transaction.
- Every sender claims delivery before contacting a provider. The first
  event/recipient/installation insert is terminal; conflicts never reopen an unfinished claim.
  Database, queue, HTTP, lease, and function retries therefore collapse to a no-op.
  provider ticket/outcome recording is telemetry and can never authorize another send.
- Provider handoff is attempted once. An ambiguous timeout is terminal rather than
  retried because APNs, FCM, or Expo may have accepted the request even when its
  response was lost.
  Doji correctness comes from Postgres, Ably, and reconciliation, so the rare missed
  alert is safer than a duplicate-notification storm.
- Every claimed outbox row includes its immutable `created_at`. Doji pushes are
  rejected after two minutes or after `closesAt`, whichever comes first; all other
  pushes are rejected after five minutes. APNs, FCM, and Expo expiration is anchored
  to that original deadline rather than relay time, so old backlog can drain without
  alerting and a late relay cannot extend an alert's lifetime.
- Outbox push keys use the immutable outbox event ID, recipient, and installation. Legacy direct
  events use their immutable entity ID; payloads without an entity ID are collapsed
  into a five-minute retry window.
- Realtime publication and push display are independent. A duplicate Ably message is
  harmless because clients deduplicate event IDs; a push must additionally pass the
  server delivery claim.
- Push backlog never sits in front of live app state. The
  relay publishes the full ordered Ably channel batch first and only then performs
  slower push side effects. Push-recipient reads start concurrently and are not awaited
  by the Ably publication. A durable `realtimePublished` marker prevents a relay retry
  from republishing or delaying the corresponding socket event.
- User-visible channel events are claimed before internal friend-graph expansion jobs.
  Once their ordered Ably publication succeeds, all no-push event leases in the page
  are completed with one set-based database command instead of one round trip per
  event. Internal fanout keeps bounded workers and is bulk-completed the same way;
  push-bearing events retain their individual durable delivery state machine.
- A finalized moderation removal upgrades its existing private
  `moderation.status.changed` outbox event to a `reviews_account` targeted push. The
  event carries only decision/recipient identifiers and routing flags; the relay reads
  the durable `moderation_notices` row under service authorization for title/body.
  Level 2 and Level 3 removal additionally hand one transactional email to Resend using
  `moderation-decision/<decision_id>` as the provider idempotency key and records the
  result in `member_moderation_email_deliveries`. The recipient email is resolved from
  Supabase Auth only inside the relay and never enters the event or portal response.
  Level 1 removal does not email, and `escalate_restricted` produces neither member
  delivery because quarantine is an investigative rather than final state. Member and
  administrator messages use the same server-only responsive HTML/plain-text renderer,
  while retaining separate recipient and delivery ledgers. Member copy contains only the
  finalized content action, account consequence, policy area, effective timing, appeal
  path, and stable decision reference; reporter identity, evidence, and internal rationale
  never enter it. New-report administrator email receives bounded report taxonomy and
  identifiers but no evidence payload, and uses `admin-report/<report_id>` for provider
  idempotency. Operational email continues to use the rolling-hour database claim and
  derives its Resend idempotency key from that claim.
- Repeated profile invalidations may coalesce only within the database transaction
  that produced them, using the transaction ID in the idempotency key. Separate user
  actions can never reuse a published row or lose an invalidation.
- Doji-live pushes prefer direct APNs or FCM, with Expo as a transitional fallback
  until an installation has registered its native endpoint. This avoids Expo's 600/s
  project cap. A failed handset refresh of the optional Expo token is recorded as a
  diagnostic breadcrumb rather than a production incident; failure to register the
  native endpoint remains reportable. iOS production requires `APNS_KEY_ID`, `APNS_TEAM_ID`,
  `APNS_PRIVATE_KEY`, and `APNS_BUNDLE_ID`; Android production requires
  `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY`. Doji pushes use high
  priority and iOS time-sensitive interruption. Friend-request, mention/reply, and
  review/account pushes use active interruption and their category-specific Android
  channels.
  The FCM sender fails closed unless the project ID, service-account email, and private
  key envelope are structurally valid. Delivery telemetry retains bounded provider
  codes and safe local categories only; it never stores raw provider bodies or secret
  values.
  Stable `threadId`, `collapseId`, and Android `tag` values keep related alerts
  organized or replaced without changing durable in-app history.
- The Firebase Android app and its Android API-key application restrictions include
  Google Play's active deployment-certificate SHA-1 for `com.doit.challengeapp`.
  The upload key and Play's hybrid/post-quantum certificate are not substitutes for
  the certificate that signs installed production APKs. Validate this exact
  package/certificate pair against Firebase Installations after any Play signing-key
  change; an OS-level permission grant alone does not prove FCM registration works.
- APNs provider authentication is coordinated across Edge isolates. Both direct push
  functions reuse the same service-role-only short-lived JWT; one atomic database lease
  rotates it after 45 minutes, while the permanent `.p8` signing key stays exclusively
  in Edge secrets. Local module caching is single-flight, so concurrent sends inside one
  isolate cannot mint competing tokens. A concrete APNs credential rejection may retry
  once only if reconciliation finds a different already-published canonical token;
  ambiguous transport failures are never retried.

These constraints prevent three historic amplification paths: multiple profiles owning
the same physical-device token, duplicate producers for one action, and a provider
handoff being repeated when its database acknowledgement failed.

## Channels

- `doji:global`: pre-live, activation, and close announcements.
- `feed:public`: coalesced Everyone-eligible post-membership hints only; subscribed
  only while the feed is focused. Engagement and poll-vote changes use mounted post
  channels.
- `profiles:global`: retired; profile changes fan out to the account and accepted
  friends instead of every connected device.
- `leaderboard:global`: five-second-coalesced XP/rank and rendered-profile-field hints;
  subscribed only while the leaderboard is focused. Reaction/streak/badge bookkeeping
  does not emit this event.
- `user:{id}:events`: private friendship, block, badge, suggestion, and notification state.
- `moderation:global`: report queue changes; granted only to administrator tokens.

Messages contain identifiers, versions, original occurrence time, and event IDs, not trusted application rows.
Friend fanout batch envelopes use the durable outbox UUID as both Ably's client-supplied
message ID and `data.eventId`; other messages retain `data.eventId` for application
deduplication. Clients still treat every event as an invalidation hint and refetch.
The app deduplicates event IDs and refetches authorized data through RLS. A shared
reconciliation function invalidates all server-owned surfaces on reconnect/foreground.

## User-visible mutation coverage

Challenge Activity Center Clear/Dismiss uses existing server-owned phase timestamps:
`activated_at` when present, otherwise `prelive_at`, with the legacy `sortAt`
fallback for old payloads. The scheduled-start display remains unchanged. Existing
`doji.*` invalidation and foreground/reconnect reads expose the later activation,
which may reappear after a pre-live dismissal because it is new activity. No new
event, polling, RPC, database write or push suppression is introduced by this
September 26 client-only repair. Store rollout/device verification remains pending.
Unread uses the same server-owned activity timestamp. Within one mounted account,
Clear/Dismiss/Open intents are optimistically replayed over confirmed receipts and
their existing commands and local disk writes are serialized. Failure removes only
the failed intent. Pending Clear/same-item Dismiss taps are single-flight. Unmount or
account change stops queued dispatch and rejects late state/persistence effects;
notification bootstrap/snapshot requests pin the captured actor's token. Command
retry/refresh must retain that actor. This is not a durable background queue and
introduces no polling, cross-device sync mechanism, or new backend data.

| Surface                           | Authoritative event                      | Scope                   | Client reconciliation                                         |
| --------------------------------- | ---------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| Doji pre-live/activation/close    | `doji.*`                                 | global + targeted user  | upcoming state, occurrence, banner, feed, notification center |
| User occurrence/completion/buy-in | `user_event.updated`                     | user                    | current Doji, feed                                            |
| Poll vote/result                  | `poll.vote.*`                            | mounted post            | friend/everyone results, voters, feed                         |
| Posts                             | `feed.post.*`                            | public or owner/friends | feed, post, profile posts                                     |
| Reactions                         | `feed.reaction.*`                        | mounted post            | audience-scoped engagement snapshot and voters                |
| Comments/replies/likes            | `feed.comment*`                          | mounted post            | exact thread and audience-scoped engagement snapshot          |
| Mentions and social alerts        | `notification.*`                         | recipient               | bell history and remote push                                  |
| Friendships/blocks                | `social.*`                               | involved users          | graph, counts, feed, requests, open profiles                  |
| Public profile/avatar/cosmetics   | `profile.presentation.updated`           | owner + friends         | avatar-bearing active queries                                 |
| Public profile statistics         | `profile.stats.updated`                  | owner + friends         | active profile and friends                                    |
| Sparks/theme/preferences          | `account.profile.updated`                | user                    | auth profile and account UI                                   |
| Store ownership                   | `shop.ownership.*`                       | user                    | owned inventory and auth profile                              |
| Badges                            | `badge.updated` + `notification.badge.*` | global + user           | public profile badges, owner alert/profile                    |

Post-backed bell snapshot items include the bounded post ownership context used by
presentation copy. Shared poll/WYR activity is labeled as activity on today's Doji;
photo and free-text activity is labeled as activity on the recipient's post.
Reply commands may target a root or an existing reply. Postgres resolves and stores
the root in `parent_id`, stores the exact target in `reply_to_comment_id`, and routes
the reply alert to that exact target. Clients optimistically render the reply beneath
the root and reconcile it through the normal post-scoped comment event.
| XP/rank | `leaderboard.updated` | global | active leaderboard/profile |
| Suggestions | `notification.suggestion.*` | owner | submission state and bell history |
| Moderation reports | `moderation.report.*` | admins | report and restricted-safety queues |
| Moderation status | `moderation.status.*` | affected user | Account Status, Activity Center, feed/profile repair |

Shared poll/WYR cards have community-wide aggregate state, but social alerts are
friend-scoped: only accepted friends of the actor receive participation, reaction,
or comment alerts. Targeted test events additionally require recipient cohort access.

The mobile feed key includes the authoritative current `daily_event_id`; no client
timezone query determines which occurrence is current. Pre-live changes that logical
feed identity without deleting prior posts, comments, or reactions. Historical
occurrence, vote, XP, streak, badge, and analytics data remains durable. Poll behavior
is explicit metadata: generic polls may have one `Other` option; WYR contains exactly
two choices.

Unlocked pages come from `get_feed_page_snapshot`; poll cards use the constant-size
`get_poll_results_summary`, while a selected option pages voters through
`get_poll_option_voters_page`. The current Doji snapshot embeds its bounded poll
choices, so participation has no dependent request. Leaderboard and bell history use
bounded server snapshots, and friends, friend requests, blocked users, and social
voter sheets use stable keyset cursors. Count-only UI calls constant-size count RPCs
instead of downloading each collection. `get_post_detail` owns both locked-post/block
authorization and its nested safe profile projection. TanStack Query restores the
first cached feed page and reference data, then reconciles in place.

Block filtering and legacy demo markers apply to neither global competition nor its
visibility; only banned profiles are excluded. `get_leaderboard_snapshot` keeps reads bounded to the top
result window but always appends the signed-in viewer with their authoritative rank
when they fall outside it; friends mode is accepted friends plus self.
`get_public_profile_view` exposes an explicit access state:
when the target blocked the viewer, it returns no profile fields. Both accounts receive
the identifier-only block event so an already-open profile reconciles immediately.
Administrators read pending report evidence and pending challenge suggestions through
bounded safe-field snapshots that are not suppressed by viewer-relative content or
profile policies. The mobile review queues retain cached rows during background
reconciliation and reserve blocking error UI for a cold read with no usable data.

New account creation is age-gated before credentials become an auth account. The
mobile flow collects and locally validates the birth date first, Supabase's
before-user-created hook enforces 13+ at the auth boundary, and profile creation
reassesses it using the account timezone. The private assurance retains the exact
self-declared date with its age band, policy version, method, and timestamp; a
database trigger removes only the redundant auth-metadata copy after that record
commits.

Opened comment threads use `get_comment_thread_snapshot`, which includes authorized
comments, safe author presentation, friend/everyone and block filtering, and the
viewer's like state in one query. The client does not fetch comment IDs, likes, and
the friend graph serially.
The mutation actor inserts a stable optimistic comment and updates the cached post
counter before the network round trip. Other mounted clients receive canonical
`feed.comment.*`/`feed.reaction.*` post-channel hints, then reconcile through the
bounded `get_post_engagement_snapshot_v2` and exact active thread. The RPC receives
the feed audience: Everyone sums fixed shards and subtracts blocked actors, while
Friends reads only the bounded accepted-friend-plus-self graph. Loaded infinite-query
pages are never used as engagement totals. Private notification events that carry a
`postId` provide a second targeted invalidation path because their alert may arrive
before the one-second coalesced post hint; concurrent reads for the same post and
audience share one in-flight promise. An authoritative snapshot patches only its own
audience and marks any cached alternate audience stale. Counter maintenance must not
emit `feed.post.*`, because that would turn every engagement action into a feed-wide
refresh.
Mutation rejection restores optimistic state and leaves persistent, contextual error
feedback on the surface that initiated the command. Error toasts must not disappear
before the user can understand or retry the failed action.
Reaction command results and engagement snapshots sum only the fixed 128 counter
shards; regrouping the unbounded `reactions` table is forbidden. The Friends poll
surface ignores global vote hints and reconciles from the viewer's bounded
friend-activity channel. Everyone remains post-scoped. Hot post-engagement and poll
summary reads can go through `readThroughScaleGateway`: with no URL configured they call
Postgres directly; at scale, `EXPO_PUBLIC_SCALE_READ_URL` switches those query keys to an
authenticated aggregate cache. A scale gateway must preserve
`can_view_full_post`/`can_access_daily_event` authorization and must never silently fall
back to Postgres during an outage.

The Cloudflare Worker implements the fail-closed authenticated read tier for bounded feed,
locked-feed, profile, engagement, and poll-summary RPCs. It verifies Supabase JWTs, keeps
short-lived cache entries account-scoped, coalesces identical in-flight reads, and forwards
the caller JWT so the existing database authorization remains authoritative. Direct Postgres
reads remain the small-launch configuration until `EXPO_PUBLIC_SCALE_READ_URL` is configured.
A 100k launch remains blocked until the paid providers are sized and this exact tier is
load-qualified and monitored under representative multi-identity traffic.

The same Worker also owns the private administrator portal boundary under
`/portal/admin/*`. These routes are never edge cached, accept only exact
origins configured in `ADMIN_PORTAL_ORIGINS`, require a verified Supabase JWT with
`aal2`, apply a bounded per-operator budget, and forward the caller JWT plus the
public anon key to a small RPC allowlist. The Worker does not hold a Supabase service-role
key. `get_admin_portal_session` returns the operator's minimal identity and roles;
the full command center is restricted to legacy administrators, `super_admin`, and
`operations`; `get_admin_command_center_snapshot` returns at most 50 existing report/suggestion work
items, including the exact suggestion options and a safe submitter identity, plus coarse
delivery health, the next Doji, release policy, announcements, and a bounded audit tail.
The dedicated `get_admin_audit_page_v2` contract exposes keyset-paged safe actor,
correlation, metadata, and entity fields for detailed clickable audit inspection. Category
and bounded text search execute in Postgres across the complete audit history rather than
only the loaded browser page. The default activity view omits repetitive evidence opens;
the access view groups adjacent identical opens for presentation while preserving every
raw append-only row. `get_admin_audit_export_v1` exports at most 5,000 matching safe raw
rows and explicitly reports truncation.
Trust & Safety is the first writable portal workflow. AAL2 operators
with `moderation.write` use `admin_triage_report` for assignment/priority and
`admin_decide_report_v3` for a policy/severity-classified outcome. Routine action changes
only the violating row to `removed`, retains evidence, issues a warning/member notice,
and never hard-deletes the row or bundles it with a blanket ban. Serious/emergency action
sets `quarantined`, leaves the report open, and moves it to `restricted_safety`.
Final restricted disposition additionally requires `legal.read` and records the content
outcome independently from a warning, server-expiring temporary restriction, or permanent
suspension. The write guard authorizes expiry from server time. Permanent suspension
captures prior per-content visibility before setting retained rows to `removed`; appeal
reversal restores access and those captured states atomically. Finalized removals add an
  account-category push to the same outbox event; Level 2 and Level 3
  removals also send one idempotent transactional email to a verified address. The
  service-role-only `get_moderation_push_recipient` lookup permits only an actively
  permanently suspended member's final moderation notice to bypass the normal banned-
  profile recipient exclusion; it does not reopen any social push path. The existing
  `reviews_account` preference and master push preference still gate OS delivery, while
  the durable in-app notice remains available regardless of push state.
  Resolved cases are excluded from the latency-sensitive command-center snapshot and
  read through `get_admin_resolved_reports_page_v1`, a separate AAL2-authorized,
  moderation-role-gated keyset page ordered by `(resolved_at, report_id)`. Opening an
  archived case reuses `get_admin_report_case_v2` and adds the final decision, account
  consequence, Account Status notice, push, email, and appeal states; it remains
  read-only until an authorized operator explicitly invokes
  `admin_set_report_review_state_v1`. The command
  center publishes `urgent_deadlines` for every pending report approaching the review
  target and a separate `restricted_safety_open` count for the Legal requests indicator;
  one signal must never stand in for the other.
  That atomic command can reopen an unappealed final
  decision for follow-up review or return that review to the archive; it never changes
  content visibility, account enforcement, notices, or delivery state. Reversal remains
  an independent appeal action. The private media policy recognizes pending and resolved
  reports, so retained evidence stays available to its AAL2 case reader without becoming
  visible to members. Every protected evidence open is still audited.
`get_admin_report_case_v2` returns only safe identities, bounded evidence, the current
content moderation state, original audience, content timestamp, Daily Doji title,
stable content reference, related-account counts, the policy catalog, bounded workflow
history, current triage state, and a compact evidence-access summary for one report.
Workflow history excludes repeated `report.evidence_viewed` events so the case timeline
shows ownership, priority, escalation, and decision progress. The raw evidence-access
events remain append-only in `admin_audit_log` and visible through the dedicated Audit Log.
The browser does not query consumer content tables directly. The AAL2
`operations.read` platform-health route calls the same service-only operational-health
query used by alerting and may enrich it with sanitized unresolved Sentry issue groups.
The Sentry organization token is stored only as a Worker secret with `event:read`; it
never reaches the browser. The response is never publicly or edge cached, contains no raw event payloads,
and a one-minute per-isolate memory snapshot coalesces simultaneous operator reads without
changing the authoritative Postgres health query or adding another service. It
and anchors the visible five-minute delivery telemetry to the registered Daily Doji while
showing Sentry's separate 24-hour production window. The existing one-minute service
monitor additionally calls `refresh_daily_event_health_snapshots_v1`: completed
production events receive bounded summaries from event-scoped outbox, realtime,
push-shard, participation, and post rows, remain refreshable while delivery settles, and
become immutable thirty minutes after close. `get_admin_event_health_history_v1` exposes
only a recent bounded page to AAL2 `operations.read` users; the browser cannot write the
underlying table. `submit_moderation_appeal`
creates one durable appeal;
`admin_review_moderation_appeal` requires a different AAL2 operator and atomically
upholds or reverses/restores the content and account consequence. These commands lock their subject, reuse a
stable idempotency receipt, enforce bounded reasons, and append `admin_audit_log`; every
other portal mutation remains disabled.
Private post media receives a five-minute signed URL only after that report read and the
existing Storage authorization succeed. Relative signed paths are normalized to the
Storage API boundary and load failure becomes an explicit unavailable state. Portal
activity does not create a second socket topology: the live portal subscribes
to the existing `moderation:global` and `doji:global` Ably channels through the existing
short-lived endpoint but a separate AAL2-only admin capability RPC. Normal mobile token
issuance does not consult portal-role tables. Messages remain identifier-only and are coalesced
into fresh authoritative command-center and appeal reads; reports, appeals, and community-suggestion changes
both invalidate the admin queue, and a recovered connection also reconciles.
Parallel portal reads share one refresh-token rotation. Signing out invalidates the
local session revision before a `scope=local` network logout, so an in-flight refresh cannot
restore the browser session and locking the operator portal cannot revoke the same identity's
mobile or other-device sessions. Mobile sign-out uses the same current-installation scope.
The React Native client pauses automatic refresh outside the foreground and resumes it on
activation. The browser also expires the protected workspace
after 30 minutes idle or eight hours absolute age; the next read fails closed and requires
fresh password/TOTP authentication.
First-time administrators use the same Doji Auth identity. After the password reaches
`aal1`, the portal enrolls a Supabase TOTP factor, displays its QR/secret without
persisting either, challenges the submitted six-digit code, and stores the session in
`sessionStorage` only after the returned JWT reaches `aal2`. The production UI exposes
no email or paid phone factor; an abandoned unverified TOTP factor is removed before a
fresh enrollment so retrying setup does not consume the account's factor limit.
Only AAL2 `super_admin` users receive `operator_manage`. They can list safe operator
identities through `get_admin_operator_directory_v1` and atomically grant/revoke one
allowlisted role for an existing non-banned Doji account through
`admin_set_operator_role_v1`. The command requires a rationale and idempotency key,
prevents removing founder authority or the final super administrator, and appends the
access change to `admin_audit_log`. Non-super-admin operators retain the established
least-privilege permission matrix.

When the paid Storage transform capability is enabled,
`EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED=true` signs 1440x1920 3:4 feed representations and
360-pixel thumbnails while preserving the immutable private original. The capture/library
flow center-crops once to that same frame before approval and uploads that exact approved
JPEG without a second client encode. Variant identity and its derivative contract version
are part of the native disk-cache key, so a quality/size change cannot reuse stale bytes.
Once the current authorized feed record is restored, the client checks this stable disk
key before signed URL refresh and can display cached local bytes immediately. The fresh
short-lived URL is still requested in parallel, is never persisted, and replaces the
source without resetting the displayed-ready state. The original remains the
authorization and fallback path.

## 100k burst contract

- Pre-live and activation are constant-time with respect to account count. Activation
  commits one Ably identifier event and never inserts one occurrence, recipient, or push
  row per account. After commit, the fanout planner inserts only the physical hash
  partitions that contain eligible recipients, from zero through the 128-partition ceiling.
- Current-state reads lazily and idempotently materialize the requesting account's
  authorized occurrence. Push delivery and participation correctness are independent.
- Each deterministic shard is independently leased. Recipients are keyset-paged in
  500-account windows, their bounded active installations are terminally claimed in
  one batch, and delivery uses bounded native-provider concurrency. A singleton
  Cloudflare Durable Object alarm advances only the active shards with bounded
  concurrency and resumable continuations until completion or the two-minute launch
  expiry. Expiry with unfinished shards is a monitored incident. Expo batches are used
  only for installations not yet migrated.
- The checked-in launch model separately models database/queue orchestration and
  provider capacity. It explicitly fails if Expo's documented 600/s limit is treated
  as the 100k scale path. Direct native delivery must sustain the modeled provider-rate
  target in a staging load test before a 100k launch.
- `npm run test:scale-bursts` gates 30-, 60-, and 120-second bursts. Its provider,
  database, and Ably rates are scale-mode capacity contracts, not claims about the
  current free plans. Its output is a required-throughput budget, not evidence that
  Supabase or Ably achieved it; staging must exceed the reported Ably request and
  provider and realtime rates with at least 25% relay and direct-provider headroom.
  Ambient Activity Center traffic is modeled independently from OS push delivery.
- Poll, community reaction, comment, and occurrence-participant counters use 128
  deterministic database shards. No launch burst may serialize on a single option,
  post, or reusable challenge row.
- Everyone-view totals sum fixed shards and fetch at most four indexed preview voters.
  Friends-view totals scan only the viewer's bounded social graph.
- Poll and public-feed invalidations coalesce to at most one event per aggregate/type
  per second. Profile invalidations are social-graph scoped; leaderboard invalidations
  coalesce to five-second windows and are emitted only for board-relevant fields.
- Activity Center friend scopes join against `friendships.accepted_at`; accepting a new
  friend cannot expose their earlier completions or community interactions as new rows.
- Authenticated social writes are protected by per-user/action time buckets in
  Postgres. Deletes are not trigger-throttled so moderation/account cascades cannot be
  stranded; recreating the deleted resource still consumes the insert budget.
- Cold socket opens connect immediately; authentication/capability work is already
  batched and must not create an artificial stale window. Initial data queries do not
  perform a redundant connection reconciliation. Mounted post channels rewind ten seconds of
  identifier-only hints on their first attachment to close the read/attach race, then
  the per-post batcher and in-flight snapshot dedupe collapse replayed work. Recovered
  connections reconcile after a bounded 100-500 ms jitter to avoid a synchronized
  Postgres surge without leaving the UI stale for seconds.
- Push delivery remains an alert, never the authority for eligibility or the ten-minute
  server window. Reconnect/foreground always reconciles Postgres state.

## Security boundaries

- Mobile clients receive 15-minute, capability-scoped Ably tokens. Global and
  user channels are fixed; mounted post UUIDs are sent to `realtime-token`,
  authorized through the caller's post visibility contract in one bounded RPC,
  and added as exact `post:<uuid>` capabilities. PostgREST verifies the bearer token
  for that authenticated-only RPC and returns its user ID with the capability inputs,
  eliminating a separate Auth-server request. Mobile token requests are serialized and use
  a 20-second transport timeout so cold starts do not create an auth-request storm.
  The client supplies its current access token explicitly; an HTTP 401 causes exactly
  one session refresh and one read-only retry. Authenticated command requests have the
  same single 401 recovery, independent of their bounded transient retry budget.
  Authenticated clients never receive a `post:*` wildcard.
- A provider capability rejection receives one bounded recovery attempt: invalidate
  the cached exact-post grant, mint a fresh capability set, release the failed Ably
  channel object, and attach a new one. When the refreshed server capability omits
  the post, the subscription ends without background retries and invalidates the
  active feed/post queries so Postgres removes stale content. Repeated provider
  rejection after Postgres grants access remains an operational error.
- Private post-media uploads use an owner-scoped pre-commit SELECT bridge for the exact
  uncommitted server reservation. This permits Storage's INSERT-returning and resumable
  upsert steps without exposing unrelated media; committed reads still require normal
  post visibility authorization.
- An Ably connection is never reused across account identities. A token refresh for
  the same account preserves the socket, while sign-out or an account switch closes
  it before a token bearing a different `clientId` can be authorized.
- Only administrators receive the `moderation:global` capability.
- Cloudflare holds narrow orchestration and relay secrets, never the Supabase
  service-role key.
- Privileged work stays inside Supabase Edge Functions and `security definer` RPCs
  with explicit authentication and authorization checks.
- `PUBLIC` and `anon` have no execution privilege on `security definer` functions.
  Mobile RPCs are allowlisted to `authenticated`, fixed `search_path` values prevent
  caller-controlled name resolution, and RLS auth helpers are statement-cached.
  Security-definer helpers referenced by authenticated RLS policies retain explicit
  `authenticated` execute grants; revoking those grants makes the policy fail closed.
- A clean database bootstrap does not require an existing Apple reviewer Auth user;
  reviewer profile setup is an optional, idempotent post-bootstrap action.
- Release preparation may raise only `@reviewer` to the documented review balance
  through one idempotent `app_review_credit` ledger row. It does not open an
  occurrence, seed social content, or bypass the normal buy-in command.
- Operator-approved Spark credits use the non-client `award_sparks_once` helper with
  the `admin_grant` reason and a stable reference. The balance is never changed
  directly, so retries remain idempotent and the adjustment stays auditable.
- Socket payloads do not bypass RLS; clients always refetch Postgres rows.
- Feed invalidation never prepends into a scrolled viewport. The client reconciles the
  latest authorized snapshot, immediately removes rows no longer returned by Postgres,
  and temporarily withholds only identifiers inserted ahead of the previous head. A
  user action (or return to the top) commits those rows. This presentation rule does not
  change event payloads, pagination, authorization, or the source of truth.
- App announcements do not use push or realtime for correctness. An authenticated,
  atomic claim RPC applies the server schedule and per-user frequency cap after the app
  becomes usable; normal foreground/query reconciliation picks up future eligibility.
  Direct table access is denied and CTA/dismissal receipts are written by a narrow RPC.

## Deployment order

1. Create the Ably app/key and Cloudflare Worker account.
2. Set Worker secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ORCHESTRATOR_SECRET`,
   `OUTBOX_RELAY_SECRET`, and `SENTRY_DSN`. Before enabling the private admin portal,
   also set `ADMIN_PORTAL_ORIGINS` to the comma-separated exact production admin origins;
   an empty value denies all browser origins.
   The Worker uses the relay secret to deliver operational alerts through the protected
   `send-admin-email` Edge Function; it never needs a third-party webhook credential.
3. Deploy `infra/doji-orchestrator`.
4. Set Edge secrets: `ABLY_API_KEY`, `OUTBOX_RELAY_SECRET`,
   `DOJI_ORCHESTRATOR_URL`, `DOJI_ORCHESTRATOR_SECRET`, `RESEND_API_KEY`,
   `ADMIN_FROM_EMAIL`, and `ADMIN_ALERT_EMAIL`.
5. Deploy `realtime-token`, `relay-domain-events`, `orchestrate-doji`,
   `schedule-daily-challenge`, `run-data-maintenance`, and `operational-health`.
6. Apply all migrations in timestamp order and configure the orchestrator Vault values.
   Set `EXPO_PUBLIC_COMMAND_GATEWAY_URL` to the production Worker URL for every release
   build; production build validation fails closed when it is absent.
   Rotate the shared orchestrator credential only through
   `scripts/sync-production-orchestrator-secret.ps1`, which updates Cloudflare, Edge,
   and Vault together and proves both wake paths before reporting success.
7. Invoke `schedule-daily-challenge` once. Every later alarm chains automatically.
8. Run a physical two-device test for activation, completion, social actions,
   friend/block/report actions, reconnect recovery, and close-boundary rejection.

Any staging deployment must use a separate worker, Durable Object namespace, Supabase
project, and credentials. Never point the production worker at a staging database.

`schedule-daily-challenge` is an internal preparation endpoint despite its legacy name.
It accepts only the orchestrator secret and is not attached to pg_cron.

## Required monitoring

### Portal presentation is not the paging policy

The admin-only `website/admin-portal/health-model.js` classifies existing read snapshots;
it changes no member RPC, session, delivery owner, database policy, or alert threshold.
Command center and Platform operations use the same classification. Current delivery,
Sentry's bounded unresolved-production-issues query (24h, at most 25 groups), and recent
Doji summaries are distinct signals. Issue lifetime overlap is not event attribution;
group counts are not per-Doji event counts. Resolved/unreported errors and per-feature
request success rates are not covered by this query and are explicitly identified as gaps.

Portal review severity is Healthy / Watch / Degraded / Critical / Needs verification.
The internal `unknown` state stays fail-closed; each signal explains No recent traffic,
Limited sample, Telemetry missing, Refresh needed, or the specific Sentry connection
failure instead of a generic unknown badge. No traffic does not display 0 ms as measured
latency. Missing monitoring is not repaired or hidden by this presentation change. Realtime
Watch starts at p95 >= 1s or any sample > 5s; Degraded at p95 > 5s with >= 20 samples;
Critical at any sample > 30s. Any overdue outbox or stale push work is Degraded;
exhausted work or APNs credential failure is Critical. Missing fields, reads older than
3 minutes, and low-volume latency cannot establish Healthy. The existing session timer
reclassifies stale display data without adding network polling. A manual Refresh health
action reuses the existing authorized portal reads. Recent Doji missed targets remain
visible after current recovery, and expired push shards are shown even if an older
event-level `healthy` boolean is true. A finalized delivery summary is not an app-wide
success guarantee. These presentation thresholds do not change server paging rules below.

- Alert on unpublished `domain_event_outbox` rows whose `available_at` is more
  than 60 seconds overdue. Approved phone alerts are immediate, so future-dated social
  push rows are a policy regression rather than healthy queued work.
- Active push partitions remain telemetry while the durable fanout owner retries them.
  The owner pages on repeated partition failure or immutable launch expiry and first
  terminalizes unfinished database rows so they cannot create permanent stale alarms.
- Track unexpected Ably authentication, capability, protocol, and provider failures and
  Edge Function relay errors in Sentry. Expected handset transport loss (for example,
  a cellular network becoming unreachable) remains a diagnostic breadcrumb while the
  resilient subscription and foreground reconciliation paths recover; it is not an
  application incident or an administrator page.
- Track `realtime_p95_ms_5m`; three events taking more than five seconds from
  `available_at` to `realtime_published_at` degrade the operational health snapshot.
  The operating target is p95 below one second and p99 below two seconds. The outbox
  also retains `realtime_publish_attempts`: attempt one does not isolate relay pickup
  from publication/acknowledgement latency, and later attempts may follow a failed
  database acknowledgement even after successful provider acceptance. Operational
  alerts describe this uncertainty; correlate database waits, relay/Edge and provider
  evidence rather than inferring provider failure from a recovered queue.
- Track Expo push tickets/receipts separately from socket delivery.
- Alert on any recent APNs `TooManyProviderTokenUpdates`, `InvalidProviderToken`, or
  `ExpiredProviderToken` outcome. These provider-wide credential failures use the
  hourly-deduplicated `apns-provider-credentials` operational alert family.
- Alert when a token ownership transfer clears more than one prior profile or when
  duplicate push claims spike; both indicate a client/account or producer regression.
- The Worker invokes `operational-health` once per minute through a singleton durable
  health monitor. A monitor transport timeout receives one bounded retry with a fresh
  20-second request budget. Three consecutive monitor failures page once; an isolated Edge
  Function cold start does not page the administrator. Degraded snapshots and final
  durable-alarm retry failures call the protected `send-admin-email` Edge Function. Resend
  delivers the incident to the administrator, while a locked private database claim
  applies a true rolling 60-minute cooldown per issue family. If the snapshot finds
  genuinely overdue durable outbox work, the same check submits one recovery wake;
  this repairs a failed wake or relay period after service recovery.
- Realtime latency is degraded only with a representative five-minute sample of at
  least 20 events whose p95 exceeds five seconds, or when any event exceeds 30 seconds.
  This prevents a handful of low-traffic samples from paging as a system incident.
- When the outbox is caught up but publication is slow, alerts describe the relay/
  publication path or publication/database-acknowledgement path. This is not evidence
  of lost committed writes or proof of a provider fault. A failed health read records
  only the provider surface, timeout/network/
  HTTP/invalid-response class, bounded attempt count, and status; upstream bodies and
  application data never enter the alert.
- Retention is a self-draining Durable Object alarm. Each Edge invocation stays bounded,
  but `hasMore` schedules the next batch until operational and rate-limit backlogs are
  empty.

### Administrator read isolation

Portal realtime invalidations reconcile authorized reads; overlapping refreshes are
coalesced with a trailing reconciliation. Portal session epochs prevent responses
from a locked/expired session from repainting protected data or retrying commands
under a newly signed-in identity. These changes do not alter member subscriptions.

`/portal/admin/platform-health` calls the AAL2/operations-scoped, read-only
`get_admin_operational_health_read_v1` RPC. It does not call the monitoring Edge
function and cannot trigger snapshot persistence or alarm repair. Aggregate health
reads share a 30-second single-flight cache after per-caller authorization; the
existing monitor alone owns archive writes. No portal polling was added.

Active portal queues use additive `get_admin_work_queue_page_v1`; filters/search are
applied server-side before a bounded timestamp/type/id keyset page. This endpoint
does not change member RPCs, table policies, triggers or event producers.

### Member command feedback and read-failure reconciliation (2026-09-26)

The member layout owns report submission independently of virtualized rows. Existing
`submit_policy_report` remains the only atomic report command; this client repair
adds no server write, queue, schema, event or moderation policy. The latest unresolved
intent keeps its receipt key for retries within the signed-in host lifetime. Close/
reopen preserves that key, while account change destroys the host. Late mutation
callbacks check the original identity before touching cache. Optimistic rollback
requires the exact optimistic cache reference; newer data wins. A failed report
also schedules authorized feed reconciliation to resolve an ambiguous server commit.

Scale gateway errors retain HTTP status for the existing one-retry read policy.
The request/body deadline is eight seconds and cancellation follows the query.
PostgreSQL 57014 is a transient read failure; explicit authorization/validation codes
take precedence over incidental words such as "timeout" in an error message.
There is no direct-database fallback in scale mode and no new polling.
Cached comments remain visible only for transient refresh failures within the same
authorized query; initial and authorization failures use the blocking error state.

QueryCache error capture runs after retry, once per query rather than per observer.
Command capture runs at terminal HTTP/transport failure, and MutationCache covers
other handled writes. Object deduplication avoids counting the same gateway failure
again as a mutation. The API reporter preserves safe HTTP/SQLSTATE classifications,
uses code-owned operation names, strips sensitive ambient fields before send, and
caps unexpected events at ten/minute/device with a 60-second operation cooldown.
Offline/expected failures are breadcrumbs only. Monitoring exceptions cannot change
the command result. Existing release/build tags are preserved; realtime telemetry
and server operational alerting remain separate, unchanged systems. No new provider
or paid capacity is configured; rollout must verify existing Sentry quota controls.

These changes do not clear the historical database contention or prove burst
capacity. Shared-backend optimization requires its own approved impact, concurrency
regression, deployment and rollback plan. The local report regression exercises the
installed atomic receipt/quarantine contracts with synthetic, rollback-only fixtures.

### Unchanged-token registration optimization (2026-09-26)

The separately approved migration `20260926050000` changes only the Expo fallback
token helper: an equal normalized token does not UPDATE the caller's profile.
Profile validation/economy triggers remain installed and run on actual profile
updates. Clearing another owner's token and assigning a changed token retain the
same atomic transaction and token-keyed advisory lock. A missing profile still
fails and rolls back the preceding native-endpoint replacement/ownership transfer.

Native v1/v2/v3 registration is unchanged: endpoint `last_registered_at`, platform,
contract version and release identity continue to refresh. No realtime event
contract or reconciliation path changes, no polling, no handset scheduling, and no
new dependency on employee roles or portal availability. The ten-minute window,
durable alarms and direct-to-feed completion are unaffected.

Live function/permission/policy/trigger fingerprints and bounded member/employee
read canaries passed. Local full-chain tests include eight concurrent mixed member,
portal-read and relay transactions. This removes redundant work; it does not prove
production burst capacity or identify the previous incident's initiating blocker.
See `PUSH_REGISTRATION_RELEASE_2026-09-26.md` for evidence and rollback.

### Announcement completion contract (released 2026-09-27)

`docs/drafts/announcement_campaigns_v1.sql` adds a private completion record and
existing `award_sparks_once` call inside a successful new suggestion transaction.
The unique member/campaign insert serializes duplicate awards; no new member
RPC signature, event payload, authorizer or employee-role dependency is introduced.
Balances still reconcile through existing profile/economy invalidations and
authorized foreground/reconnect reads; private attribution has no client cache.

Enabled half-open announcement windows cannot overlap. Eligibility captures server
time and reads campaign configuration without locking a shared campaign row.
Cancellation stops later decisions, not an already accepted concurrent completion.
Claims omit already-completed campaigns and return canonical reward terms using
the existing body field. Receipt/dismissal APIs and existing impression limits stay
unchanged. No push, scheduled handset work or polling is added.

This is deployed under migration `20260927040000`. See
`ANNOUNCEMENT_CAMPAIGN_RELEASE_2026-09-27.md` for synthetic concurrency tests,
live verification, rollback preserving earned Sparks and remaining device/publication gates.

### Community idea re-review (released 2026-09-27)

The employee-only atomic editorial command supports pending/approved/rejected
transitions with optimistic versions, durable receipts and append-only admin audit
events. Current review metadata retains the original challenge association.
Reacceptance reuses it; withdrawal only changes future pool eligibility. Original
selection time, historical events, participation and earned Sparks are retained.

Every revision, including Reopen, enqueues an identifier-only
`notification.suggestion.updated` event to that member's existing private channel,
with `sendPush:false`. Existing targeted suggestion/notification invalidations and
authorized foreground/reconnect reconciliation already cover this event family.
The existing once-per-idea/outcome review notification trigger remains unchanged;
repeated acceptance does not invent another push or another reward.

The command uses the scheduler's existing prepare-next advisory key with try-lock,
then a NOWAIT challenge row lock. Any linked unclosed event prevents reversal;
closed past events are never edited. A partial open-event index bounds the check.
No recurring polling, new handset timing or member dependency on staff roles is
introduced. Missing historical links fail closed rather than guessing from text.
Only three links supported by exact approval receipts were recovered at release.
See COMMUNITY_IDEA_RETRIAGE_RELEASE_2026-09-27.md for tests and safe write-pause rollback.

### Reserved Other normalization (released 2026-10-05)

First approval of a general community poll removes submitted exact `Other` labels
after case/whitespace normalization, then adds one server-owned write-in. Two real
choices are required before any challenge is inserted. Submitted options remain
unchanged for audit; WYR and existing linked poll options are never rewritten.
This runs inside the existing employee-only atomic command and its transaction,
before the unchanged suggestion status update, reward triggers and identifier-only
invalidation events. No event, reconnect, push, polling, scheduler, vote or member
authentication contract changes. The local app's form/payload filter is unshipped;
the server approval guard already protects old-client submissions.

### Member read failure boundary (candidate 2026-09-28; not deployed)

`runMemberRead` centralizes the existing request-signal/RPC-error contract for
current user-event, release-policy, leaderboard, paged friends and badge-progress
reads. Outer HTTP status and first abort source survive until settlement. Proven
deadlines may use the existing single transient read retry; parent cancellation
does not retry. Real HTTP rejections take precedence over incidental aborts. Late
cancelled success cannot reach cache/clock side effects. No polling, new writes,
query keys or realtime event families; existing reconciliation stays unchanged.

The attention-seen command retains its atomic RPC, 12-second client deadline and
one idempotent replay. New tests cover identical payloads on 504 replay, recovery
without an incident and one terminal report after repeated 504s. They do not prove
the historical timeout resolved. See ANDROID_21_INCIDENT_FOLLOWUP_2026-09-28.md.

The same candidate boundary now covers suggestion history, owned shop items,
reaction-given count and reaction-voter query/prefetch, preserving member filters
and bounded cursors.
Foreground native push registration recognizes Firebase's exact transient token
errors via `retryPushRegistration`, sharing its existing maximum four attempts
and jittered 1/3/10-second retry delays. It stops on cancellation or inapplicable
registration, retains single-flight/receipt behavior and reports terminal errors.
No recurring polling, durable alarm changes, backend write contract changes or
provider credentials changes. This is queued source, not a deployed fix or proof
that push delivery timing has been qualified on a physical device.

The expanded September 28 candidate uses a single implementation for
`runMemberRead` and legacy `runAbortableQuery` callers. SDK GET/HEAD retrying is
disabled per member read; TanStack (or explicit profile bootstrap) owns recovery.
Read observation spans SDK token acquisition and response-body consumption;
expired work cannot dispatch after token lookup or install late data. Auth itself
is not cancelled or revoked. The custom fetch keeps caller signals attached
through body reads. Notification bootstrap remains a non-replayed atomic merge,
with bounded observation and local fallback; no changes to history commands,
events, invalidation roots, foreground/reconnect reconciliation or one-shot alarms.
See `MEMBER_READ_AUDIT_NEXT_BUILD_2026-09-28.md` for tested coverage, intentionally
separate write/receipt/media boundaries and next-build/device qualification.

### External removal intake candidate (2026-09-28; NOT deployed)

The additive private intake commits case, history and operator-alert work atomically.
The local category expansion derives queue/priority in Postgres from a generated
allowlist of the unchanged member taxonomy. Ordinary cases appear in moderation;
restricted leaves require legal.read on every case/target/command as well as paging.
Queue-scoped keyset indexes bound those reads. Public payloads cannot choose routing,
priority or deadline. Only high/critical cases create urgent operator-email work;
ordinary cases are reviewed in the queue without a new email producer. Category,
original allegation and receipt deadline are immutable in this candidate.
Staff-only `moderation.safety.received` / workflow events carry identifiers, not
requester information or evidence. The optional portal module refreshes bounded,
authorized reads through existing reconciliation and clears details on session lock;
there is no member subscription or added portal polling loop.

The separately approved exact-target staff bridge reuses existing report/moderation
events after explicit confirmation. It skips reporter visibility delivery when there
is no member reporter. It does not create a fake member or change member authorization.
The existing member reporting branch remains intact and passed offline regression.

Minimal operator email uses a durable private queue and bounded leases. The owner-approved
Cloudflare REST candidate checks the fixed recipient's verified status before claiming
work. Cloudflare has no documented idempotency guarantee: bounded at-least-once retries
can duplicate mail after an ambiguous outcome, with a stable reference for correlation.
Actual provider message IDs and delivered/queued outcomes are validated; bounce or
suppression is not success. Existing Resend member/ops mail paths are unchanged.
September 29: the dedicated mail credential passed a hosted-runtime canary and the
exact `safety-removal-alerts` v2 Edge function is deployed disabled. Temporary
service-only verification code was removed; existing functions/secret digests are
unchanged. No intake/alert SQL or scheduler was installed by this isolated release.
Its prepared insert wakeup/recovery mechanism is NOT active. Any approved
server recovery cron is scoped to due operator-email work, never challenge activation,
participation windows, push correctness or handset scheduling. Details and release
gates: `docs/EXTERNAL_TAKEDOWN_INTAKE_2026-09-28.md`.

The separately approved exact-object media repair remains unconnected preparation.
Its service-only ledger/processor distinguish byte-verified private archival,
origin deletion and later CDN revocation. There is no installed dispatcher, new
cron, event consumer, member read change or challenge/push change. Moderation/appeal
atomic handoff, held-evidence cleanup, targeted invalidation and reconnect coverage
must be qualified before deployment; local Storage primitive tests are not that
qualification. See `MODERATION_MEDIA_REPAIR_2026-09-28.md` for remaining gates.

September 29 local integration candidate (not installed): decision-state changes
queue exact-object restoration, fenced by revision/lease and active holds. After
Storage identity verification, one atomic completion updates permitted references
and appeal notices and emits `moderation.status.changed` on the affected member's
existing private topic. The existing handler invalidates moderation status,
notifications, feed/post/profile and related reads; media bytes/URLs never enter
the event. Multi-file posts remain hidden until all objects are verified, and
newer avatars are not overwritten. Final staff-progress invalidation and full
foreground/reconnect qualification still gate deployment. Hosted canary confirms
observed public/signed URL denial after propagation, not instantaneous global
revocation. No dispatcher, schedule or production member contract was installed.

September 29 continuation remains uninstalled: cleanup reservations, decision capture
and late media-reference commits share an exact bucket/path advisory key. Cleanup pins
identity and leaves a frozen tombstone after deletion, while held paths are deferred.
The privileged cleanup callers still require integration and bounded/fair queue tests;
RLS alone cannot protect files from those service clients. Preserved evidence is an
additive employee-only case manifest, separately authorized by exact archive identity,
MFA and restricted-case permissions at read/signing time. Existing drawer refresh and
preview expiry are reused; no polling, Worker route, event consumer or scheduler was
added. Staff media-progress events and reconnect reconciliation still need qualification
before deployment. See `MODERATION_MEDIA_REPAIR_2026-09-28.md` for current tests/gates.

September 29 qualified candidate supersedes those outstanding local-integration notes:
`moderation.media.updated` contains report/decision identifiers only on the existing
staff `moderation:global` topic. Existing portal invalidation, open-drawer refresh and
foreground/reconnect paths reconcile progress; no polling or new Worker consumer.
Member completion still uses existing `moderation.status.changed` reconciliation.
Durable capture/removal/verification/restoration is bounded by exact identity, revision,
leases and two concurrent jobs; five-minute due-work recovery supplements insert
wakeups. Member deletion cancels restoration without stealing in-flight leases.
Origin deletion cannot close intake until later old-URL denial is verified. This is
not browser/download recall or proof of global CDN propagation. Guarded rollout is
now installed/enabled: cleanup drained for at least 420 seconds before capture;
dedicated idle-safe recovery jobs 12/13 run every five minutes. Existing challenge
alarms, Worker consumers and member schedules remain unchanged. Hosted receipt,
identifier-only queue delivery, first-attempt delivered operator alert and private
status lookup passed for a synthetic no-content case. Live authenticated portal UI
review/closure completed September 29 at 16:37 UTC; requester lookup showed Review
completed and the audited case remained unlinked to member content. See
`SAFETY_LAUNCH_2026-09-29.md` for exact release
and evidence-retaining rollback; never remove cleanup fences or evidence during a hold.

September 29 portal-only presentation follow-up: external-intake reconciliation
now compares the rendered case revision with the existing bounded queue read;
off-page/closed cases use one existing authorized exact-case read. Refreshes are
coalesced and late results guarded by session/drawer generation, with no polling
or changed server event/command contract. Only proven newer revisions show a stale
draft warning and prevent confirmation. See `SAFETY_PORTAL_UI_REPAIR_2026-09-29.md`.

September 29 admin consistency pass changes only presentation, case-tab accessibility
and contextual audit-export feedback. Existing authorized reads, event handlers,
command payloads, coalescing, session epochs and lock cleanup remain authoritative;
no new polling or member/shared deployment. See `PORTAL_CONSISTENCY_2026-09-29.md`.

September 29 business applications are an offline, disabled database draft only.
Candidate commands atomically enqueue identifier-only `business.application.updated`
on an exact applicant topic and `moderation.business.updated` for submitted/reviewed
work on the existing staff topic, with no push. No producer or consumer is deployed.
Business-only token authorization, relay topic qualification, targeted invalidation,
session cleanup and foreground/reconnect reconciliation must pass before activation;
member token issuance/capabilities/alarms remain unchanged. No polling is proposed.
See `BUSINESS_APPLICATION_FOUNDATION_2026-09-29.md` for isolation and release gates.

Business UI continuation is still an unshipped candidate. Applicant reads coalesce
and reconcile on foreground/online/manual refresh; epochs discard results after
signout and commands invalidate older in-flight reads. Dirty forms survive remote
changes and require deliberate reload. Reviewer invalidation checks the exact
authorized record revision before warning, preserving notes. Browser hooks are not
connected to an authorized realtime subscription yet; producer activation remains
gated on a business-only token issuer, relay/topic qualification and consumer tests.
Existing member/employee realtime and shared Worker contracts are unchanged. See
`BUSINESS_ONBOARDING_IMPLEMENTATION_2026-09-29.md` for tested and unqualified paths.

The September 29 local account-access continuation adds no event producer, socket,
polling or shared Worker change. Verification/recovery use an exact-business signed
link and gated Auth exchange; TOTP uses the existing Auth enroll/challenge/verify
API. Memory-only session epochs cover late link/MFA results and local logout.
Business application AAL1 and approved workspace AAL2 remain distinct server gates.
Campaign/billing capabilities stay disabled. Business private realtime and protected
admin transport remain release gates; local Auth/browser success does not enable the
candidate outbox producers or change member authorization/reconciliation.

Local business-admin transport is now wired behind its independent default-off
flag through employee-scoped direct RPCs (no Worker change). Existing admin refresh
and foreground signals reconcile only an open business record or visible queue;
reads coalesce, exact IDs/revisions are checked, and session epochs discard late
responses. Dirty review notes survive newer revisions and stale decisions are blocked.
No new producer, socket, polling or member authorization change is enabled. Private
business topic authorization and relay qualification still require separately
approved shared-backend preparation before any business producer activation.

September 29 separately approved private-business preparation now supplies a
dedicated caller-JWT token issuer and exact-topic database authorizer; the existing
member/employee issuer remains unchanged. Tokens grant only subscribe on the caller's
business topic, TTL ten minutes, with an atomic per-account issuance budget (24/hour).
Browser, Edge and database producer gates are independently off by default. Candidate
relay guards require exact business family/topic/applicant/application identifiers
and sendPush:false; business worker groups cannot hold unrelated staff/member groups
behind a rejected business envelope. No added member relay ownership query or Worker
change. Existing bounded concurrency, leases and acknowledgements are retained.

The consumer uses authorized Postgres reads after hints, attachment, connection
recovery and channel update/attached discontinuity, plus foreground/online/manual
refresh. It requests no history, stores only 256 dedupe IDs and coalesces a trailing
read during an in-flight read/command. Hidden/logout closes sockets; epochs discard
late authorization/data, and dirty drafts survive revision changes. Current staff
topic permissions are not widened for business-read-only reviewers. Local SQL,
concurrency, browser and relay contract checks passed; hosted JWT/provider denial
and delivery canaries remain release gates. Existing tokens/signed requests cannot
be instantly revoked by flags; data reads always reauthorize. See
`BUSINESS_ONBOARDING_IMPLEMENTATION_2026-09-29.md` for rollout/rollback sequencing.

Local applicant read-recovery follow-up keeps the same manual/foreground/coalesced
reconciliation cadence. Initial failures do not authorize editing an assumed-empty
record. Loaded records and dirty controls remain during transient refresh failures;
only a successful read updates read-freshness feedback, and a successful command
installs its authoritative returned revision. Proven remote revisions still require
explicit draft reconciliation. Session cleanup clears freshness and late results.
No event, token, relay, RPC or member contract changed. Business realtime remains
disabled: inspected Ably Standard capacity is not a no-incremental-cost allowance.

Local business HTTP rehearsal now covers real Auth-issued applicant/employee JWTs,
employee TOTP, review and workspace revocation through PostgREST with all realtime
producers disabled. The uninstalled candidate's optimistic conflicts use PT409,
not the database-serialization retry code 40001; clients retain drafts/notes and
require fresh review. Existing atomic receipt, lock and event contracts are unchanged.
No shared deployed RPC/relay/Worker or member behavior changed. The local 40001
reproduction does not attribute historical mobile errors. Production pilot and
hosted delivery remain separately gated; see the business onboarding release record.

Public business admission is now locally prepared behind independent default-off
Auth/settings/frontend gates. CAPTCHA and account/email reservations are confined
to the dedicated business boundary. They create no realtime events or member work.
The existing application commands still own authoritative snapshots/review/revocation;
clients use existing bounded manual and foreground reconciliation. Business artifact
keeps realtime disabled and excludes Ably from its CSP. No shared relay, outbox,
push, scheduling or member Auth behavior changes. The public local Auth/HTTP
rehearsal again qualified member-session survival and zero business outbox work with
realtime disabled; production configuration/cost/delivery remain unqualified.

The subsequently approved closed business hosting release is static-only. Its CSP
blocks connections, forms and frames; no business Auth/application client, Functions,
Turnstile or realtime connection is packaged. It neither enables nor deploys the
prepared business backend. Shared member/Worker/outbox contracts remain unchanged.
See docs/BUSINESS_CLOSED_HOSTING_2026-09-29.md for the deployment boundary.
# Android 25 diagnostic candidate — October 2, 2026

Owner-approved Android-only native response observation adds no requests, retries,
events, invalidations, schedules or server writes. For exact Supabase REST HTTPS
GET/HEAD responses with status 504, a passive OkHttp application interceptor
passes bounded native provenance to the existing JS diagnostic boundary using
local response headers. They are not sent over the network. Android terminal API
events retain these allowlisted fields and shallow first-attempt evidence through
Sentry normalization. Other platforms and existing recovery limits are unchanged.
Native controls distinguish network responses from forced cache misses but have
not reproduced the production incident; a network response does not identify its
upstream origin. See `ANDROID_DIAGNOSTIC_BUILD_25_2026-10-02.md`.

## October 4 local-only Android POST observation

The prepared native observer also handles received 504s on fixed-host Supabase
RPC and command-gateway POST routes, with version-3 local response hints. It
calls the existing native chain once and never changes outgoing headers, bodies,
cache policy, auth or retries. Android command errors retain phase/deadline/native
context through their existing final error conversion. No realtime, outbox,
invalidation, database, push or iOS behavior changes. This has not been deployed
and does not establish the production 504 cause. See
`ANDROID_27_POST_504_INVESTIGATION_2026-10-04.md`.

## Android test environment attribution

Prepared locally for the next planned Android binary: the local Expo module
`DojiTestEnvironment` reads only `Settings.System` key `firebase.test.lab`.
The Sentry JS `beforeSend` boundary adds the bounded `firebase_test_lab` tag
(`detected`, `not_detected`, `unknown`) before the existing API privacy scrub.
No raw system value, device identifier or additional request is emitted. Failed
reads and old binaries without the module report `unknown`; other platforms do
not read the module. All errors retain their existing reporting and grouping.

This untrusted marker is not authorization and is never used for suppression,
retry decisions, realtime subscriptions or server state. Absence is not proof of
a human tester, and old events cannot be retrospectively attributed. Coverage
is JS error events through this hook, not native crash envelopes. This has not
been deployed and does not establish the production 504 origin.

# October 5: independent-business privacy/session binding contract

Independent business callback persistence now supplies its verified business actor
to `business_session_private.put_bound_session`. Identity and account locks serialize
the insert with closure/deletion, and the session record stores only its opaque
business principal alongside its existing encrypted envelope. Exact-case privacy
erasure can remove those sessions without reading or revoking member/employee
sessions. This adds no polling, schedule, provider webhook, push or new event type.
Privacy invalidation retains the existing identifiers-only, business-realtime gate.
The additive SQL was installed and verified at 18:27 UTC with the privacy gate
disabled. The updated runtime using the bound-session function remains local;
the live business endpoint is still disabled pending runtime/provider cutover.

## October 5: business journey presentation and local-only mail candidate

The later live business cutover supersedes the preceding historical disabled
runtime snapshot. The 21:41 UTC journey presentation release uses the existing
independent-business session and authorized application reads/atomic commands.
Receipt/history UI projects existing applicant-safe `id`, `submitted_at`, `history`
and `response`; internal notes and staff actors are never displayed. Check-answers
is local UI only; one explicit final confirmation invokes the existing idempotent
submit command. Unknown/malformed reads fail closed; stale edits remain protected.
No periodic polling, new realtime subscriptions, events, push or member changes.
Existing foreground/online reconciliation and manual refresh remain in place.

The email outbox SQL is LOCAL ONLY, not a migration in the deployment chain.
Its sole producer is an after-insert trigger on private business history, in the
same transaction as a successful submission/decision. It stores opaque references,
revision, kind and time, not email addresses, business details or reviewer notes.
One application/revision yields at most one queued item. A dedicated unbound
NOLOGIN role may claim only with an explicit fresh capacity gate; daily/monthly
reservations serialize in a business-only settings row. Claimed/uncertain outcomes
are not automatically replayed. Provider acceptance is never labelled delivery.
No sender calls, scheduled job, production grants or enabled switches exist yet.

### Local admin authentication presentation candidate, October 5

`admin-portal/auth-journey.mts` is bundled only into the admin artifact, ahead of
the existing portal controller. It owns presentation (phase copy, progress,
busy controls and secret-field cleanup), not credentials, sessions or authority.
The controller retains the existing password -> authenticator -> authorized
workspace flow and its one-use independent employee MFA transaction. Failed
independent MFA returns to fresh credentials rather than offering a consumed
flow again; legacy MFA retry semantics are preserved. A separate UI auth-flow
revision keeps explicit Back/new-flow responses from being overwritten without
suppressing wrong-password feedback when the transport invalidates its session.

Existing workspace epochs, protected-data clearing, role filtering, bounded
reads and foreground reconciliation remain intact. No realtime subscription,
database contract, retrying write, member authentication or business transport
change is part of this local candidate. Recovery/invitation provider routes and
email sending have not been replaced or enabled. No production deployment yet.

### October 6: admin combined-inbox visibility

The combined staff inbox reconciles only on Command center and Work queue, not on
individual domain pages. Navigating away advances its read generation and drops
coalesced refreshes, preventing a late response from restoring hidden queue rows.
Domain review reconciliation and an open ownership dialog retain their existing
authorized lifecycle. No new events, polling, backend or member contracts change.

### October 6: admin queue shell and pagination

The fixed-height queue presentation does not change event subscriptions, read
authorization or RPCs. Business, privacy, external-removal and staff inbox Previous
navigation reuses locally retained server cursors; filter/session clearing resets
the stack. No client-generated offsets or global-count scans are introduced.
Loading/failure clears stale rows, and existing generation/epoch fences still
discard responses after navigation, permission loss or lock. Row opening and case
outcome shortcuts only open/prepare existing review forms. Writes still require
explicit confirmation and existing atomic audited commands with revision checks.

### October 6: unified safety read — qualification and release

The owner-approved candidate uses the existing staff report/appeal/intake event
channels and reconnect/foreground reconciliation. No event schema, publication,
topic authorization or polling changes. Command center no longer loads the staff
inbox; My work and each safety area load only the visible authorized page.
Switching areas resets cursors/filters and increments generation, fencing late
responses. Existing employee session epochs still clear rows and ownership dialogs.
With the separate unified-safety UI flag enabled, external-intake modules are
detail-only: they retain exact case freshness checks for open drawers, not extra
list reads. Existing atomic, audited moderation commands remain unchanged.

The additive shared read and bridge wrapper default disabled. Following separate
owner deployment approval, they were installed and enabled on October 6, with
exact employee runtime v15 and final admin deployment
`07c321f6-0987-45c0-bfa0-a925dd798ea3`. Existing function/ACL/RLS/role/session
fingerprints and unrelated deployments were preserved. Live authorized reads
verified open and closed area separation without moderation writes.
Content-derived versioning of the complete lazy workflow graph prevents cached
old modules or styles from mixing with the new controller after normal reload.
There is still no new polling or event contract. Rollback restores the old
portal/runtime first, then the preserved employee dispatcher and removes only
this candidate read/setting; no case data is deleted. Exact evidence and rollback
versions are in `docs/ADMIN_WORKFLOW_FOUNDATION_2026-10-05.md`.

### October 6: local platform-health presentation and reconciliation

Platform operations now has a local candidate that explicitly separates the Ably
connection state from health-snapshot freshness. Existing non-staff hints still
invalidate authorized visible reads; bursts are coalesced, refresh batches serialized,
and an intervening hint schedules one follow-up batch. Hidden pages defer until
foreground reconciliation; lock/logout fences results. No polling has been added.
Overview also requests the existing bounded 12-summary health history, avoiding a
false missing-history state before operations is opened.

This is NOT a new production health event contract. Operational health and Sentry
do not yet publish employee-only change hints; caches can delay observations.
Operations-only channel authorization, source revisions/cache invalidation, and
health-producer notifications require separate shared-system approval and regression
qualification. See `docs/PLATFORM_OPERATIONS_HEALTH_2026-10-06.md`. Member delivery,
alarms, auth and notification contracts are unchanged by this local candidate.

Subsequent owner approval covers preparation/testing, NOT deployment. Local health
candidate uses `staff:health:operations` / `staff.health.changed`, with only source
and monotonic string revision. The service-only writer and admin-history trigger
atomically use the existing outbox; no member table trigger or new polling. Current
employee operations authority and enabled database gate are required for tokens.
Version reads before/after cached health reads prevent installing pre-event cache
entries; one bounded retry, then unavailable. Browser replay deduplication is
per-source/per-connection and hints invalidate only visible health views; existing
reconnect/foreground reconciliation recovers missed hints. Lock clears/fences state.
Default-off collector sidecar has a 2-second deadline/no retry; history publication
failure does not abort original telemetry persistence. Events share relay resources
and aggregate health metrics, so capacity qualification is still required. Sentry
and other providers have no new event producers. SQL inverse and local evidence are
in `docs/PLATFORM_OPERATIONS_HEALTH_2026-10-06.md`; production remains unchanged.

October 6 release update: the presentation and existing-event reconciliation layer
is now live in admin deployment `5f9c93d5-c72f-4693-b22a-dd32257e8ab8` (revision
`fc05ff9ee7be87fc`). There is still no new production health-event contract:
`healthEventsEnabled` is false and shared SQL, collector and employee runtime are
unchanged. Conditional deployment approval did not clear the cost gate: the current
Ably account is metered Standard, not Free. No incremental spend was approved.
Exact-package 14 browser checks and live artifact/member-contract fingerprint checks
passed; authenticated live Operations presentation/read acceptance also passed,
without claiming shared-feed delivery or complete monitoring. Existing member delivery,
alarms, auth, notification rules and shared relay deployment remain unchanged.

### Admin record-page navigation — October 6

Published October 7 03:16 UTC as admin deployment
`9f87f318-80a0-4700-9096-b567411c4066`; live asset hashes and unchanged backend
contract fingerprints verified. Shared health events remain disabled.

The admin-only record presenter moves existing detail controllers into full-width
workspace views. It adds no reads, events, subscriptions, timers or writes.
Queues remain mounted while hidden, preserving filter/cursor state when the user
returns. Existing authorized event invalidation, reconnect/foreground reads,
stale-revision guards and draft-preserving reconciliation are unchanged. Closing
a record continues to invalidate pending detail work and erase evidence through
the owning controller; session lock/expiry does not rehydrate records on browser
Forward. Browser history contains a random navigation token, never record content.
Footer relocation preserves form association and command boundaries. Only the
admin static bundle, review modules and stylesheet change; member auth/reads,
atomic moderation RPCs, shared realtime infrastructure and disabled health feed
remain untouched. See the admin workflow release record for verification/status.

### Mobile push-registration interruption — October 8, 2026 (local only)

`useNativeNotifications` owns one foreground/account-bound retry run. Its scope
subscribes to existing AppState/auth-store transitions, cancels on inactive or
background/account invalidation/unmount, and is disposed on settlement. A return
to active starts fresh reconciliation; repeated active signals do not duplicate
an in-flight run. There is no recurring polling or background-execution grant.

`syncPushRegistration` rechecks eligibility across asynchronous token/storage
boundaries and passes an account-bound cancellation signal only to the existing
register_native_push_endpoint v3/v2/v1 atomic commands. Native promises that
cannot be cancelled are observed but their late results are ignored. The command
gateway cancels fetch/body observation and retry delays, cleans listeners/timers,
and preserves the first cancellation/deadline reason even with React Native's
reason-less AbortController polyfill. Other commands do not opt into this signal.
Known HTTP failures and genuine foreground deadlines are not hidden by a later
background transition. Interrupted setup is explicitly `deferred` in Settings
and onboarding, not success or permission denial.

Client serialization, receipt fingerprints/TTL, fallback rules and bounded retry
budgets remain. Cancellation cannot prove a remote write rolled back; a new
foreground run uses the existing idempotent desired-state registration contract.
Unregister invalidates current client runs and removes receipts in the same
client mutation queue. No stronger server-side ordering guarantee is introduced.
No new realtime events, topics, RPCs, database changes, push delivery scheduling
or member participation dependencies are introduced. This is prepared source,
not a release; exact-build physical-device validation remains outstanding.

### Approved push-recovery logs / stack mapping — October 8, 2026 (local only)

The existing API failure reporter can retain the Sentry event ID of a native
push-registration error in memory, scoped to the current diagnostic session.
The next normal eligible foreground registration bypasses an old receipt if
that incident remains pending. Only an acknowledged existing atomic registration
RPC, followed by the current-account/lifecycle checks, emits the correlated
recovery log. Cancellation, cached success or stale-account results never do.
This changes neither realtime contracts nor retry/polling budgets. The recovery
is registration acceptance, not proof a push was delivered or that every error
in the app is fixed.

Owner-approved Sentry Logs fields are restricted to the original error event ID,
existing diagnostic IDs, app/build/platform, elapsed time and fixed outcome
labels. Correlation expires after 24 hours or session/account change, is lost
on process restart, and is capped at three log attempts per rolling hour per
process. The JS-only log filter rejects all other messages, removes ambient
attributes, and fails closed if SDK scope attributes could bypass that filter.
SDK transport metadata still applies; ingestion remains best effort. No alert,
resolution, sampling, provider, backend or paid-setting change is involved.

The Sentry Expo Metro config now injects runtime Debug IDs matching source maps
on both mobile exports. Local round-trip mapping checks pass, but native Hermes
composition, uploaded next-build artifacts and live event symbolication remain
release/device acceptance gates. No replacement maps were uploaded for 1.0.9.
Cloud builds are blocked by exhausted included Expo credit under the standing
no-additional-cost requirement. No new mobile binary or deployment exists yet.

### Next-build member recovery/support boundaries — October 8, 2026

Local-only preparation adds no topics, events, RPCs, polling or shared deployment.
The existing delayed notification-attention command now checks mounted state,
foreground state and the original authenticated actor before dispatch, passing
that actor guard to the existing command gateway. Native cleanup and command
rejections are observed without new retry loops. This guard does not prove that a
destination rendered or that a remote write was rolled back after dispatch.

Post detail keeps permitted cached data on transient read failure and exposes a
manual refetch; authentication/permission failures do not retain that data. This
does not bypass the feed participation gate or alter server authorization.
Report a problem reads the existing diagnostic snapshot locally and shares only
its allowlisted preview when the user opens the OS share sheet/email composer.
It introduces no diagnostic subscriber, background request or support database.
No message is sent automatically and no successful ticket submission is claimed.
