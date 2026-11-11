# Doji product and system context

Read this and [Realtime architecture](docs/REALTIME_ARCHITECTURE.md) before changing
cross-screen flows or shared services. This is a current source contract, not a
deployment diary. [Current state](docs/CURRENT_STATE_AND_GAPS.md) distinguishes
released software, prepared source and remaining gates. Git retains superseded
implementation chronology.

## Applications and ownership

| Application | Maintained source | Stack / identity |
| --- | --- | --- |
| Member app (one app for iOS and Android) | `app/`, `components/`, `hooks/`, `lib/`, `contexts/`, `stores/` | Expo / React Native / Expo Router; Supabase Auth |
| Admin portal | `web/apps/admin/` | React / Vite / MUI; independent WorkOS employee identity |
| Business portal | `web/apps/business/` | React / Vite / MUI; independent WorkOS business identity |
| Public website | `web/apps/site/` | Next.js static export; public SEO, legal and safety routes |
| Shared web packages | `web/packages/ui/`, `web/packages/portal-data/` | Doji MUI theme and session-scoped authorized data |
| Shared backend | `supabase/`, `infra/doji-orchestrator/` | Postgres/RLS/RPC, Deno Edge, Cloudflare Worker/Durable Objects |
| Portal services | `infra/portal-identity/`, `infra/business-email/` | Independent employee/business sessions, commands and business email |
| Browser compatibility | `website/` | Retained auth/application/safety controllers, legal sources and packaging |

Mobile and web have different locked React/toolchain versions. Do not flatten their
dependencies. Retained browser controllers are active dependencies, not a second
product UI. See [system map](docs/SYSTEM_MAP.md) for entry points and
[service catalog](docs/SERVICE_CATALOG.md) for every external service and its purpose.

## Non-negotiable boundaries

Mobile Development/Staging are separate installed identities using staging data and
credentials, not alternate member logic. Production remains the existing identity.
Configuration checks reject mixed bindings; native builds, provider activation and
physical-device parity have independent gates in [mobile staging](docs/MOBILE_STAGING.md).

- Postgres owns state, authorization, receipts, rewards and the transactional outbox.
- Poll activation atomically ensures its unique community card after feed retention;
  a card created when scheduling is not sufficient for later vote submission.
- Writes use existing atomic, idempotent RPCs. Never replace a command with several
  client writes. An uncertain response is not proof of failure or permission to
  issue a new command key.
- Events contain identifiers; authorized TanStack Query reads supply records.
  Add new server-owned query families to targeted event handling and
  foreground/reconnect reconciliation. No recurring member polling. The separately
  gated admin health cache permits bounded visible/online refresh; it must not
  rescan member data or make alerts depend on an open dashboard.
- Member login stays on Supabase Auth. WorkOS is only for independent employee and
  business identities. Same email does not imply the same principal.
- Portal UI/session work cannot revoke member sessions or change member behavior.
  Necessary shared-system work requires separately approved impact, regressions,
  deployment and data-retaining rollback. Shared hosting is not physical isolation.
- Public profiles use the explicit safe projection in `lib/profileFields.ts`.
  Never restore `profiles(*)` or expose owner/private fields through embedded reads.
- Source commits are not releases. No builds, emails, production SQL, provider
  changes or paid resources are authorized by ordinary cleanup or tests.

## Member experience

Doji is a daily social challenge. Eligible members receive the same occurrence.
Participation uses exactly ten minutes of server-authorized time; submission
returns directly to the feed without a success interstitial.

Submission errors distinguish unavailable participation, sign-in, media upload and
unconfirmed writes, with a safe next action. Do not expose raw server messages or
claim a failed request was rolled back. Preserve the existing immutable answer/key
for an explicit retry. A confirmed answer followed by a feed-loading failure asks
the member to reload the feed, not submit again.

### Account and navigation

