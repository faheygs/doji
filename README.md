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

**Daily challenge + pushes (no external cron):** Migration [`20260516143000_pg_cron_doji_automation.sql`](supabase/migrations/20260516143000_pg_cron_doji_automation.sql) registers pg_cron jobs that invoke your Edge Functions automatically. **`schedule-daily-challenge`** creates the daily assignment, inserts **`user_events` for every profile**, and picks a random **`fires_at`** in the evening UTC window. **`dispatch-challenge-pushes`** (invoked every minute from the DB) sends Expo pushes when `fires_at` is due. **`expire-events`** runs every five minutes.

1. Enable extensions if needed: **Dashboard → Database → Extensions** — **`pg_cron`**, **`pg_net`** (Vault is used for secrets).
2. `npx supabase db push` (applies the migration above).
3. **One-time Vault setup:** run the templated SQL in [`supabase/scripts/vault_pg_cron_secrets.sql`](supabase/scripts/vault_pg_cron_secrets.sql) in the **SQL Editor** — you must store **`doji_project_url`** (your `https://<ref>.supabase.co`) and **`doji_cron_secret`** (exactly the same string as Edge secret **`CRON_SECRET`**).
4. Deploy functions: at minimum `schedule-daily-challenge`, `dispatch-challenge-pushes`, `expire-events`.

Push payloads include `data.url: '/(app)/challenge'` and `type: 'CHALLENGE'` for routing.

**Optional:** You can still trigger the same URLs manually with `curl` + `CRON_SECRET` (see `supabase/CRON_AND_SECRETS.md`). External cron is not required once Vault + pg_cron are set up.

Related helpers: **`recalculate-streak`**, **`send-push-notifications`** — deploy if you use them.

## Scheduling and time zones

Scheduling: daily **`fires_at`** is a random time between **10:00 `America/Los_Angeles`** and **22:00 `America/New_York`** on the same Eastern calendar day (see `schedule-daily-challenge`). DB timestamps stay UTC; DST is handled by those IANA zones.

## Notifications

Tap handling prefers `data.url` when present (path must start with `/`), then falls back to `type === 'CHALLENGE'` → **`/(app)/challenge`**. On cold start after opening from a notification, the root layout consumes `getLastNotificationResponseAsync()` once and clears it afterward to avoid repeat navigations.

## Native media uploads

Post photos use `expo-file-system` → `ArrayBuffer` on native to avoid unreliable `blob` reads on `file://` URIs. Video posts use the same path with MIME/extension inferred from the URI where possible.
