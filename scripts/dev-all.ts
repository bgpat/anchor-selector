import { resolveFirefoxBinary } from './resolve-firefox';

const root = import.meta.dir + '/..';

const targets: { name: string; script: string }[] = [
  { name: 'chrome', script: 'dev:chrome' },
];

const firefoxBin = resolveFirefoxBinary();
if (firefoxBin) {
  targets.push({ name: 'firefox', script: 'dev:firefox' });
} else {
  console.warn(
    '[dev] Firefox executable not found — starting Chrome only.\n' +
      '      Install Firefox or set FIREFOX_BIN to the firefox binary path.',
  );
}

const procs = targets.map(({ name, script }) => {
  const proc = Bun.spawn(['bun', 'run', script], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
    env: {
      ...process.env,
      ...(firefoxBin ? { FIREFOX_BIN: firefoxBin } : {}),
    },
  });

  void proc.exited.then((code) => {
    if (code !== 0) {
      console.error(`[dev:${name}] exited with code ${code}`);
    }
  });

  return proc;
});

const shutdown = (): void => {
  for (const proc of procs) {
    proc.kill();
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await Promise.all(procs.map((proc) => proc.exited));
