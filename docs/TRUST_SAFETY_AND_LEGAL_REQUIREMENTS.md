# Doji trust, safety, and legal-alignment requirements

Status: approved product requirements; implementation and counsel review pending

Last updated: September 18, 2026

This document defines the required public policy, product, data, and operator
contracts for moderating profile photos and other user-generated content (UGC).
It is an implementation checklist, not a representation that every item is live
and not a substitute for advice from qualified counsel.

The existing public Terms of Use, Privacy Policy, Community Guidelines, Child
Safety Standards, Support page, and in-app legal documents remain the current
published policy until a versioned update is reviewed, deployed, and—where
required—accepted again by users.

## Governing principles

- Remove or quarantine prohibited content immediately; decide the account-level
  consequence separately based on severity, intent, and history.
- A routine first violation normally removes the content and produces a warning;
  it does not automatically erase the entire account.
- Serious, malicious, repeated, or apparently illegal conduct can justify an
  immediate suspension or permanent ban.
- Profile photos are persistent identity content. They do not inherit the daily
  feed's 24-hour visibility or deletion lifecycle.
- A block is a personal safety control. A report is a moderation request. Users
  may use either or both, and one must not silently substitute for the other.
- Automated screening may assist but must not be the sole authority for ambiguous
  permanent bans. A human reviews uncertain and appealed decisions.
- Do not ask a reporter to email, download, or forward suspected child sexual
  abuse material (CSAM) or other illegal imagery.
- Legal/safety preservation is narrow, access-controlled, and distinct from
  ordinary product retention. Do not promise immediate destruction of evidence
  when law requires preservation.

## Enforcement ladder

| Level | Examples | Content action | Account action | Required follow-up |
| --- | --- | --- | --- | --- |
| No violation | Allowed personal photo or a classifier false positive | Publish or restore | None | Record reversal if appealed |
| Level 1: ordinary violation | Suggestive but non-explicit image, profanity in an avatar, spam, irrelevant commercial image, low-risk copyright complaint | Immediately hide/remove the image and restore the default avatar | Warning and policy strike; require a compliant replacement | Give a reason and an appeal path; repeated Level 1 violations escalate |
| Level 2: serious violation | Explicit adult sexual content, graphic violence, hateful imagery, targeted harassment, malicious impersonation, or deliberate evasion | Immediately hide/remove and block re-publication while reviewed | Temporarily suspend or restrict the account; a confirmed serious or repeated violation may become permanent | Human review, documented decision, user notice, and appeal path unless notice would create a safety/legal risk |
| Level 3: emergency or apparently illegal | Suspected CSAM or child exploitation, nonconsensual intimate imagery, credible threat, trafficking/exploitation, or other content requiring legal escalation | Immediately disable public access and quarantine through the restricted safety workflow | Immediately suspend access; permanently ban when confirmed or otherwise warranted | Follow the incident playbook, preservation rules, reporting obligations, and lawful-request process; do not handle as an ordinary deletion |

Exact suspension durations and strike-expiration rules require an approved policy
decision and counsel review before launch. Ban evasion, coordinated abuse, and a
pattern across content types count as aggravating history.

## Profile-photo product and backend requirements

### Upload and publication

1. Upload a candidate avatar to a private, user-scoped staging location.
2. Run automated safety checks appropriate to the content Doji hosts, including
   sexual/nudity, violence, hateful imagery, and known-illegal-content safeguards.
3. Publish the avatar reference atomically only after it passes. An uncertain
   result remains private and enters the bounded moderation queue.
4. The prior approved avatar stays visible while a replacement is pending; a
   first-time profile may use the generated default avatar.
5. The server, not a client flag, owns review status, publication eligibility,
   strikes, restrictions, suspensions, and bans.
6. A retry uses the same stable moderation/upload command and cannot create
   multiple public objects or duplicate cases.

### Reporting and immediate safety

- Every member profile must offer distinct actions to report the profile photo,
  report the account, and block the account.
- Report categories must include sexual content, child safety, nonconsensual
  intimate imagery, harassment/hate, violence/threat, impersonation, spam/scam,
  intellectual property, and another reason.
- A valid removal action atomically replaces the public avatar with the default,
  revokes access to the removed object, records the decision, and emits targeted
  profile invalidation so every visible avatar reconciles promptly.
- Removed content must not remain reachable through an old public URL or a newly
  signed private URL. Native caches must be invalidated through a changed media
  identity/version without exposing the removed bytes.
