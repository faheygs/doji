// Local synthetic previews only. No config, credentials, provider calls or sends.
import { createServer } from 'node:http';
import { prepareBusinessMail } from '../infra/business-email-candidate/message.mts';
import { renderBusinessEmailHtml } from '../infra/business-email-candidate/theme.mts';
const job = {
  id: '11000000-0000-4000-8000-000000000001',
  application_id: '11000000-0000-4000-8000-000000000002',
  kind: 'approve',
  subject: 'user_preview',
  issuer: 'https://preview.invalid',
  audience: 'client_preview',
};
const html = prepareBusinessMail(
  job,
  { id: job.subject, email: 'preview@example.invalid', email_verified: true },
  job,
  { setupEnabled: true },
).html;
const reset = renderBusinessEmailHtml({
  title: 'Reset your password',
  preheader: 'Choose a new password for your Doji business account.',
  summary:
    'Choose a new password for your business account. Opening this email or link does not change your password.',
  action: {
    label: 'Reset password',
    href: 'https://business.dojipro.com/business-portal/access/?mode=reset#token=synthetic-preview-only',
  },
  details: [{ label: 'Link expires (UTC)', value: '2026-10-12T05:00:00.000Z' }],
  note: 'If you did not request this, ignore this email. Your personal Doji account is separate.',
});
const server = createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/reset') {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy':
      "default-src 'none'; img-src https://business.dojipro.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  });
  res.end(req.url === '/reset' ? reset : html);
});
server.listen(0, '127.0.0.1', () => {
  const a = server.address();
  if (a && typeof a === 'object')
    console.log(`Email previews: http://127.0.0.1:${a.port}/ and /reset`);
});
