# Doji product backlog

Last updated: September 9, 2026

This is the persistent list of confirmed future product work and unresolved
regression checks. Add new user-reported behavior here before implementation and
move it to **Completed** only after the relevant release or server change has been
verified on a physical device.

## Queued

### FW-001 — Friendship actions acknowledge immediately

Priority: P1

- Tapping **Add friend** changes the control to **Requested** immediately.
- Accepting a request changes both accounts to the authoritative **Friends** state
  immediately without a refresh, route change, or app restart.
- Optimistic state rolls back with contextual feedback if the atomic friendship
  command fails.
- Realtime and foreground reconciliation repair either account after a missed event.

### FW-002 — New friendships do not backfill old notifications

Priority: P1

- Accepting a friendship must not make the new friend's historical posts,
  completions, reactions, or comments appear as new Activity Center items.
- Notification visibility is based on the relationship/event state at event time,
  not merely whether the accounts are friends when the bell is opened.
- Existing durable notifications for the recipient remain intact.
- Add a regression test covering activity before and after `accepted_at`.

### FW-003 — Challenge-aware feed skeletons

Priority: P2

- The loading skeleton matches the active challenge's final card shape and content
  type rather than using one generic card.
- Poll and Would You Rather challenges show the single shared-community card shape.
- Photo, task, question/free-text, and other per-user-post challenges render five
  skeleton posts of the correct type so the cold feed can scroll while loading.
- Skeleton dimensions match the final cards closely enough that hydration does not
  shift the feed.
- Cached content remains visible during background refresh; skeletons are cold-load
  placeholders only.

### FW-004 — Suppress delayed phone alerts after activity was already viewed

Priority: P2

- A grouped friend-completion/reaction alert must not reach the OS later when the
  recipient already viewed or interacted with that activity in the app before the
  delayed push was claimed.
- The live bell remains authoritative and foreground OS banners remain suppressed.
- Delivery-time suppression must use durable server state and must not depend on a
  handset timer.
- Verify the reported flow: view and react to friends' posts, remain in the app,
  then ensure no redundant "completed today's Doji" phone alert arrives later.

### FW-005 — Native-quality camera capture and controls

Priority: P2

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

- Remove deprecated edge-to-edge/window APIs flagged by Google Play for build 4.
- Audit orientation and resizability behavior for Android 16, tablets, and foldables.
- Preserve safe-area handling on cutout, gesture-navigation, and three-button devices.
- Clear both Google Play recommendations on the next Android release.

### FW-007 — Intermittent leaderboard refresh bounce

Priority: P2 regression verification

- Reproduce the reported random vertical bounce occurring every few seconds.
- Confirm background reconciliation keeps existing rows mounted and does not reset
  scroll position or show a blocking refresh indicator.
- Add a regression test for repeated realtime invalidations while the leaderboard is
  focused.

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
