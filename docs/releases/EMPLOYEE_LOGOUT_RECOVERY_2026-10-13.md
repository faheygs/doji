# Employee sign-out recovery — October 13, 2026

Status: **LIVE**, owner approved. Deployment completed October 14 around 00:44 UTC
(October 13, 18:44 MDT). Source changes remain local pending normal PR/CI integration;
a production deployment does not establish a main-branch merge.

## Failure and contract

The admin retry-sign-out screen was reproduced. A normal reload restored the login
form, but did not fix the underlying handler. The handler returned 401 when the
employee session was already missing/expired; the browser correctly retained its
cleanup lock until receiving explicit confirmation, producing a dead end.

Logout now returns `200 {signedIn:false}` and expires `__Host-doji_employee` when
there is no employee cookie, the addressed session is already absent, or unusable/
expired state has been successfully removed. This confirms only local portal
session cleanup, not unverified WorkOS revocation. Active sessions retain exact
origin/CSRF protection. Invalid/duplicate cookies, storage or deletion failures,
invalid bodies and rejected origins are not treated as successful logout.

Member Supabase Auth, business identity, MFA, idle/absolute session limits,
database schema/RLS/RPCs, realtime, push and challenge scheduling are unchanged.
Shared hosting still exists; this is a scoped release, not physical isolation.

## Exact release

- Target: `employee-portal-v2`, version 23 → **24**, ACTIVE, `verify_jwt=false`
  retained for the existing independently authenticated ingress.
- Sole runtime delta: `runtime/employee-http.mjs`. Entry point, import map and all
  other captured modules were preserved. No wholesale dirty-tree packaging.
- v23 bundle: `a51915ac3d06020f7a65b4cc4cd887a15cf26cf60f5d94b46f39fbba555eeea0`.
- v24 bundle: `8ed314412535249ec0cd219d2af294353ec3fa568d77e542070f678593995814`.
- No Pages deployment, secrets/configuration update, provider setting, SQL write,
  business runtime, member runtime or mobile build/submission was performed.

Preparation: `scripts/prepare-employee-logout-20261013.mts`. Release and bounded
verification: `scripts/release-employee-logout-20261013.mts`. These are historical,
exact-manifest operations, not general-purpose release commands. Do not replay.

## Verification

- Source HTTP/transport tests: 55 passed; React session/reconciliation: 13 passed.
- Exact captured-and-patched runtime: **72 tests passed**, including HTTP,
  browser transport and runtime boundary suites. Runtime imports use the emitted
  candidate where present; browser-only adapters use unchanged source dependencies.
- Portal and tooling TypeScript passed before release.
- Downloaded v24 matched every candidate module (newline normalization only).
- Hosted missing-cookie logout and repeat: 200, signed-out confirmation,
  expired employee cookie and no-store.
- Hosted random synthetic nonexistent session: same successful cleanup response.
- Malformed cookie: 401. Foreign origin: 403. Anonymous session read: 401.
- Other deployed function metadata and secret digests unchanged. Admin/business/
  public site response bodies retained the captured hashes. Public portal pages
  remained available and anonymous member Auth boundary retained expected denial.
- Cloudflare saved API login returned 401 during read-only capture. No Cloudflare
  changes were attempted; public page hashes were used instead. This does not
  claim a full Cloudflare configuration comparison.

No new real employee login, MFA submission or authenticated logout was performed
during this release. Expiry, active-CSRF and storage-failure cases passed offline;
hosted checks used no real account credentials or sessions. This is not a complete
member-app end-to-end acceptance run.

## Rollback and retained evidence

Private/ignored `test-results/employee-logout-release-20261013/` retains the captured
v23 baseline, byte-identical rollback runtime, candidate, test output/manifests,
pre-deploy re-download, deployed re-download and `verified.json`.

If a regression requires rollback, first verify the deployed package still matches
this candidate and obtain authority for that operational action. The release
script's `rollback` mode deploys only the captured employee package and verifies
its download. No SQL or Pages rollback is required. Do not blindly restore v23 over
a newer release. Never commit private evidence or credentials.
