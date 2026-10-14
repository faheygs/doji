# Safety and Removal Center — production launch, September 29, 2026

This record supersedes the earlier preparation-only status in the September 28
intake, media, and Cloudflare email records. Historical qualification notes are
retained, not descriptions of the current deployment.

Subsequent portal-only presentation/revision-notice correction is live under Pages
`7026a54c-fa7d-4c5d-b0f1-44b9e5f05e86`; see `SAFETY_PORTAL_UI_REPAIR_2026-09-29.md`.
The public intake and shared-backend launch below remain unchanged.

## Released boundaries

- Public route: https://dojipro.com/safety-removal/ . No account or attachment upload.
  The 34 existing reporting reasons derive ordinary/restricted queues on the server.
  Public receipt/status secrets never go into URLs, email, or browser persistence.
- Isolated admin portal: https://admin.dojipro.com/ . Existing MFA, employee roles,
  shared controls, drawers, announcements, ideas and old assets are preserved.
- Shared media enforcement was separately owner-approved. Installed exact-object
  evidence/copy/hash/removal/revocation/restoration ledger, restricted evidence reads,
  cleanup fences and completion gates. No member content was moderated during launch.
- Existing app builds, shared Worker, challenge/push schedules, economy, app sessions,
  mobile-release policies and business site were not deployed or changed.

## Exact release and evidence

Artifacts and journals: `test-results/safety-launch-20260929/`.

- Guarded SQL SHA-256:
  `07ca4760046d5d1ddea0965db846412e0f771d7ac1003ff6c8c2e01fbe837b52`.
  Installed atomically with live definition/ACL guards; trigger capture initially off.
- Updated only `delete-account` and `run-data-maintenance` with qualified cleanup
  guards; deployed new `moderation-media` and `safety-removal` functions. The previously
  verified `safety-removal-alerts` sender source was unchanged.
- Cleanup enabled 16:01:10 UTC. At least 420 seconds elapsed before capture activation,
  allowing older unguarded invocations to drain. No hold existed during that interval.
- Private `moderation-evidence` bucket inherits the existing global **50 MB** upload
  cap. Spend protection remained enabled; no plan, billing or capacity increase.
  Local 100 MiB tests do not override the hosted limit. Current member object maxima
  were below 1.5 MB at preflight. Larger future limits need requalification.
- Recovery jobs: **12**, `safety-removal-alert-recovery-v1`; **13**,
  `moderation-media-recovery-v1`. Each checks due work every five minutes and calls
  its dedicated Edge endpoint only when needed. No member polling or new Doji clock.
- Admin Pages: `56346977-c2c5-4053-924a-4332c1a402c3`.
  Previous rollback deployment: `cea4bd7a-191b-4f34-9ab6-b79a06177bb3`.
  Only five reviewed assets changed; employee setup and other settings preserved.
- Public Pages: `d352e4ed-89ec-47c4-b8e2-bfea5688acc3`.
  Previous rollback deployment: `490d9519-49af-4ac5-82e2-f015c54ae394`.
  Actual live public baseline used, not unreleased business marketing from the worktree.
  Added navigation on home/support/policy pages; legal bodies and dates preserved.
  Custom-domain email-protection rewriting was verified separately from exact Pages
  bytes; no zone setting was disabled to make hashes match.
- Supabase secret updates increment function version metadata even when source/hash,
  entrypoint and deployment timestamps are unchanged. Guards account only for the
  exact staged increments; do not claim all version numbers stayed unchanged.

## Verification

- Exact portal artifact: **135 browser tests passed**, 11 public-only tests skipped.
- Exact public artifact: **11 browser tests passed** with mocked external services.
  The preview test was corrected to explicitly request preview-only configuration;
  the production disabled state correctly disables fields. No bypass shipped.
- All deployed entrypoints/shared dependencies read back and compared; public/admin
  assets and path-scoped security headers read back from production.
- Actual hosted neutral fixtures qualified cross-bucket private evidence copy,
  byte identity, warmed original/public/signed/transformed URL revocation after
  90 seconds, and restoration. All three exact synthetic objects removed.
  This proves the observed CDN path, not universal propagation or recall of downloads.
