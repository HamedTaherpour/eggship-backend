import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import {
  assertFreshAccessToken,
  assertInventorySafety,
  assertLoadPreparationSafety,
  assertSyntheticOrderSnapshot,
  ApiRequestError,
  buildAdminProvisioningArgs,
  buildAdminProvisioningSpawnOptions,
  buildAuthState,
  buildSyntheticOrderRequest,
  buildSyntheticStoreProfile,
  ensureLoadPreparationDirectory,
  parseRetryAfterSeconds,
  redactError,
} from './lib/load-prepare-safety.mjs';
import { createPnpmProcess } from './lib/pnpm-process.mjs';

const { Client } = pg;
const API_BASE_URL = process.env.LOAD_TEST_BASE_URL ?? 'http://127.0.0.1:3000';
const LOCAL_DIR = join(process.cwd(), '.local');
const CONFIG_PATH = join(LOCAL_DIR, 'eggship-k6.env');
const ADMIN_SECRET_PATH = join(LOCAL_DIR, 'eggship-k6-admin.json');
const AUTH_STATE_PATH = join(LOCAL_DIR, 'eggship-k6-auth.json');
const SYNTHETIC_PHONES = [1, 2, 3, 4, 5].map(
  (suffix) => `+9891200000${String(suffix).padStart(2, '0')}`,
);
const REGION_ID = '00000000-0000-4000-8000-000000000010';
const PRODUCT_IDS = [
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000203',
];
const ORDER_IDEMPOTENCY_KEYS = SYNTHETIC_PHONES.map(
  (_, index) => `00000000-0000-4000-8000-00000000040${index + 1}`,
);
const ORDER_CREATION_ATTEMPT_LIMIT = 50;
const MINIMUM_AVAILABLE = ORDER_CREATION_ATTEMPT_LIMIT;
const ADMIN_EMAIL = 'load-test-admin@localhost.test';

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error' });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // The status below is enough for the safe diagnostic.
  }
  if (!response.ok) {
    const retryAfter =
      parseRetryAfterSeconds(response.headers.get('retry-after')) ??
      parseRetryAfterSeconds(
        String(body?.error?.details?.retryAfterSeconds ?? ''),
      );
    throw new ApiRequestError({
      method: options.method ?? 'GET',
      url,
      status: response.status,
      code: body?.error?.code,
      retryAfterSeconds: retryAfter,
    });
  }
  return { body, response };
}

function cookieFromResponse(response, name) {
  const cookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  return cookie?.split(';', 1)[0]?.slice(name.length + 1);
}

function accessTokenFromResponse(response, name = 'eggship_at') {
  const token = cookieFromResponse(response, name);
  if (!token)
    throw new Error(
      'Authentication flow did not set the customer access cookie.',
    );
  assertFreshAccessToken(token);
  return token;
}

async function refreshAccessToken(
  refreshToken,
  cookieName,
  accessCookieName,
  path,
) {
  try {
    const namespace = cookieName.includes('admin') ? 'admin' : 'customer';
    const csrf = await getCsrf(namespace);
    const result = await requestJson(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Cookie: `${cookieName}=${refreshToken}; ${csrf.cookie}`,
        'X-CSRF-Token': csrf.token,
        Origin: 'http://127.0.0.1:3000',
      },
    });
    const accessToken = accessTokenFromResponse(
      result.response,
      accessCookieName,
    );
    const nextRefreshToken =
      cookieFromResponse(result.response, cookieName) ?? refreshToken;
    return { token: accessToken, refreshToken: nextRefreshToken };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 429) {
      throw error;
    }
    return null;
  }
}

async function getCsrf(namespace) {
  const result = await requestJson(
    `${API_BASE_URL}${namespace === 'admin' ? '/api/v1/admin/auth/csrf' : '/api/v1/auth/csrf'}`,
  );
  const cookieName =
    namespace === 'admin' ? 'eggship_admin_csrf' : 'eggship_csrf';
  const token = result.body?.data?.token;
  const cookie = cookieFromResponse(result.response, cookieName);
  if (typeof token !== 'string' || !cookie)
    throw new Error('CSRF bootstrap did not return a token.');
  return { token, cookie: `${cookieName}=${cookie}` };
}