Signup requires independently unchecked Terms and Privacy consents and a
server-enforced 13-plus age check. The asserted birth date belongs only in the
private age-assurance record, never public profiles or events. Username is
required; photo, display name and bio are optional.
Profile setup presents known prerequisite failures without exposing arbitrary
backend diagnostics, and distinguishes a confirmed save from failed follow-up
loading. Neither error handling nor test fixtures may manufacture legal acceptance.

The root layout owns session restoration and initial profile authorization.
An unfinished profile read is not a new account. Bounded transient recovery may
retain already-authorized UI; ban/onboarding authority still fails closed.
After the server confirms a missing profile, same-account background refreshes
keep signup mounted so camera/gallery returns cannot discard its draft. Initial
reads and authorization failures still gate access; this grants no member-app access.
Banned accounts retain their session but see only the ban/support/sign-out flow.
Account deletion preserves opaque moderation attribution and held evidence.

The outer Stack contains five tab roots: Feed, Leaderboard, Friends, Suggest and
Profile. Member profiles, post detail, notifications, settings, shop and challenge
screens push above those roots. Back pops actual history; `returnTo` is only a
cold/deep-link fallback. Notification taps open the exact authorized post and
optional comment thread, never search a paginated feed.

Username inputs preserve native composing text during editing. Normalize and
validate at availability/submit boundaries, not by rewriting `onChangeText`.
The Android keyboard repair is next-build source; device acceptance remains open.

### Daily lifecycle and completion

Twenty minutes before activation, pre-live advances the active occurrence without
revealing challenge content or deleting history. Durable one-shot alarms own
pre-live, activation and close; closing registers the next event. Phones and push
never authorize participation or schedule correctness.

Postgres owns timestamps and eligibility. Normal completion is `completed`;
an expired occurrence is `missed`. An atomic Sparks buy-in permits `buy_in_open`
then `late`, without reapplying the original ten-minute cutoff. The existing
server-owned signup-day exception remains separate. A newer occurrence supersedes
an older paid opportunity.
Display timers show the full authorized deadline, including signup-day grace;
only a countdown ring's graphic is bounded by its normal-window scale. Activation
and alarm recovery must not shorten signup-day or paid-participation exceptions.

Photo/task/format submissions use `complete_doji_with_post`; poll/WYR submissions
use `submit_poll_vote`. Uploads alone do not complete participation. Retries
reuse the same occurrence command and reserved owner object path; after an
ambiguous response, check the authorized receipt instead of inserting again.

General polls may have one reserved Other write-in; WYR has exactly two choices
and no Other. Editorial approval preserves original submissions while normalizing
the future poll. Community idea acceptance does not schedule a Doji.

### Feed, social and media

- Feed identity is the authoritative daily-event ID, not the phone's calendar.
  Completing or paid late participation unlocks it.
- Locked text-only task/format previews use fixed decorative text lines, not a
  photo frame. Choose the shape from challenge metadata, never hidden answers or
  redacted media URLs; media-required tasks retain the media preview.
- Friends includes accepted friends and self; Everyone is independently cached.
  Poll/WYR has one shared post, global totals and friend-scoped social alerts.
  Adjacent feed metadata warms after the visible read, including photo feeds;
  confirmed own posts refresh a pre-submission tab without copying scoped totals.
- Bounded snapshots/keyset reads supply feed, comments, reactions, voters,
  friends, leaderboard, notifications and shop. Partial pages are not totals.
  Gateway recovery source keeps pending I/O request-owned and bounds the whole
  read, not only database fetch. See current state for deployment and rollback.
- Optimistic actor feedback rolls back only its own cache version and account.
  Committed reads reconcile in the background without covering usable content.
  Reaction reads started before/during the write retain newer local reaction fields
  through the existing bounded cache-settle interval; other fields still reconcile.
  Comment and poll-answer hearts use the same account/command ordering principle;
  their direct SQL reads need no artificial cache-settle delay. Rollback restores
  only the affected heart fields, not the entire thread or voter page.
