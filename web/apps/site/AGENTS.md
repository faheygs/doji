# Doji public-site agent guide

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Doji public-site ownership

Inherit root and web/AGENTS.md. This app uses Next 16 App Router with
`output: 'export'`, React 19.3 and shared MUI/Emotion branding. Cloudflare Pages
serves static `out/`; there is no Next server, server session or API backend here.
Run from web: `npm run dev:site`, `npm run typecheck --workspace @doji/site`,
`npm run build --workspace @doji/site`; full web checks validate artifact budgets.

`prepare-assets.mts` generates ignored legal HTML and retained safety assets from
website sources before dev/build. Never hand-edit those outputs or maintain a
second JavaScript config. Default previews stay noindex and safety-disabled.
Only a separately qualified release package preserves live safety config/headers
and sets indexable SEO metadata. Validate canonicals, robots and sitemap together.
The safety DOM island preserves its existing taxonomy, private receipt and
idempotency behavior. Use document navigation so private form state is not cached
across routes. Do not rewrite approved legal content, submit test reports to
production or introduce member/portal authentication into this public site.
