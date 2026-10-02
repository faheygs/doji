import { createEmployeeProxy } from './employee-proxy.mjs';
import { employeeSetupReturn } from './employee-setup-return.mjs';
export default {
  async fetch(request, env) {
    const setup = employeeSetupReturn(request);
    if (setup) return setup;
    const url = new URL(request.url);
    if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) {
      try {
        return await createEmployeeProxy({
          enabled: env.EMPLOYEE_V2_ENABLED === 'true',
          origin: 'https://admin.dojipro.com',
          endpoint: env.EMPLOYEE_V2_ENDPOINT,
          proxyKey: env.EMPLOYEE_V2_PROXY_KEY,
        })(request);
      } catch {
        return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
