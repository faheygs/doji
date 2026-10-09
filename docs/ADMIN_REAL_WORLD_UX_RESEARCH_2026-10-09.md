# Doji admin: real-world dashboard and workflow research

Research date: October 9, 2026. Research and recommendations only; no runtime changes or deployment.

This supersedes the Minimal/MUI-led reference selection in
`ADMIN_DASHBOARD_REFERENCE_PLAN_2026-10-09.md`. The owner requested real products,
free templates outside MUI, and workflow/design guidance rather than another component demo.
Recommendations below are a proposed Doji synthesis, not a claim that every source
recommends this exact design or that the owner has approved a replacement screen.

## Evidence and limits

- Visually inspected Tabler's public Home, Users, Settings and Uptime demo pages.
- Visually inspected Flowbite Admin's public dashboard and Users CRUD page.
- Visually inspected Linear's published Triage product image and read its workflow docs.
- Read Shopify, Stripe and GitHub product documentation; did not enter their private dashboards.
- Read Carbon, Atlassian and Grafana guidance and the Dashboard Design Patterns research.
- Verified CoreUI's free React repository/license; did not inspect its live demo.
- Demo values are sample data, not evidence of real product performance. This was
  reference inspection, not accessibility certification or full 2560px acceptance testing.
- No template purchased, installed or copied into Doji. No production records changed.

## 1. Actual products: useful distinctions

### Shopify: Home is a starting point for the day

