# Doji product backlog

Last updated: September 22, 2026

This is the persistent list of confirmed future product work and unresolved
regression checks. Add new user-reported behavior here before implementation and
move it to **Completed** only after the relevant release or server change has been
verified on a physical device.

## Queued

### FW-031 — Make native push-endpoint registration resilient to transient timeouts

Priority: P1 — before next shared iOS/Android build

Implementation staged September 22: endpoint mutations are serialized, concurrent
sync requests are single-flight, unchanged successful identities use a six-hour local
fingerprint receipt, transient command-gateway errors use bounded 1/3/10-second
jittered recovery, and superseded lifecycle runs stop before another attempt. Automated
policy, token-rotation, cache-reuse, and transient-classification coverage is included;
physical iPhone/Android failure injection and subsequent Doji-live delivery verification
remain before completion.

On September 22, Android 1.0.7 code 17 reported a handled HTTP 504 while
refreshing a native push endpoint on app foreground. The command gateway retried
once after 250 ms, then surfaced `endpoint-registration` to Sentry. The atomic
database command prevents partial endpoint state, and a later foreground retries
the sync, but a new or rotated device token can miss phone alerts until that retry
succeeds.

- Single-flight registration per installation so startup, foreground, settings,
  and permission flows cannot issue overlapping endpoint commands.
- Persist a non-sensitive fingerprint of the last successful user, native token,
  app release/build, notification-contract version, environment, and relevant
  preference state. Skip an unchanged foreground registration until a bounded
  reconciliation interval expires.
- Replace the single 250 ms retry for transient 408/425/429/5xx and transport
  failures with bounded exponential backoff and jitter. Cancel pending retries on
  sign-out, user change, notification disablement, ban, or app disposal.
- Preserve the existing active endpoint until a replacement registration commits;
  never clear a working endpoint because a refresh timed out.
- Keep app-start/foreground reconciliation and make eventual success observable.
  A timeout that later recovers should remain a breadcrumb; raise a Sentry issue
  only after the bounded retry sequence is exhausted.
- Record enough content-free command timing and outcome context to distinguish a
  Cloudflare edge timeout, the command worker's Supabase upstream timeout, database
  lock contention, and a handset transport failure.
- Add automated coverage for concurrent sync calls, unchanged-token suppression,
  token rotation, release upgrade, 504 recovery, retry cancellation, sign-out, and
  a previously active endpoint surviving a failed refresh.
- Verify on physical iPhone and Android devices that a forced transient failure
  self-recovers without reopening notification settings, duplicate endpoint rows,
  repeated Sentry incidents, or a missed subsequent Doji-live alert.

### FW-030 — Rebalance Sparks, progression, streaks, and repeatable shop value

Priority: Product exploration — back burner until the economy and progression design
is approved

Explore a cohesive participation economy that makes completing Dojis, maintaining a
streak, leveling up, and spending Sparks feel rewarding over time. Cosmetics are useful
one-time sinks, but the shop also needs ethical repeatable value that does not become
pay-to-win, punish ordinary missed days, or inflate the currency until rewards are
meaningless.

- Audit every current Sparks source and sink, including participation, streaks, badges,
  challenge suggestions, sponsored campaigns, buy-ins, shop purchases, administrative
  grants, and existing streak shields. Measure median balances, earning/spending rates,
  dormant balances, cohort retention, and projected inflation before changing values.
- Define the participation loop deliberately: what earns Sparks or XP, how consistency,
  challenge variety, constructive community activity, comeback behavior, and level
  milestones are rewarded, and which repeatable actions must be capped or excluded to
  prevent spam, collusion, duplicate-account farming, or reaction/comment grinding.
- Design a server-owned level reward track. Candidate rewards include bounded Sparks,
  titles, frames, avatar items, shop access, streak protection, and celebrations. Core
  participation, social visibility, and leaderboard fairness must never require a
  purchase or premium cosmetic.
- Explore repeatable shop sinks such as streak freezes/shields, limited-duration visual
  effects, event passes, rerolls or other non-competitive convenience, and rotating
  cosmetic collections. Define inventory caps, stacking, expiry, refund/error behavior,
  and transparent pricing; avoid loot boxes, gambling mechanics, manipulative scarcity,
  or purchases that manufacture engagement/rank.
- Reconcile any streak-freeze proposal with the existing authoritative streak-shield
  and missed/buy-in rules. Protection must be purchased, granted, held, and consumed
  through atomic idempotent server commands, with an understandable history and no
  handset-clock or push-delivery dependency.
- Explore a curated custom-avatar system with a base Doji character and combinable
  skins, colors, outfits, accessories, poses, or upgrades. Decide which pieces are
  earned, level-gated, purchased with Sparks, event-exclusive, or permanently owned;
  keep rendering accessible and performant across every avatar surface. User-uploaded
  avatar assets remain subject to the separate moderation requirements and are not
  silently introduced through this feature.
- Model whether and how streaks should influence weekly and all-time leaderboards.
  Compare a separate streak display, a capped streak bonus, and a transparent composite
  score. Do not use an unbounded multiplier that permanently locks out new or returning
  users, and do not let purchased protection directly buy leaderboard position.
- If streak contributes to rank, make the formula plain-language and server-owned,
  version it, define tie-breaking and season/reset behavior, and backtest it against new,
  long-term, highly social, and returning-user cohorts before changing production ranks.
- Show streak and next-level progress consistently on the appropriate profile,
  leaderboard, celebration, and shop surfaces without exposing private economy history.
  Realtime hints continue to invalidate authoritative bounded snapshots rather than
  carrying trusted balances or rank calculations.
- Keep every award, debit, inventory grant, equipment change, shield consumption, level
  reward, and correction atomic, idempotent, auditable, and server-authorized. The
  handset may animate an expected result but never mints Sparks, inventory, streaks,
  XP, or rank.
