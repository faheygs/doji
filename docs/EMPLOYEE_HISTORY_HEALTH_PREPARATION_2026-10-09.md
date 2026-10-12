# Employee health and history — preparation and release

Status: released October 9, 2026 at 18:16 MDT after owner approval and gated
preflight/acceptance. Employee runtime v19, four additive employee-read/bridge
functions and the private history-read gate are deployed. Admin Pages deployment
`09a9d34e-d99c-4373-a511-2ec92ea10487` serves the verified `20261009e` package.
No member account, case, announcement, email or provider configuration was changed.

## Production verification

`scripts/release-employee-history.mts` captured live contracts, source sizes,
runtime source, secret digests, Pages configuration and rollback packages before
changes. Installation used short statement/lock budgets and challenge-window and
outbox guards. Existing function/grant/owner/RLS/policy/role fingerprints remained
unchanged, excluding only the four explicitly added functions. No lock waits were
present. Unrelated runtime deployments, secrets and business/public Pages IDs stayed
unchanged; shared capacity remains a risk boundary, not physical isolation.

The database was installed disabled; runtime v18 was deployed off and v19 on with
downloaded sources compared to the exact tested package. Then the database gate was
enabled and acceptance deployment `31346dba-5948-4af6-a4b3-0ac262a85dfe` changed only
the connected entry while preserving the main entry/config. Five additional exact
acceptance-package browser checks passed before hosted read-only checks.

Hosted checks verified session restore, Open/Completed/All personal work, five-row
keyset paging to range 6-6, completed idea detail and return context, Active/Expired/
All announcements, historical cancelled announcements, and unified idea history.
Empty Active/Expired states were verified; no expired production announcement was
available, so lifecycle boundary cases remain covered by local fixtures. Sentry now
shows a successful provider observation timestamp. Historical Doji Watch correctly
remains for earlier missed delivery targets. No real commands were executed.

After promotion, all new assets matched exact SHA-256 inventories, config/entry
responses retained no-store, unauthenticated employee session access remained 401,
and the main page restored the existing session and showed the new Open default.
The first browser navigation overlapped promotion and read the prior config; a reload
after verification loaded the new control. Evidence and phase manifests:
`test-results/employee-history-release-20261009/`. Screenshot:
`D:/ChallengeApp/DoIt/test-results/admin-history-live-20261009.png`.

Health-event feed enabling, unrelated held migrations and member/mobile releases
remain outside this release. No new polling, provider plan or billable dependency.

Rollback inventory: prior Pages package is
`test-results/react-admin-autofill-20261009/site` (deployment
`5dd7deb2-a1de-4bb8-8a4c-094d17e657b3`); captured v17 runtime is
`test-results/employee-history-release-20261009/runtime-before`. Check intervening
changes, restore prior UI/runtime, disable the history gate, then apply bridge
rollback before read rollback. Do not roll back unrelated releases or source data.

## Sentry timestamp backport

`scripts/employee-health-timestamp-patch.mts` pins the captured deployed
employee-health module by SHA-256. It changes only successful Sentry cache-load
completion: add `observed_at` after the bounded provider body has been parsed.
Cache hits retain that timestamp. Failed/unconfigured reads get no success stamp.
The operational snapshot is untouched; generated_at is not substituted for source
freshness. Authorization still precedes every cache hit. Existing 30/60-second
caches, five-second upstream deadline, 25-issue/24-hour query and response byte
limit remain unchanged. No polling, event enabling, DB call or paid dependency added.

Local package: `test-results/employee-health-timestamp-20261009/`. Its inventory
proves exactly one runtime file changed; `rollback/` is the byte-identical captured
baseline. There is no deploy command in the preparation script. Do not rebuild the
whole newer employee candidate: that would include unrelated health-feed changes.

Five focused exact-package tests pass, including concurrent cache loads, completion
timestamp, 60-second expiry, denial before cache, cancellation, malformed/oversized
provider responses, upstream failures and recovery. Typecheck and targeted lint pass.

## Additive history reads

`docs/drafts/employee_history_reads_v1.sql` adds two read entry points and one
default-false `history_reads_enabled` column in the existing private settings:

- `get_admin_personal_work_page_v1`: open (default), completed, all; six existing
  work sources; current employee ownership is mandatory in SQL. There is no user ID
  or all-employees parameter. Existing source permissions and restricted-safety
  checks still apply after completion. Draft business applications remain excluded.
  Page size 1–25; per-source limit before union; oldest-first `(at,kind:id)` cursor.
  Dates remain original receipt/submission dates, not invented completion times.
  Completed rows return closed work state and no active SLA deadline. This is current
  assignment history, not an activity ledger of everything a person ever touched.
- `get_admin_announcement_lifecycle_page_v1`: active (default), all, draft, live,
  scheduled, expired, cancelled, disabled. Active means draft/live/scheduled. Server
  filtering occurs before the limit, using the existing editorial display-state
  precedence, including legacy rows and exact start/end boundaries. Existing member
  eligibility is not changed. Newest-first `(created_at,id)` cursor; at most 25 rows.

The generator copies the existing six-source permission predicates with checked,
deterministic transformations. `--check` detects generated-source drift. These are
drafts, not automatic migrations. No existing read, command, trigger, member grant,
RLS policy, or index is replaced. No new indexes were needed for local qualification.

