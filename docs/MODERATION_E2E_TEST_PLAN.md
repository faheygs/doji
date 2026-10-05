# Moderation end-to-end release test plan

Last verified against the production database contract: September 25, 2026.

This plan uses harmless placeholder posts only. Never create, upload, download, or
forward real illegal, exploitative, intimate, or threatening material for testing.

## Preconditions

- iOS TestFlight build containing the current reporting UI and cache reconciliation.
- Account A: super admin, MFA verified in the admin portal.
- Account B: ordinary test member with email and account notifications enabled.
- The accounts can see the same active Doji. Do not block either account until a
  test explicitly checks the separate Block action.
- Use a unique harmless post for each scenario so one enforcement path cannot
  change another scenario's evidence.

For every portal decision, enter a specific internal rationale and a plain-language
  member notice. Do not include reporter identity in the member notice.

## 1. Emergency allegation and automatic quarantine

1. Account B creates a harmless placeholder post.
2. Account A reports the post as **Violence, hate or exploitation → Credible threat**.
3. Do not block Account B.

Expected immediately:

- The report appears once in the portal's restricted queue with the exact category
  and `Credible threat` concern.
- The post disappears for Account A without waiting for a moderator.
- The post is globally unavailable because an approved emergency leaf is
  atomically quarantined with the report.
- Account B receives no decision notice, push, or email while the case is only
  quarantined.

Choose **No violation** in restricted review.

Expected after decision:

- The report moves to resolved history and records the decision and rationale once.
- The harmless post is restored.
- No account warning or restriction appears for Account B.

## 2. Ordinary report, manual escalation, and final serious enforcement

1. Account B creates a new harmless placeholder post.
2. Account A reports it as **Nudity or sexual activity → Adult nudity or sexual activity**.

Expected before moderation:

- Account A no longer sees the exact post.
- Account B and another otherwise-authorized viewer still see it.
- The portal routes it to the ordinary moderation queue; it is not falsely marked
  as a confirmed violation.

Choose **Quarantine & escalate**.

Expected:

- The post becomes unavailable to normal viewers.
- The case remains open in restricted review.
- Account B receives no final-decision notice yet.

In restricted review choose **Confirm violation**, Level 2, an appropriate policy,
and a temporary restriction.

Expected:

- The report resolves and the post remains removed.
- Account Status shows the content outcome separately from the account restriction.
- Account B receives one in-app notice, one account-category push when enabled,
  and one transactional email to the verified address.
- The portal history contains meaningful workflow events, not repeated evidence-view
  events, and the resolved case remains available through the resolved filter.

## 3. Appeal and restoration

1. From Account B's Account Status, appeal the decision from test 2 once.
2. Open the appeal in the portal as the super admin.
3. Reverse the decision with a fresh rationale. The portal must visibly mark the
  super-admin override because the same operator made the original decision.

Expected:

- A second appeal submission is rejected or unavailable.
- The appeal resolves once and is fully audited.
- The exact content is restored, the warning/restriction is reversed, and Account B
  regains the corresponding access.

## 4. Emergency child-safety routing without prohibited test material

1. Use a harmless text-only placeholder post clearly labeled as test content.
2. Report it as **Nudity or sexual activity → Sexual content involving a child**.

Expected before final review:

- Automatic global quarantine and restricted routing occur atomically.
- No normal operator can expose the evidence outside the restricted case view.
- No subject push or email is sent for quarantine alone.

Finalize with Level 3 and an explicit account outcome.

Expected:

- Content and account outcomes are recorded separately.
- Account B receives the final in-app notice and, when enabled, one push and one
  email. No message contains reporter identity or internal evidence.
- A permanent suspension preserves reversible content state rather than deleting
  moderation evidence.

## 5. Privacy/doxxing report

1. Report a harmless placeholder as **Privacy violation → Personal information or doxxing**.
2. Confirm exact taxonomy, ordinary queue routing, reporter-only hiding, and portal
  context.
3. Resolve once as **No violation** and confirm the content returns for the reporter.
4. Repeat with a new placeholder and exercise manual escalation and final removal.

## 6. Intellectual-property report

1. Report a harmless placeholder as **Intellectual property → Copyright infringement**.
2. Confirm the in-app allegation, portal routing, evidence, decision, notice, appeal,
  and archive paths behave like other ordinary reports.

This validates Doji's signed-in product moderation flow only. It is not a legal DMCA
notice-and-counter-notice test and must not be represented as one.

## 7. Retry, realtime, and duplicate protection

For a new report:

- Tap the final report choice rapidly and retry after briefly losing connectivity.
- Confirm one report/case is created. The same command ID must replay the stored result.
- Confirm reporter-side removal is immediate and survives refresh, foregrounding,
  reconnect, and signing out/back in.
- Confirm a post, comment, and custom poll response each disappear only from the
  reporting member while an ordinary report is pending.
- Confirm critical quarantine reconciles for other connected viewers without push
  delivery being required for correctness.

## 8. Role boundaries

### Super admin

- Can triage and decide ordinary and restricted cases, choose account outcomes,
  reopen/reclose resolved cases, and use the explicitly audited appeal override.

### Ordinary admin

Requires a separate, intentionally provisioned staff identity:

- Can perform only granted ordinary moderation actions after MFA.
- Cannot read or decide restricted safety/legal evidence without `legal.read`.
- Cannot review their own prior appeal decision.
- Cannot gain super-admin authority through the client or portal.

## Current release boundary

The in-app moderation paths above are implemented. Two broader launch programs are
not completed by this app/portal test plan:

- The public, unauthenticated Safety and Removal Center, TAKE IT DOWN intake/status,
  and counsel-approved DMCA notice/counter-notice workflow.
- Physical role-boundary testing by a second administrator, which requires a real
  staff identity with deliberately assigned permissions.

Neither should be marked passed until its prerequisite exists and the full external
workflow has been exercised.
