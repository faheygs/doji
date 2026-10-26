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

Hosted staging is `ohrcupagdoilkwhecict`, never production `tvixsmqxotuvyjqzmjla`.
Read `docs/LOCAL_DEVELOPMENT.md#hosted-staging-database` before connected work.
Its migration ledger represents a reconciled schema baseline including deployed
overlays; do not replay/reset history. The staging employee runtime and restricted
developer gateway logins are enabled. Approved isolated lifecycle/realtime services
are recorded in current state; keep other runtime roles and external integrations
disabled until separately approved. Never substitute production keys.

`admin_development_v1.sql` is a disabled staging-only preparation template, not a
production migration. Assemble it from reviewed exact definitions with
`scripts/build-admin-development-sql.mts`; preserve its hash checks and retaining
rollback. Development proof is not MFA. Tokens/persona grants and the private
gateway login must never be exposed to member roles or hosted portal sessions.
The resource upgrade builder pins existing media/channel permission definitions
and adds only private authorization routes. Signing stays in the separate staging
gateway, not SQL; direct callers retain no execution grant on its private helper.

`admin_development_employees_v2.sql` is the deployed staging-only directory upgrade;
employee records replace duplicate persona registration for explicitly authorized
developers. `employee_shared_staging_v1.sql` performs the exact approved shared
issuer/staging-audience cutover, preserving old identities and the immutable-realm
guard. Never generalize that guard or replay these applied overlays. Retaining
rollback order: shared-employee cutover, directory v2, development v1; access stays
disabled until separately reviewed reactivation.
