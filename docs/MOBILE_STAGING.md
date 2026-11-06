# Mobile staging and release workflow

One codebase and protected `main`; independently installed Development, Staging
and Production apps. Source preparation is not hosted parity, a build launch or
permission to send notifications. The Sentry failure-email investigation is closed;
short resolved incidents can intentionally have recovery mail without failure mail.

## Current implementation boundary

`app.config.ts` selects `DOJI_APP_VARIANT` (default `development`) and rejects
conflicting EAS profiles. Production returns the existing `app.json` configuration.
The production build guard and store submission profiles remain unchanged.

| Variant | EAS profile/environment | App ID / URL scheme | Connections |
| --- | --- | --- | --- |
| Doji Dev | `development` / `development` | `com.doit.challengeapp.development` / `doji-dev` | Staging only; development client |
| Doji Staging | `staging` (or compatibility alias `preview`) / `preview` | `com.doit.challengeapp.staging` / `doji-staging` | Staging only; internal distribution |
| Doji | `production` / `production` | `com.doit.challengeapp` / `doit` | Existing production policy |

Non-production uses a distinct violet/orange STG icon. The deterministic generator
is `scripts/mobile-staging-icon.mts`; it never edits production icons. Separate app
IDs isolate installed storage and sessions. No new OTA service/channel is enabled;
staging explicitly disables updates so a later production update URL cannot leak in.

