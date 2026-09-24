# Sponsored Doji business platform

Status: business-platform exploration; read-only admin foundation approved for implementation

Last updated: September 23, 2026

## Local workflow prototype

The repository now includes a static, local-only experience prototype under
`website/` for product review:

- `/business/` previews the public Business destination;
- `/business-portal/` previews application, organization, campaign-draft, review,
  and aggregate-reporting flows; and
- `/admin-portal/` previews the separate Doji operator queues.

The business portal still contains mock data and browser-local draft state only. It does
not authenticate businesses, create production organizations, accept legal terms, upload
evidence, read or write production campaign data, publish or schedule campaigns, or
perform billing. The admin portal now has an optional first production read mode in
addition to its default local prototype: authorized operators can sign in with Supabase
password plus verified TOTP, reach `aal2`, and read bounded existing operational data
through the Cloudflare gateway. Every admin mutation remains disabled. Both private
portal pages are `noindex`; unfinished business, sponsorship, legal-intake, billing, and
evidence-vault domains still require the product, policy, legal, authorization, command,
audit, and hosting gates in this document.

### First live administrator milestone

The implemented read foundation reuses the existing production stack rather than adding
a second API or database:

- `admin_operator_roles` provides explicit operator roles while preserving existing
  `profiles.is_admin` administrators during migration;
- `get_admin_portal_session` and `get_admin_command_center_snapshot` are bounded,
  security-definer read contracts that require both `aal2` and an active role; the full
  command center is limited to legacy administrators, `super_admin`, and `operations`;
- the Cloudflare Worker exposes an exact allowlist under `/portal/admin/*`, enforces an
  exact-origin CORS list, a per-operator read budget, no-store responses, and forwards
  only the caller JWT plus the public anon key;
- session tokens stay in `sessionStorage`, not persistent browser storage, and the live
  portal mixes in no browser-local decision overrides; and
- live refresh reuses the existing short-lived Ably token and the identifier-only
  `moderation:global`/`doji:global` channels, coalescing hints into an authoritative
  snapshot rather than adding a second socket service or polling; and
- production assignment, review, announcement, enforcement, scheduling, and release
  controls are hidden or disabled until narrow atomic, idempotent, audited commands exist.

Only existing production domains are represented: reports, community suggestions,
coarse delivery health, the current/next event, release policies, server announcements,
and the audit foundation. A zero count for sponsored reviews is intentional until the
business data model is approved and deployed; no sample company or campaign is presented
as production data.

The business prototype now models the intended first-run journey end to end: a short
account form, guided company onboarding, logo preview, company/market profile review,
an empty first-time workspace, campaign creation, one or more campaign-scoped sponsored
Dojis with independent review/schedule states, campaign status/detail, and example
privacy-protective reporting with campaign and per-Doji views plus coarse regional
participation. Newly onboarded
companies never receive seeded performance data; the signed-in demonstration workspace
is the only place that shows sample campaigns. Logo files and all other prototype data
remain browser-local and are not uploaded.

The portal uses one shared component system across onboarding and workspace views. It
defaults to light mode, offers a persistent light/dark theme toggle, and uses consistent
control heights, spacing, selection states, status treatments, and responsive layouts.

The local admin prototype now models the broader private operating console rather than
only the commercial-review table. It includes a deadline- and risk-ordered command
center, a unified assignable work queue, trust-and-safety reports, a separately labeled
restricted legal/removal queue, sponsored-Doji review, business verification, community
ideas, server-controlled announcement drafts, platform/release health, global search,
and an append-style audit view. Work-item drawers separate bounded metadata, history,
related records, an internal decision note, and queue-specific decisions. Restricted
evidence is intentionally not displayed by the prototype.

For local workflow testing, sponsored Dojis submitted through the business prototype
are read from the same browser-local campaign state by the admin prototype. A local
approval, requested change, or decline is written back to that browser-local campaign
record and is visible when the business workspace is reopened. The prototype also keeps
local admin decision overrides, announcement drafts, and audit events. This demonstrates
the desired state flow only; it is not the production data or authorization model and it
must never be converted into a privileged browser-side database.

The prototype's human-facing format choices mirror the five formats exposed in Doji:
Poll, Would You Rather, Question (`task`), Format Question (`format`), and Photo Idea.
Poll choices use discrete ordered fields rather than comma-delimited text. Generic polls
accept two through four sponsor-defined choices and Doji always appends `Other`, producing
no more than five total choices. Would You Rather stays locked to exactly two and never
includes `Other`.

A sponsor may propose an optional `Learn more` URL. It is reviewable content, appears only
after participation, is never opened automatically, and must not interrupt or be required
for completing the Doji.

