# Closed business portal hosting

## Approved scope

Owner approved putting the business portal online with signup disabled while legal
and operational requirements are completed. This release is a public holding page,
not the business onboarding launch. Unfinished legal drafts remain local and unpublished.

## Exact release

- Project: `doji-business`, separate from `doji-site` and `doji-admin`.
- Intended origin: `https://business.dojipro.com`.
- Cloudflare Pages deployment: `ddef07e6-b34c-4e72-b474-ffece2f380f5`.
- Deployment URL: `https://ddef07e6.doji-business.pages.dev`.
- Evidence and exact 12-file manifest: `test-results/business-closed-SAaECA/`.
- Source: `website/business-portal/closed/index.html` with existing shared portal
  styles, theme, header, card and compact right-aligned CTA.
- Artifact built with `scripts/prepare-business-closed.mts`; fresh unique output
  prevents stale account/backend assets from being included.

No forms, inputs, account configuration, legal drafts, authentication client,
application client, backend functions, Turnstile or Ably are packaged. CSP blocks
connections, form submission and frames. Legacy `/business-portal/*` URLs redirect
to the gate. Unrecognized paths return a static 404. No public legal text is approved
by this deployment. Robots instructions discourage indexing, not enforce secrecy.

## Verification

Local exact-artifact checks passed at 1280px and 390px in light and dark themes:
no forms, no horizontal overflow, right-aligned CTA, working shared theme toggle,
no browser script errors and no external requests. Screenshots reviewed. The
deployment script checks the manifest against this qualification before uploading.

Cloudflare recorded successful upload/deployment. The first read of the temporary
deployment hostname failed TLS negotiation; no certificate bypass or redeployment
was attempted. A later API read confirmed the exact deployment exists. The
custom-domain dashboard offered a **new** CNAME `business` → `doji-business.pages.dev`,
TTL Auto, and that exact record was activated. Initial domain API status was pending
with ownership verification active and certificate validation pending. Live HTTPS
verification is required before claiming completion; append its result below.

Final verification at **2026-09-30 03:56:17 UTC**: custom-domain API status active;
normal HTTPS succeeded at https://business.dojipro.com. All ten served static files
matched the qualified manifest hashes. `uses_functions` was false. Live CSP has
`connect-src 'none'` and `form-action 'none'`, and `X-Robots-Tag` contains noindex.
Both account/application routes redirect to `/`; the business Auth function and
legal routes return 404. Existing main/admin project baselines matched unchanged.
Evidence: `test-results/business-closed-SAaECA/verified.json`. The live page was
also opened and visually inspected in the in-app browser, then left open for the
owner. No certificate bypass was used. This completes the closed-hosting request,
not the future public signup launch.

The deployment guard compares the original sites' domains/branches/deployment IDs:

- Admin: `cf9bb575-4727-48dc-9a41-cfa91460fe75`.
- Public site: `d352e4ed-89ec-47c4-b8e2-bfea5688acc3`.

No database, shared Worker, mobile app, release policy, member session, email sender,
moderation or announcement change. No business account can be created through this
static site. This does not certify unrelated shared authentication endpoints.

## Cost and rollback

No Pages Functions or paid service was enabled. [Cloudflare documents static asset
requests as free and unlimited](https://developers.cloudflare.com/pages/functions/pricing/).
This does not change or guarantee the costs of other existing account workloads.

Rollback for a future onboarding launch is redeployment of this exact closed artifact
to this business project only, after checking the then-current deployment. Do not
delete the project/DNS or touch the main/admin site as a routine rollback. Future
backend enablement needs its own approved rollback; a static gate is not a backend
kill switch. Preserve this release manifest and evidence.
