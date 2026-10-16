const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function parseApprovedDevelopmentDatabase(input = {}) {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const databaseUrl = input.databaseUrl ?? process.env.DATABASE_URL;
  if (nodeEnv !== 'development') {
    throw new Error('db:seed:dev requires NODE_ENV=development.');
  }
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('db:seed:dev requires an explicit DATABASE_URL.');
  }
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL URL.');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('db:seed:dev requires a PostgreSQL DATABASE_URL.');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      'db:seed:dev is loopback-only and refuses non-local database hosts.',
    );
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  if (database !== 'eggship') {
    throw new Error(
      'db:seed:dev only permits the explicitly approved database /eggship.',
    );
  }
  return {
    connectionString: databaseUrl,
    displayTarget: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}/${database}`,
  };
}

export function parseApprovedSeedDatabase(input = {}) {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const databaseUrl = input.databaseUrl ?? process.env.DATABASE_URL;
  const seedTarget =
    input.seedTarget ?? process.env.EGGSHIP_SEED_TARGET ?? 'development';
  if (nodeEnv !== 'development') {
    throw new Error('Seed requires NODE_ENV=development.');
  }
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('Seed requires an explicit DATABASE_URL.');
  }
  if (seedTarget !== 'development' && seedTarget !== 'test') {
    throw new Error('Seed target must be development or test.');
  }
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL URL.');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('Seed requires a PostgreSQL DATABASE_URL.');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      'Seed is loopback-only and refuses non-local database hosts.',
    );
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  const expectedDatabase = seedTarget === 'test' ? 'eggship_test' : 'eggship';
  if (database !== expectedDatabase) {
    throw new Error(
      `Seed target ${seedTarget} only permits the explicitly approved database /${expectedDatabase}.`,
    );
  }
  return {
    connectionString: databaseUrl,
    displayTarget: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}/${database}`,
  };
}
