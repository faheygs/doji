# Doji — QA Checklist (pre-publish)

Run through every item on a **real device** (or Expo Go / dev-client build).
Mark each box when verified.

---

## 1. Auth Flow

- [ ] **Sign up** — accept separate Terms and Privacy checkboxes, then authenticate
- [ ] **Profile setup** — username is required; photo, display name, and bio are optional on the same page
- [ ] **Onboarding** — How Doji Works → notification permission → lands on feed without another profile/skip screen
- [ ] **Sign out** — tap Sign Out in Settings → returns to welcome screen
- [ ] **Sign in** — existing credentials → lands on feed with profile loaded
- [ ] **Invalid credentials** — wrong password shows an error toast, does not crash
- [ ] **Duplicate username** — shows "Username is taken" inline error

## 2. Feed

- [ ] **Empty feed** — new user with no friends sees "Nothing yet" empty state
- [ ] **Feed shows only friends + self** — add a friend, accept, verify their posts appear
- [ ] **Pull to refresh** — swipe down refreshes feed content
- [ ] **Infinite scroll** — with 20+ posts, scrolling loads more pages
- [ ] **Post card** — displays avatar, username, relative time, photo, category badge
- [ ] **Dual camera** — tap photo on a post to toggle front/back views
- [ ] **Late badge** — posts submitted after window shows "LATE" label
- [ ] **Text-only post** — no photo/video → shows placeholder icon

## 3. Challenge Banner

- [ ] **No active challenge** — banner shows "Check back soon"
- [ ] **Active challenge** — shows category letter, title, countdown timer
- [ ] **Timer continuity** — background for 30+ seconds and return; every participation screen shows the same server-clock remaining time
- [ ] **Completed** — banner shows green checkmark, "Streak active"
- [ ] **Missed** — banner shows dash, "Next drop soon"
- [ ] **Tap banner** → opens challenge detail screen

## 4. Challenge Detail Screen

- [ ] Shows category badge, difficulty dots, title, description
- [ ] Countdown ring animates and counts down in real-time
- [ ] **Capture proof** button navigates to camera screen
- [ ] Shows "Missed" state after timer expires
- [ ] Shows "Done" state after posting

## 5. Camera & Post Flow

- [ ] **Camera permission** — prompts if not granted, shows fallback if denied
- [ ] **Phone camera** — opens the device camera UI; lens, zoom, focus, exposure,
      flash, and front/back controls behave like the phone camera
- [ ] **Captured quality** — uploaded photo retains useful detail at the 2048 px /
      0.92 JPEG boundary and has correct orientation on iPhone and Galaxy
- [ ] **Choose from library** — opens image picker, selects photo
- [ ] **Video recording** — records, stops, shows preview
- [ ] **Preview screen** — shows photo/video, front inset, timer, caption input
- [ ] **Retake** — clears captures, returns to source selection
- [ ] **Post** — uploads media, creates post, shows success toast, returns to feed
- [ ] **Feed updates** — new post appears in feed immediately after posting
- [ ] **Activation reset** — preparing tomorrow does not clear the feed; activating a new Doji immediately replaces the prior feed without deleting history/XP
- [ ] **Poll types** — generic Poll offers `Other`; Would You Rather shows exactly two choices and never `Other`

## 6. Reactions

- [ ] Tap emoji → reaction count increments (optimistic)
- [ ] Tap same emoji again → removes reaction
- [ ] Tap different emoji → switches reaction
- [ ] Reaction persists after page refresh

## 7. Friends

- [ ] **Friends list** — shows accepted friends with streak counts
- [ ] **Add friends** — search by username, send request
- [ ] **Immediate request state** — every visible Add friend control changes to
      Requested before the network round trip and rolls back with inline feedback on failure
- [ ] **Friend requests** — pending requests show in notification center + friends screen banner
- [ ] **Accept request** — moves to friends list, feed updates to include their posts
- [ ] **Prospective activity** — after accepting a new friend, their older completions,
      reactions, and comments do not flood Activity Center; later activity appears normally
- [ ] **Decline request** — removes from pending list

## 8. Notifications

- [ ] **Enable notifications** in Settings → saves push token to profile
- [ ] **Foreground notification** — all activity updates the bell without a redundant OS banner or app toast
- [ ] **Remote push allowlist** — only Doji live, friend requests, explicit mentions/direct replies, and review/account alerts reach the phone tray
- [ ] **Immediate delivery** — every allowlisted alert is handed to APNs/FCM without an application delay; Doji-live is time-sensitive
- [ ] **Terminal delivery claim** — simulate a lost Expo response or failed outcome write; the same event/recipient key is never handed to Expo again
- [ ] **Ambient activity stays in-app** — completions, posts, reactions, ordinary comments, comment likes, friend acceptance, badges, XP/streak, and polls never create phone alerts
- [ ] **Seen suppression** — open an eligible subject before a transport retry; no later phone alert is claimed, and the Activity Center item remains
- [ ] **Tray cleanup** — viewing an eligible Activity Center row or opening its push removes only that matching delivered OS alert
- [ ] **Push threads** — repeated eligible alerts reuse the correct iOS thread and Android replacement tag
- [ ] **Deep links** — challenge alerts open the Doji; mention/reply alerts open the relevant feed thread; friend requests and reviews open their canonical screens
- [ ] **Notification center** — bell icon opens sheet with all notification types
- [ ] **Unread badge** — badge count shows on bell icon
- [ ] **Mark as read** — closing notification sheet resets watermark

