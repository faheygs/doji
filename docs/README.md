# Documentation

Start with [developer onboarding](DEVELOPER_ONBOARDING.md) and
[current state and gaps](CURRENT_STATE_AND_GAPS.md). These describe the current
source and its deployment boundaries; merging source does not deploy it.

## Developer handbook

- [System and repository map](SYSTEM_MAP.md)
- [Services and what each one does](SERVICE_CATALOG.md)
- [Local development](LOCAL_DEVELOPMENT.md)
- [Security, configuration and access](SECURITY_AND_ACCESS.md)
- [Testing and releases](TESTING_AND_RELEASES.md)
- [Test suite handoff](TEST_SUITE_HANDOFF.md)

## Product and architecture

Read [product context](../DOJI_CONTEXT.md) and
[realtime architecture](REALTIME_ARCHITECTURE.md) before changing system contracts.

- [Portal UI patterns](PORTAL_UI_PATTERNS.md)
- [Product backlog](PRODUCT_BACKLOG.md)
- [Sponsored business platform requirements](SPONSORED_DOJI_BUSINESS_PLATFORM.md)
- [Trust, safety and legal requirements](TRUST_SAFETY_AND_LEGAL_REQUIREMENTS.md)
- [Workforce identity](WORKFORCE_IDENTITY_PLAN.md)
- [Notification research](INSTAGRAM_NOTIFICATION_RESEARCH.md)

## Verification and operations

- [Production readiness audit](PRODUCTION_READINESS_AUDIT.md)
- [QA checklist](QA_CHECKLIST.md)
- [App Store release](APP_STORE_RELEASE.md)
- [Google Play release](GOOGLE_PLAY_RELEASE.md)
- [Local employee test environment](LOCAL_EMPLOYEE_TEST_ENVIRONMENT.md)
- [Moderation end-to-end test plan](MODERATION_E2E_TEST_PLAN.md)
- [Notification builds 99/20 evidence](NOTIFICATION_TEST_BUILDS_99_20.md)
- [Release and investigation records](releases/README.md)

## Legal source

These files include approved publishing inputs and review context, not disposable
scratch notes. Do not change legal promises during code cleanup.

- [Business legal review](legal/BUSINESS_LEGAL_REVIEW.md)
- [Business privacy source](legal/BUSINESS_PRIVACY_REVIEW.md)
- [Business terms source](legal/BUSINESS_TERMS_REVIEW.md)

## Documentation rules

Keep current contracts in the handbook, not in append-only implementation diaries.
Release records retain exact artifacts, acceptance gaps and rollback evidence;
old commands and status are historical, not instructions to rerun or proof of
today's production state. Consolidate superseded notes when unique evidence is
preserved. Do not add a dated document for routine progress updates.

Executable database changes belong in [SQL overlays](../supabase/overlays/README.md)
or the reviewed migration history, not in documentation folders. Overlays are
**not** an ordered installation directory and must never be bulk-applied.

Every maintained Markdown document must be reachable through this index or a
linked directory index. `npm run check:hygiene` checks that coverage. Credentials,
provider responses, generated artifacts and private acceptance evidence stay out
of Git.
