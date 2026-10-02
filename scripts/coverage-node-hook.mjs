// Test-only preload: execute real ES modules with Istanbul counters. No provider
// calls are permitted; tests must inject their own in-memory fetch boundaries.
import { registerHooks, syncBuiltinESMExports, createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
const require = createRequire(import.meta.url);
const { eligible, instrument } = require('./coverage-instrument.cjs');
const denied = () => {
  throw Error('Network is disabled in offline coverage tests. Inject a test transport.');
};
globalThis.fetch = denied;
net.connect = net.createConnection = tls.connect = denied;
net.Socket.prototype.connect = denied;
http.request = http.get = https.request = https.get = denied;
syncBuiltinESMExports();
const workerSources = pathToFileURL(
  resolve(import.meta.dirname, '../infra/doji-orchestrator/src') + '/',
).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      // Worker modules use bundler-style extensionless relative imports. Allow
      // Node's type stripper to load those exact local .ts siblings in tests;
      // never reinterpret packages, arbitrary paths, or runtime deployment code.
      if (
        error.code !== 'ERR_MODULE_NOT_FOUND' ||
        !context.parentURL?.startsWith(workerSources) ||
        !specifier.startsWith('./') ||
        extname(specifier)
      )
        throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.startsWith('file:')) return result;
    const file = fileURLToPath(url);
    if (!eligible(file)) return result;
    const source =
      typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString();
    return { ...result, source: instrument(source, file).code };
  },
});
const output = resolve(import.meta.dirname, '../test-results/coverage/current/node');
process.on('exit', () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(
    join(output, `process-${process.pid}.json`),
    JSON.stringify(globalThis.__coverage__ ?? {}),
  );
});
