import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createPnpmProcess } from './lib/pnpm-process.mjs';
import {
  acquireTestDatabaseLock,
  clearLoadApiState,
  parseLocalTestDatabase,
  writeLoadApiState,
} from './lib/load-test-target.mjs';

const target = parseLocalTestDatabase(process.env.TEST_DATABASE_URL);
const releaseLock = acquireTestDatabaseLock('load API', target.identity);
process.once('exit', () => {
  clearLoadApiState();
  releaseLock();
});

const pnpm = createPnpmProcess(['exec', 'nest', 'start', '--watch']);
const child = spawn(pnpm.command, pnpm.args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: '3001',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
  },
  stdio: 'inherit',
});

writeLoadApiState(target.identity);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  });
}
child.on('error', (error) => {
  console.error(`load:api failed to start: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal && !stopping) process.exitCode = 1;
  else if (typeof code === 'number') process.exitCode = code;
});