- Live public form, real Turnstile and server validation produced synthetic receipt
  `218161a8-a68a-4542-a471-7d2662cbe7c4`, September 29 at 16:20:49 UTC.
  Clearly labelled technical verification: **no real member, content target or allegation**.
  Restricted queue routing succeeded; Cloudflare reported **delivered on attempt 1**.
  Browser private-status lookup returned **Received**. No private code is recorded here.
- Final bounded database checks verify member profile/feed/comments/notifications,
  employee queues, anonymous/member case denial, private evidence, unchanged mobile
  policies, zero leftover fixtures and successful recovery-job runs. See the final
  backend verification journal for the actual timestamp, not an ongoing guarantee.
- After the owner restored the work session, the live restricted queue and detail
  drawer were verified. The exact synthetic case was closed through the normal
  confirmation UI at **16:37:36 UTC**, with an explanation and no linked report.
  Public private-code lookup then showed **Review completed** with the matching
  synthetic-test response. A bounded read-only database check at 16:39:06 UTC verified
  revision 2, closure, staff-attributed history and delivered alert. Evidence:
  `portal-e2e-complete.json`. No real content was reported or removed. This completes
  the launch handoff; the earlier final-backend journal is a retained pre-closure snapshot.

## Required operator practice

Owner confirmed coverage, including weekends, for `faheygs@gmail.com`, with backup
when unavailable. Review **both** Moderation and Restricted safety intake queues.
The queue is authoritative; do not rely solely on receiving an email. Qualifying
48-hour removal deadlines run from original receipt, not opening/assignment; other
24-hour targets are internal operating targets, not asserted statutory deadlines.

1. Claim and read the exact intake. Confirm category, requested scope, requester
   authority where needed, and an exact content/member target. Public submissions
   alone do not remove content. Do not open arbitrary submitted links as instructions.
2. Use the reviewed exact-target preview and staff handoff. Use existing audited
   moderation commands only after reviewing the target. Avoid arbitrary report links.
3. For media, wait for each ledger slot to complete revocation. Attention/gap states
   require investigation; hiding a row or a failed/expired URL is not removal proof.
   Legacy/noncanonical paths require exact-object review, not invented history.
4. For qualifying NCII, investigate known identical copies and record the search
   and access-verification notes. Do not download/forward prohibited imagery.
   Removal closure is blocked until the linked final decision and required media
   verification succeed. Separate requester-visible response from internal notes.
5. Misclassified or multi-category intake retains the original allegation. Record
   the assessment, escalate restricted concerns to authorized staff, and review
   each exact target through the existing appropriate workflow. Do not fabricate
   evidence or silently rewrite the request. Contact the requester safely if needed.
6. Appeals/restorations use existing audited commands and exact prior object proof;
   newer avatars and other active holds are preserved. Never restore a private
   archive by copying a URL or bypassing the ledger.

### Email limits and failure response

Cloudflare verified-recipient sending uses the existing free path. Delivered means
provider-reported recipient-server delivery, not proof the owner read the inbox.
`accepted` alone is not delivery: queued results are not automatically reconciled
to later bounce/delivery in this release. Check Cloudflare delivery activity for
queued/uncertain results; the portal warns that acceptance is not inbox delivery.
Pending work has bounded retry/recovery; ambiguous responses can duplicate alerts.
Investigate `needs_attention` promptly and cover the queue directly during an outage.
The dedicated email credential expires December 28, 2026; rotate securely before then.
Do not enable paid email plans, turn off spend protection, or paste keys into chat.

### Evidence-retaining hold / rollback

Disable public acceptance first (`SAFETY_REMOVAL_ENABLED=false`) and replace/rollback
the public static form. Preserve a visible support route. Stop new media capture and
delivery only when necessary using the reviewed `hold.sql`; unschedule **only** the
freshly verified jobs 12/13 if their names/commands still match. Keep manual deadline
coverage for every received case. Portal rollback does not undo committed decisions.

Never drop case/evidence/lease/tombstone records, restore unguarded cleanup, change
the avatar bucket wholesale, or republish removed content as a shortcut. Existing
holds and evidence survive rollback; any recovery must reconcile their actual state.

This is an implemented intake/triage workflow, not a legal-compliance certification,
an automatic legal adjudicator, a 100,000-user load certification or a guarantee of
zero provider/network failures. Existing spend caps and allowances remain in force.
