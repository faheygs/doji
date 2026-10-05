# System and code map

This maps Doji's surfaces to code and services. Versions describe the audited
**source lockfile**, not every installed store binary. See
[Current state and gaps](CURRENT_STATE_AND_GAPS.md) for deployment qualifications.

## Product surfaces

| Surface | Address or entry | Source and packaging | Identity |
| --- | --- | --- | --- |
| Member app | iOS/Android Doji; `doit` deep links | `app/`, `components/`, `hooks/`, `lib/`; Expo/EAS | Supabase Auth; no WorkOS member migration |
| Public website | `https://dojipro.com/` | `website/index.html`, policy/support folders; `doji-site` Pages | Public information |
| Safety and Removal Center | `https://dojipro.com/safety-removal/` | `website/safety-removal/`, dedicated Edge handlers | No account/attachments; Turnstile and private status code |
| Employee admin | `https://admin.dojipro.com/` | `website/admin-portal/`, `portal.mts`, `build-admin.mts`; `doji-admin` Pages | Independent WorkOS + MFA, opaque cookie and Postgres staff permissions |
| Business application portal | `https://business.dojipro.com/` | `website/business-portal/application/`, `access/`, `build-business.mts`; `doji-business` Pages | Released bounded Supabase-based business boundary; independent WorkOS transition incomplete |
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
| Expo | 57.0.24 | Native toolchain and modules |
| React Native / React | 0.86.3 / 19.2.3 | Native rendering and UI |
| Expo Router | 57.0.22 | Route groups, protected stack, five main tabs and deep links |
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
| Websites/portals | HTML/CSS/TypeScript; esbuild emits browser JavaScript and employee transport/Pages Worker | Shared components and separate artifacts; not Next.js |
| Independent identity runtime | `jose` 6.2.8, `pg` 8.16.3, WorkOS APIs | Verified external identities and restricted durable sessions |
| Quality | Jest, React Native Testing Library, Playwright/axe, ESLint, Prettier, Supabase tests | Unit, contract, accessibility, browser and database checks |

Sources: [root package](../package.json), [lockfile](../package-lock.json),
[Worker package](../infra/doji-orchestrator/package.json),
[identity package](../infra/portal-identity-candidate/package.json).
Do not upgrade packages merely to match a tutorial.

## How requests connect

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
| `infra/portal-identity-candidate/` | Live employee modules and unfinished business replacement; name is historical |
| `website/` | Public, admin, business, safety sources and separate build scripts |
| `__tests__/`, `lib/__tests__/`, `website/*/e2e/` | App/contract/browser regressions |
| `scripts/` | Mixed local tools and historical production operations; inspect before executing |
| `docs/`, `docs/drafts/` | Handbook, designs, release evidence and SQL; not all drafts are unapplied |
| `.github/workflows/quality.yml` | Quality workflow, not automatic deployment |
| `test-results/`, generated website output | Local artifacts/evidence; not automatically available or safe to share |
| `.artifacts/`, `credentials/`, `.env.local` | Sensitive/local material, not a developer handoff bundle |
| `android/`, `ios/`, `.expo/`, `node_modules/` | Generated/dependency state, not source authority |

## Design system

Mobile uses `constants/theme.ts`, `ThemeContext`, `components/ui` and shared
avatar/frame components. Reuse `AppDialog`, `AppSheetModal`, keyboard-aware fields
and `ReadFailureFeedback`; preserve light/dark, accessibility and Reduce Motion.

Portals share `website/portal.css` and `website/portal-select.mts` (emitted as `.js`). Records open in
right-side drawers; creation and consequential confirmations use established
modals. Main CTAs align right. Show labelled original submission fields, not JSON.
Preserve dirty drafts, block proven stale revisions and clear protected state on
lock/logout. See [Portal UI patterns](PORTAL_UI_PATTERNS.md).
