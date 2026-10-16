import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { stagingDevelopment } from './vite.staging.config.ts';
import { createDevelopmentProxy } from './dev/development-proxy.ts';
import { developmentToken } from './dev/development-config.ts';

export default defineConfig(({ command, isPreview, mode }) => {
  if (command !== 'serve' || isPreview || mode !== 'staging-local')
    throw Error('Development personas cannot be built or hosted.');
  const proxy = createDevelopmentProxy(developmentToken());
  return {
    envDir: false,
    plugins: [stagingDevelopment(fetch, proxy), react()],
    server: { host: '127.0.0.1', port: 4313, strictPort: true, cors: false },
  };
});
