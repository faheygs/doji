// Business-only entrypoint. Remains disabled until explicit release qualification.
// No member Auth, service-role client, employee runtime or realtime dependency.
import pg from 'pg';
import { createBusinessRuntime } from '../../../infra/portal-identity-candidate/business-runtime.mts';

let handler: ((request: Request) => Promise<Response>) | undefined;
Deno.serve(async (request: Request) => {
  if (Deno.env.get('BUSINESS_V2_ENABLED') !== 'true')
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  try {
    if (!handler) {
      const config = JSON.parse(Deno.env.get('BUSINESS_V2_CONFIG') || 'null');
      const origin = Deno.env.get('SUPABASE_URL');
      if (
        !config ||
        config.realm !== 'business' ||
        config.clientId !== 'client_01M3T51363MDZZK6X8DB7NS32N' ||
        origin !== 'https://tvixsmqxotuvyjqzmjla.supabase.co'
      )
        throw Error('Business configuration unavailable');
      // Runtime constructors validate keys, SQL login/roles, exact origin/routes
      // and legal-version configuration before accepting any request.
      handler = createBusinessRuntime(
        {
          ...config,
          enabled: true,
          origin: 'https://business.dojipro.com',
          endpoint: origin + '/functions/v1/business-portal-v2',
        },
        { createClient: (options) => new pg.Client(options) },
      );
    }
    return await handler(request);
  } catch {
    // Never expose provider errors, credentials, account details or database URLs.
    return Response.json(
      { message: 'Business access is temporarily unavailable.' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
});
