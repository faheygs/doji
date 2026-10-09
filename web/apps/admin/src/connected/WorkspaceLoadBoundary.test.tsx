import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WorkspaceLoadBoundary } from './WorkspaceLoadBoundary';

it('offers explicit recovery when the authenticated workspace cannot render', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  function FailedWorkspace(): never {
    throw Error('Synthetic chunk failure');
  }
  try {
    render(
      <WorkspaceLoadBoundary>
        <FailedWorkspace />
      </WorkspaceLoadBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The workspace could not open.');
    expect(screen.getByRole('button', { name: 'Reload workspace' })).toBeEnabled();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  } finally {
    log.mockRestore();
  }
});