Local Dev means Fast Refresh on both Android emulator and the owner's physical
iPhone from the same working repository/Metro server; it is not a standalone
staging build. `npm run dev:mobile` validates private local client configuration;
`--lan` permits the trusted-network iPhone connection. Each device needs its Dev
client installed once and rebuilt for native changes. Standalone Staging builds
must run without Metro on both platforms. Restrict iOS Dev/Staging provisioning to
the owner's iPhone; do not add existing internal TestFlight testers. Windows can
serve both platforms but needs macOS or an approved cloud build for native iOS.
See [local development](LOCAL_DEVELOPMENT.md#everyday-android-and-iphone-fast-refresh).

`plugins/mobileEnvironment.cts` fences database, read/command gateways, public anon
JWT project/role, Sentry project, build number and public secret-like variables.
The JWT check verifies configuration claims, not a signature; Supabase still owns
member authentication. Missing configuration fails closed. The dependency-free
preinstall artifact loads this local typed policy under pinned Node 24, before npm
packages exist. Android diagnostics use the selected environment's exact hosts.

## Dependency and qualification checklist

| Boundary / owner | Staging destination and isolation | Acceptance still required |
| --- | --- | --- |
| Member auth / `lib/supabase.ts` | Supabase `ohrcupagdoilkwhecict`; never WorkOS | Owner confirmed normal signup/profile, restoration and sign-out/sign-in on iPhone and emulator. Account switching and recovery remain unqualified |
| Commands and reads / gateway clients | `doji-orchestrator-staging.faheygs.workers.dev`; member JWT/RLS | Exact deployed source/contracts and authorized/denied reads, idempotent writes, interrupted explicit retries |
| Storage / `lib/postMedia.ts` | Same staging project's private buckets and reservations | Upload/resume/signing/denial/cleanup. Transform flag is off for Free staging: this is a documented production difference, not transform parity |
| Realtime / `realtime-token` | Existing isolated Ably app `eVKl2g`, server-only scoped key | Member capabilities, invalidation, reconnect, account fencing and current usage authorization; existing admin acceptance is insufficient |
| Lifecycle / Worker + SQL | Existing staging five Durable Objects and one-shot alarms | Photo completion/single reward/natural 600-second close passed on both clients. Build 3 pre-live countdown/return passed by owner report; activation/close preserved grace. In-challenge timer, poll/format and interrupted identical retry remain unqualified |
| Native push / Firebase + APNs | Separate Firebase project/client and app-specific Apple signing/provider destination | Provision and verify isolated credentials; approved device allowlist; physical receipt/navigation. Sending and client token registration remain off |
| Sentry / app config | Existing `doji-staging` project `4512328707342336`; environment `staging` | Exact native source-map Debug IDs, error privacy and capacity; build-only upload token never enters public config |
| Device reports / existing ingestion | Staging member-authenticated endpoint/private SQL; binary, Edge and SQL gates independent | Endpoint synthetic qualification exists; enable only after approval, verify real Android/iOS reports and admin display, replay/rate/account/disable behavior |
| Economy / existing RPCs | Staging ledger and synthetic balances, same atomic rules | Purchases/buy-in/reward uniqueness and rollback behavior; no external payment SDK identified in current mobile source |
| Public support/legal links | Existing public Doji documents | Intentional shared read-only destination, not staging member data or a permission to send support messages |

## Configuration and credentials

The `doji-staging` Firebase project is provisioned on Spark ($0/month), with
Analytics and Gemini disabled. Its Android development/staging clients are registered;
their client files are retained outside Git under the owner's private
`Doji/mobile-staging/2026-11-05` directory and byte-verified in EAS `development`/
`preview` with the staging project ID. Firebase's multi-app download is reduced to
the selected variant's single client before upload. Apple team `HUG35JPQGG` has
registered `com.doit.challengeapp.staging` and `com.doit.challengeapp.development`
with Push Notifications capability. Separate ad-hoc Dev/Staging profiles now use
the existing team distribution certificate and contain only the owner's confirmed
iPhone. Their embedded IPA profiles were verified; no certificate was rotated or
push-provider key created. No existing TestFlight group receives these builds.
Push delivery qualification remains pending.
Android development and staging now have separate default signing keys in EAS,
with distinct certificate fingerprints from each other and production. Exact
readback verified both bindings and unchanged production signing metadata. Protected
local backups and receipts are under `Doji/mobile-staging/2026-11-05/android-signing`,
restricted to the owner and SYSTEM; do not rotate or replace them for each build.
GitHub `mobile-staging` exists with `faheygs` as required reviewer and a `main`
branch-only policy. No build job or credentials have been attached to that gate.

The two original Auth-only fixtures passed API sign-in/refresh/logout and bounded
gateway reads, but that did not establish complete accounts. Native profile creation
for `mobile-one@test.invalid` returned `P0001`: required signup legal acceptance was
missing. The owner requested its removal; exact Auth deletion and subsequent 404
were verified, with no profile or owned media. Only Doji Dev app data was cleared.
`mobile-two@test.invalid` and three baseline fixtures remain unchanged. The restricted
`member-accounts` directory retains the removal receipt and prior evidence; account-1
credentials are obsolete, not a working login. Do not recreate Auth-only accounts
or fabricate consent. Testing uses normal in-app signup and the atomic profile
command. Staging accepts ordinary syntactically valid test email addresses; no
Gmail alias format or email confirmation is required. This matches production's
verified auto-confirmation setting. Before User Created calls the unchanged
`hook_enforce_minimum_signup_age` directly, preserving the 13-plus check and normal
profile consent. The historical `staging_mobile_signup_v1.sql` alias wrapper and
its tests remain for rollback evidence but its hosted binding is retired.
The owner confirmed signup/profile, session restoration and sign-out/sign-in on
both Staging clients. The subsequent photo test passed completion/feed/rewards but
exposed a countdown/grace defect; its correction and remaining device acceptance
are recorded in [current state](CURRENT_STATE_AND_GAPS.md).
The deadline-trigger correction is qualified and deployed in staging only. The
approved Staging build 3 pair uses exact reviewed source `906006d`; both updates
retained accounts and opened normally. The owner confirmed iPhone pre-live
countdown/background return and Android countdown behavior. Natural activation
and close preserved both signup-day deadlines. The first-day banner intentionally
has no timer; in-challenge timer confirmation remains pending. Do not equate a
passing rollback fixture or cloud build with complete physical-device acceptance.

Signup sends no confirmation email. Recovery and email-change routing are still
unqualified: do not exercise them against arbitrary test destinations. An approved
test inbox/mail sink is a separate follow-up for those paths, not a signup prerequisite.
Do not infer delivery safety merely because account data lives in staging.

`lib/signupOptions.ts` prepares exact `doji-dev://login` and `doji-staging://login`
confirmation destinations after checking the variant/scheme/staging project;
production signup options are unchanged. These two exact URLs are allowed in staging
Auth; `doji-staging://login` is the default. These retained destinations do not
require confirmation when Auth auto-confirmation is enabled. Existing `7513c6d`
artifacts need no rebuild for the corrected server-side signup configuration.
Resend's signed-in November 5 check showed Free transactional usage of 0/3,000
monthly and 0/100 daily, pay-as-you-go off, and verified `mail.dojipro.com`.
The separately approved `Doji mobile staging auth` sending-only key is saved only
in protected staging Supabase Auth SMTP: `smtp.resend.com:465`, sender
`staging-auth@mail.dojipro.com`, display name `Doji Staging`. Saved configuration
was verified, not provider acceptance or inbox delivery; activation sent no mail.
Rollback disables custom SMTP and revokes only this key, leaving other senders
unchanged. Recheck capacity at activation; these are not reserved quotas.
Preserve the existing age function and legal checks. The signup-setting rollback
retains the prior two values outside Git; do not reset staging, revoke sessions
or alter production as a configuration rollback.

Android acceptance currently uses the owner-approved `Doji_Staging_API_36` emulator:
Pixel 8 profile, Android 16/API 36 Google Play image, hardware acceleration and boot
verified. Doji Dev and the separately signed Doji Staging APK are installed.
Local JDK 17 compilation and Metro startup reached member sign-in; authenticated
acceptance is pending. Emulator checks do not qualify physical
camera, background delivery or device push. See [local setup](LOCAL_DEVELOPMENT.md#android-staging-emulator).

EAS `development` and `preview` public URL/anon key/DSN were read back against the
staging destinations. Production variable IDs, values and visibility match the
retained baseline. The formerly shared production DSN/upload token are now scoped
only to production. The separately approved `Doji staging mobile source maps`
organization token is stored as secret `SENTRY_AUTH_TOKEN` only in development and
preview. Its `org:ci` permission is organization-wide; the build configuration targets
`doji-staging`, not a provider-enforced project restriction. The single approved
Android staging build `a076b3c7-8cf7-4627-bd22-f1004d61cb75` succeeded from reviewed
source `190d88294aeaa664318e8cd91049025a7065b12a`. It uses
`com.doit.challengeapp.staging`, version `1.0.8` / build `1` (a separate staging
counter, not the current store version). APK SHA-256 is
`3d6d50482e83f43c44237f407c172bc926a7c7ffdb4aefe0f1ea1187358bb136`;
its certificate matches the retained staging key. Sentry's upload report confirms
`doji-staging`, release `com.doit.challengeapp.staging@1.0.8+1`, dist `1`, and matching
bundle/map Debug ID `12a1fdfa-c9e4-405a-b4cf-96b66d9c39cf`. This verifies upload,
not symbolication of a captured device error. Exact APK/build/config/log receipts
are private under `Doji/mobile-staging/2026-11-05/android-build-1`.
The November 6 owner-approved batch uses exact reviewed `7513c6d`, with passing
main CI `42169655623`: iPhone Dev build 1 and both Staging build 2 artifacts are
complete. The refreshed Android APK matches the previous staging certificate,
is installed, and cold-started successfully with Metro stopped. The owner confirmed iPhone Dev
Fast Refresh and restoration without reload, then repeated Staging startup while
Metro was stopped. See the [current build receipt](releases/README.md#november-6-mobile-development-and-staging-builds).
No production build, store submission, push or device reporting was enabled.
Expo prohibits reducing
secret visibility, so two prior preview Supabase
variables are retained as `DOJI_ROLLBACK_20261105_*`, never referenced by app code.
Their original names/IDs and configuration fingerprints are retained privately;
remove these rollback entries only after replacement qualification and owner approval.

Create `.env.local` from `.env.example` only if absent; never replace an owner's file
or pull production environment values for development. EAS `development` and
`preview` must receive staging public URL/anon key/DSN only. Public variables are
bundled and are not secret storage. Privileged provider keys stay server-side.

Every cloud staging build requires an explicitly allocated positive
`DOJI_STAGING_BUILD_NUMBER` (same integer for iOS/Android, maximum 2147483647).
Check prior builds for the corresponding app ID before reserving it. Do not reuse
production counters or infer current store version from the historical `app.json`.
`DOJI_STAGING_GOOGLE_SERVICES_FILE` is a protected EAS file setting and
`DOJI_STAGING_FIREBASE_PROJECT_ID` must match its separately verified project.
The file must contain only the selected variant's Android client, not the production
client/project. Local native builds need the equivalent reviewed file, not a copy
of production `google-services.json`. The build-only Sentry upload token goes in
protected EAS configuration with the minimum applicable upload rights.

`EXPO_PUBLIC_STAGING_PUSH_ENABLED` and workflow reporting remain `false` in both
staging profiles. Enabling push requires verified provider configuration, approved
test devices, server delivery gates and explicit `EXPO_PUBLIC_APNS_ENVIRONMENT`.
An internal/ad-hoc signed build uses APNs **production** transport even when its
database is staging; locally development-signed builds may use sandbox. Never infer
APNs signing from a database label. Existing production push behavior is unchanged.

## CI/CD and release gates

1. A short-lived branch runs all four existing quality jobs/security and 17 coverage
   budgets, plus synthetic variant/candidate/native-binding tests. No cloud build
   on PR or merge. Main remains PR-only with exact-head protections.
   The existing `build-bootstrap.test.mts` strict-tooling entry point includes those
   mobile checks; no shared deployment workflow change is needed.
2. From a clean reviewed checkout, the read-only source preflight is
   `node scripts/mobile-candidate-ci.mts <exact-main-sha> <passing-main-quality-run-id>`.
   It needs read-only `GH_TOKEN`, verifies trusted exact main/run/jobs, and explicitly
   returns `cloudBuildAuthorized: false`. It cannot dispatch or submit anything.
3. Before enabling a manual cloud-build runner, qualify the dependency checklist,
   verify protected `mobile-staging` approval and provision narrowly scoped Expo credentials,
   check fresh credits/capacity, reserve build numbers, and obtain owner build approval.
   That runner is **not installed yet**. Credentials, signing, device registration,
   provider changes and cloud builds are separate activation gates, not effects of
   merging this foundation. No automatic retry after an uncertain build submission.
4. Record the exact SHA, config fingerprint, native IDs, versions, build IDs,
   artifact digests, source-map identity and backend versions. Install only those
   internal artifacts on approved Android/iOS devices. Passing mocks do not qualify
   camera, keyboard, native transport, push or background behavior.
5. Record both platforms' sign-in/restore/switch/logout, all Doji types and timing,
   upload interruption/explicit replay, receipt/direct-to-feed, social/profile/economy,
   offline/foreground recovery, permitted push/navigation and telemetry checks.
6. Only after staging acceptance, separately approve production-compatible backend
   changes and a production-configured build from that same qualified source. Test
   the final production binary in restricted distribution, then approve release of
   that exact binary. A staging binary cannot be promoted into the production app.

Use current account allowances, not historical balances. Existing subscriptions do
not imply free incremental Ably usage; no extra spending is authorized. Stop before
launch if build retries or provider activity require more budget. Keep production
and staging signing, state, credentials and release approvals distinct.

## Rollback, evidence and handoff

Disable staging capture/ingestion and delivery first; retain observations and
incident history. Retain exact previous backend/configuration packages before any
authorized change. An installed native binary cannot be instantly rolled back:
disable new gates, stop distribution and ship a separately qualified correction.
Never reset staging or erase evidence to make acceptance pass. Synthetic-account
and media cleanup must name owned fixtures, respect holds and leave no real member
data involved. Keep receipts/credentials outside Git and only concise status links
in current guidance. Developer access grants remain separately owner-approved.

Completion requires hosted dependencies, Android emulator and iOS device acceptance,
explicitly recorded physical-Android gaps, approved reporting acceptance, the
protected build/release runner and documented handoff. Emulator results must not
be represented as physical-device parity.
The configuration foundation alone does not satisfy those conditions.

References: [Expo variants](https://docs.expo.dev/build-reference/variants/),
[environment separation](https://docs.expo.dev/eas/environment-variables/),
[CI prerequisites](https://docs.expo.dev/build/building-on-ci/).
