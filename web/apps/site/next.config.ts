import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  transpilePackages: ['@doji/ui'],
};
export default config;
