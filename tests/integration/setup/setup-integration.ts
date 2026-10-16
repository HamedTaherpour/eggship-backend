import { generateKeyPairSync } from 'node:crypto';
import {
  applyIntegrationEnvironment,
  mergeIntegrationKeysIntoProcessEnv,
  readIntegrationKeysFromEnvFile,
  resolveIntegrationEnvironment,
  type IntegrationSuite,
} from '../support/integration-environment';

const suite = parseSuite(process.env['INTEGRATION_SUITE']);

mergeIntegrationKeysIntoProcessEnv(
  readIntegrationKeysFromEnvFile(process.cwd(), process.env, suite),
);
const resolved = resolveIntegrationEnvironment({ suite });
applyIntegrationEnvironment(resolved);

if (suite === 'all' || suite === 'redis') {
  process.env['FCM_PROJECT_ID'] ??= 'integration-test-project';
  process.env['FCM_CLIENT_EMAIL'] ??= 'integration-test@example.invalid';
  process.env['FCM_PRIVATE_KEY'] ??= generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
}

function parseSuite(value: string | undefined): IntegrationSuite {
  if (value === undefined || value === '' || value === 'all') {
    return 'all';
  }
  if (value === 'postgres' || value === 'redis' || value === 'storage') {
    return value;
  }
  throw new Error(
    `INTEGRATION_SUITE must be all, postgres, redis, or storage (received '${value}').`,
  );
}
