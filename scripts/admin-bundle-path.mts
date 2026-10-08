// Read the entry actually referenced by the built HTML, not a historical release.
// Only a single local generated admin bundle is accepted; never resolve arbitrary URLs.
export function adminBundlePath(html: string): string {
  const matches = [
    ...html.matchAll(
      /<script\b[^>]*\bsrc\s*=\s*["'](\/admin-portal\/admin-app-[A-Za-z0-9_-]+\.js)(?:\?v=[a-f0-9]{16})?["'][^>]*>/gi,
    ),
  ];
  const match = matches[0]?.[1];
  if (matches.length !== 1 || !match) throw Error('Expected one local generated admin bundle');
  return match.slice(1);
}
