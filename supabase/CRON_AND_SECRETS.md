# Event orchestration and secrets

The filename is retained for old links. Doji no longer uses recurring pg_cron jobs.
Migration `20260811120000_authoritative_realtime.sql` retires the old schedule,
dispatcher, and expiration jobs.

## Event chain

1. `schedule-daily-challenge` calls the locked `prepare_next_daily_event` RPC.
2. It registers the returned exact fire time with the Cloudflare Durable Object.
3. Twenty minutes before `fires_at`, the alarm clears the prior feed and publishes
   the safe coming-soon state transactionally.
4. At `fires_at`, the same alarm chain activates the event transactionally.
5. A transactional outbox wakes Cloudflare Queue and publishes Ably/push immediately.
6. The close alarm marks misses and chains preparation of the next event.

There is no due-event poll, recurring dispatcher, or recurring expiration sweep.

## Supabase Edge secrets

| Secret | Used by |
| --- | --- |
| `ABLY_API_KEY` | `realtime-token`, `relay-domain-events` |
| `OUTBOX_RELAY_SECRET` | Edge relay and Cloudflare queue consumer |
| `DOJI_ORCHESTRATOR_URL` | Event preparation and outbox wake configuration |
| `DOJI_ORCHESTRATOR_SECRET` | `schedule-daily-challenge`, `orchestrate-doji`, Worker |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Functions only |
| `RESEND_API_KEY` / `ADMIN_FROM_EMAIL` | Moderation and operational alert email |

## Cloudflare Worker secrets

| Secret | Use |
| --- | --- |
| `SUPABASE_URL` | Edge Function base URL |
| `ORCHESTRATOR_SECRET` | Durable alarm registration endpoint |
| `OUTBOX_RELAY_SECRET` | Queue-to-relay authentication |

Cloudflare must never receive the Supabase service-role key.

The Worker sends degraded health and final queue-retry alerts to the protected
`send-admin-email` Edge Function using its existing `OUTBOX_RELAY_SECRET`.
`operational_alert_deliveries` deduplicates each issue family to one email per hour;
no separate third-party webhook secret is required.

## Verification

```powershell
npx supabase db lint --linked --level warning
npx supabase db push --linked --dry-run
```

Verify no `doji_*` jobs remain in `cron.job`, outbox rows publish promptly, and the
dead-letter queue remains empty.
