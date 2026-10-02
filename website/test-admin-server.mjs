import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = process.env.DOJI_ADMIN_TEST_ROOT ? resolve(process.env.DOJI_ADMIN_TEST_ROOT) : resolve(import.meta.dirname, '.admin-dist');
const port = Number(process.env.DOJI_ADMIN_TEST_PORT || 4174);
// Exercise the packaged admin CSP in browser tests, not just a permissive server.
const commonHeaders = Object.fromEntries((await readFile(resolve(root, '_headers'), 'utf8'))
  .split(/\r?\n\s*\r?\n/)[0].split(/\r?\n/).slice(1)
  .filter(line => line.trim() && line.includes(':'))
  .map(line => { const i = line.indexOf(':'); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url || '/', `http://${request.headers.host}`).pathname,
  );
  const requested = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = resolve(root, `.${requested}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      ...commonHeaders,
      'Content-Type': contentTypes[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Doji admin test server listening on http://127.0.0.1:${port}`);
});
