// Synthetic local workerd probe: no provider, database or hosted endpoint traffic.
import { createBusinessProxy } from '../../infra/portal-identity-candidate/business-proxy.mts';
export default {
  async fetch(request: Request) {
    let calls = 0;
    const proxy = createBusinessProxy(
      {
        enabled: true,
        origin: 'https://business.dojipro.com',
        endpoint: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/business-portal-v2',
        proxyKey: 'ab'.repeat(32),
      },
      async (url, options) => {
        calls++;
        const edge = new Request(url, options);
        if (edge.headers.has('authorization') || edge.headers.has('x-region'))
          throw Error('Wrong realm headers');
        return new Response(null, {
          status: 303,
          headers: {
            location: 'https://business.dojipro.com/business-portal/application/',
            'set-cookie':
              '__Host-doji_business=' +
              'x'.repeat(43) +
              '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800',
          },
        });
      },
    );
    const response = await proxy(request);
    return Response.json({
      status: response.status,
      location: response.headers.get('location'),
      cookies: response.headers.getSetCookie(),
      calls,
    });
  },
};
