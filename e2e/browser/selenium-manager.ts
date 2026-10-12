import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { arch, platform } from 'node:process';

type SeleniumManagerResult = {
  result: {
    browser_path: string;
    driver_path: string;
    message?: string;
  };
};

function seleniumManagerBin(): string {
  const directory =
    platform === 'darwin'
      ? 'macos'
      : platform === 'win32'
        ? 'windows'
        : arch === 'arm64'
          ? 'linux-arm64'
          : 'linux-x86_64';
  const file =
    platform === 'win32' ? 'selenium-manager.exe' : 'selenium-manager';
  return resolve(
    process.cwd(),
    'node_modules/selenium-webdriver/bin',
    directory,
    file,
  );
}

/**
 * Download a real browser build. The Firefox package on Ubuntu is a wrapper
 * script, which geckodriver rejects, so PATH discovery is skipped.
 */
export function resolveBrowser(browser: 'firefox' | 'chrome'): {
  browserPath: string;
  driverPath: string;
} {
  const result = spawnSync(
    seleniumManagerBin(),
    [
      '--browser',
      browser,
      '--skip-browser-in-path',
      '--skip-driver-in-path',
      '--force-browser-download',
      '--language-binding',
      'javascript',
      '--output',
      'json',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr ||
        result.stdout ||
        `selenium-manager failed for ${browser}`,
    );
  }
  const parsed = JSON.parse(result.stdout) as SeleniumManagerResult;
  if (!parsed.result?.browser_path || !parsed.result.driver_path) {
    throw new Error(
      parsed.result?.message ??
        `selenium-manager returned no ${browser} binary`,
    );
  }
  return {
    browserPath: parsed.result.browser_path,
    driverPath: parsed.result.driver_path,
  };
}
