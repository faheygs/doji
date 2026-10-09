import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DojiTheme } from './theme';
import { TableFrame } from './layout';

describe('shared table states', () => {
  it.each(['loading', 'empty', 'error', 'ready'] as const)(
    'keeps the footer accessible during %s',
    (state) => {
      render(
        <DojiTheme>
          <TableFrame
            label="audit log"
            state={state}
            footer={<button>Next</button>}
            errorAction={<button>Retry</button>}
          >
            <div>Rows</div>
          </TableFrame>
        </DojiTheme>,
      );
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
      if (state === 'loading')
        expect(screen.getByRole('progressbar', { name: 'Loading audit log' })).toBeInTheDocument();
      if (state === 'empty')
        expect(screen.getByRole('status')).toHaveTextContent('No records found.');
      if (state === 'error')
        expect(screen.getByRole('alert')).toHaveTextContent('Unable to load records.');
      if (state === 'ready') expect(screen.getByText('Rows')).toBeInTheDocument();
    },
  );
});
