// Owner-approved local staging credential handoff. No provider calls.
// Bind loopback only, exact Host/Origin + CSRF, bounded input, never echo secrets.
import { createCaptureServer } from './workos-staging-capture-form.mjs';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve('.artifacts/workos-staging');
mkdirSync(root, { recursive: true });
const configPath = resolve(root, 'credentials.json');
if (existsSync(configPath)) throw Error('Configuration already exists; review before replacing');
const ignored = execFileSync('git', ['check-ignore', configPath], { encoding: 'utf8' }).trim();
if (!ignored) throw Error('Credential path must be Git ignored');
if (process.platform === 'win32') {
  const owner = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
  execFileSync('icacls', [root, '/inheritance:r', '/grant:r', `${owner}:(OI)(CI)F`], {
    stdio: 'pipe',
  });
}
const expected = {
  business: {
    environment: 'environment_01M3T51295MF7KN0PSYACY5AQN',
    clientId: 'client_01M3T512MY3QKK7QVFYGWJ1WDR',
  },
  employee: {
    environment: 'environment_01M3T5GJ8PRV7JJB3P9CPXRNHF',
    clientId: 'client_01M3T5GJM7JZVQQ7CGHNJD0QMZ',
  },
};
const origin = 'http://127.0.0.1:4199';
const server = createCaptureServer({
  expected,
  persist(config) {
    writeFileSync(configPath, JSON.stringify(config), {
      flag: 'wx',
      mode: 0o600,
    });
  },
  onSaved() {
    console.log('Both staging credentials saved; secrets omitted.');
  },
});
server.listen(4199, '127.0.0.1', () => console.log('Staging-only credential handoff: ' + origin));
const expiry = setTimeout(
  () => {
    server.close();
    console.log('Local handoff expired.');
  },
  60 * 60 * 1000,
);
expiry.unref();
