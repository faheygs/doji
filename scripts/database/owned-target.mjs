// A test child may use only the UUID-labelled container created by its parent.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { engine, verifyOwnedContainer } from './config.mjs';
export { engine };
export const container = process.env.DOJI_CLEAN_ROOM_CONTAINER;
assert.match(container || '', /^doji-db-test-[0-9a-f-]{36}$/, 'Run through npm run test:database');
const info = JSON.parse(
  execFileSync(engine, ['inspect', container], { encoding: 'utf8', timeout: 10000 }),
)[0];
verifyOwnedContainer(info, container);
