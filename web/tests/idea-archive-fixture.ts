export function ideaArchiveFixture(count = 25, status = 'approved', offset = 0) {
  const items = Array.from({ length: count }, (_, index) => ({
    id: '20000000-0000-4000-8000-' + String(1000 - offset - index).padStart(12, '0'),
    title: 'Synthetic idea ' + (offset + index + 1),
    kind: 'poll',
    author: 'Synthetic member',
    status,
    version: 'a'.repeat(32),
    created_at: new Date(
      Date.parse('2026-10-08T12:00:00Z') - (offset + index) * 1000,
    ).toISOString(),
  }));
  const tail = items.at(-1);
  return {
    items,
    can_write: true,
    next_cursor: count === 25 && tail ? { at: tail.created_at, id: tail.id } : null,
  };
}
