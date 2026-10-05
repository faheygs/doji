# Community idea retriage release — 2026-09-27

## Status and scope

Released under the owner's explicit separate shared-backend approval. No real
idea status was changed during qualification. No announcement was published.
No new paid service, plan, resource, mobile build or update policy was introduced.
Infrastructure remains shared; this is a narrow verified release, not physical
isolation or a claim of zero risk.

- Database: `20260927050000_community_idea_retriage`, committed 21:18:53 UTC.
- Worker version: `f1f7bb4c-3044-4527-b3ef-f7cf8caef8e2`.
- Worker deployment: `480a2033-8164-4b12-9d5e-936f7fbbefa4`.
- Pages deployment: `749b0f47-b199-4beb-80cd-164f252aa342`.
- Portal bundle: `admin-app-20260927ideas1.js`.
- Exact artifacts, hashes and receipts: `test-results/idea-retriage-release-20260927/`.

The site was assembled from hash-verified live assets plus the editorial module,
three scoped CSS rules and cache-version references. Unrelated local changes did
not enter the release. The compiled Worker differs by one suggestions action
allowlist entry (`pending`); reversing that edit recovers the exact prior hash.
Bindings, secrets, schedules, settings and all other compiled code were preserved.

## Operator behavior

Every row opens the shared accessible detail dialog, with exact prompt/options,
submitter/username, submission/review times, reviewer, linked pool eligibility,
schedule protection and recent audit history. Keyboard title buttons remain.
Accept, Decline/Reverse acceptance and Reopen use a required reason, consequences
confirmation, optimistic version and durable receipt. A stale or ambiguous retry
cannot silently overwrite another review or duplicate effects.

Withdrawal deactivates only the linked challenge's future pool eligibility.
Reacceptance reuses the same challenge/options. Historical events/participation,
original selection time, lifetime approval reward and campaign reward are retained.
Reopening sends an identifier-only private invalidation, not a new push. Existing
once-per-idea/outcome review notification behavior remains unchanged.

The command refuses to withdraw a challenge with any unclosed event, the last
eligible pool entry, a missing challenge or an unverifiable historical link.
Scheduler lock contention fails fast rather than waiting or altering an event.

## Historical records

Six accepted ideas initially had no retained metadata association. Three were
recovered using exact original approval receipts (same actor, suggestion/member,
body, format, options, review timestamp and one actual challenge ID). Only review
metadata was inserted; no idea, pool, reward, notification or event was changed.

Three older accepted records lack those receipts and remain inspectable but
protected from reversal pending a separately verified association:

- `b26a831b-2260-44ad-bc80-203636310f11`
- `032bc58b-bfd1-4561-816b-b7faeb5c1c3f`
- `27e49a20-be4a-4ad0-b9ab-d60dc87e3108`

Matching text alone must not be treated as provenance. The portal explains the
block instead of presenting a command that would leave an orphan active challenge.

## Verification

- 102 complete portal browser tests passed against the exact candidate artifact,
  including light/dark, 390/1440 widths, accessibility, focus, status reversal,
  guarded records, refresh, and idempotent ambiguous-response retry.
- 20 gateway/isolation Jest tests passed; Worker TypeScript check passed.
- Exact compiled Worker harness passed: real employee JWT/AAL2 gate, allowed action
  mapping, invalid actions and announcement rejection of the new suggestion action.
- Offline PostgreSQL tests passed: all status directions, original challenge reuse,
  last-pool guard, scheduled/unclosed versus historical events, safe legacy receipt
  recovery, missing-link refusal, private helper permissions, audit, no duplicate
  15-Sparks award, retained 500-Sparks campaign reward and attribution, no new event,
  private invalidation and existing push deduplication.
- Simultaneous identical retries committed once; conflicting reviewers produced
  one success and a stale-version failure. Held scheduler lock caused fast failure.
- Production rehearsal executed the forward and rollback SQL inside ROLLBACK.
- Live fingerprints verified 328 unrelated existing functions and all preexisting
  grants/owners, RLS, table permissions, triggers and role settings unchanged.
- All 20 public site assets and security headers matched the candidate. Monitoring
  checks showed zero overdue outbox work and zero lock waits. Announcement rows: 0.
- Bounded live member reads passed for profile, realtime authorization, notification
  snapshot, feed (one returned row), and comments (successful query, zero returned
  rows). Cross-member/employee permission denials and employee session/queue passed.
  Zero comments are not evidence of content rendering on a handset.
- Owner confirmed after release: still signed in; profile, feed and comments work.
- Read-only signed-in browser check restored the employee session and loaded all
  eight records. A receipt-linked accepted idea showed its exact options, member
  identity, review time, eligibility, Reverse acceptance and Reopen controls. An
  older unlinked record showed the manual-investigation explanation and no decision
  controls. Both dialogs closed correctly; no decision was submitted. Computer-use
  verification was limited to inspection and navigation.
- Offline container and VM stopped after tests; test fixture volumes preserved.

## Rollback

Do not blindly restore the old pending-only command after a record has reopened:
that implementation could create a second challenge on reacceptance. The tested
rollback pauses suggestion decisions while retaining links, history, rewards,
constraint and index. The announcement branch remains available unchanged.

Use the definition-hash-guarded `rollback.sql` in the release artifact directory
only with explicit incident authorization and a safe release window. Then restore
the saved exact prior Worker/site artifacts if needed. Verify source hashes,
settings/schedules, authorization and member reads again. Do not delete history,
receipt, campaign attribution or reward rows to simulate rollback.

## Implementation references

Locking uses documented transaction/row lock behavior and nonblocking acquisition:
[PostgreSQL 17 explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html).
Security-definer helper exposure is restricted and existing function grants are
retained, following [PostgreSQL function security guidance](https://www.postgresql.org/docs/17/sql-createfunction.html).
The review-trigger effects remain within the same atomic transaction; no client
multiwrite replacement was introduced.
