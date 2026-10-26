import pg from 'npm:pg@8.16.3';
import { Rest } from 'npm:ably@2.26.0';
import {
  createDevelopmentGateway,
  createDevelopmentSql,
  createDevelopmentResources,
} from '../../../infra/portal-identity/admin-development.mts';
import { createEmployeeStorageSigner } from '../../../infra/portal-identity/employee-storage-signer.mts';

let handler: ReturnType<typeof createDevelopmentGateway> | undefined;
Deno.serve(async (request: Request) => {
  try {
    if (
      Deno.env.get('SUPABASE_URL') !== 'https://ohrcupagdoilkwhecict.supabase.co' ||
      Deno.env.get('ADMIN_DEVELOPMENT_ENABLED') !== 'true'
    )
      throw Error('Disabled');
    if (!handler) {
      let invoke = createDevelopmentSql(
        JSON.parse(Deno.env.get('ADMIN_DEVELOPMENT_DATABASE') || 'null'),
        (options) => new pg.Client(options),
      );
      if (Deno.env.get('ADMIN_DEVELOPMENT_RESOURCES_ENABLED') === 'true') {
        const key = Deno.env.get('ABLY_API_KEY') || '';
        const realtimeKeyName = key.split(':')[0] || '';
        const ably = new Rest({ key, httpRequestTimeout: 5000, httpMaxRetryCount: 0 });
        invoke = createDevelopmentResources(invoke, {
          storageOrigin: Deno.env.get('SUPABASE_URL') || '',
          realtimeKeyName,
          signStorage: createEmployeeStorageSigner({
            origin: Deno.env.get('SUPABASE_URL') || '',
            serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
          }),
          signRealtime: async (grant, signal) => {
            signal.throwIfAborted();
            const result = await ably.auth.createTokenRequest(grant);
            signal.throwIfAborted();
            return result;
          },
        });
      }
      handler = createDevelopmentGateway(invoke);
    }
    return await handler(request);
  } catch {
    return Response.json(
      { message: 'Staging development is unavailable.' },
      {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      },
    );
  }
});
