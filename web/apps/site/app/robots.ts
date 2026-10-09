import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
export default function robots(): MetadataRoute.Robots {
  // Do not make this indexable until all public routes, policies and metadata pass parity.
  return { rules: { userAgent: '*', disallow: '/' } };
}
