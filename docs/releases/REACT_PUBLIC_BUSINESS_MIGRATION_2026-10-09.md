# Public and business frontend migration — October 9, 2026

## Follow-up: owner-approved new-account acceptance window

At 23:06 MDT on October 9, business Pages was updated to
`4aa1a67a-afa9-49d9-ad1d-8a2c5014c7f5`. Only
`react-business/20261010a/release-config.js` differs from the migration package.
Admin/public deployment IDs, project settings, application bundles and proxy are
unchanged. This supersedes the expired-pilot notice below for a limited window.

The owner approved reopening registration for their new-account check. Existing
`business_session_private.settings` registration and
`portal_identity_private.business_enrollment_settings` enrollment caps now allow
one additional reservation/account: lifetime limits 2, both counters retained at 1.
Both expire `2026-10-10T07:03:14.688Z` (October 10, 01:03 MDT). The setting is
capacity-limited, not email-allowlisted: do not describe the slot as identity-reserved.
No prior account was changed and no counter was reset. WorkOS verification emails
remain part of normal user-initiated signup; the separate business email queue was
not enabled. No agent-created provider user, submitted application or email occurred.

Preparation recorded the prior policy and protected member/employee fingerprints.
Transactional rehearsals verified scope denial, one-slot acceptance, exact replay,
changed-replay denial, cap exhaustion, expiry and exact retaining rollback. All
rehearsal writes rolled back. Twelve exact-package browser checks then passed,
including before/after-cutoff behavior and consent/provider handoff; eight hosted
checks passed after release. Activation was outside the challenge guard window.
Member/employee contracts, RLS, roles and protected settings matched before/after.
Shared infrastructure remains shared; this is not proof of zero transient risk.

Evidence: `test-results/react-business-migration-6PLoSb/`. Use
`scripts/reopen-business-registration.mts freeze test-results/react-business-migration-6PLoSb`
for a guarded early closure: it restores prior expired dates/caps, preserves consumed
counters/accounts and leaves existing sign-in enabled. The saved `freeze-admission.sql`
is the equivalent transaction; both reject a newer admission policy. Do not rerun
activation or reset counters after an ambiguous signup. Static rollback is the prior
business deployment `36a323ad-2955-4c12-a7d3-d17694cf37ba` with exact artifact
`test-results/react-business-migration-k7dAwl/site`. Neither rollback revokes member
or employee sessions. Server expiry closes admission without polling or a scheduler.

The release comparison now normalizes SQL timestamp formatting before comparing
the same four admission fields; equivalent text timestamps are not policy drift.
Authenticated new-account acceptance remains pending owner signup.

## Released

| Site | Stack | Production Pages deployment |
| --- | --- | --- |
| business.dojipro.com | React/Vite, MUI, TanStack Query | `36a323ad-2955-4c12-a7d3-d17694cf37ba` |
| dojipro.com | Next.js static export, React/MUI | `303689ff-9117-4403-88e3-db80805ef3b5` |

Admin remains `09a9d34e-d99c-4373-a511-2ec92ea10487`; this release did not deploy
admin, mobile, database, Edge functions, shared Workers or provider configuration.
Existing shared infrastructure still exists; frontend isolation is not zero risk.

## Connections and compatibility

- Business root is public marketing, never an automatic application redirect.
- Access restores the session behind a spinner before choosing the correct view.
  Existing validated WorkOS hosted redirects, cookie/CSRF and MFA server proof remain.
- Application draft, check-answers, save, submit, review status, receipt, activity and
  approved-workspace views reuse the established controller/atomic command contracts.
  Unknown command retries retain the same payload/idempotency key; stale revisions
  block submission and preserve edits. Queries are memory-only/session-scoped and
  cancelled before commands. Foreground/online reconcile without recurring polling.
- The registration pilot is already expired (`2026-10-07T23:59:59Z`). A read-only
  policy check confirmed ten allowed registrations, one used. Release packaging
  records the expiry as a UI hint and checks it has not changed; the server remains
  authoritative. Existing users can sign in. Reopening registration is not included.
