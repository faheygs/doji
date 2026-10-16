import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createLocalStagingProxy } from './dev/proxy.ts';
import { localAdminOrigin } from './dev/transport.ts';

const host = new URL(localAdminOrigin).host;
export function stagingDevelopment(
  upstream: typeof fetch = fetch,
  development?: {
    handle(request: Request): Promise<Response>;
    dispose(): void;
  },
): Plugin {
  return {
    name: 'doji-local-staging',
    configResolved(config) {
      if (
        config.command !== 'serve' ||
        config.mode !== 'staging-local' ||
        config.server.host !== '127.0.0.1' ||
        config.server.port !== 4313 ||
        config.server.strictPort !== true ||
        config.server.https
      )
        throw Error(
          'Admin staging development requires http://127.0.0.1:4313; no build or LAN mode.',
        );
    },
    configureServer(server) {
      const proxy = development ?? createLocalStagingProxy(upstream);
      server.httpServer?.on('close', proxy.dispose);
      server.httpServer?.prependListener('upgrade', (request, socket) => {
        if (request.headers.host !== host || request.headers.origin !== localAdminOrigin)
          socket.destroy();
      });
      server.middlewares.use(async (request, response, next) => {
        response.setHeader('cache-control', 'no-store');
        response.setHeader('referrer-policy', 'no-referrer');
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader('x-frame-options', 'DENY');
        const site = request.headers['sec-fetch-site'];
        if (
          request.headers.host !== host ||
          !['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') ||
          (request.headers.origin && request.headers.origin !== localAdminOrigin) ||
          (site && site !== 'same-origin' && site !== 'none')
        ) {
          response.writeHead(403).end();
          return;
        }
        const path = request.url ?? '/';
        if (path.startsWith('/auth/') || path.startsWith('/api/')) {
          const abort = new AbortController();
          const disconnected = () => {
            if (!response.writableEnded) abort.abort();
          };
          response.on('close', disconnected);
          try {
            const headers = new Headers();
            for (const [name, value] of Object.entries(request.headers)) {
              if (Array.isArray(value)) headers.set(name, value.join(', '));
              else if (value) headers.set(name, value);
            }
            const incoming = new Request(localAdminOrigin + path, {
              method: request.method ?? 'GET',
              headers,
              signal: abort.signal,
              ...(request.method === 'POST'
                ? { body: Readable.toWeb(request) as ReadableStream<Uint8Array>, duplex: 'half' }
                : {}),
            });
            const result = await proxy.handle(incoming);
            response.statusCode = result.status;
            result.headers.forEach((value, name) => response.setHeader(name, value));
            response.end(Buffer.from(await result.arrayBuffer()));
          } catch {
            response
              .writeHead(503, { 'content-type': 'application/json' })
              .end('{"message":"Local staging service unavailable."}');
          } finally {
            response.off('close', disconnected);
          }
          return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.writeHead(405).end();
          return;
        }
        // Serve the connected UI for document routes, preserving React Router's
        // location. Vite serves source/assets normally, never the preview app.
        if (
          request.headers.accept?.includes('text/html') &&
          !path.startsWith('/@') &&
          !path.startsWith('/src/') &&
          !path.startsWith('/dev/')
        ) {
          try {
            const html = (await readFile(new URL('./connected.html', import.meta.url), 'utf8'))
              .replace(
                '/src/connected/main.tsx',
                development ? '/dev/development-main.tsx' : '/dev/main.tsx',
              )
              .replace('Doji Admin · Connected candidate', 'Doji Admin · Local staging');
            response.setHeader('content-type', 'text/html');
            response.end(await server.transformIndexHtml(path, html));
          } catch {
            response.writeHead(503).end();
          }
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command, isPreview, mode }) => {
  if (command !== 'serve' || isPreview || mode !== 'staging-local')
    throw Error('This configuration is only for the admin staging development command.');
  return {
    envDir: false,
    plugins: [stagingDevelopment(), react()],
    server: { host: '127.0.0.1', port: 4313, strictPort: true, cors: false },
  };
});
