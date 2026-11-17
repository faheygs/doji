# Release and investigation records

These records retain exact artifact, rollback, incident and acceptance evidence.
They are not current setup instructions or authorization to rerun old operations.
Use [current state](../CURRENT_STATE_AND_GAPS.md) and the [handbook](../README.md) first.
Private artifacts remain ignored; source history is recoverable through Git.

## November 17 production notification backend

Reviewed main `7c7b9e0c6590836a981a0a0c097ccf850b48733d` passed all four jobs in
`43959663009`; docs-only admin-staging `43962776977` skipped package/deploy.
The owner reaffirmed iPhone design acceptance. The combined Android contributor
screen was accepted on the Staging emulator; no physical Android performance claim
is made. The isolated notification relay additionally passed 144 offline tests,
strict typing and controlled hosted Staging qualification, followed by byte-exact
restoration of the prior Staging runtime/configuration. Its two empty synthetic
batches exercised natural durable deferral/wake/completion without provider sends.

Fresh production preflight and two owned network-disabled database runs qualified
the seven exact production predecessor definitions, canonical SQL package, both
notification categories, concurrency, old-client arities, source acknowledgements,
all-kind contributor privacy and retaining rollback. Production had no nearby Doji,
due outbox work or lock waits. The next scheduled Doji was November 17 18:45 UTC.
The retained relay rollback matched all 12 prior runtime files byte-for-byte.

The installation kept social delivery disabled while applying the foundation,
defaults and matching notification-only relay, followed by trailing/history layers
and the concurrent contributor index/read. Production relay v77 matched all 13
candidate runtime files. It excludes four unrelated business-handler additions and
retains the deployed email helper, rather than deploying main's full closure.
All 17 other function inventories/code hashes and all 53 configuration digests
matched. A verification assertion initially included metadata timestamps: seven
platform-managed timestamps refreshed, but name/digest reconciliation proved no
configuration value changed. Read-only verification completed without repeating the
deployment; an unauthenticated relay request was rejected with 401.

Delivery enabled prospectively at `2026-11-17T03:34:16Z`. Readback at 03:36 UTC
verified 407 unrelated public contracts, all existing grants/policies/triggers/indexes
and unchanged profile/preference fingerprints. Only the two reviewed capture triggers
and one valid public contributor index were added. Database size was about 99.4 MB;
lock waits, overdue work and nearby events were zero. No profile rewrite, backfill,
production test notification, Worker deployment, new job, key rotation, auth/timing/
reward/monitoring change or additional resource occurred. Existing natural activity
uses the approved categories while honoring member opt-outs.

Exact baselines, package hashes, download readbacks, disabled/activation receipts
and retaining inverses are private under
`%LOCALAPPDATA%/Doji/production-backend/2026-11-16-social-notifications/production-preflight-20261117`.
Rollback disables social delivery and restores comment, dismissal, late-friend and
foundation layers in that order, retaining receipts/state and new-client preference
compatibility, then restores the prior isolated relay. The contributor read/index
has its separate retaining inverse. Do not replay installation or activation.

The approved production builds were dispatched once from the same main source:
Android `1653921b-f344-429d-a015-fa0297166188` (35) and iOS
`2f1147b3-d5ec-427c-9e94-d71ffd4b7a1e` (109), both version 1.0.15. Both platform
configurations, production bindings, existing signing metadata and all 425 archive
files passed before launch. The pair is capped at the owner's additional $3 budget,
with no automatic retry. iOS 109 passed native identity, App Store provisioning,
production APNs entitlement and source-map checks. IPA SHA-256 is
`34c4e945aa74a578d3af443810ff355c8aa41ebd9a1a75e85f4dab4b7d16a55d`;
EAS submission `a37ce784-baf6-4caa-9352-c2d95489f150` is uploading to the existing
Apple app and Doji Testers audience. Android artifact checks, closed Alpha distribution
and Apple review are pending; this receipt does not claim store availability or change
the minimum-version policy. Mobile evidence is private under
`%LOCALAPPDATA%/Doji/mobile-production/2026-11-17-notifications`.

## November 16 production mobile release queue

### Production version allocation

Version 1.0.15 allocates iOS 109 and Android 35 after fresh App Store Connect and
Google Play reads confirmed the latest uploaded predecessors, 108 and 34.
The owner approved one production build per platform with at most $3 additional
EAS cost, existing Android closed Alpha distribution and Apple review. No new
tester, mandatory-update change or automatic retry is included. Included EAS
credit was exhausted at the preflight read; allocation is not spending or dispatch.
The owner reaffirmed prior iPhone contributor-design acceptance. Android Dev at
`98c1b6b` retained its Staging session; the grouped comment opened the exact post,
and post detail and its sheet both displayed five comments. Combined hosted
attribution and Android late-friend delivery remain separate checks. Production
backend qualification and passing exact-head/main CI precede paid build dispatch;
exact artifacts must pass before store submission. Production remains 1.0.14.

The owner requested that all net-new work be queued for production, including the
Doji participation-screen design. The reviewed mobile subset is
`1453f432a65cf35474558559810cf5d0dbddb5fa`; the final combined candidate is not yet
frozen. This queue includes preparation and qualification work, not just changes
already tested in a binary. It is not a production deployment, build dispatch,
spending or store-submission approval.

| Candidate item | Recorded Staging qualification | Remaining boundary |
| --- | --- | --- |
| Comments on own posts and friends participating late; default-on settings preserving opt-outs | Isolated SQL/relay qualification; iPhone single/follow-up/burst alerts; Android comment delivery, opt-out and deep links; Staging 14 late-friend native navigation below | Production SQL/relay compatibility/rollback |
| Exact seen/dismissal source handling and grouped ordinary-comment rows | Synthetic concurrency regressions; owner accepted iPhone Staging 12 grouping; Android three-person grouping below | Final production-configured binary checks |
| Android multiline comment composer | PR #105/main gates and Android Staging 13 emulator acceptance below | Final production Android artifact/device check; physical Samsung keyboard remains unverified |
| Doji participation-screen redesign: contributor avatar/name, centered question, circular timer, XP badge and matching unattributed design | Owner accepted local Dev presentation; PR #107/main `7f11c06` passed CI and hosted additive-read qualification below; not in Staging 12/13 | Combined iOS/Android Staging acceptance and production read installation |
| Authoritative comment count on post detail | PR #108/main passed; Staging 14 detail and sheet both show five comments after the grouped alert's exact-post navigation | Final production-configured binary checks; no database update required |
| Expo 57 compatible dependency patches | PR #93 source gates; included in subsequent Staging binaries | Carry the reviewed lockfile into the combined candidate and verify production-configured artifacts |

The design is included in the queue, not silently excluded because it is local.
Its source remains in the owner checkout's challenge screens/components and
regressions. `DevDojiContributorCredit.tsx` currently uses an exact-event,
Staging-development fixture; it is not a production attribution contract. Preserve
the original files while preparing the reviewed integration. The four local
comments-keyboard files already match PR #105 and must not be reapplied as new work.

### Android late-friend navigation correction

On November 16 at 18:40 UTC, one normal synthetic Staging late participation
produced one FCM-accepted/displayed emulator alert. No iPhone or production device
was allowlisted. The OS tap foregrounded the app but left its existing native
inbox over the feed; the in-app row then opened the correct synthetic post. Exact
provider/configuration digests were restored. Evidence is retained under the
November 14 Staging release root's `android-late-delivery-20261116`; completed
mutation commands must not be replayed. The temporary helper was removed.

The correction closes the inbox before native-response navigation, including
same-feed links, using platform dismissal lifecycle rather than a delay. It keeps
unacknowledged responses on failure and fences account/access changes. The owner
approved up to $1 for one Android Staging build after exact-head checks, separate
from the $3 production pair. The Android verification build completed below;
the production pair has not started. Production
preflight also found unrelated email/business code in main's relay closure;
that unfiltered closure is not qualified for this mobile release.

### Android Staging 14 navigation acceptance

PR #111 merged as `00c0f5f899eb1e51c6a0fa9932ba3a45d7340ad9`;
main `43941148255` passed application, coverage, database and web-migration.
Admin-staging `43943390228` passed plan and skipped package/deploy. The single
approved $1 Android build `f4e9704a-ab98-4114-8579-71c120e7e0ec` completed as
1.0.15 / Staging 14. Exact source/archive, signing certificate, package identity,
non-debuggable APK and source-map upload were verified. Build-number reservation
committed once; a stale SDK read was corrected with a fresh network read before
local archive preparation continued. No reservation or cloud build was replayed.

The update preserved `androidtest1` on the API 36 emulator. With its native inbox
open before backgrounding, one synthetic friend's normal late participation
produced one FCM-accepted/displayed alert. Tapping the OS alert closed the inbox
and revealed that exact new post in the feed. The existing three-person comment
group also opened the correct post; detail and the sheet both showed five comments.
The test used an emulator-only allowlist, no iPhone/production destination, and
restored all original configuration digests. No push work remained queued.

Private artifacts, rollback/configuration receipts and acceptance are retained in
the November 14 Staging evidence root's `android-navigation-build14` directory.
One synthetic post and its normal buy-in/reward receipts remain as test evidence.
This is not physical Android/Samsung performance or combined contributor-screen
acceptance. The optional multiline-draft recheck entered the emulator's floating
stylus keyboard; its draft was cleared without posting, and no new full docked-keyboard
claim is made. Production SQL/relay isolation, final artifacts and store distribution
remain pending; the $3 production-build allowance is unused.

### Android Staging 13 comment delivery

November 16 Android comment-delivery qualification used the existing Staging 13
binary and synthetic `androidtest1` account. Two alerts were accepted by FCM in one
attempt each and displayed on the API 36 emulator: one comment, then three new
actors grouped as name and two others. Both taps opened the exact post/comments;
the earlier seen comment was excluded from the burst. The in-app inbox showed one
three-person row. One opted-out synthetic comment produced no push item. The exact
prior preferences and provider/device configuration were restored; five test
comments and private receipts remain under the Staging release evidence's
`android-delivery-20261116` directory. The inspected disposable helper was removed.
No production change, iPhone send or paid build occurred. This is not physical
Android performance or late-friend delivery acceptance. A separate detail-counter
defect (legacy zero versus authoritative five) remains a next-build correction gate.

### Staging contributor read qualification

PR #107 merged as `7f11c06fb2452040c091e1bf61ca48bb36551037`; main quality run
`43909038892` passed all four jobs. Admin-staging `43912323740` passed its plan and
skipped package/deploy. On November 16 at 17:17 UTC, the separately approved
`get_doji_contributor_v1` read and concurrent editorial lookup index were verified
in Staging only. The first installer invocation was rejected locally because its
opening SQL comment was parsed as a CLI flag; readback showed no installed object.
The owner approved one corrected file-based invocation, which succeeded. Do not
replay either attempt or the completed installation.

The installed body exactly matches reviewed source, with stable/security-definer
behavior, empty search path and authenticated-only execution; anonymous and service
roles are denied. The valid index is used by the bounded lookup. Rollback-only
hosted fixtures passed all five Doji kinds, safe profile fields, bidirectional
blocks, ambiguous/unapproved/missing attribution, audience and activation rules,
and the retaining inverse. No fixture rows remained; unrelated function/grant,
policy, trigger and index fingerprints and the three synthetic profiles matched
their baseline. Final waiting-lock count was zero and database usage was about
54 MB. No runtime, provider configuration, notifications or production changed.

Exact source, before/after hashes, attempt receipts and retaining rollback remain
under `%LOCALAPPDATA%/Doji/staging-backend/2026-11-16-contributor`. The disposable
installer was removed after verification. No native build or spending occurred;
installed Staging 12/13 do not contain the contributor integration or PR #108's
detail-counter correction. Combined mobile acceptance remains outstanding.

### Separately qualified production workstreams

These unreleased items also belong in the queue, but must not be bundled into a
mobile or portal deployment across their separate ownership boundaries.

