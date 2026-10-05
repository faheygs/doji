import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const script = 'scripts/load/social-fanout-model.mts';
const source = stripTypeScriptTypes(readFileSync(script, 'utf8'), { mode: 'strip' });
const model = (...args: string[]) => {
  let output = '';
  runInNewContext(
    source,
    {
      process: { argv: ['node', script, ...args] },
      console: {
        log: (value: string) => {
          output = value;
        },
      },
    },
    { timeout: 1000 },
  );
  return JSON.parse(output);
};

describe('offline scale demand accounting', () => {
  it('never reports assumed rates as verified capacity', () => {
    const report = model();
    expect(report.capacityVerified).toBe(false);
    expect(report.productionTrafficSent).toBe(false);
    expect(report.friendChannelPublications).toBe(5_000_000);
    expect(report.targetedPushEvents).toBe(100_000);
    expect(report).not.toHaveProperty('providerHeadroom');
    expect(report).not.toHaveProperty('groupBucketSeconds');
  });
  it('does not multiply targeted push by friend degree or group immediate pushes', () => {
    const sparse = model('--average-friends=0');
    const dense = model('--average-friends=250');
    expect(sparse.friendChannelPublications).toBe(0);
    expect(dense.targetedProviderRequests).toBe(sparse.targetedProviderRequests);
    expect(model('--push-actions-per-user=0').targetedProviderRequests).toBe(0);
    expect(model('--installations-per-recipient=2').targetedProviderRequests).toBe(200_000);
  });
  it.each([
    '--group-bucket-seconds=30',
    '--native-provider-rate=5000',
    '--burst-seconds=0',
    '--users=NaN',
    '--users=1.5',
    '--users=1e300',
  ])('rejects stale capacity arguments or invalid scenarios: %s', (arg) => {
    expect(() => model(arg)).toThrow();
  });
});
