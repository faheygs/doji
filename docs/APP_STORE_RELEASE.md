# App Store release (iOS) — Doji / DoIt

This document ties together the Expo client, Supabase backend, and Apple submission. Backend cron and secrets are detailed in [`supabase/CRON_AND_SECRETS.md`](../supabase/CRON_AND_SECRETS.md).

## 1. Environment and secrets (client)

- Use **only** the Supabase **anon** key in the app (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` or your naming convention).
- **Never** ship `SUPABASE_SERVICE_ROLE_KEY` or `CRON_SECRET` in the mobile binary.

## 2. EAS / iOS build (template)

1. Install EAS CLI: `npm i -g eas-cli`
2. Log in: `eas login`
3. In the app root (where `package.json` / `app.config` live), run `eas build:configure`
4. Production iOS: `eas build --platform ios --profile production`
5. Configure **APNs** in the Expo project (EAS credentials). Test push on a **development or production build**, not only Expo Go.
6. Submit: `eas submit -p ios` (or upload via Transporter / Xcode Organizer)

Ensure `ios.bundleIdentifier`, version, and icons match App Store Connect.

## 3. Push notifications (client checklist)

- Add the `expo-notifications` config plugin in `app.json` / `app.config.ts`
- On launch (after sign-in): `Notifications.requestPermissionsAsync()` then `Notifications.getExpoPushTokenAsync({ projectId })` using your EAS project ID
- Upsert the string token into `profiles.notification_token` for the current user
- Listen for token refresh and update the row again
- Handle `useLastNotificationResponse` / `addNotificationResponseReceivedListener` to deep-link using the `url` field from the server payload (e.g. `/(app)/challenge`)
- See [`examples/push-registration.example.tsx`](examples/push-registration.example.tsx) for a starting pattern

## 4. `recalculate-streak` from the client

Call the Edge Function with the **user’s JWT**, not `CRON_SECRET`:

- Header: `Authorization: Bearer <session.access_token>`
- Body: `{ "user_id": "<same as auth user id>" }`

## 5. Apple App Review

- Complete **Privacy Nutrition Labels** and host a **Privacy Policy** (auth, push tokens, Supabase storage)
- If you offer Google or other third-party sign-in, add **Sign in with Apple**
- Provide a clear **account deletion** or data-deletion request path if users can create accounts
- Declare **camera / photo library / microphone** usage strings if those native features are used; remove unused native modules to simplify review

## 6. Pre-submission test matrix

- Install on a physical iPhone via TestFlight; accept notification permission; confirm token row updates in `profiles`
- Run `dispatch-challenge-pushes` path: challenge appears after `fires_at`, push received, tap opens the correct screen
- Complete and miss flows: `user_events` status and streak fields update without errors
- Airplane mode / offline: no crashes; sensible error handling

## 7. Operations after deploy

1. Apply migrations (including `20260508120000_app_store_readiness.sql` and `20260516143000_pg_cron_doji_automation.sql` for automated cron)
2. Set Edge secret `CRON_SECRET`
3. **Vault (one-time):** add `doji_project_url` and `doji_cron_secret` per [`supabase/scripts/vault_pg_cron_secrets.sql`](../supabase/scripts/vault_pg_cron_secrets.sql) (copy of `CRON_SECRET`)
4. Deploy all functions (at minimum `schedule-daily-challenge`, `dispatch-challenge-pushes`, `expire-events`)
5. Confirm **Database → Extensions**: `pg_cron`, `pg_net` enabled; verify **`cron.job`** contains the `doji_*` schedules (or see [`CRON_AND_SECRETS.md`](../supabase/CRON_AND_SECRETS.md))
