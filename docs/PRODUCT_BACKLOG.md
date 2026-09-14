# Doji product backlog

Last updated: September 14, 2026

This is the persistent list of confirmed future product work and unresolved
regression checks. Add new user-reported behavior here before implementation and
move it to **Completed** only after the relevant release or server change has been
verified on a physical device.

## Queued

### FW-009 — Treat intentional realtime connection closure as lifecycle cleanup

Priority: P1 — next shared iOS/Android build

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
