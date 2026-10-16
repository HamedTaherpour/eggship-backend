import { parseApprovedDevelopmentDatabase } from './dev-seed-safety.mjs';
import { mkdirSync } from 'node:fs';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function parseUrl(raw, label, forbidCredentials = true) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (forbidCredentials && (url.username || url.password)) {
    throw new Error(`${label} must not contain credentials.`);
  }
  return url;
}

export function assertLoadPreparationSafety(input) {
  if (input.nodeEnv !== 'development') {
    throw new Error('load:prepare requires NODE_ENV=development.');
  }

  const database = parseUrl(input.databaseUrl, 'DATABASE_URL', false);
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  if (!LOOPBACK_HOSTS.has(database.hostname.toLowerCase())) {
    throw new Error('DATABASE_URL must point to a loopback host.');
  }
  const databaseName = decodeURIComponent(
    database.pathname.replace(/^\//u, ''),
  );
  if (databaseName !== 'eggship') {
    throw new Error(
      'DATABASE_URL must point to the approved /eggship database.',
    );
  }
  if (
    /test|staging|prod|liara/iu.test(databaseName) ||
    /liara/iu.test(database.hostname)
  ) {
    throw new Error(
      'remote, test, staging, production, and Liara databases are rejected.',
    );
  }
  parseApprovedDevelopmentDatabase({
    nodeEnv: input.nodeEnv,
    databaseUrl: input.databaseUrl,
  });

  const api = parseUrl(input.apiBaseUrl, 'LOAD_TEST_BASE_URL');
  if (!['http:', 'https:'].includes(api.protocol)) {
    throw new Error('LOAD_TEST_BASE_URL must use HTTP(S).');
  }
  if (!LOOPBACK_HOSTS.has(api.hostname.toLowerCase())) {
    throw new Error('LOAD_TEST_BASE_URL must point to a loopback host.');
  }
  if (/production|staging|liara|(^|[.-])prod([.-]|$)/iu.test(api.hostname)) {
    throw new Error('production, staging, and Liara API targets are rejected.');
  }

  if (input.redisUrl) {
    const redis = parseUrl(input.redisUrl, 'REDIS_URL');
    if (!['redis:', 'rediss:'].includes(redis.protocol)) {
      throw new Error('REDIS_URL must use redis:// or rediss://.');
    }
    if (!LOOPBACK_HOSTS.has(redis.hostname.toLowerCase())) {
      throw new Error('REDIS_URL must point to a loopback host.');
    }
    const databaseIndex = redis.pathname.replace(/^\//u, '') || '0';
    if (!/^\d+$/u.test(databaseIndex) || databaseIndex === '2') {
      throw new Error(
        'REDIS_URL must use a numeric development DB other than Redis DB 2.',
      );
    }
  }

  if (input.testDatabaseUrl && input.testDatabaseUrl === input.databaseUrl) {
    throw new Error('load preparation must not use TEST_DATABASE_URL.');
  }
  if (input.testRedisUrl && input.testRedisUrl === input.redisUrl) {
    throw new Error('load preparation must not use TEST_REDIS_URL.');
  }

  return {
    databaseName,
    apiBaseUrl: api.toString().replace(/\/$/u, ''),
  };
}

export function assertInventorySafety(rows, minimumAvailable) {
  for (const row of rows) {
    const available = Number(row.onHand) - Number(row.reserved);
    if (!Number.isInteger(available) || available < minimumAvailable) {
      throw new Error(
        'Synthetic order inventory is below the bounded load-test safety floor.',
      );
    }
  }
}

export function assertFreshAccessToken(
  token,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const parts = token.split('.');
  if (parts.length !== 3)
    throw new Error('Authentication flow did not return a JWT access token.');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Authentication flow returned an unreadable access token.');
  }
  if (!Number.isInteger(payload.exp) || payload.exp <= nowSeconds) {
    throw new Error('Authentication flow returned an expired access token.');
  }
  return payload.exp - nowSeconds;
}

export function buildSyntheticOrderRequest(
  regionId,
  productId,
  idempotencyKey,
  quantity = 1,
) {
  return {
    regionId,
    lines: [{ productId, quantity }],
    idempotencyKey,
  };
}

export function buildAdminProvisioningSpawnOptions() {
  return {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  };
}

export function buildAdminProvisioningArgs(email) {
  return [
    'admin:create',
    '--',
    '--email',
    email,
    '--role',
    'SUPER_ADMIN',
    '--confirm',
    'yes',
  ];
}

export function ensureLoadPreparationDirectory(path) {
  mkdirSync(path, { recursive: true });
}

export function buildAuthState(customers, admin = null) {
  return {
    customers,
    ...(admin === null ? {} : { admin }),
  };
}

export function parseRetryAfterSeconds(value) {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) return null;
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0 && seconds <= 86_400
    ? seconds
    : null;
}

export class ApiRequestError extends Error {
  constructor({ method, url, status, code, retryAfterSeconds }) {
    const path = new URL(url).pathname;
    const codeSuffix = typeof code === 'string' ? ` (${code})` : '';
    const retrySuffix =
      Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
        ? ` Retry after ${retryAfterSeconds} seconds.`
        : '';
    super(
      `API request failed for ${method.toUpperCase()} ${path} with HTTP ${status}.${codeSuffix}${retrySuffix}`,
    );
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [REDACTED]')
    .replace(/(postgres(?:ql)?:\/\/)[^@\s/]+@/giu, '$1[REDACTED]@')
    .replace(/\b[A-Za-z0-9_-]{80,}\b/gu, '[REDACTED]');
}
