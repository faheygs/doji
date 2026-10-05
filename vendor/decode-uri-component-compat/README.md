# URI decoder compatibility boundary

This private adapter uses the unmodified, exact-pinned upstream
`decode-uri-component@0.5.0` package (MIT licensed, license shipped by npm).
It replaces the vulnerable 0.2.2 transitive dependency of `query-string@7.1.3`
without upgrading Expo Router or changing its query parser.

The only compatibility adaptations are the CommonJS function export and the
0.2.x literal `+` to space conversion. Encoded `%2B` is decoded once to `+`.
The decoding algorithm is entirely upstream; no custom recursive decoder or
postinstall source rewriting is used.

Maintain `index.cts`, checked by `scripts/tsconfig.tooling.json`. The existing
CommonJS package entry `index.cjs` is generated for query-string/Metro; do not edit
it directly. Regenerate with `node scripts/build-compat.mts --write`. The root
migration gate compares its bytes with compiler output, and parser/router tests
exercise that emitted artifact. This does not replace the upstream decoder.

Advisory: https://github.com/advisories/GHSA-vcc3-ghjq-m6fr
Upstream: https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0

Remove the adapter when the installed router/query-string chain directly supports
a patched decoder and the routing/security regression tests pass without it.
