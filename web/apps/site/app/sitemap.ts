import type { MetadataRoute } from 'next';
import { policyRoutes } from '../lib/content';
export const dynamic = 'force-static';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', 'business', ...policyRoutes].map((path) => ({
    url: `https://dojipro.com/${path ? path + '/' : ''}`,
  }));
}
