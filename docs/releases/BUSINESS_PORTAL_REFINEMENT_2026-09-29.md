# Business portal refinement — local prototype only

The owner selected the business portal workstream on September 29. This pass is
local experience refinement, not business onboarding/authentication or sponsorship
activation. No deployment, cloud write, billing, member change or paid resource.

## Implemented

- Campaigns and sponsored Dojis open in native dialog-based right drawers, with
  structured original fields, theme-aware controls and explicit Close/Back actions.
  Existing drafts edit in the same drawer pattern; new creation remains centered.
- Draft edits update the same identifier rather than duplicating a Doji. Local sample
  campaign overrides survive reload without duplicating the seeded campaign.
- The explicit sample changes-requested state exposes example reviewer feedback and
  a revision action. Local resubmission retains the previous submitted record and
  returns to read-only review status; submitted/approved records are not editable.
  This is not production immutable versioning, cross-tab concurrency or staff review.
- Format questions use the existing member contract: exact word count 1–20 or
  starting letter A–Z. Poll/Would You Rather options remain ordered and distinct;
  poll Other is automatic. Record detail shows form fields, not JSON.
- Business selects opt into the existing shared accessible dropdown implementation.
  Visible validation handles missing choices, duplicates, date validity, format rules
  and HTTPS-only optional destinations. Storage failures preserve campaign/Doji forms.
- Save and finish later persists partial setup and the current step; Resume restores
  it after reload. Completed local company workspaces can also resume without loading
  the sample company. Prototype entry no longer asks for a real password.
- New workspaces show no-results guidance instead of sample region/delivery charts.
  Example reports are explicitly illustrative, never measured business performance.
- Fixed a preexisting mobile CSS specificity problem that let the How it works panel
  cover campaign rows; scoped business breakpoints restore a single-column layout.
  Muted form text uses the existing readable theme token. Actions align right.

## Isolation and verification

Changes are limited to the business setup function in `website/portal.js`, business
HTML, a business-only stylesheet and local tests. The shared shell and admin runtime
were compared byte-for-byte with the previously qualified admin release source and
are unchanged. No generic website/admin bundle or production release was run.

Run `node node_modules/@playwright/test/cli.js test --config
website/business-portal/playwright.config.mjs` from the repository root. Tests cover
setup resume, empty results, exact draft editing/reload, requested-change revisions,
choice preservation, failed validation, keyboard dropdown Escape, and drawer/form
layout plus axe checks at 390/1440 px in light/dark. The mock workflows make no API
commands. Evidence: `test-results/business-refinement-20260929/` and
`test-results/business-refinement-results.json`.

Visually reviewed phone campaign detail and desktop dark format-question editor.
This is not complete accessibility certification, real-device qualification, a
security boundary or a production-ready business platform.

## Remaining business launch gates

1. Decide the sponsored daily-slot versus optional bonus product model and pilot cap.
2. Approve verification, business terms, cancellation/billing and aggregate measurement
   definitions; prototype graphs are not analytics instrumentation.
3. Separately approve isolated business identities/organization permissions, bounded
   reads, atomic audited/versioned commands and restricted asset storage.
4. Implement authorized staff review and exact-version scheduling with explicit
   member-impact regression, rollout and rollback plans. No direct business publishing.
5. Qualify the member sponsored disclosure/reporting experience and physical devices
   before any real pilot campaign or public business launch.

The older `SPONSORED_DOJI_BUSINESS_PLATFORM.md` describes the intended platform;
its September 23 admin-only-read statements are historical, not current admin status.
