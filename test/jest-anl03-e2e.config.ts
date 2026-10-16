import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/integration/postgres/anl-03-analytics-http.integration-spec.ts',
  ],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  setupFiles: ['<rootDir>/tests/integration/setup/setup-integration.ts'],
};

export default config;
