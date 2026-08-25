# Production readiness audit

Last reviewed: 2026-08-24

This document is a release gate, not a claim that defects are impossible. Static review
can establish bounded contracts and remove known failure modes. It cannot prove device,
provider, regional, or 100k-user behavior without deploying the exact release candidate
and observing it under representative traffic.

## Hardened contracts

- Postgres remains authoritative; all user writes use atomic, idempotent RPC commands.
- The production command gateway is allowlisted, body-bounded, preserves the caller's
  Supabase identity, wakes the durable relay after commit, and fails closed if missing.
- Publicly addressable Edge Functions authenticate before parsing and use a shared,
  bounded JSON reader for every endpoint that accepts a request body.
- Realtime messages carry identifiers only. Ably authorization is scoped, serialized,
  bounded by timeouts, and reconciled on reconnect/foreground through authorized reads.
- Interactive reactions, comments, votes, blocks, friend actions, shop commands, buy-in,
  moderation, legal acceptance, and challenge completion optimistically update or retain
  usable cached state and then reconcile to Postgres.
- Push fanout and grouped social alerts are durable and idempotent. Native APNs/FCM is
  preferred; the Expo token is a migration fallback. Retryable provider failures are
  returned to the durable transport rather than silently acknowledged. Provider expiry
  is anchored to the original action, so a delayed relay cannot extend an old alert.
- Challenge pre-live, activation, close, fanout, retention, and alarm repair are durable
  one-shot workflows. Handset time, polling, and push delivery never authorize access.
- Feed, leaderboard, poll, comment, notification, profile, badge, shop, friend, and admin
  reads are bounded and indexed. Global leaderboard queries fetch a bounded top set plus
  the viewer's exact row; Friends always includes the viewer.
- Post media is server-reserved and ownership-bound. The private bucket uses authorized,
  short-lived signed URLs and durable orphan/deletion cleanup.
- Public profiles use explicit safe fields. Banned users fail server-side write guards.
  Blocks hide social content without altering public leaderboard membership or creating
  moderation work.
- Suggestion UGC is server-bounded, filtered, canonicalized, and deduplicated. Reports
  bind to the authoritative content owner rather than trusting client ownership fields.
- Modal/sheet presence unmounts after dismissal, removes pointer interception at close,
  and shares one keyboard-toolbar ownership model. Common controls expose accessibility
  roles, labels, state, and minimum touch targets.
- Persisted query data is user-scoped, versioned, size-bounded, and excludes legal,
  moderation, ephemeral, and signed-media data.

## Required coordinated release order

1. Build and make available the mobile release containing signed-media reads and the
   backwards-compatible current RPC contracts.
2. Deploy the matching Edge Functions and Cloudflare orchestrator configuration.
3. Once supported clients are available, deploy the reviewed Supabase migrations through
   `20260825008500`, including the private `post-media` bucket change. Existing builds
   that expect public media URLs are not compatible with that storage change.
4. Validate the exact build on supported physical iPhone and iPad devices, then observe
   activation, participation, push, realtime, and alarm health during a live Doji.

## Release blockers not provable by source review

- The 2026-08-25 production deployment is recorded below, but deployment alone does not
  prove provider delivery, physical-device behavior, or capacity under representative
  traffic. Those runtime gates must still be observed independently.
- The exact release candidate has not been physically exercised by this audit. The user
  explicitly deferred runtime tests, so no runtime-pass claim is made here.
- A 100k launch is not yet capacity-proven. The client has a fail-closed scale-read
  boundary for hot post-engagement and poll-summary reads, but this repository does not
  contain a deployed authenticated aggregate cache or a complete feed/profile read tier.
  Direct Postgres reads are appropriate only for the bounded initial launch until measured
  production headroom says otherwise.
- Direct Android push requires production FCM credentials and device validation before an
  Android release. iOS APNs configuration does not establish Android readiness.
- Text UGC has a server filter and all UGC has report/block/admin workflows. Automated
  image/video classification is not implemented; operating the required human moderation
  SLA remains an organizational responsibility.

## Accepted residual engineering debt

- `command_receipts` is keyed by user and idempotency key. Current clients generate
  action-prefixed, high-entropy keys, making accidental cross-command collision negligible,
  but a future schema revision should make command scope explicit in the primary key.
- Some legacy feature files remain larger than the preferred module size and are frozen by
  the source-size gate. New work must use extracted hooks/components rather than growing
  those files; decomposition should happen in behavior-preserving increments.
- Free service tiers are a launch configuration, not a 100k capacity guarantee. Upgrade
  thresholds must be driven by queue/outbox age, provider latency, database saturation,
  Ably rates, error budget, and observed headroom—not only registered-user count.

## Go/no-go evidence for public release

- Static type, lint, source-size, dependency, and infrastructure type gates pass.
- Migration order and exact deployed versions are recorded.
- No tracked production secrets, signing keys, or service credentials exist in Git.
- App Review account can accept legal terms, report content, block a user, and immediately
  see blocked content disappear; the moderation operator can act inside 24 hours.
- One physical-device run captures cold start, background/foreground, reconnect, duplicate
  tap/retry, offline recovery, comment/reaction propagation, notification expiry, purchase,
  buy-in, block/report, ban, delete-account, keyboard, modal dismissal, and accessibility.
- Operational health remains within the documented p95/p99 targets during a real event,
  with no overdue outbox rows, exhausted push shards, stale alarms, or credential failures.

## Static verification snapshot

The 2026-08-24 audit completed these non-runtime gates successfully:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run check:size`
- `infra/doji-orchestrator: npm run typecheck`
- `npx expo-doctor` (21/21 checks)
- `npm audit --omit=dev --audit-level=moderate` (0 vulnerabilities)
- `git diff --check`

No Jest, device, provider, or load tests are represented by this snapshot. Passing static
gates does not override the release blockers above.

## 2026-08-25 production deployment record

- Git `main`: release implementation `1b819c6`, iOS build-number commit `c0fc433`,
  corrected buy-in migration `7bc7c73`, and post-deploy database repair `947acca`.
- EAS iOS Build 65: `58afaa8e-3b31-4290-ac34-986bc05601a2`, finished.
- App Store Connect/TestFlight submission:
  `13716f0d-08f4-4b19-9d00-ed4606890002`, finished. This does not submit the build for
  public App Review.
- Cloudflare Worker `doji-orchestrator`: version
  `aae8fc41-3074-42bf-a589-db07c5ff55e8`, with all four Durable Object bindings and the
  one-minute trigger. The retired Queues have zero producers and zero consumers.
- Supabase Edge Functions: all repository functions deployed active.
- Supabase database: migrations applied through
  `20260825009000_fix_post_deploy_lint.sql`; linked database lint returned no schema
  errors. Four `warning extra` findings remain for backward-compatible parameters that
  are intentionally ignored so timestamps and integrity state stay server-owned.

TestFlight physical-device validation and representative load/capacity validation remain
explicit go/no-go gates. This deployment record is not a claim that either has passed.
