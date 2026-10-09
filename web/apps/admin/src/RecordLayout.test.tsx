import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecordFields, RecordLayout } from './RecordLayout';

describe('record presentation', () => {
  it('preserves zero and literal submitted text while distinguishing missing values', () => {
    const { container } = render(
      <RecordFields
        rows={[
          ['Revision', 0],
          ['Notes', '<script>example</script>'],
          ['Missing', null],
        ]}
      />,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('<script>example</script>')).toBeInTheDocument();
    expect(screen.getByText('Not provided')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelectorAll('dt')).toHaveLength(3);
    expect(container.querySelectorAll('dd')).toHaveLength(3);
  });
  it('exposes a distinct record summary without concealing record content', () => {
    render(
      <RecordLayout summary={<p>Assigned to you</p>}>
        <p>Case evidence</p>
      </RecordLayout>,
    );
    expect(screen.getByRole('complementary', { name: 'Record summary' })).toHaveTextContent(
      'Assigned to you',
    );
    expect(screen.getByText('Case evidence')).toBeVisible();
  });
});
