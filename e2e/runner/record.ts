import { execFileSync, spawn, type ChildProcess } from 'node:child_process';

export function screenSize(): { width: number; height: number } {
  const fromEnv = process.env.E2E_SCREEN;
  const match = fromEnv?.match(/^(\d+)x(\d+)$/);
  if (match) {
    return { width: Number(match[1]), height: Number(match[2]) };
  }
  try {
    const output = execFileSync('xdpyinfo', { encoding: 'utf8' });
    const dimensions = output.match(/dimensions:\s+(\d+)x(\d+)/);
    if (dimensions) {
      return {
        width: Number(dimensions[1]),
        height: Number(dimensions[2]),
      };
    }
  } catch {
    // xdpyinfo is optional. CI starts Xvfb at 1280x800.
  }
  return { width: 1280, height: 800 };
}

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded - (rounded % 2);
}

/** Lossless 60fps capture of the whole X display, including browser chrome. */
export class ScreenRecorder {
  private process: ChildProcess | null = null;
  private stderr = '';

  start(
    mkvPath: string,
    crop?: { x: number; y: number; width: number; height: number },
  ): void {
    const display = process.env.DISPLAY;
    if (display == null || display === '') {
      throw new Error('DISPLAY is not set; run the e2e runner under xvfb-run');
    }
    const screen = screenSize();
    const width = even(crop?.width ?? screen.width);
    const height = even(crop?.height ?? screen.height);
    const x = Math.max(0, Math.round(crop?.x ?? 0));
    const y = Math.max(0, Math.round(crop?.y ?? 0));
    const proc = spawn(
      'ffmpeg',
      [
        '-y',
        '-f',
        'x11grab',
        '-video_size',
        `${width}x${height}`,
        '-framerate',
        '60',
        '-i',
        `${display}+${x},${y}`,
        '-c:v',
        'libx264rgb',
        '-preset',
        'ultrafast',
        '-crf',
        '0',
        mkvPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    proc.stderr?.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString('utf8')).slice(-4000);
    });
    this.process = proc;
  }

  async assertStarted(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (this.process?.exitCode != null) {
      throw new Error(`ffmpeg exited early\n${this.stderr}`);
    }
  }

  async stop(): Promise<void> {
    const proc = this.process;
    if (proc == null || proc.exitCode != null) {
      this.process = null;
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill('SIGINT');
      }, 1500);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      proc.stdin?.write('q');
      proc.stdin?.end();
    });
    this.process = null;
  }
}

export function transcodeWebm(
  mkvPath: string,
  webmPath: string,
  crf = 40,
): void {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      mkvPath,
      '-c:v',
      'libvpx-vp9',
      '-r',
      '60',
      '-b:v',
      '0',
      '-crf',
      String(crf),
      '-row-mt',
      '1',
      '-an',
      webmPath,
    ],
    { stdio: 'inherit' },
  );
}

export function saveLastFrame(mkvPath: string, pngPath: string): void {
  execFileSync(
    'ffmpeg',
    ['-y', '-sseof', '-0.05', '-i', mkvPath, '-frames:v', '1', pngPath],
    { stdio: 'ignore' },
  );
}
