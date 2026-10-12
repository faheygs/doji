import { useState } from 'react';

/** Split a fixed server batch without fetching ahead or discarding its cursor. */
export function useBatchPagination<T>({
  rows,
  batchSize,
  batchPage,
  scope,
  loading,
  failed,
  hasNext,
  next,
  previous,
  reset,
}: {
  rows: T[];
  batchSize: number;
  batchPage: number;
  scope: string;
  loading: boolean;
  failed: boolean;
  hasNext: boolean;
  next(): void;
  previous(): void;
  reset(): void;
}) {
  const [size, setSize] = useState(batchSize);
  const [position, setPosition] = useState({ scope, batchPage, offset: 0 });
  const requested =
    position.scope === scope && position.batchPage === batchPage ? position.offset : 0;
  const offset = Math.min(requested, Math.max(0, Math.ceil(rows.length / size) - 1));
  const slices = batchSize / size;
  const visible = rows.slice(offset * size, (offset + 1) * size);
  const status = loading ? 'loading' : failed ? 'error' : rows.length ? 'ready' : 'empty';
  return {
    rows: visible,
    pagination: {
      page: (batchPage - 1) * slices + offset + 1,
      count: visible.length,
      rowsPerPage: size,
      rowsPerPageOptions: [5, 10, 25, 30].filter((n) => n <= batchSize && batchSize % n === 0),
      state: status as 'loading' | 'error' | 'ready' | 'empty',
      hasPrevious: !loading && (offset > 0 || batchPage > 1),
      hasNext: !loading && !failed && ((offset + 1) * size < rows.length || hasNext),
      onRowsPerPageChange: (value: number) => {
        if (![5, 10, 25, 30].includes(value) || batchSize % value !== 0) return;
        setSize(value);
        setPosition({ scope, batchPage: 1, offset: 0 });
        reset();
      },
      previous: () => {
        if (offset > 0) setPosition({ scope, batchPage, offset: offset - 1 });
        else if (batchPage > 1) {
          setPosition({ scope, batchPage: batchPage - 1, offset: slices - 1 });
          previous();
        }
      },
      next: () => {
        if ((offset + 1) * size < rows.length)
          setPosition({ scope, batchPage, offset: offset + 1 });
        else if (hasNext) {
          setPosition({ scope, batchPage: batchPage + 1, offset: 0 });
          next();
        }
      },
    },
  };
}
