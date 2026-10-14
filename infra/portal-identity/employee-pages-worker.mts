import { createEmployeeProxy } from './employee-proxy.mts';
import { employeeSetupReturn } from './employee-setup-return.mts';
interface EmployeePagesEnv {
  EMPLOYEE_V2_ENABLED: string;
  EMPLOYEE_V2_ENDPOINT: string;
  EMPLOYEE_V2_PROXY_KEY: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
export default {
  async fetch(request: Request, env: EmployeePagesEnv) {
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
