# Employee editorial workflows — local qualification

Release follow-up: the owner subsequently approved production deployment. The
qualified increment is now live; exact receipts, production checks and remaining
acceptance gates are in `ADMIN_EDITORIAL_RELEASE_2026-09-27.md`. The historical
local preparation checkpoint below remains unchanged for provenance. Production
default service-role grants were explicitly removed from new objects and retested.

Status: LOCAL implementation and qualification only. **Not deployed.** The owner
approved local preparation following the shared-system scope in
`ADMIN_COMPLETION_2026-09-27.md`. No production decision, announcement, send, mobile
build, infrastructure purchase, billing change, or hosted deployment was performed.

## Implemented contract

- Announcements: create disabled draft, edit draft, content preview, explicit publish
  or future-window schedule, and cancellation. Published content is immutable;
  create a new announcement to change it. Cancellation prevents future claims,
  not an already-claimed popup. Never deletes existing receipts.
- Only existing member capabilities are exposed: title/body, fixed supported app
  destinations, priority, start/end, impression cap and cooldown. All eligible
  signed-in members; no invented audience targeting, once-per-release rule, delivery
  guarantee or push broadcast. The preview is content, not a native-device screenshot.
- Community ideas: authoritative exact prompt/options, acceptance or decline,
  required member-visible rationale, audit and full status-filtered keyset history.
  Acceptance creates one active pool challenge using the existing kind mapping.
  It never schedules, activates, closes or changes a daily event. Existing suggestion
  update triggers own rewards, badges and review notifications; no second producer.
- Bounded queues (25 rows, server ceiling 50), status filters, Previous/Next, readable
  titles, accessible native dialogs, inline persistent outcomes and contextual help.
  Date entry uses the operator's local zone; confirmations display the zone. Invalid
  daylight-saving gap times are rejected instead of silently shifted.
- Existing `operations.read` permits reads; existing `admin.manage` permits writes
  (currently super admins only). No new role assignment or broader member grants.
  `doji_employee` + AAL2 + active authorization checked on each command/read.
- Staff commands lock the employee row, then per-actor retry key, then target row.
  Revocation serializes with commands. Same intent/key verifies its saved outcome
  and returns the authorized current record (or a saved-but-unavailable receipt);
  different payload/key reuse is rejected by a SHA-256 intent fingerprint. Row
  version tokens detect stale edits/decisions; tokens are concurrency checks, not
  authorization credentials. No optimistic success before server acknowledgement.
- Lock/expiry erases editorial content and intents. Epoch/revision checks discard
  late reads/writes. A failed post-save refresh never means the command failed.

## Additive surfaces and isolation

`docs/drafts/employee_editorial_v1.sql` is **not an auto-applied migration**:

- Two private RLS tables: announcement lifecycle metadata, employee idea review
  attribution. Employee reviewers never receive a member profile. The existing
  member-profile-linked `reviewed_by` remains null for employee decisions.
- Three employee RPCs: `get_admin_editorial_page_v1`,
  `get_admin_editorial_item_v1`, `admin_editorial_command_v1`. Two ungranted helpers.
- Four additive indexes for bounded announcement/idea/status/history reads. Hosted
  table sizes and plans must be reviewed before release. The draft has a two-second
  lock/eight-second statement budget. If too large, separately stage concurrent
  indexes; do not extend blocking budgets against member traffic.
- Existing employee receipts and audit are reused. No member function, trigger,
  grant, RLS policy, schedule, session setting or Auth identity is replaced.
  Editorial receipt payloads retain only identifiers/version/outcome plus an intent
  fingerprint, not a second copy of member prompt/options/profile data. Deleted
  records cannot be recovered from the receipt; successful retries still report
  the already-recorded outcome without repeating side effects.
- New announcement events contain an ID on `moderation:global`; existing staff
  invalidation/reconnect/foreground reconciliation handles them. Idea updates use
  existing staff/member triggers. No polling, recurring job or new push/email path.
- Three additive Worker routes use the existing caller-JWT/AAL2/origin/rate/deadline
  boundary; never a service-role bypass. Shared Worker release remains separately
  gated. The mobile app never calls these routes.
- `website/admin-portal/editorial.js` is admin-only. The build flag
  `DOJI_ADMIN_EDITORIAL_ENABLED=true` is explicit opt-in; the default is **false**.
  Business UI and member code are unchanged in this increment. Legacy announcement
  rows are read-only; adoption is not silently inferred.

Shared Postgres/Worker capacity still exists. This is logical isolation, not a
physical isolation or zero-risk claim. Only deliberate publication/review commands
have the described member effects.

## Verification

