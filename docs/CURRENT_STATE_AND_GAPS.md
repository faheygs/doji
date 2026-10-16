# Current state and handoff gaps

Reviewed October 16, 2026. This separates source, recorded deployments and owner
device reports; it is not a fresh probe of every production service. Owner: Gavin
Fahey. Repository access does not authorize cloud changes, spending or member actions.

## Current surfaces

| Surface | Recorded state | Boundary |
| --- | --- | --- |
| Member app | Owner reports iOS 1.0.10 and Android 1.0.11 (31) in use; Android signup retry succeeded | Older 1.0.9 / pending-1.0.10 records are historical, not current store status |
| Mobile source | Expo 57.0.30 compatible patches merged in PR #16; no new mobile build started for admin staging | Verify the exact platform artifact manifest before claiming a source fix is installed |
| Update policy | Owner requested Android 1.0.11 / iOS 1.0.10 minimums | Live policy and store availability were not rechecked in this admin release; do not replay October 7 enforcement |
| Admin production | React/Vite/MUI, employee WorkOS + MFA; sign-out recovery recorded as runtime v24 | Member Supabase Auth and mobile sessions are separate |
| Admin staging | Same frontend; shared employee identity, separate WorkOS application, database, sessions and grants | Hosted login/MFA and representative workflows verified; local impersonation is not shipped to hosted sites |
| Business | Owned React/MUI login, independent WorkOS realm; owner completed application, approval, QR MFA, branding and workspace | Test account retained; public admission, campaigns/billing and realtime remain gated |
| Business email | Branded renderer/runtime deployed | Automatic capture/sending/wakeup remain off; no uncertain-mail auto-resend |
| Public site | Next.js static export with retained legal/safety controllers | No Next server; safety uses its own private receipt/status contracts |
| Shared email branding | Shared/employee renderer changes prepared | Shared/member deployment and provider-owned templates remain separate |
| Health | Bounded delivery/history and Sentry reads | Health event feed disabled; not whole-platform uptime or crash-free-session measurement |

The [mobile build record](releases/MOBILE_RECOVERY_BUILDS_2026-10-12.md) identifies
the frozen 1.0.10 artifacts. [Native lifecycle preparation](releases/MOBILE_READ_LIFECYCLE_PREPARATION_2026-10-12.md)
describes subsequent source; its inclusion must be checked per platform, not inferred
from main. Android username/avatar signup success is an owner report, not proof of
every device or network path. No mobile build is required to release admin Pages.

Employee sign-out recovery and its retained v23 inverse are recorded in
[the employee release](releases/EMPLOYEE_LOGOUT_RECOVERY_2026-10-13.md).

Gateway read recovery (live October 15, 8:46 PM MDT): request-owned origin reads replace
cross-request pending promises; public-key caching stores completed data only.
A six-second gateway budget bounds authentication, cache and origin/body waits
before existing clients' eight-second deadline. Failures identify their phase
without logging credentials or payloads. Simultaneous identical cache misses now
issue independent authorized RPCs; the existing member budget and short response
cache remain. Live version `94343e0b-1447-495b-98c8-1db492864abe` serves 100%;
rollback version `bb415821-fbe9-4d74-8716-7b36ef24a7fa` and its source are retained.
The owner approved the separate production deployment. The narrow package
preserves all baseline code outside the read/authentication blocks. Local workerd
acceptance passed for stalled public-key/header/body recovery, cache isolation and
40 simultaneous synthetic reads; 60 targeted Jest suites / 1,607 tests passed.
Existing client retries and explicit retry recover within the same QueryClient.
Downloaded production source matches the tested package; settings, secret binding
names, five Durable Object namespaces and schedules are unchanged. The bounded
release-window read found no active event, overdue outbox work or lock waits.
Existing Workers Paid capacity was checked; no plan/resource upgrade was made.
Hosted absent/invalid-token reads return 401/no-store. A real signed-in device
feed-load/post-submission acceptance check remains outstanding; local synthetic
burst checks are not a production load qualification. Private release/configuration
receipts and rollback are in `test-results/gateway-read-recovery-20261015/`.
This addresses demonstrated recovery gaps, not proof of the initial cause of the
October 15 canceled requests. No mobile binary, database, write, challenge-timing,
push or portal source was deployed with this patch. Source is not yet merged.

