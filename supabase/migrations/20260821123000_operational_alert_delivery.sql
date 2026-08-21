-- Durable, server-only idempotency for operational alert email delivery. The
-- Worker checks every minute and queue consumers can report their final retry;
-- one issue family should produce at most one email per hour.

create table if not exists public.operational_alert_deliveries (
  idempotency_key text primary key,
  issue_family text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.operational_alert_deliveries enable row level security;
revoke all on table public.operational_alert_deliveries from public, anon, authenticated;

create index if not exists operational_alert_deliveries_created_idx
  on public.operational_alert_deliveries (created_at);

comment on table public.operational_alert_deliveries is
  'Private hourly idempotency receipts for Resend-backed operational alerts.';
