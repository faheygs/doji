# Documentation index

Start with [Developer onboarding](DEVELOPER_ONBOARDING.md). The handbook is the
entry point; dated records below retain implementation details, approval boundaries,
release evidence and rollback. This index covers every Markdown document under
`docs`, including the October 2–4 release and investigation records added below.

Also read the repository [README](../README.md), [AGENTS](../AGENTS.md),
[Product/system context](../DOJI_CONTEXT.md) and [Orchestration/secrets guide](../supabase/CRON_AND_SECRETS.md).

## How to use the records

- Check [Current state and gaps](CURRENT_STATE_AND_GAPS.md) before treating a feature
  as live. Later explicit release evidence supersedes earlier preparation notes,
  including earlier sections within the same file.
- Plans and research describe intent, not deployed behavior. A filename containing
  `PREPARATION` can now contain a later release; `docs/drafts` SQL can already be
  installed. Inspect the actual dated status and exact source.
- Old checked boxes do not certify today's artifact, policies, cost or availability.
  Recheck current official requirements when preparing a store/legal/provider change.
- `test-results`, generated artifacts and secret/config files are not an onboarding
  bundle. Some evidence is deliberately local/private and may not exist in a clone.
- `docs/drafts/*.sql` are change/rollback artifacts, **not an ordered installation
  directory**. Do not bulk apply them. See the local setup and release guides.

## Handbook

- [Current state and handoff gaps](CURRENT_STATE_AND_GAPS.md)
- [Developer onboarding](DEVELOPER_ONBOARDING.md)
- [Local development](LOCAL_DEVELOPMENT.md)
- [Security and access](SECURITY_AND_ACCESS.md)
- [Service catalog](SERVICE_CATALOG.md)
- [System and code map](SYSTEM_MAP.md)
- [Testing and releases](TESTING_AND_RELEASES.md)
- [Test suite handoff](TEST_SUITE_HANDOFF.md)

## Architecture, product and standards

- [Repository cleanup audit and retained candidates — October 5](REPOSITORY_CLEANUP_AUDIT_2026-10-05.md)
- [Portal copy and contextual help](PORTAL_UI_PATTERNS.md)
- [Doji product backlog](PRODUCT_BACKLOG.md)
- [Production readiness audit](PRODUCTION_READINESS_AUDIT.md)
- [Doji authoritative realtime architecture](REALTIME_ARCHITECTURE.md)
- [Sponsored Doji business platform](SPONSORED_DOJI_BUSINESS_PLATFORM.md)
- [Doji trust, safety, and legal-alignment requirements](TRUST_SAFETY_AND_LEGAL_REQUIREMENTS.md)
- [Separate employee identity — live](WORKFORCE_IDENTITY_PLAN.md)

## October 2–4 release and investigation records

These are dated evidence, not fresh verification of a store or production system.

## October 5–8 follow-up records

- [React web migration foundation and cutover gates](WEB_REACT_MIGRATION_2026-10-08.md)
- [Admin workflow foundation and release history](ADMIN_WORKFLOW_FOUNDATION_2026-10-05.md)
- [Platform operations health: release and gated shared feed](PLATFORM_OPERATIONS_HEALTH_2026-10-06.md)
- [Reserved poll Other option release](POLL_RESERVED_OTHER_RELEASE_2026-10-05.md)
- [Mobile diagnostic logging 1.0.9 release](MOBILE_LOGGING_RELEASE_2026-10-07.md)
- [Next mobile build: held preparation and regression evidence](NEXT_MOBILE_BUILD_2026-10-08.md)

### October 2–4 records

- [Mobile release 1.0.8 — iOS 102 / Android 24](MOBILE_BUILDS_102_24_2026-10-02.md)
- [iOS URI-decoder repair — 1.0.8 build 103](IOS_URI_SECURITY_BUILD_103_2026-10-02.md)
- [iOS 1.0.8 (103): dependency advisory disposition](IOS_103_SECURITY_ASSESSMENT_2026-10-03.md)
- [Android 1.0.8 (25): bounded native 504 diagnostics](ANDROID_DIAGNOSTIC_BUILD_25_2026-10-02.md)
- [Android 1.0.8 build 26 — expanded diagnostics](ANDROID_DIAGNOSTIC_BUILD_26_2026-10-02.md)
- [Android 1.0.8 build 27 — Expo diagnostics attachment correction](ANDROID_DIAGNOSTIC_BUILD_27_2026-10-03.md)
- [Android 1.0.8 build 28 closed test release](ANDROID_DIAGNOSTIC_BUILD_28_2026-10-04.md)
- [Android 26 feed 504 investigation](ANDROID_26_FEED_504_INVESTIGATION_2026-10-03.md)
- [Android 27 POST 504 investigation — October 4, 2026](ANDROID_27_POST_504_INVESTIGATION_2026-10-04.md)
- [October 2 relay and administrator latency repair](PERFORMANCE_REPAIR_2026-10-02.md)

