// One-field local owner handoff. No WorkOS request, deployment or secret logging.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export function createActionSecretCapture(persist: (secret: string) => void) {
  const csrf = randomBytes(32).toString('hex');
  let saved = false;
  const server = createServer(async (req, res) => {
    const address = server.address();
    if (!address || typeof address === 'string') return res.writeHead(503).end();
    const origin = `http://127.0.0.1:${address.port}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'unsafe-inline'",
    );
    const page = (error = '') =>
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doji business signing secret</title><style>body{font:17px system-ui;max-width:650px;margin:48px auto;padding:24px;background:#fafafa;color:#171717}input{box-sizing:border-box;width:100%;padding:14px;margin:12px 0}button{display:block;margin:20px 0 0 auto;padding:12px 24px}label{font-weight:650}.error{color:#a20}</style><h1>${saved ? 'Saved securely' : 'Connect business registration'}</h1>${saved ? '<p>The business Action signing secret is saved on this computer. No deployment or provider setting was changed. Return to the chat.</p>' : `<p>In the open <strong>WorkOS business Production → Actions → Configuration</strong> page, copy <strong>Signing secret</strong> and paste it below.</p><p>This is not an API key or client ID. It stays on this computer and is not printed in chat.</p>${error ? `<p class="error" role="alert">${error}</p>` : ''}<form action="/capture" method="post"><input type="hidden" name="csrf" value="${csrf}"><label for="secret">Business Action signing secret</label><input type="password" id="secret" name="secret" autocomplete="off" spellcheck="false" required maxlength="256"><button type="submit">Save</button></form>`}</html>`;
    if (req.headers.host !== new URL(origin).host)
      return res.writeHead(403).end('Local access only');
    if (req.method === 'GET' && ['/', '/capture'].includes(req.url || '')) return res.end(page());
    if (
      req.method !== 'POST' ||
      req.url !== '/capture' ||
      req.headers.origin !== origin ||
      req.headers['content-type'] !== 'application/x-www-form-urlencoded'
    )
      return res.writeHead(403).end('Open the local form first');
    if (saved) return res.writeHead(409).end('Already saved. No replacement allowed.');
    req.setTimeout(5000, () => req.destroy());
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2048) return res.writeHead(413).end('Too large');
        chunks.push(chunk);
      }
      if (saved) return res.writeHead(409).end('Already saved.');
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      if (
        form.getAll('csrf').length !== 1 ||
        form.get('csrf') !== csrf ||
        form.getAll('secret').length !== 1
      )
        return res.writeHead(403).end('Reload the form first');
      const secret = form.get('secret')?.trim();
      if (
        !secret ||
        secret.length > 256 ||
        /[\s<>•●]/.test(secret) ||
        /^\*+$/.test(secret) ||
        secret.startsWith('client_') ||
        secret.startsWith('environment_') ||
        secret.startsWith('sk_')
      )
        return res
          .writeHead(400)
          .end(
            page('Copy the Actions signing secret—not an API key, client ID, or environment ID.'),
          );
      persist(secret);
      saved = true;
      res.writeHead(303, { Location: '/' }).end();
    } catch {
      res.writeHead(500).end(page('Save failed. Nothing was displayed or sent externally.'));
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve('.artifacts/business-runtime'),
    destination = resolve(directory, 'action-secret.txt');
  if (existsSync(destination)) throw Error('Secret already saved; do not replace it.');
  mkdirSync(directory, { recursive: true });
  execFileSync('git', ['check-ignore', destination], { stdio: 'pipe' });
  const owner = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
  execFileSync(
    'icacls',
    [directory, '/inheritance:r', '/grant:r', `${owner}:(OI)(CI)F`, 'SYSTEM:(OI)(CI)F'],
    { stdio: 'pipe' },
  );
  const server = createActionSecretCapture((secret) => {
    writeFileSync(destination, secret, { flag: 'wx', mode: 0o600 });
    console.log('Business Action secret saved securely. Value omitted.');
  });
  const port = Number(process.env.DOJI_ACTION_CAPTURE_PORT || 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid local port');
  server.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    if (addr && typeof addr !== 'string')
      console.log(`Local secret handoff: http://127.0.0.1:${addr.port}/`);
  });
  setTimeout(() => {
    server.close();
    server.closeAllConnections();
  }, 30 * 60000).unref();
}
