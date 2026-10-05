# Announcement campaigns: design and isolation gate

Status: backend and portal are LIVE under the separately approved release in
`ANNOUNCEMENT_CAMPAIGN_RELEASE_2026-09-27.md`. No production announcement was
created or published. Preparation notes below record the implementation gates;
device acceptance and actual campaign publication remain gated.

Earlier portal UI verification: all 91 mocked browser tests passed, including
14 editorial cases. Current campaign additions bring the suite to 94 tests,
including 17 editorial cases; see qualification below. JavaScript syntax and touched tracked
file whitespace checks passed. Inspected desktop/light and mobile/dark screenshots.
The checks include real pointer selection, keyboard selection/Escape, focus return,
help/field alignment, role gates and lock/late-response isolation. No production
request or deployment was part of this verification. Physical-device announcement
and reward behavior is not verified by this browser suite.

## Owner requirements

- Reuse existing portal modal, field, dropdown, contextual-help and Close controls
  for announcement creation/edit/confirmation and community review.
- Destinations: Suggest a Doji and the in-app Sparks shop.
- A member can dismiss without selecting the CTA.
- At most one published announcement is valid at a time.
- Each announcement has a dynamic reward choice: **No reward** or **Sparks on
  completion**, not a hardcoded 500-Sparks campaign.
- Confirmed: a submission promotion pays on a valid new idea submission, once per
  member per campaign. It does not wait for administrator approval.
- Keep everything unpublished until the owner explicitly authorizes publication.

## Implemented editor (local, feature-gated)

Keep title, message, dates and optional CTA. Destination uses the existing picker.
Reward defaults to No reward. Selecting Sparks on completion reveals a qualifying
action picker and a server-validated integer amount of 1–10,000 Sparks. The first
supported action is Submit a valid new Doji idea. There is no preset amount.
No reward sends an explicit null action and zero amount, clearing stale selections.
Amount is configured per draft, not a global economy
constant. Publication confirmation and preview must state the amount, condition,
window and once-per-member limit from structured configuration, not infer them
from prose. Published terms are immutable; cancellation must not claw back awards.

The shop can be a no-reward destination immediately after its allowlist is updated.
A shop-completion reward must name a qualifying purchase rule; merely opening the
shop is not completion. Do not invent a purchase incentive without that product
decision. Allowlisted completion handlers are extensible; staff cannot upload
arbitrary conditions/code or directly grant balances through announcement fields.

Approved eligibility: any otherwise-authorized member completing the qualifying
action within the active campaign window, without requiring a CTA click or phone
push. Seeing, dismissing or tapping the popup neither earns a reward nor prevents
a later qualifying submission. Previously submitted or duplicate ideas do not count.

## Production baseline versus local changes

- `components/system/AppAnnouncementPrompt.tsx` already uses shared AppDialog,
  dismissible backdrop/back handling, and a separate Not now button. Its action
  currently awaits the receipt RPC before removing the popup; failure handling
  and native navigation dismissal need isolated member-client tests before any
  claim of reliable offline dismissal. No mobile edit is included in the UI batch.
- `app/(app)/profile/shop.tsx` is the shop route. The live staff command only
  permits Feed, Profile and Suggest a Doji. A frontend-only shop option would fail
  to save and must not be presented as connected.
- The live `claim_active_app_announcement` picks one eligible row by priority; it does NOT
  prevent multiple published announcements having overlapping windows.
- `submit_challenge_suggestion` validates, filters, hashes and deduplicates UGC,
  inserts a suggestion and stores its command receipt atomically. Rejected or
  duplicate ideas must never earn the promotional bonus.
- Existing `trg_sparks_suggestion_approved` grants 15 Sparks on approval through
  `award_sparks_once`. Preserve that independent rule. 500 on submission is new.

## Implemented backend scope (deployment still gated)

1. Add private structured campaign reward configuration and durable per-member
   campaign completion attribution. Preserve existing member RPC signatures and
   employee permission/AAL2 gates. Draft saves remain disabled announcements.
2. Enforce non-overlap in Postgres, not just a browser warning. Implemented a partial
   GiST exclusion over enabled `[starts_at, ends_at)` windows, including existing
   rows and all write paths. Adjacent future windows can coexist; overlapping
   publication fails with a useful error and never silently cancels another row.
   Member claim reads must not acquire a shared campaign-row lock.
3. Integrate a narrow server-owned completion handler into the existing atomic
   suggestion transaction. Bind the campaign/amount from server configuration;
   the member cannot supply eligibility, an arbitrary amount or reward reference.
   A unique member+campaign receipt and existing Sparks ledger prevent duplicates,
   including concurrent submissions with different command keys. Preserve existing
   profile/badge events and foreground/reconnect reconciliation. No new polling,
   push producer or scheduling service.
4. Update employee editorial validation/read projections, audit metadata and form
   controls together. Keep the existing gateway route if compatible; any necessary
   Worker release is separately reviewed, never rebuilt from the whole dirty tree.
5. Only if needed, queue member dismissal/completion feedback fixes for a separate
   mobile build. Never bundle mobile release/update policy into portal deployment.

### Impact and verification before release approval

This intentionally adds reward work to member submission transactions and changes
announcement publication constraints in the shared database. It is not physical
isolation or zero risk. Bound the campaign lookup, preserve session/RLS/member read
contracts, compare existing function/grant/policy/trigger fingerprints, and measure
query/lock behavior with no campaign, a no-reward campaign and an active reward.

