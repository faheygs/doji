import employee from './employee-pages-worker.mts';
import { employeeStagingOrigin, employeeStagingProject } from './employee-contracts.mts';

export default {
  async fetch(request: Request, env: Parameters<typeof employee.fetch>[1]) {
    if (
      new URL(request.url).origin !== employeeStagingOrigin ||
      env.EMPLOYEE_V2_ORIGIN !== employeeStagingOrigin ||
      env.EMPLOYEE_V2_ENDPOINT !==
        `https://${employeeStagingProject}.supabase.co/functions/v1/employee-portal-v2`
    )
      return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
    return employee.fetch(request, env);
  },
};
