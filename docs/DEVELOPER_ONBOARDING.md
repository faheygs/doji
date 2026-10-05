# Developer onboarding

Start here when joining Doji. This handbook explains the code, service access,
safe local development and first-change workflow. Audited against the local
repository and existing release evidence on **October 5, 2026**; this is not a new
live audit of every vendor account. Recheck dated state before production work.

## Reading order

1. [Current state and gaps](CURRENT_STATE_AND_GAPS.md): live, incomplete and
   missing-from-clone work.
2. [System and code map](SYSTEM_MAP.md): product, stack, surfaces and data flow.
3. [Service catalog](SERVICE_CATALOG.md) and [Security and access](SECURITY_AND_ACCESS.md):
   vendors, credentials, identity realms and release boundaries.
4. [Local development](LOCAL_DEVELOPMENT.md) and [Testing and releases](TESTING_AND_RELEASES.md).
5. Before connected product/backend work, read all of [AGENTS.md](../AGENTS.md),
   [DOJI_CONTEXT.md](../DOJI_CONTEXT.md) and [REALTIME_ARCHITECTURE.md](REALTIME_ARCHITECTURE.md).

Long context documents retain chronological notes. Later explicit release records
supersede earlier local-only statements. A directory called `candidate` can contain
live code; a file under `docs/drafts` can contain already-installed SQL. Neither
the filename nor an old checklist establishes deployment status. Use the
[documentation index](README.md) to find exact release evidence.

## First hour

- Ask Gavin Fahey for repository access and use reviewed `main`. PR #3 merged the
  TypeScript conversion and regression suite at `60df53a` on October 5. Do not
  copy the owner's retained working files or assume a source merge deploys them.
- Run `npm run check:hygiene`. Fresh clones must not contain Supabase CLI link
  caches, local environment values or generated test/deployment evidence.
- Confirm your scope: mobile, portal UI, database, infrastructure or operations.
- Inspect `git status --short`, `package.json` and the lockfile. Install with
  `npm ci`, `npm ci --prefix infra/portal-identity-candidate` and
  `npm ci --prefix infra/doji-orchestrator`; strict tooling and browser builds
  use those packages' locked dependencies. Do not upgrade packages during onboarding.
- Run a relevant offline test and a loopback-only prototype from the local guide.
- Use Node 24. Run `npm run test:coverage` for all 17 budgets (install Playwright
  Chromium first, or set `DOJI_TEST_BROWSER_CHANNEL=chrome` for installed Chrome).
  Use `npm run test:database:prepare`, `npm run test:database` and
  `npm run test:database:repro` for the isolated SQL tests; see the
  [repeatable database guide](LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md#current-repeatable-database-tests).
- Trace one existing feature from screen to hook/client, authorized command/read,
  Postgres state, committed event and observer reconciliation.
- Record anything you cannot reproduce. Do not substitute a production credential
  or guessed schema for a missing local fixture or permission.

## Access checklist

The owner provisions access. Never copy their authenticated browser, password,
authenticator seed or server credential bundle.

| Access | Purpose | Starting permission |
| --- | --- | --- |
| Repository | Code and review | Named account and agreed branch |
| `name@dojipro.com` forwarding | Work identity and invitations | Owner-approved Cloudflare rule to verified destination; not a mailbox |
| WorkOS employee | Doji admin portal | Separate password, authenticator MFA, explicit mapping and approved roles |
| Test member | Mobile tests | Separate Supabase Auth identity in an approved isolated environment |
| Cloudflare, Supabase, Sentry, Expo | Assigned engineering tasks | Vendor-specific least privilege; portal access grants none of these automatically |
| Apple, Play, Firebase, mail providers | Release, push or mail tasks | Task-specific access only, not default onboarding |

Forwarding is the owner's selected approach, not proof a developer address exists.
The developer verifies their destination inbox. WorkOS is identity infrastructure,
not an email inbox. Developer email and intended portal permissions are still
owner choices; never infer them from a repository collaborator's name.

## First change

1. Agree on a small reversible issue. Prefer a unit-tested helper or portal
   presentation fix over authentication, scheduling or shared RLS.
2. Find the existing component and contract; do not create a lookalike substitute.
3. List affected boundaries and checks. Portal UI work does not implicitly approve
   a database, mobile or shared Worker change.
4. Reproduce locally, add regression coverage and make the smallest fix.
5. Run relevant checks and inspect the actual layout/device behavior. A stubbed
   test is not production acceptance.
6. Update the related documentation. Provide test results, limitations, exact
   deployment scope and rollback in the review handoff.
7. Obtain required approval for shared-system, access, billing or release actions.

Historical `apply`, `launch`, `configure`, `deploy` and secret-sync commands often
target an exact production snapshot. They are not reusable onboarding commands.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Daily event or Doji | One scheduled occurrence, distinct from its reusable challenge definition |
| Prelive | Server-owned twenty-minute lead-in; no early prompt disclosure |
| User event | A member's authoritative participation state for an occurrence |
| RPC | Authorized database function; write RPC owns its complete transaction |
| Outbox | Durable delivery work committed with the underlying change |
| Reconciliation | Refetch authorized truth after events, reconnect or foreground |
| Sparks | Server-owned in-app reward balance, not a payment integration |
| Realm | Member, employee or business identity boundary; same email is not same identity |
| Admission | Server gate for account creation/access; visible forms cannot override it |
| Artifact | Exact packaged/tested release files, not the whole worktree |
| Release policy | Platform minimum/latest app version/build, not store availability |
| Delivery | Distinguish provider acceptance, provider delivery and actual phone display |

## Ready for independent work

- [ ] Can explain the three account realms and what remains unfinished.
- [ ] Can find UI, read, command, database and realtime ownership for the assigned feature.
- [ ] Can run an offline test and preview without production credentials.
- [ ] Knows the assigned surface's build artifact and deployment boundary.
- [ ] Understands server timing, idempotency and foreground/reconnect reconciliation.
- [ ] Has named, least-privilege access and a reviewed source baseline.
- [ ] Knows who approves release and how to roll back without deleting evidence.

## Documentation handoff checks

The October 1 documentation pass verified 148 local handbook links/anchors,
indexed 78 other Markdown documents under `docs`, checked the public-only
environment template and passed the existing admin client, 32 health-model and
15 queue-health checks. Re-run `node scripts/check-onboarding-docs.mts` as the
handbook changes. This was not a clean-clone/full-stack or live vendor audit.

The new guides and existing local changes still require review and an intentional
handoff commit/push before a new developer can obtain them from the remote. No
production deployment, member account change or provider configuration change was
part of this documentation pass.
