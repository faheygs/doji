# Admin dashboard reference plan

> Superseded reference selection: the owner requested research beyond MUI templates.
> Use [real-world UX research](ADMIN_REAL_WORLD_UX_RESEARCH_2026-10-09.md) for the
> current proposed direction. Minimal is no longer the primary reference. This older
> document is retained as research history, not an accepted implementation plan.

Research date: October 9, 2026. Status: researched direction, not implemented or deployed.

This supersedes the visual direction of the rejected October 9 home/team layout,
including its permanently visible access editor and desktop font-size workaround.
Existing data, permission, audit, command and member-isolation contracts remain in force.
Passing functional tests did not establish visual acceptance of that layout.

## Reference selection and evidence

Primary visual reference: [Minimal UI](https://mui.com/store/items/minimal-dashboard/).
Its public demo was entered using its provided demo login. The App home, User Cards,
User List and dedicated User Edit page were visually inspected. No demo records were
edited. The [official MUI dashboard](https://mui.com/material-ui/getting-started/templates/dashboard/)
was also visually inspected for navigation, card hierarchy and table composition.
Devias Kit's official listing was reviewed as an alternative; its live flows were not inspected.

Minimal separates a welcoming home, directory browsing and focused editing. Its home
gives a featured area greater visual weight than supporting metrics. Its directory has
a clear page heading and action, then repeated identity cards. Its edit page replaces
the directory with identity context and grouped fields. The list view puts status tabs,
filters and search above the table instead of scattering controls across the page.

These are design references, not permission to copy commercial template code/assets.
No purchase, package install or framework replacement is required for this plan.
We will compose existing MUI components and retain TanStack Query, routing and auth.

Do not copy Minimal's social counters, decorative profile covers, marketing carousel,
placeholder metrics or oversized demo navigation. Doji needs operational information,
not every component in a template. The wide-screen reference capture was interrupted;
it is not evidence of complete 2560px layout validation.

## Four intentional page patterns

| Pattern | Structure | Doji use |
| --- | --- | --- |
| Home | Personal welcome, prominent current/upcoming item, compact summaries, short attention list | Overview with Daily Doji, scoped work summaries and relevant shortcuts; no duplicate queue table |
| People directory | Heading and primary action, search/filter toolbar, identity cards | Team & access; name/initials, email, roles, account status and explicit Manage access |
| Work queue | Heading, relevant status/filter controls, one table surface, stable footer | My work, business applications, ideas, safety, announcements and audit, with columns specific to each job |
| Record/editor | Breadcrumb/back navigation, identity/status header, grouped content, contextual actions | Full-page records and employee access editing; no permanently open editor beside the directory |

Operations remains the detailed health workspace, not a second copy of Overview.
My work remains the signed-in employee's assigned queue. Safety source is record
metadata, not a reason to duplicate the queue. Restricted visibility remains enforced.

## Desktop composition

- Use a stable navigation rail and compact top bar. Group destinations by purpose;
  selected state, icons and labels must be consistent. Avoid menus full of template demos.
- Use one page heading, one action area and shared alignment lines. Do not repeat the
  employee identity in a second row immediately below a personal greeting.
- Use a desktop grid with consistent gutters and deliberate spans. Wider screens may
  show more directory cards or table columns; do not enlarge all typography to fill space.
- Work queues use the available work area. Forms use readable grouped columns;
  directory browsing must not reserve half the screen for an unused form.
- Home's Daily Doji has visual priority. Supporting cards should not compete with it
  or grow into empty full-height panels. Quick links are secondary, not giant duplicates
  of sidebar navigation.
- Preserve keyboard and narrow-window usability without using a stacked mobile layout
  as the desktop design. Validate real Chrome at the owner's normal zoom as well as
  1366, 1920 and 2560px screenshots; numerical geometry assertions alone are insufficient.

## Component and interaction rules

- Brand through a shared MUI theme: charcoal surfaces, coral emphasis, purple identity
  accents, readable button contrast and consistent shape/spacing/type tokens. Keep
  standard focus, keyboard, disabled and menu behavior. See [MUI theming](https://mui.com/material-ui/customization/theming/).
- Use Avatar with visible identity text, Chips for concise status, Cards for people,
  List for a short attention summary, and standard Menu/MenuItem for secondary actions.
  Keep the primary action visible; destructive options separated and explicitly confirmed
  when required. See [MUI menus](https://mui.com/material-ui/react-menu/).
- Do not add fake photos, unsupported invitations, notification badges or search that
  does not actually work. Existing employee initials are the valid avatar fallback.
- Keep native MUI tables for the bounded workflow lists. DataGrid is not a visual skin
  and is not required to adopt the reference's layout. Adopt it only for actual grid
  features, with server paging and keyboard behavior preserved.
- Table body height and loading/empty overlays must fill the same reserved area;
  pagination stays outside the scrolling body. Do not equate an unavailable count with
  zero or invent last-page navigation for cursor-only reads. MUI's [grid layout guidance](https://mui.com/x/react-data-grid/layout/)
  also distinguishes container sizing from content/overlay sizing.
- Team Manage access navigates to a focused editor in the proposed design. Preserve
  confirmation, audited reason, idempotency and unresolved-command recovery across
  navigation. A cosmetic route change must not discard an uncertain write intent.

## Information limits

Home currently has a bounded 25-record snapshot, not global queue totals. Labels must
state that scope concisely. Do not add trends or charts unless historical data exists.
Daily Doji comes from an existing server snapshot, not a new live-health contract.
Show checked time and unknown/error states honestly. Team browsing uses the existing
bounded directory; the UI must not imply company-wide search beyond that result set.

No new polling, global aggregate, employee-photo read, invitation/email flow, permission,
database change or provider integration is authorized by this visual research plan.

## Implementation order and acceptance

1. Recompose Overview and Team using these page patterns in local preview first.
2. Compare both with the reference at desktop sizes, including two-person, empty,
   long-name and many-person directory states. Do not use filler cards to fill space.
3. Apply the accepted shell, toolbar, menu and table patterns consistently to queues.
4. Verify connected permissions, denied/error/loading states, focus and back navigation,
   immutable retry intent, member isolation and existing artifact budgets.
5. Obtain visual acceptance before treating the redesigned layout as release-ready.

This document records research and the next design direction. It does not claim the
rejected local UI has been replaced or that a new release has been tested or deployed.