This document defines the recommended product boundary for verified business
accounts and sponsored Dojis. The business platform belongs on an authenticated web
portal hosted separately from the consumer mobile experience. The Doji app displays
only operator-approved sponsored challenges and their consumer-facing results.

This is a planning document. Sponsorship, billing, targeting, disclosures, business
terms, privacy changes, and economy effects require product and legal approval before
development or sale.

## Why the business tools belong on the web

- Campaign creation, organization verification, contracts, billing, asset management,
  scheduling, approvals, analytics, and multi-user business roles are administrative
  workflows rather than daily consumer participation.
- Separating the surfaces keeps the Doji app simple and prevents ordinary accounts
  from discovering privileged campaign controls or business data.
- A web portal supports desktop campaign work, structured forms, downloadable reports,
  invoices, and longer-lived review sessions more naturally than a mobile screen.
- Doji can change business workflow and approval tooling without forcing a consumer
  app release, while the mobile presentation continues to use a stable approved
  campaign contract.
- Business billing and contracts remain separate from Sparks, consumer purchases,
  social rank, and the mobile participation economy.

The portal must not be a public path into production tables. It uses authenticated,
role-scoped commands and bounded reads. A business operator never receives service-role
credentials, a general user token, raw database access, or permission to publish a
global Doji directly.

## Domain and public website structure

Use the existing `dojipro.com` brand and domain as the single trusted entry point.
The recommended structure is:

- `dojipro.com/` — public consumer/product website;
- `dojipro.com/business/` — public business marketing and education page;
- `business.dojipro.com` — authenticated business application and campaign portal;
- `admin.dojipro.com` — authenticated Doji operator portal; and
- `dojipro.com/safety/` — public Safety and Removal Center described in the trust and
  safety requirements.

The exact subdomain/path layout may change during implementation, but the public,
business, and administrator authorization boundaries may not. The public Business page
is indexed and marketed. Authenticated portal routes use `noindex`, do not appear in the
public sitemap, and expose no useful data before authentication. The Admin Portal is not
advertised or linked from public navigation; authorized operators reach it directly and
must use strong authentication and MFA.

Cloudflare/DNS, TLS, security headers, rate limits, bot protection, session-cookie
boundaries, and cross-origin rules must be explicitly configured for every host. A
business session cannot be replayed against the administrator host, and neither portal
may share browser-readable privileged credentials with the public website.

### Public business marketing page

The public website needs a polished **Business** or **Partner with Doji** destination
that explains:

- what a sponsored Doji is and how it appears to consumers;
- that sponsorship is clearly disclosed and every campaign is reviewed by Doji;
- acceptable example challenge formats and prohibited categories;
- the expected workflow from application through approval, scheduling, and reporting;
- what aggregate measurement a sponsor receives—and the individual data it never
  receives;
- pilot availability, expected lead time, and a contact/support route;
- links to Business Platform Terms, privacy information, sponsored-content standards,
  and any required advertising disclosures; and
- a primary **Apply for a business account** call to action plus a secondary
  **Business sign in** action for approved organizations.

Marketing claims must match the implemented product. The page cannot promise audience
size, targeting, guaranteed participation, conversion, launch dates, or analytics that
Doji has not substantiated and cannot deliver.

### Business application and sign-up

The initial CTA creates an application, not an automatically approved advertiser:

1. The applicant verifies their email and creates a portal identity.
2. They provide legal organization name, public brand name, website/domain, business
   address and country, authorized representative, contact details, intended campaign
   category, and acceptance of the application/privacy terms.
3. Doji verifies the organization, representative, domain, restricted-category risk,
   and any required tax/billing information.
4. Approval creates the organization workspace and owner role. Rejection or a request
   for more information remains an auditable application state.
5. Only an approved organization can invite team members or create a campaign draft.

Application data must have its own Privacy Policy disclosure, access controls,
retention schedule, correction/deletion route, and abuse/rate protections. Do not ask
for sensitive documents until the verification method and restricted storage workflow
are approved. Never accept identity documents as ordinary email attachments.

## Three distinct surfaces

### 1. Business portal

Verified organization members use the web portal to:

- apply for and maintain a verified business account;
- invite organization members into owner, campaign manager, analyst, or billing roles;
- propose a sponsored Doji using a constrained challenge template;
- upload approved brand identity, creative assets, option text, destination links,
  legal disclaimers, and accessibility text;
- select a proposed date range, frequency, eligible regions, and only the contextual
  audience controls Doji permits;
