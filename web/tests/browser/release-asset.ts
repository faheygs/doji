import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
/** Read exact staged production bytes in intercepted tests, never hit a live origin. */
export async function releaseAsset(path: string) {
  if (!process.env.DOJI_REACT_RELEASE_DIR) return null;
  const root = resolve(import.meta.dirname, '../../..', process.env.DOJI_REACT_RELEASE_DIR);
  const target = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!target.startsWith(root + sep) || !/\.(html|js|png|css)$/.test(target))
    throw Error('Invalid staged asset path');
  const type = target.endsWith('.html')
    ? 'text/html'
    : target.endsWith('.js')
      ? 'text/javascript'
      : target.endsWith('.css')
        ? 'text/css'
        : 'image/png';
  const headers = await readFile(resolve(root, '_headers'), 'utf8');
  const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1];
  if (!csp) throw Error('Missing release CSP');
  return {
    body: await readFile(target),
    contentType: type,
    headers: { 'content-security-policy': csp },
  };
}