- Produce an economy model, proposed values, abuse analysis, UX flows, accessibility
  review, retention experiment, success/stop criteria, and migration plan for existing
  balances, levels, streaks, shields, and purchases before selecting an implementation
  build.

### FW-029 — Explore a private Favorites relationship and feed

Priority: Product exploration — approve the product contract before selecting an
implementation build

Let a user privately mark selected accepted friends as favorites and optionally view a
focused **Favorites** feed alongside **Everyone** and **Friends**. This is a feed filter
and relationship preference, not a new public status, follower model, or phone-alert
category.

Performance, privacy, and block correctness are release gates for this feature, not
follow-up optimization. Favorites must be an indexed, server-authorized audience with
its own bounded read/cache lifecycle; it must never be implemented by downloading the
Friends feed and filtering it on the handset.

- Explore an accessible star control on an accepted friend’s profile, with clear
  selected/unselected states and immediate optimistic feedback. Decide whether a
  secondary management surface is needed for reviewing all favorites at once.
- Keep favorites one-way and private to the selecting user. Do not notify the selected
  person, expose favorite membership on public profiles, or infer that the relationship
  is reciprocal.
- Permit favorites only within an accepted friendship. Removing the friendship or
  blocking either account must atomically remove or make the favorite preference
  inapplicable without exposing historical relationship data.
- If approved, extend the FW-019 feed dropdown to **Everyone**, **Friends**, and
  **Favorites**. Give Favorites its own query/cache identity so switching can reuse
  cached content immediately and reconcile in the background without a full-feed
  refetch or scroll jump.
- Define before implementation whether the viewer’s own post is always included, how
  shared poll/Would You Rather cards and their social details behave, whether the feed
  is chronological or lightly prioritized, and what happens when a favorite has not
  participated in the current Doji.
- Provide a useful empty state that explains how to favorite a friend and links to the
  appropriate friend-discovery or friend-management surface. Never silently substitute
  the Friends or Everyone feed.
- Keep the server authoritative with a private, idempotent, viewer-owned preference.
  The atomic set/unset command verifies an accepted friendship and the current block
  relationship, and its unique viewer/target key makes retries safe. Only the viewer
  may read or mutate the preference.
- Add an indexed, bounded, keyset-paged Favorites branch to the authoritative feed
  snapshot instead of filtering Friends rows in JavaScript. It must return the same
  safe profile fields, audience-correct engagement counts, visibility checks, and
  stable media references as the existing feed contract without N+1 profile, block,
  friendship, reaction, comment, or signing requests.
- Give Favorites its own account/event/audience TanStack Query key and persisted first
  page. Restore authorized cached content immediately, reconcile stale-while-revalidate,
  keep it mounted during background refresh, and bound persisted pages and media
  warming exactly like the other feeds.
- Reuse the existing identifier-only friend/post event path wherever possible.
  Favorite changes invalidate only that viewer’s profile control, favorite management
  data, and Favorites feed; post/engagement changes reconcile the exact mounted
  Favorites cards. Do not create a second global channel, duplicate per-friend fanout,
  feed-wide refresh, or one request/render per interaction.
- Friendship removal and blocking must update the friendship/block/favorite state in
  the same authoritative command or make the favorite edge immediately ineligible.
  The affected person and content disappear optimistically and then reconcile across
  every Friends/Favorites cache and open profile. Unblocking must not silently restore
  a friendship or favorite that no longer exists.
- Prove the database plan remains indexed and bounded at the 500-friend product cap,
  and include Favorites in reconnect/foreground repair, query invalidation tests,
  burst modeling, release-device cache/cold-start checks, and two-account
  friend/unfriend/block/unblock verification.
- Favorites must not expand the phone-push allowlist, reveal private activity, alter
  leaderboard scoring, award engagement for repeatedly toggling status, or bypass the
  existing block and feed-visibility rules.
- Validate the concept, naming, star interaction, poll semantics, ordering, maximum or
  unlimited-within-friend-cap behavior, and expected use with users before promoting
  this item into a must-ship build.

### FW-028 — Make comments and engagement-detail surfaces feel immediate

Priority: P1 — must complete before the next shared iOS/Android build

Opening comments, reaction voters, comment-like voters, poll voters, or another
engagement detail currently has a noticeable wait even when the parent post and its
counts are already visible. FW-017 owns realtime feed presentation, but it does not by
itself guarantee fast first content for these secondary surfaces.

- Mount the requested sheet or detail route immediately on tap. Reuse an authorized
  cached first page synchronously and reconcile it in the background; never delay the
  presentation while a network request, channel attachment, or unrelated feed refresh
  finishes.
- Keep comments, reaction voters, comment-like voters, and poll voters on stable
  post/audience query keys with bounded first-page snapshots and keyset pagination.
  Do not restore client waterfalls for ids, profiles, viewer state, counts, or the
  friend graph, and never download an unbounded participant collection.
- When no cached page exists, show the correct content-shaped skeleton inside the
  already-open surface. Preserve cached rows during refresh and distinguish empty,
  retryable-error, no-longer-authorized, and populated states without flashing or
  closing the surface.
- Permit only bounded, high-intent prefetch for a visible post after interaction work
  is idle. Do not preload every post, hidden feed audience, or full voter/comment list.
  Concurrent opens, rerenders, and realtime hints share one in-flight read with at
  most one trailing reconciliation.
- Realtime invalidation targets only the open post/thread/list and does not refetch the
  feed or unrelated engagement surfaces. An optimistic actor update remains visible
  while the authoritative page reconciles.
- Instrument tap-to-surface, cache-hit source, request, database, gateway, and
  first-content timing without recording comment text or identities in performance
  telemetry. Acceptance requires the surface shell to appear in the same interaction
  frame, cached first content to appear without a loader, and cold authoritative first
  content to remain below a one-second p95 on the representative release-device and
  Wi-Fi/LTE test matrix.
