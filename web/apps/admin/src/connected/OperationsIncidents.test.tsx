import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { monitorHistory } from '../../../../packages/portal-data/src/monitor-history';
import { OperationsIncidents } from './OperationsIncidents';

it.each([null, 'recovered'] as const)(
  'does not mislabel a completed failed check as stopped reporting: %s',
  (ended) => {
    const at = new Date().toISOString();
    const data = monitorHistory({
      enabled: true,
      available: true,
      latest: [
        { monitor: 'worker', state: 'healthy', family: null, observed_at: at },
        {
          monitor: 'watchdog',
          state: ended ? 'healthy' : 'unavailable',
          family: ended ? null : 'monitor-heartbeat-missing',
          observed_at: at,
        },
      ],
      incidents: [
        {
          id: 1,
          monitor: 'watchdog',
          family: 'monitor-heartbeat-missing',
          opened_at: at,
          last_observed_at: at,
          ended_at: ended ? at : null,
          ended_reason: ended,
        },
      ],
    });
    render(<OperationsIncidents data={data} loading={false} failed={false} retry={vi.fn()} />);
    expect(screen.getByRole('cell', { name: 'Independent health check failed' })).toBeVisible();
    expect(screen.queryByText('The monitor stopped reporting')).not.toBeInTheDocument();
    if (ended) expect(screen.getByRole('cell', { name: /Recovery observed/ })).toBeVisible();
    else {
      expect(screen.getByText('Check failed or could not complete')).toBeVisible();
      expect(screen.getByRole('cell', { name: 'Open at last observation' })).toBeVisible();
    }
  },
);
