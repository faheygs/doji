# Community poll reserved Other safeguard

## Scope and status

Owner approved the separately scoped shared approval fix on October 5, conditional
on regression checks and preserving existing behavior. Verified live at
**2026-10-05 21:06:40 UTC**. No real review command or synthetic member action was
executed in production. The two pending suggestions were hash-verified unchanged.

Only `public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)` changed.
First approval of a general poll now filters exact case-insensitive `Other` after
the same whitespace trimming used by JavaScript. It preserves the remaining choice
order and contiguous positions, requires two real choices, then appends the existing
single automatic `Other` (`is_other=true`, position 99). Phrases such as “Other ideas”
are not filtered. Would-you-rather behavior is unchanged.

The original suggestion is retained, including its submitted options. Reacceptance
reuses existing challenge/options; this is not a historical poll rewrite. Grants,
RLS, other function definitions, triggers, rewards, scheduling, member authentication,
portal identity/session behavior and voting semantics were not changed.

## Mobile implementation versus deployment

The local Suggest a Doji form removes reserved rows on blur and filters them from
the payload even without blur. It keeps two input rows and requires two real choices.
This mobile change has **not** been built or shipped. The live approval safeguard
protects queued ideas and future submissions from already-installed clients.
The admin view continues to display the original submission as audit evidence.

## Validation

- 27 focused mobile form execution tests passed.
- A new isolated database replay passed all 289 migrations.
- All 32 integration entries passed, including 14 extended suites and 274 pgTAP
  assertions; all five concurrency scenarios passed. These counts overlap by suite.
- Added approval tests cover submitted Other, case/space/tab/newline/NBSP/BOM,
  multiple reserved entries, preserved phrases, WYR, no-Other input, contiguous
  ordering, original submission retention, idempotent replay, and atomic rejection
  when fewer than two real choices remain.
- The same new cases pass through the independent WorkOS employee bridge. Existing
  missing-MFA, wrong-role, revoked-session, anonymous/member denial, re-review,
  reward-once, past-event preservation and member-report tests also pass.
- Mobile and tooling TypeScript, focused ESLint, source-size and diff checks passed.
- First bridge run correctly denied a moderator fixture; the fixture was restored
  to its intended super-admin role, then the whole clean-room suite was rerun green.

## Deployment evidence and rollback

Source: `supabase/migrations/20261005020000_poll_reserved_other.sql`.
Guarded operator: `scripts/release-poll-reserved-other.mts`.
Bounded local evidence: `test-results/poll-reserved-other-v2/` (ignored artifacts).

- Before function SHA-256:
  `753a811245933f744056d4ad68ec521b5f1fb5cc3c037a929f2ab5ddcc722d81`.
- Installed function SHA-256:
  `6bcc41d9386b66b23c617efc65d80d6266e80b1ac54fe5be7010264547e6a24c`.
- Install artifact SHA-256:
  `bf3e56dae46931fd69c425036d1b71c0ba21457404cdd0383cb6786b06e5fff5`.

Before applying, the patch and exact original definition were exercised in a live
transaction that rolled back, with no review/data commands. Deployment used an
event-window exclusion, short lock/statement timeouts, a release advisory lock,
exact preimage checks, and before/after schema-contract fingerprints. Fresh readback
matched the exact rehearsed function hash. Both queued records were unchanged.

`rollback-verified.sql` restores the exact prior definition only if the installed
function hash and surrounding schema fingerprint still match, outside the event
window. Inspect it before deliberate use; no automatic retry or rollback is run.
Rollback changes approval code, not decisions made after deployment. Reverting
would reintroduce duplicate-Other risk for subsequent approvals.

This was a targeted SQL release, not a broad `db push`; migration-history metadata
was not rewritten. Before future migration reconciliation, verify the exact live
function and account for this already-applied migration rather than blindly replaying
its fail-closed patch. No commit, push, portal deployment or mobile build was made.
