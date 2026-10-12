import { describe, it, expect } from 'vitest';
import { checkedPageSize } from './page-size';
import { ideaArchive, ideaArchivePath, validIdeaArchivePath } from './idea-archive';
import { announcementPath, validAnnouncementPath } from './announcement-path';
import { auditPath, validAuditPath } from './employee-audit';
import { ideaArchiveFixture } from '../../../tests/idea-archive-fixture';
import { sentryReadProblem, healthSnapshot } from './employee-health';
import { healthFixture } from '../../../tests/health-fixture';
describe('bounded page sizes', () => {
  it.each([5, 10, 25])('allows %i in canonical read paths', (size) => {
    expect(validIdeaArchivePath(ideaArchivePath('approved', null, size))).toBe(true);
    expect(validAnnouncementPath(announcementPath('all', null, size))).toBe(true);
    expect(validAuditPath(auditPath('activity', '', null, size))).toBe(true);
    const raw = ideaArchiveFixture(size),
      tail = raw.items.at(-1)!;
    raw.next_cursor = { at: tail.created_at, id: tail.id };
    expect(ideaArchive(raw, 'approved', null, size).next).toEqual(raw.next_cursor);
  });
  it.each([0, -1, 1, 50, 100, NaN])('rejects unsupported size %s', (size) => {
    expect(() => checkedPageSize(size)).toThrow();
    expect(
      validIdeaArchivePath(
        '/portal/admin/editorial-page?kind=suggestions&limit=' + size + '&filter=all',
      ),
    ).toBe(false);
  });
  it('rejects overfull pages and mismatched cursor tails', () => {
    expect(() => ideaArchive(ideaArchiveFixture(10), 'approved', null, 5)).toThrow();
    const raw = ideaArchiveFixture(5);
    raw.next_cursor = { at: raw.items[0]!.created_at, id: raw.items[0]!.id };
    expect(() => ideaArchive(raw, 'approved', null, 5)).toThrow();
  });
});
describe('health connection diagnostics', () => {
  const source = healthSnapshot(healthFixture()).sentry;
  it('distinguishes connection failures from no issues and stale data', () => {
    expect(sentryReadProblem(source, false, true)).toBeNull();
    expect(sentryReadProblem(source, false, false)).toMatch(/outdated/);
    expect(sentryReadProblem(source, true, true)).toMatch(/read failed/);
    expect(sentryReadProblem({ ...source, configured: false }, false, false)).toMatch(
      /not configured/,
    );
    expect(sentryReadProblem({ ...source, upstream_status: 403 }, false, false)).toMatch(
      /project access/,
    );
    expect(sentryReadProblem({ ...source, upstream_status: 429 }, false, false)).toMatch(
      /rate-limited/,
    );
    expect(sentryReadProblem({ ...source, observed_at: null }, false, false)).toMatch(
      /observation time/,
    );
  });
});
