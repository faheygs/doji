// Synthetic proxy runtime fixture. The injected upstream never leaves workerd.
import { createEmployeeProxy } from '../../infra/portal-identity-candidate/employee-proxy.mts';

export default {
  async fetch(req: Request) {
    let diagnostic: Record<string, string>;
    try {
      diagnostic = {
        signal: typeof req.signal,
        any: typeof AbortSignal.any,
        cookies: typeof new Headers().getSetCookie,
      };
      new Request('https://example.test/', { redirect: 'error' });
    } catch (error) {
      diagnostic = { runtimeError: error instanceof Error ? error.message : String(error) };
    }
    const proxy = createEmployeeProxy(
      {
        enabled: true,
        origin: 'https://admin.dojipro.com',
        endpoint: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/employee-portal-v2',
        proxyKey: 'ab'.repeat(32),
      },
      async (url, options) => {
        new Request(url, options);
        return new Response(null, {
          status: 401,
          headers: {
            'set-cookie':
              '__Host-doji_employee=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
          },
        });
      },
    );
    const result = await proxy(req);
    return Response.json({
      status: result.status,
      ...diagnostic,
      cookies: result.headers.get('set-cookie'),
    });
  },
};