- view review feedback and submit a revised immutable draft version;
- accept business terms, campaign terms, pricing, and invoicing requirements;
- see campaign status, approved schedule, remaining budget, and aggregate reporting;
- pause a future campaign request or ask Doji to stop an active campaign.

The business portal cannot:

- publish, activate, reschedule, or push-notify users without Doji approval;
- search individual consumer accounts or inspect friend graphs;
- retrieve individual photos, comments, reactions, votes, locations, contact details,
  device identifiers, or other user-level participation data;
- target or exclude a named person;
- target sensitive traits, inferred vulnerabilities, or protected characteristics;
- mint Sparks, XP, badges, rank, streaks, or any other reward;
- delete moderation evidence, change disclosure labels, or bypass frequency caps.

### 2. Doji operator portal

Authorized Doji staff use a separate administrative role and queue to:

- verify the legal organization and authorized operators;
- review the proposed prompt, options, assets, destination, category, audience,
  disclosures, rewards, and claims;
- require revisions or reject prohibited, misleading, unsafe, low-quality, or
  off-brand proposals;
- approve one immutable campaign version and its exact schedule;
- resolve scheduling conflicts and enforce sponsored-frequency limits;
- preview every consumer surface before activation;
- pause, cancel, or remove a campaign immediately without waiting for the business;
- review consumer reports under the normal safety and moderation contract;
- reconcile contracted delivery and approve aggregate reporting;
- retain a complete audit trail of verification, edits, approvals, scheduling,
  delivery, moderation, billing state, and operator actions.

No approval action is a sequence of direct client writes. The server atomically
records the approved immutable version, authorization, schedule, and audit event.

The operator portal also becomes the eventual home for the current in-app administrator
features: challenge-suggestion review and content-report review. It additionally owns
profile-photo moderation, appeals, Safety and Removal cases, sponsored-campaign review,
scheduling, emergency pause, and audit history. The existing mobile Admin section stays
available until each web replacement is deployed and physically/operationally verified;
only then is it removed in a consumer app release.

### 3. Consumer Doji app

The mobile app:

- receives only active, server-approved campaign identifiers and authorized content;
- labels the experience **Sponsored** and **Brought to you by {brand}** before the
  user participates and anywhere the result is revisited;
- never disguises sponsorship as a normal community submission;
- preserves the normal ten-minute server-authorized participation contract if the
  campaign occupies the daily slot;
- provides report, block where applicable, feedback/hide, and sponsorship-information
  actions;
- never sends a user into a business-management or campaign-purchase flow;
- never exposes other participants' private data to the sponsor;
- awards only operator-approved, server-owned, idempotent rewards with a campaign cap;
- keeps participation, social interaction, and realtime behavior under the same
  Postgres-authoritative contracts as an organic Doji.

## Recommended campaign workflow

```text
Business applies
  -> Doji verifies organization and operators
  -> Business accepts terms and creates constrained draft
  -> Automated policy/format checks
  -> Doji human review
  -> Revision or rejection, or immutable version approval
  -> Contract/billing authorization
  -> Doji operator schedules the approved version
  -> Normal durable pre-live/activation/close flow
  -> Consumer participation and moderation
  -> Privacy-protective aggregate reporting
  -> Reconciliation, invoice, and campaign close
```

The business never schedules directly into `daily_events`. Approval creates a server-
owned campaign version; the existing Doji scheduling authority references that version
only after all commercial and policy gates pass. Editing approved content creates a new
version that must be reviewed again.

## Sponsorship presentation rules

- The sponsorship label appears in preview, notification-safe copy, participation,
  feed/result cards, post detail, and any historical campaign view.
- The business name and verified identity are visible before participation.
- Required disclaimers and material terms are readable without interacting with an ad
  destination.
- A destination link is optional, opens through the approved safe-link contract, and
  cannot be required to complete the Doji.
- Sponsored prompts cannot require a purchase, positive endorsement, contact-data
  disclosure, location visit, or access to a user's camera roll or contacts.
- Participation must not authorize the sponsor to contact the user directly.
- Doji defines prohibited sponsor categories, claim substantiation, age restrictions,
  regional restrictions, and creative standards before accepting campaigns.
- The user can report the sponsored challenge and provide sponsorship feedback without
  sending that report to the sponsor.

## Daily slot versus optional bonus

This remains a product decision and must be tested before implementation:

- **Sponsored daily slot:** One clearly disclosed sponsor may fund the shared daily
  Doji under a conservative frequency cap. It has the strongest reach but creates the
  greatest trust risk and must never turn every day into paid inventory.
- **Optional bonus Doji:** The organic daily ritual remains untouched and the sponsor
  funds a separate optional challenge. This protects the core ritual but creates a
  second participation/economy path that must not fragment the feed or enable pay-to-win.