- Verify long threads and voter lists, Friends and Everyone audiences, cold and warm
  cache, slow/offline recovery, rapid open/close/reopen, blocked or deleted content,
  and realtime changes while the surface is open on physical iPhone and Galaxy devices.

### FW-027 — Eliminate startup session-restoration lockouts

Priority: P0 — must complete before the next shared iOS/Android build

Production 1.0.5 telemetry still contains startup session-restore timeouts affecting
more than one account, with a concentration on a Samsung Android model. This is an
authentication/bootstrap regression, not a feed-loading problem.

- Preserve one observed persisted-session restoration request. A timeout may reveal
  the existing retry surface, but the original request must remain observed and recover
  automatically; a retry must never queue behind or multiply the same auth-storage lock.
- Once an account and owner profile have been verified for the current session, a
  transient refresh, provider, or network failure keeps the protected app mounted and
  reconciles later instead of returning to **Couldn’t load your account**.
- Record content-free stage timing for secure-storage restoration, Supabase session
  validation, owner-profile authorization, query-cache hydration, and route handoff so
  a storage lock can be distinguished from a slow network or profile read.
- Verify clean install, app upgrade, warm and killed launch, delayed secure storage,
  expired-token refresh, weak/offline network followed by recovery, manual retry, and
  rapid background/foreground on the affected Samsung class plus current iPhone.

### FW-026 — Deduplicate recoverable network and realtime telemetry

Priority: P1 — must complete before the next shared iOS/Android build

Expected handset network transitions are currently capable of producing both a raw
transport issue and a second `reportOperationalFailure` issue for the same incident.
This obscures real regressions and inflates Sentry volume even when reconciliation
successfully repairs application state.

- Normalize network loss, request cancellation during lifecycle changes, intentional
  connection closure, and recoverable channel-attach timeout into one shared
  classification path. Keep them as bounded breadcrumbs when retry/reconciliation is
  functioning instead of opening duplicate error groups.
- Deduplicate by safe incident/trace identity across the raw client, auth/token,
  subscription, and operational wrapper paths. One underlying failure must not produce
  multiple administrator alerts or Sentry issues.
- Continue reporting unexpected provider, authentication, capability, protocol,
  authorization, exhausted-retry, and reconciliation failures. Telemetry cleanup must
  never suppress a genuine inability to recover or access authoritative state.
- Add lifecycle/network-transition tests and verify Sentry issue volume and recovery
  on physical devices while toggling Wi-Fi/cellular, backgrounding during a request,
  and restoring connectivity.

### FW-025 — Close native crash and memory stability regressions

Priority: P0 verification gate — must complete before the next shared iOS/Android build

The Android Fabric `addViewAt` crash has not reappeared in observed 1.0.5 events, but
the fix still needs a release-device soak. A separate iOS watchdog termination requires
memory profiling; feed/cache improvements may reduce its likelihood but are not proof
that it is resolved.

- Run Android rapid-scroll, realtime-update, navigation, sheet, and background/return
  stress with bounded list windowing and clipped-subview removal disabled. Confirm no
  Fabric child detach/reinsert crash and no duplicate/missing rows.
- Profile iOS resident memory, decoded-image memory, persisted-query hydration, mounted
  post subscriptions, sheets/routes, and background/foreground cycles on a photo-heavy
  feed. Bound or release resources rather than relying on an operating-system kill.
- Exercise repeated comment/reaction detail opens, feed audience switching, deep links,
  camera/library return, and long scrolling on both platforms while realtime activity
  continues.
- Treat the release gate as satisfied only after a sustained physical iPhone/Galaxy
  soak has no native crash/watchdog event, resource use reaches a bounded steady state,
  and current Sentry release/build tags prove the tested binary.

### FW-024 — Profile-photo moderation and trust/safety legal alignment

Priority: P0 — policy, operations, and implementation required before claiming the
profile-photo safety system is complete

The approved requirements and rollout checklist live in
[`docs/TRUST_SAFETY_AND_LEGAL_REQUIREMENTS.md`](TRUST_SAFETY_AND_LEGAL_REQUIREMENTS.md).

Implemented foundation (2026-09-24): reversible moderation state for posts, comments,
poll responses, and profile-photo decisions; policy/severity classification; routine
warning and member notice; Account Status and in-app appeal submission; an independent
operator appeal queue with atomic restoration; restricted-safety quarantine routing;
bounded identifier-only realtime invalidation; and fail-closed retirement of the old
hard-delete/mobile-admin commands. This does not complete FW-024: staged avatar
screening, automated trusted-signal quarantine, temporary/permanent account-action
criteria, public removal intake/status, evidence vault/legal holds, retention jobs,
restricted playbooks, counsel approval, and full physical-device scenarios remain.

- Stage candidate profile photos privately, screen them before publication, and send
  uncertain results to the restricted moderation queue. The server owns publication,
  strike, restriction, suspension, and ban state.
- A routine first violation removes the image, restores the default avatar, warns the
  user, and allows an appeal. Serious, malicious, repeated, or apparently illegal
  conduct escalates to suspension, permanent removal, and the required safety/legal
  workflow instead of using one blanket punishment.
- Add explicit in-app actions to report the profile photo or account and preserve
  Block as the separate immediate-distance control.
- Add an unauthenticated public Safety and Removal Center, a valid TAKE IT DOWN
  intake/status process, appeals, and a counsel-approved copyright/DMCA route. The
  hosted website is the public intake and authenticated operator hub; email alerts the
  designated operator to a server-owned case but never becomes the sole case record or
  carries sensitive evidence as an attachment.
- Hide every reported item from its reporter immediately. Quarantine high-severity
  content and image-safety reports against profile photos for everyone pending review;
  lower-severity reports require a trusted signal or abuse-resistant independent-report
  threshold so one malicious report cannot censor another user's ordinary content.
