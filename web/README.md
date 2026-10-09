# Doji web workspace

Status: **admin qualified for owner-approved root promotion; business/site previews**.

This independently locked workspace contains the new React web applications. Normal
development previews use synthetic data. A separate connected admin build is hosted
at https://admin.dojipro.com/connected with existing employee authentication, bounded
authorized reads and tested administrative commands, including atomic announcements.
The same connected package is approved for the default admin entry; use
`scripts/promote-react-admin-root.mts` with its exact-package and rollback guards.
Owner declined synthetic live announcement writes; they are not recorded as passed.
Business React and
the public Next.js app remain local previews; their production entry points are unchanged.
Do not deploy a development preview as a connected production application.

## Applications

| Application    | Stack                          | Local command          | Port | Current slice                                |
| -------------- | ------------------------------ | ---------------------- | ---- | -------------------------------------------- |
| Admin          | React, Vite, React Router, MUI | `npm run dev:admin`    | 4310 | Home, team, queues, records and Operations previews |
| Business       | React, Vite, React Router, MUI | `npm run dev:business` | 4311 | Public front door; disconnected access route |
| Public website | Next.js App Router, React, MUI | `npm run dev:site`     | 4312 | Statically rendered homepage with metadata   |

Use Node 24. From this directory:

```sh
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
npm run build
npm run test:artifacts
npm run test:browser
```

Browser tests require Playwright Chromium (`npx playwright install chromium`).
All development servers bind to loopback. Next.js build telemetry can be disabled with
`NEXT_TELEMETRY_DISABLED=1`. Preview metadata forbids indexing. No secrets, production
configuration, account creation, moderation commands or publishing calls are included
in the default synthetic preview. The separate connected entry is intentionally
restricted to the authorized admin origin and existing employee contracts.

Next.js writes generated route validators containing unused declarations. Its project
keeps strict typing, with unused maintained-source declarations enforced by ESLint
instead of the TypeScript unused-declaration flags. Generated files remain excluded
from lint and Git. The installed Next.js CLI also generates the site-level AGENTS.md;
its framework guidance does not override the repository's security boundaries.

## Shared packages

- `@doji/ui`: MUI light/dark theme, headings, stable-height table states and sticky form actions.
- `@doji/portal-data`: per-session, per-realm query keys; memory-only QueryClients;
  targeted invalidation and cache disposal. This is **not an authentication client**.
- MUI X community date/time pickers, React Hook Form and Zod are used for the announcement
  design preview. Paid MUI Pro/Premium components are not dependencies.

Do not import the member app, root mobile packages or business identities into the admin
app. Do not install web dependencies in the mobile root. Do not introduce Socket.IO:
the connected admin uses existing authorized Ably subscriptions through tested adapters.

See [the migration specification](../docs/WEB_REACT_MIGRATION_2026-10-08.md) for remaining
routes, contract mappings, verification and deployment gates.
