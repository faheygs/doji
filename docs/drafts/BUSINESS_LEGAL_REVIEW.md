# Business Launch Legal Review

## September 30 publication update

The owner approved the reviewed baseline and then explicitly confirmed the exact
US-only, ten-account/thirty-email launch. It is now published as
`business-terms-20260930-v1` and `business-privacy-20260930-v1` on the separate
business host. The build removes editorial checklist paragraphs and supplies
verified operator, US scope, Oregon primary database, provider/support inventory,
privacy appeal contact and tracking facts; it does not promise US-only provider
processing or adopt the proposed fixed 30/90/180-day deletion periods below.
The written criteria-based procedure is in ../BUSINESS_PRIVACY_OPERATIONS_2026-09-30.md.
The exact final content and rollout evidence are in ../BUSINESS_LIVE_RELEASE_2026-09-30.md.
The original drafts and historical decisions remain below for traceability. They
are not the current deployment state. Owner approval/research are not independent
legal certification. Actual owner signup/email/application qualification is pending.

Owner requested drafts for review and confirmed business.dojipro.com on September 29, 2026. Research and drafting were updated September 30, 2026 after the owner asked for a researched recommendation rather than a legal checklist to solve alone. The owner subsequently approved using the reviewed drafts and moving forward. Owner content approval is now recorded below; the documents remain unpublished and no runtime legal version has been enabled. Drafting assistance and owner approval are not an independent legal opinion. Qualified legal review remains recommended for the actual operator and markets; technical requirements must still match the published statements.

## Owner approval and next implementation scope

On September 30, 2026 the owner said: “They look ok to me, lets use them and move forward.” Use these as the approved drafting baseline; do not ask for the same wording approval again. The reviewed files were left unchanged in this approval turn. SHA-256 at approval:

- BUSINESS_TERMS_REVIEW.md: `10819b225b99e21086eea6f5f7450b7eaa957ddaf5340aa868bade7cefba3d28`.
- BUSINESS_PRIVACY_REVIEW.md: `b3091a9f37f0a618d84742793db81d6dac05c17b22ce8dfb4ae03cca2903041c`.

Approval does not turn the visible review requirements into completed controls or establish an effective date. Fill factual gaps and remove editorial review notes only after verification. Return substantive changes in operator rights, data uses, retention or country scope to the owner rather than silently expanding the approved baseline.

The owner approved the following local implementation scope on September 30 with “approve.” This changes the uninstalled shared-backend candidate, not production or public signup:

1. Prepare business-only account-stage terms acceptance and privacy-notice acknowledgment with exact version records. Preserve application-specific acceptance. Reject missing or stale versions without affecting member signup or sign-in.
2. Stop requiring a full street address at initial business application, adjusting only the business UI and business validation contract. Preserve already-submitted evidence; do not migrate or erase real records.
3. Prepare restricted, audited business privacy-request handling for access, correction, closure and justified erasure, including documented retention/hold and provider-copy procedures. Use scoped atomic commands for database changes and a recoverable orchestration if Auth/provider work must cross systems; never claim cross-provider atomicity. Final retention periods and launch markets remain decisions to settle, not implicit approval of the earlier suggestions.

Member impact and isolation: no intended changes to member features, profiles, sessions, queries, realtime or push. Supabase Auth and Postgres are shared infrastructure, so there is still deployment and resource risk. Use business account-type checks, dedicated private tables/contracts and existing restricted employee authorization. No global logout, general Auth configuration changes, member account deletion, shared Worker change, campaign enablement or new service/cost.

Qualification: first read current context/architecture in full, then test locally with synthetic business records. Cover anonymous/member/other-business denial, employee permission and MFA requirements, stale/duplicate/concurrent requests, retained legal holds, exact account targeting, late provider failures and recoverable retries. Compare existing member function/grant definitions and verify member signup/login/session survival. Re-run existing business Auth, SQL, concurrency and browser suites. Record exact artifacts and limitations.

Deployment boundary: preparation and local testing only in this proposed step. Production database/Auth installation and public signup require a later exact release review with fresh included-allowance checks and explicit deployment approval. Keep the current closed static site, business realtime, campaigns and billing unchanged. Rollback for a later release must first disable the new business entry points and revoke only new business commands, retain consent/audit evidence, and preserve member access. Deleted data cannot be restored by a feature rollback; any erasure execution needs its own verified target and authorized request.

