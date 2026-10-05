import instrumentLibrary from 'istanbul-lib-instrument';
const { createInstrumenter } = instrumentLibrary;
import { areaFor } from './check-coverage.mts';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
const root = path.resolve(import.meta.dirname, '..');
export function eligible(file: string) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  return /\.(?:mjs|js|mts)$/.test(relative) && areaFor(relative).length === 1;
}
export function instrument(source: string, file: string) {
  const tool = createInstrumenter({
    esModules: true,
    compact: false,
    coverageVariable: '__coverage__',
    produceSourceMap: true,
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
  });
  // Whitespace-preserving stripping keeps Node and zero-hit inventory maps
  // identical and attributes coverage to the maintained TypeScript source.
  const executable = file.endsWith('.mts')
    ? stripTypeScriptTypes(source, { mode: 'strip' })
    : source;
  const code = tool.instrumentSync(executable, file);
  const coverage = tool.lastFileCoverage();
  if (!coverage) throw Error(`Missing instrumentation map: ${file}`);
  return { code, coverage };
}
