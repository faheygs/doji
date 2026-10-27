# Local development

Start from [Developer onboarding](DEVELOPER_ONBOARDING.md). These instructions
separate offline UI work from development that needs an isolated backend. They do
not provision a complete staging environment or authorize production access.

## Prerequisites and first checks

- Git and Node.js **24**, matching the current CI major. The owner workspace is
  verified on **24.18.0**. Converted `.mts` tooling uses native type stripping;
  run the separate strict compiler checks as well. All EAS build profiles pin
  **24.18.0** in `eas.json` for future Android/iOS builds; this does not change
  already-built binaries or qualify historical scripts on every Node version.
- npm and the committed lockfiles. Root `.npmrc` does not enable legacy peer deps.
- Chrome for retained `website/` Playwright runs outside CI. The React `web/`
  suite uses installed Playwright Chromium locally and in CI.
- Android Studio/JDK/emulator for a local Android native build; macOS/Xcode for a
  local iOS native build. Windows cannot run `expo run:ios`.
- A container runtime and the approved database fixture only for database tests;
  Deno for Edge checks; provider access only when the assigned task requires it.

From the repository root:

```powershell
git status --short
node --version
npm ci
npm ci --prefix infra/portal-identity
npm ci --prefix infra/doji-orchestrator
npm run test:admin-auth
npm run test:admin-health
```

`npm ci` installs dependencies and their allowed install hooks; it is not a cloud
deployment. Do not replace it with an upgrade or blanket `npm audit fix`.
For mobile unit tests and static checks, see [Testing and releases](TESTING_AND_RELEASES.md).

## Current React previews

Install the root packages above, then `npm ci --prefix web`. From the repository
root run each desired preview in its own terminal:

```sh
npm run dev:admin
npm run dev:business --prefix web
npm run dev:site --prefix web
```

The apps bind loopback at ports 4310/4311/4312. Defaults are disconnected preview
configuration, not permission to connect a production employee/business session.
For everyday admin UI work, `npm run dev:admin` opens the existing sample-data
workspace at `http://127.0.0.1:4310`: no account creation, password, MFA or env file.
The home page uses the synthetic Alex Morgan employee; preview actions do not
persist to the shared staging database. This is a UI preview, not backend acceptance.
Use `npm run dev:admin:staging` for connected development after receiving a
staging developer credential. The separate `dev:admin:staging-login` command and
hosted staging site retain real employee login and MFA.
The public Next app exports static files; there is no Next API/auth server.
Its retained safety compiler needs the locked `infra/doji-orchestrator`
dependencies even for a web-only build; that install does not run a Worker.
`npm run check --prefix web` validates types, lint, units, builds and artifacts.
`npm run test:browser --prefix web` needs installed Playwright Chromium and those
ports free. Package-only acceptance configs need their exact prepared artifacts.
Read [web agent guide](../web/AGENTS.md) and [site guide](../web/apps/site/AGENTS.md).

## Retained offline portal prototype / compatibility tests

The source `website/portal-config.mts` is a prototype with empty backend settings.
The loopback preview server compiles registered TypeScript browser sources at
their existing `.js` URLs; it does not serve raw TypeScript. Run:

```powershell
$env:DOJI_ADMIN_TEST_ROOT = 'website'
$env:DOJI_ADMIN_TEST_PORT = '4188'
node website/test-admin-server.mts
```

Open `http://127.0.0.1:4188/business-portal/` or
`http://127.0.0.1:4188/admin-portal/`. This is the design/sample-data prototype,
**not** the production business application or an authenticated employee session.
Confirm the source config has not been changed to live mode before running it.

Stop with Ctrl+C, then clear the shell overrides when finished:

```powershell
Remove-Item Env:DOJI_ADMIN_TEST_ROOT -ErrorAction SilentlyContinue
Remove-Item Env:DOJI_ADMIN_TEST_PORT -ErrorAction SilentlyContinue
```

The static server does not execute Cloudflare Pages `_worker.js` or implement its
identity proxy. It does not reproduce Pages redirects. A working static page is
not proof that authentication, routing or CSP works in the deployed environment.

## Safety form design preview

```powershell
node website/build-safety-preview.mts
$env:DOJI_ADMIN_TEST_ROOT = 'website/.safety-preview'
$env:DOJI_ADMIN_TEST_PORT = '4175'
node website/test-admin-server.mts
```

