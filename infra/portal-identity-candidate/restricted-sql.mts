// Server-only, fixed-query transport. Each operation commits separately; callers
// must never hold a connection across WorkOS HTTP calls. No service-role key,
// browser SQL, member JWT, database-owner connection or native Auth integration.
import { record } from './portal-contracts.mts';
import { employeeWorkflowSql } from './employee-workflow-contracts.mts';
import { employeeHealthSql } from './employee-health-contracts.mts';
import type { PortalRealm } from './portal-contracts.mts';
import type { SqlParameter } from './employee-contracts.mts';
import type { ClientConfig } from 'pg';
export interface RestrictedSqlConfig {
  realm: PortalRealm;
  host: string;
  projectRef: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ca?: string;
}
export interface PortalSqlClient {
  connect(): Promise<unknown>;
  query(input: string | { text: string; values: SqlParameter[] }): Promise<unknown>;
  end(): Promise<unknown>;
}
export type CreatePortalSqlClient = (options: ClientConfig) => PortalSqlClient;
const operations: Readonly<
  Record<PortalRealm, Readonly<Record<string, Readonly<Record<string, number>>>>>
> = Object.freeze({
  business: Object.freeze({
    doji_business_session: Object.freeze({
      'select business_session_private.put_bound_session($1,$2,$3,$4::integer,$5,$6,$7,$8) as result': 8,
      'select business_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result': 8,
    }),
    doji_business_registration: Object.freeze({
      'select business_session_private.reserve_registration($1,$2,$3) as result': 3,
    }),
    doji_business_enrollment: Object.freeze({
      'select portal_identity_private.complete_business_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9) as result': 9,
    }),
    doji_identity_resolver: Object.freeze({
      'select portal_identity_private.read_business_application($1,$2,$3,$4,$5) as result': 5,
      'select portal_identity_private.read_business_workspace($1,$2,$3,$4,$5) as result': 5,
      'select portal_identity_private.business_application_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::uuid) as result': 11,
    }),
  }),
  employee: Object.freeze({
    doji_employee_application: Object.freeze({
      [employeeHealthSql]: 7,
      [employeeWorkflowSql]: 7,
      'select portal_identity_private.employee_rpc_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result': 7,
    }),
    doji_employee_session: Object.freeze({
      'select employee_session_private.admit_login_v1($1,$2,$3) as result': 3,
      'select employee_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result': 8,
    }),
  }),
});
const unavailable = (code?: unknown) =>
  Object.assign(
    Error('Portal database operation unavailable'),
    typeof code === 'string' && ['42501', '22023', '22P02', 'PT409', '55000'].includes(code)
      ? { code }
      : {},
  );
const own = (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key);

