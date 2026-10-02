import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

// Password inputs strip newlines on paste. Restore assignment boundaries before
// parsing, and never include submitted text in validation errors or responses.
export function parseStagingPair(value, expectedClient) {
  const normalized = value.replace(/(?:export\s+)?WORKOS_/g, '\nWORKOS_');
  const assignment = (name) => {
    const matches = [
      ...normalized.matchAll(
        new RegExp(`(?:^|\\n)${name}\\s*=\\s*["']?([A-Za-z0-9_-]+)["']?(?=\\s|$)`, 'g'),
      ),
    ];
    return matches.length === 1 ? matches[0][1] : null;
  };
  const clientId = assignment('WORKOS_CLIENT_ID');
  const apiKey = assignment('WORKOS_API_KEY');
  if (clientId !== expectedClient) throw Error('client');
  if (!/^sk_[A-Za-z0-9_-]{20,}$/.test(apiKey || '')) throw Error('key');
  return apiKey;
}

export function createCaptureServer({ expected, persist, port = 4199, onSaved = () => {} }) {
  const csrf = randomBytes(32).toString('hex');
  let saved = false;
  const page = (message = '') =>
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doji staging credential handoff</title><style>body{font:17px system-ui;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.5;background:#fafafa;color:#171717}input{box-sizing:border-box;width:100%;padding:14px;margin:8px 0 24px;border:1px solid #888;border-radius:8px}button{padding:12px 24px;float:right}label{font-weight:650;display:block}small{display:block;color:#555}.notice{padding:16px;border:1px solid #888;border-radius:8px;margin-bottom:24px}</style><h1>${saved ? 'Both staging credentials saved' : 'Save both staging credentials'}</h1>${message ? `<p class="notice" role="alert">${message}</p>` : ''}${saved ? '<p>Saved locally in the Git-ignored test configuration. No provider requests have been sent by this form. You can return to the chat.</p>' : `<p>Copy the <strong>environment variables</strong> block from each WorkOS staging Overview. Each block must contain WORKOS_API_KEY and WORKOS_CLIENT_ID. Paste one block into each field.</p><p>No production keys. Values stay on this computer and are never echoed. This form is available for 60 minutes.</p><form method="post" action="/capture"><input type="hidden" name="csrf" value="${csrf}"><label for="business">1. Original Staging — business</label><small>Expected client: ${expected.business.clientId}</small><input id="business" type="password" name="business" autocomplete="off" spellcheck="false" required><label for="employee">2. Doji Employee Staging</label><small>Expected client: ${expected.employee.clientId}</small><input id="employee" type="password" name="employee" autocomplete="off" spellcheck="false" required><button>Save both credentials</button></form>`}</html>`;
  return createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${port}`;
    res.setHeader('Cache-Control', 'no-store');
    // no-referrer turns native form POST Origin into null and fails our guard.
    // same-origin preserves local POST Origin without sending cross-site referrers.
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'unsafe-inline'",
    );
    if (req.headers.host !== `127.0.0.1:${port}`)
      return res.writeHead(403).end('Local access only.');
    if (req.method === 'GET' && ['/', '/capture', '/saved'].includes(req.url))
      return res.end(page());
    if (req.method !== 'POST' || req.url !== '/capture' || req.headers.origin !== origin)
      return res.writeHead(403).end('Open the local form and try again.');
    if (saved) return res.writeHead(303, { Location: '/saved' }).end();
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384)
          return res
            .writeHead(413)
            .end(
              page('The pasted data is too large. Copy only the two environment-variable blocks.'),
            );
        chunks.push(chunk);
      }
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      if (form.get('csrf') !== csrf)
        return res.writeHead(400).end(page('This form is stale. Use the fresh fields below.'));
      const pairs = {};
      for (const realm of ['business', 'employee']) {
        try {
          pairs[realm] = {
            ...expected[realm],
            apiKey: parseStagingPair(form.get(realm) || '', expected[realm].clientId),
          };
        } catch (error) {
          const name =
            realm === 'business' ? 'Original Staging (business)' : 'Doji Employee Staging';
          return res
            .writeHead(400)
            .end(
              page(
                `${name}: ${error.message === 'client' ? 'the client ID is missing or belongs to a different environment.' : 'the complete API key is missing.'} Copy that environment's full variables block. Nothing was saved; please enter both blocks again.`,
              ),
            );
        }
      }
      if (pairs.business.apiKey === pairs.employee.apiKey)
        return res
          .writeHead(400)
          .end(
            page(
              'The two API keys are identical. Copy from the two separate staging environments. Nothing was saved.',
            ),
          );
      persist({ stagingOnly: true, ...pairs });
      saved = true;
      onSaved();
      return res.writeHead(303, { Location: '/saved' }).end();
    } catch {
      return res
        .writeHead(500)
        .end(
          page(
            'The local save could not be completed. Tell me so I can check it; do not paste credentials into chat.',
          ),
        );
    }
  });
}
