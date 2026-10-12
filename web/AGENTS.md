# React web workspace

Inherit root requirements. This is a separate npm workspace/lockfile, not part
of the Expo build. Use Node 24; install root dependencies and `npm ci --prefix web`.

| Package | Ownership |
| --- | --- |
| `apps/admin` | Vite, React Router; independent employee portal, full-page records, team management and Operations |
| `apps/business` | Vite, React Router; owned Doji login backed by independent WorkOS, applications, approval/setup/MFA and workspace |
| `apps/site` | Next.js static export, SEO/public/legal routes and retained safety DOM island; read its own AGENTS before code |
| `packages/ui` | MUI/Emotion Doji theme, layouts, shared components and standard verification TextField |
| `packages/portal-data` | Validated, projected reads/commands and session-scoped TanStack Query, never browser DB credentials |

Pinned majors: React 19.3, MUI 9 (community charts/date pickers), TanStack Query 5,
Vite 8, Next 16, TypeScript 6, Vitest 5, Playwright. Read manifests for exact versions.
Do not pull root React 19.2 into web or install paid MUI packages without approval.

## UI and data requirements

- Use MUI controls and their keyboard/focus behavior. Centralize branding in
  `packages/ui/src/theme.tsx`; use Doji orange/violet and readable primary actions.
  Desktop widths must use available space; a centered account form is not a
  width limit for the authenticated workspace. Test desktop and smaller widths.
- Home is greeting/next Doji/attention/quick access, not another queue. My work is
  current-employee assignments. Domain history is a status filter in the same
  table. Use explicit columns, avatars where identity matters, MUI pagination
  and different loading/no-results/unavailable states. Unknown totals stay unknown.
- Records use full-page layouts; consequential confirmations use MUI Dialog.
  Preserve drafts, assignee, navigation filters and uncertain-command retries.
  Do not add routine instruction banners, invented statistics or optimistic health.
- Queries are memory-only and scoped to realm, identity, epoch and authorized
  read area. Logout/lock/permission loss clears caches and fences late work.
  ID-only events invalidate reads; foreground/reconnect reauthorizes. No polling
  or extra socket topology. Business realtime and health feeds remain gated.
- Browser preview/sample fixtures must not enter connected artifacts. No real
  email, moderation or approval action in visual tests. Hosted acceptance is
  separate from fixture tests and requires explicit scope.

## Commands (from web)

`npm run dev:admin` (4310), `dev:business` (4311), `dev:site` (4312) bind loopback.
Default preview config is not a production-auth connection. For verification run
`npm run check`, `npm run build:connected --workspace @doji/admin`,
`npm run test:connected-artifacts`, `npm run test:browser`.
Install Playwright Chromium first. Package-only browser suites use dedicated
configs and exact prepared artifacts; do not claim them passed from default tests.
Build outputs under `dist`, `.next`, `out`, generated safety/legal assets and test
reports are ignored. Deployments must preserve the reviewed proxy/config/headers
and remain independent for admin, business and public sites.
