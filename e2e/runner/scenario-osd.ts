import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const osdScript = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'scenario-osd.gjs',
);

export class ScenarioOsd {
  private child: ChildProcess | null = null;

  start(bounds: { x: number; y: number; width: number }): void {
    if (this.child != null) {
      return;
    }
    this.child = spawn('gjs', ['-m', osdScript], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    this.child.stderr?.on('data', (chunk: Buffer) => {
      console.error(chunk.toString('utf8').trim());
    });
    this.send({ bounds });
  }

  show(input: { id: string; title: string }): void {
    this.send({ id: input.id, title: input.title });
  }

  hide(): void {
    this.send({ hide: true });
  }

  stop(): void {
    this.hide();
    this.child?.stdin?.end();
    this.child?.kill('SIGTERM');
    this.child = null;
  }

  private send(payload: object): void {
    if (this.child?.stdin?.writable !== true) {
      return;
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

let active: ScenarioOsd | null = null;

export function startScenarioOsd(bounds: {
  x: number;
  y: number;
  width: number;
}): void {
  active?.stop();
  active = new ScenarioOsd();
  active.start(bounds);
}

export function showScenarioOsd(input: { id: string; title: string }): void {
  active?.show(input);
}

export function stopScenarioOsd(): void {
  active?.stop();
  active = null;
}
