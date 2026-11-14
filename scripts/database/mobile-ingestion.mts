import assert from 'node:assert/strict';
import { handleMobileWorkflowReport } from '../../supabase/functions/mobile-workflow-report/handler.ts';
import {
  workflowPhases,
  workflowOutcomes,
  validWorkflowPair,
} from '../../contracts/mobileWorkflowTelemetry.ts';
import type { WorkflowBatch } from '../../contracts/mobileWorkflowTelemetry.ts';
import { projectMobileWorkflowHours } from '../../infra/portal-identity/employee-mobile-workflows.mts';
import type { TestRoom } from './contracts.mts';

/** Composes the real HTTP handler, isolated Postgres ingestion and portal projection.
 * Auth is synthetic here; hosted project-Auth and physical-device acceptance remain separate.
 */
export async function mobileIngestion(room: TestRoom) {
  room.inspect();
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const quote = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  assert.equal(sql('select count(*) from mobile_workflow_private.hours;'), '0');
  assert.equal(sql('select count(*) from mobile_workflow_private.admission;'), '0');
  assert.equal(sql('select enabled from mobile_workflow_private.settings;'), 'f');
  const before =
    sql(`select md5(coalesce(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid),''))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace;`);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw Error('Unexpected external request in ingestion qualification');
  };
  const members = new Map([
    ['synthetic-ios-token-000001', '99100000-0000-4000-8000-000000000011'],
    ['synthetic-android-token-000001', '99100000-0000-4000-8000-000000000012'],
  ]);
  let authCalls = 0,
    writes = 0;
  const deps = {
    enabled: 'true',
    environment: 'staging',
    url: 'https://ohrcupagdoilkwhecict.supabase.co',
    now: Date.now,
    async authenticate(token: string) {
      authCalls++;
      return members.get(token) ?? null;
    },
    async record(actor: string, batch: WorkflowBatch) {
      assert.ok([...members.values()].includes(actor));
      writes++;
      return sql(
        `set role service_role;select public.record_mobile_workflow_counts_v1('${actor}',${quote(batch)});`,
      );
    },
  };
  const makeBatch = (platform: 'ios' | 'android'): WorkflowBatch => ({
    id: `wf:synthetic-${platform}-matrix-0001`,
    issuedAt: Date.now(),
    platform,
    rows: workflowPhases.flatMap((phase) =>
      workflowOutcomes
        .filter((outcome) => validWorkflowPair(phase, outcome))
        .map((outcome) => ({ phase, outcome, count: 1, capped: false })),
    ),
  });
  const request = (batch: unknown, token: string) =>
    new Request('https://local.invalid/mobile-workflow-report', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(batch),
    });
  const read = () =>
    projectMobileWorkflowHours(
      JSON.parse(sql('set role service_role;select public.get_mobile_workflow_counts_v1();')),
    );
  const send = async (batch: unknown, token: string, status: number) => {
    const response = await handleMobileWorkflowReport(request(batch, token), deps);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), '');
  };
  try {
    const ios = makeBatch('ios'),
      android = makeBatch('android');
    assert.equal(ios.rows.length, 30);
    await send(ios, 'synthetic-ios-token-000001', 503);
    assert.equal(read().status, 'disabled');
    assert.equal(sql('select count(*) from mobile_workflow_private.admission;'), '0');
    sql('update mobile_workflow_private.settings set enabled=true;');
    assert.deepEqual(read().rows, []);
    await send(ios, 'synthetic-ios-token-000001', 204);
    await send(android, 'synthetic-android-token-000001', 204);
    let view = read();
    assert.equal(view.status, 'ready');
    assert.equal(view.rows.length, 60);
    assert.ok(view.rows.every((row) => row.count === 1 && !row.capped));
    for (const value of [...members.values(), ios.id, android.id, 'actor_hash', 'batch_hash'])
      assert.ok(!JSON.stringify(view).includes(value));
    await send(ios, 'synthetic-ios-token-000001', 204);
    await send({ ...ios, id: 'wf:synthetic-ios-second-0002' }, 'synthetic-ios-token-000001', 429);
    assert.equal(sql('select sum(count) from mobile_workflow_private.hours;'), '60');
    const writesBefore = writes,
      authBefore = authCalls;
    await send({ ...ios, actor: [...members.values()][1] }, 'synthetic-ios-token-000001', 400);
    assert.equal(authCalls, authBefore);
    await send(ios, 'synthetic-unverified-token-000001', 401);
    assert.equal(writes, writesBefore);
    for (const patch of [{ enabled: 'false' }, { environment: 'production' }]) {
      const response = await handleMobileWorkflowReport(
        request(ios, 'synthetic-ios-token-000001'),
        { ...deps, ...patch },
      );
      assert.equal(response.status, 404);
    }
    assert.equal(writes, writesBefore);
    // The SQL gate hides retained evidence and stops admission without changing member contracts.
    sql('update mobile_workflow_private.settings set enabled=false;');
    await send(ios, 'synthetic-ios-token-000001', 503);
    view = read();
    assert.equal(view.status, 'disabled');
    assert.deepEqual(view.rows, []);
    assert.equal(sql('select sum(count) from mobile_workflow_private.hours;'), '60');
    assert.equal(
      sql(`select md5(coalesce(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid),''))
      from pg_proc where prokind='f' and pronamespace='public'::regnamespace;`),
      before,
    );
    return 'Mobile HTTP-to-SQL-to-portal: 60 fixed categories, separate actors, duplicate/rate fences, strict denial and retaining disable';
  } finally {
    globalThis.fetch = previousFetch;
    room.inspect();
    // This owned, network-disabled test room was empty at entry; no hosted target is accepted.
    sql(
      'delete from mobile_workflow_private.hours;delete from mobile_workflow_private.admission;update mobile_workflow_private.settings set enabled=false;',
    );
  }
}
