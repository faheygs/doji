# System and code map

This maps Doji's surfaces to code and services. Versions describe the audited
**source lockfile**, not every installed store binary. See
[Current state and gaps](CURRENT_STATE_AND_GAPS.md) for deployment qualifications.

## Product surfaces

| Surface | Address or entry | Source and packaging | Identity |
| --- | --- | --- | --- |
| Member app | iOS/Android Doji; `doit` deep links | `app/`, `components/`, `hooks/`, `lib/`; Expo/EAS | Supabase Auth; no WorkOS member migration |
| Public website | `https://dojipro.com/` | `web/apps/site` Next static export; legal sources retained in `website`; `doji-site` Pages | Public information |
| Safety and Removal Center | `https://dojipro.com/safety-removal/` | `website/safety-removal/`, dedicated Edge handlers | No account/attachments; Turnstile and private status code |
| Employee admin | `https://admin.dojipro.com/` | `web/apps/admin`, retained browser adapters and exact proxy packaging; `doji-admin` Pages | Independent WorkOS + MFA, opaque cookie and Postgres staff permissions |
| Employee staging | `https://admin-staging.dojipro.com/` | Same admin source; separate `doji-admin-staging` Pages and staging Edge | Shared employee WorkOS identity, separate application/access grants, SQL login and session keys; synthetic member data only |
| Business application portal | `https://business.dojipro.com/` | `web/apps/business`, retained application controller, owned auth/setup; `doji-business` Pages | Independent WorkOS business realm, approval/setup/MFA workspace gate |
| Business marketing | Public `/business/` source | `website/business/index.html` | Marketing source does not prove campaign capability |
| Business workspace prototype | Local `/business-portal/` | `website/business-portal/index.html`, prototype branch in `portal.mts` | Sample/browser-local state, not production billing or campaign backend |
| Legacy mobile admin routes | `app/(app)/admin/` | Existing React Native screens/hooks | Legacy surface; a member token cannot become a WorkOS employee credential |

Public routes also include `/privacy/`, `/terms/`, `/community-guidelines/`,
`/child-safety/`, `/support/`, `/delete-account/` and `/delete-data/`. Business
terms/privacy are built separately with versioned URLs by
`website/build-business-legal.mts`. Do not alter approved legal promises as UI cleanup.

## Technology stack

| Layer | Audited source version or family | Role |
| --- | --- | --- |
| Expo | 57.0.30 | Native toolchain and modules |
| React Native / React | 0.86.3 / 19.2.3 | Native rendering and UI |
| Expo Router | 57.0.28 | Route groups, protected stack, five main tabs and deep links |
| TypeScript | Root 6.0.3; Worker package separate | Strict app, portal, tooling, fixture and contract checks |
| TanStack Query | 5.100.9 | Server cache, paging, invalidation, bounded recovery |
| Zustand | Root lockfile | Limited auth/navigation/challenge/celebration state, not database truth |
| Supabase JS | 2.105.3 | Member Auth, PostgREST/RPC and Storage |
| Ably | 2.26.0 | Authorized event channels and recovery |
| Native interaction | Expo Camera/Image Picker/Image/Video/Notifications, Reanimated, Gesture Handler, Keyboard Controller | Capture, display, gestures, native alerts and keyboard-safe forms |
| Forms/validation | React Hook Form, Zod, portal validators | User feedback; server checks remain authoritative |
| Uploads | TUS and server reservations | Resumable private media objects |
| Database | Supabase Postgres, RLS/RPCs, Vault, `pg_net` | State, authorization, receipts and outbox |
| Edge | Supabase Deno TypeScript functions | Privileged integrations with handler-owned authorization |
| Orchestrator | Cloudflare Worker and Durable Objects | Alarms, relay, fanout, maintenance, health and member gateways |
| React web | React 19.3.0, MUI 9.4.0, Vite 8.3.4, Next 16.4.0, TanStack Query 5.104.1 | Vite admin/business SPAs, Next static public site, shared MUI/Emotion theme |
| Retained browser contracts | HTML/CSS/TypeScript, esbuild registry | Auth/application/safety adapters, legal content and exact proxy/artifact packaging still used by React |
| Independent identity runtime | `jose` 6.2.8, `pg` 8.16.3, WorkOS APIs | Verified external identities and restricted durable sessions |
| Quality | Jest, React Native Testing Library, Playwright/axe, ESLint, Prettier, Supabase tests | Unit, contract, accessibility, browser and database checks |

Sources: [root package](../package.json), [lockfile](../package-lock.json),
[Worker package](../infra/doji-orchestrator/package.json),
[identity package](../infra/portal-identity/package.json).
Web versions are separately locked in [web workspace](../web/package.json) and
its app/package manifests. Do not collapse web React 19.3 into mobile React 19.2.
Do not upgrade packages merely to match a tutorial.

## How requests connect

