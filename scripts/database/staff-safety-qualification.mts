import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { TestRoom } from './contracts.mts';
export function qualifySafetyQueue(room: TestRoom) {
  room.inspect();
  const candidate = readFileSync('docs/drafts/staff_safety_queue_v1.sql', 'utf8');
  const fixture = readFileSync('scripts/database/staff-workflow-volume.sql', 'utf8');
  const output = room.sql(`begin;set local role postgres;set local search_path=public,extensions;
    set local statement_timeout='90s';${fixture}
    update staff_workflow_private.settings set safety_queue_enabled=true;
    select set_config('request.jwt.claims','{"sub":"98000000-0000-4000-8000-000000000001","role":"doji_employee","aal":"aal2"}',true);
    create temp table safety_timings(area text,closed boolean,filter text,ms numeric);
    do $$declare area text; closed boolean; filter text; i int; started timestamptz; page jsonb;begin
     foreach area in array array['moderation','restricted_safety'] loop
      foreach closed in array array[false,true] loop
       foreach filter in array array['all','mine','unassigned'] loop
        for i in 1..20 loop
         started:=clock_timestamp();
         page:=public.get_admin_safety_work_page_v1(area,closed,'all',filter,25);
         insert into safety_timings values(area,closed,filter,extract(epoch from clock_timestamp()-started)*1000);
         if jsonb_array_length(page->'items')<>25 then raise exception 'Expected full bounded page';end if;
         if page->>'queue'<>area or (page->>'closed')::boolean<>closed then raise exception 'Wrong page scope';end if;
        end loop;
       end loop;
      end loop;
     end loop;
    end$$;
    select jsonb_agg(to_jsonb(t)) from (select area,closed,filter,count(*) samples,
     percentile_cont(.95) within group(order by ms) p95_ms from safety_timings group by area,closed,filter) t;
    rollback;`);
  const line = output.split('\n').find(line => line.startsWith('[{'));
  assert.ok(line, 'Expected local safety timing evidence');
  const samples: { samples: number; p95_ms: number }[] = JSON.parse(line);
  assert.equal(samples.length, 12);
  for (const sample of samples) {
    assert.equal(sample.samples, 20);
    assert.ok(sample.p95_ms < 250, `Safety queue local budget exceeded: ${JSON.stringify(sample)}`);
  }
  mkdirSync('test-results/staff-workflow', {recursive:true});
  writeFileSync('test-results/staff-workflow/safety-qualification.json', JSON.stringify({
    at: new Date().toISOString(), candidateSha256: createHash('sha256').update(candidate).digest('hex'),
    safetySourceRows: 15000, samples,
    limitation: 'Synthetic offline timings, not production latency or capacity; shared rollout remains gated.',
  }, null, 2));
  console.log('PASS: 240 unified safety reads across both areas, open/closed and all/mine/unassigned; local p95 <250ms');
}
