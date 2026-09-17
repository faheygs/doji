# Doji product backlog

Last updated: September 17, 2026

This is the persistent list of confirmed future product work and unresolved
regression checks. Add new user-reported behavior here before implementation and
move it to **Completed** only after the relevant release or server change has been
verified on a physical device.

## Queued

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
pass, the first five media cards are decoded into the stable native cache, private object
references are never rendered directly, and a shared skeleton covers native rebinding.
Physical Galaxy/iPhone cold-restart verification remains.

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
