import pg from 'npm:pg@8.16.3';
import {
  createDevelopmentGateway,
  createDevelopmentSql,
} from '../../../infra/portal-identity/admin-development.mts';

let handler: ReturnType<typeof createDevelopmentGateway> | undefined;
Deno.serve(async (request: Request) => {
  try {
    if (
      Deno.env.get('SUPABASE_URL') !== 'https://ohrcupagdoilkwhecict.supabase.co' ||
      Deno.env.get('ADMIN_DEVELOPMENT_ENABLED') !== 'true'
    )
      throw Error('Disabled');
    handler ??= createDevelopmentGateway(
      createDevelopmentSql(
        JSON.parse(Deno.env.get('ADMIN_DEVELOPMENT_DATABASE') || 'null'),
        (options) => new pg.Client(options),
      ),
    );
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
