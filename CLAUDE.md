# Doji agent reference

Start with root `AGENTS.md`, the nearest scoped `AGENTS.md`,
`docs/SYSTEM_MAP.md` and `docs/CURRENT_STATE_AND_GAPS.md`. They identify the
mobile, React web, retained browser-adapter, portal-runtime and shared-service
boundaries, their test commands and release requirements. Use their current
guidance rather than an older dated rollout note or a directory name.
Do not duplicate a competing stack or policy description here.

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
