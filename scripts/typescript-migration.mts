// Read-only ratchet: new maintained JavaScript is rejected; the explicit legacy
// inventory shrinks as real strict-TypeScript conversions land. Never rewrites it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { verifyBootstrap } from './build-bootstrap.mts';
import { verifyCompat } from './build-compat.mts';

// Native Node execution does not type-check. Every migrated module must also
// belong to an explicitly strict project executed by the root typecheck command.
export function uncheckedModules(files: readonly string[], checked: readonly string[]) {
  const included = new Set(checked);
  return [...new Set(files)]
    .filter((file) => /\.[cm]ts$/.test(file) && !/\.d\.[cm]ts$/.test(file) && !included.has(file))
    .sort();
}
function checkedModules(root: string) {
  const projects = [
    'infra/portal-identity-candidate/tsconfig.json',
    'scripts/tsconfig.tooling.json',
    'website/tsconfig.json',
  ];
  return projects.flatMap((project) => {
    const path = resolve(root, project);
    const read = ts.readConfigFile(path, ts.sys.readFile);
    if (read.error) throw Error(`Cannot read strict project: ${project}`);
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, resolve(path, '..'));
    if (parsed.errors.length || parsed.options.strict !== true)
      throw Error(`Invalid strict project: ${project}`);
    return parsed.fileNames.map((file) =>
      file.replaceAll('\\', '/').slice(root.replaceAll('\\', '/').length + 1),
    );
  });
}

export function assessMigration(files: readonly string[], legacy: readonly string[]) {
  const actual = new Set(files.filter((file) => /\.(?:[cm]?js|jsx)$/.test(file)));
  const allowed = new Set(legacy);
  return {
    remaining: actual.size,
    added: [...actual].filter((file) => !allowed.has(file)).sort(),
    stale: [...allowed].filter((file) => !actual.has(file)).sort(),
    duplicates: legacy.length !== allowed.size,
  };
}
export function migrationMain() {
  const root = resolve(import.meta.dirname, '..');
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  )
    .split('\0')
    .filter((file) => file && existsSync(resolve(root, file)));
  const value: unknown = JSON.parse(
    readFileSync(resolve(root, 'scripts/typescript-migration-baseline.json'), 'utf8'),
  );
  if (!Array.isArray(value) || !value.every((file: unknown) => typeof file === 'string'))
    throw Error('Invalid JavaScript migration inventory');
  // Bootstrap and legacy CJS consumer artifacts must run before/without a TS
  // loader. Exempt both only after exact regeneration verification, never by glob.
  const generated = new Set([verifyBootstrap(root), verifyCompat(root)]);
  const report = assessMigration(
    files.filter((file) => !generated.has(file)),
    value,
  );
  const unchecked = uncheckedModules(files, checkedModules(root));
  if (report.added.length || report.stale.length || report.duplicates || unchecked.length) {
    console.error(
      'TypeScript migration guard failed:',
      JSON.stringify({ ...report, unchecked }, null, 2),
    );
    process.exitCode = 1;
  } else {
    console.log(
      report.remaining
        ? `TypeScript migration guard passed; ${report.remaining} legacy JavaScript files remain (not complete).`
        : 'TypeScript migration complete: zero maintained JavaScript files; two compiler-verified compatibility artifacts.',
    );
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) migrationMain();
