import { execSync } from 'node:child_process';

/**
 * Run WXT CLI with Node 20+ when possible. web-ext retries Firefox debugger
 * connections under Node; under Bun the first ECONNREFUSED often kills dev.
 */
const root = import.meta.dir + '/..';
const cli = `${root}/node_modules/wxt/dist/cli/index.mjs`;

const nodeMajorVersion = (nodeBin: string): number | undefined => {
  try {
    const version = execSync(`"${nodeBin}" -v`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return Number(version.replace(/^v/, '').split('.')[0]);
  } catch {
    return undefined;
  }
};

const nodeCandidates = (): string[] => {
  const home = process.env.HOME;
  return [
    process.env.WXT_NODE,
    'node',
    home ? `${home}/.local/share/fnm/aliases/default/bin/node` : undefined,
    home ? `${home}/.fnm/aliases/default/bin/node` : undefined,
    home ? `${home}/.volta/bin/node` : undefined,
  ].filter((value): value is string => Boolean(value));
};

const resolveArgv = (): string[] => {
  for (const nodeBin of nodeCandidates()) {
    const major = nodeMajorVersion(nodeBin);
    if (major !== undefined && major >= 20) {
      return [nodeBin, cli, ...process.argv.slice(2)];
    }
  }
  console.warn(
    '[wxt] Node 20+ not found (set WXT_NODE or fix PATH). Falling back to Bun; Firefox dev may fail with ECONNREFUSED.',
  );
  return ['bun', cli, ...process.argv.slice(2)];
};

const proc = Bun.spawn(resolveArgv(), {
  cwd: root,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  env: {
    ...process.env,
    // Vite also binds `o` + enter; WXT uses the same for restartBrowser — disable Vite's.
    CI: process.env.CI ?? 'true',
    ...(process.env.NO_COLOR
      ? {}
      : { FORCE_COLOR: process.env.FORCE_COLOR ?? '1' }),
  },
});

process.exit(await proc.exited);
