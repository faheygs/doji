// One-time, owner-approved local credential handoff. No provider or production
// calls. Operator runs with write access to the owner/SYSTEM-only destination.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve('.artifacts/workos-production');
const destination = resolve(root, 'credentials.json');
if (!existsSync(root) || existsSync(destination))
  throw Error('Review credential destination before starting');
if (!execFileSync('git', ['check-ignore', destination], { encoding: 'utf8' }).trim())
  throw Error('Destination must be ignored');
const expected = {
  employee: {
    environment: 'environment_01M3VE4WMDRZ1VBVS5MNVVF19J',
    clientId: 'client_01M3VE4WTBYS2XN6NZPH9EDMQD',
  },
  business: {
    environment: 'environment_01M3T5131BPKBR7F6P2MAG6SBJ',
    clientId: 'client_01M3T51363MDZZK6X8DB7NS32N',
  },
};
const config = { productionOnly: true, enabled: false };
const csrf = randomBytes(32).toString('hex');
let origin;
const page = () =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Doji approved production credential storage</title><h1>Save approved server credentials</h1><p>Local computer only. Production integration remains disabled. Keys are not displayed or logged.</p>${Object.entries(
    expected,
  )
    .map(([realm, metadata]) =>
      config[realm]
        ? `<p>${realm}: securely saved.</p>`
        : `<form method="post" action="/capture/${realm}"><input name="csrf" type="hidden" value="${csrf}"><p>${realm}: ${metadata.clientId}</p><label for="${realm}">${realm} server API key</label><input id="${realm}" name="apiKey" type="password" autocomplete="off" required><button>Save ${realm} key</button></form>`,
    )
    .join('')}</html>`;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  if (req.headers.host !== new URL(origin).host) return res.writeHead(403).end('Denied');
  if (req.method === 'GET' && req.url === '/') return res.end(page());
  const realm = /^\/capture\/(employee|business)$/.exec(req.url || '')?.[1];
  if (
    req.method !== 'POST' ||
    !realm ||
    req.headers.origin !== origin ||
    req.headers['content-type'] !== 'application/x-www-form-urlencoded'
  )
    return res.writeHead(403).end('Denied');
  if (config[realm]) return res.writeHead(409).end('Already saved. No replacement allowed.');
  req.setTimeout(5000, () => req.destroy());
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) return res.writeHead(413).end('Too large');
      chunks.push(chunk);
    }
    const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    // Another request may have saved this realm while its body was arriving.
    if (config[realm]) return res.writeHead(409).end('Already saved. No replacement allowed.');
    if (
      form.getAll('csrf').length !== 1 ||
      form.get('csrf') !== csrf ||
      form.getAll('apiKey').length !== 1
    )
      return res.writeHead(403).end('Denied');
    const apiKey = form.get('apiKey');
    if (
      !/^sk_[A-Za-z0-9_-]{20,256}$/.test(apiKey || '') ||
      Object.values(config).some((v) => v?.apiKey === apiKey)
    )
      return res.writeHead(400).end('Invalid or duplicate key');
    const next = { ...config, [realm]: { ...expected[realm], apiKey } };
    if (!config.employee && !config.business)
      writeFileSync(destination, JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 });
    else {
      const temporary = resolve(root, `credentials-${randomBytes(16).toString('hex')}.tmp`);
      writeFileSync(temporary, JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 });
      renameSync(temporary, destination);
    }
    config[realm] = next[realm];
    console.log(`${realm} key securely saved; secret omitted; integration disabled.`);
    res.writeHead(303, { Location: '/' }).end();
  } catch {
    res.writeHead(500).end('Save failed. No secret details returned.');
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(0, '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log('Local approved production credential storage: ' + origin);
});
setTimeout(
  () => {
    server.close();
    server.closeAllConnections();
  },
  15 * 60 * 1000,
).unref();
