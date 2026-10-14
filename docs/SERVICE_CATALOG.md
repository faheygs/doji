# Service catalog

**Service inventory owner: Gavin Fahey. Source/release-record review: October 12,
2026.** This is the canonical list of external services and why Doji uses them.
Read it alongside the [system map](SYSTEM_MAP.md) for internal code ownership and
[current state](CURRENT_STATE_AND_GAPS.md) for release gates.

This is the navigation and responsibility map for services found in the audited
source and release records. URLs and project names are identifiers, **not access
grants**. Ask the owner for named, task-scoped access. No service's current billing
allowance, account membership or availability was freshly verified for this doc.
Existing plans are not permission to incur new costs.

The hosting/product rows describe established integrations, not a claim that every
feature is enabled. Prepared/gated, legacy and development-only uses are explicitly
called out below. Account administration belongs to the owner; engineering access
is granted per service and environment, never inherited from an admin-portal role.

## Hosting and product operations

| Service | What Doji uses it for | Dashboard and identifiers | Source or evidence |
| --- | --- | --- | --- |
| GitHub and GitHub Actions | Monorepo source, pull requests, protected main and application/database/web/coverage CI | Owner-provided repository invitation | [.github/workflows/quality.yml](../.github/workflows/quality.yml); source merge is not deployment |
| Supabase | Postgres, member Auth, Storage, Edge Functions, Vault and protected database APIs | [Project dashboard](https://supabase.com/dashboard/project/tvixsmqxotuvyjqzmjla); project `tvixsmqxotuvyjqzmjla` | `supabase/`, `lib/supabase.ts`, `types/database.ts` |
| Cloudflare DNS and Pages | DNS for Doji web properties; independent public/admin/business artifacts | [Dashboard](https://dash.cloudflare.com/); Pages `doji-site`, `doji-admin`, `doji-business` | `website/`, corresponding release records |
| Cloudflare Workers and Durable Objects | Member gateways, one-shot event alarms, relay, push coordination, maintenance and health | Worker `doji-orchestrator`; `https://doji-orchestrator.faheygs.workers.dev` | `infra/doji-orchestrator/wrangler.jsonc`, `src/` |
| Cloudflare Turnstile | Server-validated abuse protection for public safety and business admission | Exact host-scoped widgets in Cloudflare | `safety-removal`, `business-auth`, dedicated frontend configs |
| Ably | Capability-scoped realtime invalidation, not a database | [Dashboard](https://ably.com/dashboard); owner identifies the production app before granting access | `lib/realtimeClient.ts`, `realtime-token`, relay and employee resource signer |
| WorkOS | Independent employee and business identity/password/MFA behind Doji-owned portal UI | [Dashboard](https://dashboard.workos.com/); separate employee/business staging and production environments | `infra/portal-identity/`, owned-auth/onboarding records |
| Resend | Transactional email: member moderation notices, admin operational alerts, owned business password recovery and separately gated application notices | [Dashboard](https://resend.com/); business sending domain `mail.dojipro.com`; business sending key separate from shared email key | [Relay sender](../supabase/functions/relay-domain-events/index.ts), [admin sender](../supabase/functions/send-admin-email/index.ts), [business recovery](../infra/portal-identity/business-owned-recovery-email.mts), [application sender](../infra/business-email/dispatch.mts) |
| Cloudflare Email Routing / dedicated safety email API | Inbound support forwarding and selected employee-address forwarding; a separate narrow sender delivers urgent safety-intake alerts | Cloudflare account email configuration; owner approves exact destinations | [Safety transport](../supabase/functions/_shared/safety-removal-cloudflare.ts), [email release record](releases/CLOUDFLARE_SAFETY_EMAIL_2026-09-28.md); not general mailbox hosting |
| Expo and EAS | Native development builds, cloud build/signing, store submission and legacy push fallback transport | [Project](https://expo.dev/accounts/faheybaby/projects/doit-challenge-app); project `064b68b6-f138-4962-8aeb-f00970ba39c8` | `app.json`, `eas.json`, `.easignore`, `scripts/verify-build-env.mjs` |
| Apple Developer and App Store Connect | Bundle/signing, APNs credentials, TestFlight, review and iOS distribution | [Developer](https://developer.apple.com/account/), [App Store Connect](https://appstoreconnect.apple.com/); app `6768727326` | `docs/APP_STORE_RELEASE.md`, mobile release records |
| Google Play Console | Android signing/distribution, closed testing and production-access review | [App console](https://play.google.com/console/u/0/developers/6661342012009308283/app/4972908027141050312); Alpha track `4699325792611215201` | `docs/GOOGLE_PLAY_RELEASE.md`, Android 23 record |
| Firebase and Google Cloud | Android native FCM push; service identity/IAM | [Firebase](https://console.firebase.google.com/); project `doji-connect` | `google-services.json`, `_shared/fcm-push.ts` |
| APNs | Native iOS remote notification transport | Apple-managed provider; no separate app inbox | `_shared/apns-push.ts`, installation registration |
| Sentry | App/Worker errors, bounded diagnostics and source maps; portal health read | [Sentry](https://sentry.io/); organization `doji-i0`, app project `react-native` | `app/_layout.tsx`, `lib/apiFailureTelemetry.ts`, Worker `sentry.ts`, employee health |

The app's bundle identifier and Android package are both `com.doit.challengeapp`.
Store listing branding is Doji Connect; installed app branding is Doji. Refer to
current consoles before deciding availability, review state or enforcement.

## Responsibility boundaries and usage status

| Need | Service responsible | Status / what it does not own |
| --- | --- | --- |
| Member login, recovery, authoritative data and private media | Supabase Auth, Postgres and Storage | Current member boundary; WorkOS must not replace it. RLS/RPCs, not browser roles, authorize data. |
| Employee/business login and authenticator MFA | Separate WorkOS realms plus Doji's portal runtime | Current integration. Doji owns portal presentation, approval, permissions and session enforcement; WorkOS identity alone does not grant workspace access. |
| Public/admin/business websites | Cloudflare Pages (`doji-site`, `doji-admin`, `doji-business`) | Separate release artifacts. Vite/Next are build frameworks, not separate hosting vendors; the public Next site is a static export. |
| DNS, abuse protection and server coordination | Cloudflare DNS, Turnstile, Workers and Durable Objects | Separate Cloudflare products with separate responsibilities. One-shot alarms own challenge transitions; push delivery does not. |
| Connected-client updates | Ably | Current member realtime transport. Identifier hints trigger authorized reads; Ably is not database truth. Business realtime and the employee health event feed remain gated in the last release record. |
| Background phone notifications | Apple APNs and Firebase Cloud Messaging (FCM) | Primary native transports from the committed outbox. Expo push is only a bounded older-client fallback; acceptance by a provider is not proof the phone displayed an alert. |
| Build and distribute the native app | Expo/EAS, Apple Developer/App Store Connect, Google Play | EAS builds/signs/submits approved artifacts; Apple/Google own store review and distribution. A Git merge does not update installed apps. |
| Errors and diagnostics | Sentry | App/Worker reporting and source maps; bounded Sentry reads inform portal health. Not a complete uptime monitor or proof every user action succeeded. |
| Application email | Resend, dedicated Cloudflare safety sender, WorkOS and Supabase Auth mail paths | Different message families and credentials; see the routing table below. Business automatic application-mail capture/sending/wakeup remain off in the last acceptance record. |

## Development, testing and repository services

| Service or tool | Purpose and status | Evidence / boundary |
| --- | --- | --- |
| GitGuardian | Repository secret-scanning check observed on reviewed pull requests | [Handoff audit](releases/REPOSITORY_HANDOFF_AUDIT_2026-10-12.md); integration/settings live outside the app. Not runtime monitoring or proof that no secret exists. |
| npm registry | Downloads locked JavaScript/TypeScript dependencies for local and CI builds; dependency audit metadata | Root and `web/` package/lockfiles. Not app hosting; preserve the separate lockfiles and do not upgrade automatically. |
| ngrok via `@expo/ngrok` | Installed optional development-tunnel integration for Expo | [Root manifest](../package.json); not a production API/socket service or evidence that a tunnel is currently running. Opening a tunnel is not part of offline tests. |
| Gitleaks | Locally executed secret scanner used in the handoff audit | [Audit evidence](releases/REPOSITORY_HANDOFF_AUDIT_2026-10-12.md); a tool, not an additional hosted application backend. |

Jest, Playwright, Vitest, axe, TypeScript, ESLint, Docker/Podman, Android tooling,
MUI and TanStack Query are test/development tools or libraries, not extra hosted
production services. Their roles are in the [system map](SYSTEM_MAP.md) and
[test handoff](TEST_SUITE_HANDOFF.md). The local Android `test-lab.mts` probe tests
a Firebase Test Lab marker on an owned emulator; its name does not establish a
paid Firebase Test Lab subscription or an active cloud device-test service.

## Email systems are different things

| Path | Current responsibility | Do not confuse it with |
| --- | --- | --- |
| Resend | Service/operational mail, owned business recovery and separately gated business application mail | Employee inbox hosting or proof of delivery from an API success |
| Cloudflare safety sender | Dedicated minimal urgent-intake alerts to an approved verified destination | A general bulk-mail or employee mailbox service |
| Cloudflare Email Routing | Existing support routing; selected approach for new `name@dojipro.com` employee forwarding | A mailbox that stores mail or automatically sends replies as that address |
| WorkOS hosted email | Separate employee invitation/recovery flow in AuthKit | Supabase member password reset or a company mailbox |
| Supabase member Auth mail | Member confirmation/recovery path controlled by Auth configuration | The custom business or employee identity handlers |

The exact message routes are:

- Member moderation notices: `relay-domain-events` calls Resend; admin operational
  alerts use `send-admin-email` with Resend. Both use shared Doji email rendering.
- Business password recovery: WorkOS remains the identity authority, while
  `business-owned-recovery-email.mts` sends the Doji-owned reset email through
  Resend. The business policy requires WorkOS default reset mail to be suppressed;
  do not enable a second sender or substitute the employee/member reset flow.
- Business application/approval/setup notices: `business-application-mail` uses
  the private dispatcher in `infra/business-email/` and Resend. The
  sender is deployed, but automatic capture/sending/wakeup remain gated. A verified
  one-off test email is not permission to enable continuous sending.
- External safety intake alerts: `safety-removal-alerts` uses the dedicated
  Cloudflare sender, not Resend, with a verified approved destination and no
  submission details in the alert.
- Provider-owned verification/invitation/security email: WorkOS handles its
  employee/business message families; Supabase Auth controls member auth mail.
  Do not infer the configured SMTP transport from the visible sender address.
- Inbound support/work-address forwarding: Cloudflare Email Routing forwards to
  approved mailboxes. It does not store a mailbox or replace outbound senders.

Doji-owned email must use the logo, name, brand colors and button actions, with an
accessible plain-text alternative. Current business branding is deployed; shared
renderer changes and provider-managed templates have separate release status.
See [Email branding](releases/EMAIL_BRANDING_2026-10-11.md) rather than assuming all provider
emails are controlled by our renderer.

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

Business now uses its own live WorkOS realm through Doji-owned forms and the
business-only session boundary. Do not switch a client ID, reuse an employee directory, or
infer a production mapping from an email match. Detailed sequence and rollback:
[Account separation record](releases/ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md).

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
| `business-auth` | Retained earlier Supabase business boundary; not current WorkOS login; do not reactivate as a shortcut |
| `business-realtime-token` | Prepared exact-business capability issuer; business realtime launch remains gated |
| `employee-register` | Earlier Supabase employee enrollment path retained in source; not current root onboarding |
| `employee-signin` | Earlier Supabase employee sign-in path retained in source; do not re-enable as a shortcut |
| `employee-portal-v2` | Live independent WorkOS employee gateway, durable sessions and restricted application adapter |
| `business-portal-v2` | Independent WorkOS business gateway, owned auth/recovery, application/setup/MFA and restricted sessions |
| `business-application-mail` | Private business sender; capture/sending/wakeup disabled in last acceptance record |

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
every five minutes. See [Safety launch](releases/SAFETY_LAUNCH_2026-09-29.md).

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

SMS MFA/Twilio is not provisioned in the recorded current state. EAS Update/OTA
deployment is not established as an approved release path by this catalog; Expo
usage alone does not authorize publishing an update. Do not create or reactivate
any service just because its name appears in code, a dependency or a historical note.

## Keep the inventory current

Any change adding, replacing, retiring or enabling a service must update this
catalog and the affected system-map/current-state entries in the same change:

1. Name the provider/product, its exact purpose, affected app/portal and source entry.
2. Identify the owner-approved account/project/environment and dashboard, using
   public identifiers only; record where secrets belong, never their values.
3. State whether usage is current, gated/prepared, legacy or development-only.
4. Record data sent, authorization boundaries, operational dependency and failure
   behavior in the linked contract/release record; do not imply physical isolation.
5. Verify capacity/cost under separate authorization before enabling usage. Preserve
   release/rollback evidence and say which feature flags or acceptance gates remain.

When a provider setting cannot be confirmed from source, label it unverified and
obtain task-scoped access. Do not turn a documentation audit into provider changes,
email sends, cloud builds or deployment.
