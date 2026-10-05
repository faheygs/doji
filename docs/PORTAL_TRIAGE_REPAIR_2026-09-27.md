# Portal triage production-readiness work — September 27

Current status: **phases A and the implemented phase B contracts are deployed**;
see `PORTAL_TRIAGE_RELEASE_2026-09-27.md`. This is not sign-off for unimplemented
phases C–G, immutable evidence retention, load certification or live video playback.
The local preparation record below is historical. Remaining audit work is tracked below. Existing
dirty changes were preserved; no commit or broad release was made.

## Implemented boundary

- Portal session reads revalidate employee identity, roles and capabilities on
  coalesced workspace reconciliation and foreground return. No recurring read
  polling was added. Role/capability changes require fresh staff sign-in rather
  than retaining wider cached access.
- HTTP status survives client errors. A denied item request coalesces a session
  check; confirmed revoked access clears protected DOM, overlays, collections,
  tokens and pending intents. An independently valid session is not logged out
  merely because one case command is forbidden.
- Portal requests have a 15-second fetch/body deadline. No failed command is
  automatically retried for timeout/503.
- Enforcement errors remain as accessible alerts inside the confirmation modal;
  validation and claim/priority errors remain beside the case actions.
- Unchanged failed decision/triage intents reuse the receipt key on manual retry.
  Changed inputs create a new intent. These receipts are held only in memory and
  are not promised across browser reload/process death.
- Pending confirmation blocks duplicate dispatch, Cancel and Escape. Logout or
  revoked authorization still clears everything; late completion cannot repaint
  another session. No real moderation actions were executed during testing.
- A confirmed decision followed by failed queue refresh explicitly says it was
  saved and warns against resubmission. A saved triage change whose state cannot
  reload disables further case actions until it is reopened.
- Unsupported community Accepted/Declined filters are hidden in live mode; this
  does not implement those missing backend workflows.
- Browser test output is explicitly isolated from historical root test artifacts.

Changed implementation boundary: `website/portal.js`, admin-only CSS and client,
portal tests/configuration, and context documentation. No mobile code, SQL/RLS,
Worker, push, auth settings, billing or release policy was changed in this batch.
Existing infrastructure remains shared. One small session read per coalesced
reconciliation replaces reliance on the initially cached capability set. This is
not a load qualification or proof of zero shared-capacity impact.

Design references: [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
for denied-access cleanup and authorization tests; [MDN modal dialog behavior](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal)
for keeping actionable error feedback within the modal interaction boundary.

## Verification

Auth-client tests pass, including new status-preservation and concurrent-denial
checks. Health classification (32) and queue-health boundaries (15) pass. The
final **59-test browser suite passed**, including late-command, triage-retry and
ambiguous network failure coverage. Its realtime fixture now implements connect
and emits connected state. Four portal/member-isolation Jest suites also passed
(**14 tests**); site validation passed for 11 pages, as did syntax and whitespace
checks. That is **120 counted tests plus the auth-client checks**. Browser network
responses are synthetic. Tests do not certify hosted SQL or app-device behavior.

## Complete remaining-work register

| Phase | Required outcome | Boundary / release gate |
| --- | --- | --- |
| A | Revocation, errors, retries, truthful supported controls | Local frontend batch above; final tests and isolated artifact review before deployment |
| B | Full authorized report media and appeal detail | Case reads, employee-only gateway routes, browser integration and separately approved avatar-permission draft tested locally. No deployment. Public-avatar confidentiality, historical snapshots and live/scale acceptance remain; see case-read and avatar preparation records. |
| C | External legal/takedown intake, assignment, evidence, correspondence, due dates, closure | Requirements and access/retention policy first; additive staff contracts; no claim that demo cases are real intake |
| D | Business verification and sponsored-Doji submission/review/revision/rejection/pause/takedown | Durable tenant-scoped workflows, authoritative schedule integration, audited exact-target commands; prototype is not production |
| E | Community acceptance/decline/archive and announcement draft/preview/publish/schedule/cancel | Staff-scoped audited commands, member-impact regression and delivery receipts; current reads remain read-only |
| F | Staff alert delivery status/retries and severity-based escalation | Approved operational policy, bounded durable work and no duplicate notification producer |
| G | Per-Doji feature failures, timeout/crash coverage and recovery | Correlation and coverage contract; no fabricated availability or new spend; instrumentation requires separate review |
| H | Staging acceptance, permissions, load boundaries, controlled release | Real-role end-to-end tests, explicit deployment approval, rollback, and owner acceptance |

## Approved scope: phase B preparation and testing

Owner approved local preparation/testing with **no additional cost**. Results,
exact files, unresolved limits and release gates are recorded in
`docs/PORTAL_CASE_READS_PREPARATION_2026-09-27.md`. This is not deployment approval.

Proposal: add bounded portal-only reads for the complete evidence manifest and
original appeal decision/context. Keep existing endpoints backward-compatible;
never give the browser direct unrestricted table/Storage access. The staff read
must preserve the original restricted-review, evidence-access audit and independent
review boundaries. It must report missing/deleted media honestly.

Member impact: shares Postgres/Storage/Worker capacity; staff reads can add bounded
load. No member read/RPC/RLS, session, write, alarm, push or enforcement-policy
changes are proposed. No new paid service is proposed. If implementation requires
any of those excluded changes, stop for a new impact review.

Regression gates: actual employee-role denial tests; own/other/restricted/deleted
case evidence; post/photo/video/profile-photo/comment/poll targets; original
appeal account effects; replay/independent-review behavior; migration apply and
rollback; before/after member RPC/grant/RLS fingerprints; member account/feed/
comments/participation read checks and bounded mixed-load tests. New code remains
outside deployment until the evidence and exact artifact are reviewed.

Release order: additive read contracts first, separately reviewed gateway routing
only if required, then compatible portal assets. Do not bundle all existing dirty
Worker/mobile changes. Capture the currently deployed versions before release.

Rollback: restore the prior frontend artifact first; disable new portal read
routing and remove only additive contracts/grants when no active caller depends
on them. Do not rewrite moderation history or reverse real decisions as rollback.
The old staff workflow must remain callable during migration. Exact SQL rollback
must be written and exercised with the actual implementation before approval to
deploy, not inferred from this proposal.

Production readiness requires phases B–H where applicable; phase A alone is not
the finished triage product requested by the owner.
