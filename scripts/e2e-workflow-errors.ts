import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BrowserReport } from '../e2e/runner/report';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function workflowEscape(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function workflowError(title: string, message: string): void {
  console.error(
    `::error title=${workflowEscape(title)}::${workflowEscape(message)}`,
  );
}

function main(): void {
  const browser = flag('--browser');
  if (browser !== 'chrome' && browser !== 'firefox') {
    throw new Error('Pass --browser chrome or --browser firefox');
  }
  const reportPath = join(
    resolve(flag('--results') ?? 'test-results'),
    browser,
    'report.json',
  );
  if (!existsSync(reportPath)) {
    return;
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as BrowserReport;
  for (const scenario of report.scenarios) {
    if (scenario.status !== 'failed' || scenario.error == null) {
      continue;
    }
    workflowError(`${report.browser} ${scenario.id}`, scenario.error);
  }
}

main();
