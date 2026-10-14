# Database and Edge requirements

Inherit root instructions; read the full product/realtime contracts before changes.
Postgres owns state, authorization, atomic commands, receipts and the outbox.

- `migrations/` is immutable ordered history, not a description of current runtime
  objects. New fixes are additive; never edit an applied migration as cleanup.
  Some individually deployed overlays are under supabase/overlays: never bulk apply them
  or assume `supabase db push` safely reconstructs current production.
- `functions/` uses Deno TypeScript; `_shared` is server-only helper source. Named
  handlers need explicit auth/origin/gate checks even with verify_jwt=false.
  Portal runtime artifacts include reviewed infra modules; package them explicitly.
- `tests/` plus scripts/database provide synthetic, isolated SQL/RLS/concurrency
  regressions. Root `npm run test:database:prepare` downloads pinned images;
  `test:database` and `test:database:repro` use owned local disposable containers.
  This is not a complete WorkOS/storage/realtime staging environment.

Use exact grants, fixed search_path, bounded keyset reads, stable idempotency keys
and one atomic command per intent. Preserve private evidence, historical actors,
retention holds, permissions and member eligibility. ID-only hints are committed
in the same transaction and consumed through authorized reconciliation.
Preserve terminal push/email claims after ambiguous provider outcomes. No direct
row-trigger push, broad service-role access, handset correctness or recurring
challenge poller. Member Auth cannot depend on portal WorkOS/roles/availability.

Do not link/reset/push a remote project, invoke functions, activate events or run
historical release SQL as a test. Shared releases require explicit scope approval,
member regression, current-state fingerprints and data-retaining rollback.
`.temp`, keys and captured SQL/provider evidence stay local and out of Git.
