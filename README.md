# Doji

Daily social challenge app, public website, safety intake, employee admin portal,
business portal and shared infrastructure. Mobile uses Expo/React Native and
Supabase; delivery uses Cloudflare Durable Objects and Ably.

## Start here

**New developer: start with [Developer onboarding](docs/DEVELOPER_ONBOARDING.md).**

| Question | Guide |
| --- | --- |
| What is everything and how does it connect? | [System and code map](docs/SYSTEM_MAP.md) |
| Which vendors, dashboards and portals are involved? | [Service catalog](docs/SERVICE_CATALOG.md) |
| How do I run it safely? | [Local development](docs/LOCAL_DEVELOPMENT.md) |
| How do we test and release? | [Testing and releases](docs/TESTING_AND_RELEASES.md) |
| How do accounts, permissions and secrets work? | [Security and access](docs/SECURITY_AND_ACCESS.md) |
| What is live versus unfinished? | [Current state and gaps](docs/CURRENT_STATE_AND_GAPS.md) |
| Where are all the detailed records? | [Documentation index](docs/README.md) |

The TypeScript migration and regression suite were merged through
[PR #3](https://github.com/faheygs/doji/pull/3) on October 5, 2026 (`60df53a`).
Use a clean checkout of reviewed `main`; do not copy the owner's retained working
files or CLI caches. A source commit is not a production deployment. Member login stays
on Supabase Auth. Independent employee login is WorkOS; the business identity
transition is not complete. See the dated current-state guide before operations.

Read [DOJI_CONTEXT.md](DOJI_CONTEXT.md) before changing the product. It maps the
complete user journey, daily challenge lifecycle, screen responsibilities, data
model, atomic commands, realtime events, notifications, economy, moderation, UI
rules, and how every system connects. Transport/deployment details are in
[docs/REALTIME_ARCHITECTURE.md](docs/REALTIME_ARCHITECTURE.md).

## Local setup

Use [Local development](docs/LOCAL_DEVELOPMENT.md) and the placeholder-only
[.env.example](.env.example). Obtain an approved isolated environment, not the
owner's production `.env.local`. Never commit secrets.

| Variable | Use |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Mobile/web Supabase client |
| `EXPO_PUBLIC_COMMAND_GATEWAY_URL` | Authenticated atomic-command gateway; environment-specific |
| `EXPO_PUBLIC_SCALE_READ_URL` | Optional authenticated aggregate gateway; omit for free-mode direct reads |
| `EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED` | Use CDN feed/thumbnail variants after Storage image transforms are enabled |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | RLS-bound public client key |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional production error reporting |
| `EXPO_PUBLIC_APP_ENV` | Optional environment label |

Server-role, Ably API, relay, and orchestration secrets are server-only.

```powershell
git status --short
node --version
npm ci
npm ci --prefix infra/portal-identity-candidate
npm ci --prefix infra/doji-orchestrator
npm test -- --runInBand
npm run typecheck
npm run check:hygiene
npm run lint
```

Do **not** link or push a database as onboarding. This checkout may already be
linked to production. Some separately deployed SQL remains under `docs/drafts`;
bulk migration replay is not a safe way to synchronize it. The setup guide explains
local previews, development clients and database limitations.

## Authoritative realtime

Postgres owns all state. Ably messages announce committed changes and never replace
RLS-authorized reads. Core mutations are serialized, transactional, and idempotent.

- A one-shot Cloudflare Durable Object alarm activates each Doji at its exact time.
- Activation stamps the 10-minute close time, publishes socket events, and creates
  128 fixed push-shard records in one transaction. Per-account `user_events` are
  materialized lazily by authoritative reads or participation commands.
- A second one-shot alarm closes the event and chains preparation of the next one.
- There is no recurring cron dispatcher, due-event poller, or expiration sweep.
- A singleton Durable Object relay drains transactional outbox records to Ably
  immediately and schedules the next exact retry from durable database state.
- Launch, foreground, and socket reconnect reconcile Postgres through React Query.

See [docs/REALTIME_ARCHITECTURE.md](docs/REALTIME_ARCHITECTURE.md).

## Server architecture

Supabase Edge Functions: `schedule-daily-challenge`, `orchestrate-doji`,
`relay-domain-events`, `fanout-doji-push`, `realtime-token`, `delete-account`,
`send-admin-email`, `run-data-maintenance`, and `operational-health`.

Cloudflare Worker: `infra/doji-orchestrator` (alarms, relay, command gateway, and
authenticated scale-read cache).

This is not a complete function inventory or a deployment recipe. See the
[Service catalog](docs/SERVICE_CATALOG.md) for employee/business/safety handlers and
[Testing and releases](docs/TESTING_AND_RELEASES.md) for approved release boundaries.
Do not invoke scheduling or deployment commands simply to test a UI.

## Time and participation

The proposed drop time is selected inside the continental-US window (10:00 Pacific
through 22:00 Eastern). Authorization always uses the database clock. The standard
window is exactly 10 minutes after activation. Existing signup-day eligibility and
Sparks buy-in exceptions are server-authorized; clients cannot extend a deadline.

## Notifications

Connected clients receive Ably events immediately. Background/killed clients receive
APNs/FCM push from the same committed outbox event. Expo is a bounded transport
fallback for older installed builds only; it is not a separate notification producer.
Foreground/reconnect always reconcile authoritative state, so correctness never
depends on OS push delivery.

## Media

Media uses server-reserved private Supabase Storage paths and resumable TUS uploads.
Visible authorized content resolves short-lived signed URLs; persisted query data
must not retain signed bearer URLs. Image variants and capacity controls require
their own qualification. See [System and code map](docs/SYSTEM_MAP.md),
[Local heavy-load evidence](docs/LOCAL_HEAVY_LOAD_2026-09-28.md) and
[Current state and gaps](docs/CURRENT_STATE_AND_GAPS.md). Local simulations do not
prove 100,000 concurrent users or phone notification delivery.
