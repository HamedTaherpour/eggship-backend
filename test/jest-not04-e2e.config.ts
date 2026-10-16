import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/integration/postgres/not-04-push-installations-http.integration-spec.ts',
  ],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  setupFiles: ['<rootDir>/test/setup-not04-e2e.ts'],
};

export default config;