- Known prohibited media may be protected against exact re-upload with a
  privacy-conscious hash/fingerprint. Hashes are safety records, not public data.

### Review, notices, and appeals

- Moderators receive the reporter, reported account, exact evidence reference,
  category, timestamps, prior enforcement history, automated signal, and current
  visibility state through an admin-only bounded snapshot.
- Every decision records the policy category, reviewer or automated stage,
  timestamps, action, reason code, and any safety/legal hold.
- The affected user receives a plain-language notice explaining what was removed,
  the account consequence, and how to appeal, except when disclosure would create
  a safety risk or conflict with law.
- An appeal must route to a reviewer who can restore the image, remove a strike,
  or reverse an account action. Restoration must use the same atomic publication
  and profile-invalidation path.

## Website requirements

### Add a public Safety and Removal Center

Create a clearly linked page available without signing in. Link it from the home
page, every website footer, Support, Community Guidelines, Child Safety Standards,
Privacy Policy, and Terms of Use. The page must:

- explain how to report ordinary abuse, child-safety concerns, imminent threats,
  impersonation, privacy violations, copyright claims, and nonconsensual intimate
  imagery;
- provide a dedicated TAKE IT DOWN request form that is usable by a person without
  a Doji account;
- clearly state that the requester must not upload or email suspected CSAM;
- provide emergency guidance without suggesting that Doji replaces emergency
  services or law enforcement;
- explain what information is needed, what happens next, and how to appeal or
  request status;
- issue a case/reference number and a status/receipt message for every submitted
  removal request;
- publish a monitored safety contact and the legal entity/contact information that
  counsel confirms must be public.

The hosted website is the primary public intake and operator workspace. In-app
reports and public web forms create the same server-owned case record. They may send
an email notification to the designated Doji operator, but the inbox is not the case
system and must not be the only copy of the request, evidence, status, deadline, or
decision. Email alerts contain a case number and a secure link to the authenticated
operator view; they must not attach reported private or illegal media.

The operator view must require strong authentication and provide bounded queues for
ordinary moderation, appeals, TAKE IT DOWN requests, and restricted urgent safety
cases. It must show deadlines, current content visibility, actions already taken,
case history, and the next required step without exposing evidence through an email
or public URL. New requests notify the designated operator immediately, and urgent
categories use a distinct escalation signal rather than relying on periodic inbox
checking.

The TAKE IT DOWN notice must be clear and conspicuous and explain that Doji will
remove a qualifying nonconsensual intimate image—and make reasonable efforts to
remove known identical copies—within 48 hours of a valid request. The workflow
must cover real and digitally forged intimate images and cannot be limited to
signed-in users.

### Add a copyright/DMCA page

Before relying on the U.S. DMCA safe harbor, counsel should confirm the operating
entity, register a designated agent with the U.S. Copyright Office, publish the
same agent contact details on the website, and define compliant notice,
counter-notice, repeat-infringer, and restoration procedures. Do not publish a
placeholder agent or address that has not been registered.

### Update existing website pages

- **Community Guidelines:** Add the enforcement ladder, make profile photos
  explicit, explain repeat escalation and ban evasion, and link to appeals and
  the Safety and Removal Center.
- **Child Safety Standards:** Preserve the instruction not to forward suspected
  CSAM; add the restricted escalation path, designated point of contact, and
  counsel-approved reporting/preservation language.
- **Support:** Add prominent routes for urgent safety, TAKE IT DOWN, appeals,
  copyright, and ordinary technical support rather than sending every issue to a
  general mailbox.
- **Delete specific data:** Explain that replacing/removing a profile photo removes
  ordinary product access but limited safety, fraud, legal, or backup retention
  may apply. Link to the separate safety-removal paths.
- **Home page and footer:** Add clear Community, Safety/Removal, Child Safety,
  Privacy, Terms, and Support links.

## Terms of Use update requirements

The website Terms and `lib/legalDocuments.ts` must remain substantively aligned.
The next counsel-reviewed version should:

- incorporate the Community Guidelines by reference and explicitly apply them to
  avatars/profile information as well as posts and comments;
- expressly prohibit CSAM/child exploitation, nonconsensual intimate imagery and
  digital forgeries, sexual exploitation, credible threats, hateful content,
  impersonation, ban evasion, repeat infringement, and attempts to re-upload
  removed media;
- explain that candidate uploads may be automatically screened, held from public
  display, and reviewed by a person;
- authorize Doji to hide, remove, hash for abuse prevention, restrict, suspend, or
  terminate when proportionate to the violation, risk, and history;
