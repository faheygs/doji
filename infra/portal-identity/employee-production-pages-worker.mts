import employee from './employee-pages-worker.mts';

export default {
  async fetch(request: Request, env: Parameters<typeof employee.fetch>[1]) {
    if (
      new URL(request.url).origin !== 'https://admin.dojipro.com' ||
      (env.EMPLOYEE_V2_ORIGIN ?? 'https://admin.dojipro.com') !== 'https://admin.dojipro.com' ||
      env.EMPLOYEE_V2_ENDPOINT !==
        'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/employee-portal-v2'
    )
      return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
    return employee.fetch(request, env);
  },
};