## Admin development and release status

- Staging database: `ohrcupagdoilkwhecict`, Free `doji-staging` organization,
  Canada Central. Reconciled schema and synthetic member data; no production
  member identities, passwords or media copied. Do not reset or replay its baseline.
- Hosted staging: `admin-staging.dojipro.com`, employee Edge v8 and separate
  Pages project. Existing employee password/MFA works through a dedicated WorkOS
  application/audience. Gavin and Kedd have explicit staging Super Admin grants;
  other production staff do not gain staging access automatically.
- Local development: `npm run dev:admin:staging` uses the private developer
  gateway and staging employee directory without MFA. Only the owner's token has
  directory access. Its initial expiry is January 13, 2027; non-expiring revocable
  credentials are supported/tested, but no live expiry was changed. Hosted MFA
  remains mandatory. `dev:admin` is a separate offline sample-data preview.
- Verification: local selection/switching, reload, writes/replay/audit and revocation
  passed against disposable PostgreSQL; live staging selection and hosted
  idea review/history/audit, report/business assignment and session restoration passed.
- Enabled staging scope: internal admin workflows with labelled synthetic records.
  Email, push, scheduling, realtime, monitoring integrations and member signup are
  disconnected. Business/site/mobile staging and full-stack restore are deferred.
- Release pipeline: PR #15 merged as `e347f4f`; all four exact-head and main
  quality jobs passed. Run `38947921226` automatically deployed Pages
  `2d75152f-260f-409e-8f1b-1e010a865b7d`. Docs-only main run `38953049163`
  correctly skipped packaging/deployment.
- Production promotion: downloaded package/receipt/provenance checks passed.
  The production action has not yet run. It requires owner approval and promotes
  the staged frontend without rebuilding; it changes no SQL, Edge runtime,
  shared Worker, mobile, business or public-site deployment.
- Handoff: Kedd's developer credential, vault delivery and messages are held.
  Owner reports Bitwarden organization/MFA setup; scoped project access/import
  remain unverified. Do not send invitations or share the owner's credential.

Use [local development and promotion](LOCAL_DEVELOPMENT.md#admin-deployment-workflow)
for commands, [security/access](SECURITY_AND_ACCESS.md#shared-development-vault)
for handoff, and [staging acceptance/rollback](releases/STAGING_DATABASE_BASELINE_2026-10-14.md)
for exact artifacts. The [service catalog](SERVICE_CATALOG.md) owns provider purposes
and secret locations; the [system map](SYSTEM_MAP.md) owns source boundaries.

## Remaining gates

| Before doing this | Required evidence/approval |
| --- | --- |
| Merge source | All four exact-head CI jobs and all 17 coverage budgets; preserve unrelated dirty work |
| Promote admin production | Verified staging artifact, current capacity/bindings, retained rollback, owner environment approval and hosted acceptance |
| Build/release mobile | Included capacity, unused version/build allocation, exact candidate tests, source-map verification and physical-device acceptance |
| Open business admission or enable mail/realtime/campaigns/billing | Separate policy/cost/isolation review and retaining rollback |
| Enable health events | Approved shared impact/capacity plan; no polling substitute |
| Add email/SMS MFA | Separate security policy; email proof is not authenticator MFA, SMS not provisioned |
| Reconstruct schema | Reconcile deployed overlays with migration history; raw migrations alone are not live-schema parity |
| Grant developer access | Named employee/vendor access, scoped revocable credential and owner-approved vault handoff |
| Claim root cause, security or capacity | Fresh correlated evidence; tests, old audits and models are not production qualification |

## Evidence and maintenance

[Release index](releases/README.md) retains artifact identities, rollback and dated
acceptance; [test handoff](TEST_SUITE_HANDOFF.md) defines current gates. Historical
notes are not commands to rerun. Retained `website/` controllers are active React
dependencies, not disposable legacy code. Keep current guidance here, service/source
ownership in their guides, and compact release evidence in the existing records.
A merge may automatically deploy admin staging; it does not release other systems
or approve production promotion.