- distinguish ordinary first-offense content removal from serious/repeated conduct
  that can trigger immediate suspension or permanent termination;
- describe the availability and limits of appeals;
- preserve Doji's ability to cooperate with lawful requests and satisfy mandatory
  reporting/preservation duties;
- include a repeat-infringer rule and the counsel-approved DMCA process; and
- retain only the content license needed to operate, secure, moderate, investigate,
  and meet legal obligations, ending subject to the disclosed retention exceptions.

A material Terms change needs a new version/effective date and an explicit decision
about whether existing users must reaccept it. Do not silently change the in-app
copy while leaving the website on the older policy.

## Privacy Policy update requirements

The website policy and `lib/legalDocuments.ts` must disclose, in plain language:

- collection and processing of candidate/removed profile images, content safety
  classifications, perceptual or cryptographic hashes, report details, enforcement
  history, appeals, and moderator audit records;
- the purposes: pre-publication safety screening, report investigation, duplicate
  detection, ban-evasion prevention, child safety, legal compliance, and appeals;
- whether any external moderation/classification vendor receives content, including
  its role and retention. Update the service-provider list before enabling one;
- who may receive safety information, including NCMEC, law enforcement, courts,
  regulators, and other recipients required or permitted by law;
- separate retention rules for active avatars, replaced avatars, rejected staging
  uploads, ordinary moderation evidence, account strikes, hashes, appeals, backups,
  legal holds, and CyberTipline-related preservation;
- that an account/content deletion request may not erase a narrowly retained legal,
  fraud-prevention, or safety record immediately;
- safeguards and restricted access around sensitive moderation evidence; and
- user choices to replace/remove an avatar, report content, appeal enforcement,
  request access/correction/deletion, or submit a removal request without an account.

Do not publish a precise retention duration until the database/storage cleanup jobs,
backup behavior, evidence holds, and operator playbooks actually enforce it.

## Safety operations and legal-readiness requirements

- Maintain one monitored moderation queue and an urgent restricted safety queue.
- Keep the existing internal target to act on valid general objectionable-content
  reports within 24 hours. Treat 48 hours as the legal outside limit for a valid
  TAKE IT DOWN request, not as permission to leave clearly prohibited content live.
- Provide on-call escalation for child safety and imminent threats; ordinary support
  staff must not download or redistribute suspected illegal media.
- Register and maintain the appropriate NCMEC electronic-service-provider process,
  with counsel-approved CyberTipline, preservation, and law-enforcement playbooks.
- Define who may place and release a legal/safety hold and audit every access to the
  underlying evidence.
- Use least-privilege storage. Moderation evidence must not be exposed through normal
  feed/profile reads or general support tooling.
- Measure report age, time to hide, time to final decision, overdue cases, appeal
  outcomes, re-upload attempts, and false-positive rates without placing raw content
  or secrets in telemetry.
- Run tabletop exercises for CSAM, nonconsensual intimate imagery, imminent threat,
  account compromise, and mistaken removal before claiming operational readiness.

## Visibility while a report is pending

Doji must not use a single blanket rule where any one report globally removes any
post. That would let a malicious user censor another person's content. The atomic
report command applies the following server-owned policy and records why it acted:

- The reporter stops seeing the reported content immediately. This is local to that
  reporter and does not require a moderation decision.
- A report alone does not silently block the reported account or end a friendship;
  the reporter may separately choose Block for immediate account-wide separation.
- A report alleging child exploitation/CSAM, nonconsensual intimate imagery, a
  credible imminent threat, explicit sexual imagery, or another approved emergency
  category immediately quarantines the content from every normal user pending the
  restricted review. The underlying evidence remains available only to the authorized
  safety workflow.
- A reported profile photo in an image-based safety category is conservatively
  replaced with the default avatar pending review because it is persistent identity
  content shown across the entire app.
- Lower-severity reports such as spam, ordinary profanity, or a contextual dispute
  stay visible to other authorized users pending prompt review unless automated
  screening, a trusted safety signal, or a bounded threshold of independent reports
  triggers quarantine.
- Any multi-report threshold counts distinct eligible accounts, is rate-limited and
  abuse-resistant, and cannot be satisfied by duplicate reports, blocked/banned
  accounts, or coordinated throwaway accounts without an additional trust signal.
- A moderator can confirm removal, restore the content, change the policy category,
  warn/restrict/suspend/ban the account, or escalate the case. Restoration must remove
  the pending-review marker and reconcile every affected cache through the existing
  targeted event contract.
