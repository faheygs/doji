import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
export default function robots(): MetadataRoute.Robots {
  return process.env.DOJI_SITE_RELEASE === 'true'
    ? {
        rules: {
          userAgent: '*',
          allow: '/',
          disallow: ['/safety-removal/', '/business-portal/', '/admin-portal/', '/employee-setup/'],
        },
        sitemap: 'https://dojipro.com/sitemap.xml',
      }
    : { rules: { userAgent: '*', disallow: '/' } };
}
