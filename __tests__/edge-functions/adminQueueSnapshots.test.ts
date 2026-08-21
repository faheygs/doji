import fs from 'node:fs';
import path from 'node:path';

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('admin review queue contracts', () => {
  it('loads pending suggestions through one bounded admin-only snapshot', () => {
    const hook = source('hooks/useSuggestions.ts');
    const migration = source(
      'supabase/migrations/20260820010000_pending_suggestions_snapshot.sql',
    ).toLowerCase();

    expect(hook).toContain("supabase.rpc('get_pending_suggestions_snapshot'");
    expect(migration).toContain('security definer');
    expect(migration).toContain('profile.is_admin is true');
    expect(migration).toContain('coalesce(p_limit, 100)');
    expect(migration).toContain("where pending.status = 'pending'");
    expect(migration).toContain("'equipped_border_key', author.equipped_border_key");
    expect(migration).toContain(
      'grant execute on function public.get_pending_suggestions_snapshot(integer) to authenticated',
    );
  });
});
