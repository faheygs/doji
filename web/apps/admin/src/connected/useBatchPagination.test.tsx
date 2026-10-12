import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useBatchPagination } from './useBatchPagination';
describe('fixed-batch page sizes', () => {
  it('shows every record and keeps the cursor when crossing batches in both directions', () => {
    const next = vi.fn(),
      previous = vi.fn(),
      reset = vi.fn();
    const props = {
      rows: Array.from({ length: 25 }, (_, i) => i + 1),
      batchSize: 25,
      batchPage: 1,
      scope: 'open',
      loading: false,
      failed: false,
      hasNext: true,
      next,
      previous,
      reset,
    };
    const { result, rerender } = renderHook(useBatchPagination<number>, { initialProps: props });
    act(() => result.current.pagination.onRowsPerPageChange(5));
    expect(reset).toHaveBeenCalledOnce();
    const seen: number[] = [];
    for (let page = 1; page <= 5; page++) {
      expect(result.current.pagination.page).toBe(page);
      seen.push(...result.current.rows);
      act(() => result.current.pagination.next());
    }
    expect(seen).toEqual(props.rows);
    expect(next).toHaveBeenCalledOnce();
    rerender({ ...props, batchPage: 2, rows: [26, 27], hasNext: false });
    expect(result.current.pagination.page).toBe(6);
    expect(result.current.rows).toEqual([26, 27]);
    expect(result.current.pagination.hasNext).toBe(false);
    act(() => result.current.pagination.previous());
    expect(previous).toHaveBeenCalledOnce();
    rerender(props);
    expect(result.current.rows).toEqual([21, 22, 23, 24, 25]);
    rerender({ ...props, scope: 'closed' });
    expect(result.current.rows).toEqual([1, 2, 3, 4, 5]);
    expect(result.current.pagination.page).toBe(1);
  });
});
