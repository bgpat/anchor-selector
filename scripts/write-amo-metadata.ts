import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = resolve(root, 'README.md');
const outPath = resolve(root, '.output/amo-metadata.json');

const approvalNotes = await readFile(readmePath, 'utf8');
const metadata = {
  version: {
    approval_notes: approvalNotes,
  },
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(metadata)}\n`, 'utf8');
