# Doji — Codebase Reference for LLMs

> **Deprecated:** Read `DOJI_CONTEXT.md` and
> `docs/REALTIME_ARCHITECTURE.md` instead. They supersede the implementation
> details below. The remainder of this file is legacy history and must not be used
> for architecture or product decisions.

## Legacy: What This App Was

**Doji** is a daily-challenge mobile app (React Native / Expo). Once a day a challenge drops — photo, poll, task, or format (text). Users complete it within a time window to keep their streak alive. Miss the window and you can buy back in with Sparks. Feed access is gated on completing the challenge.

**Bundle:** `com.doit.challengeapp` | **EAS Project:** `064b68b6-f138-4962-8aeb-f00970ba39c8`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo ~56 / React Native 0.85.3 / React 19.2 |
| Routing | Expo Router (file-based) |
| State | Zustand (`useAuthStore`) + TanStack Query v5 |
| Database | Supabase (Postgres + Realtime + Edge Functions) |
| Auth | Supabase Auth (email/password) |
| Push | Expo Push Notifications + pg_net DB triggers |
| Media | Expo Camera / Image Picker / storage uploads |
| Styling | React Native theming (light/dark + 7 accent themes) |
| Testing | Jest 29 + jest-expo + React Testing Library |
| Language | TypeScript (strict) |

---

## Project Structure

```
app/                    Expo Router screens
  (auth)/               Login, welcome, username
  (onboarding)/         First-run flow (slides, notifications, profile setup)
  (app)/                Main app — feed, challenge, camera, poll, task, format
    profile/            Settings, appearance, shop
    friends/            Add, list, requests
    member/[username]   View another user's profile
    rank/               Leaderboard
    post/[id]           Post detail + comments
components/
  challenge/            ChallengeBanner, ChallengeTypeGlyph, PollScreen, TaskScreen
  economy/              BuyInSheet, SparksPill, ShopItemPreview
  feed/                 PostCard, PostCommentsThread, ReactionBar
  gamification/         XPBar, BadgesGrid, LevelUpModal, XpGainOverlay
  notifications/        AppIconBadgeSync, NotificationSheet
  ui/                   Button, Text, Input, Avatar, Card, KeyboardSafeSheet
hooks/                  All data-fetching and mutation hooks
lib/                    Business logic (no UI)
stores/                 useAuthStore, useChallengeStore, useCelebrationStore
types/database.ts       All DB table types
utils/time.ts           Date parsing (critical — see Hermes note below)
constants/
  theme.ts              Colors, spacing, typography, XP_LEVELS
  sparks.ts             Economy constants (costs, rewards)
supabase/
  functions/            Edge functions (Deno)
  migrations/           SQL migration history
```

---

## Core Data Model

### Challenge lifecycle
```
schedule-daily-challenge (cron, 10am PT)
  → creates daily_events row
  → fans out user_events rows to all profiles (status: 'pending')
  → dispatch-challenge-pushes (cron, every ~5min) sends push when fires_at reached
  → user completes → status: 'completed' or 'late'
  → expire-events (cron) marks expired pending → status: 'missed'
  → user calls buy_in_today() RPC → status: 'buy_in_open', expires_at = EOD
```

### Key statuses: `pending` → `completed` | `late` | `missed` → `buy_in_open` → `completed` | `late`

### Feed gating
- Feed unlocked only when `userEvent.status === 'completed'` (or signup-day grace)
- `isParticipationLocked()` in `lib/participationGate.ts`

### Sparks economy
| Action | Sparks |
|---|---|
| Complete challenge | 10–50 (scales with XP) |
| Post | +10 |
| Comment | +3 |
| Reaction given | +2 |
| Poll vote | +5 |
| Friend request/accept | +2 / +5 |
| Buy-in cost | −400 |
| Welcome bonus | +200 |

Awards are idempotent — `award_sparks_once(user_id, delta, reason, ref_id)` dedupes by `ref_id`.

---

## Authentication & Profile State

**`stores/useAuthStore.ts`** — single source of truth:
```typescript
session: Session | null
profile: Profile | null
isLoading: boolean        // initial auth check; splash stays up until false
isProfileLoading: boolean // profile fetch in flight
```

Auth flow in `app/_layout.tsx`:
1. `supabase.auth.getSession()` on mount
2. `onAuthStateChange` subscription updates session
3. Each session change calls `fetchProfile(userId)`
4. `fetchProfile` uses AbortController — concurrent calls cancel the previous one
5. `isLoading` and `isProfileLoading` both false → splash hides, routing begins

