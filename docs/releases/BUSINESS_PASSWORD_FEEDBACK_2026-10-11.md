# Business password feedback — local preparation

**Release update:** Owner-approved deployment and controlled one-attempt re-arm are
now verified. See `BUSINESS_PASSWORD_RELEASE_2026-10-11.md`. Local-only statements
below record the original preparation scope; user signup/verification is pending.

## Scope and evidence

The controlled test reserved account creation at 17:00:53.215 UTC on October 11.
The exact test identity was absent in WorkOS afterward. The provider response was
discarded by the generic error path, so the cause of that attempt is unconfirmed.
No pasted credentials or proof tokens were reused or retained in this change.

The business WorkOS dashboard showed minimum length 10, strength 3, no required
character classes, no breached-password rejection and no password-history rejection.
The form previously exposed none of those requirements and obscured provider errors.

Primary references inspected:

- [WorkOS OpenAPI](https://github.com/workos/openapi-spec/blob/main/spec/open-api-spec.yaml):
  create-user HTTP 400 with `code: password_strength_error` and an errors array.
- [WorkOS password validation](https://workos.com/blog/creating-stronger-passwords-with-authkit):
  strength evaluation and explicit `password_contains_email` rejection.
- [WorkOS error interface](https://github.com/workos/workos-node/blob/main/src/common/interfaces/workos-response-error.interface.ts).

## Prepared behavior

- Shared public business-only policy/copy module, with no server credentials or imports.
- A compact MUI checklist below new-password fields: at least 10 characters, hard
  to guess, and (registration only) no email address. Each met criterion receives
  a green check and an accessible status. Sign-in has no checklist.
- Standard MUI contextual “Password tips” popover suggests 12–16 characters or a
  longer passphrase. This is advice, not a new minimum or a 16-character maximum.
  No invented uppercase, number or symbol requirements; the 256-character maximum
  remains enforced but is not presented as an intimidating range in ordinary help.
- Local, debounced zxcvbn-ts strength estimation uses a score of at least 3, with
  email context. This is an estimate, not a promise of provider acceptance. It uses
  no network matcher, logs, storage or query cache. Pending work is invalidated on
  clearing/unmount; the current DOM field is read after lazy loading.
- Local new-password checks before transport/proof/reset-link consumption. Registration
  repeats the cheap checks server-side before admission/reservation/provider creation.
- Confirmed create-user password errors become a strict two-field HTTP 422 contract.
  The browser accepts only known codes on registration; all other errors remain generic.
- Accessible inline error/focus; email and checked consent retained. Submitted password
  cleared immediately and never stored in browser storage, query cache or diagnostics.
- Only the fixed `registration_password_rejected` diagnostic category is logged.
- No automatic retries, refunds, account-existence disclosure, reset-fence release or
  changes to sign-in password eligibility. No member or employee auth changes.

## Release limits

Prepared and tested locally, NOT deployed. No database/config/provider policy changes,
test-account creation or email sends. The controlled acceptance reservation remains
spent, and its original expiry and mail budget remain unchanged. Re-arming is a
separate explicitly approved operation after reconciling the provider account state.

Production release needs a fresh business-only runtime and frontend package. Preserve
the deployed Buffer fix and all existing guards. Roll back only those two packages;
never restore old shared DB grants, reset fences, or automatically extend acceptance.
Verify the displayed policy against WorkOS on future password-policy changes.

## Verification

Offline provider/flow/HTTP tests cover password-policy mapping, strict payloads,
no-credentials responses, no retry, no session install, and no reservation for local
validation failure. React tests cover accessible field errors, focus, retained email/
consent, cleared secrets, reset preflight and unchanged sign-in behavior. Existing
runtime/reset/proxy tests cover session fencing, expiry, replay and realm isolation.
The local preview is design-only and makes no provider calls or emails.

Verification on October 11: 88 offline Node auth/runtime/reset/proxy tests and all
29 business-app unit tests passed. Portal/tooling and web TypeScript checks passed;
the business-only Vite production build passed. Local Chrome preview confirms the
checklist and contextual help retain the existing account card. Chrome checks cover
green checkmarks, popover dismissal with Escape and focus restoration to its trigger.

## Client dependency and loading cost

The business workspace pins `@zxcvbn-ts/core` 4.2.0, `language-common` 4.1.3 and
`language-en` 4.1.1, plus its directly imported MUI icons 9.4.0. Installation audit
reported zero vulnerabilities. The strength chunk is approximately 1,661 KB raw /
848 KB gzip; Vite correctly warns about its size. It loads only after entering at
least 10 characters in a new-password field, not in the initial/sign-in bundle.
This adds a one-time download for signup/reset; it is not a zero-cost feature.
The checklist shows a checking/unavailable state instead of claiming strength when
the chunk has not loaded. No backend or mobile dependency was added.

References: [zxcvbn-ts](https://zxcvbn-ts.github.io/zxcvbn/guide/getting-started/)
and [MUI Popover](https://mui.com/material-ui/react-popover/).