// createClient(options) supplies a reviewed node-postgres compatible client.
// Credentials are provided as an object, never concatenated into SQL or errors.
export function createRestrictedSql(
  config: RestrictedSqlConfig,
  createClient: CreatePortalSqlClient,
) {
  if (
    !config ||
    !own(operations, config.realm) ||
    typeof createClient !== 'function' ||
    typeof config.host !== 'string' ||
    !/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(config.host) ||
    !/^[a-z]{20}$/.test(config.projectRef || '') ||
    config.port !== 6543 ||
    config.database !== 'postgres' ||
    config.username !== `doji_${config.realm}_portal_login.${config.projectRef}` ||
    typeof config.password !== 'string' ||
    config.password.length < 32 ||
    (config.ca !== undefined &&
      (typeof config.ca !== 'string' ||
        config.ca.length > 16000 ||
        !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(
          config.ca,
        )))
  )
    throw unavailable();
  const policy = structuredClone(config),
    queries = operations[policy.realm];
  const login = `doji_${policy.realm}_portal_login`;
  const options = Object.freeze({
    host: policy.host,
    port: policy.port,
    database: policy.database,
    user: policy.username,
    password: policy.password,
    // Supabase's published root CA is supplied by the deployment configuration.
    // Node's normal hostname verification stays enabled; never accept an
    // untrusted certificate to make a pooler connection succeed.
    ssl: Object.freeze({ rejectUnauthorized: true, ...(policy.ca ? { ca: policy.ca } : {}) }),
    connectionTimeoutMillis: 3000,
    statement_timeout: 3000,
    lock_timeout: 1000,
    idle_in_transaction_session_timeout: 4000,
    application_name: `doji-${policy.realm}-portal`,
  });
  return async function execute(
    role: string,
    sql: string,
    params: SqlParameter[],
    signal: AbortSignal,
  ): Promise<unknown> {
    // Exact string checks before opening a socket; a parameter cannot choose SQL,
    // role, schema, principal, query timeout, database or transaction behavior.
    if (
      !own(queries, role) ||
      !queries[role] ||
      !own(queries[role], sql) ||
      !Array.isArray(params) ||
      params.length !== queries[role][sql] ||
      !signal ||
      signal.aborted ||
      params.some(
        (v) =>
          v !== null &&
          typeof v !== 'boolean' &&
          !(typeof v === 'number' && Number.isSafeInteger(v)) &&
          !(typeof v === 'string' && v.length <= 50000 && !v.includes('\0')),
      )
    )
      throw unavailable();
    const client = createClient(options);
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(4000)]);
    let abort: (() => void) | undefined, ending: Promise<unknown> | undefined;
    const close = () =>
      (ending ||= Promise.resolve()
        .then(() => client.end())
        .catch(() => {}));
    try {
      return await Promise.race([
        (async () => {
          deadline.throwIfAborted();
          await client.connect();
          deadline.throwIfAborted();
          // One simple-query round trip for fixed transaction setup and identity
          // verification. role is an own key of the frozen allowlist above; no
          // request parameter is interpolated. Application values remain bound
          // in the later extended query, after this identity check succeeds.
          const setup = await client.query(
            `begin isolation level read committed;
            set local statement_timeout='3s'; set local lock_timeout='1s';
            set local idle_in_transaction_session_timeout='4s';
            select session_user::text as login, current_user::text as current_role,
            r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls as privileged,
            r.rolinherit as inherits, pg_has_role(current_user,'${role}','MEMBER') as permitted
            from pg_roles r where r.rolname=current_user`,
          );
          const identity: unknown = Array.isArray(setup) && setup.length === 5 ? setup[4] : {};
          const rows: unknown = record(identity) ? identity.rows : undefined;
          const row: unknown = Array.isArray(rows) ? rows[0] : undefined;
          if (
            !Array.isArray(rows) ||
            rows.length !== 1 ||
            !record(row) ||
            row.login !== login ||
            row.current_role !== login ||
            row.privileged !== false ||
            row.inherits !== false ||
            row.permitted !== true
          )
            throw unavailable();
          deadline.throwIfAborted();
          await client.query(`set local role ${role}`);
          deadline.throwIfAborted();
          const result = await client.query({ text: sql, values: params });
          deadline.throwIfAborted();
          if (
            !record(result) ||
            !Array.isArray(result.rows) ||
            result.rows.length !== 1 ||
            !record(result.rows[0]) ||
            !own(result.rows[0], 'result')
          )
            throw unavailable();
          await client.query('commit');
          deadline.throwIfAborted();
          return result.rows[0].result;
        })(),
        new Promise((_, reject) => {
          abort = () => {
            void close();
            reject(unavailable());
          };
          deadline.addEventListener('abort', abort, { once: true });
          if (deadline.aborted) abort();
        }),
      ]);
    } catch (error) {
      throw unavailable(record(error) ? error.code : undefined);
    } finally {
      if (abort) deadline.removeEventListener('abort', abort);
      // Closing an uncommitted connection rolls back. Do not reuse it after an
      // ambiguous timeout. Bound shutdown even if a driver does not settle.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        close(),
        new Promise((resolve) => {
          timer = setTimeout(resolve, 1000);
        }),
      ]);
      clearTimeout(timer);
    }
  };
}