---

## Notification Architecture

### Push notification paths
| What | How | Preference key |
|---|---|---|
| Daily challenge | `dispatch-challenge-pushes` edge fn (cron) | `doji_start` |
| Comment on your post | DB trigger → `doji_notify_user_push()` → `notify-user` edge fn | `comment` |
| Mention in comment | Same | `mention` |
| Reaction on your post | DB trigger → `notify-user` | `reactions_on_my_post` |
| Friend request | DB trigger → `notify-user` | `friend_request` |
| Friend accepted | DB trigger → `notify-user` | `friend_accepted` |
| Friend posted | DB trigger → `notify-user` | `friend_post` |
| Badge unlocked | DB trigger → `notify-user` | `badges` |
| Suggestion reviewed | DB trigger → `notify-user` | `suggestion` |

**Token ownership:** `dispatch-challenge-pushes` is the ONLY function that clears stale push tokens (`DeviceNotRegistered`). `notify-user` never touches tokens.

**Foreground behaviour:** `setNotificationHandler` in `_layout.tsx` sets all `shouldShow*` and `shouldPlaySound` to `false` — pushes land silently in the in-app bell while the user is active. Background/killed-app pushes show OS banners normally.

### In-app bell (`hooks/useNotificationCenter.ts`)
Queries reactions, comments, mentions, friend requests/accepts, challenges (pending + live), badges, suggestions — all since `clearedAt` timestamp (per-user, AsyncStorage). Preference keys are NOT enforced in the bell — the bell always shows all activity; preferences only gate OS push delivery.

### Notification preferences (`lib/notificationPreferences.ts`)
11 keys: `push_enabled` (deprecated, not used for gating), `show_bell_badge`, `doji_start`, `friend_post`, `reactions_on_my_post`, `friend_request`, `friend_accepted`, `badges`, `comment`, `mention`, `suggestion`. All default `true`. `mergeNotificationPreferences()` fills missing keys with defaults.

---

## Challenge Visibility Rules

**Users must always be able to see their challenge and access buy-in.**

- `useUserEvent()` (`hooks/useUserEvent.ts`):
  1. Query `daily_events` by local-midnight window (`todayFiresAtWindow()`)
  2. If no matching IDs (timezone boundary edge case) OR no user_events row found → call `ensure_today_user_event()` RPC
  3. RPC uses Pacific time to find today's event, creates the row if missing, respects signup-day grace
  4. Always returns a row if a `daily_events` record exists

- `app/(app)/challenge.tsx` shows buy-in button directly when `status === 'missed'` and user is eligible (`useBuyInToday().eligible`). Never tells user to navigate elsewhere.

- `lib/participationGate.ts` — key functions:
  - `canBuyIn(userEvent)` — missed/expired-pending, no prior buy_in, not signup-day grace
  - `isMissedOrExpiredPending(userEvent)` — status is 'missed' OR (pending + expired + not grace)
  - `hasUnlockedFeed(userEvent)` — status === 'completed'
  - `showSignupDayGraceBanner(userEvent, profile)` — first-day user, shows free-completion banner

---

## Date/Time Critical Notes

**Supabase returns non-standard timestamps:** `"2026-06-03 00:07:53.947+00"` — space separator, `+00` not `Z`.

**Hermes (React Native iOS) cannot parse this format** with `new Date()` — returns wrong dates or Invalid Date.

**Always use `parseDate()` from `utils/time.ts`** for any DB timestamp. Never use `new Date(supabaseTimestamp)` directly.

```typescript
import { parseDate } from '../utils/time';
const d = parseDate(row.created_at); // ✓
const d = new Date(row.created_at);  // ✗ breaks on iOS
```

---

## Key RPCs (Supabase Functions)

| RPC | What it does |
|---|---|
| `ensure_today_user_event()` | Create/return today's user_events row; signup-day grace gives EOD expiry |
| `buy_in_today()` | Deduct 400 sparks, set status → buy_in_open, extends expires_at to EOD |
| `award_sparks_once(uid, delta, reason, ref_id)` | Idempotent spark award, dedupes on ref_id |
| `user_end_of_day(user_id)` | Returns timezone-aware midnight for the user |
| `get_friend_ids(user_id)` | Set of mutual friend UUIDs |
| `get_profile_by_username(username)` | Profile lookup by username |
| `purge_posts_older_than_24h()` | Retention cleanup (called by schedule-daily-challenge) |
| `recalculate_streak_from_events(uid)` | Walk events chronologically, recompute streaks |