- Version and align the website and in-app Terms and Privacy Policy only after the
  described screening, reporting, retention, evidence, and operator workflows exist.
- Define and enforce separate retention for active/replaced avatars, rejected uploads,
  ordinary moderation evidence, anti-abuse hashes, appeals, backups, and legal/safety
  holds. The daily feed reset is not evidence that stored media was deleted.
- Obtain counsel review of the operating entity, reporting/preservation duties,
  TAKE IT DOWN, DMCA, launch jurisdictions, policy wording, and renewed-consent plan.
- Verify ordinary removal, serious/repeat escalation, appeal/restoration, unauthenticated
  removal requests, identical-copy handling, and restricted child-safety escalation
  end to end before moving this item to Completed.

### FW-023 — Sustainable monetization without degrading the Doji experience

Priority: Product exploration — no implementation until the strategy is approved

Doji needs a deliberate revenue model, but monetization must not compromise the shared
daily ritual, user trust, privacy, challenge quality, or participation economy. A paid
branded Doji is legally and perceptually native advertising even when it avoids banner
and interstitial ad formats; it must be evaluated honestly alongside non-ad options.

- Compare sponsored Dojis/business accounts with genuinely non-ad models such as
  optional premium cosmetics or membership, paid private communities/teams, business
  challenge programs, and other benefits that do not make the free core experience
  artificially worse.
- Model revenue, operating cost, conversion assumptions, store fees, moderation and
  support burden, Sparks inflation, and likely user-retention impact before selecting a
  model.
- Define non-negotiable product principles: the free daily Doji remains complete and
  enjoyable; payment does not buy social rank or outcomes; user content and individual
  behavior are not sold; and monetization never weakens safety or privacy controls.
- Validate concepts with small reversible experiments and explicit success/stop
  criteria before building a large self-service system.
- Produce an approved product, policy, legal, economy, analytics, and technical design
  before any monetization feature enters an application build.

### FW-022 — Verified business accounts and clearly sponsored Dojis

Priority: Product exploration — design and policy approval before implementation

The recommended product boundary, workflow, authorization model, reporting limits,
commercial requirements, and phased pilot are documented in
[`docs/SPONSORED_DOJI_BUSINESS_PLATFORM.md`](SPONSORED_DOJI_BUSINESS_PLATFORM.md).

The business and Doji-operator tools belong in separate authenticated web roles on
the hosted business platform. The consumer app only renders approved, scheduled, and
clearly disclosed sponsored Dojis; it never exposes campaign creation, purchasing,
billing, organization administration, or raw sponsor analytics.

- Use the existing `dojipro.com` domain as the trusted front door: add a public,
  indexable Business marketing page with **Apply for a business account** and
  **Business sign in** actions; host the authenticated business and private admin
  workspaces behind isolated routes or subdomains with separate role enforcement.
- Business signup is an approval-gated application, not instant advertiser access.
  The public page explains sponsored Dojis, review/disclosure standards, privacy-safe
  aggregate reporting, acceptable formats, prohibited categories, and the pilot flow
  without promising unverified audience, targeting, participation, or conversion.
- Move challenge-suggestion and report review from the mobile Admin section only after
  the Admin Portal equivalents—including safety cases, appeals, campaign review,
  scheduling, and audit history—are deployed and verified. The admin route is never
  advertised or linked from public navigation.

Sponsored Dojis may become a native revenue model without introducing conventional
banner or interstitial advertising, but a business must never be able to buy an
unlabeled placement or publish directly to the global audience without Doji review.

- Define a verified business-account role, brand identity, authorized operators,
  approval state, and audit trail without widening public-profile safe fields or app
  client privileges.
- Start with manually sold and reviewed campaigns. A business proposes a structured
  Doji, schedule, audience, disclosure, and optional reward; an authorized Doji
  operator approves and schedules the immutable campaign version.
- Label the challenge clearly as **Sponsored** and **Brought to you by {brand}** on
  preview, participation, results, feed, and notification surfaces. Sponsorship must
  remain unmistakable even when the card is shared or revisited later.
- Preserve product trust by capping sponsored frequency and defining whether a
  sponsored challenge may occupy the daily slot or should be an optional bonus Doji.
  The initial recommendation is a capped sponsored daily slot with an explicit
  feedback/hide control, not an auction that silently replaces every organic Doji.
- Use contextual eligibility first. Do not sell individual identities, votes,
  comments, photos, friend graphs, or raw participant data to brands. Brand reporting
  begins with privacy-protective aggregate impressions, starts, completions, and poll
  totals subject to minimum cohort sizes.
- Exclude sensitive targeting and restricted categories, protect minors, and run the
  existing moderation/report/block protections on all brand-created content.
- Sponsor-funded Sparks use the existing server-owned, idempotent award ledger with a
  campaign cap and stable reference. A client display can never mint rewards, and a
  campaign must not inflate the economy or create pay-to-win progression.
- Resolve contracting, billing, tax, store-payment, disclosure, privacy, and content
  policies before building a self-service business portal. Consumer clients display
  only approved campaign content; they do not sell campaign inventory in-app in the
  first version.

### FW-021 — Expand badges around meaningful participation, not spam

Priority: P2 — product design before the implementation build is selected

- Audit the current canonical badge metrics and choose a small first expansion with
  understandable progress: consistency/comeback, completion milestones, challenge
  variety, constructive community participation, and submitted/selected Doji ideas.
- Every new badge family has three to five progressively harder tiers. All tiers use
  the same canonical requirement/metric with increasing thresholds—the badge does not
  change meaning between levels—and progress toward the next tier is visible.
- Prefer tiered accomplishments and unique-day or unique-person qualification over
  raw repeatable taps. Reactions, comments, mentions, and friend actions must not
  reward spam, engagement farming, duplicate accounts, or harassment.
