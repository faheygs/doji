import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

test('deletion failure is immediately visible and persistent beside its action', () => {
  const settings = source('components/settings/DeleteAccountAction.tsx');
  expect(settings).toContain("showDialog({ title: 'Account deletion needs attention'");
  expect(settings).toContain('deletionInFlight.current');
  expect(settings).toContain('disabled={isDeleting}');
  const feedback = settings.indexOf('<InlineFeedback title="Account deletion needs attention"');
  const button = settings.indexOf('<Button variant="danger"');
  expect(button - feedback).toBeGreaterThan(0);
  expect(button - feedback).toBeLessThan(250);
  expect(settings).not.toContain('Account was not deleted');
  expect(settings).toContain('deleted_account_local_cleanup_failed');
});
test('ordinary and suspended members both have the same deletion action', () => {
  expect(source('app/(app)/profile/settings.tsx')).toContain('<DeleteAccountAction />');
  expect(source('app/banned.tsx')).toContain('<DeleteAccountAction />');
});
test('Edge failures retain server correlation but never send private SQL detail to the handset', () => {
  const edge = source('supabase/functions/delete-account/index.ts');
  expect(edge).toContain('requestId = crypto.randomUUID()');
  expect(edge).not.toContain('detail: message');
  expect(edge).toContain('ok: true, requestId');
});