No shared code or database changes were made in the approval-record turn. Existing release evidence identifies support/privacy routing through Cloudflare to the owner's Gmail inbox (../EMPLOYEE_ENROLLMENT_RELEASE_2026-09-26.md, Owner work-email update). This establishes the documented path, not current access, retention, security settings or mailbox fulfillment testing. A fresh CLI project-metadata read did not verify the database region; the region remains unknown rather than assumed to be US-hosted.

After the subsequent “approve,” the local implementation and synthetic qualification were completed as recorded in ../BUSINESS_ONBOARDING_IMPLEMENTATION_2026-09-29.md (September 30 section). Account agreement recording, initial address minimization and restricted privacy RPC/orchestration contracts are now prepared, not deployed. The two draft texts were aligned with those technical changes; the hashes above intentionally remain the historical owner-approved baseline, not hashes of the revised files. No effective date, production legal version or public signup was enabled. Auth contact-detail correction, lost-MFA recovery and a restricted privacy operator UI are not covered by the application-draft correction command.

The live business site is a closed static holding page, not the onboarding service described by the drafts. It does not accept accounts or applications. Hosting can still process network requests and security logs; no signup is not the same as no personal-information processing. The release record is ../BUSINESS_CLOSED_HOSTING_2026-09-29.md. This review changes documents only, not production configuration or data.

## Review documents

- [Business terms draft](BUSINESS_TERMS_REVIEW.md): representative authority, application review, account security, limited permission to process submissions, no automatic campaign or payment commitment.
- [Business privacy notice draft](BUSINESS_PRIVACY_REVIEW.md): actual application fields, authentication, staff review, email and bot protection, with unresolved retention, rights and location requirements visible. Editorial cleanup is not publication approval.

The owner confirmed personal operation from Eagle Mountain, Utah, then supplied the name Gavin Fahey and requested “just Eagle mountain.” Both drafts now identify Gavin Fahey as the operator with city-level location only: Eagle Mountain, Utah, United States. No street or mailing address is authorized for publication. Do not infer an LLC, incorporation, registered trade name, governing-law choice or worldwide privacy-law applicability from this location. Existing member terms are not assumed to cover businesses. The existing published support address is support@dojipro.com; confirm privacy responsibility and mailbox handling before launch. Counsel should assess contact-disclosure requirements for the actual launch scope; this city-only preference is not a conclusion that every applicable requirement is satisfied. If an additional address is needed, return to the owner for an approved contact option rather than exposing a residential address.

## Decisions and release requirements

| Item | Current evidence | Required before public signup |
| --- | --- | --- |
| Operator and markets | Gavin Fahey personally operates Doji from Eagle Mountain, Utah, United States; city-only public location authorized | Confirm launch markets and applicable contact disclosures; counsel determines applicable law; do not publish a street address without approval |
| Legal acceptance | Application RPC stores exact versions and acceptance time per submission | Final stable URLs and versioned texts; do not put draft IDs into live settings |
| Signup before application | Local candidate now records exact account agreement versions atomically with Auth creation; separate application acceptance retained | Publish final versioned documents and qualify the exact hosted release; no live consent record claimed |
| Data minimization | Local initial form no longer collects street address; server no longer requires it; historical snapshots preserved | Qualify and release the exact business-only candidate |
| Retention and erasure | Local audited hold, closure and one-time erasure workflow tested; primary cleanup distinguished from provider copies | Approve category-specific periods, provider/backup handling and production release; no automatic retention schedule enabled |
| Privacy requests | Restricted local access/correction/closure/erasure RPCs tested; support channel remains intake | Assign coverage, verification and applicable deadlines; qualify hosted fulfillment and restricted operator integration |
| Lost MFA | Password recovery preserves enrolled factors | Approve safe recovery procedure; never silently remove MFA or transfer ownership from an email request |
| Providers and transfers | Candidate uses Supabase, Cloudflare and Resend | Verify deployed regions, provider agreements, support mailbox, logs and actual scripts; assess transfer requirements |
| Future paid features | Campaign publishing, billing and business realtime disabled | Separate commercial agreement and explicit enablement review; not covered by this launch |

## Research findings and drafting choices

This is a focused launch review, not a determination of every law that may apply. Use the law effective at launch; the Utah source contains both current and January 2027 provisions. Recheck before a later launch.

