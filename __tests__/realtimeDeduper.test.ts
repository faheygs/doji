import { RealtimeEventDeduper } from '../lib/realtimeDeduper';

describe('RealtimeEventDeduper', () => {
  it('processes an at-least-once event only once', () => {
    const deduper = new RealtimeEventDeduper();
    expect(deduper.shouldProcess('event-1')).toBe(true);
    expect(deduper.shouldProcess('event-1')).toBe(false);
    expect(deduper.shouldProcess('event-2')).toBe(true);
  });

  it('can be reset when the authenticated identity changes', () => {
    const deduper = new RealtimeEventDeduper();
    deduper.shouldProcess('event-1');
    deduper.clear();
    expect(deduper.shouldProcess('event-1')).toBe(true);
  });
});
