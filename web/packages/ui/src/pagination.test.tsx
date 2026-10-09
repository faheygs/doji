import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueuePagination } from './workspace-patterns';

const base = {
  page: 1,
  count: 10,
  rowsPerPage: 10,
  hasPrevious: false,
  hasNext: true,
  previous: vi.fn(),
  next: vi.fn(),
};

describe('Material table pagination', () => {
  it('uses known totals and cursor-aware page controls', () => {
    const next = vi.fn();
    render(<QueuePagination {...base} totalCount={14} next={next} />);
    expect(screen.getByRole('status')).toHaveTextContent('1–10 of 14');
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(next).toHaveBeenCalledOnce();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to last page' })).not.toBeInTheDocument();
  });

  it('does not invent a total or more results on a partial cursor page', () => {
    const previous = vi.fn();
    render(
      <QueuePagination
        {...base}
        page={2}
        count={4}
        hasPrevious
        hasNext={false}
        previous={previous}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^11–14$/);
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));
    expect(previous).toHaveBeenCalledOnce();
  });

  it.each([
    ['loading', 'Loading records…'],
    ['error', 'Records unavailable'],
    ['empty', '0 records'],
  ] as const)('disables forward paging and reports %s honestly', (state, label) => {
    render(<QueuePagination {...base} state={state} hasPrevious />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    const previous = screen.getByRole('button', { name: 'Go to previous page' });
    if (state === 'loading') expect(previous).toBeDisabled();
    else expect(previous).toBeEnabled();
  });

  it('shows zero records without a bogus range', () => {
    render(<QueuePagination {...base} count={0} totalCount={0} hasNext={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^0 records$/);
  });
  it.each(['empty', 'error'] as const)(
    'can return from a %s later page without advancing',
    (state) => {
      const previous = vi.fn(),
        next = vi.fn();
      render(
        <QueuePagination
          {...base}
          state={state}
          page={2}
          count={0}
          hasPrevious
          previous={previous}
          next={next}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));
      fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
      expect(previous).toHaveBeenCalledOnce();
      expect(next).not.toHaveBeenCalled();
    },
  );
});
