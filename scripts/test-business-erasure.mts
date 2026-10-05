import assert from 'node:assert/strict';
import { executeBusinessErasure } from '../supabase/functions/_shared/business-erasure.ts';
import { present } from './employee-test-fixtures.mts';
interface ScenarioOptions {
  gone?: boolean;
  fresh?: boolean;
  enabled?: boolean;
  wrongId?: boolean;
  member?: boolean;
  timeout?: boolean;
  state?: string;
  claimStatus?: number;
  finishStatus?: number;
  readStatus?: number;
  deleteStatus?: number;
}
const caseId = '79000000-0000-4000-8000-000000000001',
  executionId = '79000000-0000-4000-8000-000000000002',
  accountId = '79000000-0000-4000-8000-000000000003';
const env = {
  enabled: true,
  supabaseUrl: 'https://synthetic.example.test',
  serviceKey: 'sb_secret_synthetic',
};
let count = 0;
async function scenario(options: ScenarioOptions = {}) {
  const calls: { path: string; method: string | undefined }[] = [];
  let gone = options.gone ?? false;
  const upstream: NonNullable<Parameters<typeof executeBusinessErasure>[3]> = async (url, init) => {
    assert.ok(init, 'Expected explicit erasure request options');
    const path = new URL(url instanceof Request ? url.url : url).pathname;
    calls.push({ path, method: init.method });
    assert.ok(init.signal);
    if (path.endsWith('/claim_business_erasure_v1'))
      return Response.json(
        {
          account_id: accountId,
          delete_authorized: options.fresh ?? true,
          state: options.state ?? 'executing',
        },
        { status: options.claimStatus ?? 200 },
      );
    if (path.endsWith('/finish_business_erasure_v1'))
      return Response.json({ state: 'primary_erased' }, { status: options.finishStatus ?? 200 });
    assert.equal(path, `/auth/v1/admin/users/${accountId}`);
    if (init.method === 'GET') {
      if (options.readStatus) return Response.json({}, { status: options.readStatus });
      return gone
        ? Response.json({ code: 'user_not_found' }, { status: 404 })
        : Response.json({
            id: options.wrongId ? 'wrong' : accountId,
            role: options.member ? 'authenticated' : 'doji_business',
            app_metadata: { account_type: 'business' },
          });
    }
    assert.equal(init.method, 'DELETE');
    assert.ok(typeof init.body === 'string');
    assert.deepEqual(JSON.parse(init.body), { should_soft_delete: false });
    if (options.timeout) throw Error('synthetic timeout');
    if (!options.deleteStatus) gone = true;
    return Response.json({}, { status: options.deleteStatus ?? 200 });
  };
  let result: Awaited<ReturnType<typeof executeBusinessErasure>> | undefined, error: unknown;
  try {
    result = await executeBusinessErasure(
      { ...env, enabled: options.enabled ?? true },
      caseId,
      executionId,
      upstream,
    );
  } catch (e) {
    error = e;
  }
  return { calls, result, error };
}
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  await fn();
  count++;
  console.log(`PASS: ${name}`);
}
await check('default off performs no request', async () => {
  const r = await scenario({ enabled: false });
  assert.equal(present(r.result).state, 'disabled');
  assert.equal(r.calls.length, 0);
});
await check(
  'approved exact Auth target is deleted once, absence checked, then database finalized',
  async () => {
    const r = await scenario();
    assert.equal(present(r.result).state, 'primary_erased');
    assert.equal(r.calls.filter((c) => c.method === 'DELETE').length, 1);
    assert.equal(r.calls.length, 5);
  },
);
for (const options of [
  { member: true },
  { wrongId: true },
  { readStatus: 503 },
  { readStatus: 404 },
])
  await check(`unverified target fails closed ${JSON.stringify(options)}`, async () => {
    const r = await scenario(options);
    assert.ok(r.error);
    assert.equal(r.calls.filter((c) => c.method === 'DELETE').length, 0);
  });
await check(
  'previous execution with live identity requires review, never repeats deletion',
  async () => {
    const r = await scenario({ fresh: false });
    assert.equal(present(r.result).state, 'needs_auth_review');
    assert.equal(r.calls.length, 2);
  },
);
await check('ambiguous deletion does not mark case complete or retry', async () => {
  const r = await scenario({ timeout: true });
  assert.ok(r.error);
  assert.equal(r.calls.length, 3);
});
await check('provider rejection retains unfinished case', async () => {
  const r = await scenario({ deleteStatus: 503 });
  assert.equal(present(r.result).state, 'needs_auth_review');
  assert.equal(r.calls.length, 3);
});
await check(
  'retry after confirmed Auth absence finishes primary cleanup without another deletion',
  async () => {
    const r = await scenario({ gone: true, fresh: false });
    assert.equal(present(r.result).state, 'primary_erased');
    assert.equal(r.calls.length, 3);
  },
);
await check('database finalization failure stays recoverable', async () => {
  const r = await scenario({ gone: true, fresh: false, finishStatus: 503 });
  assert.ok(r.error);
  assert.equal(r.calls.length, 3);
});
await check(
  'terminal primary outcome causes no Auth request or claim of provider cleanup',
  async () => {
    const r = await scenario({ fresh: false, state: 'primary_erased' });
    assert.equal(present(r.result).state, 'primary_erased');
    assert.equal(r.calls.length, 1);
  },
);
await check('missing approval cannot reach Auth', async () => {
  const r = await scenario({ claimStatus: 403 });
  assert.ok(r.error);
  assert.equal(r.calls.length, 1);
});
console.log(`${count} erasure orchestration checks passed; every upstream stubbed.`);
