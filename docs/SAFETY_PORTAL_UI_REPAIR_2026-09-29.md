# Safety intake drawer UI repair — September 29, 2026

Scope: isolated admin static assets only. No member app, public intake, Worker,
database/RLS/RPC, media processor, email, auth settings or release-policy deployment.

The release replaces public-site `supportCard` markup in the external-intake drawer
with the portal's existing history timeline and detail section. History labels are
human-readable; rationale and requester responses remain distinct and escaped.
Theme tokens supply contrast in both themes; the review action is right-aligned.

Reconciliation no longer unconditionally declares an open case possibly outdated.
It reuses the existing bounded authorized queue response and compares its revision
with the rendered case. A case absent from that page uses one exact authorized
existing case read (30 history entries maximum). This is staff-only, coalesced
with a trailing refresh, session/drawer-generation guarded, and never polled.
There is no new member read or backend contract. Exact case reads retain their
existing staff access audit. Failure is visibly unverified, never called current.

A proven newer revision preserves drafts and focus, warns without auto-overwriting,
and prevents stale workflow confirmation. Server optimistic revisions/idempotency
remain authoritative. Own completed writes reload before comparison and do not
produce a false warning. Lock/close discard late responses. The confirmation view
also shows freshness status and retains it when returning to the draft.

Artifact: `test-results/safety-portal-ui-20260929-v3/`. It is assembled from the
previous exact live artifact, retaining all old assets and setup/configuration.
Only a new safety-patched bundle, admin CSS and two HTML entrypoints differ.
All unrelated bytes in the app bundle are retained. Baseline/rollback Pages ID:
`56346977-c2c5-4053-924a-4332c1a402c3`. Publication is guarded against a concurrent
release and requires a passing exact-artifact browser result.

Tests cover desktop/mobile light/dark accessibility, readable history and right CTA,
same/new revision, own-save reconciliation, draft/focus preservation, unverified
refresh, late response after close, and updates during confirmation. The full portal
suite also covers employee auth, announcements, community ideas and moderation.

Release status: LIVE. Pages deployment `7026a54c-fa7d-4c5d-b0f1-44b9e5f05e86`.
The exact artifact passed **144 browser tests** (11 public-only tests skipped) and
the separate live-client/auth tests. All four changed production assets were read
back and hash-verified; domains are unchanged. The prior deployment is retained
for rollback. No real case decision was submitted during this repair.

Authenticated live browser readback also passed after reload: the existing work
session restored, synthetic case `218161a8-a68a-4542-a471-7d2662cbe7c4` opened from
Closed, dark history rendered as the shared timeline with readable labels, review
action was right-aligned, and no unconditional stale warning appeared. Its closed
state and requester response were unchanged. Local theme screenshot evidence is
`test-results/safety-history-{light,dark}-{390,1440}.png` (synthetic fixtures).
