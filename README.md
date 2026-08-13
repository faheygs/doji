# Doji

Expo/React Native app backed by Supabase Postgres/Storage/Edge Functions,
Cloudflare Durable Objects/Queues, and Ably realtime Pub/Sub.

## Start here

Read [DOJI_CONTEXT.md](DOJI_CONTEXT.md) before changing the product. It maps the
complete user journey, daily challenge lifecycle, screen responsibilities, data
model, atomic commands, realtime events, notifications, economy, moderation, UI
rules, and how every system connects. Transport/deployment details are in
[docs/REALTIME_ARCHITECTURE.md](docs/REALTIME_ARCHITECTURE.md).

## Local setup

Create `.env.local` from the project dashboard. Never commit secrets.

| Variable | Use |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Mobile/web Supabase client |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | RLS-bound public client key |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional production error reporting |
| `EXPO_PUBLIC_APP_ENV` | Optional environment label |

Server-role, Ably API, relay, and orchestration secrets are server-only.

```powershell
npm install
npx supabase link
npx supabase db push
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npx expo start --dev-client
```

## Authoritative realtime

Postgres owns all state. Ably messages announce committed changes and never replace
RLS-authorized reads. Core mutations are serialized, transactional, and idempotent.

- A one-shot Cloudflare Durable Object alarm activates each Doji at its exact time.
- Activation creates eligible `user_events`, stamps the 10-minute close time,
  publishes socket events, and queues push work in one transaction.
- A second one-shot alarm closes the event and chains preparation of the next one.
- There is no recurring cron dispatcher, due-event poller, or expiration sweep.
- Cloudflare Queue relays transactional outbox records to Ably immediately.
- Launch, foreground, and socket reconnect reconcile Postgres through React Query.

See [docs/REALTIME_ARCHITECTURE.md](docs/REALTIME_ARCHITECTURE.md).

## Required server deployments

Supabase Edge Functions: `schedule-daily-challenge`, `orchestrate-doji`,
`relay-domain-events`, `realtime-token`, `notify-user`, and `delete-account`.

Cloudflare Worker: `infra/doji-orchestrator`.

Apply migrations, deploy the Edge Functions and Worker, configure Vault/secrets, then
invoke `schedule-daily-challenge` once. Later events chain automatically.

## Time and participation

The proposed drop time is selected inside the continental-US window (10:00 Pacific
through 22:00 Eastern). Authorization always uses the database clock. Users have
exactly 10 minutes after activation; the server rejects participation after close.

## Notifications

Connected clients receive Ably events immediately. Background/killed clients receive
Expo push from the same committed outbox event. Foreground/reconnect always reconcile
authoritative state, so correctness never depends on OS push delivery.

## Media

Native uploads use `expo-file-system` `ArrayBuffer` payloads for Supabase Storage.
Media paths are user-scoped and enforced by storage policies.