- Candidate achievements include tiered consistency, comeback, challenge-type and
  weekly-variety totals, constructive conversation milestones, and community Dojis
  submitted and selected. Final thresholds must form a meaningful three-to-five-tier
  progression rather than several unrelated one-off badges.
- Keep all qualification, tiers, Sparks, XP, and unlock persistence server-owned and
  idempotent. The handset observes and celebrates authoritative unlocks only.
- Every badge needs a plain-language progress description, accessible celebration,
  bounded reward, and a clear rule for deleted/moderated content before shipping.

### FW-020 — Server-controlled announcements and participation campaigns

Priority: P1 — reusable capability before the next shared iOS/Android build

Create a separate announcement system rather than overloading the forced-update
policy. Forced updates remain release gates; announcements are remotely scheduled,
audience-aware product messages that normally remain dismissible.

- Store an immutable announcement/campaign id, title, body, optional approved media,
  call-to-action label and canonical deep-link destination, audience/cohort, start and
  end timestamps, priority, localization, dismissibility, and impression cap.
- Fetch a bounded eligible announcement only after the authenticated app is usable.
  Never cover an active participation flow, camera, upload, or destructive dialog.
- Record server-owned shown, dismissed, opened, completed, and expiration state so a
  user does not see the same campaign on every launch or on every device.
- Support once-per-user, once-per-release, and explicitly repeatable campaigns with a
  conservative global frequency cap. Queue rather than stack multiple dialogs.
- A reward campaign such as “Submit a Doji and earn 1,000 Sparks” must award through
  a qualifying server action and an atomic idempotent ledger reference; viewing or
  tapping the announcement never grants the reward by itself.
- Keep product announcements, service notices, and sponsored campaigns visibly
  distinct. Sponsored announcements carry the same disclosure and targeting rules as
  sponsored Dojis.
- Add analytics for eligibility, impressions, dismissals, CTA opens, successful
  qualification, and frequency-cap suppression without collecting message content or
  exposing private profile data.

### FW-019 — Make the active Friends/Everyone feed unmistakable

Priority: P1 — must complete before the next shared iOS/Android build

- Replace the visually ambiguous always-visible toggle with a compact sticky feed
  title and dropdown. The label itself says **Everyone** or **Friends**, uses the
  accent treatment for the active audience, and exposes both choices accessibly.
- Default a new account to Everyone so discovery works before the user has a friend
  graph, then persist the user's most recent explicit choice. Do not reset an
  established user to Everyone on every launch.
- Maintain separate Friends and Everyone query/cache state. Switching uses cached
  content immediately and reconciles in the background without a blocking loader,
  scroll jump, mixed-audience rows, or a full-feed refetch.
- If the Friends feed is empty, explain why and offer a direct friend-discovery action;
  do not silently switch audiences because that makes privacy and context unclear.
- Preserve the selected audience across post detail, notification deep links,
  background/foreground, and process restart unless a destination explicitly requires
  a different authorized post context.
- Verify fast repeated switching, cold start, empty Friends, offline cached state, and
  posts whose visibility changes after friendship/block updates.

### FW-018 — Every alert opens its exact actionable destination

Priority: P1 — must complete before the next shared iOS/Android build

The canonical routing helpers already exist, but every Activity Center card, native
push payload, cold-start path, and foreground path must use the same typed destination
contract instead of falling back to the home feed.

- A live-Doji alert resolves the authoritative current occurrence and opens the exact
  poll/task/format/camera participation screen while entry is available. If already
  completed or closed, it opens the correct completed, results, missed, or buy-in state
  rather than an invalid participation screen.
- Comment, reply, mention, and comment-like alerts open the authorized post detail,
  expand the conversation, and scroll to the exact comment when it still exists. No
  special comment highlight is required. A reaction alert opens its post; a friend
  request opens requests; suggestion/review/account actions open their exact status
  surface.
- Give every destination stable typed identifiers (`post_id`, `comment_id`,
  `daily_event_id`, `friendship_id`, or suggestion/review id). Do not trust arbitrary
  client-supplied route strings or embed private content in push payloads.
- Preserve a pending destination across killed-app launch, authentication/session
  restoration, forced-update completion, and router mounting. Navigate only after the
  account is authorized and the destination can be resolved, and consume it once.
- Mark matching attention state seen only after the destination is actually visible;
  tapping a push that fails to resolve must not hide unread activity.
- If content was deleted, moderated, blocked, expired, or is no longer authorized,
  show a contextual “no longer available” state with a safe fallback instead of
  silently landing on Home.
- Add open-to-visible latency and resolved/unavailable/fallback telemetry without
  recording comment text, post media, or other content.
- Cover in-app taps and native pushes from foreground, background, and killed states on
  physical iPhone and Android devices, including duplicate taps and two notifications
  opened in quick succession.

### FW-017 — Instagram-style realtime feed and engagement presentation

Priority: P1 — must complete before the next shared iOS/Android build

The scalable foundation already exists: optimistic atomic writes, post-scoped Ably
channels, one-second coalesced engagement hints, targeted TanStack Query invalidation,
fixed counter shards, bounded snapshots/keyset pagination, native caching, and
foreground/reconnect reconciliation. This item owns the remaining user-facing behavior
and physical verification; it must not replace those contracts with raw event payloads,
feed-wide refreshes, unbounded lists, or one handset update per interaction.

- A newly submitted post appears immediately for its author through optimistic/local
  state while the authoritative idempotent command commits and reconciles.
- Eligible viewers receive new post membership without manually refreshing. When the
  viewer is at the top of the focused feed, insert the reconciled post automatically.
  When the viewer has scrolled, preserve their exact position and show a subtle
  **New posts** control; never jump or reorder content underneath them.
