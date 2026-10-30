begin;
set local search_path=public,extensions;
select plan(33);
select is(public.record_workflow_health_v1('activate','succeeded','command',10),false,'observation gate defaults off');
select is((public.run_scheduler_log_retention_v1()->>'enabled')::boolean,false,'deletion gate defaults off');
select is((public.get_workflow_health_v1()->>'enabled')::boolean,false,'disabled is explicit');
select ok(not has_function_privilege('authenticated','public.record_workflow_health_v1(text,text,text,integer,jsonb)','execute'),'members cannot forge observations');
select ok(not has_function_privilege('anon','public.get_workflow_health_v1()','execute'),'anonymous cannot read monitoring');
select ok(not has_function_privilege('authenticated','public.run_scheduler_log_retention_v1(integer)','execute'),'members cannot delete logs');
select ok(not has_schema_privilege('service_role','workflow_health_private','usage'),'service cannot directly edit gates or holds');
select throws_ok($$select public.record_workflow_health_v1('private answer','failed','command',1)$$,'22023','Invalid workflow observation','workflow cardinality fixed');
select throws_ok($$select public.record_workflow_health_v1('activate','failed','command',1,'{"password":"secret"}')$$,'22023','Invalid workflow counts','private payload rejected');
select throws_ok($$select public.record_workflow_health_v1('maintenance','failed','command',1,'{"deleted_post_media":-1}')$$,'22023','Invalid workflow counts','negative count rejected');
select throws_ok($$select public.record_workflow_health_v1('activate','failed','command',1,'{"deleted_post_media":1}')$$,'22023','Cleanup counts require maintenance','unrelated receipt rejected');
select throws_ok($$select public.run_scheduler_log_retention_v1(5001)$$,'22023','Invalid retention batch','scan bounded');
update workflow_health_private.settings set observations_enabled=true where id;
select public.record_workflow_health_v1('activate','succeeded','command',12);
select public.record_workflow_health_v1('activate','succeeded','command',18);
select is((select attempts from workflow_health_private.hours where workflow='activate'),2::bigint,'counts observed attempts, not unique actions');
select is((select elapsed_ms from workflow_health_private.hours where workflow='activate'),30::bigint,'elapsed totals retained');
update workflow_health_private.hours set hour=hour-interval '24 hours';
select public.record_workflow_health_v1('activate','succeeded','command',7);
select is((select attempts from workflow_health_private.hours where workflow='activate'),1::bigint,'old hourly slot replaced');
select is((select count(*) from workflow_health_private.hours),1::bigint,'replacement does not grow storage');
select public.record_workflow_health_v1('maintenance','failed','post_media',25,'{"deleted_post_media":2}');
select is((select phase from workflow_health_private.receipts where workflow='maintenance'),'post_media','failed phase retained');
select is((select counts->>'deleted_post_media' from workflow_health_private.receipts where workflow='maintenance'),'2','partial cleanup receipt retained');
select public.record_workflow_health_v1('maintenance','deferred','complete',30,'{"deleted_post_media":3}');
select is((select count(*) from workflow_health_private.receipts where workflow='maintenance'),2::bigint,'deferred does not erase failed receipt');
select public.record_workflow_health_v1('maintenance','failed','account_media',25,'{"deleted_post_media":4}');
select is((select counts->>'deleted_post_media' from workflow_health_private.hours where workflow='maintenance' and outcome='failed'),'6','hourly confirmed cleanup counts survive replacement of latest receipt');

-- No scheduler runs in this network-disabled test container. Synthetic rows only.
insert into cron.job_run_details(jobid,runid,username,database,command,status,start_time,end_time) values
 (800001,800001,current_user,current_database(),'synthetic','succeeded',now()-interval '32 days',now()-interval '31 days'),
 (800001,800002,current_user,current_database(),'synthetic','failed',now()-interval '92 days',now()-interval '91 days'),
 (800001,800003,current_user,current_database(),'synthetic','succeeded',now()-interval '31 days',now()-interval '30 days'),
 (800001,800004,current_user,current_database(),'synthetic','failed',now()-interval '91 days',now()-interval '90 days'),
 (800001,800005,current_user,current_database(),'synthetic','running',now()-interval '100 days',null),
 (800001,800006,current_user,current_database(),'synthetic','unknown',now()-interval '100 days',now()-interval '99 days'),
 (800001,800007,current_user,current_database(),'synthetic','succeeded',now()-interval '100 days',null),
 (800001,800008,current_user,current_database(),'synthetic','failed',now()-interval '100 days',now()-interval '99 days'),
 (800002,800009,current_user,current_database(),'synthetic','succeeded',now()-interval '100 days',now()-interval '99 days');
insert into workflow_health_private.scheduler_holds(scope,target,evidence_reference) values
 ('run',800008,'11111111-1111-4111-8111-111111111111'),
 ('job',800002,'11111111-1111-4111-8111-111111111111');
select public.run_scheduler_log_retention_v1();
select is((select count(*) from cron.job_run_details where runid between 800001 and 800009),9::bigint,'disabled preserves every log');
update workflow_health_private.settings set scheduler_retention_enabled=true,scheduler_cursor=800000 where id;
select public.run_scheduler_log_retention_v1(1);
select is((select count(*) from cron.job_run_details where runid between 800001 and 800009),8::bigint,'one-row scan deletes only one eligible run');
select is((select scheduler_cursor from workflow_health_private.settings),800001::bigint,'scan cursor advances');
select public.run_scheduler_log_retention_v1(500);
select is((select count(*) from cron.job_run_details where runid=800002),0::bigint,'failure older than 90 days removed');
select is((select count(*) from cron.job_run_details where runid in (800003,800004)),2::bigint,'exact 30/90-day boundaries preserved');
select is((select count(*) from cron.job_run_details where runid in (800005,800006,800007)),3::bigint,'active, unknown and unfinished runs preserved');
select is((select count(*) from cron.job_run_details where runid in (800008,800009)),2::bigint,'run and job holds preserved');
select is((select scheduler_cursor from workflow_health_private.settings),0::bigint,'completed scan wraps for next pass');
select is((select failed_deleted from workflow_health_private.scheduler_receipt),1,'deletion receipt stores actual committed count');
insert into workflow_health_private.scheduler_holds(scope,target,evidence_reference)
 values('all',0,'11111111-1111-4111-8111-111111111111');
update cron.job_run_details set end_time=now()-interval '100 days' where runid=800003;
select public.run_scheduler_log_retention_v1();
select is((select count(*) from cron.job_run_details where runid=800003),1::bigint,'global evidence hold blocks cleanup');
select is((public.get_workflow_health_v1()->'hours'->0->>'workflow'),'activate','bounded monitoring snapshot available');
select is((public.get_workflow_health_v1()->'scheduler_receipt'->>'succeeded_deleted'),'0','held scan never claims deletion');
select ok(not has_table_privilege('authenticated','workflow_health_private.scheduler_holds','select'),'member cannot read holds');
select * from finish();
rollback;
