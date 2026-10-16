// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { developmentToken } from './development-config';

it('loads only a private external credential or injected token, never repository env', () => {
  const token = 'x'.repeat(43);
  expect(developmentToken({ DOJI_ADMIN_DEVELOPMENT_TOKEN: token })).toBe(token);
  const directory = mkdtempSync(join(tmpdir(), 'doji-dev-config-test-'));
  const file = join(directory, 'admin-development.env');
  try {
    writeFileSync(file, `DOJI_ADMIN_DEVELOPMENT_TOKEN=${token}\n`, { mode: 0o600 });
    expect(developmentToken({ DOJI_ADMIN_DEVELOPMENT_ENV_FILE: file })).toBe(token);
    writeFileSync(file, `DOJI_ADMIN_DEVELOPMENT_TOKEN=${token}\nVITE_SECRET=forbidden`);
    expect(() => developmentToken({ DOJI_ADMIN_DEVELOPMENT_ENV_FILE: file })).toThrow('missing or invalid');
    expect(() => developmentToken({ DOJI_ADMIN_DEVELOPMENT_ENV_FILE: resolve('package.json') })).toThrow('missing or invalid');
    expect(() => developmentToken({ DOJI_ADMIN_DEVELOPMENT_ENV_FILE: './.env' })).toThrow('missing or invalid');
  } finally { rmSync(file, { force: true }); rmdirSync(directory); }
});
