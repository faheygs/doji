// Bounded metadata/read-only inspection, no account details or configuration values.
import { cli } from './prepare-safety-launch.mts';
import { evidenceRows } from './release-evidence.mts';
import { linkedWorkspace } from './business-disabled-release-reads.mts';
const sql = `begin read only;set local statement_timeout='5s';
select jsonb_build_object(
 'relations',(select jsonb_agg(c.relname order by c.relname) from pg_class c
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='portal_identity_private' and c.relkind='r'),
 'session_columns',(select jsonb_agg(column_name order by ordinal_position) from information_schema.columns
  where table_schema='business_session_private' and table_name='settings'),
 'business_roles',(select jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin)
  order by rolname) from pg_roles where rolname in('doji_business_enrollment','doji_business_registration','doji_business_portal_login')),
 'realm',(select jsonb_build_object('enabled',enabled,'issuer',issuer,'audience',audience)
  from portal_identity_private.realms where realm='business'),
 'session_enabled',(select enabled from business_session_private.settings where singleton),
 'business_settings',(select jsonb_build_object('enabled',enabled,'realtime',realtime_enabled,
  'terms',application_terms_version,'privacy',privacy_version) from business_private.settings where singleton),
 'account_count',(select count(*) from (select 1 from business_private.accounts limit 101) q),
 'independent_count',(select count(*) from (select 1 from portal_identity_private.principals where realm='business' limit 101) q),
 'fingerprints',(select jsonb_object_agg(p.oid::regprocedure::text,md5(replace(p.prosrc,E'\\r','')))
  from pg_proc p where p.oid in (
    'public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure,
    'public.admin_business_application_command_v1(uuid,bigint,text,text,text,uuid)'::regprocedure,
    'business_private.privacy_target(uuid,boolean)'::regprocedure,
    'public.get_admin_business_privacy_access_v1(uuid,bigint)'::regprocedure,
    'public.claim_business_erasure_v1(uuid,uuid)'::regprocedure,
    'public.finish_business_erasure_v1(uuid,uuid)'::regprocedure))) as readiness;
rollback;`;
console.log(
  JSON.stringify(
    evidenceRows(
      cli([
        'db',
        'query',
        sql,
        '--linked',
        '--workdir',
        linkedWorkspace,
        '--output-format',
        'json',
      ]),
    ),
    null,
    2,
  ),
);
