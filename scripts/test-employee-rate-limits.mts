import { employeeEvidenceSetup } from './test-employee-local-evidence.mts';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { container } from './employee-test-runtime.mts';
import { errorOutput } from './database/contracts.mts';
function sql(source: string) {
  return execFileSync(
    'C:/Program Files/RedHat/Podman/podman.exe',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
}
const draft = readFileSync('docs/drafts/20260926011000_employee_portal_authorization.sql', 'utf8');
const limits =
  sql("select to_regclass('public.admin_employee_rate_limits') is not null;") === 't'
    ? ''
    : draft.slice(
        draft.indexOf('-- BEGIN EMPLOYEE MODERATION RATE LIMITS'),
        draft.indexOf('-- END EMPLOYEE MODERATION RATE LIMITS'),
      );
const source = `${employeeEvidenceSetup.replace('begin;', () => `begin;\n${limits}`)}
select set_config('test.employee_claims',current_setting('request.jwt.claims'),true);
select set_config('test.member_limiter_hash',md5(pg_get_functiondef('public.enforce_api_rate_limit(text,integer,integer)'::regprocedure)),true);
set local role doji_employee;
do $$begin
 begin perform public.enforce_employee_moderation_rate_limit_v1('comment');raise exception 'Direct limiter RPC allowed';exception when insufficient_privilege then null;end;
 begin perform 1 from public.admin_employee_rate_limits;raise exception 'Private budget exposed';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_set(current_setting('test.employee_claims')::jsonb,'{aal}','"aal1"')::text,true);
do $$begin
 begin perform public.enforce_employee_moderation_rate_limit_v1('comment');raise exception 'AAL1 allowed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
update public.admin_employees set status='disabled' where id=auth.uid();
do $$begin
 begin perform public.enforce_employee_moderation_rate_limit_v1('comment');raise exception 'Disabled allowed';exception when insufficient_privilege then null;end;
end$$;
update public.admin_employees set status='active',roles=array['legal_reviewer'] where id=auth.uid();
do $$begin
 begin perform public.enforce_employee_moderation_rate_limit_v1('comment');raise exception 'Non-moderator allowed';exception when insufficient_privilege then null;end;
end$$;
update public.admin_employees set roles=array['super_admin'] where id=auth.uid();
select set_config('request.jwt.claims','{}',true);
insert into public.comments(id,post_id,user_id,body) values('eeeeeeee-1111-4111-8111-eeeeeeeeeeee','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_setting('test.member_id')::uuid,'Synthetic body');
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
do $$begin
 begin update public.comments set body='Unauthorized employee edit' where id='eeeeeeee-1111-4111-8111-eeeeeeeeeeee';raise exception 'Employee changed member text';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.admin_employee_rate_limits) then raise exception 'Denied requests wrote budgets';end if;
end$$;
-- Exercise identical member threshold and rollback behavior through its real trigger.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal1')::text,true);
insert into public.api_rate_limit_buckets(user_id,action,bucket_started_at,request_count)
values(auth.uid(),'comment',to_timestamp(floor(extract(epoch from clock_timestamp())/60)*60),30);
do $$begin
 begin update public.comments set body='Member over limit' where id='eeeeeeee-1111-4111-8111-eeeeeeeeeeee';raise exception 'Member limit bypassed';
 exception when raise_exception then if sqlerrm not like 'Too many requests.%' then raise;end if;end;
 if (select body from public.comments where id='eeeeeeee-1111-4111-8111-eeeeeeeeeeee')<>'Synthetic body' then raise exception 'Rate-limited member edit committed';end if;
end$$;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
do $$declare n integer;begin
 for n in 1..30 loop perform public.enforce_employee_moderation_rate_limit_v1('comment');end loop;
 begin perform public.enforce_employee_moderation_rate_limit_v1('comment');raise exception 'Employee comment limit bypassed';
 exception when raise_exception then if sqlerrm not like 'Too many moderation actions.%' then raise;end if;end;
 for n in 1..10 loop perform public.enforce_employee_moderation_rate_limit_v1('poll_vote');end loop;
 begin perform public.enforce_employee_moderation_rate_limit_v1('poll_vote');raise exception 'Employee poll limit bypassed';
 exception when raise_exception then if sqlerrm not like 'Too many moderation actions.%' then raise;end if;end;
 if (select count(*) from public.admin_employee_rate_limits)<>2 then raise exception 'Unbounded employee ledger';end if;
 if exists(select 1 from public.api_rate_limit_buckets where user_id=auth.uid()) then raise exception 'Employee consumed member ledger';end if;
end$$;
update public.admin_employee_rate_limits set bucket_started_at=bucket_started_at-interval '60 seconds';
select public.enforce_employee_moderation_rate_limit_v1('comment');
do $$begin
 if (select request_count from public.admin_employee_rate_limits where employee_id=auth.uid() and action='comment')<>1 then raise exception 'Window did not reset';end if;
 if current_setting('test.member_limiter_hash')<>md5(pg_get_functiondef('public.enforce_api_rate_limit(text,integer,integer)'::regprocedure)) then raise exception 'Member limiter changed';end if;
end$$;
rollback;`;
try {
  sql(source);
  console.log(
    'PASS: AAL/role/disabled/private-ledger/status-only boundaries; employee 30/10 caps and bounded reset; unchanged member threshold and rollback.',
  );
} catch (e) {
  console.error(errorOutput(e, 'stderr'));
  process.exitCode = 1;
}
