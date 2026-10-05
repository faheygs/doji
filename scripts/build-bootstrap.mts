// EAS invokes this artifact before dependencies exist. Maintain TypeScript;
// emit a dependency-free .mjs file for that bootstrap boundary, with CI drift checks.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const bootstrapSource = 'scripts/verify-build-env.mts';
export const bootstrapArtifact = 'scripts/verify-build-env.mjs';
const root = resolve(import.meta.dirname, '..');
export function compileBootstrap(source: string): string {
  const result = ts.transpileModule(source, {
    fileName: bootstrapSource,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
    },
  });
  if (result.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error))
    throw Error('Bootstrap emission failed; run the strict tooling typecheck');
  return '// Generated from scripts/verify-build-env.mts by scripts/build-bootstrap.mts. Do not edit.\n' + result.outputText;
}
export function assertBootstrapCurrent(source: string, artifact: string): void {
  if (compileBootstrap(source) !== artifact)
    throw Error('Preinstall bootstrap drift: run node scripts/build-bootstrap.mts --write');
}
export function verifyBootstrap(projectRoot = root): string {
  assertBootstrapCurrent(
    readFileSync(resolve(projectRoot, bootstrapSource), 'utf8'),
    readFileSync(resolve(projectRoot, bootstrapArtifact), 'utf8'),
  );
  return bootstrapArtifact;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--write'))
    throw Error('Use no arguments to verify, or --write to regenerate the bootstrap');
  if (process.argv[2] === '--write')
    writeFileSync(resolve(root, bootstrapArtifact), compileBootstrap(readFileSync(resolve(root, bootstrapSource), 'utf8')));
  verifyBootstrap();
  console.log('Dependency-free preinstall artifact matches strictly checked TypeScript source.');
}