`employee_history_bridge_v1.sql` adds a separate fixed-operation independent-employee
dispatcher. It verifies the existing principal/MFA context, rejects extra fields and
commands, sets only server-owned claims, and restores prior claims on success/failure.
It cannot accept an assignee override. Only the employee application role can invoke
the bridge; it cannot call the public reads directly. Existing dispatchers are unchanged.

## Qualification

`node scripts/test-employee-history-reads.mts` creates a fresh network-disabled,
portless PostgreSQL container and replays 289 baseline migrations. The unrelated held
`20261009034000_moderation_outer_replay.sql` is explicitly excluded. The shared test
replay helper accepts an optional exclusion list; existing callers remain unchanged.

46 functional assertions passed, with additional per-row assertions while traversing
all pages: tied timestamps, exact cursor tails, all six sources, size changes,
cross-employee isolation, restricted moderation, disabled/MFA-less employees,
member/service-role denial, verified identity bridge, statement boundaries, lifecycle
filters, full-body omission, unchanged member announcement eligibility and no domain
or notification mutations. Existing function definitions/owners/grants, table grants
and policies match before/after. Both additive rollback scripts passed. Synthetic
fixture transactions were rolled back and the owned container was removed.

120 timing samples passed with 30,000 work-source rows and 5,000 announcements:
personal p95 2.89–8.39 ms; announcement p95 0.98–2.87 ms. These are synthetic local
measurements, not production latency, concurrent member-traffic or capacity claims.
Evidence: `test-results/employee-history-reads-20261009/verified.json`.

## Portal/runtime integration (local only)

The two reads are now wired behind independent, default-off browser and employee
runtime `historyReadsEnabled` gates, in addition to the database gate. My work uses
Open (default), Completed and All assigned work in one table. Announcements use
Active (default), All, Drafts, Live, Scheduled, Expired, Cancelled and Disabled.
Existing controls/read contracts remain available when the new gate is off.

Both queries include the selected state, page size and cursor in their existing
session-scoped work/announcements keys. Filters and size changes reset cursors;
returning from a record retains the status and starts at page one. Explicit audit
origins take precedence over the shared my-work record route. Payloads contain no
caller-selected assignee. Parsers verify scope, state, ownership, order, cursor
tails and bounded response size before displaying rows. Legacy announcements with
no end date remain valid. Time-based status is server-owned and reconciles on
entry/foreground/reconnect, not by a new poll or a client-assumed publication.

The narrow runtime backport is based on the captured deployed service plus the
approved timestamp fix, not the whole newer candidate. Only the fixed history SQL
bridge/allowlist, runtime gate and new contracts are added. Existing auth/session,
member, provider, health-feed and announcement-command behavior stays unchanged.
`scripts/prepare-employee-history-runtime.mts` has no deploy mode; the final package
is `test-results/employee-history-integration-20261009-v2/`, with off/on inventories
and 88 exact-package regression checks. The original v1 evidence is retained.

`scripts/prepare-admin-history-site.mts` assembles local off/on static packages
from the latest captured autofill release. It preserves the proxy, security
headers, old assets, legacy portal and existing config. Only the on package adds
the new browser flag. Its 23 exact-package browser checks pass, including root
sign-in, existing commands, history paging/navigation, audit return, identifier
hint deduplication, permission revocation, foreground expiry and accessibility.
Evidence: `test-results/admin-history-site-20261009-v2/`. The first package is
superseded by v2 after full regression caught and fixed the audit-return issue.

249 web unit tests pass, with web/runtime/tooling typechecks and scoped lint.
The final full local browser suite passes 149 tests; its two root-package-only
tests are intentionally skipped there and both pass in exact-package acceptance.
Full-suite evidence: `web/test-results/history-final/`. Initial regression evidence
is retained in `web/test-results/history-full/`; its two audit-return failures are
fixed and pass in both final full-suite and exact-package runs.
Final static JavaScript is 507.8 KiB gzip; sign-in is 167.2 KiB (existing 180 KiB
cap). The history feature adds about 1.8 KiB over the prior local consistency
candidate: an explicit 2 KiB deferred allocation raises core/total caps to
296/509 KiB. No dependency, socket, poll or member bundle was added.
The exact-package service and browser tests use offline/mocked transport; they do
not constitute hosted end-to-end acceptance against the new database functions.

## Release procedure and rollback (completed deployment above)

1. Before deployment, recapture current deployed modules and DB contracts;
   compare exact source hashes, relation sizes, query plans, lock/statement budgets and
   existing member contracts. Shared hosting means shared capacity, not zero risk.
2. With separate deployment approval, install reads/bridge disabled first, deploy the
   narrowly scoped employee adapter, enable only for acceptance, and perform authorized
   read-only checks before switching portal controls. Do not publish an announcement,
   change real cases, enable health events or bundle unrelated held migrations.
3. History rollback: revert portal controls/runtime first, disable history_reads_enabled,
   run bridge rollback, then read rollback. Both remove only additive functions/settings;
   assignments, source records, audit history and member behavior remain intact. Sentry
   rollback restores the exact captured employee-service package, after checking for
   intervening changes so it does not overwrite another release.

Reproduction:

```text
node scripts/prepare-employee-health-timestamp.mts  # once into a new evidence directory
node --test scripts/test-employee-health-timestamp.mts scripts/database/guards.test.mts
node scripts/prepare-employee-history-reads.mts --check
node scripts/test-employee-history-reads.mts
node scripts/prepare-employee-history-runtime.mts # once, new immutable evidence directory
node scripts/prepare-admin-history-site.mts prepare # once
node scripts/prepare-admin-history-site.mts test
```