async function authenticateCustomer(phone) {
  const otpCode = process.env.OTP_DEV_CODE ?? '111111';
  const csrf = await getCsrf('customer');
  const csrfHeaders = {
    'X-CSRF-Token': csrf.token,
    Origin: 'http://127.0.0.1:3000',
    Cookie: csrf.cookie,
  };
  const requested = await requestJson(
    `${API_BASE_URL}/api/v1/auth/otp/request`,
    {
      method: 'POST',
      headers: { ...csrfHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    },
  );
  const challengeId = requested.body?.data?.challengeId;
  if (typeof challengeId !== 'string')
    throw new Error('OTP request did not return a challenge.');
  const verified = await requestJson(`${API_BASE_URL}/api/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { ...csrfHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, code: otpCode }),
  });
  const grantId = verified.body?.data?.verificationGrantId;
  if (typeof grantId !== 'string')
    throw new Error('OTP verification did not return a grant.');
  const completed = await requestJson(`${API_BASE_URL}/api/v1/auth/complete`, {
    method: 'POST',
    headers: { ...csrfHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ verificationGrantId: grantId }),
  });
  const userId = completed.body?.data?.user?.id;
  if (typeof userId !== 'string')
    throw new Error('Customer authentication did not return a user id.');
  return {
    userId,
    token: accessTokenFromResponse(completed.response),
    refreshToken: cookieFromResponse(completed.response, 'eggship_rt'),
  };
}

async function prepareCustomerStoreProfile(customer, index) {
  const profile = buildSyntheticStoreProfile(index);
  const result = await requestJson(`${API_BASE_URL}/api/v1/users/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${customer.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profile),
  });
  const persisted = result.body?.data?.user?.storeProfile;
  if (
    persisted?.storeName !== profile.storeName ||
    persisted?.address !== profile.address ||
    persisted?.latitude !== profile.latitude ||
    persisted?.longitude !== profile.longitude
  ) {
    throw new Error(
      'Synthetic StoreProfile preparation did not persist the expected values.',
    );
  }
  return profile;
}

function readAdminSecret() {
  if (!existsSync(ADMIN_SECRET_PATH)) return null;
  const value = JSON.parse(readFileSync(ADMIN_SECRET_PATH, 'utf8'));
  if (value.email !== ADMIN_EMAIL || typeof value.password !== 'string')
    return null;
  return value;
}

function createAdminSecret() {
  return {
    email: ADMIN_EMAIL,
    password: randomBytes(32).toString('base64url'),
  };
}

function writeAuthState(customers, admin = null) {
  writeFileSync(
    AUTH_STATE_PATH,
    JSON.stringify(buildAuthState(customers, admin)),
    { mode: 0o600 },
  );
}

function provisionAdmin(secret) {
  const pnpm = createPnpmProcess(buildAdminProvisioningArgs(secret.email));
  const result = spawnSync(pnpm.command, pnpm.args, {
    env: { ...process.env, EGGSHIP_ADMIN_CREATE_PASSWORD: secret.password },
    ...buildAdminProvisioningSpawnOptions(),
  });
  if (result.status !== 0)
    throw new Error('Synthetic Admin provisioning failed.');
}

async function authenticateAdmin(secret) {
  const csrf = await getCsrf('admin');
  const result = await requestJson(`${API_BASE_URL}/api/v1/admin/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf.token,
      Origin: 'http://127.0.0.1:3000',
      Cookie: csrf.cookie,
    },
    body: JSON.stringify({ email: secret.email, password: secret.password }),
  });
  const adminId = result.body?.data?.admin?.id;
  if (typeof adminId !== 'string')
    throw new Error('Admin authentication did not return an admin id.');
  const cookies =
    typeof result.response.headers.getSetCookie === 'function'
      ? result.response.headers.getSetCookie()
      : [result.response.headers.get('set-cookie') ?? ''];
  const cookie = cookies.find((value) => value.startsWith('eggship_admin_at='));
  const token = cookie?.split(';', 1)[0]?.slice('eggship_admin_at='.length);
  if (!token)
    throw new Error('Authentication flow did not set the Admin access cookie.');
  assertFreshAccessToken(token);
  return {
    adminId,
    token,
    refreshToken: cookieFromResponse(result.response, 'eggship_admin_rt'),
  };
}

function writeShellConfig(values) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  const shellQuote = (value) => `'${String(value).replaceAll("'", "'\"'\"'")}'`;
  const content = `${Object.entries(values)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join('\n')}\n`;
  writeFileSync(CONFIG_PATH, content, { mode: 0o600 });
}

