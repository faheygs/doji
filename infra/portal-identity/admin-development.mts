import type { CreatePortalSqlClient } from './restricted-sql.mts';
import { record } from './portal-contracts.mts';
import { boundedBody } from './bounded-body.mts';
import { employeeStagingProject } from './employee-contracts.mts';

export const developmentEndpoint = `https://${employeeStagingProject}.supabase.co/functions/v1/admin-development`;
export const developmentSql =
  'select admin_development_private.invoke_v1($1,$2::uuid,$3,$4::jsonb,$5::uuid) as result';
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export type DevelopmentCall = {
  persona: string | null;
  name: string;
  args: Record<string, unknown>;
  requestId: string;
};
export type DevelopmentInvoke = (
  token: string,
  call: DevelopmentCall,
  signal: AbortSignal,
) => Promise<unknown>;
export const developmentFailure = (status = 503) =>
  Object.assign(
    Error(
      status === 401
        ? 'Development credential expired, revoked or unavailable.'
        : status === 403
          ? 'This persona cannot perform that operation.'
          : status === 400
            ? 'Invalid development request.'
            : status === 409
              ? 'The record changed. Review it before trying again.'
              : 'Staging development is unavailable. No automatic retry was made.',
    ),
    { status },
  );
export function validDevelopmentCall(value: unknown): value is DevelopmentCall {
  return (
    record(value) &&
    Object.keys(value).length === 4 &&
    (value.persona === null || (typeof value.persona === 'string' && uuid.test(value.persona))) &&
    typeof value.name === 'string' &&
    /^[a-z][a-z0-9_]{0,99}$/.test(value.name) &&
    record(value.args) &&
    typeof value.requestId === 'string' &&
    uuid.test(value.requestId)
  );
}

export interface DevelopmentDatabase {
  host: string;
  projectRef: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ca?: string;
}
export function createDevelopmentSql(
  config: DevelopmentDatabase,
  createClient: CreatePortalSqlClient,
): DevelopmentInvoke {
  if (
    config.projectRef !== employeeStagingProject ||
    config.port !== 6543 ||
    config.database !== 'postgres' ||
    !/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(config.host) ||
    config.username !== `doji_staging_development_login.${employeeStagingProject}` ||
    typeof config.password !== 'string' ||
    config.password.length < 32 ||
    (config.ca !== undefined &&
      !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(
        config.ca,
      ))
  )
    throw developmentFailure();
  const options = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: { rejectUnauthorized: true, ...(config.ca ? { ca: config.ca } : {}) },
    connectionTimeoutMillis: 3000,
    statement_timeout: 3000,
    lock_timeout: 1000,
    idle_in_transaction_session_timeout: 4000,
    application_name: 'doji-staging-development',
  };
  return async (token, call, signal) => {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      !validDevelopmentCall(call) ||
      new TextEncoder().encode(JSON.stringify(call.args)).length > 16000
    )
      throw developmentFailure(400);
    const client = createClient(options);
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    let closing: Promise<unknown> | undefined;
    const close = () =>
      (closing ??= Promise.resolve()
        .then(() => client.end())
        .catch(() => {}));
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        (async () => {
          deadline.throwIfAborted();
          await client.connect();
          deadline.throwIfAborted();
          await client.query(
            "begin; set local statement_timeout='3s'; set local lock_timeout='1s'; set local idle_in_transaction_session_timeout='4s'",
          );
          const identity = await client.query(`select session_user::text as login,
            current_user::text as current_role, r.rolsuper or r.rolcreatedb or r.rolcreaterole or
            r.rolreplication or r.rolbypassrls or r.rolinherit as privileged,
            pg_has_role(current_user,'doji_staging_development','MEMBER') as permitted
            from pg_roles r where r.rolname=current_user`);
          const row = record(identity) && Array.isArray(identity.rows) ? identity.rows[0] : null;
          if (
            !record(row) ||
            row.login !== 'doji_staging_development_login' ||
            row.current_role !== row.login ||
            row.privileged !== false ||
            row.permitted !== true
          )
            throw developmentFailure();
          await client.query('set local role doji_staging_development');
          deadline.throwIfAborted();
          // Only a digest reaches SQL parameters/logging, never the bearer token.
          // Digests cannot authenticate to HTTP and SQL requires the private login.
          const digest = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
            (b) => b.toString(16).padStart(2, '0'),
          ).join('');
          const result = await client.query({
            text: developmentSql,
            values: [digest, call.persona, call.name, JSON.stringify(call.args), call.requestId],
          });
          if (
            !record(result) ||
            !Array.isArray(result.rows) ||
            result.rows.length !== 1 ||
            !record(result.rows[0])
          )
            throw developmentFailure();
          deadline.throwIfAborted();
          await client.query('commit');
          deadline.throwIfAborted();
          return result.rows[0].result;
        })(),
        new Promise((_, reject) => {
          abort = () => {
            void close();
            reject(developmentFailure());
          };
          deadline.addEventListener('abort', abort, { once: true });
          if (deadline.aborted) abort();
        }),
      ]);
    } catch (error) {
      throw developmentFailure(record(error) && error.code === '42501' ? 401 : 503);
    } finally {
      if (abort) deadline.removeEventListener('abort', abort);
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

// Server-to-server bearer entry only: no browser CORS, WorkOS or member session.
export function createDevelopmentGateway(invoke: DevelopmentInvoke) {
  let active = 0;
  return async (request: Request) => {
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    try {
      const url = new URL(request.url);
      const gatewayUrl = `http://${employeeStagingProject}.supabase.co/admin-development`;
      if (
        (request.url !== developmentEndpoint && request.url !== gatewayUrl) || url.search ||
        request.method !== 'POST' ||
        request.headers.has('origin') ||
        request.headers.has('cookie') ||
        request.headers.has('sec-fetch-site')
      )
        throw developmentFailure(403);
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') ?? '');
      if (!match) throw developmentFailure(401);
      if (request.headers.get('content-type') !== 'application/json') throw developmentFailure(400);
      if (active >= 2) throw developmentFailure(503);
      active++;
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(7000)]);
        const value: unknown = JSON.parse(
          new TextDecoder().decode(await boundedBody(request.body, signal, 16384)),
        );
        if (!validDevelopmentCall(value)) throw developmentFailure(400);
        const result = await invoke(match[1]!, value, signal);
        if (!record(result)) throw developmentFailure();
        if (value.name === 'personas' && value.persona === null)
          return Response.json(result, { headers });
        if (result.ok !== true) {
          const statuses: Record<string, number> = {
            '42501': 403,
            '22023': 400,
            '22P02': 400,
            PT409: 409,
            '55000': 409,
            '40001': 409,
            P0001: 400,
          };
          throw developmentFailure(
            typeof result.code === 'string' ? (statuses[result.code] ?? 503) : 503,
          );
        }
        return Response.json(result.result, { headers });
      } finally {
        active--;
      }
    } catch (error) {
      const status =
        record(error) &&
        typeof error.status === 'number' &&
        [400, 401, 403, 409, 503].includes(error.status)
          ? error.status
          : 503;
      return Response.json({ message: developmentFailure(status).message }, { status, headers });
    }
  };
}
