# Sparks reward balance

## Status and ownership

Economy v2 defaults off in source and is enabled in Staging only, prospectively
from November 11, 2026 at 19:21:01 UTC. Older occurrences retain their previous
rules; existing balances and completed history were not rewritten. Production
rewards, shop prices, buy-in cost, XP, streaks and participation deadlines remain
unchanged. `constants/sparks.ts` still describes the production economy; the server
owns enabled Staging awards. See the [Staging release record](releases/README.md#november-11-staging-sparks-and-mobile-polish)
for qualification, rollback and outstanding device acceptance.

`supabase/overlays/sparks_economy_v2.sql` and `.bindings.sql` compose one atomic
installation. The retaining `.rollback.sql` restores captured reward functions.
`scripts/database/sparks-economy.mts`, its race fixtures and deterministic model
own offline qualification. No provider, native build, polling or handset reward
calculation is added. The existing ledger/profile hints reconcile balances.

## Candidate rules

| Source | Reward and fence |
| --- | --- |
| Completion within 60 seconds of activation | 20 Sparks |
| Completion after 60 through 180 seconds | 17 Sparks |
| Completion after 180 through 360 seconds | 13 Sparks |
| Completion after 360 seconds, while server-authorized | 10 Sparks |
| Paid buy-in completion | 5 Sparks, no speed or first-place bonus |
| First overall within the normal ten-minute interval | Additional 5 Sparks, canonical global winner only |
| First comment on another member's post | 3 Sparks, once per member/post |
| First reaction on another member's post | 2 Sparks, once per member/post |
| Combined comment/reaction earnings | At most 5 Sparks per member/Doji |
| Newly reached level | 10 × level; pay every crossed level once |
| Sending/accepting friend requests | No direct payout; existing milestone badges remain |
| Welcome, badge tiers, approved suggestions and campaigns | Existing rules unchanged |

The completion award **replaces**, rather than stacks with, the existing XP-derived
completion and separate post/poll awards for eligible new occurrences. Photo, task,
format, poll and WYR share the same time bands. Completion timing is observed by
Postgres after durable answer insertion, relative to the later of scheduled and
actual activation. Upload time counts; no phone clock, app-open or push receipt can
establish eligibility. Native/time-distribution testing must qualify fairness across
types before activation. This does not alter participation authorization.

Signup-day grace keeps its existing deadline. Completing after the ten-minute
interval earns the base 10, never a speed bonus; it is not treated as paid buy-in.
The first-overall badge remains a separate lifetime award. Personalized Friends
or visibility fallback winners never generate another monetary bonus.

Social rewards require completed participation in that occurrence, exclude own
posts, and keep their full 3/2 amounts. If the remaining allowance cannot fit a
whole reward, that action earns nothing: two distinct reactions can total 4, with
no misleading 1-Spark partial comment award. Interaction itself remains unlimited.
Caps do not reset with timezone changes, a new session, reaction toggles or content
deletion. Demo/banned members cannot earn candidate completion/social/level rewards.

## Atomicity and rollout

All new receipts, caps, levels and ledger entries commit or roll back together.
Unique opaque subject receipts fence duplicate awards; per-member row locking
serializes social caps without a global daily counter. First-place arbitration
reuses the qualified canonical first-Doji ledger. Level high-water marks prevent
re-earning after XP correction, and multi-level jumps use a bounded arithmetic sum.
A gated derived-level trigger catches XP-driven changes missed by the legacy
`UPDATE OF level` trigger; both paths share the same duplicate fence.

Installation leaves the gate disabled. Activation is separately approved and
requires exact-head checks, fresh function/trigger/ACL fingerprints, capacity and
rollback evidence, plus an enabled/qualified first-Doji dependency. Set the start
time prospectively; never backdate. Existing occurrences keep their prior reward
rules. Level/social relationship policy activates prospectively; no existing level,
balance, badge, purchase or completion is re-awarded or clawed back.

Rollback refuses intervening function changes, restores the captured functions
and removes the two new reward triggers. It retains balances, ledger, receipts,
caps and level high-water marks. Content retention never resets new fences;
account deletion removes that account's private economy records. Do not replay the
installer over retained state or broaden rollback into data deletion.

## Balance qualification

The SQL model compares 7/30/90-day, fast/ordinary and 25/100-XP scenarios using the
actual level thresholds. It includes the unchanged 200 welcome Sparks and maximum
social earnings, but excludes spending, badges, campaigns, suggestions and first
bonuses. It is a controlled scenario, not measured member behavior or proof of
long-term balance. First-place upper bound adds 5 per eligible occurrence.

Before pricing or production approval, use bounded aggregate ledger evidence to
compare recurring earnings, milestone/campaign spikes, spending and balances by
cohort. Check actual time-to-purchase, repeatable spending opportunities, completion
time by challenge type and server work under concurrency. Do not expose member-level
financial histories or change prices merely to absorb a hypothetical surplus.

Acceptance requires disabled-path compatibility, all timing boundaries, every
challenge kind, signup-day/paid distinctions, duplicate/rollback behavior, concurrent
first claims/social caps, level jumps/corrections, authorization, retaining rollback
and natural Staging device reward feedback. Exact-head CI and hosted acceptance
remain independent gates; emulator or synthetic tests do not establish production
latency, capacity, economic equilibrium or member retention.
