import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const browser = process.argv[2];
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const screenshotDir = path.resolve('e2e/ci-screenshots');
const token =
  process.env.ATTACHMENT_UPLOAD_PAT ??
  process.env.GITHUB_TOKEN ??
  process.env.GH_TOKEN;
const repositoryId = process.env.GITHUB_REPOSITORY_ID;

if (!summaryPath) {
  console.log('GITHUB_STEP_SUMMARY not set; skipping.');
  process.exit(0);
}

const prefix = browser ? `${browser}-` : '';
let files: string[];
try {
  files = readdirSync(screenshotDir)
    .filter((name) => name.endsWith('.png') && name.startsWith(prefix))
    .sort();
} catch {
  files = [];
}

function stepLabel(fileName: string): string {
  const match = fileName.match(/-(\d{2}-[\w-]+)\.png$/);
  return match?.[1] ?? fileName;
}

async function uploadScreenshot(filePath: string, fileName: string): Promise<string> {
  if (!token || !repositoryId) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY_ID are required');
  }

  const params = new URLSearchParams({
    name: fileName,
    content_type: 'image/png',
    repository_id: repositoryId,
  });
  const response = await fetch(
    `https://uploads.github.com/user-attachments/assets?${params}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'image/png',
      },
      body: readFileSync(filePath),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`upload HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = JSON.parse(text) as { url?: string; href?: string };
  const url = body.url ?? body.href;
  if (!url) {
    throw new Error(`upload response missing url: ${text.slice(0, 300)}`);
  }
  return url;
}

const lines = ['', `### E2E (${browser ?? 'all'})`, ''];

if (files.length === 0) {
  lines.push('_No screenshots captured._', '');
  appendFileSync(summaryPath, lines.join('\n'));
  process.exit(0);
}

let uploaded = 0;
const errors: string[] = [];

for (const name of files) {
  const label = stepLabel(name);
  try {
    const url = await uploadScreenshot(path.join(screenshotDir, name), name);
    lines.push(`#### ${label}`, `![${label}](${url})`, '');
    uploaded++;
    console.log(`Uploaded ${name} -> ${url}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Upload failed for ${name}: ${message}`);
    errors.push(`${name}: ${message}`);
    lines.push(`#### ${label}`, `_Upload failed: ${message}_`, '');
  }
}

if (uploaded === 0) {
  lines.push(
    '**Could not embed screenshots in this job summary.**',
    'GitHub may reject `uploads.github.com/user-attachments/assets` for `GITHUB_TOKEN` in Actions (HTTP 404).',
    '',
    `<details><summary>Upload errors (${errors.length})</summary>`,
    '',
    '```',
    ...errors,
    '```',
    '',
    '</details>',
    '',
  );
}

appendFileSync(summaryPath, lines.join('\n'));

if (uploaded === 0 && errors.length > 0) {
  console.error('All screenshot uploads failed; see job summary for details.');
  process.exit(1);
}