- Comments, replies, comment likes, reactions, poll votes, and vote likes update
  immediately for the actor, roll back with contextual feedback on rejection, and
  reconcile other viewers through the exact mounted post/thread snapshot.
- A burst on one post must produce bounded coalesced invalidation, not one render,
  network request, or full-feed refresh per action. Concurrent reads for the same
  post/audience remain single-flight and receive at most one trailing catch-up.
- Engagement changes never invalidate unrelated feed pages. Only visible/mounted post
  channels remain attached, and virtualization must release subscriptions when their
  final consumer unmounts.
- Cached posts, media, comments, and counters remain visible and interactive during
  background refresh. Skeletons are cold-load only; reconciliation must not flash,
  blank, reset scroll position, or replace content with a blocking loader.
- Backgrounded, disconnected, and newly foregrounded clients catch up through the
  existing authoritative reconciliation path without depending on push delivery.
- Leaderboard and other aggregate-only surfaces keep their larger coalescing windows;
  sub-second updates are reserved for visible conversations and direct user actions.
- If a server-owned share action/count is introduced later, it must use this same
  optimistic, idempotent, targeted, and coalesced contract rather than creating a
  feed-wide refresh or per-recipient synchronous write path.
- Add regression coverage for top-of-feed insertion, scrolled **New posts** behavior,
  scroll-anchor preservation, rapid reaction switching, concurrent comments/replies,
  duplicate socket hints, offline/reconnect catch-up, and alternate Friends/Everyone
  audience caches.
- Verify on physical iPhone and Galaxy devices with two active accounts, then run the
  checked-in burst model. Acceptance requires no duplicate rows/counts, no lost
  interaction, no manual refresh for correctness, no visible feed jump, and bounded
  request/invalidation counts during a sustained engagement burst.

### FW-016 — Preserve photo quality and fill the feed without cropping

Priority: P1 — before next shared iOS/Android build

Implementation is staged with a single-encode 1536x2048 approval/upload master,
matching full-width 3:4 feed frame, 1440x1920 CDN derivative, and versioned native
cache identity. Physical iPhone/Galaxy verification remains.

- Do not solve feed letterboxing by changing only the final renderer; that would
  silently crop a different frame from the one the user approved and regress FW-010.
- Normalize new main/front photos once to a consistent 3:4 frame before approval,
  upload that exact approved JPEG, and render the feed in the same full-width 3:4 frame.
- Backward-compatible clients and older posts retain a safe center-cropped 3:4 fallback;
  loading an older post must not fail or cause a layout jump.
- Keep a high-quality immutable upload master and avoid unnecessary JPEG re-encoding.
  Feed and thumbnail derivatives must be generated from that master at a size and
  quality appropriate for high-density iPhone and Android screens.
- The full post image must not display black side/top bars, stretch, rotate, mirror,
  or crop differently from the approval preview. Intentional square cropping remains
  limited to thumbnails and avatar-style surfaces.
- Add automated coverage for portrait, landscape, square, front-camera, library,
  older dimensionless posts, and transformed-CDN fallback behavior.
- Verify on physical iPhone and Galaxy devices using fine-detail, low-light, and flat
  gradient photos; compare the approved preview, stored master, and feed rendering at
  normal and slow network speeds before releasing.

### FW-015 — Record the installed release with production observations

Priority: P1 — before next shared iOS/Android build

Implementation status (September 17): endpoint schema, backward-compatible v3
registration, service-role aggregate reporting, command timing, native v3 registration,
explicit Sentry release/build identity, and content-free command release headers are
staged. Physical rollout verification remains.

- Record the app version, iOS build number or Android version code, platform, and
  notification-contract version when an authenticated device registers or refreshes
  its endpoint; do not rely on Sentry errors as the only source of release metadata.
- Attach the same release identity to command/realtime performance observations so a
  mixed rollout can be compared by build without collecting message content or other
  unnecessary personal data.
- Keep the most recent observation per user/device and define a bounded retention
  policy for historical rollout telemetry.
- Add an aggregate operational query/dashboard that compares participation,
  command latency, realtime delivery, push handoff, and failures by release cohort.
- Verify that old clients remain compatible and that the added telemetry cannot
  block sign-in, endpoint registration, challenge participation, or notification
  delivery when observation reporting fails.

### FW-014 — Bring realtime tail latency inside the production SLO

Priority: P1 — before next shared iOS/Android build

Backend status (September 17): relay channel concurrency is bounded at 16 and command
and relay timing is structured. The paid staging project and its credentials were
removed at the owner's request; the checked-in deterministic burst models remain, but
representative isolated concurrent evidence against the SLO is still a launch gate and
must not be inferred from unit tests.

- Preserve the durable Postgres outbox and identifier-only realtime invalidation
  contract while removing the remaining long-tail delivery delay under a live Doji.
- Profile and optimize the slow paths observed on September 16: post insertion,
  reaction insertion, comment-like insertion, reaction notifications, and
  `user_event` updates.
- Meet the documented production target during a representative concurrent event:
  realtime p95 below 1 second and p99 below 2 seconds, with no overdue or exhausted
  outbox rows and no loss or duplication of commands.
- Keep push delivery independent from correctness and confirm reconnect/foreground
  reconciliation repairs any missed realtime invalidation.
- Add a repeatable load/regression check and retain per-event p50/p95/p99/max metrics
  so a faster median cannot hide a degraded tail.

### FW-013 — Prevent post-close lazy occurrences from becoming ghost pending users

Priority: P1 — before next shared iOS/Android build

Backend status (September 17): deployed and production-verified. The repair reduced
expired pending rows from 29 to zero, the outbox drained with no overdue work, and later
current-state reads persist an expired occurrence as `missed`.

- When a user first opens or refreshes an already-closed Doji, never create a
  `pending` occurrence whose expiry is already in the past; return the authoritative
  missed/closed state immediately.
