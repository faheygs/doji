# Doji web workspace

This independently locked workspace contains the production React frontends:
Vite admin and business portals, and the statically exported Next.js public site.
Local development defaults to synthetic previews; connected builds have separate
configuration and acceptance checks. Never deploy a preview as a connected app.

See [current state](../docs/CURRENT_STATE_AND_GAPS.md) for recorded releases,
disabled features and pending acceptance. Source presence is not proof that a
feature is enabled. Historical release scripts are not general deployment commands.

## Applications

| Application    | Stack                          | Local command          | Port | Current slice                                |
| -------------- | ------------------------------ | ---------------------- | ---- | -------------------------------------------- |
| Admin          | React, Vite, React Router, MUI | `npm run dev:admin`    | 4310 | Employee home, team, queues, records and Operations |
| Business       | React, Vite, React Router, MUI | `npm run dev:business` | 4311 | Owned login, application, approval/setup/MFA and workspace |
| Public website | Next.js App Router, React, MUI | `npm run dev:site`     | 4312 | Static public, legal and safety routes with SEO metadata |

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

See [workspace instructions](AGENTS.md) for ownership and UI/data requirements,
and [testing and releases](../docs/TESTING_AND_RELEASES.md) for verification gates.