- `node scripts/test-editorial-local.mts`: offline real PostgreSQL; all draft DDL,
  fixtures and writes roll back. Permission/MFA/disabled-role denials, no direct table
  grants, create retry/payload mismatch, stale edits, unsupported links, immutable
  publication, expiry/scheduling, member claim caps, cancellation receipt preservation,
  exact poll/WYR/photo/format/question mapping, one reward and one review outbox event,
  bounded keyset/filter reads, existing function/grant/RLS fingerprints and rollback.
- Synthetic member profile/realtime/notification/feed/comment RPC compatibility
  checks pass. Feed/comment checks use absent-content IDs and prove callable contracts,
  **not real-device content rendering or a historical performance resolution**.
- `node scripts/test-editorial-concurrency.mts`: creates a disposable database inside
  the offline local container, tests simultaneous duplicate creates, competing
  publish/cancel, and role-revocation races. One result/one audit; losing stale
  decisions rejected; revoked write denied. Drops only its generated QA clone.
  Existing local fixtures remain untouched. No external credentials or ports.
- Browser coverage: draft confirmation, escaped previews, publish retry identity,
  exact choices/member effect, readonly roles, late completion after lock, bounded
  paging/status filters, unavailable reads, keyboard help, no serious/critical axe
  findings in new forms at 390/1440px in light/dark, aligned date fields. Screenshots
  reviewed. Existing admin browser regression suite retained.
- Full Jest, TypeScript, auth-client, health/queue checks and changed-code lint run
  alongside the portal suite. See final checkpoint below for exact final counts.

## Separate production release gate

Final local checkpoint (2026-09-27): **90/90 admin browser tests passed** (13 new
editorial cases); full app Jest **131 suites / 1,017 tests passed**, followed by a
final 28-test gateway/case/isolation rerun. TypeScript and changed-code lint passed.
Auth-client checks, 32 health and 15 queue tests passed. Real PostgreSQL qualification
has 38 assertion call sites plus denial/rollback/fingerprint checks; all three
multi-connection race scenarios passed. Test-only cloned databases were removed;
the preexisting offline container and VM were restored to their original stopped
state with existing data retained. The default generated admin bundle still has
`editorialEnabled: false`. No production release occurred.

Repository-wide `git diff --check` also reports two preexisting trailing-whitespace
lines in `website/admin-portal/index.html` (140,147); that unrelated file was not
edited in this increment. They are not runtime/test failures.

1. Owner explicitly approves the additive database + three-route shared Worker +
   admin asset release. No broad migration push or deployment of this dirty worktree.
2. Capture current production baselines and included-plan capacity read-only. Compare
   all existing member functions/grants/policies/triggers and Worker bindings, alarms,
   schedules, secrets and routes. Stop if paid capacity or a changed member contract
   would be required.
3. Build isolated artifacts from the current production base with only reviewed
   deltas. Review migration/index plans and dependency-safe rollback.
4. Apply approved additive DB then gateway; verify role denials and read-only member
   canaries before enabling frontend. Never publish a real announcement/decide a real
   idea just to smoke-test production. Use owner-selected controlled acceptance later.
5. Confirm the work session and personal app profile/feed/comments remain independent.
   Physical-device announcement display remains an explicit acceptance gate.

Rollback order: disable frontend feature, restore prior gateway, drain callers, then
run `employee_editorial_v1.rollback.sql` if needed. It removes only RPC entry points
and helpers. It deliberately retains private lifecycle/review metadata, indexes,
audits, command receipts, challenges and member announcement receipts. Do not reverse
a real moderation/editorial decision or erase delivered history as deployment rollback.
Re-enabling after rollback needs a reviewed forward migration for retained tables,
not blindly rerunning the initial create script.

## Documentation basis

- [PostgreSQL security-definer functions](https://www.postgresql.org/docs/17/sql-createfunction.html):
  fixed empty search path, schema-qualified relations, revoke default PUBLIC execute
  and grant only intended entry points inside the same transaction.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html):
  transaction-scoped row/advisory locks; qualified with competing real connections.
- [OWASP transaction authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html):
  server-side authorization, explicit significant transaction data, stale-state checks.
- [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html):
  deny by default, least privilege and authorization on every request.
- [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
  and [local date/time inputs](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/datetime-local):
  native modal/focus semantics, explicit close, and explicit time-zone conversion.

## Remaining admin-wide gates (not silently completed)

This completes local announcement/community workflow implementation, not all hosted
operational acceptance. Controlled real-role moderation/media acceptance, staff-alert
delivery/recovery policy, severity/deadline policy, and evidence retention remain in
`ADMIN_COMPLETION_2026-09-27.md`. Business/external intake stay deferred. No changes to
those policies or new app telemetry were included in this approval.
