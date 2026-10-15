import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tsc = resolve(repoRoot, 'node_modules/.bin/tsc');

function gjsBin(): string {
  if (process.env.E2E_GJS) {
    return process.env.E2E_GJS;
  }
  if (existsSync('/usr/bin/gjs')) {
    return '/usr/bin/gjs';
  }
  return 'gjs';
}

let compiled: Promise<string> | null = null;

function atspiProgram(): Promise<string> {
  compiled ??= (async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'anchor-selector-atspi-'));
    await execFileAsync('bun', [
      tsc,
      '-p',
      resolve(repoRoot, 'tsconfig.gjs.json'),
      '--noEmit',
      'false',
      '--outDir',
      dir,
      '--rootDir',
      repoRoot,
    ]);
    return resolve(dir, 'e2e/browser/atspi.js');
  })().catch((error: unknown) => {
    compiled = null;
    throw error;
  });
  return compiled;
}

export async function runAtspi(args: string[]): Promise<string> {
  const program = await atspiProgram();
  const proc = spawn(gjsBin(), ['-m', program, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const code = await new Promise<number>((resolveCode, reject) => {
    proc.once('error', reject);
    proc.once('close', (status) => resolveCode(status ?? 1));
  });
  const out = Buffer.concat(stdout).toString('utf8').trim();
  const err = Buffer.concat(stderr).toString('utf8').trim();
  if (code !== 0) {
    throw new Error(err || out || `gjs exited ${code}`);
  }
  return out;
}
