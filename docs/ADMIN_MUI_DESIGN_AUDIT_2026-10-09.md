# Admin Material UI design audit

> Visual status: the owner rejected the subsequent home/team desktop layout. The
> [reference-led design plan](ADMIN_DASHBOARD_REFERENCE_PLAN_2026-10-09.md) supersedes
> its presentation direction. The persistent team editor below describes the existing
> local implementation, not the accepted target. Functional test results are not visual acceptance.

The admin portal should look like Doji and behave like Material UI. The October 9 local revision replaces the directory-like Overview with bounded team intake, gives each queue purposeful columns, restores identity and brand cues, and uses standard navigation and menu behavior. These revisions are not deployed; the hosted acceptance entry remains unchanged.

## Design direction

Keep Doji's warm charcoal surfaces, coral selected states, purple identity accents, strong headings and rounded panels. Centralize these in the shared theme; do not recreate focus handling, menus, dialogs, selects or date inputs. MUI explicitly supports palette, typography, shape and component customization through ThemeProvider. Its default theme is a starting point, not a requirement to erase the brand. [Theming](https://mui.com/material-ui/customization/theming/) and [theme components](https://mui.com/material-ui/customization/theme-components/).

Overview is a portal home, not another work queue: a personal greeting, Daily Doji, scoped attention counts, a short attention list and quick-access cards. My work remains personal assignments. Team & access is a people-management page with account cards and a persistent access editor.

## Component decisions

| Area | Chosen pattern | Doji application |
| --- | --- | --- |
| Navigation | Permanent desktop Drawer, temporary mobile Drawer, ListItemButton and AppBar with Toolbar | Consistent icons, visible selected state, grouped destinations, standard mobile focus containment and Escape behavior |
| Account | Avatar, IconButton, Tooltip and Menu | Existing authorized employee name and initials; one standard menu for lock and sign out |
| Identity | Avatar beside a visible name | Circular people, rounded businesses, generic icon for unknown assignees; no member-photo lookup or invented photo |
| Queues | Native MUI Table with sticky headers in TableContainer | Semantic header and record links, pointer row activation, horizontal scrolling inside the table, footer outside scrolling body |
| Paging | TablePagination backed by existing keyset cursors | Previous and next represent real server pages; no fake last page, global count or page size unsupported by the server |
| Forms | Standard MUI inputs, selects, dialogs and date pickers | Layout and brand styling may change; validation, focus and confirmation semantics stay intact |
| Width | Fluid workspace, bounded readable forms | Tables use available desktop width; long records and forms retain readable grouping |

These choices follow MUI's [Drawer](https://mui.com/material-ui/react-drawer/), [AppBar](https://mui.com/material-ui/react-app-bar/), [Menu](https://mui.com/material-ui/react-menu/), [Avatar](https://mui.com/material-ui/react-avatar/) and [Table](https://mui.com/material-ui/react-table/) guidance. Native tables support links in cells without implementing a custom grid keyboard model; see the [WAI table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/).

DataGrid is appropriate when editing, column management, large-data virtualization or richer selection becomes an actual requirement. These bounded 25-row workflow pages do not need it merely to look like MUI. A migration must preserve server sorting, cursor correctness and access checks; custom cell renderers also have [DataGrid focus responsibilities](https://mui.com/x/react-data-grid/accessibility/).

## Columns by job

| Queue | Columns |
| --- | --- |
| My work | Record, Queue, Received, Review target, Status |
| Business applications | Business, Received, Assignee, Status |
| Community ideas | Idea, Submitted, Assignee, Status |
| Safety | Case, Source, Received, Assignee, Review target, Status |
| Announcements | Message, Display window, Status, Created |

Use human-readable names first, compact references second, and explicit dates rather than raw identifiers or internal enum names. My work omits a redundant assignee column. Organization avatars use the authorized business name; employee names appear only when supplied by the authorized contract. Other assignees remain labelled Assigned employee rather than fetching an unapproved directory per row.

## Overview data and permissions

Overview uses one existing authorized staff inbox page with all kinds, all owners and a limit of 25, ordered oldest first. The three counts describe only that returned snapshot: Past review target, Need an owner and Assigned to you. They are not organization-wide totals. The attention list selects up to four overdue or unassigned items from that page, with overdue items first. Empty, failed, denied and loading states remain distinct; failed reads hide stale rows.

Operations readers also receive the Daily Doji card through the existing command-center snapshot at limit=1. Only occurrence fields and generated_at are retained. Its labels describe the last server snapshot: Upcoming, Pre-live, Awaiting activation, Activated or Window ended. A scheduled time alone never establishes activation. The card links to Operations; it does not claim live health. The legacy command-center RPC still computes its existing aggregates; this is a reused read, not a newly optimized single-row database query. No recurring query is introduced.

Team & access uses standard MUI Card, CardContent and CardActions, with avatars, roles, account status and Manage access. Search, status filters and eight-card pagination operate within the existing 100-account directory cap. Manage access preselects an email in the persistent editor; Grant access focuses that editor for another verified account. Selection never changes permissions. Confirmation and an audited reason remain required for an actual role change; uncertain outcomes freeze selection and preserve the exact original command. Invitations and email sending are unavailable here. These choices follow the [MUI Card guidance](https://mui.com/material-ui/react-card/): identity and content are grouped, with explicit actions separated from the content.

The query lives in the existing session-scoped work cache. Existing authorized identifier hints and reconnect or foreground reconciliation invalidate it. No polling, new topic, fan-out aggregate, server command, member query, database migration or provider grant is added. Initial development StrictMode or connection reconciliation can repeat the same bounded read. The server remains responsible for record-level authorization.

Mixed safety records open through an Overview record route and return to Overview. Detail reads independently verify ordinary versus restricted classification and employee permissions; the inbox does not guess classification from a record's source. Dedicated safety queues retain their stricter area checks.

## Performance and release checks

Only path imports from the matching MUI icons package are used. Shared UI modules are side-effect-free, with explicit entry imports so authenticated navigation is deferred. This follows MUI's [bundle-size guidance](https://mui.com/material-ui/guides/minimizing-bundle-size/).

The local connected artifact measures about 452.4 KiB gzip across all lazy routes, including about 89 KiB of deferred chart code. Home cards and access management have explicit allowances of 5 KiB and 7 KiB; the core allowance is 290 KiB and total 457 KiB. Sign-in retains its original 180 KiB ceiling. These are feature allocations, not claims that the entire workspace downloads at sign-in.

Acceptance covers desktop and 390-pixel layouts, table containment and footer placement, menu focus and dismissal, mobile navigation, text contrast, authorized queue reads, denied and failed states, field-free assignment, confirmation and unknown-outcome protections. Local synthetic fixtures do not establish production acceptance.

The home/access revision passes 178 unit tests and all 125 browser tests, plus TypeScript, ESLint, source-size and whitespace guards. All three web apps build locally; preview and connected artifact checks pass. Connected sign-in measures 165.1 KiB gzip and remains below its unchanged 180 KiB cap. Admin preview measures 400.4 KiB total and 311.8 KiB without charts; its non-chart allowance is explicitly 314 KiB, with the total still capped at 410 KiB. Business remains capped at 180 KiB. Desktop and mobile screenshots of both revised pages were inspected.

## Remaining scope

This is a shared design foundation and admin overview/queue pass, not a claim that every record editor or the full business and public-site migration is finished. Richer global metrics need a separately reviewed server contract. Actual employee photos need an approved identity-image contract. Announcement authoring remains in the legacy portal until its separate migration is completed. Hosted visual acceptance and deployment of this design are still pending.
