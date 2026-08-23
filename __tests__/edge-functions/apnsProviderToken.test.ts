import fs from 'node:fs';
import path from 'node:path';

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('shared APNs provider-token contract', () => {
  const sender = source('supabase/functions/_shared/apns-push.ts');
  const migration = source(
    'supabase/migrations/20260822170000_shared_apns_provider_token.sql',
  );

  it('coordinates one short-lived token without storing the Apple private key', () => {
    expect(migration).toContain('create table if not exists public.apns_provider_tokens');
    expect(migration).toContain('for update');
    expect(migration).toContain("interval '45 minutes'");
    expect(migration).toContain("interval '10 seconds'");
    expect(migration).toContain(
      'grant execute on function public.claim_apns_provider_token(text, text) to service_role',
    );
    expect(migration).toContain('revoke all on table public.apns_provider_tokens');
    expect(migration).not.toContain('APNS_PRIVATE_KEY');
  });

  it('single-flights concurrent sends and makes both push paths use the coordinator', () => {
    expect(sender).toContain('let jwtResolution: Promise<ProviderToken> | null = null');
    expect(sender).toContain("database.rpc('claim_apns_provider_token'");
    expect(sender).toContain("'store_apns_provider_token'");
    expect(sender).toContain('if (jwtResolution) return jwtResolution');
    expect(sender).toContain('canonical.value !== authorization.value');

    for (const file of [
      'supabase/functions/relay-domain-events/index.ts',
      'supabase/functions/fanout-doji-push/index.ts',
    ]) {
      expect(source(file)).toContain('sendApnsMessage(database, {');
    }
  });

  it('marks provider-wide APNs credential failures unhealthy', () => {
    expect(migration).toContain('TooManyProviderTokenUpdates');
    expect(migration).toContain('InvalidProviderToken');
    expect(migration).toContain('ExpiredProviderToken');
    expect(migration).toContain("interval '5 minutes'");
    expect(source('infra/doji-orchestrator/src/index.ts')).toContain(
      "'apns-provider-credentials'",
    );
  });
});