Tests must include invalid/duplicate ideas, identical and different-key retries,
concurrent qualifying submissions, separate accounts, exact time boundaries,
cancel/submit races, failed transactions, changed terms, member/employee access
denials, concurrent overlapping publication and adjacent windows. Validate that
existing 15-Sparks approval grants remain single-award and unchanged. Browser tests
cover both reward choices and confirmation payloads; handset tests cover Not now,
CTA routing, receipt failure, account changes and completion feedback.

Deployment requires another explicit approval after local results: bounded DB
preflight/rehearsal and migration first, then compatible admin UI, with every
announcement still unpublished. Mobile changes get a separate build approval.
Rollback disables future campaign publication/awards via an approved narrow path,
restores prior handlers/UI and retains receipts, history and earned Sparks. Never
drop completion/ledger rows or reverse member balances as a generic rollback.
No new service, paid plan, recurring polling or live campaign test is authorized.

## Implementation and qualification record

- Forward SQL: `docs/drafts/announcement_campaigns_v1.sql`. It is deliberately
  outside the migrations queue. Rollback: adjacent `.rollback.sql` file.
- Portal controls opt in only with `DOJI_ADMIN_CAMPAIGNS_ENABLED=true`; default
  builds retain the prior compatible controls. This switch does not publish data.
- Only three existing function bodies change: employee editorial command,
  member suggestion submission (one helper call after successful validation and
  deduplication), and member announcement claim. Signatures/grants stay unchanged.
- The completion table is private even from member, employee and service roles.
  Its `(announcement_id,user_id)` primary key serializes competing awards before
  calling existing `award_sparks_once`. Idea, completion, balance and receipt commit
  atomically. Deleting an idea does not reset entitlement; member deletion cascades
  private completion attribution. Existing 15-Sparks approval remains independent.
- Claim returns canonical reward terms through the existing body field, including
  amount, UTC deadline, qualifying action and once-per-member limit. Already-earned
  campaigns stop prompting. No member client or Worker edit is in this batch.
- Eligibility uses a captured timestamp and one MVCC campaign read, without a global
  or campaign-row lock. Cancellation blocks later eligibility decisions; an already
  accepted transaction can finish afterward and keeps its earned Sparks.
- Offline PostgreSQL 17.6 tests pass: baseline editorial/member contracts, reward
  validation, no-pay invalid/duplicate/draft/future/cancelled/no-reward paths,
  CTA/dismissal independence, grants/RLS, profile invalidation and approval bonus.
  Existing function grants, table permissions and policies compare unchanged;
  only the three planned existing function bodies differ.
- Final local UI verification: **94/94** mocked browser tests passed, including
  **17** editorial cases; **22/22** Jest announcement/editorial/isolation tests
  passed. Inspected the narrow dark reward form and desktop light shared form.
  Touched JavaScript syntax and tracked-file whitespace checks passed. These tests
  do not authenticate to production or submit live administrative commands.
- Independent-connection tests pass for same/different command keys, separate
  members, atomic rollback, adjacent and conflicting windows, concurrent publish,
  cancellation race and rollback preservation. A committed test database confirms
  the partial GiST range-index path. Synthetic timing is not production-load proof.
  The expression index was not planner-usable inside the rollback-only fixture's
  creating transaction after HOT updates; the committed-clone check covers that
  separately rather than weakening the assertion.
- Rollback disables reward campaigns and adds a pause constraint preventing legacy
  tools from republishing their reward promises. It restores prior handlers without
  deleting receipts or reversing balances. A subsequent forward recovery must
  explicitly remove the pause constraint after restoring completion handling.

### Release checklist (not executed)

1. Read-only live preflight: exact PostgreSQL/schema/function/grant fingerprints,
   table sizes, existing enabled-window conflicts, current announcement state and
   active locks. Verify deployed code matches the local baseline; stop on drift.
2. Review bounded DDL/ledger-check scan impact against real sizes. The draft has
   2-second lock and 8-second statement timeouts; a timeout aborts, not a reason to
   retry indefinitely or raise limits without review. Rehearse the exact migration
   and rollback. No broad dirty-tree migration or Worker deployment.
3. Obtain explicit shared-backend deployment approval; deploy the narrow migration
   first, verify member read/auth/realtime contracts, then separately deploy the
   compatible portal artifact with campaign controls enabled. Publish nothing.
4. Qualify native popup scrolling, Not now/back/backdrop, receipt failure, CTA routes,
   account changes and reward feedback using an isolated test environment. Existing
   receipt-before-dismiss behavior still needs client qualification/fix; browser SQL
   tests do not prove offline native dismissal. A mobile change needs separate scope.
5. Owner separately approves actual campaign terms and publication. No campaign is
   activated merely by saving a draft or deploying these capabilities.

## Primary references

- [WAI combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):
  named controls, keyboard exploration, selection and Escape semantics.
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/):
  modal focus and explicit dismissal.
- [PostgreSQL 17 range constraints](https://www.postgresql.org/docs/17/rangetypes.html#RANGETYPES-CONSTRAINT):
  exclusion constraints prevent overlapping ranges; tested locally on PostgreSQL
  17.6, with live version/schema verification still required before release.
- [PostgreSQL 17 locking](https://www.postgresql.org/docs/17/explicit-locking.html):
  DDL lock impact and avoiding a campaign-row lock on each member submission.
