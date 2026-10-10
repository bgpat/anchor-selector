const production = process.env.NODE_ENV === 'production';
const watch = process.argv.includes('--watch');

const entries = [
  { entry: './src/background.ts', name: 'background' },
  { entry: './src/content_script.ts', name: 'content_script' },
  { entry: './src/options/main.tsx', name: 'options' },
] as const;

async function buildOnce(): Promise<boolean> {
  let ok = true;
  for (const { entry, name } of entries) {
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: './dist',
      naming: `${name}.[ext]`,
      target: 'browser',
      minify: production,
      sourcemap: production ? 'none' : 'inline',
    });
    if (!result.success) {
      ok = false;
      for (const log of result.logs) {
        console.error(log);
      }
    }
  }
  return ok;
}

if (watch) {
  let building = false;
  let pending = false;

  const run = async () => {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    do {
      pending = false;
      const ok = await buildOnce();
      if (!ok) {
        process.exitCode = 1;
      }
    } while (pending);
    building = false;
  };

  await run();

  const { watch } = await import('node:fs');
  watch('./src', { recursive: true }, () => {
    void run();
  });

  console.log('Watching for changes…');
} else {
  const ok = await buildOnce();
  if (!ok) {
    process.exit(1);
  }
}
