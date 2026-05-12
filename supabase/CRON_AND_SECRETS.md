# Supabase Edge Functions: secrets and cron

## Required secrets

Configure in the Supabase Dashboard (**Project Settings → Edge Functions → Secrets**) or via CLI:

| Secret | Used by |
|--------|---------|
| `CRON_SECRET` | All cron/internal functions below. Use a long random string. |
| `SUPABASE_URL` | Auto-injected in hosted Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected; never use in the mobile app |
| `SUPABASE_ANON_KEY` | Auto-injected; required for `recalculate-streak` when validating user JWTs |

## Invoke from cron or GitHub Actions

Send the shared secret on every request:

```http
Authorization: Bearer <CRON_SECRET>
Content-Type: application/json
```

Example (curl):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/schedule-daily-challenge" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{}"
```

### Functions that require `CRON_SECRET`

- `schedule-daily-challenge` — Creates the next `daily_events` row and fan-out `user_events` (no push).
- `dispatch-challenge-pushes` — Sends Expo pushes for rows where `fires_at <= now()` and `push_sent_at` is null. Run every **1–5 minutes**.
- `expire-events` — Marks overdue `pending` events as `missed` and recomputes streaks.
- `send-push-notifications` — Targeted push by `user_event_ids` (optional operational tool).

### `recalculate-streak`

- **Server**: same `Authorization: Bearer <CRON_SECRET>` as above; body `{ "user_id": "<uuid>" }`.
- **Client** (logged-in user): `Authorization: Bearer <user_access_token>` from `supabase.auth.getSession()`; body must use the same user’s id as `user_id`.

## Suggested schedules

| Job | Suggested frequency |
|-----|---------------------|
| `schedule-daily-challenge` | Once per day (fires between 2 PM–10 PM CT / UTC-6) |
| `dispatch-challenge-pushes` | Every 1–5 minutes |
| `expire-events` | Every 1–15 minutes |

## Database migration

Apply [`migrations/20260508120000_app_store_readiness.sql`](./migrations/20260508120000_app_store_readiness.sql) so `daily_events.push_sent_at` exists and RLS policies match your product.

If you already have conflicting RLS policies, merge this file manually in the SQL editor.

## Local `config.toml`

[`config.toml`](./config.toml) sets `verify_jwt = false` for these functions so **authorization is enforced in code** via `CRON_SECRET` (or user JWT for `recalculate-streak`). Do not expose `CRON_SECRET` in the mobile app.

## Deploying functions

**Prerequisites:** log in once (`supabase login` or set env `SUPABASE_ACCESS_TOKEN`), and from the `DoIt` folder run `supabase link --project-ref <your-ref>` if the project is not linked yet.

After pulling changes, deploy all function folders (including `dispatch-challenge-pushes`):

```bash
supabase functions deploy schedule-daily-challenge
supabase functions deploy dispatch-challenge-pushes
supabase functions deploy expire-events
supabase functions deploy send-push-notifications
supabase functions deploy recalculate-streak
```

**Windows (all five in one go):** from the `DoIt` directory run:

```powershell
pwsh -File supabase/deploy-all-functions.ps1
```

Or with npx only (same directory):

```powershell
npx supabase@latest functions deploy schedule-daily-challenge
npx supabase@latest functions deploy dispatch-challenge-pushes
npx supabase@latest functions deploy expire-events
npx supabase@latest functions deploy send-push-notifications
npx supabase@latest functions deploy recalculate-streak
```

Then confirm under **Dashboard → Edge Functions** that all five names appear.

Shared code under `supabase/functions/_shared` is imported relative to each function; use recent Supabase CLI so bundling resolves `../_shared` correctly.
