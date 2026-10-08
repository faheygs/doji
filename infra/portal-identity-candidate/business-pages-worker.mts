import { createBusinessProxy } from './business-proxy.mts';
interface BusinessPagesEnv {
  BUSINESS_V2_ENABLED: string;
  BUSINESS_V2_ENDPOINT: string;
  BUSINESS_V2_PROXY_KEY: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
export default {
  async fetch(request: Request, env: BusinessPagesEnv) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) {
      try {
        return await createBusinessProxy({
          enabled: env.BUSINESS_V2_ENABLED === 'true',
          origin: 'https://business.dojipro.com',
          endpoint: env.BUSINESS_V2_ENDPOINT,
          proxyKey: env.BUSINESS_V2_PROXY_KEY,
        })(request);
      } catch {
        return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
