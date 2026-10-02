import { createRequestSignal } from '../../lib/requestSignal';

describe('createRequestSignal', () => {
  afterEach(() => jest.useRealTimers());

  it('aborts when its parent aborts', () => {
    const parent = new AbortController();
    const request = createRequestSignal(parent.signal, 10_000);
    parent.abort();
    expect(request.signal.aborted).toBe(true);
    expect(request.abortSource).toBe('parent');
    request.cleanup();
  });

  it('bounds a hanging request', () => {
    jest.useFakeTimers();
    const request = createRequestSignal(undefined, 100);
    jest.advanceTimersByTime(100);
    expect(request.signal.aborted).toBe(true);
    expect(request.abortSource).toBe('deadline');
    request.cleanup();
  });

  it('keeps the first abort source when later signals fire', () => {
    jest.useFakeTimers();
    const parent = new AbortController();
    const request = createRequestSignal(parent.signal, 100);
    jest.advanceTimersByTime(100);
    parent.abort();
    request.cancel();
    expect(request.abortSource).toBe('deadline');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('preserves a pre-aborted parent instead of reclassifying it as a timeout', () => {
    jest.useFakeTimers();
    const parent = new AbortController();
    parent.abort();
    const request = createRequestSignal(parent.signal, 100);
    jest.advanceTimersByTime(100);
    expect(request.abortSource).toBe('parent');
    request.cleanup();
  });

  it('cleans up both the deadline and parent listener after settlement', () => {
    jest.useFakeTimers();
    const parent = new AbortController();
    const request = createRequestSignal(parent.signal, 100);
    request.cleanup();
    parent.abort();
    jest.advanceTimersByTime(100);
    expect(request.signal.aborted).toBe(false);
    expect(request.abortSource).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('records explicit cancellation and clears the timer', () => {
    jest.useFakeTimers();
    const request = createRequestSignal(undefined, 100);
    request.cancel();
    expect(request.abortSource).toBe('manual');
    expect(jest.getTimerCount()).toBe(0);
  });
});