- When scrolled, new head posts wait behind New posts; unauthorized rows disappear
  immediately. Only new realtime media uses the bounded readiness queue.
- Unobserved, idle social caches retain at most 80 queries / 120 pages, with no
  abandoned query over five pages. Eviction is whole-query and waits for pending
  mutations; mounted lists retain their exact pages/cursors and are not memory-capped.
  Reopening an evicted list starts from its initial authorized page, not a saved tail.
- Private media references may be cached; signed bearer URLs may not. Visible
  cards coalesce signing, use stable object/variant cache keys and retain a
  card-local skeleton until native display. Never re-encode a cached image into itself.
  The next two mounted cards may prepare images without social subscriptions.
  Scrolling away retains resolved images, not authorization; revocation clears them.
  Native video players remain visible-only.
- Camera/library proof is normalized once before approval; upload the approved
  bytes. Preserve the configured original/derivative contract and authorization.
  Native photo preparation has bounded concurrency/queueing and a local deadline;
  late results cannot start uploads or replace the preview after failure. This
  deadline does not cancel native work or change the approved image representation.
- A confirmed profile save owns its avatar; follow-up refresh failures must not
  delete that committed object as an orphan.
  An unconfirmed save is not proof of an orphan either: retain its uploaded avatar
  until authoritative state establishes non-use. Missing response rows are unknown,
  not successful signup. Confirmed username conflicts can discard their unused upload.
  Confirmed photo saves release UI feedback before optional preview/refresh/cleanup;
  failures in that follow-up work are reported separately, never relabeled as failed saves.
- Profile settings retain one immutable patch/command key per signed-in account
  lifetime after an unknown outcome. Navigation and token renewal preserve it;
  only an explicit retry replays it. New changes wait for confirmation or a definite
  SQL rejection. Logout/account changes discard the local intent and fence late results,
  including a switch back to the original account. This is in-memory recovery,
  not a persistent offline queue or proof of remote rollback.
- Thread replies are visually one level: root `parent_id`, exact
  `reply_to_comment_id`. Commands own mention/recipient resolution.
  Replies expand inline under their root in the same comments list; opening or
  composing a reply must not navigate to a separate thread page. Multiple threads
  can stay expanded. Newest root comments appear first by default, without a
  Show latest control. Performance changes must preserve this interaction.
  Root comments follow the descending server cursor so older pages extend below
  loaded roots; replies stay chronological. Visible threads prepare one cursor page
  ahead of the viewport, with a guarded edge fallback, and stop automatic reads on
  errors, closure or native read suspension. Variable-height text remains accessible.
  The prepared scalable read contract separates root and reply cursors and reconciles
  retained IDs without inserting new head rows into a scrolled viewport. Its client
  window model caps retained pages and refuses to evict visible rows. The staging
  adapter retains up to 60 roots and 30 replies per retained expanded root (1,860
  list records plus at most 60 authorization parent snapshots). Visible replies pin
  their root; closed/evicted threads discard cache, and offscreen threads pause reads.
  New root rows enter automatically only at the head, with a completion-time scroll
  fence; new reply tails append without replacing the inline thread. Native frame/
  anchor acceptance remains separate from model tests. Partial pages are never totals.
  Friend-request controls own pending/error state per row on both request surfaces;
  acknowledgement updates the matching record, never restores a whole-list snapshot.
- Accepted friendships are capped at 500 and outgoing requests at 100 in Postgres.
  Search matches username prefixes and public display-name words (first/last/full
  name), never private identity fields. Search history includes settled queries,
  not just opened profiles; it is device-local, account-scoped and bounded to ten.
  Profile navigation warms the authorized viewer-keyed read and its relationship
  dependencies, including when the profile itself is already cached. Unknown or
  stale-on-entry actions use a fixed-size loading control, never another member's
  action or a guessed Add/Accept. The overflow trigger retains its position while
  disabled. Once resolved, background read errors retain labels but disable commands
  and expose retry instead of replacing the action bar with placeholders.
