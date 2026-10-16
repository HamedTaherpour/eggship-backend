import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * Builds a shell-free pnpm invocation.
 *
 * Windows `.cmd` shims require a shell, which both loses argument boundaries
 * and triggers Node DEP0190. Resolve the installed pnpm JavaScript entrypoint
 * instead and execute it with the current Node runtime.
 */
export function createPnpmProcess(args, options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') {
    return { command: 'pnpm', args: [...args] };
  }

  const pathValue = options.pathValue ?? process.env.Path ?? process.env.PATH;
  const pathDelimiter = platform === 'win32' ? ';' : delimiter;
  const pathEntries =
    typeof pathValue === 'string' ? pathValue.split(pathDelimiter) : [];
  const exists = options.exists ?? existsSync;
  for (const entry of pathEntries) {
    if (entry === '') continue;
    const cli = join(entry, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (exists(cli)) {
      return {
        command: options.nodePath ?? process.execPath,
        args: [cli, ...args],
      };
    }
  }

  throw new Error(
    'Unable to find pnpm.cjs beside a pnpm command shim. Install pnpm normally and retry.',
  );
}
