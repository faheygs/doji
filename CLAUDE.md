# Doji agent reference

Read `AGENTS.md`, `DOJI_CONTEXT.md`, and `docs/REALTIME_ARCHITECTURE.md`
completely before changing the app. Those files are the authoritative product,
data, realtime, notification, scale, and UI contracts.

Do not infer current behavior from historical SQL migrations. Migrations are an
immutable record of how production reached its current schema; later migrations
retire and replace earlier objects.

The current notification pipeline has one producer: the transactional Postgres
domain-event outbox. `relay-domain-events` performs realtime and push delivery.
APNs/FCM is primary; Expo is only a bounded transport fallback for an older
installed client and cannot independently produce an alert. Do not reintroduce
direct row-trigger HTTP push, recurring dispatch/expiry polling, or client-owned
correctness.
