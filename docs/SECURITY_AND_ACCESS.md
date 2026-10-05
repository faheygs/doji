# Security and access

Use named identities, least privilege and the smallest approved environment.
Repository access, Doji portal roles and cloud dashboard access are different
permissions. This guide describes engineering boundaries, not a security or legal
certification. [AGENTS.md](../AGENTS.md) remains the standing owner policy.

## Account realms

| Realm | Current identity | Password and session boundary |
| --- | --- | --- |
| Member app | Supabase Auth | Remains Supabase; portal work must not migrate/reset/revoke member credentials or sessions |
| Employee admin | Separate WorkOS employee production directory | Required authenticator MFA; exact verified subject maps to independent employee identity; opaque host cookie |
| Business | Released Supabase-based dedicated business flow; independent WorkOS replacement incomplete | Do not claim full same-email credential independence until its separate cutover is verified |

The target is that the same email can have independent member, employee and business
accounts. **Email is contact information, not the authorization key.** Never merge
principals by email or use a member profile's historical admin flag to grant WorkOS
access. The nine migrated staff attribution references preserve historical IDs;
do not rewrite old audit authors or remove the compatibility registry.

Employee sessions validate realm/issuer/audience, provider subject, MFA and internal
permissions. The session/application SQL login has restricted SET roles, NOINHERIT
and no general table/service authority. Browser cookies are not Supabase member JWTs.
The Pages proxy cannot run arbitrary SQL or choose new resource capabilities.

## Employee onboarding and offboarding

1. Owner approves the exact work address, verified forwarding destination and role
   responsibilities. Create/verify the Cloudflare forwarding rule without replacing
   unrelated domain mail routing.
2. Invite the exact person to the employee WorkOS realm. They choose their own
   password and enroll their authenticator; do not collect passwords or OTPs.
3. Verify the accepted subject/email/MFA, then use the reviewed identity mapping
   and role workflow. Do not give every developer super-admin access.
4. Verify their permitted reads and denied operations. Separately invite them to
   only the vendor/repository projects required for their assignment.
5. On departure, disable/revoke employee access and vendor/repository access,
   then remove or reroute the work forwarding address according to owner policy.
   Forwarded copies already in a personal inbox are not recalled by deleting a rule.

Lost-factor recovery requires independent authority verification and a separately
approved tested process. There is no permission to disable MFA, reuse a member
reset link or issue a direct database update to bypass recovery. Portal lock/logout
must revoke only the employee session, not mobile sessions or business accounts.

## Secrets and artifacts

- `EXPO_PUBLIC_*` values are bundled into clients. Use only public URL/anon keys and
  intentionally public configuration. Supabase RLS still enforces access.
- Never commit or paste service-role keys, WorkOS API keys, proxy/encryption/admission
  keys, database passwords, APNs `.p8`, signing keystores, FCM private keys, session
  cookies, reset URLs, signed media URLs or private status codes.
- An employee/business staging credential is still a secret. Keep staging and
  production separate and never authorize a staging identity in production.
- `.env.local` and `.artifacts/` are sensitive local stores. `credentials/`,
  `test-results/`, downloads, screenshots and exported SQL are **not automatically
  sanitized** just because they are outside app source. Review before sharing.
- `.gitignore` protects some filenames, not every possible secret. `.easignore`
  is a separate mobile archive allowlist; do not weaken either for convenience.
- `google-services.json` is client Firebase configuration, not a service-account
  private key. Never replace it with server credentials.
- Keep account recovery accessible to the owner without using the work inbox as
  its only recovery dependency. Do not change domain MX or security policies casually.

Production orchestration credentials are registered in multiple stores. Rotation
requires the dedicated reviewed procedure and verification of every wake path;
secret rotation is a mutation, not a read-only diagnostic command.

## Authorization and data protection

RLS, explicit EXECUTE grants and handler checks are part of the API contract.
`SECURITY DEFINER` does not mean public authority: functions need exact caller
checks and a safe search path. `verify_jwt=false` on an Edge gateway does not waive
the handler's authentication, feature, origin or capability checks.

Public profiles use an explicit safe projection. Date of birth/age assurance,
private contact details, moderation evidence and external requester information
must never enter public rows, Ably payloads, Sentry breadcrumbs or alert mail.
Media signing follows an exact authorized object check and short TTL; do not make
a bucket public to fix a broken thumbnail. Preserve holds and deletion/restoration
fences. A removed origin object is not proof every cached copy has disappeared.

Business privacy requests require verified representative authority and restricted
staff roles. Closure, primary erasure and provider/backup cleanup are distinct.
Use [Business privacy operations](BUSINESS_PRIVACY_OPERATIONS_2026-09-30.md), not
ad hoc account deletion or an invented fixed retention deadline.

## Scope and release approval

Routine portal presentation work must not alter member sessions, RPCs, RLS,
realtime/push, shared Worker or release-policy behavior. If shared work is necessary,
explain impact, isolation, member regression tests, deployment and rollback, and
obtain separate approval. Intentional audited moderation is the narrow explicit
exception for its exact member/content target, not a UI-testing tool.

Do not change billing, enable paid features, launch cloud builds or run load tests
against production based on a general development assignment. Check actual included
allowances before approved cloud operations. Never promise zero cost indefinitely
or 100,000-user readiness from an SDK plan limit.

## Incident response boundaries

Collect minimal release/platform/build, UTC window, operation, status/SQLSTATE and
allowed correlation IDs. Read bounded authorized health/error views. Preserve
evidence and distinguish an unavailable check from healthy state. Do not mute
Sentry, retry a write with a new idempotency key or revoke all sessions to reduce
alerts. Scope containment to the affected component/account and escalate to Gavin.
