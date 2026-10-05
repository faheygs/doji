# Repository cleanup audit — October 5, 2026

## Scope and evidence boundary

Baseline: merged `main` at `60df53ab2faa03226c0b3b4125a759d839ff303e`.
Work is isolated on `codex/repository-cleanup` in the existing managed checkout;
the owner's original dirty checkout, ignored SDKs and release evidence are untouched.
No deployment, store build, production read/write, monitor restart or dependency
installation/upgrade is part of this pass. npm advisory queries were read-only.

This is a repository-wide inventory/reference/hygiene audit and a first verified
cleanup, **not** a completed line-by-line correctness/security audit. Static
non-use signals alone do not establish safe deletion. Remaining work is explicit
below; no feature is declared obsolete just because its filename says candidate.

## Inventory reviewed

All **1,701 tracked files** were enumerated at baseline. Main groups:

| Boundary | Files | Inspection |
| --- | ---: | --- |
| Supabase | 362 | Functions, migrations, tests, config and tracked CLI cache inventory; cache consumers searched |
| Operational/build tooling | 358 | Script inventory, package commands, TS projects, historical release-script references |
| Root tests | 242 | Test/source distinction and existing CI/coverage qualification |
| Documentation | 152 | Markdown plus SQL drafts; all 99 repository Markdown files checked for local link targets |
| Website and portals | 134 | Build/preview/package entry points and separation from generated output |
| Mobile components | 120 | Production import references, tests and documented contracts |
| Mobile library | 100 | Production import references, tests and documented contracts |
| Hooks | 52 | Production import references and tests |
| Infrastructure | 50 | Identity/Worker manifests, lockfiles, entry points and release records |
| App routes | 45 | Framework entry points retained, not mistaken for unimported code |
| Remaining files | 86 | Assets/store media, native module/plugin source, configs, utilities and root files |

Import analysis used TypeScript's preprocessor on tracked `.ts/.tsx/.mts/.cts`
with relative and `@/` resolution, excluding tests/declarations from consumers.
Separate full-text reference searches checked candidate names against tests,
source and docs. This is not a whole-program/dynamic-registration proof.
Exact SHA-256 duplicate scanning found one pair over 100 bytes:
`assets/icon-ios.png` and `website/assets/doji-icon.png`. Both are intentional
independent packaging inputs; retained. No unresolved local Markdown target was
confirmed: the only regex flag was a valid parenthesized Expo route path.

## Applied cleanup

1. Removed nine tracked `supabase/.temp` CLI cache/link files. Fresh clones must
   not inherit a production project link or machine-local pooler/cache state.
   The files remain recoverable from Git; no provider was unlinked and the
   original owner's local files remain intact. Existing operational scripts
   requiring an explicitly verified link continue to fail closed without it.
2. Expanded ignore rules to exclude `.env` and `.env.*`, retaining only the root
   reviewed `.env.example`. This does not purge Git history or rotate credentials.
3. Added `npm run check:hygiene` and its CI step: filename-only local-state/signing
   material checks, regression tests and the existing onboarding/link checker.
   It sees already-tracked ignored files; ignore rules alone are not protection.
4. Corrected the identity package description: employee modules are live; the
   business replacement remains gated. No runtime import, package name or lockfile
   changed.
5. Updated README/onboarding/test handoff/current-state summaries to the merged
   TS qualification, current recorded mobile releases/policies and October 2
   admin release. Added missing subpackage installs and full strict typechecking
   to the root quickstart. Historical release receipts remain unchanged.
6. Removed one verbatim duplicate employee-latency paragraph in DOJI_CONTEXT;
   the identical authoritative paragraph remains. No contract changed.

## Owner-approved unused-source removal

The follow-up inspected all candidate bodies, tracked text references, imports,
Expo Router entry (`index.ts`), route files, Babel/app configuration and the EAS
source allowlist. None of the removed modules is a route, plugin, package entry
point or dynamically registered component. Their remaining callers were tests,
except the obsolete completion hook's type import of the obsolete XP helper.
The following **16 source files** were removed from this checkout, recoverable
from Git; the original owner checkout and deployed apps are untouched.