Development has a separate Supabase database, `ohrcupagdoilkwhecict`, in the Free
`doji-staging` organization. It contains the qualified schema and synthetic data,
not production member identities, credentials or media. Approved employee subjects
are explicitly mapped to separate staging roles. The staging employee runtime and
Pages package are deployed separately; owner password/MFA login is verified.
Business/mobile, shared Worker and realtime connections remain disconnected.
See [staging connection requirements](LOCAL_DEVELOPMENT.md#hosted-staging-database).
The current scope is admin only; business/site/mobile staging are deferred.
`scripts/build-admin-staging.mts` builds the admin Pages artifact from source with
`employee-staging-pages-worker.mts` as its fixed-environment proxy entry. It does
not deploy. `web/apps/admin/vite.staging.config.ts` and `dev/` supply the separate
loopback-only connected frontend command; only fixed employee routes reach the
staging Pages host. Hosted cookies stay in per-browser server memory; no developer
WorkOS/SQL/API keys are needed. Local and hosted staging share the yellow
`StagingEnvironment` strip; hosted staging never includes developer impersonation.
Internal workflow reads are enabled independently of realtime, which stays off.

The separate staging-only development-auth path lives in
`supabase/overlays/admin_development_v1.sql` with its retaining rollback;
`scripts/build-admin-development-sql.mts` pins reviewed existing assurance gates
and the command manifest. Deployed `admin_development_employees_v2.sql` provides an
employee-directory selector with separate developer grants. The paired
`employee_shared_staging_v1.sql` pins the shared issuer/staging audience; each has
a retaining inverse. `infra/portal-identity/admin-development.mts` and
`supabase/functions/admin-development` implement its restricted server gateway.
`vite.development.config.ts` and `web/apps/admin/dev/development-*` own the local
credential loader, relay, transport and persona selector. The gateway/SQL are
enabled only in staging, with Gavin/Kedd employee mappings and a private owner credential.
The local mode is verified against disposable PostgreSQL and the live staging
HTTP/SQL path. It does not alter the normal employee WorkOS
bridge or mint member/Auth tokens; neither development entry enters hosted bundles.

```text
Member UI -> hook -> member JWT command gateway -> atomic Postgres RPC
                                                   | state + receipt + outbox
                                                   v
             durable relay -> Ably identifier hints -> authorized cached reads
                           -> eligible APNs/FCM alerts

Employee UI -> same-origin Pages proxy -> employee-portal-v2 Edge
              opaque host cookie          WorkOS password/MFA verification
                                          restricted session/application SQL roles
                                          existing atomic staff contracts

Safety form -> Turnstile + dedicated Edge -> private case/history/alert queue
                                         -> scoped review and exact-target moderation
                                            only after staff confirmation
```

Shared data does not mean shared credentials. The member gateway forwards the
member JWT/RLS context; it has no Supabase service-role key. The employee Pages
proxy has a dedicated proxy key, not the database/password/signing credentials.
Resource authorization and privileged signing remain server-side in the Edge runtime.

## Challenge lifecycle

`schedule-daily-challenge` prepares an occurrence and registers its exact alarm.
The durable event alarm owns prelive, activation and close. Prelive removes the
previous occurrence from the active feed without erasing historical completion/XP.
Activation commits live state and delivery work; close chains the next event.

The standard window is ten minutes by Postgres time. Existing signup-day and paid
buy-in exceptions are server-owned contracts, not permission to extend a phone
timer. Completion returns directly to feed. See
[realtime guarantees](REALTIME_ARCHITECTURE.md#guarantees).

There is no recurring due-challenge poller. There **are** separate scheduled health
and safety/media recovery checks; those must never become the challenge clock.

## Data ownership and code entry points

| Area | Ownership | Start reading |
| --- | --- | --- |
| Member identity/profile | Supabase Auth/Postgres | `lib/supabase.ts`, `stores/useAuthStore.ts`, `lib/initialSessionBootstrap.ts` |
| Challenge timing | Database occurrence/eligibility | `hooks/useUserEvent.ts`, `lib/serverClock.ts`, `lib/participationGate.ts` |
| Feed/social/profile reads | Authorized bounded snapshots | `lib/feedQueries.ts`, `lib/profileQueries.ts`, `hooks/useComments.ts`, `hooks/useFriendsPaged.ts` |
| Public profile projection | Explicit safe fields, never `profiles(*)` | `lib/profileFields.ts`, `lib/publicProfileView.ts` |
| Writes/replay | Atomic RPC and stable receipt | `contracts/authenticatedCommands.ts`, `lib/commandGateway.ts`, `lib/dojiWriteReceipt.ts` |
| Cache | TanStack Query; account-scoped persistence | `lib/queryClient.ts`, `lib/queryPersistence.ts`, `components/QueryCachePersistence.tsx` |
| Events and lifecycle | Targeted hints then authorized reconciliation | `hooks/useDomainRealtime.ts`, `lib/domainRealtimeHandler.ts`, `lib/reconcileQueries.ts`, `components/QueryLifecycle.tsx` |
| Media | Reserved private objects, bounded signing | `lib/postMedia.ts`, `hooks/usePostMedia.ts`, `_shared/moderation-media-storage.ts` |
| Activity history | Durable account state | `contexts/NotificationCenterContext.tsx`, `lib/notificationHistoryQueue.ts` |
| Phone alerts | Outbox policy and installation claims | `lib/pushNotifications.ts`, `hooks/useNativeNotifications.ts`, `_shared/notification-policy.ts` |
| Sparks/shop/badges | Server ledger and atomic uniqueness | `hooks/useSparks.ts`, `hooks/useShop.ts`, `constants/sparks.ts`, corresponding SQL |
| Drafts/sheets/selection | Local component state | Shared UI and portal form/drawer modules |

`_shared` above means `supabase/functions/_shared/`. Main relational families are
`profiles`, `challenges`, `daily_events`, `user_events`, `posts`, `poll_votes`,
`comments`, `reactions`, `friendships`, shop ownership, badges, notification state,
moderation/audits and `domain_event_outbox`. Private portal/business/safety schemas
are not general member APIs. `types/database.ts` helps find member contracts;
inspect SQL and grants to establish authorization, not types alone.

## Realtime and delivery

`doji:global` announces phases; `user:{id}:events` is member-private. Feed,
leaderboard and mounted-post subscriptions are bounded/focus-aware.
`moderation:global` is staff-only. Global profile broadcast is retired; business
private realtime preparation exists but is not enabled in the recorded launch.

Poll totals are global; social activity is friend-scoped. Phone alerts follow the
allowlist and preferences, with durable deduplication. Ambient activity may remain
in-app. Provider acceptance is not a phone-display receipt. In scale mode, a failing
gateway must not silently stampede the database via a direct fallback.

## Repository map

| Path | Responsibility |
| --- | --- |
| `app/` | Expo Router screens, route groups and navigation |
| `components/` | Shared and feature UI |
| `hooks/`, `lib/`, `contracts/` | Reads, atomic commands, rules, gateways and reconciliation |
| `contexts/`, `stores/`, `constants/`, `types/`, `utils/` | Providers, small client stores, tokens, types and helpers |
| `assets/`, `store-assets/` | Branding and store assets |
| `supabase/migrations/`, `supabase/tests/` | SQL history and DB contract tests |
| `supabase/functions/` | Integration entrypoints and shared server helpers |
| `infra/doji-orchestrator/` | Shared production Worker and its package/lockfile |
| `infra/portal-identity/` | Independent employee and business identity/session runtimes |
| `web/apps/{admin,business,site}/` | Primary React UI: Vite admin/business, Next static public site |
| `web/packages/{ui,portal-data}/` | Shared MUI branding/components and authorized session-scoped data adapters |
| `web/tests/` | Vitest/Playwright fixtures, connected and exact-package artifact regressions |
| `website/` | Retained browser controllers, legal/safety sources and release packagers; active dependencies |
| `__tests__/`, `lib/__tests__/`, `website/*/e2e/` | App/contract/browser regressions |
| `scripts/` | Mixed local tools and historical production operations; inspect before executing |
| `docs/`, `docs/releases/` | Current handbook and separately indexed release/rollback evidence |
| `supabase/overlays/` | Individually reviewed SQL changes and inverses, not ordered migrations |
| `.github/workflows/quality.yml` | Quality workflow, not automatic deployment |
| `.github/workflows/admin-staging.yml`, `admin-production.yml` | Admin-only Pages staging/release pipeline; GitHub environments/credentials and activation configured, merge and live CI verification pending |
| `scripts/{admin-release-*,build-admin-release,deploy-admin-release}.mts` | Admin dependency selection, immutable packages, target/receipt verification; no shared backend deployment |
| `test-results/`, generated website output | Local artifacts/evidence; not automatically available or safe to share |
| `.artifacts/`, `credentials/`, `.env.local` | Sensitive/local material, not a developer handoff bundle |
| `android/`, `ios/`, `.expo/`, `node_modules/` | Generated/dependency state, not source authority |

## Design system

Mobile uses `constants/theme.ts`, `ThemeContext`, `components/ui` and shared
avatar/frame components. Reuse `AppDialog`, `AppSheetModal`, keyboard-aware fields
and `ReadFailureFeedback`; preserve light/dark, accessibility and Reduce Motion.

React portals share `web/packages/ui` (MUI/Emotion Doji theme and standard controls).
Full-page records replace drawers; MUI dialogs handle consequential confirmations.
Home uses greeting/next Doji/attention cards; Team uses a directory and role editor.
Queues use meaningful columns, status/history filters, clear empty/error/loading
states and bounded MUI pagination. CTAs align consistently, not stretched across
desktop forms. Show labelled original submission fields, not JSON.
Preserve dirty drafts, block proven stale revisions and clear protected state on
lock/logout. See [Portal UI patterns](PORTAL_UI_PATTERNS.md).
