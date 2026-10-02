// Offline diagnostic only. Uses installed React Native AbortController and actual
// TypeScript modules with fake transport/timers; makes no network requests.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { AbortController } = require('abort-controller');

function load(relative, imports, globals = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, require: (id) => {
      if (!(id in imports)) throw new Error(`Unexpected dependency: ${id}`);
      return imports[id];
    },
    AbortController, URLSearchParams, Error, ...globals,
  }, { filename });
  return exports;
}

async function main() {
  const timers = new Set();
  const request = load('lib/requestSignal.ts', {}, {
    setTimeout(fn) { timers.add(fn); return fn; },
    clearTimeout(fn) { timers.delete(fn); },
  });
  const rpcError = load('lib/rpcQueryError.ts', {});
  const gateway = load('lib/scaleReadGateway.ts', {
    './supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: { access_token: 'offline-fixture' } } }),
    } } },
    './requestSignal': request,
    './rpcQueryError': rpcError,
  }, {
    process: { env: { EXPO_PUBLIC_SCALE_READ_URL: 'https://offline.invalid' } },
    fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    }),
  });
  const pending = gateway.readThroughScaleGateway('/fixture', () => { throw new Error('No direct fallback'); });
  await new Promise(setImmediate);
  assert.equal(timers.size, 1);
  for (const timer of [...timers]) timer();
  let rejected = false;
  let reason;
  await pending.catch((error) => { rejected = true; reason = error; });
  assert.equal(rejected, true);
  const gatewayResult = { rejected, rejectionType: typeof reason, rejectsWithError: reason instanceof Error };
  assert.equal(reason?.name, 'TimeoutError');
  assert.equal(gatewayResult.rejectsWithError, true);

  const feedResults = [];
  for (const unlocked of [false, true]) {
    let childSignal;
    let finish;
    const feed = load('lib/feedQueries.ts', {
      './supabase': { supabase: {} },
      './requestSignal': request,
      './rpcQueryError': rpcError,
      './scaleReadGateway': { readThroughScaleGateway: (_path, _direct, signal) => {
        childSignal = signal;
        return new Promise((resolve) => { finish = resolve; });
      } },
    });
    const parent = new AbortController();
    const result = feed.fetchFeedPostsPage({ userId: 'fixture', dailyEventId: 'fixture', audience: 'everyone', unlocked }, { offset: 0 }, parent.signal);
    const activeDeadlinesWhilePending = timers.size;
    parent.abort();
    const parentCancellationReachedTransport = childSignal.aborted;
    finish([]);
    await assert.rejects(result, { name: 'AbortError' });
    assert.equal(activeDeadlinesWhilePending, 1);
    assert.equal(parentCancellationReachedTransport, true);
    assert.equal(timers.size, 0);
    feedResults.push({ unlocked, activeDeadlinesWhilePending, parentCancellationReachedTransport });
  }
  console.log(JSON.stringify({ runtime: 'installed React Native AbortController polyfill', gatewayDeadline: gatewayResult, feedRequests: feedResults }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
