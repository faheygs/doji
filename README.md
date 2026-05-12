# Doji (DoIt)

Expo/React Native app with Supabase (Postgres + Storage + Edge Functions).

## Local setup

Create `DoIt/.env.local` from the dashboard (never commit secrets):

| Variable | Where it is used |
|----------|-------------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Mobile/web client (`lib/supabase.ts`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same (RLS-bound anon role) |

Optional:

| Variable | Notes |
|---------|-------|
| `EXPO_PUBLIC_APP_ENV` | App-level branching if you wire it |

`SUPABASE_SERVICE_ROLE_KEY` is **server-only**. Set it as a secret on Edge Functions, not in the Expo env file.

## Database

From `DoIt/`:

- Link project: `npx supabase link`
- Push migrations (including friends-only posts and avatar upload policy):

```bash
npx supabase db push
```

Notable migrations:

- **`011_posts_friends_only_feed`**: Drops the broad authenticated read-all policy on `posts` so feed access matches friend/own semantics.
- **`012_avatars_upload_own_folder_only`**: Storage policy so avatars uploads must live under `{userId}/…` (aligns client path `avatars/{userId}/avatar.jpg`).

## Edge Functions

Deployed functions live under `supabase/functions/`.

**`schedule-daily-challenge`** creates the daily assignment, inserts **`user_events` for every profile**, and sends Expo pushes only where `profiles.notification_token` is set. Set Supabase secrets and deploy:

```bash
npx supabase secrets set SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…
npx supabase functions deploy schedule-daily-challenge
```

Attach a cron or external scheduler that **POSTs** the function URL once per window you want challenges to drop (often daily). Push payloads include `data.url: '/(app)/challenge'` and `type: 'CHALLENGE'` for routing.

Related helpers: **`expire-events`**, **`recalculate-streak`** — deploy similarly if your production cron uses them.

## Scheduling and time zones

Scheduling and **`fires_at` / `expires_at`** are **UTC-relative** unless you extend the schema/functions for per-user time zones.

## Notifications

Tap handling prefers `data.url` when present (path must start with `/`), then falls back to `type === 'CHALLENGE'` → **`/(app)/challenge`**. On cold start after opening from a notification, the root layout consumes `getLastNotificationResponseAsync()` once and clears it afterward to avoid repeat navigations.

## Native media uploads

Post photos use `expo-file-system` → `ArrayBuffer` on native to avoid unreliable `blob` reads on `file://` URIs. Video posts use the same path with MIME/extension inferred from the URI where possible.