Open `http://127.0.0.1:4175/safety-removal/`. The builder produces a marked preview,
disables submission and leaves endpoint/site-key configuration empty. Do not
replace those values with production settings to test the form. No synthetic
public case, email or moderation action is part of visual QA.

## Admin and business build artifacts

The following are retained controller/compatibility packagers, NOT the current
React development entry. Current UI builds produce `web/apps/{admin,business}/dist`
and `web/apps/site/out`; the release assembly preserves verified proxy/config,
headers and safety/legal assets. Generic Vite/Next output alone is not a qualified
deployment package. See [frontend migration release](releases/REACT_PUBLIC_BUSINESS_MIGRATION_2026-10-09.md).

| Builder | Output/default | Important difference from production |
| --- | --- | --- |
| `node website/build-admin.mts` | `website/.admin-dist` | Reads `.env.local` unless public URL/key overrides are both supplied; emits live-mode client configuration. Feature flags and identity transport must match the intended artifact explicitly. |
| `node website/build-business.mts` | `website/.business-dist` | Public admission defaults disabled. Enabled artifacts require explicit endpoint, Turnstile and legal-version configuration; realtime remains disabled. |
| `node website/build-safety-preview.mts` | `website/.safety-preview` | Design-only form with backend disabled. |

Inspect the builder before invoking it. Existing output directories may contain
older artifacts; use an approved fresh output path where supported and inspect
the result. Do not deploy a generic local build over a live portal. The current
admin path allowlist restricts output to the default directory or an explicitly
named QA directory; do not remove that path safety check.

`npm run test:admin-e2e` runs the admin builder and then mocked browser tests. The
builder skips `.env.local` when both `DOJI_ADMIN_SUPABASE_URL` and
`DOJI_ADMIN_SUPABASE_ANON_KEY` are explicitly provided. In a fresh isolated
checkout, use public dummy/local values from [.env.example](../.env.example),
never a service key. Do not overwrite an existing owner file. Mocked browser
coverage must not silently fall through to production.

The admin builder also defaults `DOJI_ADMIN_API_BASE_URL` to the production
orchestrator. For an offline test artifact explicitly override it to the loopback
test endpoint and ensure mocks cover it. Do not open an unmocked live-mode local
artifact expecting it to be an offline demo; use the prototype above instead.

## Mobile configuration and running locally

Review [.env.example](../.env.example). Copy it to an absent `.env.local` using
your editor, then obtain the public URL/anon key for the approved local/test stack.
The placeholder key intentionally does not authenticate. Never obtain production
server secrets just to start Metro.

```powershell
npm start
```

Use a compatible development client. `npm run android` compiles a native Android
client using the installed local toolchain; `npm run ios` requires macOS. A web or
Expo Go preview is not acceptance evidence for native push, camera, background
behavior, signing or release-only failures.

`127.0.0.1` means the machine running the client. A physical phone or emulator
needs deliberately configured access to the test backend; changing the address
does not create that backend. Keep storage, realtime, callbacks and mail isolated
as well, rather than pointing missing dependencies at production.

**EAS profile names are not isolation.** The checked-in development, preview and
production profiles currently include the production orchestrator gateway URL.
Do not run an EAS development/preview build assuming it uses a staging backend.
Cloud builds also require separate approval and allowance checks.

## Hosted staging database

The database foundation is installed in project **`ohrcupagdoilkwhecict`**,
Free organization **doji-staging**, API
`https://ohrcupagdoilkwhecict.supabase.co`. Production remains
`tvixsmqxotuvyjqzmjla`; never substitute it for a missing development connection.

