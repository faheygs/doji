/** Portal reads stay at or below the existing 25-record request budget. */
export function checkedPageSize(size: number) {
  if (![5, 10, 25].includes(size)) throw Error('Unsupported page size.');
  return size;
}