## Identity, business and privacy

- [Account separation: preparation and provider provisioning, not a portal cutover](ACCOUNT_REALM_SEPARATION_PREPARATION_2026-09-30.md)
- [Business applications and verification — prepared, not live](BUSINESS_APPLICATION_FOUNDATION_2026-09-29.md)
- [Closed business portal hosting](BUSINESS_CLOSED_HOSTING_2026-09-29.md)
- [Business onboarding release — September 30, 2026](BUSINESS_LIVE_RELEASE_2026-09-30.md)
- [Business onboarding continuation — local candidate, not released](BUSINESS_ONBOARDING_IMPLEMENTATION_2026-09-29.md)
- [Business portal refinement — local prototype only](BUSINESS_PORTAL_REFINEMENT_2026-09-29.md)
- [Business privacy operations — initial US launch](BUSINESS_PRIVACY_OPERATIONS_2026-09-30.md)
- [Employee access release — live September 26, 2026](EMPLOYEE_ACCESS_RELEASE_2026-09-26.md)
- [Owner employee enrollment release — September 26, 2026](EMPLOYEE_ENROLLMENT_RELEASE_2026-09-26.md)
- [Employee onboarding repair — September 26, 2026](EMPLOYEE_ONBOARDING_REPAIR_2026-09-26.md)
- [Employee portal release preflight — September 26](EMPLOYEE_RELEASE_PREFLIGHT_2026-09-26.md)
- [Local employee-release test environment](LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md)

## Safety, moderation and account deletion

- [Account-deletion repair — September 26, 2026](ACCOUNT_DELETION_REPAIR_2026-09-26.md)
- [Cloudflare administrator alerts — September 28, 2026](CLOUDFLARE_SAFETY_EMAIL_2026-09-28.md)
- [External takedown intake — September 28, 2026](EXTERNAL_TAKEDOWN_INTAKE_2026-09-28.md)
- [Moderation end-to-end release test plan](MODERATION_E2E_TEST_PLAN.md)
- [Exact-object moderation media repair — preparation history and release](MODERATION_MEDIA_REPAIR_2026-09-28.md)
- [Safety and Removal Center — production launch, September 29, 2026](SAFETY_LAUNCH_2026-09-29.md)
- [Safety intake drawer UI repair — September 29, 2026](SAFETY_PORTAL_UI_REPAIR_2026-09-29.md)

## Portal, editorial, announcements and ideas

- [Internal admin completion — September 27](ADMIN_COMPLETION_2026-09-27.md)
- [Employee editorial workflows — local qualification](ADMIN_EDITORIAL_PREPARATION_2026-09-27.md)
- [Admin editorial release — September 27, 2026](ADMIN_EDITORIAL_RELEASE_2026-09-27.md)
- [Announcement campaigns: design and isolation gate](ANNOUNCEMENT_CAMPAIGN_DESIGN_2026-09-27.md)
- [Announcement campaign release — September 27, 2026](ANNOUNCEMENT_CAMPAIGN_RELEASE_2026-09-27.md)
- [Community idea retriage release — 2026-09-27](COMMUNITY_IDEA_RETRIAGE_RELEASE_2026-09-27.md)
- [Editorial record drawers — September 27, 2026](EDITORIAL_DRAWER_RELEASE_2026-09-27.md)
- [Original community submission review — 2026-09-27](IDEA_SUBMISSION_PRESENTATION_2026-09-27.md)
- [Portal audit — September 25, 2026](PORTAL_AUDIT_2026-09-25.md)
- [Employee avatar evidence — approved local preparation](PORTAL_AVATAR_EVIDENCE_PREPARATION_2026-09-27.md)
- [Portal case reads — local preparation, September 27](PORTAL_CASE_READS_PREPARATION_2026-09-27.md)
- [Admin portal consistency pass — September 29, 2026](PORTAL_CONSISTENCY_2026-09-29.md)
- [Portal monitoring and queue-health repair — live](PORTAL_HEALTH_REPAIR_2026-09-26.md)
- [Portal isolation fixes — release record](PORTAL_ISOLATION_RELEASE_2026-09-25.md)
- [Portal triage release — September 27, 2026](PORTAL_TRIAGE_RELEASE_2026-09-27.md)
- [Portal triage production-readiness work — September 27](PORTAL_TRIAGE_REPAIR_2026-09-27.md)
- [Admin portal workflow and readiness audit — 2026-09-27](PORTAL_WORKFLOW_AUDIT_2026-09-27.md)

