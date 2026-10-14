# Editorial record drawers — September 27, 2026

Released: Pages `cea4bd7a-191b-4f34-9ab6-b79a06177bb3`. Final full suite: 123
passing browser tests. All 23 public asset hashes and security headers verified;
shared Worker deployment/settings/bindings/schedules unchanged. Syntax and targeted
whitespace checks passed. Desktop light/dark and phone drawer screenshots inspected.
Live read-only computer-use verification restored the employee session and opened
the reported format-question submission in the right-edge drawer with original
values intact. No rationale, decision or announcement was submitted.

## Scope

Community-idea and announcement records now use the existing right-side admin
drawer primitives: 680px maximum width, full viewport height, square right-edge
layout, shared header/Close and content spacing. Phone layout fills the viewport.
The readonly original-submission form is retained. Existing announcement editing
stays in a drawer. New announcement creation and consequential confirmations stay
centered. Back preserves idea rationale and announcement draft values.

Native dialog semantics retain inert background and focus behavior. Close/Escape
and deliberate drawer-backdrop clicks restore the originating record control.
Refresh no longer replaces that return-focus target with a removed drawer button.
Pending command dismissal, versioned/idempotent payloads, session cleanup, permission
checks and response revision guards are unchanged. No real decision/publication is
made for qualification.

## Validation

Full portal suite is run against the exact isolated candidate, not the dirty site
tree. New cases cover both record types at 390/1440px, edge alignment/full height,
native modal background focus exclusion, Escape/backdrop close, return focus after
refresh, drawer/dialog transitions and preserved rationale/draft fields. Existing
light/dark accessibility and readonly field tests remain included.

The first run found four overly strict keyboard assertions and one old modal-header
selector. Native sequential navigation may visit browser chrome, while the underlying
page remains inert; tests now verify that distinction and the actual drawer header.
Reference: [WHATWG sequential focus navigation](https://html.spec.whatwg.org/multipage/interaction.html#sequential-focus-navigation).
See also [WAI dialog focus guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## Release boundary and rollback

Candidate: `test-results/editorial-drawer-release-20260927/site`, bundle
`admin-app-20260927ideas4.js`. It starts from the hash-verified live form release,
replaces only the editorial module, appends five scoped drawer CSS rules, and changes
the two HTML asset references. Other assets, including auth/runtime, stay byte-identical.
No member code, database/RLS, shared Worker, sessions, notifications, release policy,
paid resource or new service is changed.

Release checks compare public hashes/security headers and existing Worker
deployment/settings/bindings/schedules. Rollback is the preceding static deployment
`ea70496a-c660-40f2-87d5-da3feaa7d27c`, with no shared-system rollback.
