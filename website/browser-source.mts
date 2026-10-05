// Build-time adapter. Maintained TS retains existing public JavaScript URLs.
import { readFileSync } from 'node:fs';
import { resolve, sep, posix } from 'node:path';
import ts from 'typescript';
import { transformSync } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
const root = import.meta.dirname;
const sources: Readonly<Record<string, string>> = Object.freeze({
  'portal.js': 'portal.mts',
  'admin-portal/health-model.js': 'admin-portal/health-model.mts',
  'admin-portal/contextual-help.js': 'admin-portal/contextual-help.mts',
  'admin-portal/business-applications.js': 'admin-portal/business-applications.mts',
  'admin-portal/safety-removal.js': 'admin-portal/safety-removal.mts',
  'admin-portal/live-client.js': 'admin-portal/live-client.mts',
  'admin-portal/editorial.js': 'admin-portal/editorial.mts',
  'admin-portal/business-privacy.js': 'admin-portal/business-privacy.mts',
  'portal-select.js': 'portal-select.mts',
  'theme-init.js': 'theme-init.mts',
  'portal-config.js': 'portal-config.mts',
  'business-portal/application-form.js': 'business-portal/application-form.mts',
  'business-portal/application-client.js': 'business-portal/application-client.mts',
  'business-portal/access/access.js': 'business-portal/access/access.mts',
  'business-portal/application/application.js': 'business-portal/application/application.mts',
  'business-portal/business-mfa.js': 'business-portal/business-mfa.mts',
  'business-portal/business-verification.js': 'business-portal/business-verification.mts',
  'business-portal/business-realtime.js': 'business-portal/business-realtime.mts',
  'identity/setup-return.js': 'identity/setup-return.mts',
  'employee-setup/return.js': 'employee-setup/return.mts',
  'employee-setup/setup.js': 'employee-setup/setup.mts',
  'safety-removal/config.js': 'safety-removal/config.mts',
  'safety-removal/form.js': 'safety-removal/form.mts',
  'safety-removal/taxonomy.js': 'safety-removal/taxonomy.mts',
});
const moduleAssets = new Set([
  'admin-portal/business-applications.js',
  'admin-portal/business-privacy.js',
  'business-portal/application-client.js',
  'business-portal/access/access.js',
  'business-portal/application/application.js',
  'business-portal/application-form.js',
  'business-portal/business-mfa.js',
  'business-portal/business-verification.js',
  'business-portal/business-realtime.js',
]);
function assetName(asset: string): string {
  const normalized = asset.replaceAll('\\', '/');
  if (
    !normalized.endsWith('.js') ||
    normalized.startsWith('/') ||
    normalized.includes(':') ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw Error(`Invalid browser asset: ${asset}`);
  }
  return normalized;
}
export function browserSourcePath(asset: string): string {
  const name = assetName(asset);
  const file = resolve(root, sources[name] ?? name);
  if (!file.startsWith(`${root}${sep}`)) throw Error('Browser source escaped website root');
  return file;
}
export function browserAssetPath(source: string): string {
  const normalized = source.replaceAll('\\', '/');
  const match = Object.entries(sources).find(([, file]) => file === normalized);
  if (match) return match[0];
  return assetName(normalized);
}
export function isTypedBrowserAsset(asset: string): boolean {
  return Object.hasOwn(sources, assetName(asset));
}
export function compileBrowserSource(asset: string, code: string): string {
  if (!isTypedBrowserAsset(asset)) return code;
  // Rewrite only actual module specifiers for registered maintained sources.
  // String literals, comments and public URLs elsewhere in the code stay intact.
  const parsed = ts.createSourceFile(asset, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits: { start: number; end: number; text: string }[] = [];
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    if (
      ts.isImportDeclaration(statement) ? statement.importClause?.isTypeOnly : statement.isTypeOnly
    )
      continue;
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.endsWith('.mts')) continue;
    const source = posix.normalize(posix.join(posix.dirname(assetName(asset)), specifier.text));
    const target = Object.entries(sources).find(([, maintained]) => maintained === source)?.[0];
    if (!target) throw Error(`Unregistered browser module: ${specifier.text}`);
    const relative = posix.relative(posix.dirname(assetName(asset)), target);
    edits.push({
      start: specifier.getStart(parsed),
      end: specifier.end,
      text: JSON.stringify(relative.startsWith('.') ? relative : `./${relative}`),
    });
  }
  for (const edit of edits.reverse())
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return transformSync(code, {
    loader: 'ts',
    format: moduleAssets.has(assetName(asset)) ? 'esm' : 'iife',
    target: 'es2022',
    sourcefile: browserSourcePath(asset),
    legalComments: 'inline',
  }).code;
}
export function readBrowserSource(asset: string): string {
  return compileBrowserSource(asset, readFileSync(browserSourcePath(asset), 'utf8'));
}
