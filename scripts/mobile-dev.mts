import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import type { MobileEnvironmentPolicy } from '../plugins/mobileEnvironment.cts';

const require = createRequire(import.meta.url);
const policy: MobileEnvironmentPolicy = require('../plugins/mobileEnvironment.cts');
export const projectRoot = resolve(import.meta.dirname, '..');
const clientKeys = new Set([
  'DOJI_APP_VARIANT',
  'DOJI_STAGING_BUILD_NUMBER',
  'DOJI_STAGING_FIREBASE_PROJECT_ID',
  'DOJI_STAGING_GOOGLE_SERVICES_FILE',
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_RELEASE_CHANNEL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_COMMAND_GATEWAY_URL',
  'EXPO_PUBLIC_SCALE_READ_URL',
  'EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED',
  'EXPO_PUBLIC_STAGING_PUSH_ENABLED',
  'EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED',
  'ANDROID_HOME',
  'JAVA_HOME',
  'EAS_BUILD_PLATFORM',
  'EXPO_NO_DOTENV',
  'SENTRY_DISABLE_AUTO_UPLOAD',
]);

export function developmentEnvironment(
  config: NodeJS.ProcessEnv,
  inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  // Never forward provider/build credentials or an owner's production .env file.
  for (const key of Object.keys(config)) {
    if (!clientKeys.has(key)) throw Error(`Unexpected local configuration key: ${key}`);
  }
  policy.validateStagingEnvironment(config, true);
  if (
    policy.variantFor(config) !== 'development' ||
    config.EXPO_PUBLIC_RELEASE_CHANNEL !== 'development' ||
    config.EXPO_PUBLIC_STAGING_PUSH_ENABLED !== 'false' ||
    config.EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED !== 'false'
  )
    throw Error('Local Dev requires development identity and disabled push/reporting');
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (
      /^(path|pathext|systemroot|windir|comspec|home|userprofile|localappdata|appdata|temp|tmp|lang|term|colorterm|term_program|android_avd_home|android_user_home)$/i.test(
        key,
      )
    ) {
      env[key] = value;
    }
  }
  Object.assign(env, config, {
    EXPO_NO_DOTENV: '1',
    SENTRY_DISABLE_AUTO_UPLOAD: 'true',
    EXPO_NO_TELEMETRY: '1',
    DOJI_LOCAL_METRO: 'true',
  });
  // Metro serves both platforms; EAS_BUILD_PLATFORM belongs to native build setup.
  delete env.EAS_BUILD_PLATFORM;
  return env;
}

export function options(args: string[]) {
  let lan = false;
  let check = false;
  let envFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--lan') lan = true;
    else if (arg === '--check') check = true;
    else if (arg === '--env-file' && args[i + 1]) envFile = args[++i];
    else throw Error('Usage: npm run dev:mobile -- [--lan] [--check] [--env-file ABSOLUTE_PATH]');
  }
  return { lan, check, envFile };
}

export function externalConfigPath(path: string, root: string): string {
  if (!isAbsolute(path)) throw Error('Local configuration path must be absolute and outside Git');
  const realPath = realpathSync(path);
  const fromRoot = relative(realpathSync(root), realPath);
  if (!fromRoot || (!/^\.\.(?:[\\/]|$)/.test(fromRoot) && !isAbsolute(fromRoot))) {
    throw Error('Local configuration must stay outside the repository');
  }
  return realPath;
}

export function main(args = process.argv.slice(2)) {
  const opts = options(args);
  const defaultPath =
    process.platform === 'win32'
      ? join(
          process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
          'Doji',
          'mobile-development.env',
        )
      : join(homedir(), '.config', 'doji', 'mobile-development.env');
  const configPath = externalConfigPath(
    opts.envFile || process.env.DOJI_MOBILE_DEV_ENV_FILE || defaultPath,
    projectRoot,
  );
  const env = developmentEnvironment(parseEnv(readFileSync(configPath, 'utf8')), process.env);
  console.log(`Doji Dev source: ${projectRoot}`);
  console.log('Backend: staging only. Push/reporting off. No cloud build or store release.');
  console.log(
    opts.lan
      ? 'Metro LAN: use only trusted Wi-Fi; connect your iPhone and emulator to this server.'
      : 'Metro loopback: Android via adb reverse. Use --lan for your iPhone on trusted Wi-Fi.',
  );
  if (opts.check) return;
  const child = spawn(
    process.execPath,
    [
      join(projectRoot, 'node_modules', 'expo', 'bin', 'cli'),
      'start',
      '--dev-client',
      '--scheme',
      'doji-dev',
      opts.lan ? '--lan' : '--localhost',
      '--port',
      '8081',
    ],
    { cwd: projectRoot, env, stdio: 'inherit', windowsHide: true },
  );
  child.on('error', () => {
    console.error('Metro could not start');
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    // Configuration errors identify keys only; never print file contents or values.
    console.error(error instanceof Error ? error.message : 'Local development setup failed');
    process.exitCode = 1;
  }
}
