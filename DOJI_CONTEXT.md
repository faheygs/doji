# Doji — LLM Context Reference

## What Doji Is

Doji is a daily-challenge mobile app for iOS and Android (React Native / Expo). Its core premise: once per day, a single challenge drops for all users simultaneously. You have a 10-minute window to complete it. If you miss the window, your streak breaks and the social feed locks — unless you spend 400 Sparks to buy back in. Everything in the app is structured around this daily participation gate.

Target audience: social/competitive users who want a lightweight daily ritual with a competitive social layer — streaks, leaderboards, badges, and a friends feed.

Bundle ID: `com.doit.challengeapp`
Developer: Gavin Fahey (sole developer)

---

## Terminology

| Term | Meaning |
|---|---|
| **Doji** | The app name; also used informally to mean "today's challenge" (e.g. "complete your Doji") |
| **Sparks** | In-app currency. Earned through participation, spent in the shop or on buy-ins |
| **Streak** | Consecutive days on which the user completed the daily challenge |
| **Streak shield** | A consumable that auto-activates on a missed day to preserve the streak |
| **Buy-in** | Spending 400 Sparks after missing the window to re-open the challenge and stay in that day |
| **User event** | A per-user row tracking the user's status for a given daily challenge |
| **Daily event** | The single global challenge record for a given day |
| **Signup-day grace** | New users on their first day get the challenge window extended to end-of-day; they cannot buy in (they don't need to) |
| **XP** | Experience points earned on challenge completion; drives level progression |
| **Accent theme** | A purchasable color scheme for the app UI |
| **Avatar frame** | A purchasable colored border on the user's profile picture |
| **Title** | A purchasable text badge shown on the user's profile |

---

## How a Day Works (Core Loop)

1. **Challenge scheduled** — `schedule-daily-challenge` edge function runs at 10am PT via pg_cron. It selects a challenge, creates one `daily_events` row, and fans out individual `user_events` rows to every user profile (status: `pending`).

2. **Challenge drops** — At `fires_at` time (between 10am PT and 10pm ET, randomized), `dispatch-challenge-pushes` cron sends each user a push notification. The window is 10 minutes from `fires_at` (each user_event row has an `expires_at`).

3. **User opens the app** — A countdown timer on the home feed shows time remaining. The Challenge screen shows the prompt, XP reward, and a CTA button.

4. **User completes** — Depending on type: opens camera (photo), votes (poll), submits text answer (task/format). On success, `user_events.status` → `completed`. Feed and post capability unlock immediately.

5. **Window closes** — If the user doesn't complete in time, `expire-events` cron marks their row `missed`. Streak shields auto-consume here if available. The feed locks.

6. **Buy-in path** — If the user missed and hasn't previously bought in today, the Challenge screen shows a "Buy in · 400 Sparks" button. Tapping it deducts 400 Sparks via `buy_in_today()` RPC, sets status → `buy_in_open`, extends `expires_at` to end-of-day. The user can now complete the challenge and unlock the feed.

7. **Day ends** — All unresolved events expire. `schedule-daily-challenge` runs again next day.

**Status progression:**
```
pending → completed
         → missed → [buy_in_open] → completed
                                   → (day ends, locked)
         → (expired pending, treated as missed)
```

---

## Challenge Types

### Photo
- Prompt: a visual challenge (e.g. "Show us your workspace right now")
- Flow: app opens camera directly → user takes photo → photo uploads to Supabase storage → post created

### Poll
- Prompt: a question with multiple options
- Flow: user sees options, taps one to vote → result shows how friends voted, with percentage bars
- Community behavior: all users share a single poll post per daily event (not one post per user)

### Task
- Prompt: a described activity to perform
- Flow: user reads the task, performs it, submits a written answer or proof

### Format
- Prompt: a creative/written prompt
- Flow: user types a response (text-based)

---

## Feed Gating

The social feed (friends' posts) is only accessible when the user has `userEvent.status === 'completed'` for today.

Logic: `isParticipationLocked(userEvent)` returns `true` when status is anything other than `completed`. The feed UI shows a locked state with the current challenge visible and a CTA to complete it.

Exceptions:
- **Signup-day grace**: New users on their first day can see the feed without completing (their user_event has `signup_day_grace = true` and `expires_at` extended to EOD).
- **Buy-in open**: After buying in, the feed remains locked until they actually complete the challenge.

Post creation (`canSubmitChallenge()`) is true when: status is `pending` or `buy_in_open`, and `expires_at` has not passed.

---

## Sparks Economy

### Earning Sparks

| Action | Sparks |
|---|---|
| Complete challenge | 10–50 (scales with XP reward) |
| Create a post | +10 |
| Comment on a post | +3 |
| React to a post | +2 |
| Vote in a poll | +5 |
| Send a friend request | +2 |
| Accept a friend request | +5 |
| Badge unlock (bronze/silver/gold/diamond) | +8/+15/+30/+60 |
| Welcome bonus (new users) | +200 |

All awards are idempotent via `award_sparks_once(user_id, delta, reason, ref_id)` — deduplication by `ref_id` prevents double-awarding.

### Spending Sparks

| Item | Cost |
|---|---|
| Buy-in (re-open missed challenge) | 400 Sparks |
| Avatar frame — Classic | 40 Sparks |
| Avatar frame — Neon | 80 Sparks |
| Avatar frame — Gold | 120 Sparks |
| Avatar frame — Diamond | 160 Sparks |
| Avatar frame — Purple | 200 Sparks |

---

## Streak and Shield Mechanics

- **Streak**: count of consecutive days the user completed the challenge. Displayed on profile and home feed.
- **Streak breaks**: occur when a day ends without `completed` status and no shield is available.
- **Streak shields**: earned through badge tier unlocks. Stored in `profiles.streak_shields`. When `expire-events` runs, a shield auto-consumes (decrements by 1, streak preserved).
- A user can only buy in once per day (`buy_in_at` field is set on first buy-in). Buying in does not guarantee streak preservation — they must complete after buying in.
- `recalculate-streak` edge function walks event history chronologically to recompute streaks after completion.

---

## Badge System

Badges are awarded for reaching milestones across five categories:

| Category | Emoji |
|---|---|
| Physical | 💪 |
| Creative | 🎨 |
| Social | 🤝 |
| Mental | 🧠 |
| Wild | 🌪️ |

**Tiers** (in order): Bronze → Silver → Gold → Diamond

Tier colors: Bronze `#E8944A`, Silver `#A0A0A6`, Gold `#FFCA28`, Diamond `#22D3EE`

Badges unlock via DB trigger on `user_badge_progress`. Each unlock awards Sparks and may award streak shields. Progress is tracked in `user_badge_progress` and displayed in a grid on the profile screen.

---

## XP and Levels

XP is earned on challenge completion. Level thresholds are defined in `constants/theme.ts` `XP_LEVELS`. Level-up triggers a celebration modal + Sparks reward (`5 × new_level`). XP progress is displayed as a gradient bar on the profile screen.

---

## Shop

Three categories of cosmetic items, all purchased with Sparks:

### Avatar Frames (Borders)
Colored rings around the user's profile picture:
- Classic (silver `#C0C0C0`) — 40 Sparks
- Neon (orange `#FF6B35`) — 80 Sparks
- Gold (`#FFD700`) — 120 Sparks
- Diamond (cyan `#00D4FF`) — 160 Sparks
- Purple (`#A855F7`) — 200 Sparks

### Accent Themes
Replaces the app's primary accent color. Default "Doji Orange" (`#FF6B35`) is always free.

### Titles
Text badges displayed on the user's profile:
- **Chaos Agent** — "Zero chill. Maximum plot."
- **Main Character** — "The timeline bends around you."
- **Certified Delulu** — "Reality is a suggestion."

Items are purchased once and owned permanently. Cosmetic borders override rank-tier borders when equipped.

---

## Social System

### Friendships
Mutual friendships only (not follows). Table: `friendships (requester_id, addressee_id, status)`. Both users must accept. No one-sided following.

### Feed
- Only accessible when today's challenge is completed
- Shows posts from mutual friends only
- Cursor-based pagination via TanStack Query infinite queries
- Community poll post is fetched separately, merged into page 0

### Reactions
Six reaction types. Each user can react once per post. +2 Sparks awarded to the reactor (idempotent per post per user).

### Comments
Supports @mention tagging. Mentions trigger push notifications. +3 Sparks awarded to commenter (idempotent per post).

---

## Notification System

**Foreground behavior**: `setNotificationHandler` sets all `shouldShow*` to `false` — pushes arrive silently in the in-app bell while the app is open. Background/killed-app pushes show OS banners normally.

### Push Types

| Notification | Preference key |
|---|---|
| Daily challenge drop | `doji_start` |
| Friend posted | `friend_post` |
| Reaction on your post | `reactions_on_my_post` |
| Comment on your post | `comment` |
| @mention | `mention` |
| Friend request received | `friend_request` |
| Friend request accepted | `friend_accepted` |
| Badge unlocked | `badges` |
| Suggestion reviewed | `suggestion` |

**Bell**: `useNotificationCenter` shows all notification types regardless of push preferences. Preferences only gate OS push delivery. The bell is an activity log, not a push mirror.

---

## Buy-In Flow

1. User misses 10-minute window (or `expire-events` cron marks them `missed`)
2. Challenge screen shows "Buy in · 400 Sparks" button if `canBuyIn(userEvent)` is true
3. `canBuyIn()` requires: status `missed` or `pending+expired`, `buy_in_at` is null, not signup-day grace
4. `BuyInSheet` confirmation modal shows challenge details and cost
5. `buy_in_today()` RPC: deducts 400 Sparks, sets status → `buy_in_open`, extends `expires_at` to EOD
6. User completes challenge → feed unlocks
7. One buy-in per day maximum (`buy_in_at` prevents repeats)

---

## Key Screens

| Screen | Path | Purpose |
|---|---|---|
| Home feed | `(app)/index.tsx` | Friends' posts, challenge banner, participation gate |
| Challenge | `(app)/challenge.tsx` | Today's challenge, buy-in if missed |
| Camera | `(app)/camera.tsx` | Photo capture for photo challenges |
| Poll | `(app)/poll.tsx` | Poll voting |
| Task | `(app)/task.tsx` | Task/written answer |
| Notifications | `(app)/notifications.tsx` | In-app bell / activity log |
| Profile | `(app)/profile/index.tsx` | Streak, XP, badges, post history |
| Shop | `(app)/profile/shop.tsx` | Sparks shop |
| Friends | `(app)/friends/` | List, add, requests |
| Leaderboard | `(app)/rank/` | Streak-based ranking |
| Member | `(app)/member/[username]` | Another user's profile |
| Post detail | `(app)/post/[id]/` | Post + comments thread |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo ~54 / React Native 0.81.5 / React 19 |
| Routing | Expo Router (file-based, typed routes) |
| State | Zustand (`useAuthStore`) + TanStack Query v5 |
| Database | Supabase (Postgres + Realtime + Edge Functions) |
| Auth | Supabase Auth (email/password) |
| Push | Expo Push Notifications + pg_net DB triggers |
| Media | Expo Camera / Image Picker / Supabase Storage |
| Error tracking | Sentry (`@sentry/react-native`) |
| Testing | Jest 29 + jest-expo + React Testing Library |
| Language | TypeScript (strict) |

**Critical**: Supabase returns timestamps as `"2026-06-03 00:07:53.947+00"` (space separator, `+00` not `Z`). Hermes on iOS cannot parse this with `new Date()`. Always use `parseDate()` from `utils/time.ts`.

---

## Key Business Logic Files

| File | Purpose |
|---|---|
| `lib/participationGate.ts` | `hasUnlockedFeed()`, `canBuyIn()`, `canSubmitChallenge()`, `isParticipationLocked()` |
| `lib/cosmetics.ts` | Border/title catalog, equip resolution |
| `lib/notificationPreferences.ts` | Preference keys, merge, `wantsCategoryEnabled()` |
| `utils/time.ts` | `parseDate()`, `isExpired()`, `todayFiresAtWindow()` |
| `constants/sparks.ts` | All Sparks earn/cost constants |
| `constants/theme.ts` | `XP_LEVELS`, color tokens, `BADGE_TIER_COLORS` |
| `stores/useAuthStore.ts` | Session, profile, isLoading, isProfileLoading |
| `hooks/useUserEvent.ts` | Fetches/creates today's user_events row |
| `hooks/useBuyIn.ts` | Buy-in eligibility and mutation |
| `hooks/useFeed.ts` | Cursor-paginated friends feed |

---

## Edge Functions

All require `Authorization: Bearer <CRON_SECRET>`.

| Function | Trigger | Role |
|---|---|---|
| `schedule-daily-challenge` | pg_cron daily | Select challenge, fan-out user_events |
| `dispatch-challenge-pushes` | pg_cron ~5min | Send push at fires_at; owns token cleanup |
| `expire-events` | pg_cron ~15min | Mark expired pending as missed; consume shields |
| `notify-user` | DB trigger via pg_net | Social pushes |
| `recalculate-streak` | Post-completion | Recompute streak from history |
| `delete-account` | User-initiated | GDPR deletion |

---

## Non-Obvious Behaviors

1. **Signup-day grace**: First-day users get `signup_day_grace = true`, `expires_at = EOD`. Buy-in button never shows for them.
2. **Bell ignores preferences**: Preferences only gate OS pushes. Bell always shows all activity.
3. **`push_enabled` deprecated**: Exists in schema but not used for gating. Use `wantsCategoryEnabled()`.
4. **Challenge screen always accessible**: Even if `useUserEvent` returns null, shows "No challenge yet." If it errors, shows an error state with retry. Buy-in is always on the challenge screen — users never need to navigate elsewhere.
5. **Token cleanup**: Stale push tokens only cleared by `dispatch-challenge-pushes`. `notify-user` silently ignores delivery failures.
6. **Timezone**: `ensure_today_user_event` uses Pacific time server-side. `buy_in_today` uses a 36-hour lookback to handle all timezone offsets.
7. **Concurrent buy-in protection**: `buy_in_today()` uses `SELECT FOR UPDATE` row lock + unique partial index on `spark_ledger(user_id, ref_id) WHERE reason = 'buy_in'` to prevent double-charging.
8. **Optimistic feed-unlock**: `useCreatePost` and `usePollVote` both use TanStack Query `onMutate` to immediately set `userEvent.status = 'completed'` in the cache before the network round-trip completes. `onError` rolls back to the previous value. `invalidateQueries` on the userEvent key uses `refetchType: 'none'` so it marks the cache stale without triggering a background refetch that would overwrite the optimistic value. This prevents the race condition where the feed re-locks between post submission and the server confirming completion.
9. **Splash screen on network error**: `useAuthStore.fetchProfile` clears both `isLoading` and `isProfileLoading` in its error branch (not just in the finally block). Without this, a network failure during the initial profile fetch would leave `isLoading: true` indefinitely, blocking the splash screen forever.
10. **Error states on participation screens**: `challenge.tsx`, `poll.tsx`, and `task.tsx` all surface `isError` from `useUserEvent()` with a retry button. Screens that don't handle this error silently render as if no challenge exists, which is a confusing dead end for the user.
