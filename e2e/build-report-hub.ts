import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2] ?? 'e2e-report-bundle';

const browsers = [
  { id: 'chrome', label: 'Chrome', dir: 'chrome' },
  { id: 'firefox', label: 'Firefox', dir: 'firefox' },
];

async function findWebm(reportDir: string): Promise<string | null> {
  const dataDir = path.join(reportDir, 'data');
  try {
    const files = await readdir(dataDir);
    const webm = files.find((f) => f.endsWith('.webm'));
    return webm ? path.join(dataDir, webm) : null;
  } catch {
    return null;
  }
}

await mkdir(outDir, { recursive: true });

const sections: string[] = [];

for (const { label, dir } of browsers) {
  const reportRoot = path.join(outDir, dir);
  const webm = await findWebm(reportRoot);
  const reportHref = `${dir}/index.html`;
  const videoBlock = webm
    ? `<video controls preload="metadata" src="${path.relative(outDir, webm).split(path.sep).join('/')}"></video>`
    : '<p><em>No recording found for this browser.</em></p>';

  sections.push(`    <section>
      <h2>${label}</h2>
      <p><a href="${reportHref}">Open full Playwright report</a> (steps, traces, attachments)</p>
      ${videoBlock}
    </section>`);
}

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Anchor Selector E2E recordings</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        line-height: 1.5;
        max-width: 52rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      section {
        margin-bottom: 2.5rem;
      }
      video {
        width: 100%;
        max-width: 720px;
        margin-top: 0.75rem;
        background: #111;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <h1>E2E screen recordings</h1>
    <p>Play the videos below in your browser, or open the Playwright report for details.</p>
${sections.join('\n')}
  </body>
</html>
`;

await writeFile(path.join(outDir, 'index.html'), html, 'utf8');
