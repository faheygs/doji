# Infrastructure boundaries

Read root AGENTS and both context documents completely. These folders include
LIVE services. A source commit is not deployment.

- `doji-orchestrator/`: separate npm package/lock, Cloudflare Worker and five
  Durable Objects. Owns member gateways, one-shot event alarms, outbox relay,
  push fanout, maintenance and health. Install here with npm ci; run
  `npm run typecheck`. Shared changes need explicit member-impact approval,
  exact bindings/namespace preservation, regression tests and retaining rollback.
- `portal-identity/`: separate package/lock (`jose`, `pg`), strict
  TypeScript. Live independent employee AND business WorkOS runtimes, browser
  adapters, same-origin proxies and restricted SQL. Root `npm run typecheck:portals`
  validates it. Member identity remains Supabase Auth; same email is not identity.
- `business-email/`: business-only sender preparation/runtime
  support, checked by root tooling project. Gate state comes from release records,
  not the folder name. Never enable automatic capture/sending/wakeup during cleanup.

Keep host-only opaque portal sessions, exact realm/subject/MFA proof, explicit
operation allowlists, short SQL transactions and lease fencing. Do not hold a DB
transaction across provider HTTP. Preserve ambiguous reset/send fences and stable
idempotency keys; cancellation does not prove remote rollback. No automatic resend.
Never print runtime JSON secret configurations, keys, cookies, URLs with tokens,
database credentials or raw provider bodies. Use bounded safe diagnostic categories.

Runtime code is assembled into named Edge/Pages artifacts by reviewed scripts;
raw folder deployment can omit modules. See docs/SERVICE_CATALOG.md and the exact
release record. Offline tests are allowlisted in scripts/run-offline-coverage.mts;
historical test/apply scripts may contact real providers. Do not run wildcards.
