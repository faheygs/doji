# Local employee-release test environment

## Current repeatable database tests

For new development, use Node 24 and a local Docker engine or local Podman VM:

```text
npm run test:database:prepare
npm run test:database
npm run test:database:repro
```

The preparation command explicitly downloads three versioned public images.
The tests require no cloud project, credentials, dependency install or paid
service. On Windows the default is the installed Podman path below; on Linux
the default is Docker. `DOJI_TEST_ENGINE` may select a local Docker/Podman
executable. Remote engine contexts are rejected. Start your local engine first;
these commands do not create or resize a VM for you.

Each run creates a UUID-labelled database with no network, published ports or
host mounts. Auth and Storage run only their schema migrations, not provider
services. All 288 checked-in migrations replay before the explicit SQL suite;
the reviewed historical preflight fixture restores exact released function
bodies/line endings without bypassing their security hash checks. The runner
does not claim that raw `supabase db reset` is equivalent.

The allowlisted suites cover business application/auth/privacy/realtime gates,
independent business reads/commands/enrollment, employee actors/MFA/RPC/session
boundaries, restricted safety intake and media recovery. These later schema
overlays are installed only inside rollback tests; they are not blanket
production migration authorization. Real concurrent connections also exercise
purchases, rollback, once-only campaign rewards and submission retries.

`test:database:repro` copies an explicit source allowlist to a temporary directory,
without `.env`, dependencies, Git state or old test artifacts, and runs everything
again against a different empty database. It retains a hashed input manifest and
results, then removes only its generated copy and disposable database. Read
`test-results/database/clean-room.json` and `reproducibility.json` for statuses,
image identities, migration hashes, per-suite output and cleanup results.

The commands above supersede the retained-sandbox instructions **for the suites
in `scripts/database/extended.mjs`**. Those child scripts reject direct execution
against an arbitrary or retained container. Older provider/device qualification
scripts still have their own prerequisites and must not be run as a glob.
No hosted CI execution, live WorkOS browser journey, native device delivery or
100,000-user qualification is implied by these local tests.

Verified October 2 at 15:47 UTC: a source-only copy of 623 allowed files replayed
all 288 migrations, passed all 12 extended suite variants, 274 pgTAP assertions,
the included member/editorial regressions, and five overlapping-transaction or
atomic-rollback checks. Its report records no cleanup error. The normal workspace
run also passed. Separate unit checks reject foreign containers, networking,
host mounts, incomplete TAP output and skipped SQL assertions. CI is configured
to execute these commands, but has not been pushed or dispatched by this work.

September 27 recovery note: the retained `employee-cutover-verify` database
volume was tested using its cached PostgreSQL 17.6 image in a database-only
container named `supabase_db_employee-cutover-verify`, with network mode `none`,
no published ports and background jobs disabled. The new case-read runner requires
that offline mode. This is **not** the full local Auth/Storage HTTP stack described
below. The container and `doji-local-test` VM were stopped afterward; no volumes
were removed. See `PORTAL_CASE_READS_PREPARATION_2026-09-27.md` for exact scope.

## Final authorization/cutover verification — September 26

The fourth unlinked, synthetic-only project `employee-cutover-verify` restored the
public schema and enrollment foundation, then tested the exact guarded authorization
migration and real Auth 2.197.0. Full-schema drift/grant guards, employee rate limits,
all moderation content types, receipts/replay, role restrictions, evidence, retained
audit attribution and member session/read/write/realtime compatibility passed.
Set `DOJI_LOCAL_TEST_PROJECT=employee-cutover-verify` and
`DOJI_TEST_GUARDED_MIGRATION=true` for that migration test. The shared helper now
accepts all four explicitly named local projects, never the linked production DB.

After release, this stack was stopped with backups enabled and the `doji-local-test`
Podman VM was stopped successfully. Persistent volumes and retained Auth containers
were not deleted. No local test service is intentionally left running. Historical
test counts and pending gates below describe earlier stages; current production
evidence is in `EMPLOYEE_ACCESS_RELEASE_2026-09-26.md`.

## Earlier environment history

Installed with owner approval on September 26, 2026. This local environment created
no production employee, new cloud project, paid service or automatic restart.
Subsequent staged production enrollment is recorded separately in
`EMPLOYEE_ENROLLMENT_RELEASE_2026-09-26.md`.

Final enrollment verification used a third unlinked project, `employee-enrollment-check`,
with the restored public schema and the enrollment-only migration. Its Auth container
was upgraded to the official GoTrue v2.197.0 image to match production. Real local
confirmation, refresh, recovery, MFA and concurrent member-session tests passed.
The original Auth container and persistent test volumes were retained.

## Installed and verified

- Podman 5.8.3: `C:/Program Files/RedHat/Podman/podman.exe` (official Winget package).
- Microsoft WSL 2.7.13.0; Linux kernel 6.18.33.2. No Windows restart was required.
- Dedicated WSL machine `doji-local-test`; configured for 4 CPUs, 6 GiB memory and
  30 GiB disk. Its Docker-compatible API is at `npipe:////./pipe/docker_engine`.