- Fix the server-owned lazy occurrence/current-state path atomically rather than
  patching the client or depending on a later close alarm.
- Preserve the 10-minute participation window, signup-day grace, paid buy-in, late
  completion, and idempotent retry behavior.
- Reconcile existing invalid post-close `pending` rows with an auditable, narrowly
  scoped migration or repair command; do not alter legitimate active occurrences.
- Add regression coverage for first open before activation, during the window, just
  after close, and long after close on both current and older compatible clients.
- Verify event reporting counts only genuine pending participants and does not label
  a user who discovered an expired event after close as still pending.

### FW-012 — Eliminate cached-feed photo flashes after a cold restart

Priority: P1 — before next shared iOS/Android build

Implementation is staged: every bounded loaded feed page is authorized in a coalesced
pass, the first five media cards are decoded into the stable native cache, authorized
cards reuse stable disk bytes before short-lived signed URL refresh completes, private
object references are never rendered directly, and a shared skeleton covers genuine
cache misses. Physical Galaxy/iPhone cold-restart verification remains.

- Preserve the existing stable `expo-image` disk-cache key so rotating private-media
  signed URLs do not cause the photo bytes to be downloaded again.
- Batch-authorize every private photo in the currently loaded feed page after feed
  hydration, rather than pre-warming only the first five posts, and authorize the
  next bounded page before the user scrolls into it.
- Keep private-media access checks authoritative: do not reveal an old disk-cached
  photo before the current account is confirmed to still have access, and do not
  persist bearer signed URLs in unprotected storage.
- Replace the raw black media surface shown while authorization or native image
  rebinding completes with the shared challenge-aware placeholder treatment; avoid a
  transition that makes a disk-cache hit visibly flash.
- Instrument authorization latency and native cache source so regressions can be
  distinguished from a real image download or decode failure.
- Preserve the displayed cached frame when its background signed URL refresh finishes;
  changing from a local cache URI to a network URI must not reset the ready state or
  flash a placeholder.
- Verify on physical Galaxy and iPhone devices by loading a photo-heavy feed, fully
  terminating and reopening the app, then scrolling beyond the first five posts:
  authorized cached photos appear without a black frame, wrong/stale photos never
  appear, and revoked/block-changed media remains inaccessible.

### FW-011 — Restore per-notification swipe dismissal on Android

Priority: P1 — before next Android build

Implementation is staged with a full-screen forced-active gesture root inside the
native notification modal. Physical Galaxy verification remains.

- `NotificationSheet` renders its `Swipeable` rows inside a native `Modal`, whose
  Android content is outside the app-level `GestureHandlerRootView`.
- Wrap the modal content in a full-screen `GestureHandlerRootView` and use
  `unstable_forceActive` if needed to prevent Samsung/Android native views from
  cancelling the horizontal gesture.
- Preserve the existing optimistic dismissal and atomic `dismiss_notification`
  command so a dismissed item stays hidden after refresh, reconnect, or sign-in on
  another device.
- Verify on a physical Galaxy that swiping one row left reveals **Dismiss**, tapping
  it removes only that item, vertical list scrolling remains smooth, and tapping a
  notification still opens its destination.
- Confirm iPhone swipe dismissal, **Clear notifications**, realtime dismissal sync,
  and notification error recovery remain unchanged.

### FW-010 — Preserve the approved camera frame and orientation

Priority: P1 — next shared iOS/Android build

Implementation is staged; physical iPhone/Galaxy verification remains.

- The system camera/library result is decoded and normalized once before the Doji
  preview, with only the longest edge bounded to 2048 pixels.
- The exact normalized JPEG shown in the approval preview is uploaded without a
  second image transformation that could rotate or mirror it afterward.
- Main previews, feed cards, and moderation evidence use full-frame containment;
  intentional square cropping remains limited to small thumbnails and avatar-style
  surfaces.
- Verify back/front cameras and library selection in portrait and landscape on recent
  iPhone and Galaxy devices, including mirrored-selfie settings and upload retry.

### FW-009 — Treat intentional realtime connection closure as lifecycle cleanup

Priority: P1 — next shared iOS/Android build

Implementation is staged: client generations invalidate in-flight work, superseded
subscriptions end without retrying, wrapped connection-closure errors are recoverable,
and Sentry receives explicit release/build identity. Physical iOS/Android soak
verification remains.

- Do not report an intentionally closed or superseded Ably client as
  `channel_subscribe_exhausted` when authentication applies, changes, or clears a
  session.
- Identify stale subscription attempts by client instance/generation rather than
  relying only on the provider's error-message text; also recognize wrapped
  transport-level `Connection closed` errors as recoverable.
- Keep the expected closure as a diagnostic breadcrumb while continuing to report
  genuine authorization, capability, and unexpected provider failures to Sentry.
- Classify provider channel-attach timeouts as recoverable mobile transport state;
  resilient retry and foreground reconciliation continue while Sentry retains only a
  breadcrumb instead of raising `channel_subscribe_exhausted`.
- Confirm the resilient subscription attaches to the replacement client promptly
  and that reconnect/foreground reconciliation still catches any event missed during
  the transition.
- Add regression coverage for closing a client while channel subscription is in
  flight: no Sentry incident, no permanent retry loop, and successful attachment to
  the replacement client.
- Add explicit Sentry release/build metadata so future events can be attributed to
  the exact iOS build or Android version code.
- Verify on physical iOS and Android devices and keep this item queued until no new
  false `Connection closed` incident appears during normal auth/bootstrap flows.

### FW-001 — Friendship actions acknowledge immediately

Priority: P1

Implementation staged for version 1.0.1 build 73; physical two-account verification remains.

- Tapping **Add friend** changes the control to **Requested** immediately.
- Accepting a request changes both accounts to the authoritative **Friends** state
  immediately without a refresh, route change, or app restart.
