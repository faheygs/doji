# Internal admin completion — September 27

Owner scope: internal admin only. Business/sponsorship and external reporting/legal
intake are deferred. Restricted review of existing in-app reports remains in scope.
No new paid services or upgrades.

## Portal-only increment — LOCAL, NOT DEPLOYED

- Staff access changes reject overlapping submits, freeze submitted fields, reuse
  unchanged failed intents' receipt keys, reject late callbacks after lock, and
  distinguish saved changes from failed directory/workspace refreshes.
- Claim next loads the authoritative case before claiming, rejects newly assigned
  or closed reports, and uses the guarded triage command/error/retry path.
- Appeal History uses the authorized original decision and full appeal record,
  separately from the linked report workflow. No immutable snapshot is implied.
- Audit report-link failures stay inside the dialog. Closed/locked/superseded
  dialogs reject late reads. Appeal audit entries open the exact appeal even when
  it is outside the loaded queue.
- Audit export is single-flight and rejects late responses after lock.

Changes: admin branch of `website/portal.js`, browser tests and context records.
Business code, mobile code, SQL/RLS, Worker, auth settings and billing are untouched.
No production action, email, role grant, migration or site deployment performed.

Verification: full 76-test browser suite passed; subsequently added exact-appeal
audit navigation test passed; auth-client checks and 32 health + 15 queue-health
tests passed; JavaScript syntax passed. Browser APIs are mocked. Two initial claim
tests timed out because the test had not navigated to Work queue; corrected tests
passed. Node's subprocess test runner hit sandbox EPERM; running the same test
files directly passed. This is not real-role mutation or production acceptance.

Design references: [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
and [W3C status-message guidance](https://www.w3.org/WAI/WCAG21/Understanding/status-messages).
Server authorization remains authoritative; browser guards are additional safety.

Resume checkpoint after member-query fixes: rebuilt the isolated local admin assets
and reran the complete browser suite: **77/77 passed**, with packaged CSP and mocked
backend responses. Auth-client checks and **47/47** health/queue checks also passed.
The first browser launch was blocked by sandbox subprocess permissions; the approved
local rerun passed. No production reads/actions, deployment, mobile build or backend
change was performed during this checkpoint. The member-query fixes remain queued
separately in `MEMBER_QUERY_FIXES_NEXT_BUILD_2026-09-27.md`.

Next proposed implementation order is announcement lifecycle, then community review.
Separate approval has been requested for local backend implementation/qualification
under the scope below; do not interpret a general request to resume portal work as
permission to deploy shared-system changes. This increment remains LOCAL until its
isolated release artifact and deployment are reviewed.

## Remaining internal completion gates

Release follow-up: announcement/community workflows and the preceding UI safety
increment are now live under `ADMIN_EDITORIAL_RELEASE_2026-09-27.md`. Existing
work-session reads and forms passed production smoke checks without real decisions.
The table below is the historical pre-release checkpoint; announcement/community
implementation and release are complete, while controlled member-effect/device
acceptance and the separate policy/alert/media gates remain open.

September 27 checkpoint: the separately approved local announcement/community
implementation is now prepared and qualified. See
`ADMIN_EDITORIAL_PREPARATION_2026-09-27.md` for exact contracts, tests, limitations,
and the still-required separate production deployment gate. The rows below describe
hosted completion/acceptance; they must not be read as a claim this increment is live.

| Area | Remaining work |
| --- | --- |
| Reports, restricted review, appeals | Controlled real-role mutation and real-media acceptance; immutable evidence preservation remains a separate policy decision |
| Community ideas | Staff-authorized atomic accept/decline, rationale/audit, bounded complete history and exact options |
| Announcements | Authorized draft/preview/publish/schedule/cancel, safe links and existing eligibility/frequency contract |
| Staff alerts | Durable outcomes/recovery and approved severity response/escalation policy; direct email handoff is not a delivery ledger |
| Operations | Delivery/error visibility is not crash-free or per-feature success assurance; additional telemetry requires separate scope |
| Access, audit, queues | This increment's release artifact review and owner acceptance |

Old repair-register phases C (external intake) and D (business) are deferred, not
prerequisites for this internal scope. Missing internal actions remain incomplete.

## Separate backend approval requested: community and announcements

The existing `review_challenge_suggestion` requires a member administrator profile
and uses member-linked review/receipt fields. Broadly granting it to employees is
not a suitable integration. Approval creates an active challenge-pool item—an
intentional member-facing effect. Announcements have a member claim/receipt contract
but no qualified employee publishing lifecycle. Publishing affects eligible members.

Proposed approval: local implementation and qualification of additive employee/AAL2,
permission-scoped atomic commands and bounded reads, with staff receipts/audit and
explicit confirmations. Preserve existing member APIs, reward/notification behavior,
frequency caps and scheduling semantics. Idea acceptance must not launch, reschedule
or close a Doji. No bulk user writes, new push/email producer, mobile build, Auth
policy, retention policy or paid resource. Any necessary existing shared-function
or trigger change must be enumerated and qualified before deployment approval.

Impact/isolation: only a deliberately selected announcement/idea changes through an
authorized command. Shared Postgres/Worker capacity still carries bounded staff load.
Staff sessions remain separate; member sessions are never revoked. This is not
physical isolation or a zero-risk guarantee.

Tests: real employee/member/anonymous role matrix and MFA; least privilege;
duplicate/concurrent commands and ambiguous retry; input/option mapping validation;
stale edits; publish windows/cancel/frequency receipts; existing reward/notification
idempotency; member profile/feed/comments/current-Doji canaries; preserved function,
grant and RLS fingerprints; bounded plans/locks; migration apply and rollback.
No real suggestion decision or live announcement should be submitted merely to test.

Deployment is a later explicit gate: review exact database delta, gateway routes and
frontend artifact separately. Preserve existing live Worker code, bindings, alarms,
secrets and unrelated dirty work. Verify current plan capacity; stop if extra spend
is necessary. No broad migration push or whole dirty Worker deployment.

Rollback: restore prior portal/gateway first, drain new callers, then remove only
unused additive contracts after dependency checks. Preserve real review/audit and
announcement receipts. Never reverse a real decision or delete delivery history as
deployment rollback. Write and test exact SQL rollback before release approval.

Staff alert escalation, severity deadlines, retention policy and new app telemetry
are not included in this first backend proposal. Each needs its own design/impact
review. Existing 24-hour report targets remain unchanged.