| Removed paths | Retained runtime / reason |
| --- | --- |
| `components/challenge/ChallengeReveal.tsx`, `PollScreen.tsx`, `SubmittedOverlay.tsx`, `TaskScreen.tsx` | Current `app/(app)/challenge.tsx`, `poll.tsx`, `task.tsx`, `camera.tsx`, `format.tsx`; completion navigates directly to feed, without a success interstitial |
| `components/economy/ProfileShopEntry.tsx` | Owner profile uses `ProfileStreakPair` in `ProfileSections.tsx`; Sparks/shop interaction and gain lifecycle regression retained on that active component |
| `components/feed/PollCard.tsx` | Current feed uses `PollResultCard.tsx`; removed standalone attribution card had no runtime caller |
| `components/gamification/LevelUpModal.tsx`, `RankBadge.tsx`, `XpGainOverlay.tsx` | Mounted `CelebrationHost` presents `BadgeUnlockModal`; active level/XP/rank components and shared celebration shell remain |
| `components/profile/ProfilePostsGrid.tsx`, `ProfileStats.tsx` | Owner/member routes use `ProfileCurrentPost` and `ProfileSections` metrics, not a historical post grid |
| `hooks/useChallengeCompleteOverlay.ts`, `lib/challengeComplete.ts` | Unmounted success-overlay state and its orphaned estimated-reward helper; authoritative completion commands and direct-feed navigation unchanged |
| `hooks/useChallengeSuggestionCounts.ts` | No runtime consumer; current profile derives idea metrics from its existing suggestion records; no active reads/invalidation roots changed |
| `lib/badgeCelebration.ts`, `lib/challengeSuggestions.ts` | Test-only legacy helpers; no badge event/store, suggestion submission or server mapping changed |

Removed only test cases/imports exclusively exercising those modules. Mixed suites
retain active route, authorization, read-recovery, cancellation, modal, badge,
profile and economy regressions. The successive profile gain/timer test now uses
the actual `ProfileStreakPair` rather than being discarded. No test suite, coverage
threshold, source glob or exclusion was removed/relaxed. The runtime inventory
decreased from 446 to 430 sources; fresh results are recorded below. The 16
removed files contained 1,459 source lines.

`lib/profileFields.ts` is retained: it has no current production TS importer, but
is still the explicitly documented public-field contract and has privacy-boundary
tests. Retiring/replacing that contract requires a separate projection audit.

## Retained follow-up work

### Dependencies and tooling

Full `npm audit --json --ignore-scripts` results including development dependencies:

| Lockfile | High affected-package entries | Critical | Disposition |
| --- | ---: | ---: | --- |
| Root | 56 | 0 | Needs grouped advisory/reachability and compatible-version review |
| Worker | 4 | 0 | Wrangler/miniflare/sharp/undici tooling chain; registry proposes Wrangler 4.147.0 |
| Identity | 0 | 0 | No advisory returned by this check, not proof of security |

Counts include propagated/metavulnerability entries, not independent root causes
or confirmed shipped exposure. This full audit is not directly comparable to the
older production-only audit counts. Root suggestions include major changes and
downgrades (including Expo 44); none was applied. Existing exact iOS 103 disposition
is historical evidence, not automatically a disposition of today's entire tree.

A literal-use scan found 11 root dependencies without a name reference outside
their manifest/lockfile: `@expo/metro-runtime`, `@expo/vector-icons`, `date-fns-tz`,
`expo-dev-client`, `react-hook-form`, `react-native-web`, `@expo/ngrok`,
`@react-native/jest-preset`, `@types/jest`, `@types/react`,
`eslint-plugin-react-native`. Some are framework/plugin/type entry points, so this
list is **not** an uninstall list. Validate dependency/peer/native/plugin and build
graphs before removing any. Worker manifest also uses `wrangler: latest`, while
its lock pins 4.120.1; assess a tested explicit version with advisory remediation.

### Historical and generated material intentionally preserved

