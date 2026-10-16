import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createPnpmProcess } from './pnpm-process.mjs';

describe('createPnpmProcess', () => {
  it('preserves pnpm argument boundaries without a shell on Unix', () => {
    assert.deepEqual(
      createPnpmProcess(['exec', 'jest', '--runInBand'], { platform: 'linux' }),
      {
        command: 'pnpm',
        args: ['exec', 'jest', '--runInBand'],
      },
    );
  });

  it('uses Node to execute the resolved pnpm CLI on Windows', () => {
    const process = createPnpmProcess(
      ['admin:create', '--', '--email', 'a&b@test'],
      {
        platform: 'win32',
        pathValue: 'C:\\tools;C:\\pnpm',
        nodePath: 'C:\\node\\node.exe',
        exists: (path) =>
          path === 'C:\\pnpm\\node_modules\\pnpm\\bin\\pnpm.cjs',
      },
    );
    assert.deepEqual(process, {
      command: 'C:\\node\\node.exe',
      args: [
        'C:\\pnpm\\node_modules\\pnpm\\bin\\pnpm.cjs',
        'admin:create',
        '--',
        '--email',
        'a&b@test',
      ],
    });
  });

  it('fails closed on Windows when no safe pnpm CLI is available', () => {
    assert.throws(
      () =>
        createPnpmProcess(['--version'], {
          platform: 'win32',
          pathValue: 'C:\\tools',
          exists: () => false,
        }),
      /Unable to find pnpm\.cjs/,
    );
  });
});
