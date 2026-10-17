import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';

export const LOAD_API_PORT = 3001;
export const LOAD_API_BASE_URL = `http://127.0.0.1:${LOAD_API_PORT}`;
export const LOAD_API_ORIGIN = `http://localhost:${LOAD_API_PORT}`;
export const LOAD_STATE_PATH = join(
  process.cwd(),
  '.local',
  'eggship-load-api.json',
);
export const TEST_LOCK_PATH = join(
  process.cwd(),
  '.local',
  'eggship-test.lock',
);

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function parseLocalTestDatabase(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      'TEST_DATABASE_URL is required for the isolated local load environment.',
    );
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('TEST_DATABASE_URL must use PostgreSQL.');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('TEST_DATABASE_URL must point to a local loopback host.');
  }
  if (url.port !== '' && url.port !== '5432') {
    throw new Error(
      'TEST_DATABASE_URL must use the local PostgreSQL port 5432.',
    );
  }
  const databaseName = decodeURIComponent(
    url.pathname.replace(/^\/+|\/+$/gu, ''),
  );
  if (databaseName !== 'eggship_test') {
    throw new Error(
      'TEST_DATABASE_URL must point to the explicitly permitted eggship_test database.',
    );
  }
  return { url, databaseName, identity: databaseIdentity(url) };
}

export function databaseIdentity(raw) {
  const url = raw instanceof URL ? raw : new URL(raw);
  const hostname = url.hostname.toLowerCase();
  const normalizedHost = LOOPBACK_HOSTS.has(hostname) ? 'loopback' : hostname;
  const databaseName = decodeURIComponent(
    url.pathname.replace(/^\/+|\/+$/gu, ''),
  );
  return `${normalizedHost}:${url.port || '5432'}/${databaseName}`;
}

export function parseLoadApiTarget(raw = LOAD_API_BASE_URL) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('LOAD_TEST_BASE_URL must be a valid HTTP(S) URL.');
  }
  if (
    url.protocol !== 'http:' ||
    !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new Error(
      'The isolated local load API must use an HTTP loopback URL.',
    );
  }
  if (url.port !== String(LOAD_API_PORT)) {
    throw new Error(
      `The isolated local load API must use port ${LOAD_API_PORT}; port 3000 is the development API.`,
    );
  }
  if (
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'LOAD_TEST_BASE_URL must be the plain isolated local API origin.',
    );
  }
  return url.toString().replace(/\/$/u, '');
}

export function acquireTestDatabaseLock(kind, identity) {
  mkdirSync(join(process.cwd(), '.local'), { recursive: true });
  const payload = {
    pid: process.pid,
    kind,
    identity,
    createdAt: new Date().toISOString(),
  };
  try {
    const fd = openSync(TEST_LOCK_PATH, 'wx');
    writeFileSync(fd, JSON.stringify(payload), { encoding: 'utf8' });
    closeSync(fd);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = readJson(TEST_LOCK_PATH);
    if (existing?.pid && isProcessAlive(existing.pid)) {
      throw new Error(
        `eggship_test is already in use by ${existing.kind ?? 'another local process'} (PID ${existing.pid}).`,
        { cause: error },
      );
    }
    unlinkSync(TEST_LOCK_PATH);
    const fd = openSync(TEST_LOCK_PATH, 'wx');
    writeFileSync(fd, JSON.stringify(payload), { encoding: 'utf8' });
    closeSync(fd);
  }
  return () => releaseFileIfOwned(TEST_LOCK_PATH, process.pid);
}

export function writeLoadApiState(identity) {
  mkdirSync(join(process.cwd(), '.local'), { recursive: true });
  writeFileSync(
    LOAD_STATE_PATH,
    JSON.stringify({ pid: process.pid, port: LOAD_API_PORT, identity }),
    { encoding: 'utf8' },
  );
}

export function clearLoadApiState() {
  releaseFileIfOwned(LOAD_STATE_PATH, process.pid);
}

export function requireLoadApiState(identity, baseUrl = LOAD_API_BASE_URL) {
  const target = parseLoadApiTarget(baseUrl);
  const state = readJson(LOAD_STATE_PATH);
  if (!state || (state.pid !== process.pid && !isProcessAlive(state.pid))) {
    throw new Error(
      'The isolated load API is not running. Start it with pnpm load:api.',
    );
  }
  if (state.port !== LOAD_API_PORT || state.identity !== identity) {
    throw new Error('The load API and TEST_DATABASE_URL targets do not match.');
  }
  return target;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function releaseFileIfOwned(path, pid) {
  const state = readJson(path);
  if (state?.pid === pid) {
    try {
      unlinkSync(path);
    } catch {
      /* cleanup is best effort during process exit */
    }
  }
}