- Every SQL migration and draft/rollback artifact: deployed schema history and
  locally replayed regression dependencies must not be inferred from file age.
- Historical launch/apply/release scripts: some guard exact links, manifests and
  one-attempt receipts. Do not rename/move them without changing verified callers.
- Store screenshots, original concept/mockup assets and duplicate packaged icons.
- Two compiler-verified JS bootstrap/compatibility artifacts; they are required.
- Native Java/Kotlin/Gradle source and deployed employee paths named `candidate`.
- Legacy identity/browser paths pending explicit retirement and rollback review.
- The owner's ignored release snapshots, SDKs, test output and other worktrees.

### Active deprecated API use (not dead code)

The installed React Native test runtime warns that `InteractionManager` is
deprecated. Five production files still use it: `hooks/useNativeNotifications.ts`,
`hooks/useLeaderboard.ts`, `components/QueryCachePersistence.tsx`,
`components/feed/PostCard.tsx` and `app/(app)/(tabs)/index.tsx`. These schedule
real work and must not simply be deleted or mechanically renamed. Follow-up must
preserve cancellation, account/session boundaries, rendering and notification
timing with focused lifecycle tests. Existing warnings were not suppressed.

## Verification and next boundaries

Initial hygiene-only pass, before source removal:

- `npm run check:hygiene`: four new guard tests passed, path inventory passed,
  nine handbook files / 173 local links and anchors / 90 indexed documents passed.
- `npm run typecheck`: all strict projects and TS migration/bootstrap/compatibility
  checks passed.
- `npm run lint -- --quiet`, `npm run check:size`, `git diff --check`: passed.
- `npm test -- --runInBand`: 240 suites / 4,622 tests passed, no snapshots;
  existing fixture/deprecation console warnings were not suppressed.
- `npm run test:database:guards`: five local engine/ownership/TAP safety tests passed.

Post-removal qualification completed October 5 at **13:43:21 UTC**, Node 24.18.0:

- **17/17 areas pass all four 90% budgets**, with no threshold/exclusion changes.
  All **430 runtime sources** are measured; zero missing. Lowest metric is
  shared-website branch coverage at 90.43%. Mobile components are 96.81%
  statements / 93.28% branches / 97.21% functions / 97.99% lines.
- **240 Jest suites / 4,542 tests passed**, no failures or skipped tests. The
  80-test reduction is exclusively the removed modules' cases; no suite was
  deleted. The successive profile gain/timer regression was retargeted to the
  active component. Member read retries, cancellation and permission failures
  additionally passed all 137 focused cases after a formatting-only cleanup.
- **697 browser scenarios passed**, zero retries, in 7.6 minutes; **27 offline
  suites passed**. All six coverage runner stages exited zero. Provider requests
  were mocked and unmocked public hosts blocked; this is not a live provider or
  physical-device qualification.
- The first browser preflight failed because bundled Chromium was absent;
  the complete run used the documented `DOJI_TEST_BROWSER_CHANNEL=chrome` with
  already-installed Chrome. Nothing was downloaded and no test was skipped.
- `npm run typecheck`, `npm run lint -- --quiet`, `npm run check:hygiene`,
  `npm run check:size` and `git diff --check` passed. Hygiene sees **1,679**
  tracked/new files (1,701 baseline - 25 deletions + 3 added audit/guard files).
- Bounded local evidence: `test-results/coverage/current/run-status.json`,
  `areas.json`, `jest-results.json`, `offline-results.json`, and
  `browser-tests.json`. These generated results are not committed.

At this local qualification point, no full database replay, native build or hosted
CI had been performed for this source-only cleanup. Existing fixture/deprecation
warnings remain visible. Subsequent push/merge qualification belongs to the GitHub
pull request and its exact-head CI checks; local results do not imply a deployment.

Remaining cleanup should proceed as separate reviewable changes: compatible
dependency remediation; then
explicit retirement/archiving of superseded operational tooling and docs. Shared
backend/identity behavior changes still require their own impact and release
approval. No production deployment is needed to remove unreferenced source and
local cache files; this cleanup does not alter the currently installed binaries.
