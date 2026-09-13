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
