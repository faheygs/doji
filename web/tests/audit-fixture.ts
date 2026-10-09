export function auditFixture(
  count = 25,
  category = 'activity',
  search: string | null = null,
  offset = 0,
) {
  const items = Array.from({ length: count }, (_, index) => ({
    id: '40000000-0000-4000-8000-' + String(1000 - offset - index).padStart(12, '0'),
    occurred_at: new Date(
      Date.parse('2026-10-08T12:00:00Z') - (offset + index) * 1000,
    ).toISOString(),
    actor: {
      id: '10000000-0000-4000-8000-000000000001',
      display_name: 'Synthetic reviewer',
      username: null,
    },
    action: 'editorial.approved',
    entity_type: 'suggestion',
    entity_id: '20000000-0000-4000-8000-000000000002',
    category: 'decision',
    reason: 'Synthetic review ' + (offset + index + 1),
  }));
  const tail = items.at(-1);
  return {
    filter: category,
    search,
    items,
    next_cursor: count === 25 && tail ? { occurred_at: tail.occurred_at, id: tail.id } : null,
  };
}
