import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import {
  assertFreshAccessToken,
  assertInventorySafety,
  assertLoadPreparationSafety,
  ApiRequestError,
  buildAdminProvisioningArgs,
  buildAdminProvisioningSpawnOptions,
  classifyAdminProvisioningFailure,
  formatAdminProvisioningFailure,
  buildAuthState,
  buildSyntheticOrderRequest,
  buildSyntheticStoreProfile,
  assertSyntheticOrderSnapshot,
  ensureLoadPreparationDirectory,
  parseRetryAfterSeconds,
  redactError,
  assertIsolatedLoadPreparationSafety,
} from './lib/load-prepare-safety.mjs';
import { LOAD_API_ORIGIN } from './lib/load-test-target.mjs';

const safe = {
  nodeEnv: 'development',
  databaseUrl: 'postgresql://user:password@127.0.0.1:5432/eggship',
  apiBaseUrl: 'http://127.0.0.1:3000',
  redisUrl: 'redis://127.0.0.1:6379/0',
};

describe('k6 fixture preparation safety', () => {
  it('uses the canonical allowed Origin for the isolated load API', () => {
    assert.equal(LOAD_API_ORIGIN, 'http://localhost:3001');
    assert.notEqual(LOAD_API_ORIGIN, 'http://127.0.0.1:3001');
  });

  it('accepts only the isolated local test database and port', () => {
    const isolated = assertIsolatedLoadPreparationSafety({
      nodeEnv: 'development',
      databaseUrl: 'postgresql://user:password@127.0.0.1:5432/eggship_test',
      testDatabaseUrl: 'postgresql://user:password@127.0.0.1:5432/eggship_test',
      apiBaseUrl: 'http://127.0.0.1:3001',
      redisUrl: 'redis://127.0.0.1:6379/0',
    });
    assert.equal(isolated.databaseName, 'eggship_test');
    assert.throws(
      () =>
        assertIsolatedLoadPreparationSafety({
          nodeEnv: 'development',
          databaseUrl: 'postgresql://user:password@127.0.0.1:5432/eggship',
          apiBaseUrl: 'http://127.0.0.1:3001',
        }),
      /eggship_test/u,
    );
    assert.throws(
      () =>
        assertIsolatedLoadPreparationSafety({
          nodeEnv: 'development',
          databaseUrl: 'postgresql://user:password@127.0.0.1:5432/eggship_test',
          apiBaseUrl: 'http://127.0.0.1:3000',
        }),
      /port 3001/u,
    );
  });
  it('rejects production, remote, test, and Redis DB 2 targets', () => {
    assert.throws(
      () => assertLoadPreparationSafety({ ...safe, nodeEnv: 'production' }),
      /development/,
    );
    assert.throws(
      () =>
        assertLoadPreparationSafety({
          ...safe,
          databaseUrl: 'postgresql://x@remote/eggship',
        }),
      /loopback/,
    );
    assert.throws(
      () =>
        assertLoadPreparationSafety({
          ...safe,
          databaseUrl: 'postgresql://x@127.0.0.1/eggship_test',
        }),
      /approved/,
    );
    assert.throws(
      () =>
        assertLoadPreparationSafety({
          ...safe,
          redisUrl: 'redis://127.0.0.1:6379/2',
        }),
      /DB 2/,
    );
  });

  it('accepts only the approved local target and protects inventory', () => {
    assert.equal(assertLoadPreparationSafety(safe).databaseName, 'eggship');
    assert.doesNotThrow(() =>
      assertInventorySafety([{ onHand: 100, reserved: 1 }], 25),
    );
    assert.throws(
      () => assertInventorySafety([{ onHand: 25, reserved: 1 }], 25),
      /safety floor/,
    );
  });

  it('keeps the synthetic order idempotency request deterministic', () => {
    const first = buildSyntheticOrderRequest('region', 'product', 'key');
    const second = buildSyntheticOrderRequest('region', 'product', 'key');
    assert.deepEqual(first, second);
    assert.equal(first.lines[0].quantity, 1);
  });

  it('builds deterministic fictional Iranian StoreProfiles', () => {
    const first = buildSyntheticStoreProfile(0);
    assert.deepEqual(first, buildSyntheticStoreProfile(0));
    assert.match(first.storeName, /تهران/u);
    assert.ok(first.latitude >= -90 && first.latitude <= 90);
    assert.ok(first.longitude >= -180 && first.longitude <= 180);
    assert.throws(() => buildSyntheticStoreProfile(5), /outside/u);
  });

  it('rejects a synthetic order snapshot that does not match its profile', () => {
    const profile = buildSyntheticStoreProfile(0);
    const snapshot = {
      deliveryStoreName: profile.storeName,
      deliveryAddress: profile.address,
      deliveryLatitude: profile.latitude,
      deliveryLongitude: profile.longitude,
    };
    assert.doesNotThrow(() => assertSyntheticOrderSnapshot(snapshot, profile));
    assert.throws(
      () =>
        assertSyntheticOrderSnapshot(
          { ...snapshot, deliveryStoreName: 'other' },
          profile,
        ),
      /snapshot/u,
    );
  });

  it('keeps provisioning arguments shell-free and explicit', () => {
    assert.equal(buildAdminProvisioningSpawnOptions().shell, undefined);
    assert.equal(buildAdminProvisioningSpawnOptions().maxBuffer, 1024 * 1024);
    assert.deepEqual(buildAdminProvisioningArgs('admin@test'), [
      '--email',
      'admin@test',
      '--role',
      'SUPER_ADMIN',
      '--confirm',
      'yes',
    ]);
    assert.equal(
      buildAdminProvisioningArgs('admin@test').includes('--'),
      false,
    );
  });

  it('rejects a standalone argument separator at the Admin CLI boundary', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/admin-create.mjs', '--'],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown flag: --/u);
  });

  it('reports a redacted provisioning step and safe failure category', () => {
    assert.equal(
      classifyAdminProvisioningFailure(
        'Admin password does not meet the minimum policy.',
      ),
      'password',
    );
    assert.equal(
      classifyAdminProvisioningFailure('ECONNREFUSED postgres database'),
      'database',
    );
    assert.equal(
      classifyAdminProvisioningFailure(
        'An admin with this email already exists.',
      ),
      'duplicate',
    );
    const message = formatAdminProvisioningFailure({
      status: 1,
      stderr:
        'Admin password does not meet the minimum policy.\nELIFECYCLE Command failed with exit code 1',
      stdout: '',
    });
    assert.match(message, /during admin:create \[password; exit code 1\]/u);
    assert.match(message, /minimum policy/u);
    assert.doesNotMatch(message, /ELIFECYCLE/u);

    const redacted = formatAdminProvisioningFailure({
      status: 1,
      stderr: 'DATABASE_URL=postgresql://user:secret@localhost/eggship_test',
      stdout: '',
    });
    assert.doesNotMatch(redacted, /secret|postgresql:\/\//u);
  });

  it('creates the ignored local directory before provisioning writes credentials', () => {
    const path = mkdtempSync(`${tmpdir()}/eggship-load-`);
    const nested = `${path}/.local`;
    ensureLoadPreparationDirectory(nested);
    assert.equal(existsSync(nested), true);
    rmSync(path, { recursive: true, force: true });
  });

  it('accepts only bounded positive Retry-After cooldowns', () => {
    assert.equal(parseRetryAfterSeconds('22'), 22);
    assert.equal(parseRetryAfterSeconds('0'), null);
    assert.equal(parseRetryAfterSeconds('86400'), 86400);
    assert.equal(parseRetryAfterSeconds('86401'), null);
    assert.equal(parseRetryAfterSeconds('not-a-duration'), null);
  });

  it('supports checkpointing partial customer authentication state', () => {
    assert.deepEqual(
      buildAuthState([
        { phone: '+989120000001', userId: 'user-1', refreshToken: 'refresh-1' },
      ]),
      {
        customers: [
          {
            phone: '+989120000001',
            userId: 'user-1',
            refreshToken: 'refresh-1',
          },
        ],
      },
    );
  });

  it('reports sanitized endpoint and cooldown diagnostics for API rate limits', () => {
    const error = new ApiRequestError({
      method: 'POST',
      url: 'http://127.0.0.1:3000/api/v1/auth/otp/request',
      status: 429,
      code: 'AUTH_OTP_RATE_LIMITED',
      retryAfterSeconds: 3260,
    });
    assert.match(error.message, /POST \/api\/v1\/auth\/otp\/request/);
    assert.match(error.message, /AUTH_OTP_RATE_LIMITED/);
    assert.match(error.message, /3260 seconds/);
    assert.doesNotMatch(error.message, /Bearer|password|refresh/i);
  });

  it('rejects expired tokens and redacts secrets from diagnostics', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString(
      'base64url',
    );
    const payload = Buffer.from(JSON.stringify({ exp: 99 })).toString(
      'base64url',
    );
    assert.throws(
      () => assertFreshAccessToken(`${header}.${payload}.sig`, 100),
      /expired/,
    );
    assert.match(
      redactError(new Error('Bearer abc.def.ghi postgres://u:p@127.0.0.1/db')),
      /REDACTED/,
    );
    assert.doesNotMatch(
      redactError(new Error('Bearer abc.def.ghi')),
      /abc\.def\.ghi/,
    );
  });
});
