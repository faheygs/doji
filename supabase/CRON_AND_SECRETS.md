# Event orchestration and secrets

The filename is retained for old links. Doji no longer uses recurring pg_cron jobs
for challenge preparation, dispatch or expiration. Migration
`20260811120000_authoritative_realtime.sql` retires the old schedule, dispatcher
and expiration jobs.

Separately approved safety-alert and moderation-media recovery jobs do exist; the
[September 29 safety release](../docs/SAFETY_LAUNCH_2026-09-29.md) documents their
five-minute due-work checks. Do not remove those jobs based on the old blanket
"no recurring jobs" wording. The Cloudflare health monitor also has its own
one-minute trigger, distinct from challenge dispatch.

New developers should start with [Local development](../docs/LOCAL_DEVELOPMENT.md)
and [Testing and releases](../docs/TESTING_AND_RELEASES.md), not linked production
commands or secret rotation. This file lists orchestration secrets, not the entire
employee/business/safety configuration inventory; see [Service catalog](../docs/SERVICE_CATALOG.md).

## Event chain

1. `schedule-daily-challenge` calls the locked `prepare_next_daily_event` RPC.
2. It registers the returned exact fire time with the Cloudflare Durable Object.
3. Twenty minutes before `fires_at`, the alarm clears the prior feed and publishes
   the safe coming-soon state transactionally.
4. At `fires_at`, the same alarm chain activates the event transactionally.
5. A transactional outbox wakes the singleton Cloudflare Durable Object relay, which
   publishes identifier-only Ably events and advances durable push fanout immediately.
6. The close alarm marks misses and chains preparation of the next event.

There is no due-event poll, recurring dispatcher, or recurring expiration sweep.

## Supabase Edge secrets

| Secret                                | Used by                                                |
| ------------------------------------- | ------------------------------------------------------ |
| `ABLY_API_KEY`                        | `realtime-token`, `relay-domain-events`                |
| `OUTBOX_RELAY_SECRET`                 | Edge relay and Cloudflare Durable Object worker        |
| `DOJI_ORCHESTRATOR_URL`               | Event preparation and outbox wake configuration        |
| `DOJI_ORCHESTRATOR_SECRET`            | `schedule-daily-challenge`, `orchestrate-doji`, Worker |
| `SUPABASE_SERVICE_ROLE_KEY`           | Supabase Edge Functions only                           |
| `RESEND_API_KEY` / `ADMIN_FROM_EMAIL` | Moderation and operational alert email                 |

## Cloudflare Worker secrets

| Secret                          | Use                                                     |
| ------------------------------- | ------------------------------------------------------- |
| `SUPABASE_URL`                  | Edge Function, REST, Auth, and JWKS base URL             |
| `SUPABASE_ANON_KEY`             | RLS-bound REST requests from the authenticated read tier |
| `SUPABASE_JWT_SECRET` optional  | Legacy HS256 verification only; omit with JWKS signing   |
| `ORCHESTRATOR_SECRET`           | Durable alarm registration endpoint                     |
| `OUTBOX_RELAY_SECRET`           | Durable relay and Edge Function authentication           |
| `SENTRY_DSN`                    | Final Cloudflare alarm/relay failure diagnostics         |

Cloudflare must never receive the Supabase service-role key.

`ORCHESTRATOR_SECRET`, `DOJI_ORCHESTRATOR_SECRET`, and the Postgres Vault value
`doji_orchestrator_secret` are one credential with three registrations. Rotate them
together with `scripts/sync-production-orchestrator-secret.ps1`; the command fails
unless both the direct Worker wake and the exact Vault-backed `pg_net` wake return
HTTP 200. Never update only one registration.

The Worker sends degraded health and final durable-retry alerts to the protected
`send-admin-email` Edge Function using its existing `OUTBOX_RELAY_SECRET`.
`operational_alert_deliveries` deduplicates each issue family to one email per hour;
no separate third-party webhook secret is required.

## Verification and rotation are different operations

Read-only operational verification checks that no retired challenge-dispatch
`doji_*` jobs remain, outbox rows publish promptly, no shard remains unfinished at
launch expiry, and no one-shot event alarm needs repair. Preserve the separately
approved safety/media recovery jobs. Use bounded authorized reads; do not print
Vault values or invoke an event as a diagnostic.

`scripts/sync-production-orchestrator-secret.ps1` **rotates production credentials**.
It is not a verification-only command and requires explicit approved scope. The
linked database lint/migration dry-run commands also require confirmation of the
target and current migration ledger; they are not local onboarding steps. Never
follow a dry run with an unreviewed migration push.
