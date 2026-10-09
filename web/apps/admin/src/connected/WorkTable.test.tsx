import { describe, expect, it } from 'vitest';
import { workColumns } from './WorkTable';
describe('intentional review columns', () => {
  it('does not present irrelevant source or SLA columns for business and ideas', () => {
    expect(workColumns('businesses')).toEqual(['Business', 'Received', 'Assignee', 'Status']);
    expect(workColumns('community-ideas')).toEqual(['Idea', 'Submitted', 'Assignee', 'Status']);
  });
  it('keeps safety source and deadlines but does not repeat ownership in personal work', () => {
    expect(workColumns('trust-safety')).toContain('Source');
    expect(workColumns('restricted-safety')).toContain('Review target');
    expect(workColumns('my-work')).not.toContain('Assignee');
  });
});