## 9. Profile

- [ ] **Own profile** — shows avatar, display name, username, bio, stats, post grid
- [ ] **Change photo** — tap camera FAB → pick/take photo → avatar updates
- [ ] **Other user profile** — tap username in feed → shows their profile + posts
- [ ] **Stats** — current streak, best streak, completion rate, total completions
- [ ] **Reaction semantics** — the same account shows the same reactions-given total in
      its owner and member profile; Beloved progress continues to use reactions received

## 10. Settings

- [ ] **Edit profile** — change display name + bio → save updates profile
- [ ] **Legal** — Terms and Privacy open from Settings while signed in
- [ ] **Support** — Help & support opens `https://dojipro.com/support/`
- [ ] **Theme toggle** — light/dark switches instantly
- [ ] **Theme navigation** — push/pop and interactive-swipe transitions never reveal the opposite-theme window background
- [ ] **Stats preview** — shows current streak, best, completed counts
- [ ] **Delete account** — confirmation dialog → deletes all data + signs out
- [ ] **Sign out** — clears session, returns to welcome

## 11. Realtime

- [ ] **New post** — friend posts → your feed auto-updates (within ~1s)
- [ ] **New reaction** — someone reacts to your post → notification center updates
- [ ] **Friend status change** — acceptance triggers toast + feed refresh
- [ ] **New challenge event** — Ably updates connected devices and outbox push reaches background devices

## 12. Edge Cases

- [ ] **No internet** — app doesn't crash; shows appropriate loading states
- [ ] **Rapid navigation** — tab switching doesn't break layout
- [ ] **Sheet lifecycle** — rapidly open/close every sheet, swipe or tap outside, then verify the underlying screen accepts touches immediately
- [ ] **Deferred sheet navigation** — opening a profile from a voters/likes/friends sheet dismisses the sheet before the route push and leaves no invisible overlay
- [ ] **Skeleton transition** — cold feed, leaderboard, shop, friends, search, and notifications loads preserve layout and crossfade once; cached refreshes keep content interactive
- [ ] **Challenge skeletons** — Poll/WYR shows one shared placeholder; photo/video and
      text/task/format feeds show five scrollable, correctly shaped post placeholders
- [ ] **Leaderboard soak** — remain scrolled in the board while other users react and
      complete actions; unrelated profile activity does not bounce or reset the list
- [ ] **Android windows** — rotate a phone, resize a tablet/foldable or emulator window,
      and test cutout plus gesture/three-button navigation without clipped controls
- [ ] **Android Fabric list stability** — rapidly scroll the feed, comments, Activity
      Center, friends, leaderboard, and voter/likes sheets while realtime rows update;
      no `addViewAt`/`ReactClippingViewManager` crash or missing content occurs
- [ ] **Reduce Motion** — with the OS setting enabled, sheets and skeleton swaps settle without decorative movement while remaining fully operable
- [ ] **Long caption** — text wraps properly in post card
- [ ] **Very long username** — truncates with ellipsis

## 13. Backend (Supabase)

- [ ] **Pre-live reset** — exactly 20 minutes before activation, the old feed clears and the coming-soon countdown appears without revealing the challenge

- [ ] **RLS** — unauthenticated requests to tables are blocked
- [ ] **Edge Functions** — realtime-token, relay-domain-events, orchestrate-doji, and schedule-daily-challenge are deployed
- [ ] **Durable alarms** — exact activation/close fires once; close chains the next event; no recurring Doji cron jobs exist
- [ ] **Outbox** — committed events publish promptly; no overdue rows, expired push
      shards, or repairable one-shot alarms remain
- [ ] **Streak calculation** — completing a challenge increments streak; missing resets it

---

## Quick Smoke Test (5 min)

1. Sign up with a fresh account
2. Set username → verify feed shows empty state
3. Go to Settings → Enable notifications → verify toast
4. Search and add a friend (use a second test account)
5. Accept the friend request on the second account
6. Trigger a daily challenge via Edge Function or Supabase dashboard
7. Open challenge → Capture proof → Post
8. Verify post appears in both accounts' feeds
9. React to the post from the second account
10. Verify the reaction appears in the Activity Center with no phone alert
11. Mention the first account in a comment and verify one immediate background phone alert

---

## Pre-App Store Submission

- [ ] `app.json` → `extra.eas.projectId` is set (run `eas project:init` if needed)
- [ ] `eas.json` → submit config has correct Apple ID + ASC App ID
- [ ] Privacy policy URL added to App Store Connect
- [ ] Support and marketing URLs added to App Store Connect
- [ ] Public account-deletion page loads at `https://dojipro.com/delete-account/`
- [ ] App icon meets Apple guidelines (1024x1024, no alpha)
- [ ] Screenshots for required device sizes
- [ ] App Review description accurately describes all features
- [ ] "Sign in with Apple" added if using third-party social auth (email/password only = not required)