- Unlinked Supabase project: `D:/ChallengeApp/DoIt/test-results/employee-sandbox`.
- Existing Supabase CLI 2.115.0 is used; no paid hosted branch is created.
- Local PostgreSQL 17.6, Auth v2.195.0, REST, Storage, realtime, API gateway and
  captured-email inbox started successfully. Auth `/health` returned HTTP 200.
- Windows listeners verified as `127.0.0.1`/`::1` only on 54321, 54322 and 54324.
- No production credentials or member data copied into the sandbox. Email is captured
  by local Mailpit; no external SMTP, SMS or social-auth provider is configured.

## Addresses and lifecycle

Current handoff: all three local projects are stopped with backup/volumes preserved,
including `employee-enrollment-check`; `doji-local-test` is stopped (verified state
`stopped`). Restart explicitly for tests.

- API: `http://127.0.0.1:54321`
- PostgreSQL: localhost port 54322 (test credentials only)
- Test inbox: `http://127.0.0.1:54324`

Use the explicit sandbox `--workdir` for all local Supabase commands. Do not link it
to the production project. In a shell opened before installation, add the Podman
directory to that process's PATH so the CLI discovers the engine.

```powershell
& 'C:/Program Files/RedHat/Podman/podman.exe' machine start doji-local-test
# Run the existing Supabase CLI with:
# start --workdir D:/ChallengeApp/DoIt/test-results/employee-sandbox
#       --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor
```

Stop only this machine when not testing:

```powershell
& 'C:/Program Files/RedHat/Podman/podman.exe' machine stop doji-local-test
```

Stopping preserves local test data. Do not use machine removal, global container
pruning, or Supabase `stop --no-backup` as routine shutdown. Never print/save live
production credentials into this project. Local keys remain test-only and must not
be confused with hosted credentials.

## Test status

Production `public` definitions were exported read-only (63 tables), not member rows,
Auth passwords, Vault values or schedules. Managed Auth/Storage are local Supabase
schemas, not a complete hosted clone. The real minimum-age hook is enabled locally;
member signup rejects a missing birthday. Vault is empty, preventing production relay
wakes from synthetic domain events.

Verified locally:

- `scripts/test-employee-full-schema.mts`: authorization draft applies; unexpected PUBLIC
  RPC and changed reviewed helper roll back. All 310 existing functions were compared:
  only portal functions changed, member/anon EXECUTE grants and existing table grants/RLS
  were preserved. Cutover stayed off. Result: sandbox `migration-verification.json`.
- `scripts/test-employee-local-auth.mts`: real employee creation, captured confirmation,
  login, refresh, recovery/password change, MFA, pending denial, member-table denial,
  synthetic owner bootstrap and 11 actual portal reads. Separate member signup/session
  survives employee recovery/MFA/logout. No production owner identity/grant created.
- `scripts/test-employee-local-registration.mts`: actual registration handler recovers a
  simulated initial email failure via bounded resend; unknown addresses send nothing.
- `scripts/test-employee-local-evidence.mts`: latest evidence helper/policies tested in a
  rollback-only full-public-schema transaction with valid synthetic media reservations.
  Owner sees reported media only; moderator cannot read restricted evidence; disabled
  staff see none; PUBLIC avatar policies do not widen staff access. No triggers disabled.
- Updated PGlite tests also cover deletion attribution, resend budget and evidence roles.
- 26 targeted Jest auth/registration cases pass; 35 portal browser regressions pass,
  plus the new email-retry browser case (all 3 employee browser cases pass).

The full-schema migration runner expects foundation installed but authorization absent;
the Auth runner's bootstrap requires no previously bootstrapped owner. Use fresh local
fixtures for repeat runs; never remove production identities to satisfy these preconditions.
### Clean final run

The unlinked `test-results/employee-release-final` project was initialized separately,
restored from the same public-schema-only export, and ran both latest drafts cleanly.
Set `DOJI_LOCAL_TEST_PROJECT=employee-release-final` for the local scripts. The helper
accepts only this project or `employee-sandbox`; it cannot target the linked cloud DB.
The final migration result compared 311 existing functions and preserved member grants,
RLS and non-portal definitions. Auth/registration/evidence tests were repeated successfully.

`scripts/test-employee-local-commands.mts` passes real post moderation commands, private
employee receipt routing/replay, legacy-admin receipt compatibility, reopen/reclose,
member appeal and owner reversal, restricted actions and former-member-admin deletion
with retained attribution. All fixtures/commands roll back, with empty Vault and no
external notifications. No production rows or triggers were disabled to make tests pass.
This exposed and repaired the draft's profile-FK receipt and Auth-delete ordering defects.
Final browser suite passes 36 cases; health model 32; targeted Jest five suites/35 cases;
portal client assertions and Worker TypeScript also pass.

Hosted configuration, remaining command/content-type coverage and physical-device checks
are still release gates. This environment is not approval to enable production cutover.