The initial operational recommendation is a small, manually sold pilot with a strict
frequency cap and no self-serve publishing. Final slot choice requires user testing,
retention evidence, economy modeling, and an explicit stop criterion.

## Data and authorization model

Required server-owned entities include:

- organization and verification state;
- organization membership and role;
- campaign and immutable campaign version;
- proposed and approved schedule;
- creative asset reference and moderation state;
- disclosure, region, audience, and destination policy;
- contract, price, invoice, and payment state without storing raw payment credentials;
- campaign budget and any capped server-owned reward authorization;
- operator approval/rejection and audit events;
- aggregate delivery and participation metrics;
- consumer safety reports and emergency pause state.

Every business read is organization-scoped. Every privileged write uses a narrow,
audited, idempotent server command. Consumer social data remains in the existing
authorized product model and is never copied into sponsor-accessible tables.

## Privacy-protective reporting

Sponsor reporting begins with bounded aggregate metrics such as:

- eligible impressions and challenge opens;
- starts and valid completions;
- aggregate poll totals when the challenge is a poll;
- aggregate completion rate and coarse approved region/device breakdowns;
- aggregate report/hide/negative-feedback rate.

Reports enforce minimum cohort sizes and suppress a slice that could identify a person.
No sponsor receives usernames, emails, birth dates, friend relationships, raw photos,
captions, comments, reactions, individual votes, exact locations, push tokens, device
IDs, or a list of participants. A sponsor cannot combine portal data with a destination
pixel or external list to re-identify Doji users.

Doji must update the Privacy Policy before collecting or disclosing any new campaign
analytics. The policy must state what is measured, what aggregate information a sponsor
receives, applicable retention, and that Doji does not sell individual user content or
behavior.

## Commercial and legal requirements

Before a pilot, obtain approved:

- Business Platform Terms and organization verification rules;
- Sponsored Doji insertion order or campaign agreement;
- advertiser warranties for authority, intellectual property, claims, disclosures,
  destination safety, and legal compliance;
- cancellation, refund, make-good, invalid-traffic, and force-majeure rules;
- privacy/data-processing terms and a prohibition on user-level exports or
  re-identification;
- category, regional, minor-safety, political, health, financial, alcohol, gambling,
  and other restricted-content rules;
- trademark/content license limited to review, operation, promotion, and reporting for
  the campaign;
- required advertising disclosures and record retention;
- tax, invoicing, payment processing, sanctions, and business-identity procedures.

The consumer Terms, Privacy Policy, Community Guidelines, and sponsored-content notice
must be updated together with the implemented product behavior. The app should not call
the experience “organic,” “community selected,” or otherwise obscure paid placement.

## Phased delivery

### Phase 0 — validation

- Model operating cost, pricing, moderation/support burden, and Sparks inflation.
- Interview potential sponsors and users without promising inventory.
- Decide daily-slot versus bonus format and define success/stop criteria.
- Obtain legal and policy review.

### Phase 1 — concierge pilot

- Doji verifies and contracts with a small number of businesses manually.
- Businesses submit a structured proposal through the web portal.
- Doji operators review, revise, approve, and schedule every campaign.
- Billing may remain invoice-based; there is no automated marketplace or auction.
- Reporting is delayed, aggregate, and manually reconciled.
- The public Business page advertises the pilot and routes applicants into an approval-
  gated application; it does not promise immediate self-service campaign publishing.

### Phase 2 — managed self-service

- Add organization roles, draft collaboration, self-serve billing, live aggregate
  dashboards, and reusable approved brand assets.
- Keep human approval and Doji-owned scheduling mandatory.

### Phase 3 — scale only after evidence

- Automate low-risk checks and inventory recommendations without automating final
  publication authority.
- Add capacity, fraud, billing, safety, and analytics monitoring proven under load.
- Do not build an auction or sensitive targeting system merely to increase volume.

## Completion criteria for a pilot

- A business cannot access consumer data or publish/schedule a campaign directly.
- A Doji operator can approve an immutable version, preview it, schedule it, pause it,
  and audit every state transition.
- Every consumer surface labels the sponsor consistently and accessibly.
- Report/block/feedback and urgent campaign removal work end to end.
- Rewards, if any, use the idempotent server ledger and cannot exceed the approved cap.
- Aggregate reporting passes minimum-cohort and re-identification tests.
- Business, consumer, privacy, advertising, billing, safety, and store-policy reviews
  are complete.
- A small pilot meets its trust, participation, retention, revenue, and support-cost
  thresholds without degrading the organic Doji experience.
