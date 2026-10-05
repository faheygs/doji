# Local development

Start from [Developer onboarding](DEVELOPER_ONBOARDING.md). These instructions
separate offline UI work from development that needs an isolated backend. They do
not provision a complete staging environment or authorize production access.

## Prerequisites and first checks

- Git and Node.js **24**, matching the current CI major. The owner workspace is
  verified on **24.18.0**. Converted `.mts` tooling uses native type stripping;
  run the separate strict compiler checks as well. This does not change the
  store-build runtime configuration or qualify historical scripts on every Node version.
- npm and the committed lockfiles. Root `.npmrc` does not enable legacy peer deps.
- Chrome for local portal Playwright runs; the test configuration uses Chrome
  outside CI. Playwright browser installation is a separate prerequisite in CI.
- Android Studio/JDK/emulator for a local Android native build; macOS/Xcode for a
  local iOS native build. Windows cannot run `expo run:ios`.
- A container runtime and the approved database fixture only for database tests;
  Deno for Edge checks; provider access only when the assigned task requires it.

From the repository root:

```powershell
git status --short
node --version
npm ci
npm ci --prefix infra/portal-identity-candidate
npm ci --prefix infra/doji-orchestrator
npm run test:admin-auth
npm run test:admin-health
```

`npm ci` installs dependencies and their allowed install hooks; it is not a cloud
deployment. Do not replace it with an upgrade or blanket `npm audit fix`.
For mobile unit tests and static checks, see [Testing and releases](TESTING_AND_RELEASES.md).

## Fastest safe portal preview: offline prototype

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

## Database and identity tests

The repository is not yet a one-command reproducible full-app staging stack.
Some individually released SQL is still under `docs/drafts`, while migration
history and retained local fixtures need reconciliation. `supabase/config.toml`
alone does not reproduce the deployed database, vendor secrets or WorkOS setup.

- Do not run `supabase link`, `db push`, remote SQL or all draft files as onboarding.
  An existing `.temp` link may target production.
- [Local employee test environment](LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md) documents
  the owner's isolated Podman/WSL, database-only fixtures and allowlisted projects.
  Some scripts depend on exact Windows paths or retained `test-results` fixtures;
  these are not guaranteed to exist in a clone.
- Read each test harness before running it. A filename containing `test` does not
  establish offline safety. Some use HTTP, provider APIs, Docker/Podman or installed
  SQL and can create synthetic accounts or email reservations.
- WorkOS staging provides isolated **identity** testing, not a hosted application,
  database, storage or notification staging environment.

Request a sanitized, versioned fixture and an explicit network allowlist before
testing full integration. Never clone member data into local development or
activate an actual daily event to make a test pass.

## Common problems

| Symptom | Check first |
| --- | --- |
| Dependency/engine mismatch | Node version, root lockfile and `.npmrc`; do not change peer-resolution policy blindly |
| Admin build fails before rendering | Required `.env.local`, public key/URL format, output-path guard and intended feature flags |
| Local portal has no real accounts | Prototype mode is deliberate; employee auth needs its own proxy/runtime, not a member JWT |
| Business root/identity route is missing locally | Static test server does not implement Pages redirects or the auth proxy; open the explicit static page for UI QA |
| Mobile backend unreachable | Loopback/device networking and whether the isolated backend actually exists |
| Test references missing SQL/absolute path | Retained fixture dependency; use the documented fixture handoff, not production |
| UI differs from the live site | Compare exact artifact flags and release record; source prototype is a separate surface |

Do not run the root `npm run format` over the owner's dirty worktree. Format only
files you changed, preserve unrelated work and report setup limitations honestly.