async function prepare() {
  const safety = assertLoadPreparationSafety({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    apiBaseUrl: API_BASE_URL,
    redisUrl: process.env.REDIS_URL,
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    testRedisUrl: process.env.TEST_REDIS_URL,
  });
  if (process.env.OTP_PROVIDER && process.env.OTP_PROVIDER !== 'development') {
    throw new Error(
      'load:prepare requires OTP_PROVIDER=development and never calls a real SMS provider.',
    );
  }
  if (process.env.LOAD_TEST_RESET || process.env.LOAD_TEST_RESEED) {
    throw new Error(
      'Reset and reseed flags are not supported by load:prepare.',
    );
  }
  ensureLoadPreparationDirectory(LOCAL_DIR);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let inventory;
  try {
    const catalog = await client.query(
      `SELECT c."id" AS "categoryId", p."id" AS "productId", p."isActive" AS "productActive", i."onHand", i."reserved"
       FROM "Category" c JOIN "Product" p ON p."categoryId" = c."id"
       JOIN "Inventory" i ON i."productId" = p."id"
       WHERE c."isActive" = true AND p."id" = ANY($1::uuid[]) AND p."isActive" = true`,
      [PRODUCT_IDS],
    );
    const region = await client.query(
      `SELECT "id" FROM "Region" WHERE "id" = $1::uuid AND "isActive" = true`,
      [REGION_ID],
    );
    const commerce = await client.query(
      `SELECT "id", "minimumOrderQuantity" FROM "CommerceSettings" WHERE "id" = 1`,
    );
    if (
      catalog.rows.length !== PRODUCT_IDS.length ||
      region.rowCount !== 1 ||
      commerce.rowCount !== 1
    ) {
      throw new Error(
        'Required active catalog, region, inventory, or commerce fixtures are missing.',
      );
    }
    inventory = catalog.rows;
    assertInventorySafety(inventory, MINIMUM_AVAILABLE);
  } finally {
    await client.end();
  }

  const customerAuth = [];
  const customerProfiles = [];
  let previousAuth = null;
  if (existsSync(AUTH_STATE_PATH)) {
    try {
      previousAuth = JSON.parse(readFileSync(AUTH_STATE_PATH, 'utf8'));
    } catch {
      previousAuth = null;
    }
  }
  for (const phone of SYNTHETIC_PHONES) {
    const cached = previousAuth?.customers?.find(
      (entry) => entry.phone === phone,
    );
    const refreshed = cached?.refreshToken
      ? await refreshAccessToken(
          cached.refreshToken,
          'eggship_rt',
          'eggship_at',
          '/api/v1/auth/refresh',
        )
      : null;
    const customer = refreshed
      ? { userId: cached.userId, ...refreshed }
      : await authenticateCustomer(phone);
    customerAuth.push(customer);
    customerProfiles.push(
      await prepareCustomerStoreProfile(customer, customerAuth.length - 1),
    );
    writeAuthState(
      SYNTHETIC_PHONES.slice(0, customerAuth.length).map(
        (processedPhone, index) => ({
          phone: processedPhone,
          userId: customerAuth[index].userId,
          refreshToken: customerAuth[index].refreshToken,
        }),
      ),
      previousAuth?.admin ?? null,
    );
  }

  let adminSecret = readAdminSecret();
  const adminClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await adminClient.connect();
  let adminExists;
  try {
    adminExists = await adminClient.query(
      `SELECT "id", "role", "isActive" FROM "Admin" WHERE "email" = $1`,
      [ADMIN_EMAIL],
    );
  } finally {
    await adminClient.end();
  }
  if (adminExists.rowCount === 0) {
    adminSecret ??= createAdminSecret();
    writeFileSync(ADMIN_SECRET_PATH, JSON.stringify(adminSecret), {
      mode: 0o600,
    });
    provisionAdmin(adminSecret);
  } else if (
    adminExists.rows[0].role !== 'SUPER_ADMIN' ||
    adminExists.rows[0].isActive !== true
  ) {
    throw new Error(
      'Synthetic Admin exists but is not an active SUPER_ADMIN; refusing to mutate it.',
    );
  }
  const refreshedAdmin = previousAuth?.admin?.refreshToken
    ? await refreshAccessToken(
        previousAuth.admin.refreshToken,
        'eggship_admin_rt',
        'eggship_admin_at',
        '/api/v1/admin/auth/refresh',
      )
    : null;
  let adminAuth;
  if (refreshedAdmin) {
    adminAuth = { adminId: previousAuth.admin.adminId, ...refreshedAdmin };
  } else {
    if (!adminSecret) {
      throw new Error(
        'Synthetic Admin exists but its ignored local credential file and reusable session are missing; restore them or remove only that synthetic Admin manually.',
      );
    }
    adminAuth = await authenticateAdmin(adminSecret);
  }
  writeAuthState(
    SYNTHETIC_PHONES.map((phone, index) => ({
      phone,
      userId: customerAuth[index].userId,
      refreshToken: customerAuth[index].refreshToken,
    })),
    { adminId: adminAuth.adminId, refreshToken: adminAuth.refreshToken },
  );

  const commerceMinimum = await getCommerceMinimum();
  const orderIds = [];
  for (const [index, customer] of customerAuth.entries()) {
    const orderRequest = buildSyntheticOrderRequest(
      REGION_ID,
      PRODUCT_IDS[0],
      ORDER_IDEMPOTENCY_KEYS[index],
      commerceMinimum,
    );
    const order = await requestJson(`${API_BASE_URL}/api/v1/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customer.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': orderRequest.idempotencyKey,
      },
      body: JSON.stringify({
        regionId: orderRequest.regionId,
        lines: orderRequest.lines,
      }),
    });
    const orderId = order.body?.data?.id;
    if (typeof orderId !== 'string')
      throw new Error(
        'Synthetic order fixture response did not include an order id.',
      );
    orderIds.push(orderId);
    assertSyntheticOrderSnapshot(order.body?.data, customerProfiles[index]);
  }

  const finalClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await finalClient.connect();
  try {
    const finalInventory = await finalClient.query(
      `SELECT i."onHand", i."reserved"
       FROM "Inventory" i
       WHERE i."productId" = ANY($1::uuid[])`,
      [PRODUCT_IDS],
    );
    if (finalInventory.rows.length !== PRODUCT_IDS.length)
      throw new Error('Final order-creation inventory verification failed.');
    assertInventorySafety(finalInventory.rows, MINIMUM_AVAILABLE);
  } finally {
    await finalClient.end();
  }

  writeShellConfig({
    LOAD_TESTS_ENABLED: 'true',
    LOAD_TEST_ENV: 'local',
    LOAD_TEST_BASE_URL: safety.apiBaseUrl,
    LOAD_TEST_USER_TOKENS: customerAuth.map(({ token }) => token).join(','),
    LOAD_TEST_ADMIN_TOKEN: adminAuth.token,
    LOAD_TEST_PRODUCT_IDS: PRODUCT_IDS.join(','),
    LOAD_TEST_REGION_ID: REGION_ID,
    LOAD_TEST_ORDER_IDS: orderIds.join(','),
  });
  console.log(
    `Prepared local k6 fixtures in ${CONFIG_PATH}. Tokens and credentials were not printed.`,
  );
}

async function getCommerceMinimum() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT "minimumOrderQuantity" FROM "CommerceSettings" WHERE "id" = 1`,
    );
    const minimum = result.rows[0]?.minimumOrderQuantity;
    if (!Number.isInteger(minimum) || minimum < 1)
      throw new Error('Commerce minimum order quantity is invalid.');
    return minimum;
  } finally {
    await client.end();
  }
}

prepare().catch((error) => {
  console.error(`load:prepare failed: ${redactError(error)}`);
  process.exitCode = 1;
});
