import { execSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function whichOnPath(command: string): string | undefined {
  try {
    const found = execSync(`command -v ${command}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return found || undefined;
  } catch {
    return undefined;
  }
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve Firefox for web-ext / WXT dev (override with FIREFOX_BIN). */
export function resolveFirefoxBinary(): string | undefined {
  if (process.env.FIREFOX_BIN) {
    return process.env.FIREFOX_BIN;
  }

  const candidates = [
    'firefox',
    'firefox-esr',
    join(homedir(), 'Applications/Firefox.app/Contents/MacOS/firefox'),
    '/Applications/Firefox.app/Contents/MacOS/firefox',
    '/usr/bin/firefox',
    '/usr/bin/firefox-esr',
    '/snap/bin/firefox',
  ];

  for (const candidate of candidates) {
    if (candidate.includes('/')) {
      if (isExecutable(candidate)) {
        return candidate;
      }
      continue;
    }
    const onPath = whichOnPath(candidate);
    if (onPath) {
      return onPath;
    }
  }

  return undefined;
}
