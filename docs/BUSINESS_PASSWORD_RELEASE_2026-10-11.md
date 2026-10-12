# Business password feedback release

## Verified live status

Business runtime deployed and all 37 source/config files verified. Business Pages
`0b207767-a256-4b39-9a36-fb4ac2bfbcbb` deployed at 18:02 UTC; hosted HTML, release
configuration and each new asset hash match. The exact-alias slot was re-armed at
18:03 UTC, expiring at 19:00:23.878 UTC. Public signup remains closed.
Hosted synthetic short-password validation returns exactly HTTP 422
`{field:'password',code:'password_too_short'}`, without cookies or acceptance-state
changes. Bootstrap/session/legacy callback and independent health boundaries pass.
Chrome visibly shows the deployed checklist. No provider mutation or email was
performed. Actual user signup and verification are not yet confirmed.

93 offline auth/reset/guard/proxy/Edge-compatibility tests and 29 UI tests passed;
web, portal and release-tool TypeScript checks passed before deployment. Exact
source was rechecked after the scoped configuration update. Other Edge metadata
changed only by the expected secret-refresh generation increment. Member contract,
policy/role fingerprints, unrelated secrets and admin/public Pages are unchanged.

Owner approved deploying business-only password feedback, reconciling the exact
test alias, and reopening one controlled signup attempt. Public signup stays closed.
No member/employee authentication, schema/RLS, challenge, push or shared Worker
code changes are authorized by this release.

## Exact packages and boundaries

- Evidence: `test-results/business-password-release-20261011/`.
- Runtime candidate: `test-results/business-owned-candidate-AyD7m1/`.
- Prior runtime: `test-results/business-owned-candidate-5IQNY1/` (Buffer repair).
- Prior Pages: `f3ae5cfa-38bd-4c27-b88c-55343fac5209`; preserved package
  `test-results/business-owned-switch-20261011/acceptance/`.
- Only four runtime modules differ: provider error mapping, HTTP field-error
  projection, fixed-category diagnostics and dependency-free password policy.
- Frontend preserves the exact current proxy, legal pages, headers, redirects and
  application configuration. It adds the tested checklist and field-error behavior.
- Existing 200 KiB compressed JavaScript budget is retained for all other chunks;
  the full-dictionary estimator has a separate bounded 900 KiB lazy chunk budget
  (measured about 848 KB gzip). No dictionary trimming or false strength heuristic.

The re-arm compares the original consumed reservation and other acceptance state
before writing. Its prior evidence is retained in baseline.json. WorkOS exact-email
GET must return no user and no next page immediately before re-arm. Only that same
identity HMAC is eligible. The existing one-account enrollment limit and all mail
counters/caps remain unchanged. The fresh window is one hour from preparation,
ending October 11 at 19:00:23.878 UTC / 1:00 p.m. Mountain; it is not auto-extended.
No account is created and no email is sent by the release tooling.

Only the business runtime capacity-expiry configuration is updated. Supabase may
advance all Edge generation numbers on a project-secret update: unrelated function
metadata must differ by that single generation increment only. Their code hashes,
JWT flags and all unrelated secrets must remain unchanged. Member SQL/policy/role
fingerprints and other Pages deployments are checked before and after.

## Rollback and uncertain outcomes

If a deployment response is lost, inspect current source/deployment first; never
repeat a write blindly. Each mutating step writes a one-use started marker.
On failed acceptance, close only the acceptance gate, mail expiry and enrollment
window. Keep reservations, account records, signed reset receiver, encryption keys,
reset mappings and session fences. Never restore legacy installer grants.
Do not refund the new creation slot automatically, even after a password rejection.

Pages can be rolled back to the exact deployment above. The previous runtime source
is downloaded and hash-verified under `edge-before/`; deploying it restores the
Buffer repair but loses improved password feedback. Protected previous runtime
configuration is preserved under the existing restricted `.artifacts/` directory.
Restoring an expired capacity timestamp must not restore signup permission. Do not
reopen or extend a failed test window through rollback.

## Verification

81 offline provider/HTTP/runtime/reset/recovery/guard tests and 29 business UI tests
passed before release. Web and portal TypeScript checks passed. Release-tool checks,
exact deployed source, hosted asset hashes, independent auth boundaries and read-only
health checks are required before calling the release verified. Real signup and
email verification are user-completed acceptance, not asserted by a successful build.