### Privacy obligations are not determined by the scale target

Utah's current UCPA requires the Utah connection, at least $25 million annual revenue, and either 100,000 consumers' data or the alternative 25,000-consumer and majority-data-sales test. Its consumer definition excludes individuals acting in employment or commercial contexts. Actual revenue, processing and context matter; a target of 100,000 members does not itself establish applicability or exemption. Source: [Utah Code 13-61-101 and 102, current provisions](https://le.utah.gov/xcode/Title13/Chapter61/C13-61-P1_2022050420231231.pdf).

Do not generalize Utah's commercial-context exclusion. California's regulator confirms its temporary B2B exemption expired; CCPA coverage still depends on the business meeting the applicable definition. Separate website-notice requirements may also matter. Source: [California Privacy Protection Agency FAQ](https://cppa.ca.gov/faq) and [California Business and Professions Code 22575](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22575.). No conclusion that all or none of these laws applies to Doji has been made.

Recommendation: settle the initial country scope before opening registration. A US-first launch reduces international review work but does not eliminate state-law analysis. This is a recommendation, not an implemented country restriction; the current form accepts two-letter country codes. International availability requires a separate assessment of applicable notices, processing bases, contact/representation requirements and transfers. Do not claim worldwide compliance from a conditional rights paragraph.

### Collect less and make retention operational

The FTC recommends mapping information, limiting unnecessary collection and establishing retention/disposal practices. It does not prescribe our proposed 30/90/180-day periods. Source: [FTC guide to protecting personal information](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business).

Research recommendation: remove the mandatory full street address from the initial application unless a documented review need justifies it. Any later contractual or tax need should be assessed separately. The subsequently approved local candidate implements this reduction in both the form and required-field validator; historical submissions remain unchanged. This does not conclude that addresses are never required or authorize deploying the candidate.

Do not publish a deadline for deletion until the actual process handles Auth, submitted snapshots, review history, organizations, memberships, support copies, provider logs and backups. Avoid promising that closing an account deletes everything. Retain minimal justified decision evidence rather than all application content by default. The privacy draft now explains this distinction.

### Agreement and a privacy notice serve different purposes

Utah recognizes electronic records and signatures, but attribution, agreement and context still matter; a checkbox is not an automatic enforceability certificate. Source: [Utah Uniform Electronic Transactions Act, sections 105 and 201 through 203](https://le.utah.gov/xcode/Title46/Chapter4/C46-4_1800010118000101.pdf).

The candidate records versions when an application is submitted, not when an account is created. The terms now say so explicitly. Recommended UI wording for a separately approved follow-up is: “I am authorized to represent this business, agree to the Business Terms, and acknowledge the Business Privacy Notice.” Do not treat acknowledging a notice as blanket consent for marketing, unrelated processing or waived rights. If enforceable account-stage obligations are needed before an application, add and test an explicit account-stage agreement rather than claiming one already exists.

Final published versions must be readable before collection, downloadable or otherwise retainable, immutable and tied to the corresponding acceptance record. Preserve prior versions. Counsel should assess the assent flow and whether account-stage agreement is needed, not only the prose.

### Service email is not permission for marketing

CAN-SPAM covers commercial B2B email. Commercial messages require a valid postal address; the FTC allows qualifying PO boxes or registered commercial mailboxes, not just a home address. Transactional exemptions depend on the message's primary purpose and are narrowly described. Source: [FTC CAN-SPAM business guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).

Keep verification and password recovery focused on the requested service; do not add promotions. Before marketing, verify the full message, truthful sender details, postal address and working opt-out process. No address purchase, new cost or home-address publication is authorized. “Eagle Mountain” is not asserted to satisfy commercial-email postal-address requirements. This does not mean all service emails require the same commercial footer.

### Provider disclosures need actual configuration evidence

Cloudflare's Turnstile addendum describes client signal processing and its own bot-detection improvement purposes. Do not describe all vendor processing as exclusively under Doji's instructions or claim that a security widget collects nothing. Source: [Cloudflare Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/).

Verify provider agreements, actual database/backup regions, subprocessors, email open/click tracking configuration, hosting logs, mailbox access, and deployed scripts before completing the notice. No marketing or cross-site-advertising integration was added by this review. A verified inventory is still needed before making a legal “no sale or sharing” claim or a Do Not Track/Global Privacy Control statement. Assess whether any applicable law requires additional disclosures or mechanisms; do not add a decorative cookie banner instead of investigating processing.

### Contract protections must be intentional

The terms now use a plain support-and-remedies paragraph rather than an empty demand to invent arbitration, a liability cap or a court location. Those clauses are elective risk-allocation choices, not generic requirements established by this research. Their omission is not equivalent protection for Gavin personally. Qualified counsel should assess operator structure, contract enforceability, warranty/liability allocation and applicable law for the actual service. No LLC status, personal-liability shield, indemnity or mandatory arbitration has been invented.

## Completion plan before opening signup

1. Finish the factual inventory from existing configurations and source, including mailbox routing and provider retention. Record unknowns explicitly; do not expose credentials or assume provider defaults.
2. Prepare a narrowly scoped implementation proposal for initial data minimization, account/application assent, versioned notices and privacy-request/erasure handling. Shared Auth/database changes require the separate impact, regression and rollback approval required by AGENTS.md. Do not deploy them as routine portal UI work.
3. Qualify access/correction/closure/deletion and lost-MFA procedures with synthetic business-only records locally. Check submitted-history handling, minimal audit retention, holds, provider copies and backup restoration behavior; demonstrate that member sessions and records remain unchanged. A runbook may use safe manual steps where appropriate, but must identify the responsible person and actual means of fulfillment.
4. Obtain review of the final operator/market-specific legal choices. The owner is not expected to interpret statutes; present concrete choices only when the verified facts cannot settle them. No paid consultation is arranged or authorized by this document.
5. After explicit approval, publish final versioned texts and enable only the qualified onboarding scope under a separate release. Until then, keep signup closed, drafts out of the production artifact, and campaigns/billing/marketing disabled.

## Proposed operational policies for approval

These are proposals, not implemented controls or asserted legal retention requirements.

For minimization, consider deleting unverified registrations after 30 days, abandoned drafts after 90 days of inactivity, and declined or withdrawn application details after 180 days unless an appeal, documented investigation or legal duty justifies a longer hold. For approved accounts, retain needed business details while active, then define a justified period after closure with counsel. Define separate periods for minimal consent/decision evidence, security logs, support correspondence and backups. Do not publish these numbers until the deletion/hold process can meet them; never preserve all detailed application content indefinitely merely because some audit evidence is needed.

For lost MFA, first use an existing enrolled factor where available. If none is available, keep access restricted while support independently verifies business authority and account ownership. Knowledge of public company facts or access to email alone is not sufficient to bypass MFA. Record the reason, evidence references and authorized review, notify existing contact channels, and use only a separately approved, tested recovery command. Do not request credentials or identity documents in ordinary email. The current release does not implement a staff MFA reset command; unresolved cases remain restricted rather than using an insecure workaround.

## Technical facts checked for these drafts

Application fields were checked against website/business-portal/application-form.js and docs/drafts/business_applications_v1.sql. Identity and mail behavior were checked against supabase/functions/_shared/business-auth.ts and the dedicated access client. Tokens are held in memory by application-client.js. Private tables store accounts, current applications, immutable submitted versions, organizations, memberships, history and idempotency receipts. Business data is not automatically deleted with an Auth user. Tests of local behavior do not establish a deployed data inventory or provider delivery.

## Research used

- [FTC data protection guide](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business): supports a data inventory, limited collection/access and a written retention/disposal policy. It does not set the proposed 30/90/180-day periods.
- [FTC privacy and security guidance](https://www.ftc.gov/business-guidance/privacy-security): privacy claims need to match actual practices; a notice must not promise unimplemented deletion or security.
- [Canadian privacy guide](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda-compliance-help/guide_org/): accountability and meaningful consent considerations if the relevant Canadian law applies. Applicability has not been established.
- [Cloudflare Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/): provider processing of client signals for service security and improvement; not a claim that Doji has no responsibility.
- [OWASP multifactor authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html): recovery and factor replacement are security-sensitive and need strong verification. Email-only reset must not undermine MFA.

## Publication boundary

Resolve marked issues, approve final documents and operational procedures, create immutable published versions, then configure the exact same versions in the business UI and database. Verify legal links before collecting accounts, record application acceptance against the submitted snapshot, and retain the approved texts. Do not deploy the whole dirty website tree. No member terms, member sessions, admin authentication, billing settings or public signup flags were changed by preparing these drafts.
