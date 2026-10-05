# Business onboarding release — September 30, 2026

## Current state (17:04 UTC)

Owner replied **Confirmed** to the exact callback plus US-only 10-account/30-email
launch. Business signup/onboarding is now LIVE, replacing the closed holding page.

- Final Pages deployment: `b891687f-f7a6-47b3-998d-9c74a27525fc`,
  `https://b891687f.doji-business.pages.dev`, `https://business.dojipro.com/`.
  Closed-page rollback: `ddef07e6-b34c-4e72-b474-ffece2f380f5`.
- Added only `https://business.dojipro.com/business-portal/access/` to Auth redirect
  URLs. Browser verified `doit://**`, `https://admin.dojipro.com/` and default
  `https://expo.dev/@faheybaby/doit-challenge-app` unchanged (three redirects total).
- Public admission enabled: registration limit 10, email limit 30, daily email
  limit 30; all are conservative reservations, not successful delivery counts.
  New registration closes at `2026-10-07T23:59:59Z`; existing business sign-in is
  separate from that expiry. No lifetime-budget resets, auto-renewal or paid upgrade.
- Business role granted only to authenticator, after exact effective RPC/table
  permission guard. No member role inheritance. US is self-declared at signup;
  non-US/missing country is rejected before upstream calls. A private application
  check rejects non-US writes (including direct/stale clients); empty drafts remain
  valid and submission separately requires complete fields. No IP geofencing claim.
- Dedicated business-auth exact US-guard source deployed and downloaded/compared.
  Only BUSINESS_AUTH_ENABLED and BUSINESS_AUTH_PUBLIC_ADMISSION toggled true.
  Existing secret digests unchanged; existing function counters increased once more
  from secret propagation (baseline +2 total), with their source, timestamps,
  entrypoints and runtime configurations otherwise unchanged.
- Versioned approved terms/privacy published at `/business-terms/business-terms-20260930-v1/`
  and `/business-privacy/business-privacy-20260930-v1/`, with stable aliases. Editorial
  checklist text removed after factual launch checks; no new arbitration, fees,
  marketing, fixed deletion periods or worldwide compliance assertion. Operational
  retention/privacy/recovery responsibilities: BUSINESS_PRIVACY_OPERATIONS_2026-09-30.md.
- Exact final assets and public legal content verified. Cloudflare initially rewrote
  public support addresses. A no-transform header alone did not stop that behavior;
  documented per-page email_off markup did. Verification normalizes only those
  non-visible marker comments for the four legal HTML pages, otherwise requires
  exact bytes. No zone-wide setting changed. Intermediate deployments were
  `a110d098-dffd-499a-93bf-b1030caafb30` and `64cce3a6-f1d9-4be1-b5ef-38eab259aee7`.
- Live browser shows the correct signup form, unchecked agreements, shared select,
  exact legal links and completed provider security check. No CAPTCHA bypass, signup,
  password entry, consent, synthetic identity, email or business decision performed
  by the agent. Owner was handed the real signup page to test their separate email.

Verification in this continuation: 251 offline SQL assertions; 52 stubbed Auth
checks; 26 isolated client/state checks; 10 artifact checks; 35 business browser
checks against exact packaged JS/CSS. Admin-only tests are excluded from this
separate artifact, not bundled into it; its previously deployed suite passed 121.
Initial rehearsal failed on generated dollar-quoting before any commit; corrected
and rollback-rehearsed SQL then passed and committed. Existing public function/grant,
relation/RLS, policy, existing Auth-trigger, job and release-policy baselines match.
Production member profile/realtime/notification/feed/comment reads passed again
(feed one row, comments zero); this does not prove a physical device session.
Existing doji-admin and doji-site deployment IDs were verified unchanged.

Evidence: `public-final-candidate.json`, `public-final-deployed.json`,
`public-verified-1790787811586.json`, `public-database-before.json`, exact SQL plus
rollback rehearsal, Edge downloaded source and `business-browser-results.json` in
`test-results/business-release-20260930/`. Signup screenshot: live-business-signup.png.

**Pending actual-owner test:** separate business registration, real inbox delivery,
explicit verification, application submission and authenticated staff review.
Deployment/provider acceptance are not end-to-end proof. Limits remain intact and
business campaigns, billing, Ably/realtime and member release policy remain unchanged.

## Earlier release stage (15:47 UTC; historical, superseded above)

The owner explicitly requested production deployment so they can test signup and
onboarding. This supersedes the prior local-preparation-only deployment gate, but
does not authorize new costs, member changes or unrelated features.

**Staff review and privacy operations are live. Public business signup is still
closed. Do not describe this as a completed signup-to-review launch.**

- Exact additive foundation, business Auth admission, public admission, signup
  agreements and privacy contracts installed in one transaction, initially disabled.
  Source hashes, rehearsal and before/after baselines are in
  `test-results/business-release-20260930/`. No broad migration push was performed.
  These five source drafts are now installed; do not apply them again. Their
  historical LOCAL comments and older context sections are superseded by this record.
  Automatic migration-ledger promotion has not been performed.
- Staff application/privacy queues are enabled and return empty results under the
  existing authorized employee AAL2 identity. AAL1 staff are rejected. Anonymous,
  member and business roles have no execute grant on staff queue functions.
