import { createRequestSignal } from '../../lib/requestSignal';

describe('createRequestSignal', () => {
  afterEach(() => jest.useRealTimers());

  it('aborts when its parent aborts', () => {
    const parent = new AbortController();
    const request = createRequestSignal(parent.signal, 10_000);
    parent.abort();
    expect(request.signal.aborted).toBe(true);
    request.cleanup();
  });

  it('bounds a hanging request', () => {
    jest.useFakeTimers();
    const request = createRequestSignal(undefined, 100);
    jest.advanceTimersByTime(100);
    expect(request.signal.aborted).toBe(true);
    request.cleanup();
  });
});
