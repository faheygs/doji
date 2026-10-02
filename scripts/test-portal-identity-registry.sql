create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label; end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(statement text,expected text,label text) returns text language plpgsql as $$
begin
 begin execute statement; exception when others then
  if sqlstate=expected then return 'PASS: '||label;end if;raise;
 end;
 raise exception 'FAIL: % unexpectedly succeeded',label;
end$$;
select pg_temp.ok(not exists(select 1 from portal_identity_private.realms),'no provider enabled by installation');
select pg_temp.ok(not pg_has_role('authenticator','doji_identity_resolver','member'),'authenticator cannot assume resolver');
select pg_temp.ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='doji_identity_resolver'),'resolver is non-login and non-inheriting');
select pg_temp.ok(not has_schema_privilege('authenticated','portal_identity_private','usage'),'members cannot access identity schema');
select pg_temp.ok(not has_schema_privilege('doji_employee','portal_identity_private','usage'),'employee browser cannot access identity schema');
select pg_temp.ok(not has_schema_privilege('doji_business','portal_identity_private','usage'),'business browser cannot access identity schema');
select pg_temp.ok(not has_schema_privilege('service_role','portal_identity_private','usage'),'existing service key gets no new identity access');
select pg_temp.ok(not has_function_privilege('doji_identity_resolver','portal_identity_private.bind_identity(text,text,uuid,text)','execute'),'resolver cannot create mappings');
select pg_temp.ok(not has_table_privilege('doji_identity_resolver','portal_identity_private.principals','select'),'resolver cannot read directory');
insert into portal_identity_private.realms(realm,issuer,audience) values
 ('business','https://issuer.example.test/','business-client'),('employee','https://issuer.example.test/','employee-client');
