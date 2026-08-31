import fs from 'node:fs';
import path from 'node:path';

describe('manual refresh behavior', () => {
  it('keeps background reconciliation silent on refreshable server-state screens', () => {
    for (const file of [
      'app/(app)/rank/index.tsx',
      'app/(app)/admin/suggestions.tsx',
      'app/(app)/admin/reports.tsx',
      'app/(app)/profile/blocked-users.tsx',
    ]) {
      const screen = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(screen).toContain('refreshing={refreshing}');
      expect(screen).toContain('onRefresh={handleRefresh}');
      expect(screen).not.toContain('refreshing={isRefetching}');
    }
  });
});