| Workstream | Evidence/source | Next qualification gate |
| --- | --- | --- |
| Worker and admin-email notification acknowledgement hardening | Preserved `owner-preservation-before-release-closeout-20261114` stash: health monitor, operational-health, Sentry and send-admin-email plus regressions; not merged or deployed | Extract only unique changes onto reviewed main; test bounded acknowledgements, concurrency and uncertain-send fences; review member impact, then qualify exact Staging runtime/rollback before any production authorization |
| Admin historical-health presentation | PR #45 merged as `f73aa14`; source changes presentation, not health thresholds or delivery | Reconcile the retained hosted Staging receipt and exact immutable package, then qualify a separately approved admin-production promotion |
| Monitoring history, independent checks and mobile workflow reporting | Existing Staging receipts and default-off source preparation described in current guidance | Reconcile source/live flags and complete missing workflow/device qualification; production-independent-monitor bindings, capture and ingestion remain gated, not implicitly enabled by this queue |
| Shared/employee email presentation preparation | Recorded separately from deployed business email in the current service inventory | Establish the exact remaining source delta and Staging evidence before any shared/member template or provider change |

Reconcile each source delta against its deployed baseline before scheduling it;
older stash contents and receipt-only PR #100 are evidence, not instructions to
reapply superseded mobile code or replay deployments. Previously released search,
feed, comments, badges and Sparks changes are not new releases merely because an
old branch contains them. Outstanding coverage/performance gaps stay explicit;
queue membership is not a claim that they have been implemented or qualified.
The production baseline remains the recorded 1.0.14 / iOS 108 / Android 34 release;
this checklist is not a fresh live probe of those services.

Before release, close or explicitly resolve the acceptance gaps above, freeze the
reviewed source and require passing exact-head/main checks. Separately qualify the
production notification SQL/relay against the live predecessor and retaining
rollback in a quiet window; do not copy Staging-only registration/provider bindings
or replay completed Staging installations. Verify current flags, signing, store
counters and budget before obtaining approval for production-configured iPhone and
Android builds. Verify those exact artifacts in restricted distribution before
the separately approved store release. No mandatory-update change is included.

### Android Staging 13 keyboard receipt

PR #105 exact head `2f4d0cd64619192142674dff239d57647853a077` passed all four quality
jobs and security in `43802681155`, then merged as the candidate above. Main quality
`43804441614` passed all four jobs; admin-staging `43805890849` skipped package/deploy.
Only the Android sheet's keyboard-avoidance ownership changed; iOS retains its
existing layout. Forty-four targeted tests and root static/hygiene gates passed.

The owner approved one Android medium build with a maximum $1 additional cost
after included credit was exhausted. Build `801e8579-9870-4c23-8a69-c857ce347e08`
completed as 1.0.14 / 13, internal APK, at the exact candidate source. Its signature,
Staging identity/Firebase resources, non-debuggable manifest and source-map upload
were verified. APK SHA-256 is
`2774f0e000883c69dde030c9b580ad363d21f4e2968eb5d629afbb0e783c8110`.
No iPhone or production build was launched.

Installation over the existing API 36 emulator app retained its account. The
separately approved nine-Spark test grant and normal buy-in enabled one approved
synthetic response; its own post appeared and the feed unlocked. With a docked
Gboard keyboard, single-line entry, explicit newline, multiline growth, internal
scrolling at the height cap and a 501-character draft kept the last line/caret and
Post button visible. Background/return retained the draft; keyboard dismissal and
reopening passed. The draft was cleared without sending a comment. Temporary
keyboard preferences were restored. This is functional emulator acceptance, not
physical Samsung or frame-time qualification.

Private artifact and acceptance receipts remain under
`%LOCALAPPDATA%/Doji/staging-backend/2026-11-14-social-notifications/android-keyboard-build13`.
The inspected disposable release helper was removed; signing/rollback evidence and
owner Dev changes were preserved. Production was unchanged.

## November 15 Staging comment-alert acceptance

PR #102 merged as `f8189185d85f7738e6c1fc7dd7099c2fe5cb44b0`; main quality run
`43772009897` passed all four jobs, and admin-staging `43773217715` skipped
package/deploy. The exact mixed-line-ending predecessor repair passed offline
qualification and retaining rollback before Staging-only installation.
Relay version 35 matched all 20 candidate files; ten unrelated functions, all
secret digests and 501 existing contracts were unchanged. Only the previously
approved owner's APNs device was allowed; FCM's device allowlist remained empty.
Private qualification and rollback are retained under
`%LOCALAPPDATA%/Doji/staging-backend/2026-11-14-social-notifications/comment-release-05d1b28`.

On November 16 UTC (November 15 Mountain), the normal synthetic comment commands
produced one accepted delivery each at 01:37:57, 01:41:45 and 01:44:51. The owner
confirmed the single, follow-up and three-person burst phone alerts. Later batches
contained only new source IDs, not previously acknowledged comments. No additional
test send is authorized by this receipt. The owner's burst screenshot exposed
three separate in-app comment rows; the build 12 correction below resolves that
display gap. Production was not changed.

PR #103 exact head `37b6fe0fc24175d5014ccadca119bef90ae22e7c` passed all four jobs
and security, then merged as `fee12f93a28caf142b1813afef832b56bd2a6c2d`.
Main quality `43791222441` passed all four jobs; admin-staging `43792550625`
skipped package/deploy. The approved Staging build 12 pair used $3 of included
credit, leaving $0 without overage: iPhone `556d6753-c9dd-4358-9985-f9c2e71b7f47`
and Android `52c45a47-2e4c-41fa-95fa-27ccfca05f77`. Source, app identities,
Android signing and Staging Firebase resources, owner-only iPhone provisioning,
and both source-map upload reports were verified. Windows did not perform full
macOS code-signature verification or device-error symbolication.

The owner installed over iPhone Staging and confirmed the existing three comments
now form one grouped row. Android was updated in place and retained its account;
feed, notification list, existing friend groups and return navigation worked.
That Android account had no ordinary-comment group, so this is not separate
Android comment-group or FCM delivery acceptance. No additional test notifications,
backend deployments or production changes occurred. Private build artifacts,
hashes and acceptance receipts are retained under the same private parent in
`in-app-comments-build12`. A stale cached build-number read interrupted preparation;
fresh readback confirmed 12 before finishing archive checks, without replaying
the setting update or launching duplicate builds.

## November 14 disabled Staging social notifications

The owner approved only CI-gated Staging SQL/relay qualification, with delivery
disabled. PR #94 source `3e4ff2ee54c3d4989d0950854a065d231a2ab5f9` passed
application, coverage, database, web-migration and security; quality run
`43670996053` passed. The subsequent defaults qualification and merge are below;
neither backend receipt establishes mobile deployment or phone delivery.

Staging `ohrcupagdoilkwhecict` received the foundation, delivery and binding overlays
in one guarded transaction, after a separate installation/permission/retaining-
rollback rehearsal ended in ROLLBACK. Four exact prior definitions are retained;
their existing grants, 484 unrelated function contracts and existing policy
fingerprint remained unchanged. Installation refused intervening definitions and
used a two-second lock timeout. No member fixtures or delivery events were committed.

Only `relay-domain-events` was deployed, from version 27 to 28. All 18 downloaded
files matched the candidate byte-for-byte; the other ten Edge Functions were
unchanged. Existing staging wrapper/egress files were retained unchanged, rather
than adding newer unrelated email allowances. Offline artifact checks denied
APNs, FCM, Expo, email and production destinations without network calls.

At November 15 03:31 UTC (November 14 Mountain), authenticated capability returned
`enabled:false`; batches, source items, new alert outbox events, overdue delivery
work and lock waits were all zero. The queue was idle, so this is not proof of a
natural new-alert delivery cycle. Preflight showed healthy Nano capacity, 5% CPU,
14/60 connections and a roughly 53 MB database. No resource, secret, provider,
Worker, mobile binary or production configuration changed; no alert was sent.

Fresh private source/SQL snapshots, exact-head checks, candidate/readback hashes,
receipts and retaining rollback are outside Git at
`%LOCALAPPDATA%/Doji/staging-backend/2026-11-14-social-notifications`.
Older documented private rollback directories were not present; this release
captured live originals instead of assuming their availability.

The owner subsequently chose default-on for both categories, preserving saved
category/legacy/master opt-outs. Exact head `f11c4355980b91205c8b7acfd11df487450d9f5a`
passed all four jobs in `43674670637` and security; PR #94 merged through normal
protections as `fbd8dd12ee4a75b152887fef882cf4d593fbfe36`. The additive `.defaults.sql`
and matching relay version 29 were installed in Staging at November 15 04:12 UTC.
Both prior function definitions restored exactly in a transaction-ending rollback
rehearsal; unrelated definitions, policies and target grants remained unchanged.
All 18 relay files matched readback, and the other ten Edge Functions were unchanged.
Bounded reads checked 212 category decisions against existing Staging profiles,
including defaults and opt-outs; no profile values were rewritten. Authenticated
capability returned `settingsAvailable:true, enabled:false`, with anonymous execution
denied. Zero overdue work, batches or lock waits were observed. Private follow-up
evidence and rollback are in the same directory under `defaults-f11c435`.
No credential, provider, mobile binary, Worker or production change occurred.
Delivery remains disabled. Isolated provider/device bindings and actual device
grouping, opt-out and deep-link acceptance are outstanding; main CI and native
build/distribution gates remain separate from this disabled-backend qualification.

## November 14 production distribution and repository closeout

Runtime source is reviewed main `b2c57a46b590aebe9ea7474608fa2aff1a22ef30`;
quality run `43158852439` passed and admin-staging `43160984674` skipped packaging
and deployment. The backend qualification below is complete and must not be replayed.
The original production artifacts remain iOS `2827c7d9-8e0f-489d-8ee9-3821ab71de67`
and Android `4d3b570e-3ae9-4f76-8b9f-5b4e3d70484a`, version 1.0.14 / builds 108 and 34.

After the owner uploaded the verified Android bundle, closed Alpha release 24
was submitted and subsequently verified available to selected testers on Google Play,
at 100% rollout, one country/region, with the unchanged six-person closed-test list.
Device requirements matched build 33. This is not a public production-track launch.
The owner separately authorized public Apple review, accepted the required agreement,
and submitted version 1.0.14 with build 108. Review submission
`64d41382-cbfa-4ec2-afab-d2a825d7ddd9` initially showed Waiting for Review;
the public US App Store listing subsequently showed version 1.0.14 on November 13
Mountain time. No new binary, extra tester audience or paid resource was created.

The owner authorized mandatory updates only after store availability was verified:

| Platform | Prior minimum/latest | New minimum/latest | Applied UTC |
| --- | --- | --- | --- |
| Android | 1.0.13 / 33 | 1.0.14 / 34 | November 13, 03:09:40 |
| iOS | 1.0.10 / 105 | 1.0.14 / 108 | November 14, 00:10:03 |

Each bounded transaction required an exact prior-policy snapshot, changed only
its platform, preserved the other row and store URL/message, and retained a guarded
rollback. Anonymous and authenticated `get_mobile_release_policy` reads returned
the intended values. Local version/build decisions passed. The installed prompt
was not exercised on an old physical device during these configuration changes.
Policy fetching is cached and refetches on mount; this is an update requirement on
the next successful fetch, not silent installation or universal immediate enforcement.
Private baseline, rollback, verification and screenshots are retained outside Git in
the owner's temporary evidence directories `doji-android34-required-update-20261112`
and `doji-ios108-required-update-20261113`. Their rollback SQL has not been executed.

Four earlier documentation PRs are consolidated here instead of merging stale
current-state paragraphs over the released source. Their original diffs retain the
full artifact/signing/acceptance records and dated limitations:

