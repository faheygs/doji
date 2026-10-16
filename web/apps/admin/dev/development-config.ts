import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseEnv } from 'node:util';

// Credentials live outside Vite's source root and never enter import.meta.env.
// A vault can inject the single variable instead of creating a local file.
export function developmentToken(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DOJI_ADMIN_DEVELOPMENT_TOKEN) return env.DOJI_ADMIN_DEVELOPMENT_TOKEN;
  const configFile =
    env.DOJI_ADMIN_DEVELOPMENT_ENV_FILE ??
    (process.platform === 'win32'
      ? join(
          env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
          'Doji',
          'admin-development.env',
        )
      : join(homedir(), '.config', 'doji', 'admin-development.env'));
  try {
    if (!isAbsolute(configFile)) throw Error('Absolute path required');
    const file = realpathSync(configFile);
    const root = realpathSync(resolve(import.meta.dirname, '../../../../..'));
    const path = relative(root, file);
    if (!(path === '..' || path.startsWith('..' + sep) || isAbsolute(path)))
      throw Error('Outside repository only');
    const source = readFileSync(file, 'utf8');
    if (source.length > 1024) throw Error('Oversized configuration');
    const values = parseEnv(source);
    if (
      Object.keys(values).length !== 1 ||
      !/^[A-Za-z0-9_-]{43}$/.test(values.DOJI_ADMIN_DEVELOPMENT_TOKEN ?? '')
    )
      throw Error('Invalid configuration');
    return values.DOJI_ADMIN_DEVELOPMENT_TOKEN!;
  } catch {
    throw Error(
      'Staging developer credential missing or invalid. Load DOJI_ADMIN_DEVELOPMENT_TOKEN from the approved vault, or use the private admin-development.env file described in docs/LOCAL_DEVELOPMENT.md. No staging request was made.',
    );
  }
}