- The uploader receives a neutral “under review” state when disclosure is safe. Doji
  does not reveal the reporter's identity.

The report, visibility transition, moderation case, audit row, and identifier-only
realtime events must commit atomically. A client must not implement quarantine by
issuing a report and a separate content update. Reconnect and foreground
reconciliation include report-owned visibility changes so stale cached media cannot
remain visible after quarantine.

## Retention contract to implement

The 24-hour Doji feed reset controls active-feed visibility; it does not by itself
delete database rows or stored media. Retention must be explicit and independently
verified.

- Active approved avatar: retain while selected and the account is active.
- Replaced/voluntarily removed avatar: revoke product access promptly and queue the
  physical object for deletion after the approved short backup/safety window.
- Rejected ordinary staging upload: delete promptly after the appeal window unless
  it is part of an active report, fraud investigation, or legal hold.
- Removed ordinary violating avatar: revoke public access immediately; retain only
  the minimum evidence and derived anti-abuse record allowed by the approved schedule.
- Apparently illegal content: quarantine and follow the specialized reporting and
  preservation playbook; never use the ordinary deletion timer blindly.
- Daily post media: define and implement the separate post/media retention policy.
  A feed becoming inactive must not be described publicly as deletion until the
  object, derivatives, caches, backups, and related metadata follow that contract.

## Rollout order

Implementation checkpoint (2026-09-24): the production contract now has reversible
post/comment/poll-response moderation state, classified and audited portal decisions,
routine warnings and member notices, Account Status, one server-owned appeal per
eligible decision, independent appeal review with restoration, and quarantine routing
to a restricted queue. The older hard-delete and mobile-admin decision paths fail
closed. This is an engineering foundation, not legal-program completion: the staged
avatar pipeline, restricted evidence vault, account-restriction/ban criteria, public
intake/status center, legal holds/retention jobs, trained escalation coverage, policy
publication, counsel approval, and scenario testing below are still required.

1. Obtain counsel review of the operating entity, launch jurisdictions, Terms,
   Privacy Policy, Community Guidelines, TAKE IT DOWN process, DMCA agent/process,
   child-safety reporting, evidence preservation, retention schedule, and appeals.
2. Build the restricted moderation data model, staged-avatar pipeline, atomic
   enforcement commands, reporting categories, duplicate protection, audit trail,
   and cleanup/hold jobs.
3. Build in-app profile-photo reporting, enforcement notices, and appeals.
4. Build and test the public Safety and Removal Center, unauthenticated TAKE IT DOWN
   intake, case receipts/status, and copyright route.
5. Train operators and complete safety tabletop tests.
6. Deploy the website and matching in-app legal text with one effective date and
   policy version; require renewed acceptance if counsel determines it is material.
7. Verify on physical iOS/Android devices and with non-account web requests before
   marking the requirement complete.

## External authority checklist

- Apple App Review Guideline 1.2: filtering objectionable UGC, reporting, timely
  response, blocking, and published contact information.
- Google Play UGC policy: robust ongoing moderation, accepted terms, in-app reporting
  and blocking, and appropriate action on content/users.
- 18 U.S.C. 2258A: counsel-reviewed provider reporting and preservation obligations
  for apparent child sexual exploitation material.
- FTC TAKE IT DOWN guidance: a clear and conspicuous, non-account-gated request
  process; removal of qualifying content and known identical copies within 48 hours;
  and practical case tracking.
- U.S. Copyright Office Section 512 guidance: registered/published designated agent,
  notice-and-takedown, counter-notice, and repeat-infringer procedures when claiming
  the applicable safe harbor.

Primary references:

- https://developer.apple.com/app-store/review/guidelines/#user-generated-content
- https://support.google.com/googleplay/android-developer/answer/9876937
- https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section2258A
- https://www.ftc.gov/business-guidance/resources/complying-take-it-down-act
- https://www.copyright.gov/512/

## Completion criteria

This requirement is complete only when:

- the staged-avatar and enforcement paths are deployed and migration-tested;
- public and in-app policy text match the implemented behavior and effective date;
- reporting works for signed-in users and required web paths work without an account;
- an avatar removal immediately replaces the image everywhere without leaving an
  accessible URL or cache leak;
- ordinary, serious, repeated, appealed, TAKE IT DOWN, and child-safety scenarios
  pass documented end-to-end tests;
- retention/deletion and legal-hold jobs have verified readbacks; and
- counsel and the designated operational owner approve the launch checklist.