- Blocking is a separate privacy action, not a report. It removes friendship and
  hides content. Global competition excludes banned accounts, not ordinary blocks.

### Notifications, diagnostics and recovery

The Activity Center is durable account history, not an OS-notification mirror.
Clear/dismiss state survives reinstall; pending friend requests remain actionable.
Phase timestamps distinguish pre-live from later live activity. Grouped items
reappear only for genuinely new activity. In-app preferences do not erase history.

OS pushes are allowlisted: Doji live, friend requests, direct mentions/replies and
review/account actions. Ambient social activity remains in-app. Foreground OS
banners are suppressed. Native APNs/FCM is primary; Expo is migration fallback.
Provider acceptance is not notification-display proof.

Push registration is foreground/account-bound, single-flight and serialized with
unregistration. Preserve bounded retries, token/release changes, six-hour receipt
reconciliation and v3/v2/v1 compatibility. Cancellation does not roll back a remote
write. Unconfirmed or interrupted permission setup is not successful registration.

Sentry uses allowlisted operational evidence and pseudonymous diagnostic
installation/session IDs, never names, credentials, raw bodies, full URLs or
arbitrary private messages. Preserve grouping and event budgets. Android native
hints/Test Lab markers are diagnostic, not identity or root-cause proof.
Mutation fallback reports use allowlisted action names, never full keys or inputs.
Next-build submission counters keep only a bounded, session-cleared 15-minute
in-memory window of device-reported phase attempts and fixed workflow reads. Query
retries produce one terminal read observation, fenced to the originating account.
Optional reporting is separately default-off in the binary, Edge and private SQL.
Foreground return can detach one batch per fifteen minutes; no handset polling,
durable queue or automatic retry is added. Verified member authentication gates
ingestion, but reported counts remain untrusted device evidence, not authoritative
answers, rewards, sign-in measurements or a success rate. Missing reports remain
unknown. Avatar upload acknowledgement does not mean profile save succeeded.
Typed comment validation retains a fixed rejection reason in the bounded timeline,
not an unexpected-error alert; unclassified errors must remain reportable.
Recovery logs require a new confirmed registration acknowledgement, correlate the
original event, expire with session/account/24 hours, and are capped at three per
rolling hour. Source-map Debug IDs must match exact release artifacts.

Next-build read lifecycle pauses native reads while backgrounded or explicitly
offline, with unknown connectivity permissive. Only the server-read allowlist is
cancelled; cached data remains. Available foreground return reconciles once.
Mutations retain immediate execution, not offline queueing. Announcement claims
and notification bootstrap remain outside read cancellation.

Native background return renews disconnected realtime authorization without
discarding subscriptions. Token reads and capability waits are bounded and late
authorization work is fenced across resets/accounts; no member writes are retried
by this recovery. These changes require a new mobile artifact, not a portal deploy.

Report a problem currently opens a user-controlled share/email draft containing
allowlisted diagnostic references. It is not a durable support-ticket system.
The future tracked-report requirement belongs in the product backlog.

### Economy and moderation

First to Doji uses a prospective canonical overall-winner ledger, not a viewer's
personalized feed winner. The first valid completion transaction to claim and
commit earns lifetime progress across photo, task, format, poll and WYR; thresholds
are Bronze 1, Silver 10, Gold 25 and Diamond 100, with existing tier Sparks once.
Blocks, friendships and content retention cannot transfer a recorded win. Account
deletion anonymizes the occurrence fence and removes the private count. Only
occurrences starting after enablement count; never backfill retained history.
An authorized first-responder read can use a visible audience fallback, but that
fallback grants no award. UI packaging and hosted enablement remain separate.

The separately gated [economy v2 candidate](docs/SPARKS_ECONOMY.md) unifies timed
completion awards, adds a small canonical first-place bonus, caps social earnings
per occurrence and increases prospective level rewards to 10× the newly reached
level. XP, deadlines, existing balances and shop prices are unchanged. Existing
reward rules remain authoritative until qualification and approved activation.

