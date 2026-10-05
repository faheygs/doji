// Offline, filename-only guard. Never reads credentials, contacts a provider,
// deletes a file, or guesses whether runtime code is unused.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function hygieneIssues(files: readonly string[]): string[] {
  const issues: string[] = [];
  for (const file of [...new Set(files)].sort()) {
    const path = file.replaceAll('\\', '/');
    if (
      /(^|\/)(node_modules|\.expo|\.gradle|\.wrangler|coverage|test-results|browser-test-output)\//.test(
        path,
      ) ||
      /^(supabase\/\.temp|\.claude|\.codex|artifacts|\.artifacts)\//.test(path) ||
      /^website\/\.(admin-dist|business-dist|safety-preview|business-admin-qa-[^/]+)\//.test(path)
    ) {
      issues.push(`${path}: generated/local state must not be committed`);
    }
    const name = path.split('/').at(-1) ?? '';
    if ((name === '.env' || name.startsWith('.env.')) && path !== '.env.example') {
      issues.push(`${path}: only the reviewed root .env.example may be committed`);
    }
    if (/\.(jks|p8|p12|key|mobileprovision|tsbuildinfo)$/.test(path)) {
      issues.push(`${path}: signing material or compiler cache must stay local`);
    }
  }
  return issues;
}

export function hygieneMain() {
  const root = resolve(import.meta.dirname, '..');
  // Include ignored files already in Git: .gitignore alone cannot remove them.
  // Include new nonignored files too, so local checks work before git add.
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
  const issues = hygieneIssues(files);
  if (issues.length) {
    console.error(`Repository hygiene failed:\n${issues.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Repository hygiene passed (${new Set(files).size} tracked/new files; offline path checks only).`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) hygieneMain();
