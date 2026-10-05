# Service catalog

This is the navigation and responsibility map for services found in the audited
source and release records. URLs and project names are identifiers, **not access
grants**. Ask the owner for named, task-scoped access. No service's current billing
allowance, account membership or availability was freshly verified for this doc.
Existing plans are not permission to incur new costs.

## Hosting and product operations

| Service | What Doji uses it for | Dashboard and identifiers | Source or evidence |
| --- | --- | --- | --- |
| GitHub | Source/reviews and checked-in quality workflow | Owner-provided repository invitation | `.github/workflows/quality.yml`; never share a credential-bearing Git remote |
| Supabase | Postgres, member Auth, Storage, Edge Functions, Vault and protected database APIs | [Project dashboard](https://supabase.com/dashboard/project/tvixsmqxotuvyjqzmjla); project `tvixsmqxotuvyjqzmjla` | `supabase/`, `lib/supabase.ts`, `types/database.ts` |
| Cloudflare DNS and Pages | DNS for Doji web properties; independent public/admin/business artifacts | [Dashboard](https://dash.cloudflare.com/); Pages `doji-site`, `doji-admin`, `doji-business` | `website/`, corresponding release records |
| Cloudflare Workers and Durable Objects | Member gateways, one-shot event alarms, relay, push coordination, maintenance and health | Worker `doji-orchestrator`; `https://doji-orchestrator.faheygs.workers.dev` | `infra/doji-orchestrator/wrangler.jsonc`, `src/` |
| Cloudflare Turnstile | Server-validated abuse protection for public safety and business admission | Exact host-scoped widgets in Cloudflare | `safety-removal`, `business-auth`, dedicated frontend configs |
| Ably | Capability-scoped realtime invalidation, not a database | [Dashboard](https://ably.com/dashboard); owner identifies the production app before granting access | `lib/realtimeClient.ts`, `realtime-token`, relay and employee resource signer |
| WorkOS AuthKit | Independent employee login/password/MFA; business replacement under preparation | [Dashboard](https://dashboard.workos.com/); separate employee/business staging and production environments | `infra/portal-identity-candidate/`, account separation record |
| Expo and EAS | Native development builds, cloud build/signing, store submission and legacy push fallback transport | [Project](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app); project `064b68b6-f138-4962-8aeb-f00970ba39c8` | `app.json`, `eas.json`, `.easignore`, `scripts/verify-build-env.mjs` |
| Apple Developer and App Store Connect | Bundle/signing, APNs credentials, TestFlight, review and iOS distribution | [Developer](https://developer.apple.com/account/), [App Store Connect](https://appstoreconnect.apple.com/); app `6768727326` | `docs/APP_STORE_RELEASE.md`, mobile release records |
| Google Play Console | Android signing/distribution, closed testing and production-access review | [App console](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312); Alpha track `4699325792611215201` | `docs/GOOGLE_PLAY_RELEASE.md`, Android 23 record |
| Firebase and Google Cloud | Android native FCM push; service identity/IAM | [Firebase](https://console.firebase.google.com/); project `doji-connect` | `google-services.json`, `_shared/fcm-push.ts` |
| APNs | Native iOS remote notification transport | Apple-managed provider; no separate app inbox | `_shared/apns-push.ts`, installation registration |
| Sentry | App/Worker errors, bounded diagnostics and source maps; portal health read | [Sentry](https://sentry.io/); organization `doji-i0`, app project `react-native` | `app/_layout.tsx`, `lib/apiFailureTelemetry.ts`, Worker `sentry.ts`, employee health |

The app's bundle identifier and Android package are both `com.doit.challengeapp`.
Store listing branding is Doji Connect; installed app branding is Doji. Refer to
current consoles before deciding availability, review state or enforcement.

## Email systems are different things

| Path | Current responsibility | Do not confuse it with |
| --- | --- | --- |
| Resend | Existing service/operational mail and released Supabase-based business verification/recovery | Employee inbox hosting or proof of delivery from an API success |
| Cloudflare safety sender | Dedicated minimal urgent-intake alerts to an approved verified destination | A general bulk-mail or employee mailbox service |
| Cloudflare Email Routing | Existing support routing; selected approach for new `name@dojipro.com` employee forwarding | A mailbox that stores mail or automatically sends replies as that address |
| WorkOS hosted email | Separate employee invitation/recovery flow in AuthKit | Supabase member password reset or a company mailbox |
| Supabase member Auth mail | Member confirmation/recovery path controlled by Auth configuration | The custom business or employee identity handlers |

Dashboards: [Resend](https://resend.com/), [Cloudflare](https://dash.cloudflare.com/),
[WorkOS](https://dashboard.workos.com/), [Supabase Auth](https://supabase.com/dashboard/project/tvixsmqxotuvyjqzmjla).
Provider-specific SMTP configuration and current allowances must be checked under
authorized access; this guide does not assume them from a sender address.

Employee forwarding is selected but new developer addresses are not yet confirmed
created. Ordinary replies use the destination mailbox identity. Keep application
alerts, support routing and employee forwarding separate when changing DNS; moving
MX records can affect every address on the domain. Do not share private alert
recipients or message bodies in broad diagnostics.

## Employee identity placement

The approved independent employee production environment is
`environment_01M3VE4WMDRZ1VBVS5MNVVF19J`, client
`client_01M3VE4WTBYS2XN6NZPH9EDMQD`. These are public identifiers, not credentials.
The employee runtime pins its expected origin, realm, issuer/audience and verified
subject, requires MFA, and maps to an existing internal staff identity.

The production admin browser calls same-origin `/auth/start`, `/auth/complete`,
`/auth/logout`, `/api/session` and `/api/rpc`. The Pages Worker forwards only
reviewed routes to `employee-portal-v2` with a server-only proxy key. It does not
expose WorkOS tokens or database credentials. `/identity/setup-complete` strips
provider codes and never treats a redirect as authority to grant access.

Business WorkOS source and separate directories exist but are not the live
business portal login. Do not switch a client ID, reuse an employee directory, or
infer a production mapping from an email match. Detailed sequence and rollback:
[Account separation record](ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md).

## Edge function inventory

All named entrypoint folders found at audit are listed below. Presence in source
does not establish current cloud flags or deployment. `_shared/` contains helpers,
not independently deployed functions. Gateway `verify_jwt=false` means the handler
owns authorization; it does **not** mean the endpoint is unrestricted.

| Function | Responsibility and boundary |
| --- | --- |
| `schedule-daily-challenge` | Internal event preparation and exact alarm registration; orchestrator-secret protected |
| `orchestrate-doji` | Authoritative phase transition work invoked by the durable event owner |
| `relay-domain-events` | Leased transactional outbox delivery, Ably publication and eligible push work |
| `fanout-doji-push` | Bounded global launch fanout/shard work owned by durable delivery |
| `realtime-token` | Existing member/legacy employee capability issuance; not the new WorkOS browser login |
| `delete-account` | Authorized member-account deletion and evidence-safe cleanup |
| `run-data-maintenance` | Bounded retention/cleanup respecting media/evidence holds |
| `operational-health` | Protected health archive/monitor operations; not a portal presentation refresh |
| `send-admin-email` | Protected, deduplicated operational/moderation alerts through Resend |
| `safety-removal` | Public intake/status with feature/origin/Turnstile and narrow private RPC checks |
| `safety-removal-alerts` | Dedicated leased urgent-case email delivery through Cloudflare |
| `moderation-media` | Exact-object evidence/removal/revocation/restoration worker; not a general storage API |
| `business-auth` | Released dedicated Supabase-based business signup/verification/recovery boundary |
| `business-realtime-token` | Prepared exact-business capability issuer; business realtime launch remains gated |
| `employee-register` | Earlier Supabase employee enrollment path retained in source; not current root onboarding |
| `employee-signin` | Earlier Supabase employee sign-in path retained in source; do not re-enable as a shortcut |
| `employee-portal-v2` | Live independent WorkOS employee gateway, durable sessions and restricted application adapter |

`employee-portal-v2` has a special release assembly that copies reviewed runtime
modules inside the function artifact. Use its release record; do not assume a raw
directory deployment reproduces that verified package.

## Worker bindings

The checked-in Worker has **five** Durable Object bindings:

| Binding | Class | Role |
| --- | --- | --- |
| `DOJI_EVENT_ALARM` | `DojiEventAlarm` | Exact prelive/activation/close chain |
| `OUTBOX_RELAY_ALARM` | `OutboxRelayAlarm` | Singleton burst coalescing and durable outbox wake/retry |
| `PUSH_FANOUT_ALARM` | `PushFanoutAlarm` | Per-event fanout progress and terminal expiry |
| `DATA_MAINTENANCE_ALARM` | `DataMaintenanceAlarm` | Self-draining bounded cleanup |
| `HEALTH_MONITOR` | `HealthMonitor` | Singleton monitored health/recovery |

The one-minute Cloudflare cron invokes health monitoring, not a recurring challenge
dispatcher. Supabase's separately approved safety-email/media jobs check due work
every five minutes. See [Safety launch](SAFETY_LAUNCH_2026-09-29.md).

## Configuration placement

Only names and purposes belong in the repo. Actual secret values go into approved
environment-specific secret stores. Some public values are still environment-bound
and can route a local test to production if copied carelessly.

| Location | Names or configuration family | Rule |
| --- | --- | --- |
| Mobile `.env.local` / EAS public env | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_COMMAND_GATEWAY_URL`, `EXPO_PUBLIC_SCALE_READ_URL`, `EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_APP_ENV`, optional `EXPO_PUBLIC_RELEASE_CHANNEL` | Public/bundled values only; no service secrets |
| EAS build secrets | `SENTRY_AUTH_TOKEN`; remote signing/FCM submission credentials | Build/provider stores, never `EXPO_PUBLIC_*` or docs |
| Shared Worker | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional legacy `SUPABASE_JWT_SECRET`, `ORCHESTRATOR_SECRET`, `OUTBOX_RELAY_SECRET`, Sentry settings | No Supabase service-role key; exact allowlists/origins |
| Supabase Edge | Platform keys plus `ABLY_API_KEY`, orchestration/relay secrets, APNs/FCM credentials, `RESEND_API_KEY`, sender/alert configuration | Server-only; endpoint-specific authorization |
| Employee Pages production | `EMPLOYEE_V2_ENABLED`, `EMPLOYEE_V2_ENDPOINT`, secret `EMPLOYEE_V2_PROXY_KEY` | `doji-admin` only; preview must not inherit live credentials accidentally |
| Employee Edge | `EMPLOYEE_V2_ENABLED`, secret JSON `EMPLOYEE_V2_CONFIG`; server Storage/Ably credentials | Config includes restricted SQL, WorkOS, encryption/admission/proxy and monitoring material; never dump it |
| Business build | `DOJI_BUSINESS_*` public URL/key/Turnstile/legal versions and enabled flag | Built artifact isolated; no service key; realtime remains off |
| Admin build | `DOJI_ADMIN_*` output/public backend/feature flags and independent identity selector | Defaults do not reproduce the live root automatically; use reviewed artifact configuration |
| Safety artifact and Edge | `DOJI_SAFETY_CONFIG` public endpoint/site key; dedicated server gate/Turnstile/alert secrets | Source/preview defaults fail closed; no real submissions during UI tests |
| Database | Private realm/admission/session/RPC settings, permissions, Vault wake credentials | Feature visibility is not authorization; do not print Vault values |

Exact names come from the corresponding entrypoint/build script, not this overview.
See [Security and access](SECURITY_AND_ACCESS.md) for handling rules.

## Not current architecture or not launched

Retired production mobile environment names in `scripts/verify-build-env.mts`
(emitted as the dependency-free `verify-build-env.mjs` preinstall artifact)
include Railway/legacy API/socket, R2, Typesense and old Google-auth client IDs.
Do not restore them because they appear in old notes. Firebase for push is not
Google social login. No launched Stripe/RevenueCat business billing path is
established by this audit. Campaign, billing and business realtime flags remain
disabled in the recorded launch. WorkOS staging is not a full application staging
environment or a replacement for isolated database/storage/Worker resources.