select pg_temp.denied($q$insert into portal_identity_private.realms values('member',true,'https://member.example.test/','member')$q$,'23514','member auth cannot become a portal realm');
select pg_temp.denied($q$update portal_identity_private.realms set audience='business-client' where realm='employee'$q$,'23505','same issuer and audience cannot identify both realms');
select portal_identity_private.bind_identity('business','same-subject','81000000-0000-4000-8000-000000000001','synthetic-business-review');
select portal_identity_private.bind_identity('employee','same-subject','81000000-0000-4000-8000-000000000002','synthetic-employee-review');
select pg_temp.ok((select count(*)=2 from portal_identity_private.principals),'same subject in two directories produces independent principals');
select pg_temp.ok(not exists(select 1 from information_schema.columns where table_schema='portal_identity_private' and column_name='email'),'email is not an identity key');
select portal_identity_private.bind_identity('business','same-subject','81000000-0000-4000-8000-000000000001','replay');
select pg_temp.ok((select count(*)=2 from portal_identity_private.mapping_audit),'mapping replay adds no duplicate audit');
select pg_temp.denied($q$select portal_identity_private.bind_identity('business','same-subject','81000000-0000-4000-8000-000000000003','rebind')$q$,'42501','subject cannot be rebound to another principal');
select pg_temp.denied($q$select portal_identity_private.bind_identity('business','new-subject','81000000-0000-4000-8000-000000000002','cross realm')$q$,'23505','principal cannot belong to two realms');
select pg_temp.ok(exists(select 1 from auth.users where role='authenticated'),'synthetic member identity exists');
select pg_temp.denied($q$select portal_identity_private.bind_identity('business','member-subject',(select id from auth.users where role='authenticated' limit 1),'member takeover')$q$,'42501','existing member cannot be converted');
select pg_temp.denied($q$update portal_identity_private.realms set issuer='https://other.example.test/' where realm='business'$q$,'42501','bound issuer cannot be changed');
select pg_temp.denied($q$select * from portal_identity_private.resolve_identity('business','https://issuer.example.test/','business-client','same-subject','sid',false)$q$,'42501','disabled realm fails closed');
update portal_identity_private.realms set enabled=true;
select pg_temp.denied($q$select * from portal_identity_private.resolve_identity('business','https://issuer.example.test/','business-client','same-subject','sid',false)$q$,'42501','pending principal has no access');
select portal_identity_private.set_principal_state('81000000-0000-4000-8000-000000000001',1,'active','synthetic activation');
select portal_identity_private.set_principal_state('81000000-0000-4000-8000-000000000002',1,'active','synthetic activation');
select pg_temp.denied($q$select portal_identity_private.set_principal_state('81000000-0000-4000-8000-000000000001',1,'disabled','stale')$q$,'PT409','stale state revision rejected');
set local role doji_identity_resolver;
select pg_temp.ok((select principal_id='81000000-0000-4000-8000-000000000001'::uuid from portal_identity_private.resolve_identity('business','https://issuer.example.test/','business-client','same-subject','sid',false)),'business resolves its own principal');
select pg_temp.ok((select principal_id='81000000-0000-4000-8000-000000000002'::uuid from portal_identity_private.resolve_identity('employee','https://issuer.example.test/','employee-client','same-subject','sid',true)),'employee resolves separate principal with MFA');
select pg_temp.denied($q$select * from portal_identity_private.resolve_identity('employee','https://issuer.example.test/','employee-client','same-subject','sid',false)$q$,'42501','employee requires MFA independently');
select pg_temp.denied($q$select * from portal_identity_private.resolve_identity('business','https://issuer.example.test/','employee-client','same-subject','sid',true)$q$,'42501','wrong audience cannot cross realms');
select pg_temp.denied($q$select * from portal_identity_private.resolve_identity('business','https://other.example.test/','business-client','same-subject','sid',true)$q$,'42501','wrong issuer cannot cross realms');
select pg_temp.denied($q$select * from portal_identity_private.resolve_identity('business','https://issuer.example.test/','business-client','unknown','sid',true)$q$,'42501','unknown subject cannot inherit matching email access');
reset role;
select portal_identity_private.revoke_session('business','same-subject','sid','synthetic logout');
select portal_identity_private.revoke_session('business','same-subject','sid','duplicate logout');
select pg_temp.ok((select count(*)=1 from portal_identity_private.mapping_audit where action='session.revoked'),'session revocation is idempotent');
select pg_temp.denied($q$select * from portal_identity_private.resolve_identity('business','https://issuer.example.test/','business-client','same-subject','sid',false)$q$,'42501','revoked business session denied');
select pg_temp.ok((select count(*)=1 from portal_identity_private.resolve_identity('employee','https://issuer.example.test/','employee-client','same-subject','sid',true)),'identical session ID in employee directory unaffected');
select pg_temp.ok((select count(*)=1 from portal_identity_private.resolve_identity('business','https://issuer.example.test/','business-client','same-subject','other-session',false)),'other business session unaffected by local logout');
select portal_identity_private.set_principal_state('81000000-0000-4000-8000-000000000001',2,'disabled','synthetic closure');
select pg_temp.denied($q$select * from portal_identity_private.resolve_identity('business','https://issuer.example.test/','business-client','same-subject','other-session',false)$q$,'42501','closure disables every business session');
select pg_temp.ok((select count(*)=1 from portal_identity_private.resolve_identity('employee','https://issuer.example.test/','employee-client','same-subject','sid',true)),'business closure does not disable employee');
select portal_identity_private.set_principal_state('81000000-0000-4000-8000-000000000001',3,'deleted','synthetic deletion marker');
select pg_temp.denied($q$select portal_identity_private.set_principal_state('81000000-0000-4000-8000-000000000001',4,'active','reactivate')$q$,'PT409','deleted principal cannot be reactivated');
select pg_temp.denied($q$select * from portal_identity_private.resolve_identity('business','https://issuer.example.test/','business-client','same-subject','other-session',false)$q$,'42501','deleted principal cannot authenticate');
