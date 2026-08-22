import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('retired notification runtime', () => {
  it('does not ship obsolete direct-push or recurring worker sources', () => {
    for (const relativePath of [
      'supabase/functions/notify-user/index.ts',
      'supabase/functions/dispatch-challenge-pushes/index.ts',
      'supabase/functions/expire-events/index.ts',
      'supabase/functions/send-push-notifications/index.ts',
      'supabase/functions/recalculate-streak/index.ts',
    ]) {
      expect(exists(relativePath)).toBe(false);
    }
  });

  it('deploys only current edge functions', () => {
    const deployScript = read('supabase/deploy-all-functions.ps1');
    const config = read('supabase/config.toml');

    expect(deployScript).not.toMatch(
      /dispatch-challenge-pushes|expire-events|send-push-notifications|notify-user|recalculate-streak/,
    );
    expect(config).not.toContain('[functions.notify-user]');
  });

  it('hard-disables the old database-to-edge push path', () => {
    const migration = read(
      'supabase/migrations/20260821010000_remove_retired_notification_runtime.sql',
    );

    expect(migration).toContain(
      'drop function if exists public.doji_notify_user_push(uuid, text, text, jsonb, text)',
    );
    expect(migration).toContain("'%/functions/v1/notify-user%'");
  });

  it('removes every recurring Doji cron job regardless of its legacy name', () => {
    const migration = read(
      'supabase/migrations/20260821150000_remove_recurring_doji_cron_jobs.sql',
    );

    expect(migration).toContain("jobname like 'doji\\_%' escape '\\'");
    expect(migration).toContain('perform cron.unschedule(job.jobid)');
  });
});
