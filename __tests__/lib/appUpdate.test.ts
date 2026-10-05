import {
  assessAppUpdate,
  compareVersions,
  type MobileReleasePolicy,
  updateDismissalKey,
} from '../../lib/appUpdate';

const policy: MobileReleasePolicy = {
  platform: 'ios',
  latest_version: '1.2.0',
  latest_build: 25,
  minimum_version: '1.1.0',
  minimum_build: 20,
  store_url: 'https://apps.apple.com/app/id6768727326',
  update_message: null,
  updated_at: '2026-09-13T00:00:00.000Z',
};

describe('mobile app update decisions', () => {
  it('requires older Android releases but accepts 1.0.8 build 26 and newer', () => {
    const android26: MobileReleasePolicy = {
      ...policy, platform: 'android',
      latest_version: '1.0.8', latest_build: 26,
      minimum_version: '1.0.8', minimum_build: 26,
      store_url: 'https://play.google.com/store/apps/details?id=com.doit.challengeapp',
    };
    for (const installed of [
      { version: '1.0.7', build: 17 },
      ...[20, 21, 22, 23, 24, 25].map(build => ({ version: '1.0.8', build })),
    ]) {
      expect(assessAppUpdate(installed, android26)).toEqual({ available: true, required: true });
    }
    for (const installed of [
      { version: '1.0.8', build: 26 },
      { version: '1.0.8', build: 27 },
      { version: '1.0.9', build: 1 },
    ]) {
      expect(assessAppUpdate(installed, android26)).toEqual({ available: false, required: false });
    }
  });

  it('requires older iOS releases but accepts 1.0.8 build 103 and newer', () => {
    const ios103: MobileReleasePolicy = {
      ...policy,
      latest_version: '1.0.8', latest_build: 103,
      minimum_version: '1.0.8', minimum_build: 103,
    };
    for (const installed of [
      { version: '1.0.7', build: 90 },
      ...[100, 101, 102].map(build => ({ version: '1.0.8', build })),
    ]) {
      expect(assessAppUpdate(installed, ios103)).toEqual({ available: true, required: true });
    }
    for (const installed of [
      { version: '1.0.8', build: 103 },
      { version: '1.0.8', build: 104 },
      { version: '1.0.9', build: 1 },
    ]) {
      expect(assessAppUpdate(installed, ios103)).toEqual({ available: false, required: false });
    }
  });

  it('requires older Android builds but accepts the approved Alpha build 23 and newer', () => {
    const android23: MobileReleasePolicy = {
      ...policy,
      platform: 'android',
      latest_version: '1.0.8',
      latest_build: 23,
      minimum_version: '1.0.8',
      minimum_build: 23,
      store_url: 'https://play.google.com/store/apps/details?id=com.doit.challengeapp',
    };
    for (const installed of [
      { version: '1.0.7', build: 17 },
      ...[20, 21, 22].map((build) => ({ version: '1.0.8', build })),
    ]) {
      expect(assessAppUpdate(installed, android23)).toEqual({ available: true, required: true });
    }
    for (const installed of [
      { version: '1.0.8', build: 23 },
      { version: '1.0.8', build: 24 },
      { version: '1.0.9', build: 25 },
    ]) {
      expect(assessAppUpdate(installed, android23)).toEqual({ available: false, required: false });
    }
  });

  it('compares dotted versions numerically rather than lexically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
  });

  it('offers an optional update below the latest supported release', () => {
    expect(assessAppUpdate({ version: '1.1.0', build: 21 }, policy)).toEqual({
      available: true,
      required: false,
    });
  });

  it('requires an update below the minimum supported release', () => {
    expect(assessAppUpdate({ version: '1.0.9', build: 99 }, policy)).toEqual({
      available: true,
      required: true,
    });
  });

  it('uses the native build when store versions are equal', () => {
    expect(assessAppUpdate({ version: '1.2.0', build: 24 }, policy)).toEqual({
      available: true,
      required: false,
    });
    expect(assessAppUpdate({ version: '1.2.0', build: 25 }, policy)).toEqual({
      available: false,
      required: false,
    });
  });

  it('does not prompt when policy is disabled or the installed app is newer', () => {
    expect(assessAppUpdate({ version: '1.0.0', build: 1 }, null)).toEqual({
      available: false,
      required: false,
    });
    expect(assessAppUpdate({ version: '1.3.0', build: 1 }, policy)).toEqual({
      available: false,
      required: false,
    });
  });

  it('scopes optional dismissal to the exact platform release', () => {
    expect(updateDismissalKey('ios', policy)).toBe('@doit/update-dismissed/ios/1.2.0/25');
  });
});
