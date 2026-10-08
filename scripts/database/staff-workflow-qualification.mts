import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { record } from './contracts.mts';
import type { TestRoom } from './contracts.mts';

// Only the existing owned offline container is accepted; never a connection URL.
export function qualifyStaffWorkflow(room: TestRoom, phase: 'baseline' | 'indexed') {
  room.inspect();
  const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const fixture = read('scripts/database/staff-workflow-volume.sql');
  const checks = read('scripts/database/staff-workflow-volume-checks.sql');
  const candidate = read('docs/drafts/staff_workflow_extended_v1.sql');
  // Explain the exact inbox SELECT, not a hand-written approximation. Caller
  // checks authorization separately; these plans run as the function owner.
  const select = candidate.match(/ with sources as \([\s\S]*? into result;/)?.[0];
  assert.ok(select, 'Exact candidate inbox query required for plan inspection');
  const plans = ['all', 'mine', 'unassigned']
    .map((filter) => {
      const constants: Record<string, string> = {
        p_kind: "'all'",
        p_filter: `'${filter}'`,
        p_state: "'all'",
        p_limit: '25',
        p_after_at: "'2026-01-01T00:20:00Z'::timestamptz",
        p_after_key: "'suggestion:00000000-0000-4000-8000-000000000000'",
        mod: 'true',
        legal: 'true',
        ideas: 'true',
        business: 'true',
        privacy: 'true',
      };
      const query = select
        .replace(' into result;', ';')
        .replace(
          /\b(p_kind|p_filter|p_state|p_limit|p_after_at|p_after_key|mod|legal|ideas|business|privacy)\b/g,
          (key) => constants[key]!,
        );
      return `\\echo PLAN:${filter}\nexplain (analyze,buffers,format json) ${query}`;
    })
    .join('\n');
  const output = room.sql(`begin;set local role postgres;set local search_path=public,extensions;
    set local statement_timeout='90s';set local client_min_messages=error;${fixture}\n${checks}
    select set_config('request.jwt.claims','{"sub":"98000000-0000-4000-8000-000000000001","role":"doji_employee","aal":"aal2"}',true);
    ${plans}\nrollback;`);
  const summaries: Record<string, unknown>[] = [];
  for (const line of output.split('\n')) {
    if (!line.startsWith('{"type"')) continue;
    const value: unknown = JSON.parse(line);
    assert.ok(record(value) && Array.isArray(value.scenarios));
    for (const scenario of value.scenarios) {
      assert.ok(record(scenario));
      assert.equal(scenario.samples, 20);
      assert.ok(
        typeof scenario.p95_ms === 'number' && scenario.p95_ms < 250,
        `Local 250ms p95 budget exceeded: ${JSON.stringify(scenario)}`,
      );
    }
    summaries.push(value);
  }
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.samples, 1260);
  assert.equal(summaries[1]?.samples, 360);
  const planEvidence = output
    .split('PLAN:')
    .slice(1)
    .map((part) => {
      const newline = part.indexOf('\n');
      const filter = part.slice(0, newline);
      const parsed: unknown = JSON.parse(part.slice(newline + 1).trim());
      assert.ok(Array.isArray(parsed) && record(parsed[0]) && record(parsed[0].Plan));
      const nodes: Record<string, unknown>[] = [];
      const visit = (node: Record<string, unknown>) => {
        nodes.push(
          Object.fromEntries(
            [
              'Node Type',
              'Relation Name',
              'Index Name',
              'Actual Rows',
              'Actual Loops',
              'Rows Removed by Filter',
              'Shared Hit Blocks',
              'Shared Read Blocks',
            ]
              .filter((key) => key in node)
              .map((key) => [key, node[key]]),
          ),
        );
        if (Array.isArray(node.Plans))
          for (const child of node.Plans) {
            assert.ok(record(child));
            visit(child);
          }
      };
      visit(parsed[0].Plan);
      return { filter, executionMs: parsed[0]['Execution Time'], nodes };
    });
  assert.equal(planEvidence.length, 3);
  const evidence = {
    at: new Date().toISOString(),
    environment: 'owned offline disposable PostgreSQL',
    candidateSha256: createHash('sha256').update(candidate).digest('hex'),
    indexCandidateSha256:
      phase === 'indexed'
        ? createHash('sha256')
            .update(read('docs/drafts/staff_workflow_queue_indexes_v1.sql'))
            .digest('hex')
        : null,
    fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
    summaries,
    plans: planEvidence,
    limitations: [
      'Synthetic local timings only; no production capacity claim',
      'Single-session timing matrix, not simultaneous member traffic',
      'EXPLAIN uses explicit constants; does not prove cached generic PL/pgSQL plans',
      'Source update timings do not cover full RPC, network or provider latency',
    ],
  };
  mkdirSync('test-results/staff-workflow', { recursive: true });
  writeFileSync(
    `test-results/staff-workflow/qualification-${phase}.json`,
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(
    'PASS: 1,260 six-source read samples and 360 source-write samples; filters, bounds, ordering and event deltas verified',
  );
  console.log(
    `LOCAL QUALIFICATION evidence: test-results/staff-workflow/qualification-${phase}.json (not production capacity)`,
  );
}
