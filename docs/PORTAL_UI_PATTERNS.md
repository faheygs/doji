# Portal copy and contextual help

## Shared dropdown ownership (September 28, local candidate)

`website/portal-select.js` owns the existing `portalSelect` implementation for both
portals and the public safety form. The admin bundle includes it; standalone pages
load it before their runtime. Do not introduce native-looking or copied dropdown
implementations. Existing shared `portal.css` owns all dropdown styling.

Use `DojiPortalSelect.enhance(select, true)` for accessible controls. Native select
values remain the FormData contract. After replacing dependent options or changing
disabled fieldsets, call `refresh(select)` so the visible value/options stay aligned.
Required-field errors focus the visible combobox, not the hidden native select.
Light-mode selected text uses the existing #b33a20 accent for readable contrast.
Regression must exercise the actual open menu, keyboard selection/Escape, dependent
values, mobile bounds and disabled states—not just programmatic native select values.

## Record opening pattern (September 27)

Existing community ideas and announcements open in a right-side drawer using
`portalDrawer`, `adminDrawer`, `drawerHeader` and `drawerCloseButton`, with the
case drawer's 680px maximum width and full-width phone layout. Editing an existing
announcement stays in that drawer. Creation and consequential confirmations use
the centered modal pattern; Back returns to the prior form and preserves rationale.
The record's original submitted fields remain readonly.

The editorial host remains a native `<dialog>` opened with `showModal()` for inert
background and native focus behavior. Escape, Close and drawer-backdrop click close
inspection and restore the originating record control, including after Refresh.
Pending writes cannot be dismissed. Native focus may visit browser chrome but must
not reach background page controls. No custom focus trap or hidden background reads.
This is an admin-only presentation change, not a new command or member contract.

## Original submission presentation (September 27)

Community ideas use one read-only form renderer in both detail and confirmation.
Reuse `.formGrid` and `.field` with labelled native readonly controls for Type,
Question (Photo prompt for photo ideas), and each numbered Choice. Format questions
have separate Answer format and Word count or Starting letter fields, never a JSON
blob or a prose-only summary. Long prompt/choice fields wrap and grow where supported
and remain scrollable/resizable otherwise. Preserve original values and choice order.
Do not infer a different type from the prompt's words. Review rationale is separately
editable; the original-submission region has no submit handler or editing command.
The same-title record case is resolved by submission ID, never by displayed title.
Missing or unsupported details are explicit and prevent acceptance in the portal.
See `IDEA_SUBMISSION_PRESENTATION_2026-09-27.md` for the production-data diagnosis.

## Editorial consistency (September 27, local only)

Announcement and community-idea dialogs now reuse `portalModal`, `modalHeader`,
`modalBody`, `drawerCloseButton`, `formGrid`, `.field` and the existing portal
select enhancer instead of editorial-specific input/select/modal styling.
Dynamic rendering receives that enhancer from the portal runtime. Its opt-in
accessible mode names the select-only combobox, supports arrows/Home/End/type
selection and Enter/Space, and lets Escape close the options before the dialog.
Native form values remain authoritative for FormData. Filters are disabled while
their page is loading; pointer focus changes cannot remove an option before click.
The business portal's legacy enhancement mode is unchanged. No backend/member
deployment is included. See `ANNOUNCEMENT_CAMPAIGN_DESIGN_2026-09-27.md` for the
separate requested destinations, single-campaign and dynamic reward scope.

Routine changes here ship only through the admin static site. Do not change member
code, shared services, authorization, commands, or monitoring to adjust presentation.

## What stays visible

- Case facts, reporter context, evidence, decisions, owner, priority and deadlines.
- Required markers, validation errors, missing/stale data and access restrictions.
- Privacy warnings, member-impacting consequences and confirmation summaries.
- Monitoring coverage gaps: healthy delivery is not proof that every app feature works.

Remove duplicate summaries and internal implementation assurances such as atomic RPCs,
AAL2, production boundaries and server-owned state. Describe unavailable features in
plain language without implying that they work.

## Shared help component

`website/admin-portal/contextual-help.js` is bundled only into the admin application.
Mark supplemental field copy with `data-context-help` inside a `.field` with a label.
For a heading, wrap it and the help in `data-help-container`, and mark the heading with
`data-help-label`. Call `DojiContextualHelp.enhance(root)` after dynamic rendering.
Keep existing content IDs for dynamic hint updates. Enhancement is idempotent.

Help appears as a named question-mark button beside the label and a native top-layer
popover. It never occupies an input's grid row. Labels share a minimum height so paired
controls align. Enter/Space opens it; Escape dismisses it before the underlying case;
outside click, navigation, scrolling and closing/locking the case also dismiss it.
Help performs no network reads or commands. Browsers without popover support retain
inline guidance. Do not put mandatory warnings or errors inside optional help.

Regression suite: `npm run test:admin-portal`. The contextual-help browser cases cover
desktop/mobile alignment, light/dark contrast, viewport bounds, keyboard dismissal,
visible privacy/coverage warnings and absence of write requests.

September 25 UI release: `admin-app-20260925ao.js`. The global technical strip and its
28px layout offset are removed; the sticky header now meets the viewport edge.

Released to the existing `doji-admin` Pages project as `bea0fd0e`.
The public custom-domain index, bundle SHA-256 and CSS were checked against the
tested output. Validation passed: 29 browser tests, 28 health-model tests, the
authentication client suite, 9 portal isolation/operations tests and website link
validation. No shared Worker, database, mobile or release-policy deployment occurred.
Rollback: restore the prior Pages deployment `5842ffb9` (bundle `20260925an`).

## Triage workspace refinement — 20260925ap

- Readable subject and concern lead each case; a short reference remains secondary.
  Case details can copy the full identifier without fetching member data.
- Compact, fixed-height Close controls; 24px between case facts and the next divider.
- Existing server deadlines drive overdue duration and red missed-target warnings.
  High/critical priority or serious/emergency severity gets stronger urgent treatment.
  This does not change SLA policy, server deadlines, notifications or escalation commands.
- Tables and audit lists use a viewport-bounded scrolling area and persistent
  Previous/Next controls. Authorized pages are reused when going backward; filters reset
  position. No total count is invented from partially loaded data. No new polling or API.
- Health signals explain why they cannot be verified rather than displaying an
  undifferentiated Unknown. Quiet windows show no measured latency, not a misleading 0ms.

Employee identity and missing monitoring integrations remain separate scopes; see
`WORKFORCE_IDENTITY_PLAN.md`. No authentication/backend migration is part of this UI release.

Static release: Pages deployment `7a33db07`, bundle `20260925ap`. Checks passed:
33 browser cases, 32 health-model tests, authentication-client checks, 9 portal
isolation/operations tests, syntax and link validation. Desktop and phone screenshots
were inspected. Rollback is the prior static deployment `bea0fd0e` (`20260925ao`).
