/**
 * Run WXT CLI under Node. web-ext’s Firefox debugger path relies on Node’s
 * `domain` behavior; Bun can exit on the first ECONNREFUSED before retries.
 *
 * Default FORCE_COLOR when stdout is piped (e.g. dev-all prefixes); honor NO_COLOR.
 */
const root = import.meta.dir + '/..';
const cli = `${root}/node_modules/wxt/dist/cli/index.mjs`;
const nodeBin = process.env.WXT_NODE ?? 'node';

const proc = Bun.spawn([nodeBin, cli, ...process.argv.slice(2)], {
  cwd: root,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  env: {
    ...process.env,
    ...(process.env.NO_COLOR
      ? {}
      : { FORCE_COLOR: process.env.FORCE_COLOR ?? '1' }),
  },
});

process.exit(await proc.exited);
