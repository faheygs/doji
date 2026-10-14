# Portal UI patterns

Use `web/packages/ui` and the [web agent requirements](../web/AGENTS.md).
MUI provides interaction and accessibility behavior; the shared Doji theme provides
color, typography and spacing. Do not import a second dashboard framework or copy
commercial template assets.

## Page responsibilities

| Page | Purpose and layout |
| --- | --- |
| Home | Greeting, current/upcoming Doji, bounded attention summaries and quick access; not another queue |
| My work | Current employee's assignments with relevant status and priority filters |
| Domain queue | One permission-scoped table with active/history status filters |
| Team & access | Searchable identity cards and a focused full-page access editor |
| Record | Identity, status, assignee, evidence and history; contextual actions below content |
| Operations | Health and freshness, affected services, supported charts and evidence drill-down |

Use a stable desktop navigation rail, compact top bar and available workspace width.
Account forms are centered and readable; they do not set the width of work tables.
Do not keep an unused editor beside the Team directory or enlarge every heading
to fill a large screen. Tabs switch views, filters narrow data, menus hold secondary
actions. Do not add search, badges or controls that lack a working contract.

## Tables, identity and states

- Use standard MUI Table/TableContainer and TablePagination for current bounded
  workflow reads. DataGrid needs an actual grid requirement, not a cosmetic preference.
- Columns answer the queue's job: personal work omits redundant assignee; safety
  includes source and review target; business and idea queues omit irrelevant fields.
- Show authorized names with Avatar/initials. Never invent photos or add member
  image queries just to decorate employee rows.
- Keep headers, loading/empty/error body and pagination aligned in a stable work area.
  Avoid blank spacer rows and oversized panels beneath the table.
- Page-size changes preserve real server limits and cursor correctness. Unknown
  totals stay unknown; partial pages are not global metrics.
- Keep record links keyboard-accessible. Row activation must not hijack text
  selection, nested links, menus or modifier-clicks.
- Distinguish no records, no filter matches, completed work, loading, unavailable
  data and permission denial. Missing monitoring is not healthy or zero.

## Records and actions

Use full-page records and MUI Dialog for consequential confirmation, not drawers.
Show original submitted values with labels; never replace them with raw JSON or
infer type from prompt wording. Missing or unsupported required data blocks decisions.

Use one clear primary next step and contextual secondary actions. Start review may
assign the acting employee only through the existing atomic command, without
requiring outcome fields. Closure still needs its required evidence and response.
Required markers, validation, access restrictions and member-impacting consequences
remain visible. Supplemental help must not hide required warnings or errors.

Preserve assignee, filters, page position, dirty drafts and focus when navigating.
A busy or uncertain command retains its exact identity, payload and idempotency key.
A successful command followed by failed refresh must not be submitted as a new write.
Do not discard a pending confirmation or uncertain result merely to close a view.

## Forms and copy

Use standard MUI inputs, selects, date/time pickers and labelled verification
TextField. No custom six-box MFA control. Align related fields and use normally
sized actions; sticky footers must not cover fields or errors.

Use concise task language. Remove routine policy lectures, repeated summaries and
implementation jargon such as AAL2 or atomic RPC from ordinary interface copy.
Supplemental help belongs beside its label with accessible keyboard/focus behavior.
Errors and required consequences remain inline and visible.

## Health and data boundaries

Home counts describe its bounded authorized snapshot, not organization-wide totals.
Daily Doji timing is not a live-health measurement. Charts need a question, units,
time range and actual data source; unavailable samples must not become zero.

Reuse session-scoped TanStack Query reads, authorized identifier events and
foreground/reconnect reconciliation. No polling, new permission, aggregate query,
invitation email or member behavior is implied by presentation work.

## Acceptance

Check real desktop widths (1366, 1920 and 2560), narrow windows, 200% zoom, keyboard
navigation, focus restoration and light/dark contrast. Exercise empty, long-name,
multi-page, loading, denied, unavailable and uncertain-command cases. Geometry and
passing unit tests do not replace visual/task review. Use intercepted fixtures;
hosted writes need independent authorization.

## Design references and historical evidence

The accepted direction combined Tabler's compact desktop layout with product
patterns from Shopify Home, Linear My Issues/Triage, and Stripe's resource/detail
navigation. These are references, not dependencies:

- [Tabler](https://tabler.io/admin-template)
- [Shopify Home](https://help.shopify.com/en/manual/shopify-admin/shopify-home)
- [Linear triage](https://linear.app/docs/triage)
- [Stripe dashboard](https://docs.stripe.com/dashboard/basics)
- [Carbon tables](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines)
- [Grafana dashboards](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/)

Rejected and superseded research diaries have been retired; Git preserves them.
The [accepted implementation/release record](releases/ADMIN_REFERENCE_IMPLEMENTATION_2026-10-09.md)
retains its exact artifact, acceptance and rollback evidence.
Retained `website/` controllers are compatibility dependencies, not instructions
to restore their old dropdowns, drawers or generic portal layouts.

Earlier static UI receipts: September 25 Pages `bea0fd0e`, bundle
`20260925ao`, rollback `5842ffb9` / `20260925an` (29 browser, 28 health,
auth and 9 boundary checks); subsequent `7a33db07` / `20260925ap`, rollback
`bea0fd0e` (33 browser, 32 health, auth and 9 boundary checks).
These historical identities are not current rollback instructions.
