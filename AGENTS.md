# Doji agent instructions

Read `DOJI_CONTEXT.md` and `docs/REALTIME_ARCHITECTURE.md` completely before making
cross-screen, backend, realtime, notification, economy, profile, or challenge-flow
changes. They define how the product and system connect.

- Postgres is the source of truth.
- Use existing atomic, idempotent RPCs for writes; do not replace one command with
  multiple client writes.
- Realtime events contain identifiers and invalidate authorized TanStack Query reads.
- Add new server-owned data to targeted event handling and reconnect/foreground
  reconciliation.
- Challenge activation/close use durable one-shot alarms. Do not introduce recurring
  polling, scheduled handset behavior, or correctness that depends on push delivery.
- Preserve the 10-minute server-authorized participation window and direct-to-feed
  completion flow.
- Shared poll totals are global, while social alerts are friend-scoped.
- Public profile queries must use the explicit safe-field contract.
- Use shared UI, avatar/frame, light/dark theme, accessibility, and keyboard-safe
  components rather than screen-local substitutes.
- Update the context documents with any changed contract or connection.
