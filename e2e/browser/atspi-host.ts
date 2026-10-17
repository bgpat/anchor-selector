import { execFile, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tsc = resolve(repoRoot, 'node_modules/.bin/tsc');

let compiled: Promise<string> | null = null;

/** gjs/AT-SPI is not safe to run concurrently on one session. */
let atspiQueue: Promise<unknown> = Promise.resolve();

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

async function runAtspiOnce(
  args: string[],
  options?: { timeoutMs?: number },
): Promise<string> {
  const program = await atspiProgram();
  const proc = spawn('/usr/bin/gjs', ['-m', program, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  let timedOut = false;
  const timeoutMs = options?.timeoutMs;
  const timer =
    timeoutMs == null
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          proc.kill('SIGKILL');
        }, timeoutMs);
  const code = await new Promise<number>((resolveCode, reject) => {
    proc.once('error', reject);
    proc.once('close', (status) => resolveCode(status ?? 1));
  });
  if (timer != null) {
    clearTimeout(timer);
  }
  if (timedOut) {
    throw new Error(`atspi timed out after ${timeoutMs}ms`);
  }
  const out = Buffer.concat(stdout).toString('utf8').trim();
  const err = Buffer.concat(stderr).toString('utf8').trim();
  if (code !== 0) {
    throw new Error(err || out || `gjs exited ${code}`);
  }
  return out;
}

export function runAtspi(
  args: string[],
  options?: { timeoutMs?: number },
): Promise<string> {
  const run = () => runAtspiOnce(args, options);
  const result = atspiQueue.then(run, run);
  atspiQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
