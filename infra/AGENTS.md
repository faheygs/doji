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

Employee staging uses `admin-staging.dojipro.com`, Pages `doji-admin-staging`,
Supabase `ohrcupagdoilkwhecict` and its separate WorkOS application/client in the
shared employee directory. Pin both the shared issuer and staging client/audience;
employee credentials are shared, database grants and sessions are not. The proxy/runtime
reject mixed staging/production connections. Keep realtime/monitoring disconnected
until separately qualified; see the current state and service catalog for acceptance.
`employee-staging-pages-worker.mts` is the staging-only package entry; it rejects
production bindings and alternate hosts before forwarding. Do not replace the
production entry with it. Business/mobile/site staging are outside the current scope.
`employee-production-pages-worker.mts` is the production-only counterpart. The
admin GitHub release workflows package these Pages proxies and React admin only;
they must never deploy employee Edge/SQL, the development gateway or shared Worker.
Runtime secrets stay hosted; deployment-token setup and activation are separate.

`admin-development.mts` is a separate, deployed staging-only gateway for local
developer personas. It uses a restricted private SQL login and revocable developer
tokens, not WorkOS/member credentials or fabricated MFA. Keep exact project/route
fences, bounded connections/timeouts, digest-only SQL parameters and safe errors.
It is not part of the ordinary employee runtime or a production deployment.
