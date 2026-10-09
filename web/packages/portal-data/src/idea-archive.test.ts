import { describe, expect, it } from 'vitest';
import {
  ideaArchive,
  ideaArchivePath,
  validIdeaArchivePath,
  readIdeaArchive,
} from './idea-archive';
import { ideaArchiveFixture } from '../../../tests/idea-archive-fixture';
import { createEmployeeSession } from './employee-session';
import { assertEmployeeRead } from './employee-read-policy';

describe('bounded idea history', () => {
  it('accepts only the canonical read path and preserves the full cursor', () => {
    const path = ideaArchivePath('approved', {
      at: '2026-10-08T12:00:00.123456Z',
      id: ideaArchiveFixture(1).items[0]!.id,
    });
    expect(validIdeaArchivePath(path)).toBe(true);
    expect(() => assertEmployeeRead(path, false)).not.toThrow();
    for (const invalid of [
      path + '&kind=announcements',
      'https://admin.dojipro.com' + path,
      path.replace('approved', 'deleted'),
      path.replace('beforeId=', 'unused='),
    ])
      expect(validIdeaArchivePath(invalid)).toBe(false);
    expect(() => assertEmployeeRead(path, true)).toThrow();
  });
  it('projects only list fields and validates filters, duplicates, limits and cursor tails', () => {
    const raw = ideaArchiveFixture();
    const page = ideaArchive(raw, 'approved', null);
    expect(page.items[0]).not.toHaveProperty('version');
    expect(page.next).toEqual(raw.next_cursor);
    expect(() => ideaArchive(raw, 'rejected', null)).toThrow();
    expect(() =>
      ideaArchive({ ...raw, items: [...raw.items, raw.items[0]] }, 'all', null),
    ).toThrow();
    expect(() =>
      ideaArchive({ ...raw, items: [raw.items[0], raw.items[0]], next_cursor: null }, 'all', null),
    ).toThrow();
    expect(() =>
      ideaArchive(
        { ...raw, next_cursor: { ...raw.next_cursor, id: raw.items[0]!.id } },
        'all',
        null,
      ),
    ).toThrow();
    expect(() => ideaArchive({ ...raw, items: [...raw.items].reverse() }, 'all', null)).toThrow();
  });
  it('retains Postgres microseconds and rejects repeated pages', () => {
    const raw = ideaArchiveFixture(2);
    raw.items[0]!.created_at = '2026-10-08T12:00:00.123455Z';
    raw.items[1]!.created_at = '2026-10-08T12:00:00.123454Z';
    const cursor = { at: '2026-10-08T12:00:00.123456Z', id: raw.items[0]!.id };
    expect(ideaArchive(raw, 'all', cursor).items).toHaveLength(2);
    expect(() =>
      ideaArchive(raw, 'all', { at: raw.items[0]!.created_at, id: raw.items[0]!.id }),
    ).toThrow();
  });
  it('rejects malformed labels, state coercion and oversized results', () => {
    const raw = ideaArchiveFixture(1),
      item = raw.items[0]!;
    for (const change of [
      { status: ['approved'] },
      { title: 'a'.repeat(101) },
      { author: null },
      { created_at: 'no' },
    ])
      expect(() => ideaArchive({ ...raw, items: [{ ...item, ...change }] }, 'all', null)).toThrow();
  });
  it('uses the existing read RPC and denies a role without editorial authority', async () => {
    const calls: unknown[] = [];
    let allowed = true;
    const client = createEmployeeSession(
      { independentEmployeeIdentity: true, staffWorkflowEnabled: true },
      {
        origin: 'https://admin.dojipro.com',
        upstream: async (url, init) => {
          if (url.endsWith('/api/session'))
            return Response.json({
              signedIn: true,
              assurance: 'aal2',
              csrf: 'c'.repeat(43),
              operator: {
                user_id: '10000000-0000-4000-8000-000000000001',
                capabilities: { operations_read: allowed },
              },
            });
          if (url.endsWith('/auth/logout')) return Response.json({ signedIn: false });
          calls.push(JSON.parse(String(init?.body)));
          return Response.json(ideaArchiveFixture(1));
        },
      },
    );
    await client.restore();
    await readIdeaArchive(client, 'approved', null, new AbortController().signal);
    expect(calls).toEqual([
      {
        name: 'get_admin_editorial_page_v1',
        args: {
          p_kind: 'suggestions',
          p_filter: 'approved',
          p_limit: 25,
          p_before_at: null,
          p_before_id: null,
        },
      },
    ]);
    allowed = false;
    await client.restore();
    await expect(
      readIdeaArchive(client, 'approved', null, new AbortController().signal),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
    await client.signOut();
  });
});
