# Doji email presentation standard

## October 12 production integration

The approved business theme is now deployed to `business-portal-v2` (owned password
recovery) and `business-application-mail` (application notices). Downloaded deployed
sources exactly match the tested bundles. Evidence and rollback packages:
`test-results/business-email-theme-release-20261012/`. No emails were sent by this
release; automatic capture, sending and wakeup remain off. Existing recipient,
subject, reset-fragment, idempotency and budget rules are unchanged. All Pages,
database/member contracts, roles/RLS, unrelated runtime sources and configuration
digests matched the baseline. Supabase-managed built-in secret timestamps were
touched by Edge deployment, but their digests did not change.

The owner completed setup; the signed-in Testing workspace was verified before
and after deployment with saved branding, approved owner access and MFA active.
Public signup, campaign publishing and billing remain closed.

Visual primitives now live in `_shared/email-theme.ts`, with a narrower business
URL-policy wrapper. Shared `doji-email.ts` and legacy employee/business templates
are prepared and tested with the same logo, colors and buttons. Their senders and
provider settings have NOT been deployed or enabled. WorkOS-managed verification/
security mail and Supabase Auth templates still require separately qualified
provider-template changes; do not claim every production email has migrated.

Validation: 53 release email/auth checks, 50 shared-email Jest tests, 40 business UI/
theme tests, tooling typecheck and scoped lint passed. Offline hosted-runtime checks
covered sign-in, application/session reads, reset and revoked-session rejection,
with zero external requests. One earlier branded approval email was actually
delivered and accepted by the owner; this is not all-client inbox certification.

Commit qualification additionally passed 141 business/auth/HTTP/email tests and
173 offline database assertions from the selected clean snapshot. Business build
checks distinguish the already-approved deferred password-strength dictionary
(818.4 KiB gzip, capped at 900) from application routes (222.0 KiB, capped at 256) and
initial sign-in assets (157.3 KiB, under the retained 180 KiB cap). The dictionary loads only
after new-password entry, not on initial sign-in. The earlier 200 KiB preview-only
budget predated branding/setup and password guidance; it is not the release budget.
The clean web quality gate passed typechecks, lint, 267 tests, all three builds and
artifact checks. The business dictionary emits Vite's size advisory but is lazy
and covered by the explicit library and initial-load budgets.

Rollback: deploy the retained `before` packages for the two business functions only.
Do not revert saved branding, receipts, budgets, provider settings or member services.
Interrupted deployment verification reconciles downloaded sources before any retry.
No extra service, scheduler or billable message was introduced.

The historical preparation notes below predate this deployment.

October 12 update: the owner explicitly requested one resend. One branded approval
email was sent to the same verified test alias and Resend confirmed Delivered
(`01a13006-4ac1-706e-b834-ac3cb1103c4f`). This was a one-off manual presentation proof,
not an outbox replay or production deployment. Existing receipt, budgets and all
automatic sending gates were left unchanged. Evidence:
`test-results/business-branded-resend-20261012/`. The local-only status below now
refers to production integration; its earlier no-real-message statement predates
this separately authorized resend.

Owner requirement: every Doji-owned email should present branded HTML, not a plain
text-only message. Use the actual Doji logo and name, warm neutral surfaces, orange
primary actions with white labels, compact buttons for navigation, and consistent
spacing. Content must remain readable when images are blocked. Retain a complete
plain-text MIME alternative for accessibility/client compatibility, not as the
default visual design. Codes remain selectable text; never turn a code into an image.

## Implemented locally — not deployed or sent

Business application notices (submitted, approved, declined, changes requested,
reopened) and owned business password recovery now share
`infra/business-email/theme.mts`. Both HTML and their existing text
fallbacks are supplied to Resend. Sender/recipient selection, subject, idempotency,
budgets, one-use dispatch authorization and handling of uncertain outcomes are
unchanged. Recovery preserves its exact fragment-only token link and does not add
click tracking, redirects, new authentication behavior or token persistence.

The HTML uses the existing public PNG at
`https://business.dojipro.com/doji-icon.png` (verified HTTP 200/image/png), alongside
the text brand. This is a fixed public asset with no recipient/token query string.
No new image hosting, package, provider subscription or email service was added.
Tables, inline styles and cell backgrounds provide baseline email-client support;
media queries add narrow-screen/dark presentation. Rounded corners are enhancement,
not required for reading or using the action. No external fonts or executable HTML.

Validation: 24 targeted email tests and 26 business auth/reset integration checks
pass; scoped lint and tooling typecheck pass. Approval and
reset previews were visually inspected in the browser. This is not an Outlook,
Gmail or Apple Mail inbox rendering certification. No real test message was sent.
Run `node scripts/preview-business-email-theme.mts` for synthetic local previews.

## Remaining coverage / separate release boundaries

| Email family | Current owner/path | Required follow-up |
| --- | --- | --- |
| Business application decisions | `infra/business-email/message.mts` | Local branded HTML ready; isolated sender deployment still pending |
| Business password recovery | `infra/portal-identity/business-owned-recovery-email.mts` | Local branded HTML ready; business-runtime deployment still pending |
| Business/employee verification, invitations, provider security messages | WorkOS-managed delivery | Inspect actual environment templates/branding; do not disable provider mail or replace code delivery merely to restyle it |
| Member confirmation, reset, OTP and security notifications | Supabase Auth provider templates | Independently snapshot/qualify templates and exact variables; do not change member Auth, redirect configuration, SMTP or triggers |
| Member moderation notices | `relay-domain-events` → `_shared/doji-email.ts` | Existing HTML has placeholder D mark; prepare consistent real-logo/theme update only with shared-scope approval; relay deployment is separate |
| Admin reports/operational alerts | `send-admin-email` → same shared renderer | Same presentation gap; preserve facts, recipients, severity and idempotency |
| External safety alerts | `_shared/safety-removal-alerts.ts` → same shared renderer | Preserve evidence exclusion, existing provider envelope and sending limits |
| Legacy employee/business verification | `_shared/employee-email.ts`, `_shared/business-auth.ts` | Inventory retained code without reactivating legacy auth; replace divergent visual templates in separately approved preparation |
| Draft portal email MFA | `infra/portal-identity/proposals/email-code/portal-email-challenge.mts` | Not an active sender; do not enable as part of branding |

Third-party operational emails (for example Sentry alerts and store/provider emails)
are not emitted by Doji's senders; styling those requires whatever branding their
provider supports, not a claim that this renderer controls them.

Shared/member presentation preparation was subsequently approved and completed
locally October 12. No member/employee runtime, provider setting, database,
realtime or production sending gate was deployed by the branding task.

## Qualification / rollout / rollback

For each approved boundary: snapshot current rendered templates/config and deployed
package; preserve subjects, recipient selection and URLs/tokens; test escaping,
safe actions, provider template variables, OTP readability, missing-image behavior,
mobile/desktop and actual inbox rendering. Verify HTML is passed through each sender,
not only generated. A real send needs an explicit bounded test authorization; the
previous one-email onboarding allowance is already consumed and must not be reused.

Deploy business sender and business runtime independently. Shared relay/member Auth
changes require their own approval, member-isolation/regression checks and rollback.
Rollback restores the prior presentation/package only, retaining receipts, budgets,
session fences and uncertain sends; never resend an accepted email to test styling.

Primary references checked:
- [Resend HTML and text payloads](https://resend.com/docs/api-reference/emails/send-email)
- [Supabase authentication/security email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [WorkOS custom email ownership](https://workos.com/docs/authkit/custom-emails)
- [WorkOS branding](https://workos.com/docs/authkit/branding)
