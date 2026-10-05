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

## Portal / member-app isolation (standing owner requirement)

- Member-app authentication remains on Supabase Auth. WorkOS is only for independent
  employee/business identities; never migrate member login, passwords, recovery,
  MFA or sessions to WorkOS as part of portal work.
- Treat the admin portal and member app as separate change and deployment boundaries.
  Routine portal work must not change member behavior, availability, sessions, or performance.
- Keep portal UI, authentication/session lifecycle, reads, and administrative commands
  scoped to portal-only contracts. Portal logout/lock must never revoke mobile sessions.
  Member reads and realtime authorization must not depend on portal roles or availability.
- Do not bundle mobile, shared Worker, database/RLS, member RPC, realtime, push, or
  release-policy changes into a portal deployment. Where a shared-system change is
  necessary, stop and explain the member impact, isolation plan, regression tests,
  deployment and rollback plan; obtain explicit approval for that separate scope.
- Use bounded, authorized monitoring reads; do not add portal polling or expensive
  queries that compete with member traffic without an approved impact review.
- Intentional, authorized moderation actions may affect the specific member/content
  through existing atomic audited commands. UI or monitoring work must not trigger them.
- Shared infrastructure still exists: do not claim physical isolation or zero risk.
  Verify the relevant member contracts before releasing any approved shared change.
