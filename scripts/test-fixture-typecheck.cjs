// Compiler-only regressions: no probe execution, sockets, providers or secrets.
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'scripts/fixtures');
const configPath = path.join(fixtureRoot, 'tsconfig.json');
const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(loaded.error, undefined);
const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, fixtureRoot);
assert.deepEqual(config.errors, []);
assert.equal(config.options.strict, true);
assert.equal(config.options.noEmit, true);

// Every retained TS probe must stay in its own strict project, including future
// additions. No fixed five-file allowlist that could silently omit a new probe.
const fixtures = readdirSync(fixtureRoot, { recursive: true })
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
  .map((file) => path.join(fixtureRoot, file));
assert.ok(fixtures.length > 0);
const roots = new Set(config.fileNames.map((file) => path.resolve(file)));
for (const file of fixtures) assert.ok(roots.has(file), `Unchecked fixture: ${file}`);

// The offline npm: mapping must match the package actually used by the bundler.
const noble = JSON.parse(readFileSync(path.join(root, 'node_modules/@noble/hashes/package.json')));
assert.ok(config.options.paths[`npm:@noble/hashes@${noble.version}/sha256`]);

// Use a virtual file only. Intentionally invalid input must still be rejected
// by the real Deno, worker, pg and hash contracts; no ts-ignore/any escape hatch.
const virtualPath = path.join(fixtureRoot, 'employee-runtime/__typecheck_contract__.ts');
const source = [
  "import pg from '../../../infra/portal-identity-candidate/node_modules/pg/lib/index.js';",
  "import { sha256 } from 'npm:@noble/hashes@1.8.0/sha256';",
  'Deno.serve((request: string) => new Response(request));',
  "EdgeRuntime.userWorkers.create({ memoryLimitMb: 'large' });",
  "new pg.Client({ port: '5432' });",
  'sha256(123);',
].join('\n');
const host = ts.createCompilerHost(config.options);
const originalGetSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) =>
  path.resolve(file) === virtualPath
    ? ts.createSourceFile(file, source, languageVersion, true)
    : originalGetSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
const program = ts.createProgram([...config.fileNames, virtualPath], config.options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.deepEqual(
  diagnostics.map((item) => ({
    file: path.resolve(item.file?.fileName || ''),
    line: item.file?.getLineAndCharacterOfPosition(item.start).line + 1,
    code: item.code,
  })),
  [
    { file: virtualPath, line: 3, code: 2345 },
    { file: virtualPath, line: 4, code: 2322 },
    { file: virtualPath, line: 5, code: 2322 },
    { file: virtualPath, line: 6, code: 2345 },
  ],
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: (file) => file,
    getNewLine: () => '\n',
  }),
);
console.log(
  `PASS: ${fixtures.length} fixture entry points included; four invalid runtime contracts rejected; hash mapping matches installed version.`,
);
