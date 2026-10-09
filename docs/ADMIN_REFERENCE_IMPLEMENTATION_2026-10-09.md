# Reference-led admin presentation: first implementation

October 9, 2026. Now hosted at /connected; default portal unchanged (release below).
The owner accepted the Home/Team direction
("much better") and approved extending it to queues and record pages.
Direction: [real-world research](ADMIN_REAL_WORLD_UX_RESEARCH_2026-10-09.md).

## Hosted design release

The local implementation notes below describe preparation. The approved presentation
was subsequently released October 9 at 17:56 UTC as deployment
`d9130763-8f5f-491e-9756-028c7c890e89` at https://admin.dojipro.com/connected.
This is the existing authenticated acceptance entry, not a root cutover. Announcement
creation/publishing remains in the default portal; business React and public Next.js
are not released by this change.

- Exact package: `test-results/react-admin-hosted-20261009-v4/site`; prepared,
  tested, deployed, verified and bounded acceptance receipts are retained beside it.
- All 133 packaged browser checks passed; TypeScript, lint, source-size and whitespace
  checks passed. Earlier 181 unit checks and build budgets remain applicable because
  no application artifact changed during release preparation.
- Staged testing corrected fixture-only gaps: privacy now reads staged HTML rather
  than development HTML; synthetic protected media is intercepted at the CSP-allowed
  origin; two accessibility audits wait for MUI dialog opacity to reach 1. Production
  CSP was not weakened, and no real media was fetched.
- Initial post-deploy asset verification observed a transient mismatch. A subsequent
  comparison matched exactly; the full read-only verification then passed at 17:57 UTC.
- Chrome restored the existing employee session. Home, Team, business queue/detail
  and return navigation passed read-only acceptance; queue updates showed connected.
  The record summary was alongside content at 2560px, without horizontal overflow.
  No console warnings/errors were reported in the bounded inspection. No hosted writes.
- Default root/legacy assets, API proxy and security configuration are unchanged.
  Business and main-site deployment IDs remain unchanged. No member/shared changes.
- Immediate rollback: the byte-verified preceding acceptance package at
  `test-results/react-admin-hosted-20261009-v3/site` (deployment
  `7669938e-8f03-4de7-a841-4c14af5c8b94`). Original legacy rollback remains retained.
  Roll back only the admin Pages artifact, preserving project configuration.

This is not a claim that all workflows have completed production acceptance or that
the entire framework migration is complete. Root cutover and separately gated
announcement/provider/email/shared-system changes remain outstanding.

## Applied scope

- Home: greeting/action header, prominent Daily Doji, concise bounded work summary,
  attention alongside the Doji on desktop, and compact link-based Quick access.
  Removed the duplicate employee identity row and oversized shortcut card grid.
- Team: a full-width directory toolbar, compact identity cards, account state distinct
  from roles, and existing eight-account local pagination. Search remains bounded by
  the authorized 100-account directory, with the cap explicitly disclosed when reached.
- Manage access: focused full-page view, separate from directory browsing, with current
  account context and the existing role form. It is an in-route view, not a new deep link.
  Back returns to preserved filters/page and restores focus to the invoking control.
- The editor remains mounted when hidden. Busy/unconfirmed/rejected-pending-refresh
  commands and confirmation prevent the new Back control from discarding intent.
  Identical retry keeps the original payload/key. A selected employee's email cannot
  diverge from the identity card. Granting a different verified account starts from
  Grant access in the directory. No invitation/email function was added.
- Shared shell: stable 264px desktop navigation and compact toolbar. Removed blanket
  admin font enlargement; retained ordinary working text, deliberate heading sizing,
  Doji colors, standard MUI controls and accessible contained-button labels.

This does not redesign every portal page or change moderation outcomes. Operations,
queues and record workflows retain their existing implementations; shared shell/type
changes apply consistently. Team selection, Home links and visual checks issue no
moderation or role writes. Test commands use intercepted synthetic fixtures only.

## Data and security

Existing TanStack keys, authorized read limits, event invalidation, foreground/reconnect
reconciliation and role commands are unchanged. Failed reads clear displayed account/
case data. Home metrics remain a snapshot of up to 25 oldest accessible records, not
global totals. Daily Doji remains a server snapshot, not a newly asserted live status.

Member authentication, backend, shared Worker/database, provider configuration, email
sending and billing are untouched. No new polling, photos, invitation endpoint or
dependency was introduced. No commit, push or deployment is claimed.

## Validation

TypeScript, ESLint and the 179-test unit suite passed during implementation.
The scoped browser suite covers Home/Team plus representative queue/navigation and
business shared-shell regressions. Desktop captures use 1366, 1920 and 2560px;
actual Chrome was also inspected at its normal approximately 2560px-wide viewport.
Connected tests intercept every production-shaped request and use local assets.
They are not hosted acceptance or proof of all employee roles.

