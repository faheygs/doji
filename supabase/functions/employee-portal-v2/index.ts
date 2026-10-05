// Independent employee endpoint. No member Auth routes/token exchange.
// Deployment must keep EMPLOYEE_V2_ENABLED=false until the restricted DB role,
// exact owner mapping, same-origin proxy and owner MFA acceptance are verified.
import pg from 'pg';
import { Rest } from 'ably';
import { createEmployeeRuntime } from '../../../infra/portal-identity-candidate/employee-runtime.mts';
import { createEmployeeStorageSigner } from '../../../infra/portal-identity-candidate/employee-storage-signer.mts';

let handler: ((request: Request) => Promise<Response>) | undefined;
Deno.serve(async (request: Request) => {
  if (Deno.env.get('EMPLOYEE_V2_ENABLED') !== 'true')
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  try {
    if (!handler) {
      const config = JSON.parse(Deno.env.get('EMPLOYEE_V2_CONFIG') || 'null');
      const origin = Deno.env.get('SUPABASE_URL') || '';
      const ablyKey = Deno.env.get('ABLY_API_KEY');
      if (!config || !ablyKey) throw Error('Not configured');
      const ably = new Rest({ key: ablyKey, httpRequestTimeout: 5000, httpMaxRetryCount: 0 });
      handler = createEmployeeRuntime(
        {
          ...config,
          enabled: true,
          realm: 'employee',
          origin: 'https://admin.dojipro.com',
          storageOrigin: origin,
          endpoint: origin + '/functions/v1/employee-portal-v2',
        },
        {
          createClient: (options: object) => new pg.Client(options),
          signStorage: createEmployeeStorageSigner({
            origin,
            serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
          }),
          signRealtime: async (params: object, signal: AbortSignal) => {
            signal.throwIfAborted();
            const result = await ably.auth.createTokenRequest(params);
            signal.throwIfAborted();
            return result;
          },
        },
      );
    }
    return await handler!(request);
  } catch {
    // No password, token, email, media path, database URL or provider error logs.
    return Response.json(
      { message: 'Employee access is temporarily unavailable.' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
});
