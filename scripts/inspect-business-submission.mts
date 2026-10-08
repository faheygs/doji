// One bounded read-only diagnosis. No identity, session, credential or form contents printed.
import { cli } from './prepare-safety-launch.mts';
import { evidenceRows } from './release-evidence.mts';
const sql = `begin read only; set local statement_timeout='5s';
select jsonb_build_object(
 'at',clock_timestamp(),
 'commands_enabled',(select enabled from portal_identity_private.business_command_settings where singleton),
 'settings',(select jsonb_build_object('enabled',enabled,'terms',application_terms_version,'privacy',privacy_version) from business_private.settings where singleton),
 'applications',(select jsonb_agg(jsonb_build_object('state',state,'revision',revision,'updated',updated_at)) from (select state,revision,updated_at from business_private.applications order by updated_at desc limit 5) a),
 'account_count',(select count(*) from (select 1 from business_private.accounts limit 11) a),
 'definitions',(select jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) from pg_proc p where p.oid in (
 'portal_identity_private.business_application_core(uuid,text,bigint,jsonb,text,text,uuid)'::regprocedure,
 'portal_identity_private.business_application_command(text,text,text,text,boolean,text,bigint,jsonb,text,text,uuid)'::regprocedure,
 'business_private.validate_details(jsonb,boolean)'::regprocedure))
) as diagnosis; rollback;`;
const rows = evidenceRows(
  cli([
    'db',
    'query',
    sql,
    '--linked',
    '--workdir',
    'D:/ChallengeApp/DoIt',
    '--output-format',
    'json',
  ]),
);
console.log(JSON.stringify(rows, null, 2));
if (process.argv[2] === 'validate-url') {
  const diagnosis = rows[0]?.diagnosis as { definitions: Record<string, string> };
  const definition = diagnosis.definitions['business_private.validate_details(jsonb,boolean)'];
  const pattern = definition?.match(/!~'([^']+)'/)?.[1];
  if (!pattern || !pattern.includes('https')) throw Error('Exact website validator not found');
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const query = `begin read only;set local statement_timeout='3s';select
    current_setting('standard_conforming_strings') as standard_strings,
    'https://example.com' ~ ${quote(pattern)} as valid_https_accepted,
    'https://example.com' ~ ${quote(pattern.replaceAll('\\\\.', '[.]'))} as corrected_valid_https_accepted;
    rollback;`;
  console.log(
    JSON.stringify(
      evidenceRows(
        cli([
          'db',
          'query',
          query,
          '--linked',
          '--workdir',
          'D:/ChallengeApp/DoIt',
          '--output-format',
          'json',
        ]),
      ),
      null,
      2,
    ),
  );
}