- Optimistic state rolls back with contextual feedback if the atomic friendship
  command fails.
- Realtime and foreground reconciliation repair either account after a missed event.

### FW-002 — New friendships do not backfill old notifications

Priority: P1

Server migration and regression contract deployed to production on September 10, 2026;
physical two-account verification remains.

- Accepting a friendship must not make the new friend's historical posts,
  completions, reactions, or comments appear as new Activity Center items.
- Notification visibility is based on the relationship/event state at event time,
  not merely whether the accounts are friends when the bell is opened.
- Existing durable notifications for the recipient remain intact.
- Add a regression test covering activity before and after `accepted_at`.

### FW-003 — Challenge-aware feed skeletons

Priority: P2

Implementation and automated shape coverage staged for version 1.0.1 build 73; device verification remains.

- The loading skeleton matches the active challenge's final card shape and content
  type rather than using one generic card.
- Poll and Would You Rather challenges show the single shared-community card shape.
- Photo, task, question/free-text, and other per-user-post challenges render five
  skeleton posts of the correct type so the cold feed can scroll while loading.
- Skeleton dimensions match the final cards closely enough that hydration does not
  shift the feed.
- Cached content remains visible during background refresh; skeletons are cold-load
  placeholders only.

### FW-004 — Verify the focused phone-alert policy and seen suppression

Priority: P2

- Phone alerts are limited to Doji live, friend requests, explicit mentions/direct
  replies, and challenge-review/account actions; all other activity stays realtime in
  the Activity Center only.
- Persist a bounded, server-owned per-user **has-seen** marker scoped to the subject
  of an eligible alert: daily event, friendship, comment, or suggestion.
- Record the marker only after the relevant feed card or conversation is actually
  visible; merely foregrounding the app or opening an unrelated screen is not enough.
- At delivery time, the relay checks that durable marker before claiming any device
  endpoint. A matching marker suppresses only the redundant OS alert, never the
  authoritative Activity Center entry.
- The live bell remains authoritative and foreground OS banners remain suppressed.
- Delivery-time suppression must use durable server state and must not depend on a
  handset timer.
- Verify the reported flow: view and react to friends' posts, remain in the app,
  and ensure no completion/reaction/comment-like phone alert is sent at all.
- Verify on physical iOS and Android devices that each of the four allowed categories
  arrives promptly in the background, stays silent in the foreground, and disappears
  from the OS tray after its matching content is opened.
- The server migration, `relay-domain-events` v37, and `fanout-doji-push` v17 were
  deployed to production on September 10, 2026. Keep this item queued until both
  store builds and the physical-device flows are verified.

### FW-005 — Native-quality camera capture and controls

Priority: P2

System-camera capture and higher-resolution media encoding are staged for version 1.0.1 build 73;
physical iPhone/Galaxy quality verification remains.

The follow-up full-frame/orientation pipeline is staged under FW-010 for the next build.

- Investigate current capture resolution, compression, lens selection, and zoom
  mapping on recent iPhone and Galaxy devices.
- Prefer native-feeling tap-to-focus, exposure, lens switching, and predictable zoom
  behavior while preserving Doji's required capture flow.
- Verify the saved/uploaded media retains expected quality rather than only making
  the preview look sharper.
- Test front/back capture, permissions, crop/orientation, low light, and upload retry
  on physical iOS and Android devices.

### FW-006 — Android 15/16 window and large-screen compatibility

Priority: P2

Edge-to-edge, resizable, orientation, and safe-area configuration changes are staged for
Android build 5; Google Play and device verification remain.

The follow-up bottom-tab fix is staged: the navigator now owns the native bottom inset,
and every screen hosted inside it excludes that edge so Android cannot reserve the same
space twice. Physical Galaxy verification with gesture and three-button navigation remains.

- Remove deprecated edge-to-edge/window APIs flagged by Google Play for build 4.
- Audit orientation and resizability behavior for Android 16, tablets, and foldables.
- Preserve safe-area handling on cutout, gesture-navigation, and three-button devices.
- Clear both Google Play recommendations on the next Android release.

### FW-007 — Intermittent leaderboard refresh bounce

Priority: P2 regression verification

The overbroad server invalidation source was corrected and deployed to production on
September 10, 2026; focused-device soak verification remains.

- Reproduce the reported random vertical bounce occurring every few seconds.
- Confirm background reconciliation keeps existing rows mounted and does not reset
  scroll position or show a blocking refresh indicator.
- Add a regression test for repeated realtime invalidations while the leaderboard is
  focused.

### FW-008 — Profile Reactions consistently means reactions given

Priority: P2

Owner/member rendering and reaction cache reconciliation are staged for version 1.0.1 build 73;
two-account device verification remains.

- The top profile stat beside Friends and Responses represents reactions the person
  has given, on both the owner profile and profiles viewed by other people.
- Keep reactions received as the separate metric behind the Beloved badge; do not
  silently substitute it into the top profile strip.
- Replace the member-profile use of `reactions_received` with the authoritative
  `reactions_given` value already exposed by the safe public-profile contract.
- Reconcile the owner and member-profile caches after a reaction so the count changes
  without a pull-to-refresh, route change, or app restart.
- Add a regression test proving the same user shows the same Reactions total when
  viewed by themselves and by a friend.

## Completed

### September 9, 2026 — Android release stabilization

- Build 4 fixed Android notification-channel creation, profile-photo crop recovery,
  safe-area layouts, adaptive launcher icon sizing, and transient realtime reporting.
- Google Play deployment-certificate authorization was added to Firebase and the
  Android API key; the production Firebase Installations request was verified with
  HTTP 200 without requiring another app build.

## Maintenance rule

For each completed item, record the release/build or server deployment, the physical
device verification performed, and any new automated regression coverage. A code
change alone is not enough to mark a device-facing issue complete.