Initial failures were a test setup race before the directory loaded and an offline
business preview server; after fixing setup and starting the preview, the original
16 scoped browser checks passed. Added directory tests cover long names, more than
eight people, local paging/filter reset and loading versus genuinely empty data.
The final expanded suite passed all 18 checks, including those additional cases.

The initial unique Team chunk exceeded its existing 7 KiB limit. Reusing the shared
MUI TablePagination removed the separate pagination implementation; the existing
artifact thresholds were not increased. The connected artifact guard passed at
450.5 KiB total application JavaScript gzip and 165.2 KiB sign-in in the final run.
The unique Team chunk is 4.47 kB gzip (decimal), below the unchanged 7 KiB limit.
Admin and business preview builds, the connected admin build, artifact guards and
the repository size check passed. These are local artifacts, not deployed bytes.

Reproduce focused browser checks with:

```powershell
cd web
npx --no-install playwright test --config playwright.design.config.ts tests/browser/desktop-layout.spec.ts tests/browser/home.spec.ts tests/browser/team.spec.ts tests/browser/design-system.spec.ts tests/browser/workspaces.spec.ts --workers=2
```

The focused config can reuse local admin/business preview servers; it does not stop
the owner's preview. Evidence is under web/test-results/design-reference/.
Functional tests and screenshots are evidence for review, not owner visual approval.

## Remaining

Home and Team establish the accepted page language for subsequent queue/detail refinements.
Deployment remains separate. Returning through the global navigation or reloading is
not a newly implemented durable uncertain-command recovery workflow; the new local
Back transition specifically preserves the mounted editor.

## Queue and record extension

The approved direction now extends locally to the core work queues and connected
record pages. This is a presentation-only extension, not a new workflow deployment.

- Queue columns remain area-specific: business/idea queues omit irrelevant source
  and deadline columns; personal work does not repeat assignee; safety keeps source
  and review target in the same table. The title column receives more space in
  four-column queues. Existing authorized cursor paging, read limits and footer
  positioning are preserved. Keyboard users can open a focused row with Enter;
  ordinary links and modifier-click behavior remain available.
- Connected work queues have a compact toolbar with existing status selection where
  supported, plus sort/page-size context. No unsupported live search/filter was added.
  Preview-only search explicitly identifies its sample scope.
- A shared admin-only RecordLayout places the main record/evidence/history beside a
  340px read-only summary on desktop. Narrow layouts put the summary above the record.
  Business, external safety, reports/appeals, ideas, privacy, audit and announcement
  details use this same structure. Application fields use a two-column description
  list where space allows. Existing command forms stay below both columns.
- Assignee, provenance, revision and eligibility information are preserved. No
  action is performed just by selecting a row or rendering a summary. Protected
  evidence remains explicitly authorized and never auto-loads. Read-only announcement
  limitations and safety/retention warnings remain visible.
- The existing shared table body, loading/error/empty states and footer are reused.
  New responsive checks cover 1366/1920/2560px, short and empty pages, keyboard
  navigation, summary placement, and no writes on record navigation.

No member, database, Worker, session, command payload, realtime, polling, provider or
dependency changes. The preview still uses synthetic data; the connected tests use
intercepted authorized fixtures, not production records. No deployment is included.

### Extension validation

- Final TypeScript and ESLint checks passed.
- 181 unit tests across 37 files passed, including literal text/zero/missing-value
  checks for record fields.
- 133 browser checks passed across admin and business preview/connected fixtures.
  Only the two main-site-only checks were excluded; the main website is unchanged.
  These checks cover reauthorization, denied reads, protected media, confirmation,
  replay/idempotency, paging, keyboard access, responsive layout and accessibility.
- Admin preview and connected builds passed. Existing artifact budgets passed:
  preview 399.9 KiB gzip; connected application JS 452.3 KiB; sign-in 166.0 KiB.
  Existing external Ably SDK is not included in those app-byte totals.
- Repository source-size and git whitespace checks passed. Browser checks also
  exercise the unchanged business shell; its existing artifact remains 153.5 KiB.
  Main-site HTML artifact checks used its existing build, not a new website release.
- Actual Chrome queue/detail views were inspected at the normal wide desktop
  viewport. Synthetic connected business/safety captures confirm the summary is
  beside the content and existing actions remain below the record.

Reproduce the broad browser run with:

```powershell
npx --no-install playwright test --config playwright.design.config.ts --workers=2 --grep-invert "public homepage renders|website filled actions"
```

This validates the local UI candidate, not a production deployment or a guarantee
that every real-world workflow is error-free. Provider/email gates and any separately
approved shared-system work remain outside this presentation change.
