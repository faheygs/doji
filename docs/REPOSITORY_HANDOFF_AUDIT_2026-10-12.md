# Repository cleanup and source handoff — October 12, 2026

## Scope

Owner requested repository cleanup, current agent/developer requirements and
reconciliation into main. This is a source/reference/packaging/documentation audit,
not a line-by-line security certification. No cloud build, production migration,
provider change, live write, email send or feature-gate activation is authorized
by this handoff. Previously deployed code is being preserved in source, not redeployed.

Baseline remote main: `96a612b` (PR #7); active checkout started at its identical
source tree `6875bbf`, with 46 modified tracked files and pending admin/public-site
history work. Root main and two old agent checkouts were inspected read-only.

## Reconciliation

- Original owner checkout: 895 changed/new files match the active source after
  line-ending normalization; 130 differ; three exist only there; 17 are locally
  deleted. These counts are a comparison of dirty paths, not missing features.
- Content hashes of the differing/old-only source were checked against reachable
  Git history: 132 historical blobs (excluding local CLI cache). Both old agent
  checkouts have no unique commits; their 10/17 differing source blobs also exist
  in history. This is retention evidence, not permission to overwrite them.
- Do not copy old main or revive retired demo/expiry/UI code over newer source.
  Retained checkouts, credentials, SDKs, native outputs and unique private rollback
  evidence are left intact. A clean main clone does not contain those artifacts.
- Pending admin history/status/pagination/source diagnostics, public Next routes,
  employee read adapters, release/rollback records and the already released
  moderation replay migration are included for qualification. No SQL is run live.

## Cleanup and prevention

- Removed root `Doji Mockups.html` (496 lines): disconnected React 18 CDN/Babel
  visual prototype with no references in maintained source, package commands,
  builders, tests or docs. Current mobile/shared MUI UI supersedes it. Recover
  from baseline Git history if historical design comparison is needed.
- Removed hand-maintained `web/apps/site/public/safety-removal/config.js` from
  source inputs. `prepare-assets.mts` now generates the same disabled preview
  contract before dev/build; only approved release packaging replaces it with
  verified live config. Generated output is ignored and artifact assertions
  prove previews cannot submit. No public safety behavior/config was deployed.
- Hygiene now rejects web dist/out/.next/generated assets, generated safety
  bundles/config, next-env types, browser reports and scratch logs/tmp/bak files.
  Existing tracked ignored files are inspected too; ignore rules alone are not
  a secret scanner. Added regression cases preserve intentional test fixtures.
- Added the two email-proof draft modules and site asset builder to strict
  tooling compilation instead of weakening the zero-maintained-JavaScript guard.
  The email MFA draft stays unmounted, undeployed and gated.
- Retained active tests/mocks, synthetic fixtures, historical scripts, immutable
  migrations, SQL overlays/rollback and compatibility browser sources. Their
  names/age do not prove non-use. The website folder still supplies React imports,
  legal content, safety behavior, packaging and coverage.

## Developer requirements

Root AGENTS and CLAUDE now point to actual ownership and commands. Scoped guides
cover web, Next static site, infra, Supabase, scripts and retained website sources.
Handbook stack/identity/current-state/local setup/testing/UI guidance is updated
to the React migration and October 12 business acceptance. Dated evidence remains
historical; current guide links have precedence over earlier local-only snapshots.
The link checker includes agent guides and the test handoff, and indexes the
three previously unindexed release records plus this audit.

## Validation

Initial checks caught the handwritten JS asset, three modules missing from the
strict inventory and three unindexed documents. Local verification passed:

- Root strict compilation, lint, source-size limits and hygiene; 18 handbook
  files, 220 local links/anchors and 116 indexed documents.
- 52 Vitest files / 286 tests, all three web builds, preview artifact checks and
  the connected-admin build/artifact boundary checks.
- Thirteen employee-history adapter/email-proof tests; the latter remains an
  unmounted draft, not a deployed authentication alternative.
- Isolated database suite and a second source-only reproducibility run: all
  290 migrations, permissions/RLS, replay, concurrency and rollback checks.
- Additional employee-history read regression against the entire current
  migration chain: permissions, stable pagination, member preservation and
  rollback; bounded local performance fixtures (not production capacity proof).

The local default browser run passed 148 tests with two package-only cases
intentionally skipped; one case encountered Windows socket allocation failure.
Retesting exposed an unrelated dialog-entry timing race in the accessibility
check. It now waits for full MUI opacity before measuring contrast, following
the other dialog suites, without changing UI or weakening assertions. All five
privacy-action tests then passed three consecutive runs (15/15).

The PR's exact-head application, database, coverage and web-migration jobs must
all pass before normal protected merge. Hosted CI/PR is the final evidence for
the committed source; local retained artifacts and preview-server reuse are not
a substitute for those fresh-run gates.

No coverage threshold, source-size allowance, permissions or production settings
are relaxed. Native/device, provider acceptance, production schema reconciliation,
disabled health/business feeds and broad business launch remain separate gates
in [Current state](CURRENT_STATE_AND_GAPS.md).
