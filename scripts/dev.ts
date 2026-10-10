const build = Bun.spawn(['bun', 'scripts/build.ts', '--watch'], {
  stdout: 'inherit',
  stderr: 'inherit',
});

const webExt = Bun.spawn(['bunx', 'web-ext', 'run', '-s', '.'], {
  stdout: 'inherit',
  stderr: 'inherit',
});

const shutdown = () => {
  build.kill();
  webExt.kill();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await Promise.race([build.exited, webExt.exited]);
shutdown();
