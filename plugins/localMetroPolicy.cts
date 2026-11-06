// Local-only exclusions: retained checkouts and generated evidence are not app source.
// Do not delete them or change the production Metro resolver to speed up development.
function localMetroBlockList(root: string): RegExp {
  const escapedRoot = root.replaceAll('\\', '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const directories =
    '(?:\\.claude|\\.codex|\\.codex-owner-backup-[^/]+|\\.tmp-[^/]+|\\.artifacts|artifacts|coverage|dist|test-results)';
  return new RegExp(
    `^${escapedRoot.replaceAll('/', '[\\\\/]')}[\\\\/]${directories.replaceAll('[^/]', '[^\\\\/]')}[\\\\/]`,
  );
}

module.exports = { localMetroBlockList };
export type LocalMetroPolicy = { localMetroBlockList: typeof localMetroBlockList };
