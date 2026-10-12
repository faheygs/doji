# Retained browser sources and packaging

This folder is NOT the primary React UI: that is web/apps. It remains an active
dependency for typed employee/business authentication/application controllers,
health/safety contracts, legal content, the public safety DOM island, offline
regressions and exact release packaging. Do not delete it as migration debris.

Read root instructions plus docs/SYSTEM_MAP.md and web/AGENTS.md. New portal
presentation belongs in React/MUI unless the existing isolated safety/controller
contract requires a narrow fix here. Legacy drawer/select examples are historical,
not the design direction for the current portal.

Maintain `.mts` sources and declarations; browser-source.mts generates the same
public `.js` URLs. Run root `npm run typecheck:website` and affected offline/browser
regressions. Compiled `.admin-dist`, `.business-dist`, `.safety-preview` and
`.business-admin-qa-*` packages are ignored and not source authority.

Builders can read local production-linked configuration and emit live mode.
Inspect them before invoking; use explicit synthetic settings and network-blocked
fixtures for tests. Never assume serving a local file tests Pages proxy/headers,
provider login or database permissions. Preserve exact release proxy/config,
legal versions and rollback evidence. No provider sends or gate enablement for QA.