Free staging can pause after low database activity. A pause warning is not an
outage: check the project's dashboard/status first. If paused, restore that same
project in Supabase and verify staging sign-in/reads before development; never
redirect staging to production or recreate its baseline. Use genuine development
activity, not a keepalive cron. Guaranteed always-on capacity requires a separately
approved paid plan; see [Supabase's pause policy](https://supabase.com/docs/guides/platform/free-project-pausing).

- The baseline includes current deployed portal overlays, explicit privileges,
  RLS, three empty buckets, code-owned badge/shop data and two synthetic demo
  members plus two inactive challenges. Demo profiles intentionally do not appear
  through public profile reads. These fixture Auth rows have no login password.
- The 290 migration ledger entries describe a reconciled schema baseline, not a
  raw execution of all historical SQL against the hosted project. Do not reset it,
  replay old migrations or bulk-apply overlays. New changes need a reviewed diff
  against the actual staging schema and their own forward migration.
  The separately reviewed poll-activation fix adds entry 291; its staging voting,
  retry and timing regression passed. The baseline must still not be replayed.
- Member signup and email provider remain disabled. The staging employee runtime
  and separate local-development gateway use their own restricted SQL logins;
  employee realm/session settings are enabled;
  other runtime roles remain NOLOGIN. No production credentials, cron jobs, media
  or member identities were copied. Approved employee subjects are mapped separately
  to staging permissions. Isolated Ably is connected; real email/push remain disabled.
- Obtain named access to this **separate staging organization**. Production-org
  membership does not establish staging membership. Do not share the owner's
  credentials or put privileged keys into Vite/Expo public configuration.
- The same admin source is packaged for `admin-staging.dojipro.com` in separate
  Pages project `doji-admin-staging`; HTTPS and anonymous boundaries are verified.
  The WorkOS callback is configured; password sign-in and required MFA are verified.
  It uses the existing employee identity/password/MFA through a separate WorkOS
  application. Use the existing employee authenticator entry, not a factor from
  the retired independent staging directory. Gavin and Kedd have staging access;
  other employees require explicit staging grants. No second signup is needed.
  Invitations remain held until separately requested.
  Default local Vite remains an offline preview. The separate admin staging command
  below supplies a bounded loopback relay; hosted origin checks are unchanged.
  Business/mobile connections are separate.

### Admin-only staging scope

The current setup scope is the admin portal and its employee backend. Business,
public-site and mobile staging are deferred, not prerequisites for admin readiness.
The separate staging backend has its own Worker/five objects and eight guarded
Edge functions, including the configured but disabled admin email sender.
One-shot activation/close, voting/retry and Ably relay have passed
hosted synthetic acceptance; recurring jobs and real email/push remain off.
Never enable production scheduling, push or
member signup to fill a staging gap. See the [backend receipt](releases/STAGING_DATABASE_BASELINE_2026-10-14.md#staging-backend-foundation).
Keep invitations held until the environment is configured and the owner requests them.

For connected **admin frontend** development, after the locked installs above:

```powershell
npm run dev:admin:staging-login
```

Open `http://127.0.0.1:4313` and use your existing employee login/MFA after receiving
staging access. No `.env` file, Bitwarden token, WorkOS API key or database password
is needed for this frontend workflow. The Vite mode does not load env files.
The existing `dev:admin` command remains offline at port 4310.

This runs local React source against the **shared staging backend**, not an
isolated per-developer database. Intentional writes affect shared synthetic data.
Only five employee auth/session/RPC routes relay to the fixed HTTPS staging host;
the local server checks loopback address, Host, Origin and Fetch Metadata before
translating the request. It never forwards arbitrary targets or browser-supplied
provider credentials. MFA, CSRF, permissions and atomic commands remain upstream.
Hosted production/staging origin allowlists are not expanded to localhost.

Hosted cookies stay in bounded, expiring, per-browser memory jars. The local
HTTP-only, SameSite=Strict cookie contains a different random identifier. Loopback
HTTP is for a trusted developer machine only: never expose this server through a
tunnel, LAN binding or shared/untrusted host. A local process can inspect its own
memory/traffic. Sign out before stopping; restart discards jars but does not revoke
unexpired remote sessions. Unexpected/uncertain writes are not retried automatically.
This login mode uses hosted staff realtime and staging database health reads.
Hosted Sentry is configured for the isolated staging project; its signed-in UI
acceptance passed. Automatic health collection remains disabled.
The separate impersonation mode below also supports scoped staging resources. No polling is added.

`npm run test:admin-staging:browser --prefix web` verifies the actual browser and
relay using synthetic upstream responses only. It requires installed Playwright
Chromium and free port 4313. This is not hosted WorkOS/SQL acceptance; owner
password/MFA and representative hosted workflows were separately verified October 16.

Build the admin staging site from source, without the owner's old release folders
or `.env.local`, after installing the locked root, web and Worker dependencies:

```powershell
$stagePackage = Join-Path $env:TEMP ('doji-admin-' + [guid]::NewGuid())
npm run test:admin-staging
npm run build:admin-staging -- $stagePackage
```

The new output directory must be outside the repository with an existing parent.
The build refuses to overwrite it, runs the connected bundle gates, then produces
`site/` and a public-only SHA-256 `manifest.json`. Temporary compiler output is
removed automatically. Retain a deployed package for rollback; remove disposable
packages after testing. The build does not deploy, read secrets or send mail.

The staging-only Pages entry rejects any other host, origin or Supabase endpoint.
Only the `doji-admin-staging` project with the recorded staging bindings can serve
it; keep its proxy secret in Cloudflare, not the build or browser. Its primary
deployment is staging even though Pages calls that slot "production". Alternate
Pages preview hosts are not authorized login environments. Do not deploy this
package to `doji-admin` or change the existing production package command.

Remaining admin readiness work: reproducible employee-backend packaging/config
checks; staging deploy/rollback access and scoped backend secret handoff; and hosted
broader end-to-end permission/provider acceptance. Login, idea review/history/audit,
report assignment and business assignment are verified. Hosted staff realtime and
two-tab restoration/queue reconciliation passed. Platform health reads staging
database metrics and isolated Sentry issues. Recurring collection and archived
delivery summaries remain unqualified. A package build
does not establish these checks, and staff onboarding is not their substitute.

The exact baseline, verification, known test differences and recovery artifact are
recorded in [staging acceptance](releases/STAGING_DATABASE_BASELINE_2026-10-14.md).
The repo still does not provide a one-command fresh hosted/full-stack restore.

### Admin deployment workflow

Release source: `.github/workflows/admin-staging.yml` and `admin-production.yml`.
GitHub environments exist and permit only the `main` branch; production requires
`faheygs` approval with admin bypass disabled. The owner can approve their own
manual dispatch. Separate account-owned Pages Write tokens and the account ID are
configured in both environments. PR #15 is merged and activation is enabled.
The first automatic staging release passed on October 16 (run `38947921226`,
source `e347f4f`). Owner-approved production promotion passed October 24 (run
`40134309699`); see current state for the exact artifact and rollback. Every new
production promotion remains approval-gated. Current frontend code has passed the
PR/main pipeline; use the successful staging run identified in current state,
not a manually packaged backend artifact or an older Quality gates run.

Release flow:

1. Develop locally, open a PR and merge only after exact-head quality checks pass.
2. Successful **Quality gates** on main triggers **Admin staging**. Only admin or
   shared admin dependency changes since the last successful deployment package
   a release. Business-only/mobile-only/SQL changes skip it. Repository quality
   checks still cover the monorepo; they are not deployments of the other apps.
3. Test `https://admin-staging.dojipro.com`. Record its successful **Admin staging**
   run ID, not the Quality run ID. Hosted staging retains login/MFA.
4. In GitHub Actions, choose **Admin production → Run workflow → main** and enter
   that staging run ID. Review the source SHA and approve the production environment.
   The saved production package uses the same compiled frontend as staging; no rebuild.

Only the admin Pages frontend and its same-origin employee proxy are released.
No database, Edge runtime, shared Worker, business/site or mobile deployment runs.
Backend contract changes need their own approved rollout before dependent UI.
`build-admin-release.mts` requires a clean exact-SHA checkout, ignores env files,
and emits public manifests and two target-pinned packages outside the repository.
The local development gateway and impersonation UI are excluded from hosted assets.

Each GitHub environment has `CLOUDFLARE_API_TOKEN` as a secret and
`CLOUDFLARE_ACCOUNT_ID` as a variable; runtime keys stay in Cloudflare/Supabase.
Cloudflare account-owned tokens `doji-admin-staging-github` and
`doji-admin-production-github` expire January 14, 2027. Rotate each into its own
environment before expiry; verify the replacement before revoking the old token.
The activation variable `ADMIN_DEPLOYMENTS_ENABLED` is already true. Verify current
capacity, project bindings, hosted acceptance and rollback before each release.
Pages Write is account-scoped, not project-isolated. The workflows' fixed targets
do not restrict what a stolen token could access. No DNS, email, SQL or shared
Worker permissions were added. Both tokens have been exercised: production run
`40134309699` promoted staging run `40117275364` after owner approval. This verifies
the Pages path, not deployment of the separate backend/database boundaries.

Artifacts/receipts expire after 14 days. An expired or unsuccessful staging run
cannot be promoted; stage a new reviewed release. Each receipt records the prior
Cloudflare deployment ID. On an inconclusive release, inspect the receipt and
Cloudflare before retrying; rollback uses the recorded deployment in the same Pages
project under explicit approval, not a rebuild or database rollback. Runtime flags
and bindings are checked for drift and never updated by these workflows.

Offline workflow checks:
`node --test scripts/test-admin-release.mts scripts/test-admin-release-ci.mts`.

### Local developer impersonation

The source now connects local React to the shared staging database using a
per-developer credential and active staging employees, without MFA
prompts. Hosted staging still uses WorkOS login/MFA. The staging gateway is enabled
and the owner's credential is installed privately on this machine. Other developers
need their own approved credential; no credential is bundled in the repo.

Deployed in staging: `admin_development_employees_v2.sql` makes active staging
employee records (name, verified contact, roles and mapped identity) drive the
selector. An explicitly granted `employee_directory_access` on a developer
credential permits choosing those employees; existing credentials default to
false and retain only their old grants. No extra persona record is needed for a
new employee. Every command rechecks access, identity revocation and employee
status. The picker refreshes on opening, supports up to 100 employees and fails
explicitly rather than silently hiding overflow. Its internal `personas` wire
name remains for compatibility; it is not another identity source.

Only the owner's token currently has directory-wide access. No token is granted
broader access merely by installing the overlay. The separately deployed
`employee_shared_staging_v1.sql` pins the shared employee issuer and staging
application audience. Existing verified WorkOS subjects map to separate staging
employees; this is not an automatic production-role sync or email-based identity
match. Do not replay the applied overlays. Retaining rollback order is shared
identity cutover, directory v2, then development v1; access stays disabled until
reviewed re-enablement. All retain employee/audit records.

Developer credentials may be non-expiring (`expires_at = 'infinity'` in the private
staging credential registry). They remain individually revocable: disabling the
credential denies subsequent directory, session and command requests. Do not use
a distant invented expiration date or change hosted session/MFA lifetimes. Only an
explicitly approved handoff may provision a credential; Kedd's handoff is held
until the complete workflow is accepted.

After your credential is issued:

1. Complete the locked installs above. Obtain your **own**
   `DOJI_ADMIN_DEVELOPMENT_TOKEN` through the approved restricted vault; do not
   use another developer's token or a database/WorkOS/service-role key.
2. Have the vault inject that variable into your shell, or save a private file
   containing only `DOJI_ADMIN_DEVELOPMENT_TOKEN=<your issued value>` at
   `%LOCALAPPDATA%\Doji\admin-development.env` on Windows, or
   `~/.config/doji/admin-development.env` on macOS/Linux. Limit file access to
   your OS account. A different **absolute path outside the repo** can be set in
   `DOJI_ADMIN_DEVELOPMENT_ENV_FILE`. Never use `VITE_*` or commit this file.
3. Run `npm run dev:admin:staging`, open `http://127.0.0.1:4313`, select a user in
   the dialog and click **Impersonate User**. The yellow **DOJI STAGE** strip identifies
   this environment. No password or MFA prompt is involved in this local path.
4. Use the avatar menu's **Impersonate user** action to switch. Cancel leaves the
   current workspace unchanged; confirmation discards private caches/drafts,
   fences pending requests and reloads the portal home page. Commands are never automatically retried. Reload
   restores the currently selected local session. Stopping Vite discards local
   sessions; revoking/expiring the developer credential denies subsequent reads/writes.

The token stays in the local Node server. Only the fixed staging development Edge
endpoint receives it over HTTPS; SQL receives its digest, not the bearer value.
The browser gets an opaque HTTP-only local cookie and persona-scoped CSRF value.
Do not expose Vite through a tunnel, LAN binding or shared machine. Localhost is
not a security boundary against other processes running as your OS user.
No new provider, dependency or subscription is introduced. Writes affect shared
synthetic staging data. Permission-checked media signing and subscribe-only realtime
use staging storage and its isolated Ably app. Monitoring and outbound delivery
remain incomplete; this is not an offline demo or a full production-service clone.
Signing rechecks the developer/persona before returning results. Previously issued
media URLs and realtime grants expire after five and fifteen minutes respectively;
revocation does not retroactively erase an already issued capability.

The database foundation is `supabase/overlays/admin_development_v1.sql`, assembled
by `scripts/build-admin-development-sql.mts` from reviewed function definitions.
The assembler pins each changed definition and preserves all permission/command
logic. The raw template refuses installation without its manifest. The private
gateway uses distinct development assurance, explicit employee grants, revocable
hashed credentials and a transaction-scoped authorization context; it records
developer/persona attribution without storing credentials or request bodies.

Run `npm run test:admin-development` and
`npm run test:admin-development:database` (the latter needs the existing local
container engine/images; it creates and removes a network-disabled test database).
`npm run test:admin-staging:browser --prefix web` covers both local modes with
synthetic gateways. For the persona flow through actual disposable PostgreSQL,
set `DOJI_ADMIN_DATABASE_E2E=1` and run that browser command with
`-- admin-development.spec.ts`; unset it afterward. The test container has no
network or host mounts and is removed afterward. No test provisions hosted users,
sends mail or reads secrets. The SQL template is disabled by default and does not
provision credentials/personas/login itself. The separately approved hosted release
now provides **Gavin Fahey** and **Kedd** with approved staging Super Admin roles;
the previous synthetic employee identities are inactive, retained for audit.
Intentional writes affect shared staging data. The owner's initial credential expires January 13, 2027 and can
be revoked earlier. Bitwarden distribution and additional developer tokens are
not yet provisioned. See the [staging release record](releases/STAGING_DATABASE_BASELINE_2026-10-14.md).
The restricted gateway must use its own NOINHERIT SQL login with connection limit
2, verified TLS, no role/DB creation or RLS bypass, and only membership in
`doji_staging_development`. Verify parameter/error logging does not retain private
payloads; no application logging of headers, credentials or raw driver errors.
Never distribute its database login to developers. The retaining
rollback disables access before restoring definitions and refuses newer drift.

## Database and identity tests

The repository is not yet a one-command reproducible full-app staging stack.
Some individually released SQL is still under `supabase/overlays`. The hosted
staging baseline reconciles that deployed schema, but does not convert those
overlays into an ordered fresh-clone migration stream. `supabase/config.toml`
alone does not reproduce the deployed database, vendor secrets or WorkOS setup.

- Do not run `supabase link`, `db push`, remote SQL or all draft files as onboarding.
  Supabase `.temp` link/cache files are no longer versioned. Existing owner
  checkouts can still have an ignored production link; inspect locally before
  any separately authorized CLI operation. Removing files from Git does not
  unlink an existing checkout or revoke provider access. Historical release
  scripts intentionally fail closed without their explicitly verified link.
- [Local employee test environment](LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md) documents
  the owner's isolated Podman/WSL, database-only fixtures and allowlisted projects.
  Some scripts depend on exact Windows paths or retained `test-results` fixtures;
  these are not guaranteed to exist in a clone.
- Read each test harness before running it. A filename containing `test` does not
  establish offline safety. Some use HTTP, provider APIs, Docker/Podman or installed
  SQL and can create synthetic accounts or email reservations.
- A WorkOS test environment alone is not an application/database staging stack.
  Admin staging now shares employee identity through a separate application and
  uses its own Supabase database; business/mobile integrations remain separate work.

Request a sanitized, versioned fixture and an explicit network allowlist before
testing full integration. Never clone member data into local development or
activate an actual daily event to make a test pass.

## Common problems

| Symptom | Check first |
| --- | --- |
| Dependency/engine mismatch | Node version, root lockfile and `.npmrc`; do not change peer-resolution policy blindly |
| Admin release build fails | Locked root/web/Worker dependencies, Node 24, clean exact-SHA checkout and new external output directory; release builds do not load `.env` files |
| Local portal has no real accounts | Prototype mode is deliberate; employee auth needs its own proxy/runtime, not a member JWT |
| Business root/identity route is missing locally | Static test server does not implement Pages redirects or the auth proxy; open the explicit static page for UI QA |
| Mobile backend unreachable | Loopback/device networking and whether the isolated backend actually exists |
| Test references missing SQL/absolute path | Retained fixture dependency; use the documented fixture handoff, not production |
| UI differs from the live site | Compare exact artifact flags and release record; source prototype is a separate surface |
| Workspace cannot open after a deployment | An old tab may reference a removed lazy-loaded asset. Use Reload workspace once to load the current release; the verified staging session restores without another login. If it persists, inspect the failing asset/request rather than changing credentials. |

Do not run the root `npm run format` over the owner's dirty worktree. Format only
files you changed, preserve unrelated work and report setup limitations honestly.