- Public home, business referral, seven policy/support pages, safety intake, sitemap,
  robots and 404 are exported by Next. Production pages are indexable with canonical
  metadata; normal local builds remain noindex. No Next hosting runtime was added.
- Reviewed legal/support text is preserved. Safety intake deliberately retains its
  existing controller, taxonomy, CSS and deployed config as a DOM island. This narrow
  compatibility boundary preserves private receipt codes and exact uncertain retries;
  it is not a claim that every legacy helper has been rewritten into React.
- Next inline bootstrap scripts are externalized byte-for-byte into content-hashed
  same-origin files in parser order. Executable CSP does not allow unsafe-inline or
  unsafe-eval. Safety-only origins remain confined to that route. Public aliases are
  noindex. Business proxy, routes, headers, legal pages and configuration are unchanged.
- Email-MFA/custom credential screens, business emails, business/health realtime,
  campaign publishing and billing remain gated. Member Supabase Auth, alarms,
  participation window, push and announcement eligibility are unchanged.

## Verification and evidence

`web` full check passed: TypeScript, lint, 249 unit tests across 46 files, all three
app builds, metadata/preview-index and bundle budgets. Business's complete lazy-route
budget is 200 KiB gzip; measured 191.1 KiB. Admin measured 403.7 KiB, unchanged.

Exact immutable deployment packages passed 11 business and four public browser tests.
These intercepted network calls: no production domain commands or emails were sent.
Business covers public landing, slow restoration, form preservation/default country,
receipt, identical uncertain retry, stale revision, expiry, MFA/workspace, validated
provider redirect, rejected foreign redirect, declined state and pilot closure.
Public covers hydration/CSP/SEO, reviewed content parity, safety taxonomy/uncertain
retry/private receipt lookup and narrow-viewport geometry. Tests assert no page errors.
The prior full admin browser suite was not rerun because admin was not changed.

Hosted verification passed eight business and 13 public checks: exact released HTML,
config/legal assets, CSP, robots and sitemap; business session rejects anonymous
same-origin requests with 401 and admin-origin requests with 403. Chrome read-only
checks confirmed public/business rendering and the restored signed-out access screen.
Authenticated existing-account acceptance still requires owner sign-in. No live
application, moderation, safety intake, campaign or billing action was performed.

Evidence folders (relative to the migration checkout):

- `test-results/react-business-migration-k7dAwl/`
- `test-results/react-public-migration-JL7Gbu/`

Each holds `prepared.json`, `qualified.json`, `deploy-started.json`, `deployed.json`,
`verified.json` and exact `site/` bytes. Receipts preserve package/config hashes and
prior/after deployment IDs, not provider credentials. Browser evidence is under
`web/test-results/business-migration/` and `web/test-results/public-migration/`.

## Repeatable release and rollback

Use `scripts/prepare-react-public-business.mts business|public`, followed by
`scripts/release-react-public-business.mts qualify|deploy|verify <package-folder>`.
Preparation builds a new immutable package. Qualification requires all exact-package
tests to pass without flaky/skipped outcomes. Deployment checks package/config hashes,
prior project IDs, unchanged business policy and unrelated project state. Unknown
deployment results stop for investigation rather than automatically submitting again.
The original expected-ID constants are a one-release guard, not a rolling deploy tool:
a future release must deliberately capture/review its new baseline first.

For rollback, restore the corresponding prior Pages deployment using Cloudflare's
deployment rollback, or redeploy the preserved exact artifact to that project only:

| Site | Prior deployment | Preserved artifact |
| --- | --- | --- |
| Business | `e8ebfc1e-2a64-464a-b252-d25b1d425afc` | `test-results/business-session-flow-20261005/site` |
| Public | `d352e4ed-89ec-47c4-b8e2-bfea5688acc3` | `D:/ChallengeApp/DoIt/test-results/safety-launch-20260929/public` |

Verify origin HTML/config, business session denial and public legal/safety routes after
rollback. No database/provider/member rollback is needed because none changed here.
Do not delete old versioned assets or alter registration/email gates during rollback.
