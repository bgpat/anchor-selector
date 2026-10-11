import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const browser = process.argv[2];
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const screenshotDir = path.resolve('e2e/ci-screenshots');

if (!summaryPath) {
  console.log('GITHUB_STEP_SUMMARY not set; skipping.');
  process.exit(0);
}

const prefix = browser ? `${browser}-` : '';
const files = readdirSync(screenshotDir)
  .filter((name) => name.endsWith('.png') && name.startsWith(prefix))
  .sort();

if (files.length === 0) {
  appendFileSync(
    summaryPath,
    `\n### E2E (${browser ?? 'unknown'})\n\n_No screenshots captured._\n`,
  );
  process.exit(0);
}

const lines = [
  '',
  `### E2E (${browser ?? 'all'})`,
  '',
  ...files.flatMap((name) => {
    const base64 = readFileSync(path.join(screenshotDir, name)).toString(
      'base64',
    );
    return [
      `<details><summary>${name}</summary>`,
      `<img alt="${name}" src="data:image/png;base64,${base64}" width="720" />`,
      '</details>',
      '',
    ];
  }),
];

appendFileSync(summaryPath, lines.join('\n'));