- Staged legal version identifiers are `business-terms-20260930-v1` and
  `business-privacy-20260930-v1`. **The final texts are not published yet.** No
  business account has accepted these versions. Public admission stays disabled,
  its budgets remain zero, and `doji_business` is not granted to `authenticator`.
- New `business-auth` Edge function is deployed with `verify_jwt=false`, but its
  own feature gate is false and a live signup request returns 404. Exact downloaded
  function source matches the release artifact. No registration/email was attempted.
- A free managed Turnstile widget is restricted to `business.dojipro.com`. Its
  dedicated secret and a new purpose-specific link-signing secret exist only in
  the provider secret store. The function reuses existing Resend/sender secrets
  inside its runtime; no existing secret values were changed or printed.
- Supabase adding secrets increased all 14 existing function version counters by
  one. Each existing source hash, entrypoint, timestamp, gateway setting and other
  metadata was verified unchanged; this was not an existing-function source deploy.
- Admin deployment `b95ceb19-9515-4e72-a7dc-9f9e665d8f1b` is live at
  `https://admin.dojipro.com/`. Exact changed assets were downloaded and hashed.
  The first post-deploy fetch timed out; a subsequent read-only verification passed.
  No second deployment was performed. Rollback deployment is
  `cf9bb575-4727-48dc-9a41-cfa91460fe75`.
- The overlay preserves the previous public/business prototype runtime, existing
  admin configuration, shared presentation modules and unrelated assets. It adds
  the business application/privacy modules, their shared form, admin-only runtime
  integration and scoped styling. Existing campaign/announcement configuration is
  preserved, not newly enabled. No announcement or moderation decision was made.
- `business.dojipro.com` remains its closed holding deployment
  `ddef07e6-b34c-4e72-b474-ffece2f380f5`. `doji-site`, the shared Worker, mobile
  binaries and mobile release policy are unchanged. Business realtime, billing and
  campaign publishing remain off. No automatic erasure, retention or polling job.

## Verification

- 121 browser regressions passed against the exact admin release artifact,
  including business review/privacy, staff authentication, editorial and safety
  workflows, stale revisions, permissions and light/dark responsive accessibility.
  Browser API responses are mocked; they are not production action tests.
- 48 Auth-handler contract checks passed with upstreams stubbed; no email sent.
- Production bounded queue reads succeeded; employee MFA denial and role grants
  checked in a rollback transaction. Staff authorization requires `FOR SHARE`, so
  the read-call transaction cannot use Postgres `READ ONLY`; it invokes no writing
  commands and ends in rollback.
- Existing public function definitions/grants, relation permissions/RLS, policies,
  existing Auth triggers, cron configuration and both mobile release-policy rows
  match the pre-release snapshot. The new agreement trigger is additive and only
  selects `doji_business`; no existing Auth trigger was changed.
- Existing member profile, realtime authorization, notification snapshot, feed
  and comments read contracts executed successfully. Feed returned one row;
  comments returned zero rows. Employee session/queue checks passed. This is not a
  device/session-survival or real-comment-content demonstration.
- The live admin browser session is expired. Authenticated UI verification needs
  the owner to sign in with their work identity and MFA. No credentials were read
  or entered on their behalf.

## Included allowance observations

Authenticated dashboards observed during this release, not a capacity guarantee:

- Resend Free: 3/3,000 monthly emails, 0/100 daily, pay-as-you-go off.
- Supabase: 67/100,000 included MAUs, 29,076/2,000,000 Edge invocations,
  0.09/100 GB storage. Organization reports overages are not currently billed.
  Project is Micro in West US (Oregon), us-west-2. Image transformations are
  90/100 included and are not used by this release.
- Cloudflare dashboard reported $0 billable usage. Existing Pages projects used;
  no paid plan, upgrade, Worker or email service purchased.
- Supabase status reports intermittent Eastern-US latency, potentially affecting
  clients outside the database region. This release does not diagnose that incident
  or establish repair of any previous production 504 origin.

## Earlier signup gates (now completed except owner end-to-end test)

The existing hosted Auth allowlist contains exactly `doit://**` and
`https://admin.dojipro.com/`. The default site URL remains
`https://expo.dev/@faheybaby/doit-challenge-app`. None was changed.

The prior pending owner confirmation asked to add only
`https://business.dojipro.com/business-portal/access/`, preserving the existing
entries/default, and to open a US-only launch capped at 10 account reservations
and 30 service emails within the verified allowance. The subsequent explicit
Confirmed reply approved it; the current-state section records completion.

After that decision: finish the factual legal/retention runbook and final versioned
publication; apply any approved US-only restriction to both UI and server; package
and qualify the exact business frontend; admit the new business role; enable only
bounded business entry points; and have the owner exercise a separate business
account through actual verification, signup, application and review. A provider
acceptance result is not inbox delivery. A deployment is not proof of end-to-end
success. Use no personal member/employee identity conversion, CAPTCHA bypass or
invented consent.

## Rollback

First disable `BUSINESS_AUTH_ENABLED` and public business entry points; they are
currently enabled. Set only business-private public admission, application
and privacy settings off as appropriate, and revoke only newly added business
browser membership if subsequently enabled. Restore the previous exact admin or
business Pages deployment. Preserve all new consent, history and account data.
Do not delete users, schemas or evidence as a release rollback, revoke mobile
sessions, alter existing shared function permissions, or apply the dirty migration
tree. Feature rollback cannot restore data erased by a separately authorized
privacy operation. No erasure was executed by this release.