| Receipt | Source / build | Recorded qualification |
| --- | --- | --- |
| [PR #76](https://github.com/faheygs/doji/pull/76) | `c45e27c`, Staging 4 | iPhone owner navigation/theme acceptance; emulator restart restored 499–681 ms activity launches, not feed-ready or physical-device latency |
| [PR #78](https://github.com/faheygs/doji/pull/78) | `d0f36be`, Staging 5 | Feed/reaction improvements reported by owner; exact staged artifacts and included-credit checks |
| [PR #80](https://github.com/faheygs/doji/pull/80) | `3c35e56`, Staging 6 | Hosted search SQL qualification, artifact/source-map checks and retained account on Android update |
| [PR #86](https://github.com/faheygs/doji/pull/86) | `62cc442`, Staging 8 | Prospective Staging Sparks activation November 11, 19:21 UTC, retaining rollback and both native artifacts; owner subsequently confirmed installation and targeted checks |

Staging 9 submission acceptance and the later production qualification supersede
those release holds, not their performance limitations. Physical Android speed,
native large-thread memory and complete health coverage are not certified.
Private paths in older receipts describe their recorded retention locations, not
a fresh filesystem inventory; locate and verify exact rollback evidence before reuse.

The owner folder moved from `a5be328` to reviewed main without overwriting newer
source. All 39 modified and nine untracked files were preserved by
`owner-preservation-before-release-closeout-20261114`, stash object
`4d14340fdd8c8a25a8228dfcf61e5a8c20a65a77`. Older stashes, worktrees and rollback
evidence remain intact. Recovery should use a separate branch based on the stash's
original parent; do not blindly apply it over current main. Some mobile files already
match released main; unique Worker/email notification changes remain unreleased.
[PR #45](https://github.com/faheygs/doji/pull/45) remains separate admin presentation
work and is not superseded by this mobile release. This closeout changes documentation
only; it authorizes no deployment, build, message or operational replay.

### November 14 Expo compatibility qualification

PR #93 merged as `af6646a` after exact-head `2041b51` passed all four quality jobs
and security in run `43626393842`. It updates Expo/Constants/Linking/Router to
57.0.33/57.0.24/57.0.14/57.0.31 and only their required locked dependencies.
Expo Doctor passed 21/21; all 313 Jest suites / 5,523 tests and root static gates
passed locally. The diagnostics pin was separately reviewed: ExpoFetchModule.kt
is byte-identical across 57.0.32 and 57.0.33, retaining SHA-256
`3c766cf8a30f00a91f3a6116aa9e7f6a44f26d7fe2179cd7c114cbbfb56b08ea`.
Unknown versions, source edits and duplicate observers still fail closed.
The scoped audit found no high/critical advisories; eight low and three moderate
findings remain. Native/device qualification is not established by these checks.
The owner approved the normal automatic admin-staging Pages pipeline because root
lockfiles are existing packaging inputs. No production deployment, native build,
backend change or extra spending accompanies this source patch. Reversion requires
a normal reviewed source revert; retained production binaries remain unchanged.

Main quality run `43627952981` passed all four jobs. Automatic admin-staging run
`43629652640` passed plan, packaging and deployment for exact source `af6646a`.
Its verified receipt records Pages `8ed172c2-4a78-40d8-a317-62e6c3af4776` and
rollback `96e107ab-c5e2-4441-bb1f-711157b10751`; configuration remained unchanged.
Public staging release identity matched after deployment. Production admin remained
at `9bf78fe`, with no production promotion. The private receipt is retained outside
Git in `doji-expo57-staging-receipt-20261114`. Pipeline verification covers exact
source/configuration, security headers and session-origin denial; it is not new
signed-in workflow or mobile-device acceptance.

## November 11 mobile Staging build 9 and production gates

### November 12 production backend qualification

The following records the original qualification and intermediate distribution
state. The November 14 closeout above supersedes its pending upload/review labels.

PR #91 passed all four jobs and security at `550d59f735f94b6d7fffc7b41873f6a938febeaa`
and merged as `b2c57a46b590aebe9ea7474608fa2aff1a22ef30`. Main quality run
`43158852439` passed all four jobs. Admin-staging run `43160984674` passed its plan
and skipped packaging/deployment. Its browser-fixture correction waits for the
mock hosted-auth navigation to abort before asserting storage; no production auth,
test retries, timeouts or coverage budgets changed. Local full qualification passed
5,523 app tests and 845 browser tests (one pre-existing skip), with all 17 coverage
budgets passing.

The narrow three-function REVOKE corrected the inherited grants without rewriting
their bodies or changing global defaults. Production read qualification passed at
05:04 UTC: exact Staging functions/permissions/indexes, denied unauthenticated reads,
unchanged existing contracts, balances and ledger, with zero lock waits.
Badge preparation installed disabled. The release helper then collapsed PostgreSQL
dollar quoting in a replacement string; the economy query failed SQL parsing before
creating its schema. Readback proved no economy installation, no awards and unchanged
balances. Callback-based literal insertion was qualified against 291 isolated
migrations, predecessor rejection, all-kind reward/replay tests and exact rollback
of all eight original functions. The explicitly resumed economy-only phase did not
replay badge or read installation.

Disabled economy qualification passed at 05:18:50 UTC. First-Doji and Sparks v2
were enabled together prospectively at 05:19 UTC, with no backfill, balance rewrite
or historical receipts. All 489 inspected functions remained within the approved
contract set; unrelated policies/triggers/indexes and existing function permissions
were unchanged. Auth, timing, push, Worker and monitoring were excluded. Private
evidence under `Doji/production-backend/2026-11-12-mobile-social` retains originals,
overlay hashes, attempts, readbacks, failed-attempt evidence and qualified receipts.
Rollback disables the gates and restores the captured reward functions while retaining
earned balances, ledger, winners and duplicate fences. Do not replay phase attempts.

Native source is 1.0.14 / iOS 108 / Android 34. The first launch stopped locally:
EAS evaluated production URLs before supplying its cloud profile, and the app's
default Dev selector rejected the mixture. Expo readback confirmed no cloud job or
credit use. Explicit local production selection passed read-only configuration
checks for both platforms. After explicit owner approval, one corrected launch
queued Android `4d3b570e-3ae9-4f76-8b9f-5b4e3d70484a` and iOS
`2827c7d9-8e0f-489d-8ee9-3821ab71de67` from exact main `b2c57a4`. Existing store
versions remain 1.0.13 / 107 / 33. iOS 108 finished and its identity, store provisioning,
production environment guard and source-map upload passed at 05:39 UTC; full macOS
code-signature verification was not available on Windows. Android 34 finished and
passed bundletool validation, existing upload-certificate/signature matching,
production environment guard and source-map upload at 05:56 UTC. Its artifact SHA256
is `0d141bb456b1140c0508318bf0452e71858782d6e43bd1e0a8c08e6840fb3790`.
Android EAS submission failed locally because no Google Play submission credential
is configured; readback confirmed zero submission jobs. No key was created.
The signed-in Console created closed Alpha draft release 24. The browser upload was
rejected as not a well-formed ZIP, although the unchanged local bundle again passed
bundletool validation and signature checks. The rejected entry was removed; the
original artifact is retained. Native-picker fallback exposed no dialog, so the
draft is awaiting owner upload of that same file. Do not rebuild or submit a duplicate;
Android 33 remains the available closed-track version until further verification.
Expo rejected the iOS submission's optional What to Test upload as Enterprise-only.
Readback matched all 20 pre-attempt submission IDs: no submission job was created.
The owner approved one corrected submission without that optional field. Submission
`435836e6-4616-4738-a46b-08b38fe3fa60` finished using the same iOS artifact, with
no plan upgrade or rebuild. Signed-in App Store Connect verified 1.0.14 (108) as
Testing in the existing six-person internal Doji Testers group at 05:53 UTC.
No external group or public App Store release was created. Installed production
binary acceptance remains pending; Staging acceptance is not a production-device test.
The approved pair remains limited to included credits and existing TestFlight/Play
closed Alpha audiences, not public distribution. The earlier preparation labels
below are superseded only for the qualified backend; physical Android performance
and native large-thread memory remain unqualified.

### November 12 production read-phase hold

The owner approved the narrow production SQL rollout and one included-credit
production build per platform, for existing beta audiences only. PR #90 passed all
four quality jobs and security at `3db2e267dd30316aa0ac3a2096bc0a8a06cdfbc5`, then
merged as `b8783f9e6a81d504c1e066e8432e9d7f9f9d7e3f`. The prepared version is
1.0.14 / iOS 108 / Android 34, above verified store counters 1.0.13 / 107 / 33.

At 04:17 UTC the approved feed/search/comment/reply-count/first-responder SQL and
three indexes had installed. Verification stopped because production's public-schema
defaults also granted `service_role` EXECUTE to the three new public reads; Staging
does not have that grant. Existing function/permission contracts outside the approved
changes, balances, ledger and profiles were unchanged; all three indexes were valid,
anonymous execution was denied and lock waits were zero. No badge/economy installation,
activation, mobile build or store submission occurred. Exact originals, phase receipts
and rollback remain privately under `Doji/production-backend/2026-11-12-mobile-social`.

The correction makes the member-only grants explicit, including the future win-count
read. Its synthetic regression first reproduced the inherited-grant failure. Passing
exact-head checks and Staging permission/body readback are required before a narrow
production REVOKE and complete read qualification. Do not rerun installed overlays or
change database-wide default privileges. Reward and native release gates remain held.

### Staging candidate and acceptance

PR #87 exact head `e12ebbdec1971247e086a86b1584fbefa2bb157a` passed required
quality/security checks and merged as `a95ca7b82062c910ead70af75074dc2ec4832b29`.
Main quality run `43132684982` passed all four jobs. Local qualification passed
313 suites / 5,521 tests, full typecheck, lint, size and hygiene checks.

| Internal Staging artifact | EAS build | Acceptance |
| --- | --- | --- |
| iPhone 1.0.8 / 9 | `f4ed1b15-d9eb-4c7a-a057-e13d3cf6c9d2` | Owner confirmed retained account/feed and submission without the false empty message |
| Android 1.0.8 / 9 | `1c118ed8-d2c7-44e7-80ac-2aec99281e81` | Retained account; approved text submission returned to visible own post and unlocked feed |

Both use exact source above, isolated Staging bindings and unchanged signing;
OTA, push and reporting remain off. Archive, artifact, configuration and completed
Sentry source-map upload checks passed. Source-map upload is not captured-device
symbolication. The iPhone profile permits only the owner's confirmed device.
The pair used $3 of included credit ($12 remained at readback), with no added
spending, production build, store submission or backend deployment.
Private artifacts and receipts remain under
`%LOCALAPPDATA%/Doji/mobile-staging/2026-11-11-confirmed-feed`; disposable archive
copies/helpers were removed. The owner confirmed the no-false-empty regression
in iPhone Dev on the same source. The installed Android build subsequently submitted
the approved synthetic answer once at November 12, 02:41:47 UTC. Its post/completion
were confirmed server-side; the observed return showed the post and unlocked feed,
not a false empty screen. This was snapshot-based functional verification, not
continuous frame/latency measurement. The owner subsequently confirmed that a
submission in installed iPhone Staging build 9 showed the post without the false
empty message, closing that functional acceptance; this is an owner report, not
instrumented timing.

Production release still requires these separately qualified boundaries:

Bounded read-only catalog checks on November 12, 02:33 UTC (November 11 Mountain)
confirmed the comment-page/reply-count and first-responder reads, first-badge/economy
settings tables and valid search/comment indexes in Staging. Production lacked those
new dependencies and retained the prior search body. Both environments retained feed
body fingerprint `d0194984794dd930ee2bf54bd40738f2`, matching the cursor fix's reviewed
predecessor, and reported zero lock waits. This was compatibility inspection, not
installation, gate activation, a load test or a reserved future release window.

| Boundary | Remaining release condition |
| --- | --- |
| Feed ordering | PR #88/main and hosted Staging passed; separately approved production installation and fresh compatibility/rollback checks remain |
| Public-name search | Fresh production compatibility/index-capacity/rollback checks for the previously approved narrow search update |
| Comments | Qualify/install v2 page index/read and reply-count projection; then enable the production native reader through reviewed source |
| First-to-Doji | Qualify/install first-responder index/read, canonical ledger and prospective badge gate; then enable production card |
| Sparks v2 | First-Doji dependency, aggregate balance/capacity review and separately approved prospective activation; no backfill or balance rewrite |
| Native release | Installed Staging submission acceptance passed; exact production bindings/store versions/credit checks and renewed build/distribution approval remain |

The first-Doji and comment client gates still explicitly allow Staging only; a
production build of this source cannot silently enable those features. Staging
Sparks activation is recorded from November 11 at 19:21:01 UTC, first-Doji from
05:41:42 UTC; those receipts are not production activation. Do not roll unrelated
deadline, Worker, monitoring, telemetry or push changes into this release. Physical
Android speed and native large-thread memory remain unqualified; emulator checks
and synthetic SQL fixtures establish neither. No production readiness claim is made.

### Staging feed cursor qualification

PR #88 exact head `07f53b67a32c18e119120b244a04242bdb16a8fd` passed all required
quality/security checks and merged as `f8694ef2ce7e7217e0b8b3f1f58db98bd0c5950b`.
Main quality run `43145547152` passed all four jobs. The local full database run
passed 291 migrations, 43 checks and five concurrency checks; focused regression
and full typecheck/lint/size/hygiene also passed. Automatic admin-staging plan
`43147684981` skipped packaging and deployment; no portal release was needed.

After owner approval, only `member_feed_cursor_order_v1.sql` was installed in
Staging on November 12 at 03:23 UTC (November 11 Mountain). The CLI first rejected
a leading SQL comment as an argument flag before execution; readback confirmed
the unchanged predecessor before the explicit file invocation. Installed body MD5
is `878b16d7842424bcc421b63673286a0a`, from reviewed predecessor
`d0194984794dd930ee2bf54bd40738f2`. Exact prior definition, retaining inverse,
attempt/readback records and qualification remain privately retained under
`%LOCALAPPDATA%/Doji/staging-backend/2026-11-11-feed-order`.

Twelve authenticated traversals passed: Everyone/Friends, page sizes 1/2/3, default
and merge-join plans. The fixture temporarily tied three existing synthetic post
timestamps, then rolled back. Full original post-row hashes, target permissions,
and unrelated function/grant, policy, trigger and index fingerprints matched;
zero lock waits remained. No accounts, events, permanent fixture data, messages,
builds, resources or production changes were introduced. This is bounded hosted
correctness evidence, not a large-feed performance benchmark.

## November 6 mobile development and staging builds

PR #56 merged as `7513c6d3914cad4c8a2c84a1810330bd7ee8c02c`; main quality
`42169655623` passed application, coverage, database and web-migration after
exact-head PR/security checks. The clean-source candidate preflight passed.
The owner separately approved three internal builds using existing credits only:

| Artifact | EAS build | Version/build | Status |
| --- | --- | --- | --- |
| iPhone Dev | `278d19fa-e723-45b5-8baa-b32a49a7effd` | 1.0.8 / 1 | Complete; owner-installed, Fast Refresh verified |
| iPhone Staging | `2f78a1f2-8baa-48f9-b89c-e3890fb9a9ac` | 1.0.8 / 2 | Complete; owner-installed, startup verified with Metro stopped |
| Android Staging | `331b969b-430d-406e-85ea-81216ef28980` | 1.0.8 / 2 | Complete; emulator-installed, cold startup verified with Metro stopped |

All use exact source `7513c6d`, staging service bindings and disabled push/reporting.
The separate clean build checkout excludes unrelated owner Worker/email changes.
Fresh EAS usage before launch was $7 of $45 included credits; a conservative $10
batch reserve covered the approved builds and delayed prior usage. Final usage
was $12 of $45 ($5 for this batch, $33 remaining at that read). No store
submission, production release, plan change or added spending was authorized.

The iPhone IPA identities are `com.doit.challengeapp.development` and `.staging`.
Both embedded profiles contain exactly the confirmed owner's device (suffix 801C)
under team `HUG35JPQGG`, expiring May 12, 2027. They reuse the existing distribution
certificate; no production certificate was replaced or revoked and no TestFlight
tester group was used. Dev IPA SHA-256 is
`13cd054e5d28aadd6b5eb71a1bfb44a318589e630519afb58940abf03b69de48`;
Staging IPA SHA-256 is
`d6724e5fcd76e7c11b27f5fa31d90b98301f8381acbe0f9d82fffcde2a2a950e`.
The Staging IPA contains its own JavaScript bundle. Its Sentry upload report
matches `doji-staging`, release `com.doit.challengeapp.staging@1.0.8+2`, and Debug ID
`3cb3f734-4a3c-426a-bbde-973a39edb45d`; this is upload evidence, not device-error
symbolication. Dev JavaScript comes from Metro, not that standalone source map.
Android APK SHA-256 is
`4f372121eb5d0162956f7bd2e6c091951e5cb2e4c29e23dec2d601988262c0b3`;
its staging identity/build 2 and valid signature matched the prior staging
certificate `37f7fb05679c6ab870c5e05b9f6c8d005eb9afde18bc74eb6a9bf381fdc85d56`.
Its completed Sentry upload matches the same staging project/release and Debug ID
`2a5b65c8-7eb8-4076-a769-d171f7aa5fdd`. APK update installation preserved app data.

Metro serves the owner's editing checkout with external staging-only client
configuration. Android Fast Refresh/change restoration was visually verified;
the owner confirmed the same on the iPhone without reload. The temporary headline
edit was restored with no file diff. With Metro stopped and its HTTP endpoint
unavailable, the owner repeatedly closed/reopened iPhone Staging successfully.
Android build 2 also cold-started to the welcome screen with Metro unavailable.
A stalled local ADB server was restarted once; no emulator reset or app-data clear
was used. The staging activity and installed build were verified afterward.
Metro and Android port forwarding were then restored in trusted-LAN mode. This does not qualify signup,
confirmation/profile creation, authenticated workflows, push, telemetry or physical
Android behavior; the protected GitHub build runner also remains unfinished.

Exact artifacts, hashes, launch/signing/configuration receipts are retained outside
Git in `%LOCALAPPDATA%/Doji/mobile-staging/2026-11-06`. Older Android build 1 is retained
for comparison/recovery. There is no instant native rollback: stop distribution
and qualify a corrective build rather than replace signing or enable OTA. Production
data/settings, backend runtimes and delivery gates were unchanged by this batch.

## November 6 staging signup parity correction

The owner rejected the staging-only alias and email-verification requirements.
Readback confirmed production auto-confirmed email while staging did not. With
explicit approval, only staging `ohrcupagdoilkwhecict` Auth configuration changed:
`mailer_autoconfirm=true` and Before User Created's URI restored to
`pg-functions://postgres/public/hook_enforce_minimum_signup_age`.
The hook stayed enabled. All other Auth settings and the age/legal
function/grant fingerprint were unchanged; no SQL, runtime or app build changed.
The public Auth endpoint independently confirmed enabled email signup with
auto-confirmation. The owner then confirmed successful normal signup in the
installed iPhone Staging app, without the special address format or verification.
Full profile/workflow acceptance and Android signup remain separate checks.

The original age hook's definition hash remained
`98ae11ef08c78fd4a1fc1f37ac30e3df`, with Auth execute permission retained.
Direct hook invocation was correctly denied to the Management API read-only role;
no permission was widened to run that diagnostic. The historical alias wrapper
remains installed but unbound. No account was created by the configuration tool,
no email was sent, and production was not changed. Recovery/email-change routing
remains unqualified and must not be tested against arbitrary destinations.
Owner/SYSTEM-restricted before/after receipts and the exact two-field rollback
are retained at `%LOCALAPPDATA%/Doji/staging-backend/2026-11-06-signup-parity`.
Rollback changes only those settings; it does not delete accounts or reset data.

## November 6 mobile Doji acceptance and deadline preparation

On the existing `7513c6d` Staging build 2 artifacts, the owner confirmed normal
signup/profile, restored sessions and sign-out/sign-in on iPhone and Android
emulator. The staging-wide photo occurrence `8d815b61-ae62-4e81-a89a-5ac649256ae8`
used the existing prepare RPC and durable pre-live/activate/close implementation,
with a manually chosen test time and next-day chaining disabled for this single
test. The active dummy template is retained; no new daily schedule was enabled.
Server activation was November 6 at 09:51:02.580 Mountain, deadline 10:01:02.580,
and natural close 10:01:03.329. Both accounts submitted once before the deadline;
each has one photo, one completion, 50 XP and streak 1. The owner confirmed the feed
on both devices. Phase hints published on first attempt. Push/reporting stayed off;
production was untouched. This does not qualify notification delivery or all Doji types.

The iPhone owner reported 10:00 stuck before and during the challenge. The live
ring capped its displayed text at 600 seconds despite that occurrence's signup-day
deadline being midnight. Android's pre-live occurrence had its grace deadline
overwritten at activation; both flags remained true. The existing expiry trigger
reproduces that join-order difference in a fresh offline database.

PR #58 merged full deadline text in compact/ring timers (ring progress stays
bounded) and `participation_deadline_v1.sql` as `906006d76b3e9517a381fecfd0645333826904a4`.
Exact-head application/coverage/database/web-migration/security passed; main quality
`42284145134` passed all four jobs. Admin staging `42286014580` skipped package/deploy.
The owner separately approved staging SQL and one internal build per platform,
using included credits only. The trigger-only staging deployment preserved owner,
grants, security-definer/search-path, trigger binding and unrelated contracts;
13 hosted assertions passed in a rolled-back transaction with no users/events left.
Staging's default function ACL required an explicit grant on the temporary invoker
assertion helper only; no application permission changed. The first fixture attempt
rolled back, and a subsequent harness quoting error executed no fixture changes.
Exact baseline/function/inverse and hosted evidence are retained under
`C:/Users/gfahe/AppData/Local/Doji/staging-backend/2026-11-06-deadline`.

Staging build 3 jobs: Android `0739172e-705c-4008-8788-ee56650d4b7e`,
iPhone `112407f2-a650-4607-a2fb-bbfc20975c3e`, both from `906006d`.
Both completed with verified staging identities/signatures and Sentry source-map
uploads. iPhone provisioning remains limited to the owner's device ending 801C.
The owner confirmed its update retained the session and opened normally; Android
build 3 was installed over build 2 without clearing data, and its signed-in account
and feed were visually verified. The pair consumed $3 of included credits; readback
was $15 of $45, with $30 remaining and no additional spending. Device acceptance
is bounded by the results below. Receipts are retained under
`C:/Users/gfahe/AppData/Local/Doji/mobile-staging/2026-11-06-countdown`.
The retained inverse restores the original trigger without deletion or backfill.
No production, Edge/Worker, Auth, reward, scheduler, push or reporting change occurred.
The pre-live banner uses a separate uncapped clock: real-hook tests cover skew,
missed ticks and expiry reconciliation but did not reproduce the earlier freeze.
For the approved build 3 regression, existing staging occurrence
`67918478-67a6-4e1e-be65-6554d8364236` was moved from November 7 at 17:27 Mountain
to November 6 at 15:11, preserving its ten-minute window and existing alarm chain.
No new event, scheduler or provider gate was created. The owner confirmed iPhone
pre-live countdown progression and background-return catch-up without reload.
Android pre-live progressed from 4:53 to 4:43; the owner subsequently tested it
and reported normal behavior. Natural activation at 15:11:00.562 Mountain set close
to 15:21:00.562, with actual close at 15:21:01.072. Both accounts retained their
midnight signup-day deadline before activation, after activation and after close.
The first-day banner correctly has no timer. In response to the remaining
in-challenge countdown/background-return check, the owner confirmed everything
looked good; this is owner-reported device acceptance, not a captured timer trace.
Both participation rows were pending at the server close read; this run does
not add completion/reward evidence to the earlier successful photo test.

Local validation passed: 72 focused mobile tests, full typecheck/lint/size/hygiene
gates, and the complete isolated database suite after replaying 291 migrations.
The new database regression reproduces the old defect, verifies exception and
ordinary-window behavior, and proves exact function/grant restoration on rollback.
The temporary assertion grant also passed the isolated regression after hosted
qualification. None of these checks substitutes for physical-device acceptance.

## November 5 Expo compatibility alignment

PR #52's application job stopped at Expo Doctor: nine direct packages were one
patch behind the SDK's expected versions. The source update aligns Expo 57.0.32,
Metro runtime 57.0.18, Constants 57.0.23, Dev Client 57.0.21, Image Manipulator
57.0.22, Image Picker 57.0.21, Notifications 57.0.25, Router 57.0.30 and Splash
Screen 57.0.11, with their npm-resolved supporting dependencies. React/React Native,
web and infrastructure manifests/lockfiles are unchanged; no doctor exclusion,
coverage reduction, forced override or blanket audit fix was added.

The Android passive diagnostics guard now pins 57.0.32 after reviewing its fetch
module: normalized SHA-256 remains
`3c766cf8a30f00a91f3a6116aa9e7f6a44f26d7fe2179cd7c114cbbfb56b08ea`, identical
to 57.0.31. The exact hash, single-observer and unknown-version rejection remain.
The owner-approved existing calendar-test correction checks local midnight/civil
days plus timezone-offset elapsed time, with spring/fall DST fixtures. It changes
no application timing code; a local day need not be exactly 24 elapsed hours.

Reviewed upstream notes include [Expo](https://github.com/expo/expo/blob/sdk-57/packages/expo/CHANGELOG.md),
[Router](https://github.com/expo/expo/blob/sdk-57/packages/expo-router/CHANGELOG.md),
[Notifications](https://github.com/expo/expo/blob/sdk-57/packages/expo-notifications/CHANGELOG.md)
and [CLI](https://github.com/expo/expo/blob/sdk-57/packages/%40expo/cli/CHANGELOG.md).
CLI 57.0.33 removes its Zod production dependency. Fresh root audit: zero high or
critical findings; nine moderate and ten low findings remain. Expo Doctor passes
21/21 checks and `expo install --check` reports aligned dependencies.
Isolated local validation passed full root typechecking/lint/size/hygiene, 268 Jest
suites / 5,023 tests, 335 web tests, web builds/artifact budgets and ten release
policy tests. Calendar fixtures passed in Denver and UTC. Windows initially denied
a generated Next.js directory; the unchanged build passed with filesystem permission.
Reverting the paired manifest/lockfile and diagnostics version pin restores the
previous source dependency graph. There is no native artifact to roll back: no
mobile build, OTA update, store submission or production promotion accompanies this change.
Root dependency changes qualify for the existing automatic admin-staging workflow;
exact-head CI and release receipts remain separate from local checks.

## November 5 Sentry notification closeout

Sentry support (Igor) confirmed both November 4 failure notifications entered its
queue, then were intentionally filtered because the issue had resolved before
queue processing. Neither reached the mail provider; this was not recipient-side
suppression. Recovery emails use a separate path and both arrived.

Support timestamps below are November 4 PST (Mountain is one hour later):

| Drill | Issue created/regressed | Failure queued | Resolved | Delivery skipped |
| --- | --- | --- | --- | --- |
| First | 17:50:48 | 17:51:40 | 17:51:48 | 17:55:07 |
| Second | 20:09:49 | 20:10:17 | 20:11:49 | 20:15:22 |

The owner accepted detection/recovery as working as designed and closed the
investigation. No recovery-tolerance change or additional drill is required.
This closes the previously unexplained missing-email result, not a claim that
failure emails arrived or that every short incident generates one. Retained
incident history remains evidence. No production rollout, mobile enablement,
paid capacity or further sends are authorized by this closeout.

## November 5 staging mobile ingestion qualification

PR #50 merged as `2872e185c2a3ddb2431d8f42c67f88c0843c69f9`; main quality
`41978375875` passed all four jobs. Staging workflow `41980395506` correctly skipped
Pages packaging/deployment. The separately approved single-function upload installed
`mobile-workflow-report` disabled at 06:32 UTC November 5 (November 4 Mountain).
Both downloaded files matched the isolated package byte-for-byte; handler SHA-256
is `3e7e16e8f9f440f5bd0beb25b94393e9b71b3ae7a7b05ef0aa960c2bbac480c9`.
The existing ingestion SQL function bodies/grants matched reviewed source.
The endpoint rejects disabled requests with HTTP 404. No SQL definitions, Worker,
Pages, production or mobile artifact were deployed.

Hosted qualification stopped at password sign-in for its first temporary synthetic
Auth account, before any report submission. The Supabase UI confirmed Email sign-in
disabled, public signup disabled and anonymous sign-in disabled. No auth setting was
changed or bypassed. The temporary account was removed; baseline identity/profile,
function/grant/policy fingerprints and empty counters were restored and verified.
Both Edge and SQL capture gates remain off. Ten unrelated function code hashes and
all prior secret digests are unchanged; secret updates refresh configuration metadata,
not unrelated code. This first attempt did not qualify hosted ingestion.

The owner separately approved temporary staging Email sign-in for two synthetic
accounts. On November 5 at 15:44 UTC (08:44 Mountain), genuine Supabase password
sessions submitted iOS and Android batches: HTTP 204 for both, all 60 fixed
platform/category pairs counted once in the bounded server projection. Identical
replay returned 204 without incrementing counts; a new batch inside the admission
window returned 429. Missing/unverified bearers returned 401, wrong method 405,
injected actor fields 400 and disabled SQL capture 503. Every response was empty
and no-store. No email, member command or mobile build was used.

Both Edge/SQL capture gates were restored false. The two exact synthetic accounts
were removed; their 60 count rows and two admission slots were exported privately,
matched under a bounded lock and removed. Baseline identities/profiles, existing
function/grant/policy hashes, prior secret digests and ten unrelated code hashes
matched again. Supabase UI confirmed Email provider disabled after restoration;
public signup and anonymous sign-in stayed off, email confirmation stayed on.
The endpoint is qualified, not continuously enabled. Physical-device capture,
the hosted enabled-count display and production release remain separate gates.

Fresh staging Free capacity: 7,927/500,000 Edge invocations, 0.044/0.5 GB database,
0.08/5 GB egress, 0.406/1 GB logs, no overage, CPU 3%, 11/60 connections.
Private artifact, baseline, readback, hold and qualification receipts are under
`Doji/staging-backend/2026-11-05-mobile-ingestion`. Rollback keeps the Edge reporting
flag and private SQL capture false, retaining evidence; there was no prior endpoint.
No persistent staging member sign-in, public signup, real email, production or
mobile-build authorization is implied by this completed test.

## November 4 staging Sentry history

PR #47 merged as `824974368816f55ef58111ad0bc60fbdae6de3ab`; main quality run
`41962094517` and automatic staging `41963922156` passed. Pages
`60da6cd3-0478-41ff-afc0-4f3113945786` has rollback `bda0d5c5-cde9-4651-b613-eed0818fe6fe`.
The retained artifact, public release and verified receipt match, with unchanged
configuration fingerprint. Signed-in delivery/platform timestamps advanced
20:51:46, 20:53:45, 20:54:45 Mountain without refresh; app-error timestamps also
advanced and the session persisted. The earlier failed run below remains historical,
not relabelled success; its original failure cause is not established.

PR #48 exact head `a185c3d0c63b8d2e45af22ca451f828856064be6` passed all four jobs
in `41964106791` and GitGuardian, then merged as `ac19f50c5aca6782a00ebf57477f82a7c6009439`.
Main quality `41965407496` and staging workflow `41966685707` passed; the latter
correctly skipped Pages packaging/deployment for the backend-only change.
The separately approved collector-only staging rollout installed disabled, verified
all 11 downloaded files against the tested candidate, then enabled the importer.
Nine unrelated Edge code hashes and all 37 existing secret digests were unchanged.
Two secret updates advanced configuration revisions, not unrelated code. Collector
version 28 is active. No SQL, Worker, jobs, mobile or production deployment occurred.
Natural watchdog source times advanced 04:04:44 to 04:05:44 UTC November 5, distinct
from receipt times 04:05:45.978625 and 04:06:46.339037. The hosted staging independent
monitor changed from no observation to measured checks passed without refresh.

Capacity before activation: staging Free plan, 7,137/500,000 Edge invocations,
0.044/0.5 GB database, 0.068/5 GB egress, 0.4/1 GB log ingestion, zero overages;
database CPU 3% and 13/60 connections. The existing included Sentry monitor remains
the only runner. Its separate approved Alerts: Read integration is organization-wide,
but runtime/egress pin only staging monitor 10858429 and its exact target binding.
No new resources or spending were added. The gifted monitor credit still expires November 28.

Private code/configuration rollback, digests, artifact and acceptance material are
under `Doji/staging-backend/2026-11-04-monitor/sentry-history`, outside Git.
Rollback sets `SENTRY_MONITOR_HISTORY_ENABLED=false` and restores only the retained
collector package; it retains observations and leaves the monitor's rotated read key
and existing Worker/SQL gates unchanged. Never replay completed installation helpers.
The second approved assertion-only drill failed checks at 21:07:44 and 21:08:44
Mountain November 4, entered downtime at 21:09:44, and recovered at 21:11:44 after
the original 199/300 status bounds were restored. The endpoint continued returning
HTTP 200; no application outage was induced. Hosted history recorded the failure
and recovery, retaining the incident alongside fresh healthy independent/platform
observations at 21:35:44/21:36:45. The old label incorrectly inferred that reporting
stopped; the focused display correction says independent health check failed.

Alert `6292687` recorded four total triggers across both drills. Direct Gmail
verification found only two resolved notices, at 18:51 and 21:11 Mountain—one per
drill, not a failure/recovery pair. Issue Alerts/email are enabled, the exact owner
recipient and project routing are correct, and the rule has no event filter or
throttling. The owner-approved support reply sent at 21:33 requests failure-send,
suppression or receiving-server rejection evidence. At that point the cause was
unknown; the [November 5 support closeout](#november-5-sentry-notification-closeout)
records the explanation and owner acceptance. This staging record is not a
production release or authorization for further test sends.

## November 4 staging evidence reads and monitor

PR #46 exact head `e1662b0ba08423234121cfe10862241c38ccd85e` passed all four
quality jobs and GitGuardian, then merged as `68711826e5858a73a0acaf8ab254cb5781929ae9`.
Main CI `41951848836` passed all four jobs. Automatic staging run `41953768497`
packaged successfully and uploaded Pages `bda0d5c5-cde9-4651-b613-eed0818fe6fe`,
with rollback `3d205cc2-699d-4b18-967a-95fbac8ea4c0`, but failed during post-upload
verification. Its original receipt remains `needs-inspection`; it was not rewritten
as success. Independent read-only checks found the exact public release/config,
78 manifest assets, security headers and session denials correct; Cloudflare showed
success at the expected source and an unchanged configuration fingerprint. The
generic catch hid the original failed assertion, so a propagation race is not proven.
Do not rerun or promote this failed workflow; release qualification needs diagnosis.
Signed-in hosted reads restored the existing session. Platform-monitor timestamps
advanced November 4 Mountain time `19:18:45`, `19:19:44`, `19:20:44` without refresh;
Device reports showed disabled capture. No retained incidents were returned.
The separate independent-monitor history has no observation: Sentry's external
checks are not connected to that history. Populated/denied states were tested with
synthetic SQL/browser fixtures, not claimed as populated hosted acceptance.
No production or mobile release is authorized by this receipt.

The separately approved staging SQL installed the private mobile-counter dependency
disabled, plus employee/development history and device-read bridges. All 484 prior
function/ACL fingerprints and 89 policies were unchanged. Only employee-portal-v2
and admin-development code was deployed; readback matched the candidate packages.
Read flags are enabled, with versions 36/32 after configuration updates. Eight
unrelated Edge code hashes and 34 other secret digests were unchanged. Mobile
capture remains false and the ingestion endpoint is absent. Synthetic permission,
MFA, revocation, claim-restoration and retaining-rollback checks passed in a rolled
back transaction; final reads found zero fixture identities, count/admission rows
and lock waits. Supabase usage was 6,733/500,000 Edge calls, 0.044/0.5 GB database
and 0.064/5 GB egress, within existing free capacity.

Private artifacts, five SQL overlays/inverses, prior runtime/configuration and
`backend-qualified.json` are under `Doji/staging-backend/2026-11-04-evidence-reads`.
Rollback disables only the new read flags, restores retained runtimes/configuration
and applies the reviewed retaining inverses; it does not erase observations.
Completed deployment helpers are not replay instructions.

Sentry support supplied a free monitor seat while fixing its entitlement bug.
Monitor `10858429` is enabled and natural checks returned HTTP 200. The temporary
gifted credit ends November 28; no paid continuation is approved. The staging
read key was rotated, with old-key 401/new-key 200 and 34 other secret digests
unchanged; the former key's evidence file is not current configuration. Protected
replacement/rotation evidence is under `2026-11-04-monitor/key-rotation-20261104`.

The approved test changed only Sentry's assertion to reject the healthy HTTP 200,
then restored its original 200–299 acceptance. Test issue `DOJI-STAGING-2`
(`7830048458`) recovered automatically; natural healthy checks resumed. Alert
`6292687` recorded two triggers. The owner received the recovery email only:
initial failure email was not found in the conversation or Spam. Read-only checks
showed personal Issue Alerts on with Email delivery and no project override; the
rule targets Gavin on every trigger with new/resolved conditions and no event
exclusion. Delivery/suppression evidence was pending at that point; the
[November 5 support closeout](#november-5-sentry-notification-closeout) resolves the
investigation. Trigger history is not an inbox receipt. No second drill was then
approved; the later separate approval and results are recorded above.
This did not interrupt Doji or establish complete platform-health coverage.

## November 4 staging monitor reporting

The narrow retry at draft PR #46 head `6632592694baa55ac47343c4432b99319973a54e`
passed application, coverage, database and web-migration in run `41908348564`, plus
GitGuardian. The corrected redirect assertion and real-workerd test cover success,
redirect rejection and failure isolation; no coverage threshold was lowered.

Staging Worker `3a10f5f7-06ea-47d2-90c6-cd4f7e340af6` is active at 100% in
deployment `c1620776-672c-402c-9416-a24a8a778400`. Uploaded module SHA-256
`acb996a9c0185e31088e4a36242bb2d3873d68d4b7098bb78890dfcde6b8c604` matched
the tested bundle assembled from committed inputs, excluding owner worktree changes.
All five Durable Object namespaces, prior bindings and minute cron were preserved;
only the monitor reporting flag was added. Existing SQL capture and Edge monitor
gates were enabled; no Edge code was redeployed. Ten Edge code hashes and 33 existing
secret digests remained unchanged. All 564 installed function/grant/policy contracts
retained fingerprint `267ce47d75bfce6793dc660e27d21391`, with zero lock waits.

Natural healthy source times advanced from `20:54:45` to `20:55:45.37` UTC November 4.
The scoped endpoint returned 200 for fresh evidence, 401 for an invalid key and 405
for the wrong method. Member/anonymous RPC access and private-schema access stayed
denied. Initially missing evidence correctly returned 503 rather than false health.
Sentry monitor `10858429` was created for `doji-staging` with the scoped key and
owner-only email alert `6292687`; its authenticated test returned “Uptime check
passed successfully.” Activation failed with “You don't have enough budget available
to create a new seat.” A fresh billing read still showed Developer plan, 0/1 included
Uptime Monitors, $0 additional spend and no payment method. The monitor remains
disabled with no check-ins; no budget/plan change or failure injection was attempted.
Account entitlement resolution and the approved failure/recovery test remain gates.
No alert was sent; production, mobile, employee history UI and other sending remain unchanged.

Capacity checks showed Sentry 0/1 included monitors, Supabase 6,112/500,000 Edge
calls and 0.044/0.5 GB database, and Cloudflare $0 billable usage. Rollback disables
SQL/Edge monitor gates and restores immutable Worker `541f3b8b-5a70-4526-987c-a37f011c95ba`,
retaining evidence. Private `retry-6632592/backend-qualified.json`, source, artifacts
and readbacks remain under `Doji/staging-backend/2026-11-04-monitor` outside Git.
The preceding failed attempt below is historical evidence, not the active state.

## November 4 staging monitor history hold

Draft PR #46 at `e1069cbfcb2b8244c4bebd05e961299e17c8c4b1` passed all four
quality jobs in run `41851836770` and GitGuardian. The owner separately approved
only monitor-history SQL, the guarded staging `operational-health` endpoint and
the bounded staging Worker reporting hook, not the PR's employee/mobile/UI changes.
Existing Supabase/Cloudflare/Sentry capacity was checked; no extra spend or alert.
The SQL preserved all 561 existing function/grant/policy contracts (fingerprint
`36aecb5defaa724aa2342b7db3a8c8eb`); nine reachable Edge files matched readback,
nine unrelated function hashes and 33 existing secret digests were unchanged.
Only the staging monitor flag and scoped heartbeat-read key were added.

Worker version `5584668e-3905-4f54-9dc2-faafc26be7bf` preserved all five Durable
Object namespace IDs and the existing minute cron. Natural Worker checks returned
success but no observation reached history. Real local workerd reproduced the
cause: `redirect: 'error'` throws before sending. Node fetch mocks missed this.
The correction uses `manual`, still accepts only 204 and never follows redirects
or retries. A synthetic real-workerd regression is now a required application check.
Corrected exact-head CI and repeated hosted acceptance are required before re-enabling.

Retaining rollback verified November 4 at 16:13 UTC: prior immutable Worker
`541f3b8b-5a70-4526-987c-a37f011c95ba` is active at 100% in deployment
`519f45ed-675a-4576-b794-984e165ff1f4`, with its original bindings. SQL capture and
Edge monitor routes are disabled (404); the installed schema/runtime and scoped
key are retained. The ledger has zero observations/incidents; the synthetic SQL
write was rolled back. Sentry monitor creation and the approved email test did not
occur. Production, mobile ingestion, existing email/push and member behavior were
not changed. Private rollback/artifacts and `acceptance-held.json` are retained in
`Doji/staging-backend/2026-11-04-monitor` outside Git; do not replay deployment helpers.

## November 3 production cached health

Protected promotion [41750188315](https://github.com/faheygs/doji/actions/runs/41750188315)
succeeded after owner approval, using immutable staging run `41744544693` at
`9bf78fe16ef5ed8b30233a9b27675bcde5c6341c`. PR #43 and main run `41742734996`
passed all four required checks; exact-head security checks passed. Staging's
signed-in natural updates and global status were verified before promotion.
Production Pages is `fe1b5974-b3d3-4e51-8dfa-7f003e90a5d6`; rollback is
`c21bb73d-ec04-4784-83d8-34cffb590936`. Public source/config and retained package/
deployment receipt match: cache enabled, health broadcasts disabled. The earlier
attempt failed before upload; PR #43 corrected only the pinned predecessor-policy
transition while retaining artifact, binding, rollback and owner-approval checks.

The separately approved backend preceded Pages: private snapshot SQL, employee
runtime 31 and collector 41. Five candidate files matched downloaded source;
16 unrelated function code hashes were unchanged. Four secrets updates advanced
their configuration revisions, not their code. The 555 existing function/ACL/policy
contracts retained fingerprint `a2b4b1992a9d79e30c645f3c9a217e32`.
The bounded post-release read at November 4 01:34:35 UTC found no lock waits or
near/active Doji, and a fresh healthy snapshot with workflow measurements.

Hosted production delivery observations advanced 6:34:59, 6:36:58 and 6:37:59 PM
Mountain on November 3 without refresh; Sentry advanced 6:35:07, 6:37:08 and
6:38:09. The employee session remained active. Chrome tab-level Network Offline
showed `Health: offline` and retained source timestamps. Restoring No throttling
recovered delivery 6:38:58 and Sentry 6:39:28 automatically without reload/MFA.
The global health badge remained available on Overview after recovery.
This was browser emulation, not a physical network/device test. Current reads had
no overdue publication/notification work or Apple authorization failures and no
unresolved Sentry groups returned; one historical Doji delivery warning remained.

Existing Cloudflare/Supabase capacity was verified; no new service, job or spending.
Private exact packages, configurations, SQL retaining rollback and deployment
receipts remain under `Doji/production-backend/2026-11-03-cache` outside Git.
Rollback disables cache reads/capture and restores retained runtime/config/Pages,
preserving observations. Member auth, timing, votes/rewards, push, cleanup and
Worker were not changed. Seven workflow measurement gaps, durable incident
history/reconciliation and independent monitor heartbeat remain unfinished.

## November 3 staging cached health

PR #39 merged as `3d3ebed54f18a18a865507a6b529a480c2ed98e6` after application,
coverage, database, web-migration and security passed on exact head `85967cc`.
The unchanged bundle budgets passed: 167.7 KiB sign-in and 497.6 KiB total gzip;
two source-SHA packages had identical assets and passed packaged browser checks.
The approved staging SQL passed a rollback rehearsal and preserved existing
member/portal function fingerprints. Only `employee-portal-v2`, `admin-development`
and `operational-health` were deployed; downloaded source matched the candidates.
Main quality run `41683775577` passed. Automatic staging run `41686332317`
deployed Pages `4f954aae-f030-4d14-aaf1-44402145ef3f`; public source/config and
the retained receipt match. Pages rollback is `4c155283-e5a5-4dda-b556-76e212df9363`.
The cache is enabled; old SQL health broadcasts and runtime signing are disabled.
The first retained observation was 17:45:46 UTC, one 1,688-byte row; member/business
reads remain denied. Hosted acceptance then exposed a missing restricted SQL
allowlist entry; the unavailable read removed the session. Hosted cache reads
were disabled without re-enabling broadcasts or changing collection. The composed
runtime regression reproduces both the first-read failure and subsequent logout.
PR #40 passed all required/security checks and merged as
`7195f7deabd6ccfca5031909509b931d8087f39f` from exact head `b84c371`.
Its three-file correction adds the missing exact SQL route and returns cache
unavailability inside the verified session lease. The composed test covers both
reads, injected failure, session retention, recovery and explicit logout.
Only the corrected staging employee runtime was deployed and matched downloaded
source; hosted cache reads were re-enabled with unrelated secrets unchanged.
Rollback and exact source/hash receipts are retained with the private evidence
below. Main quality run `41693140828` and automatic staging run `41695990704`
passed. Pages `7c357ed7-492e-49b0-9fc0-bf361bfeb852` serves exact source `7195f7d`;
rollback is `4f954aae-f030-4d14-aaf1-44402145ef3f`. Public release and retained receipt match.
Hosted employee sign-in stayed active; delivery observations advanced 11:55:44,
11:56:45 and 11:57:46 AM Mountain on November 3 without refresh. Sentry advanced
11:55:45, 11:56:57 and 11:57:58. Chrome's tab-level Network Offline mode showed
`Health: offline` and retained the prior timestamps. Restoring No throttling
automatically recovered delivery 11:59:45 and Sentry 12:00:42 without reload/MFA.
The global status remained on Overview, and its shortcut reopened Operations.
This was browser-level network emulation, not a physical network outage or a
synthetic DOM event. Original browser network settings were restored.
Private originals, configuration inverse, candidate/readback and database receipts
are retained under `%LOCALAPPDATA%/Doji/staging-backend/2026-11-03-cache`.
No production, Worker, mobile, email/push, retention or access changes were made.
Rollback disables snapshot reads/capture, restores the captured runtime/config
pair and Pages artifact separately, and retains observations; never reset tables.

## November 2 staging automatic health updates

PR #35 merged as `19edbda49862fb8edcb69d11c5928c3e5140262d` after all four required
quality jobs and GitGuardian passed on exact head `5b9250b`. Production was not
released. Main's repeated idle-expiry browser failure was reproduced as a test
race: unfinished initial reads renewed idle time after its simulated clock jump.
PR #36 (`5ebc0b8`) waits for those reads before advancing the clock; all four PR
checks passed, as did 30 local repetitions. It changes no runtime behavior.
The subsequent main run exposed request-count baselines taken before overview or
health-history reads settled. PR #37 awaits loaded data and tooltip exit without
relaxing request, authorization or accessibility assertions. Local repeated checks
passed 30 layout and 45 Operations tests. PR #37 merged as `36dcafa` after all
four checks and security passed; main quality run `41563923472` then passed.
Automatic staging run `41565454788` deployed Pages
`4c155283-e5a5-4dda-b556-76e212df9363`, verified at source
`36dcafae46bc3aff637aad9e670b2ff4822d2ded` by the public release marker and receipt.
Pages rollback is `f61229d6-c6fb-4cb7-8dd0-94598cb0d6dd`; configuration hash is
`459f643d27aa3e6bd0a2a8b2f1289a10febc7ca23234bf5dccb1e617cc16ad3a`.
Staging-only `employee_health_feed_v1` and
`admin_development_health_events_v1` overlays preserve all 445 pre-existing
public/identity/development function definitions and grants, policies, jobs and
employee realm. The private development registry now has 48 routes. Additive SQL
and its inverse passed an outer-transaction rollback rehearsal before installation.

Downloaded employee/development artifacts match the tested packages. Their provider
source digests are `84da192e9706ba0ad2dc41bb58adffc95580afdc0c3a11588b2e4d9a447e2efd`
and `7175b27c52721f46b9c397eca2c2a46db09b3362cb13c52f6cf1abec3180c5ec` respectively.
Only those two handlers changed; the collector already contained the gated sidecar.
Secret updates advanced displayed versions to employee 25, development 22 and
collector 15 without changing the collector's code. The database feed, employee
health-event policy, collector flag and development flag are enabled in staging.
All unrelated secret digests remain unchanged; email and scheduler pruning remain off.

The staging Worker schedule is `*/1 * * * *`. Version
`541f3b8b-5a70-4526-987c-a37f011c95ba`, settings, bindings and all five Durable
Objects were preserved. This enables existing monitoring, not a second challenge
clock. Supabase/Cloudflare capacity was checked; the existing Ably Standard plan
is unchanged, with owner approval for at most $5/month incremental feed usage.
Local connection and server gate are verified. With Operations visible and no
click/reload, delivery observations advanced from 16:32:10 to 16:37:52 and 16:38:49
Mountain time. Sentry refreshed at 16:37:52 and retained its bounded 60-second cache.
The first delivery/history hints published on their first attempt without push
payloads; no overdue outbox rows or lock waits were present. Ably showed two active
connections and seven channels, versus six before enabling the feed. Hosted Pages
restored the employee session and displayed the server-enabled, connected feed.
Without clicks or reloads, delivery timestamps advanced 19:25:47 → 19:26:47 →
19:27:48 Mountain time; Sentry advanced 19:25:34 → 19:26:47 → 19:27:48.
Coverage showed current backend, delivery and Sentry observations. The bounded
queue check found 20 latest health events published on their first attempt, no
push payloads, no overdue work and no lock waits. A real network-disconnection
drill remains untested; synthetic reconnection and permission tests are separate.
Connected transport alone is not freshness, and the seven unmeasured workflow
areas remain explicit gaps rather than implied healthy services.
The post-deployment Ably check showed two connections, seven channels and 171
inbound/176 outbound messages this month, consistent with the bounded feed.

Private exact originals, configuration inverses, source readbacks and database
receipts are retained at `%LOCALAPPDATA%/Doji/staging-backend/2026-11-02-health`.
Rollback: restore the empty staging schedule, disable the database/Edge feed gates,
restore the captured employee and development packages/config, then apply the
development health-event inverse before the employee feed inverse. Retain existing
outbox/audit evidence and the five namespaces; never reset staging or use production
credentials. Restore Pages separately through its release receipt. No member auth,
participation timing, rewards, push, retention policy or mobile artifact changed.

## October 31 backend monitoring and retention

Owner-approved production release followed the automatic staging daily-wake check
at 16:54:54 UTC. Existing Cloudflare/Supabase capacity was verified; no new vendor,
plan or resource class was added. Worker `129aeefe-9440-43ff-a961-8eb74a9bbafe`
preserves the gateway, all five Durable Object namespaces, bindings, schedules and
unrelated modules. Its main module SHA-256 is
`4505053a1491daee826332ff59443ad7b985781f83b5a1b97475319ae120032a`.

Only `orchestrate-doji`, `run-data-maintenance` and the separately packaged
`employee-portal-v2` health bridge were deployed. Downloaded artifacts matched
tested candidates; unrelated functions and prior secret digests were preserved.
The employee v26 source hash is
`6aa2d095cddea234301cfe52df06ce2c74f814d4c4ab41a578aa983eb7489e27`;
existing production authentication/session modules were not replaced with staging
ones. Exact-artifact checks passed: 82 Edge tests, five Worker scheduling cases,
25 employee health/SQL tests and six adapter authorization cases.

The two reviewed workflow-health overlays added five functions; all 435 prior
public/identity function definitions and grants remained identical. Observation
and scheduler-retention gates are enabled. The initial scan completed at
17:48:20 UTC, deleting 156,264 successful scheduler runs older than 30 days and
15 failed runs older than 90 days. The 15 failures were exported before deletion.
There were zero eligible old rows, zero unfinished runs and no lock waits at the
final check. Recent rows, existing jobs, holds and the next Doji time were preserved.
347 continuing batches and one successful final attempt were recorded, with no
failed maintenance attempts. Eight expired rate-limit buckets were also removed;
no media or push-endpoint removal was recorded. The single successful close
observation is the approved nonexistent-event no-op used to start maintenance,
not a real Doji or member completion. Hosted admin session restoration, connected
realtime, delivery/Sentry reads and the new backend snapshot passed.

Private originals, candidate manifests, failure exports and receipts are retained
outside Git at `%LOCALAPPDATA%/Doji/production-backend/2026-10-31` and
`2026-10-30-readiness`. Rollback disables observations/retention using the retaining
overlay inverses and restores captured Edge packages before Worker
`5d44589a-b0c0-4734-bfaf-08afccada948`; do not drop measurements/holds or recreate
Durable Objects. Restore the captured employee package independently if needed.
Rollback cannot restore deleted scheduler logs; only the archived failures have
an export. Existing guarded-media deletion was not enabled, and no challenge
timing, rewards, member auth, push, Pages or mobile release was included.

Mobile diagnostics PR #33 merged as `bf2cca9` after all four required checks in
run `41223928970` passed. This is next-build source, not an installed app update.

## October 30 admin health promotion

Owner-approved production run `41125552206` promoted the exact admin package from
staging run `41118118551`, source `ef2cc4bfaa278b4b5d2fc80f1efd5554226b67f0`, without
rebuilding it. Deployment `c21bb73d-ec04-4784-83d8-34cffb590936` passed canonical
release identity, asset/security-header, environment-binding and anonymous/CORS
checks. Rollback Pages deployment is `2a305892-e114-4844-8320-0f1e7aa650ea`.
Signed-in session restoration, connected staff realtime, plain-language health
labels and fresh production delivery/Sentry readings passed. The new Backend &
cleanup view correctly reports unavailable while its production bridge is disabled.
No record writes, SQL, Edge, shared Worker, retention, push or mobile release was
included. This is presentation acceptance, not complete platform-health coverage.

Deployment tooling came from reviewed `510a9ee` (PR #31); all four exact-head and
main quality jobs passed, including the added Worker-tooling high-severity audit.
The independently successful newer staging run `41127321420` is not the artifact
promoted here. Remaining Expo CLI/Zod findings are documented in current state.
The verified receipt is retained outside Git at
`%LOCALAPPDATA%/Doji/production-admin/2026-10-30/deployment.json` and in the production
workflow artifact. Restore only the prior Pages deployment if needed; do not roll
back shared backend state for this portal release.

## October 25 poll activation incident

Event `4ff51c34-b62c-4dd0-af70-acf799537d2c` activated without its system poll
post, so `submit_poll_vote` rolled back with `Community poll post not found`.
The scheduling INSERT trigger creates that card, but an intervening activation's
retention trigger deletes it. The activation RPC did not recreate it. Synthetic
schedule/intervening-activation/vote tests reproduced this defect before the fix.

Owner-approved repair inserted only the missing system card; five real votes and
completions were verified before the original deadline. No member vote was invented.
The permanent fix ensures the card after retention inside `activate_daily_event`.
It deployed at 17:13:43 UTC; original definition MD5
`d53835a47acdea37c588c58f05fa7ad9`, deployed
`bdbd6a8c37fb7874a682abb2fe799b88`. All grants stayed unchanged. 147 isolated
database assertions passed, including single-credit retry and exact rollback.
Source is `supabase/migrations/20261025172000_create_poll_post_at_activation.sql`;
this targeted emergency application is not evidence of a merged PR or ledger replay.

Separately approved recovery reopened the same event from 17:17:31.98228 to
17:27:31.98228 UTC (11:27:31 AM Mountain close). Seven missed participants returned
to pending; all five completed records retained their exact hash. No recorded
streak loss needed correction and no Sparks, votes or rewards were added. The
existing close alarm was rearmed with `chainNext=false` (next day's chain was already
prepared); request 167984 returned HTTP 200. Reopening invalidation was published,
and a unique delayed closing invalidation avoids the original close's dedupe key.
No additional push was sent. Synthetic tests covered recovery, retained completion
credit, single-credit retry, streak restoration, no push and refusal to reopen twice.

Private before/after definitions, fingerprint-guarded function rollback, one-row
repair SQL and synthetic acceptance receipts are retained at
`C:/Users/gfahe/AppData/Local/Temp/doji-event-correction-20261024/`, using the
`poll-activation-*-20261025` and `recovery-window-*-20261025` names. Retain successful
votes and rewards during rollback; never restore whole participant/profile rows
over subsequent submissions. No mobile rebuild or Worker rollback was required.

## October 25 alert recovery

Monitoring-only Worker version `5d44589a-b0c0-4734-bfaf-08afccada948` serves 100%.
Downloaded live source matches SHA-256
`2d494eeb736706504982b5f9b5e83ae02c6f50e763e8760a39ca0c816e9068ff`;
all settings, secret binding names and five Durable Object namespaces match the
baseline. Absent/invalid-token reads remain 401/no-store. Rollback is
`94343e0b-1447-495b-98c8-1db492864abe`, preserving the October 15 gateway fix.
No database, push, challenge timing or portal runtime changes accompanied it.

Frozen mobile source is reviewed main `c4e7c7b`, with only version overrides to
1.0.12 / Android 32 / iOS 106. Android job
`43ecd109-97f6-405e-ba44-c260b01dad78` and iOS job
`f4a73c48-ae3f-4645-8e5d-09fb3a3717fb` completed without rebuilds. Both have Sentry
source-map upload evidence; iOS also has native-symbol upload evidence. iOS
submission `345676e4-3006-4433-b857-a46cd51666e2` finished, and build 106 is available
to the existing six internal Doji Testers with acceptance instructions saved.
Android 32 was submitted as existing closed Alpha release 22 at 100% of that track;
Google shows “Changes in review” with quick checks still running. Audience and
supported devices are unchanged; native debug symbols are attached. The sole
release-validation warning is missing R8/ProGuard mapping, not a blocking error.
Public Android production and iOS App Store review were not submitted.
Expo reports $3 used from $45 included credit,
not an additional charge. Native device acceptance remains outstanding.

All four quality gates passed in run `40206501007`; PR #24 fixes only two
nondeterministic tests and merged as `1886ab0`. Its staging-only portal redeployment
was separately approved. Postmerge quality run `40208344042` passed all four gates;
staging run `40209294264` deployed `1886ab0` as
`a078ab9d-5016-4a98-83aa-0c620bb3f1bf`, with a verified configuration/package receipt.
Hosted session restoration, assigned-work listing and synthetic report detail reads
passed after deployment; no record writes were performed. Production admin was not
promoted. Private immutable source, hashes, verification receipts
and Worker rollback are retained outside Git in
`C:/Users/gfahe/AppData/Local/Temp/doji-health-release-d840f240f23643b6aefb7dccc7ff871b/`.

## October 24 Doji correction

Owner-approved replacement `dbfd5040-6b43-465d-9f23-a50e677b561f` (“Best way to wind
down?”) activated at 22:11:17 UTC with exactly 600 seconds of normal participation.
Free late access ends at `2026-10-25T06:00:00Z`; existing clients display it as
“BUY-IN OPEN,” but no Sparks are deducted. The occurrence-specific overrides cover
current-state reads, both buy-in overloads, poll/post completion cutoff, close and
push claim wording. All other occurrence paths, function owners and grants were
preserved. Sixteen isolated PostgreSQL checks passed, including guarded rollback.

The erroneous challenge `8877fcf0-8aa7-4dbc-886f-a9d9940cc8ca` is inactive. Its nine
completed participation records remain. Normal activation clears the old feed posts.
Tomorrow's event `4ff51c34-b62c-4dd0-af70-acf799537d2c` is unchanged; the replacement
alarm has `chainNext=false`. Apology fanout completed: 25 provider-accepted device
deliveries for 20 recipients, not proof of handset display.

Private tested SQL, original/patched definitions, launch receipt and fingerprint-
guarded rollback are retained outside Git at
`C:/Users/gfahe/AppData/Local/Temp/doji-event-correction-20261024/`.
Do not restore functions before the promised cutoff or relaunch the fixed event ID.
After expiry, separately review restoring the original bodies; retain participation
and receipts, and never re-enable the erroneous challenge as part of rollback.

## Retained records

- [Staging database baseline and recovery](STAGING_DATABASE_BASELINE_2026-10-14.md)

- [ACCOUNT DELETION REPAIR 2026-09-26](ACCOUNT_DELETION_REPAIR_2026-09-26.md)
- [ACCOUNT REALM SEPARATION PREPARATION 2026-09-30](ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md)
- [ADMIN ANNOUNCEMENT CONNECTED 2026-10-09](ADMIN_ANNOUNCEMENT_CONNECTED_2026-10-09.md)
- [ADMIN COMPLETION 2026-09-27](ADMIN_COMPLETION_2026-09-27.md)
- [ADMIN EDITORIAL PREPARATION 2026-09-27](ADMIN_EDITORIAL_PREPARATION_2026-09-27.md)
- [ADMIN EDITORIAL RELEASE 2026-09-27](ADMIN_EDITORIAL_RELEASE_2026-09-27.md)
- [ADMIN QUEUE CONSISTENCY 2026-10-09](ADMIN_QUEUE_CONSISTENCY_2026-10-09.md)
- [ADMIN REFERENCE IMPLEMENTATION 2026-10-09](ADMIN_REFERENCE_IMPLEMENTATION_2026-10-09.md)
- [ADMIN WORKFLOW FOUNDATION 2026-10-05](ADMIN_WORKFLOW_FOUNDATION_2026-10-05.md)
- [ALERT DIAGNOSIS 2026-09-27](ALERT_DIAGNOSIS_2026-09-27.md)
- [ANDROID 21 INCIDENT FOLLOWUP 2026-09-28](ANDROID_21_INCIDENT_FOLLOWUP_2026-09-28.md)
- [ANDROID 22 SUGGESTIONS 504 TRACE 2026-09-28](ANDROID_22_SUGGESTIONS_504_TRACE_2026-09-28.md)
- [ANDROID 26 FEED 504 INVESTIGATION 2026-10-03](ANDROID_26_FEED_504_INVESTIGATION_2026-10-03.md)
- [ANDROID 27 POST 504 INVESTIGATION 2026-10-04](ANDROID_27_POST_504_INVESTIGATION_2026-10-04.md)
- [Android diagnostic builds 25–28: consolidated evidence](ANDROID_DIAGNOSTICS.md)
- [ANDROID RECOVERY BUILD 23 2026-09-28](ANDROID_RECOVERY_BUILD_23_2026-09-28.md)
- [ANNOUNCEMENT CAMPAIGN DESIGN 2026-09-27](ANNOUNCEMENT_CAMPAIGN_DESIGN_2026-09-27.md)
- [ANNOUNCEMENT CAMPAIGN RELEASE 2026-09-27](ANNOUNCEMENT_CAMPAIGN_RELEASE_2026-09-27.md)
- [APP CODE REVIEW 2026-09-26](APP_CODE_REVIEW_2026-09-26.md)
- [BUSINESS APPLICATION FOUNDATION 2026-09-29](BUSINESS_APPLICATION_FOUNDATION_2026-09-29.md)
- [BUSINESS CLOSED HOSTING 2026-09-29](BUSINESS_CLOSED_HOSTING_2026-09-29.md)
- [BUSINESS EXISTING TEST ACCESS 2026-10-11](BUSINESS_EXISTING_TEST_ACCESS_2026-10-11.md)
- [BUSINESS LIVE RELEASE 2026-09-30](BUSINESS_LIVE_RELEASE_2026-09-30.md)
- [BUSINESS ONBOARDING IMPLEMENTATION 2026-09-29](BUSINESS_ONBOARDING_IMPLEMENTATION_2026-09-29.md)
- [BUSINESS ONBOARDING PREPARATION 2026-10-11](BUSINESS_ONBOARDING_PREPARATION_2026-10-11.md)
- [BUSINESS ONBOARDING ROLLOUT 2026-10-11](BUSINESS_ONBOARDING_ROLLOUT_2026-10-11.md)
- [BUSINESS OWNED AUTH CUTOVER 2026-10-10](BUSINESS_OWNED_AUTH_CUTOVER_2026-10-10.md)
- [BUSINESS OWNED AUTH GUARD 2026-10-10](BUSINESS_OWNED_AUTH_GUARD_2026-10-10.md)
- [BUSINESS OWNED AUTH PREPARATION 2026-10-10](BUSINESS_OWNED_AUTH_PREPARATION_2026-10-10.md)
- [BUSINESS PASSWORD FEEDBACK 2026-10-11](BUSINESS_PASSWORD_FEEDBACK_2026-10-11.md)
- [BUSINESS PASSWORD RELEASE 2026-10-11](BUSINESS_PASSWORD_RELEASE_2026-10-11.md)
- [BUSINESS PORTAL REFINEMENT 2026-09-29](BUSINESS_PORTAL_REFINEMENT_2026-09-29.md)
- [BUSINESS PRIVACY OPERATIONS 2026-09-30](BUSINESS_PRIVACY_OPERATIONS_2026-09-30.md)
- [BUSINESS RECOVERY EMAIL 2026-10-10](BUSINESS_RECOVERY_EMAIL_2026-10-10.md)
- [BUSINESS RESET RECOVERY 2026-10-10](BUSINESS_RESET_RECOVERY_2026-10-10.md)
- [CLOUDFLARE SAFETY EMAIL 2026-09-28](CLOUDFLARE_SAFETY_EMAIL_2026-09-28.md)
- [COMMUNITY IDEA RETRIAGE RELEASE 2026-09-27](COMMUNITY_IDEA_RETRIAGE_RELEASE_2026-09-27.md)
- [EDITORIAL DRAWER RELEASE 2026-09-27](EDITORIAL_DRAWER_RELEASE_2026-09-27.md)
- [EMAIL BRANDING 2026-10-11](EMAIL_BRANDING_2026-10-11.md)
- [EMPLOYEE ACCESS RELEASE 2026-09-26](EMPLOYEE_ACCESS_RELEASE_2026-09-26.md)
- [EMPLOYEE ENROLLMENT RELEASE 2026-09-26](EMPLOYEE_ENROLLMENT_RELEASE_2026-09-26.md)
- [EMPLOYEE HISTORY HEALTH PREPARATION 2026-10-09](EMPLOYEE_HISTORY_HEALTH_PREPARATION_2026-10-09.md)
- [EMPLOYEE LOGOUT RECOVERY 2026-10-13](EMPLOYEE_LOGOUT_RECOVERY_2026-10-13.md)
- [EMPLOYEE ONBOARDING REPAIR 2026-09-26](EMPLOYEE_ONBOARDING_REPAIR_2026-09-26.md)
- [EMPLOYEE RELEASE PREFLIGHT 2026-09-26](EMPLOYEE_RELEASE_PREFLIGHT_2026-09-26.md)
- [EXTERNAL TAKEDOWN INTAKE 2026-09-28](EXTERNAL_TAKEDOWN_INTAKE_2026-09-28.md)
- [IDEA SUBMISSION PRESENTATION 2026-09-27](IDEA_SUBMISSION_PRESENTATION_2026-09-27.md)
- [IOS 103 SECURITY ASSESSMENT 2026-10-03](IOS_103_SECURITY_ASSESSMENT_2026-10-03.md)
- [IOS URI SECURITY BUILD 103 2026-10-02](IOS_URI_SECURITY_BUILD_103_2026-10-02.md)
- [LOCAL HEAVY LOAD 2026-09-28](LOCAL_HEAVY_LOAD_2026-09-28.md)
- [MEMBER QUERY FIXES NEXT BUILD 2026-09-27](MEMBER_QUERY_FIXES_NEXT_BUILD_2026-09-27.md)
- [MEMBER QUERY PERFORMANCE REPAIR 2026-09-28](MEMBER_QUERY_PERFORMANCE_REPAIR_2026-09-28.md)
- [MEMBER READ AUDIT NEXT BUILD 2026-09-28](MEMBER_READ_AUDIT_NEXT_BUILD_2026-09-28.md)
- [MEMBER READ BUILDS 101 22 2026-09-28](MEMBER_READ_BUILDS_101_22_2026-09-28.md)
- [MEMBER READ RECOVERY 2026-09-28](MEMBER_READ_RECOVERY_2026-09-28.md)
- [MEMBER RELIABILITY REPAIR 2026-09-26](MEMBER_RELIABILITY_REPAIR_2026-09-26.md)
- [MEMBER TEST BUILDS 2026-09-26](MEMBER_TEST_BUILDS_2026-09-26.md)
- [MOBILE BUILDS 102 24 2026-10-02](MOBILE_BUILDS_102_24_2026-10-02.md)
- [MOBILE LOGGING RELEASE 2026-10-07](MOBILE_LOGGING_RELEASE_2026-10-07.md)
- [MOBILE QUERY BUILDS 100 21 2026-09-28](MOBILE_QUERY_BUILDS_100_21_2026-09-28.md)
- [MOBILE READ LIFECYCLE PREPARATION 2026-10-12](MOBILE_READ_LIFECYCLE_PREPARATION_2026-10-12.md)
- [MOBILE RECOVERY BUILDS 2026-10-12](MOBILE_RECOVERY_BUILDS_2026-10-12.md)
- [MODERATION MEDIA REPAIR 2026-09-28](MODERATION_MEDIA_REPAIR_2026-09-28.md)
- [NEXT MOBILE BUILD 2026-10-08](NEXT_MOBILE_BUILD_2026-10-08.md)
- [NOTIFICATION REPAIR 2026-09-26](NOTIFICATION_REPAIR_2026-09-26.md)
- [PERFORMANCE INVESTIGATION 2026-09-27](PERFORMANCE_INVESTIGATION_2026-09-27.md)
- [PERFORMANCE REPAIR 2026-09-28](PERFORMANCE_REPAIR_2026-09-28.md)
- [PERFORMANCE REPAIR 2026-10-02](PERFORMANCE_REPAIR_2026-10-02.md)
- [PLATFORM OPERATIONS HEALTH 2026-10-06](PLATFORM_OPERATIONS_HEALTH_2026-10-06.md)
- [POLL RESERVED OTHER RELEASE 2026-10-05](POLL_RESERVED_OTHER_RELEASE_2026-10-05.md)
- [PORTAL AUDIT 2026-09-25](PORTAL_AUDIT_2026-09-25.md)
- [PORTAL AVATAR EVIDENCE PREPARATION 2026-09-27](PORTAL_AVATAR_EVIDENCE_PREPARATION_2026-09-27.md)
- [PORTAL CASE READS PREPARATION 2026-09-27](PORTAL_CASE_READS_PREPARATION_2026-09-27.md)
- [PORTAL CONSISTENCY 2026-09-29](PORTAL_CONSISTENCY_2026-09-29.md)
- [PORTAL HEALTH REPAIR 2026-09-26](PORTAL_HEALTH_REPAIR_2026-09-26.md)
- [PORTAL ISOLATION RELEASE 2026-09-25](PORTAL_ISOLATION_RELEASE_2026-09-25.md)
- [PORTAL TRIAGE RELEASE 2026-09-27](PORTAL_TRIAGE_RELEASE_2026-09-27.md)
- [PORTAL TRIAGE REPAIR 2026-09-27](PORTAL_TRIAGE_REPAIR_2026-09-27.md)
- [PORTAL WORKFLOW AUDIT 2026-09-27](PORTAL_WORKFLOW_AUDIT_2026-09-27.md)
- [PRODUCTION INCIDENT INVESTIGATION 2026-09-13](PRODUCTION_INCIDENT_INVESTIGATION_2026-09-13.md)
- [PUSH REGISTRATION RELEASE 2026-09-26](PUSH_REGISTRATION_RELEASE_2026-09-26.md)
- [REACT PUBLIC BUSINESS MIGRATION 2026-10-09](REACT_PUBLIC_BUSINESS_MIGRATION_2026-10-09.md)
- [RELIABILITY DIAGNOSIS 2026-09-26](RELIABILITY_DIAGNOSIS_2026-09-26.md)
- [REPOSITORY CLEANUP AUDIT 2026-10-05](REPOSITORY_CLEANUP_AUDIT_2026-10-05.md)
- [REPOSITORY HANDOFF AUDIT 2026-10-12](REPOSITORY_HANDOFF_AUDIT_2026-10-12.md)
- [SAFETY LAUNCH 2026-09-29](SAFETY_LAUNCH_2026-09-29.md)
- [SAFETY PORTAL UI REPAIR 2026-09-29](SAFETY_PORTAL_UI_REPAIR_2026-09-29.md)
- [WEB REACT MIGRATION 2026-10-08](WEB_REACT_MIGRATION_2026-10-08.md)
