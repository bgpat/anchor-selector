import * as readline from 'node:readline';
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

const devEnv = {
  ...process.env,
  // Vite also listens for `o` + enter on stdin.isTTY; without this, WXT and Vite
  // both reopen the browser and Firefox can show the crash / safe-mode dialog.
  CI: process.env.CI ?? 'true',
  // stdout is piped for prefixes; keep ANSI colors (CI and non-TTY would disable them).
  ...(process.env.NO_COLOR
    ? {}
    : { FORCE_COLOR: process.env.FORCE_COLOR ?? '1' }),
  ...(firefoxBin ? { FIREFOX_BIN: firefoxBin } : {}),
};

const prefixWidth = Math.max(
  ...targets.map(({ name }) => `[${name}] `.length),
);
/** Pad after `]` so log text starts at the same column for every browser. */
const prefixFor = (name: string): string => `[${name}] `.padEnd(prefixWidth);

/** PTY so each WXT/Vite process sees stdin.isTTY and accepts CLI shortcuts. */
const spawnDev = (script: string): Subprocess => {
  const run = `bun run ${script}`;
  const useScript = process.platform !== 'win32';
  const argv = useScript
    ? process.platform === 'linux'
      ? ['script', '-q', '-c', run, '/dev/null']
      : ['script', '-q', '/dev/null', 'sh', '-c', run]
    : ['bun', 'run', script];

  return Bun.spawn(argv, {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe',
    env: devEnv,
  });
};

type Subprocess = ReturnType<typeof Bun.spawn>;

/** `script(1)` echoes forwarded stdin to stdout once per child; drop those lines. */
let suppressEchoLine: string | null = null;
let suppressEchoRemaining = 0;

const shouldSuppressStdoutLine = (line: string): boolean => {
  if (suppressEchoRemaining <= 0 || suppressEchoLine === null) return false;
  if (line !== suppressEchoLine) return false;
  suppressEchoRemaining -= 1;
  return true;
};

/** Normalize line endings; keep spinner text after the last `\r` (do not pass `\r` to the terminal). */
const normalizeRelayLine = (rawLine: string): string => {
  let line = rawLine.replace(/\r\n/g, '\n');
  if (line.includes('\r')) {
    line = line.slice(line.lastIndexOf('\r') + 1);
  }
  if (!line.endsWith('\n')) {
    line += '\n';
  }
  return line;
};

const relayStream = async (
  stream: ReadableStream<Uint8Array> | null,
  prefix: string,
  write: (chunk: string) => void,
  suppressEcho: boolean,
): Promise<void> => {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const emit = (rawLine: string): void => {
    const line = normalizeRelayLine(rawLine);
    const trimmed = line.replace(/\r?\n$/, '').replace(/\r$/, '');
    if (trimmed === '') return;
    if (suppressEcho && shouldSuppressStdoutLine(trimmed)) return;
    write(`${prefix}${line}`);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineAt: number;
    while ((newlineAt = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineAt + 1);
      buffer = buffer.slice(newlineAt + 1);
      emit(line);
    }
  }

  if (buffer.length > 0) {
    emit(buffer);
  }
};

let shuttingDown = false;

const procs = targets.map(({ name, script }) => {
  const proc = spawnDev(script);
  const prefix = prefixFor(name);
  void relayStream(proc.stdout, prefix, (chunk) => {
    process.stdout.write(chunk);
  }, true);
  void relayStream(proc.stderr, prefix, (chunk) => {
    process.stderr.write(chunk);
  }, false);

  void proc.exited.then((code) => {
    if (code !== 0) {
      process.stderr.write(`${prefix}exited with code ${code}\n`);
    }
  });

  return proc;
});

let rl: readline.Interface | undefined;

const shutdown = (): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  rl?.close();
  for (const proc of procs) {
    proc.stdin?.end();
    proc.kill();
  }
  process.exit(0);
};

if (process.stdin.isTTY) {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  // Raw TTY: first ^C often becomes readline 'SIGINT', not process SIGINT.
  rl.on('SIGINT', shutdown);
  rl.on('line', (line) => {
    suppressEchoLine = line;
    suppressEchoRemaining = procs.length;
    const payload = `${line}\n`;
    for (const proc of procs) {
      proc.stdin?.write(payload);
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await Promise.all(procs.map((proc) => proc.exited));
