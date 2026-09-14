import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260914223000_scope_doji_seen_suppression_to_activation.sql',
  ),
  'utf8',
);

describe('notification attention boundary', () => {
  it('scopes Doji seen suppression to the live activation', () => {
    expect(migration).toContain("when p_scope_kind = 'daily_event'");
    expect(migration).toContain('select event.activated_at');
    expect(migration).toContain('attention.seen_at >= boundary.occurred_at');
  });

  it('does not silently suppress a Doji alert if its activation cannot be resolved', () => {
    expect(migration).toContain("'infinity'::timestamptz");
  });
});