Sparks/XP/streaks/badges/shop ownership are server-owned. Purchases and rewards
use atomic ledger-backed commands and uniqueness. Equipping public cosmetics
invalidates every authorized avatar-bearing surface. Client celebrations award nothing.

Reports preserve exact target/category/reason and are allegations, not findings.
Only explicit report submission creates work; opening an overflow or blocking does
not. Restricted leaves require restricted permissions. Routine removal, quarantine
and account consequences are distinct, audited actions. Appeals restore through
atomic commands; preserve the explicit super-admin override audit where allowed.

Evidence, retention holds and historical actor attribution survive rollback and
account deletion. Private media archival/deletion/restoration uses exact identity,
revision and leases; origin deletion is not proof of global CDN revocation.
No cleanup may remove those fences or fabricate missing evidence.

## Portal experience and security

Admin uses full-page records, a greeting/next-Doji/attention home, personal My work,
and a Team directory with focused access editing. History is a status filter in
the same domain table. Use bounded MUI pagination and distinct empty/error/loading
states; unknown totals and missing monitoring never become zero or healthy.

Employee sessions use independent WorkOS password/authenticator proof and opaque
host cookies. Server permissions are rechecked on reads/commands. Lock, expiry,
logout and access loss clear protected caches, drafts and session-owned sockets.
An already-absent employee session can confirm sign-out; storage/revocation failures
must not be mislabeled as successful cleanup.

Local admin development has a distinct staging-only credential/persona path,
not an MFA bypass for hosted sessions. Active staging employee records retain real
database permissions, developer/persona audit attribution and revocation checks.
Switching clears session-owned data and fences old requests. Explicit developer
directory grants permit acting as those employees only inside staging; no WorkOS
session, production identity proof or member token is minted. Hosted staging and
production share employee credentials/MFA but require separate application audiences,
database access grants and sessions. Hosted access retains MFA.
Local media/realtime signing preserves the same resource permissions but uses only
staging storage and its isolated Ably app. Recheck developer/persona authorization
before releasing signed results; issued capabilities remain bounded by their TTL.
See current state for whether this separately gated development gateway is enabled.

Business has owned Doji account forms backed by an independent WorkOS realm.
Submission precedes staff approval; approved owners finish brand setup and
authenticator enrollment before workspace access. QR/manual fallback is ephemeral;
the factor label is Doji Business plus the authorized company name.
Reset/session fencing and uncertain email receipts must survive rollback.
Public admission, automated business email, business realtime, campaigns and
billing remain separately gated; consult current state before enabling anything.

Portals reuse existing atomic commands and immutable uncertain retry intents.
A confirmed write followed by failed refresh must not be sent again as a new write.
Realtime is identifier-only and memory caches are scoped to realm, identity and epoch.

## UI and engineering requirements

Mobile uses shared theme, avatar/frame, safe-area, keyboard-aware, dialog and sheet
primitives. Keep light/dark contrast, accessibility, Reduce Motion and minimum touch
targets. Do not rewrite native keyboard text or duplicate keyboard/inset ownership.
Native modal handoffs must finish dismissal before navigation or the next modal.
Use persistent contextual error feedback; success toasts are not error handling.

Web uses standard MUI behavior and centralized Doji orange/violet styling.
Desktop workspace width and compact account forms are different layout requirements.
Do not recreate controls per screen, custom six-box MFA, cramped record drawers
or routine policy-warning banners.

Read the nearest AGENTS file. Run the relevant strict compiler, lint, unit,
integration and artifact checks; preserve independent coverage budgets.
Offline fixtures are required test inputs, not production data or automatic deletion
candidates. Physical-device and authenticated hosted acceptance are separate evidence.
Update these contracts when behavior changes; put release status in the current-state
guide, not chronological appendices here.
