# Doji agent instructions

## Start here and source ownership

Use reviewed `main` and inspect `git status` before editing. Do not copy an older
owner checkout over newer source. Read `docs/CURRENT_STATE_AND_GAPS.md` for
recorded release status, `docs/SYSTEM_MAP.md` for the repository map, and the
nearest scoped `AGENTS.md`. Historical release notes are evidence, not commands
to rerun. Source merged does not mean deployed.

| Boundary | Maintained source / stack |
| --- | --- |
| Member mobile | `app/`, `components/`, `hooks/`, `lib/`, `contexts/`, `stores/`, `contracts/`; Expo 57, React Native 0.86, React 19.2, Expo Router, TanStack Query, Zustand |
| Web workspace | `web/`; separate npm lock/workspaces, React 19.3, MUI 9, TanStack Query 5; Vite 8 admin/business, Next.js 16 static public site |
| Shared web UI/data | `web/packages/ui`, `web/packages/portal-data`; Doji theme, standard MUI controls, session-scoped authorized reads |
| Retained browser adapters | `website/`; typed auth/application/safety controllers, legal content and release packagers still imported by React; not disposable legacy code |
| Portal server | `infra/portal-identity/`; independent employee and business WorkOS/session runtimes |
| Shared server | `supabase/` Postgres/RLS/RPC and Deno Edge; `infra/doji-orchestrator/` Cloudflare Worker/Durable Objects |
| Tools and verification | `scripts/`, `__tests__/`, `__mocks__/`, `supabase/tests/`, web/website browser suites; synthetic fixtures are required regression inputs |

Node 24 and committed lockfiles are required. Root and `web/` have separate React
versions/toolchains; never flatten their dependencies. Maintain TypeScript
(`.ts/.tsx/.mts/.cts`), not new hand-written JavaScript. Native Node type stripping
does not replace strict typechecking. Only the two verified bootstrap/compatibility
JS artifacts are versioned exceptions. Exact versions come from package/lockfiles.

## Development, design and completion requirements

- Install root, `infra/portal-identity`, `infra/doji-orchestrator` and,
  for web work, `web` with their own `npm ci`. Use `docs/LOCAL_DEVELOPMENT.md`.
- Mobile uses shared theme, avatar/frame, keyboard-safe and accessible UI.
  Portals use standard MUI behavior with the centralized Doji orange/violet
  theme: desktop-first workspaces, full-page records, contextual menus,
  labelled empty/error/loading states and bounded TablePagination. Do not restore
  cramped record drawers, six custom MFA boxes, screen-local control replacements
  or duplicate active/history queues. Keep filters/ownership semantics explicit.
- Preserve immutable uncertain command payload/key for explicit identical retry;
  never automatically retry a consequential write or label failed reads empty.
- Test with synthetic fixtures and deny unmocked external requests. Do not use
  real members, send emails, or open paid resources to make tests pass. Read scripts
  first: `test`, `prepare` and `candidate` names do not prove safety.
- Before merge run relevant tests plus root typecheck/lint/size/hygiene gates and
  separate web checks for web changes. CI jobs are `application`, `coverage`,
  `database`, `web-migration`; preserve all 17 independent 90% coverage budgets.
  See `docs/TEST_SUITE_HANDOFF.md` for commands and limitations.
- Main uses pull requests and passing exact-head checks. No force push, bypass,
  unaudited bulk staging, blanket `npm audit fix`, remote SQL, cloud build or
  deployment is implied by a source cleanup/merge request.
- Keep credentials, provider responses, native builds, caches and private evidence
  untracked. Remove tests/mocks only with proven retirement of their contract.
  Preserve migrations, rollback records and evidence holds. Document removals,
  recovery and validation; never recursively delete owner worktrees.
- Keep current guidance concise. Dated release/rollback evidence belongs in
  `docs/releases`, reviewed executable SQL in `supabase/overlays`, and published
  business legal inputs in `docs/legal`. Do not recreate `docs/drafts` or append
  task diaries to the product/realtime contracts. Link retained records through
  directory indexes and verify `npm run check:hygiene`.
- Update current-state/system-map/scoped instructions when ownership, stack,
  entry points or requirements change. Keep rollout history distinct from current
  guidance; verify live flags before any independently authorized release.
- Keep `docs/SERVICE_CATALOG.md` current when adding, replacing, retiring or enabling
  any external service. Name its purpose, affected surface, source owner, account/
  environment, secret-storage location and current/gated/legacy/dev-only status.
  Include capacity/release/rollback requirements; never commit credential values.

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