Shopify Home combines operational tasks, activity and selected performance information.
Its contents depend on the store's state; setup work and an established store need
different information. Urgent items lead to the place where work happens.
Source: [Shopify Home](https://help.shopify.com/en/manual/shopify-admin/shopify-home).

Doji proposal: personal greeting, today's/upcoming Doji, an attention list and relevant
shortcuts. No second full queue. Do not transplant sales/revenue cards, recommendation
carousels or analytics unsupported by our reads. An empty workday should feel complete,
not like a broken dashboard waiting for invented statistics.

### Linear: personal work and intake have different jobs

My Issues distinguishes assigned, created and subscribed work. Triage is an intake
inbox for reviewing and prioritizing incoming issues before regular workflow.
Its published image identifies the source within the same list rather than using
a different table for every integration. These are useful concepts, not a request
to implement Linear's paid automation or every issue action.
Sources: [My Issues](https://linear.app/docs/my-issues), [Triage](https://linear.app/docs/triage).

Doji proposal: My Work defaults to the current employee's assignments. Safety is one
authorized triage surface, with external/in-app source as record metadata. Ownership,
status and priority are distinct. Restricted records remain permission-scoped; unified
presentation never means merging access boundaries. Detail pages expose existing,
valid next steps, not a generic row of every possible command.

### Stripe: separate orientation, resources and configuration

Stripe documents a home overview, resource sections with filters and dedicated
detail pages, settings, and a separate technical Workbench. The sidebar provides
stable destinations while contextual work happens within the selected resource.
Source: [Stripe Dashboard](https://docs.stripe.com/dashboard/basics).

Doji proposal: Home, My Work, area queues, Operations and Team & Access should not
all use the same dashboard template. Navigation must communicate those different jobs.
No global search, alerts menu or other shell control unless it is actually connected.

### GitHub: identity and access are related but not interchangeable

GitHub's team model separates organization membership, team membership and access;
team pages provide contextual management rather than treating everything as tickets.
Source: [About teams](https://docs.github.com/en/organizations/organizing-members-into-teams/about-teams).

Doji proposal: Team & Access is a people directory. Each person has identity, account
state, role/access summary and Manage access. Open a dedicated person/access page.
Do not infer permissions from a decorative role chip or add team hierarchy to our model.

## 2. Free non-MUI templates: what was useful

| Reference | Evidence | Adopt as a visual reference | Do not transplant |
| --- | --- | --- | --- |
| [Tabler](https://tabler.io/admin-template) | Four demo pages inspected; admin template is [MIT](https://tabler.io/license) | Compact desktop rhythm, balanced card grid, people directory, focused settings, service-status hierarchy | Entire widget showcase, fake people/photos, Email/Call buttons, demo monitoring intervals |
| [Flowbite Admin](https://github.com/themesberg/flowbite-admin-dashboard) | Home and Users inspected; repository is MIT | Stable left navigation, clear resource header/search/action toolbar, useful table density | Biography/country columns without a task reason, drawer editing, all homepage charts |
| [CoreUI Free React](https://github.com/coreui/coreui-free-react-admin-template) | Repository and free MIT scope checked, not live-tested | Alternative reference for a conventional React admin shell | Assuming PRO components or separate commercial add-ons are included |

Direct visual references:

- [Tabler people](https://preview.tabler.io/users.html): repeated compact identity cards.
- [Tabler settings](https://preview.tabler.io/settings.html): local section navigation and a focused form.
- [Tabler uptime](https://preview.tabler.io/uptime.html): service history and incidents have different visual weight.
- [Flowbite demo](https://flowbite-admin-dashboard.vercel.app/): resource toolbar and desktop navigation.

Recommendation: Tabler is the strongest free visual starting point from the inspected
examples, but Shopify/Linear should drive the jobs and workflow. This is not a stack
migration: Tabler is Bootstrap-based and the inspected Flowbite template uses Tailwind/Hugo.
Retain Doji's React/MUI implementation and behavior; do not import competing global CSS.
If source code/assets are later reused, preserve applicable notices and check each asset's license.

## 3. Guidance translated into explicit Doji rules

### Navigation and desktop composition

Atlassian distinguishes global navigation, side navigation and the main work area.
Source: [Navigation layout](https://atlassian.design/components/navigation-system/layout).

Our proposal: one stable left rail, compact top bar, and an aligned full-width work
canvas. Tabs switch sibling views; filters narrow records; overflow menus hold secondary
actions. Do not use those controls interchangeably. No permanently open access editor
beside a two-person directory. No enlarged typography to compensate for weak composition.

Wide-screen hypotheses to validate, not universal standards: 240-280px navigation,
24-32px content gutters, 16-24px section gaps, readable 14-16px working text. Use more
columns where useful on a large monitor; do not stretch a name/password field across it.
Queues can fill the available width while editorial forms retain readable field lengths.
Two people remain two compact cards, not two giant panels stretched to fill all space.

### Tables and menus

Carbon emphasizes clear table headings, a coherent toolbar, sufficient horizontal
space, consistent row sizing, bottom pagination and deliberate row/batch actions.
Source: [Data-table guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines).

Doji proposal: one primary table per queue, with task-specific columns and a stable
body/footer region. Identity gets name plus avatar/initials; status, owner and deadline
remain separate. Use compact single-line rows or intentional two-line identity cells.
Primary record links remain keyboard-accessible; row clicks must not hijack selection,
menus or links. Batch actions appear only when supported and selected. No blank spacer
rows, unsupported page numbers, fake totals or inaccessible hover-only actions.

### Loading, empty, error and permission states

Carbon distinguishes no data, no results, completed work and errors instead of using
one generic empty message. It sometimes recommends replacing empty table scaffolding.
Source: [Empty states](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states).

For Doji, reconcile that advice with the owner's stable-layout requirement: reserve
the same work area, center a useful state inside it, and remove misleading controls
from the keyboard/accessibility flow when there is nothing to operate. Loading is not
zero. A denied read is not an empty queue. An unavailable integration is not healthy.

### Operations is an investigation workspace

Grafana recommends dashboards organized around questions, progressive detail and
meaningful measures rather than collecting arbitrary charts. Its guidance also warns
against unnecessary refresh overhead. Source: [Dashboard best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/).

Doji proposal: overall state plus freshness/coverage, then affected services, then
available latency/error histories, then incident/evidence detail. Each graph needs a
question, units, time range and source. Missing data must break the line or show unknown,
not imply zero errors. Reuse approved event invalidation/reconciliation; no new polling
or historical collection is authorized by a visual redesign.

### Visual hierarchy, not decoration

Carbon distinguishes presentation-oriented summaries from exploratory dashboards.
Research on 144 dashboards documents multiple composition/interaction patterns, not
one universal dashboard layout. Sources: [Carbon dashboards](https://www.carbondesignsystem.com/building-blocks/data-visualization/dashboards),
[Dashboard Design Patterns paper](https://arxiv.org/abs/2205.00757),
[authors' pattern catalog](https://dashboarddesignpatterns.github.io/patterns.html).

Our proposal: preserve Doji through charcoal surfaces, coral emphasis, purple identity
accents and consistent type/spacing. Use color sparingly for hierarchy; status needs
text/icon meaning as well as color. Keep standard accessible component behavior. No
random gradients, decorative charts, competing accent colors or custom control mechanics.

## 4. Proposed page contracts

| Page | Question answered | Composition |
| --- | --- | --- |
| Home | What matters today? | Greeting; prominent Daily Doji; short attention list; compact summaries and shortcuts |
| My Work | What am I responsible for next? | Assigned work, relevant priority/deadline filters, one queue |
| Area queue | What needs a decision here? | Area-specific filters/columns; one permission-scoped collection |
| Team & Access | Who has access, and what can they do? | Searchable people cards; account/role summaries; dedicated access editor |
| Record detail | What happened and what can I do next? | Identity/status/assignee header; evidence and history; contextual action footer |
| Operations | Is service healthy, and why? | Health/freshness; service summaries; supported charts; incident drill-down |

For record actions, one clear primary next step, a small number of secondary actions,
and an overflow menu only for genuine lower-frequency commands. Choosing an action
must not silently execute another. Start review may assign the acting employee only
where the existing atomic command supports it; this research changes no command semantics.
Do not require outcome rationale merely to claim work. Preserve required closure evidence,
permissions, audit and command uncertainty recovery.

## 5. Execution and acceptance plan

First reconstruct Home and Team locally as the two reference pages; do not continue
patching arbitrary widths. Establish their page hierarchy and shared shell together.
Then apply the resulting language to one representative queue and record detail,
followed by the remaining pages. MUI remains the component toolkit, not the source of
the product information architecture. Avoid another template/framework migration.

Visual/task acceptance must include:

1. At the owner's actual Chrome viewport and zoom, identify today's Doji and the next
   important task without scrolling through duplicate queues.
2. Find a colleague, understand their status/access and open Manage access without
   an unused form consuming directory space. Test two people, many people and long names.
3. Find an assigned case, open it, understand ownership and return with filters/page intact.
4. Compare 0, 1 and 10 records, loading, denied and error states: stable table geometry,
   no blank inner table ending halfway down the panel, sensible pagination.
5. Locate an affected service and explain its state from actual evidence; stale/missing
   telemetry must not look green. No chart without an available data contract.
6. Keyboard-operate navigation, record links, menus and forms; sticky actions must not
   cover the final field or validation message. Verify focus restoration and 200% zoom.
7. Inspect 1366, 1920 and 2560px layouts as well as real Chrome. Automated geometry and
   functional tests supplement visual review; they do not establish visual acceptance.

Home's currently documented bounded snapshot must not become a global total by relabeling.
No new backend reads, aggregates, invitation emails, avatars, permissions, realtime channels,
polling or member behavior are authorized here. Before implementation, reread product and
realtime context in full and verify the current contracts. Any necessary shared-system
change requires its separate impact review, approval, regression tests and rollback.

This research defines a direction. It does not claim that the rejected UI has been
replaced, accepted, tested as a new release or deployed.