## Mobile, performance, push and incident evidence

- [September 27 feed and realtime alerts — read-only diagnosis](ALERT_DIAGNOSIS_2026-09-27.md)
- [Android 21 reliability follow-up — September 28, 2026](ANDROID_21_INCIDENT_FOLLOWUP_2026-09-28.md)
- [Android 22 suggestion-history 504 trace](ANDROID_22_SUGGESTIONS_504_TRACE_2026-09-28.md)
- [Android 1.0.8 (23): tester recovery and request correlation](ANDROID_RECOVERY_BUILD_23_2026-09-28.md)
- [Member-app code review — September 26, 2026](APP_CODE_REVIEW_2026-09-26.md)
- [Instagram-grade notifications for Doji](INSTAGRAM_NOTIFICATION_RESEARCH.md)
- [Free local heavy-load test — September 28, 2026 UTC](LOCAL_HEAVY_LOAD_2026-09-28.md)
- [Member query fixes — next mobile build](MEMBER_QUERY_FIXES_NEXT_BUILD_2026-09-27.md)
- [Member query performance repair — September 28 UTC](MEMBER_QUERY_PERFORMANCE_REPAIR_2026-09-28.md)
- [Member read audit — queued September 28, 2026](MEMBER_READ_AUDIT_NEXT_BUILD_2026-09-28.md)
- [Member-read reliability builds: iOS 101 / Android 22](MEMBER_READ_BUILDS_101_22_2026-09-28.md)
- [Member read recovery and correlation — September 28, 2026](MEMBER_READ_RECOVERY_2026-09-28.md)
- [Member reliability repair — September 26, 2026](MEMBER_RELIABILITY_REPAIR_2026-09-26.md)
- [Member test builds: 1.0.8 / iOS 98 / Android 19](MEMBER_TEST_BUILDS_2026-09-26.md)
- [Doji 1.0.8 — iOS 100 / Android 21](MOBILE_QUERY_BUILDS_100_21_2026-09-28.md)
- [Notification history repair — local candidate](NOTIFICATION_REPAIR_2026-09-26.md)
- [Notification test builds — 1.0.8 / iOS 99 / Android 20](NOTIFICATION_TEST_BUILDS_99_20.md)
- [Member performance investigation — September 27, 2026](PERFORMANCE_INVESTIGATION_2026-09-27.md)
- [Performance repair — September 28, 2026 UTC](PERFORMANCE_REPAIR_2026-09-28.md)
- [Doji production incident investigation — September 13, 2026](PRODUCTION_INCIDENT_INVESTIGATION_2026-09-13.md)
- [Push registration: approved backend release](PUSH_REGISTRATION_RELEASE_2026-09-26.md)
- [Read-only reliability diagnosis — September 26, 2026](RELIABILITY_DIAGNOSIS_2026-09-26.md)

## QA and store checklists

- [App Store release checklist](APP_STORE_RELEASE.md)
- [Google Play release checklist](GOOGLE_PLAY_RELEASE.md)
- [Doji — QA Checklist (pre-publish)](QA_CHECKLIST.md)

## Legal review drafts

- [Business Launch Legal Review](drafts/BUSINESS_LEGAL_REVIEW.md)
- [Doji Business Privacy Notice Draft](drafts/BUSINESS_PRIVACY_REVIEW.md)
- [Doji Business Terms Draft](drafts/BUSINESS_TERMS_REVIEW.md)