---

## Edge Functions

All edge functions require `Authorization: Bearer <CRON_SECRET>` header (checked by `assertCronAuthorized`).

| Function | Trigger | Purpose |
|---|---|---|
| `schedule-daily-challenge` | pg_cron daily | Pick challenge, create daily_event, fan-out user_events |
| `dispatch-challenge-pushes` | pg_cron every ~5min | Send Expo push when fires_at reached; owns token cleanup |
| `expire-events` | pg_cron every ~15min | Mark expired pending events as missed; apply streak shields |
| `notify-user` | DB trigger via pg_net | Social pushes (reactions, comments, friends, badges) |
| `send-push-notifications` | Called by dispatch | Batch Expo push sender; checks TYPE_TO_PREF map |
| `recalculate-streak` | Called after completion | Recompute streak from event history |
| `delete-account` | User-initiated | GDPR account deletion |

---

## Gamification

### XP & Levels
- XP awarded on challenge completion (varies by difficulty)
- Levels defined in `constants/theme.ts` `XP_LEVELS` array
- Level-up triggers celebration modal + spark reward

### Badges
- Categories: physical, creative, social, mental, wild
- Tiers: bronze → silver → gold → diamond
- Progress tracked in `user_badge_progress`, unlocked via DB trigger
- Badge unlock triggers push via `trg_badge_tier_push`

### Streak Shields
- `profiles.streak_shields` — number of available shields
- Shields auto-consume on miss (in `expire-events`), prevent streak break
- Earned through badge tier unlocks

---

## Social System

- **Friendships** (not follows) — mutual, bidirectional. Table: `friendships (requester_id, addressee_id, status)`
- Feed audience: `friends` (mutual only) or `everyone`
- Posts linked to `user_events` — can only post if `canSubmitChallenge()` is true
- Reactions: fire, like, dislike, laugh, wow, heart — each awards sparks once per post per user
- Comments support @mention tagging (resolved via `lib/mentionNetwork.ts`)
- Community poll posts: single shared post per daily_event (not per user)

---

## Testing

**Run tests:** `npx jest`
**411 tests, 32 suites — all passing**

Test locations:
```
__tests__/lib/          Business logic (participationGate, challengeDay, onboardingGate, etc.)
__tests__/stores/       useAuthStore
__tests__/hooks/        useCreatePost, usePollVote
__tests__/utils/        time, upload, formatCount
__tests__/components/   Button, ErrorBoundary
__tests__/edge-functions/ expo-push, streak, cron-auth
```

Mock: `lib/__mocks__/supabase.ts` — full Supabase client mock for unit tests.

No skipped tests. No TODO/FIXME/HACK markers in source.

---

## Known Quirks & Non-Obvious Behaviour

1. **Token cleanup delay** — Stale push tokens are only cleared when `dispatch-challenge-pushes` runs (daily). Social push failures to stale tokens are silently ignored. If the user opens the app, `syncPushToken` in `_layout.tsx` refreshes the token immediately.

2. **Signup-day grace** — New users on their first day get `signup_day_grace = true` and `expires_at = EOD`. They cannot buy in (they don't need to) and their event never expires early.

3. **`push_enabled` is deprecated** — The field exists in `NotificationPreferences` and DB schema but is not used for gating. Only per-category keys matter. `wantsCategoryEnabled()` is the correct function to use.

4. **Bell ignores preferences** — `useNotificationCenter` queries all notification types regardless of user preferences. Preferences only gate OS push delivery. This is intentional — the bell is an activity log, not a push mirror.

5. **`isLoading` vs `isProfileLoading`** — `isLoading` is the startup gate (auth + profile). `isProfileLoading` covers subsequent refresh fetches. Splash screen waits for `isAuthRoutingPending(isLoading, isProfileLoading)` to be false.

6. **Feed pagination** — `useFeed` uses cursor-based pagination via TanStack Query infinite queries. Community poll posts are fetched separately and merged into page 0.

7. **Timezone handling** — All local-day boundaries computed from `profile.timezone` server-side or device local time client-side. `ensure_today_user_event` uses Pacific time to define "today" on the server. Client uses device local time for the initial `daily_events` query, then falls back to the RPC.

8. **Challenge screen always accessible** — Even if `useUserEvent` returns null, the screen shows "No challenge yet." If the user has missed and is eligible to buy in, the buy-in button is on the challenge screen directly — they never need to navigate to the home feed for it.
