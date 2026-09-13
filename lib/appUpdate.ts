export type MobilePlatform = 'ios' | 'android';

export type MobileReleasePolicy = {
  platform: MobilePlatform;
  latest_version: string;
  latest_build: number;
  minimum_version: string;
  minimum_build: number;
  store_url: string;
  update_message: string | null;
  updated_at: string;
};

export type InstalledRelease = {
  version: string;
  build: number;
};

export type UpdateDecision = {
  available: boolean;
  required: boolean;
};

function numericVersionParts(version: string): number[] {
  return version
    .trim()
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) && part >= 0 ? part : 0));
}

export function compareVersions(left: string, right: string): number {
  const leftParts = numericVersionParts(left);
  const rightParts = numericVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

function isBehind(
  installed: InstalledRelease,
  targetVersion: string,
  targetBuild: number,
): boolean {
  const versionComparison = compareVersions(installed.version, targetVersion);
  if (versionComparison < 0) return true;
  if (versionComparison > 0) return false;
  return installed.build < targetBuild;
}

export function assessAppUpdate(
  installed: InstalledRelease,
  policy: MobileReleasePolicy | null,
): UpdateDecision {
  if (!policy) return { available: false, required: false };
  return {
    available: isBehind(installed, policy.latest_version, policy.latest_build),
    required: isBehind(installed, policy.minimum_version, policy.minimum_build),
  };
}

export function updateDismissalKey(platform: MobilePlatform, policy: MobileReleasePolicy): string {
  return `@doit/update-dismissed/${platform}/${policy.latest_version}/${policy.latest_build}`;
}
