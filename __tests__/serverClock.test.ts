import { resetServerClock, serverNowMs, syncServerClock } from '../lib/serverClock';

describe('server clock', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    resetServerClock();
  });

  it('uses the database offset for countdown decisions', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    syncServerClock(new Date(6_000).toISOString());
    expect(serverNowMs()).toBe(6_000);
  });
});
