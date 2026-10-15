import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserReport } from '../e2e/runner/report';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function gh(args: string[]): string {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `gh ${args[0]} failed`);
  }
  return result.stdout;
}

function markdown(report: BrowserReport, videoPath: string | null): string {
  const counts = {
    passed: 0,
    failed: 0,
    skipped: 0,
  };
  const rows: string[] = [];
  const errors: string[] = [];
  for (const scenario of report.scenarios) {
    counts[scenario.status] += 1;
    const seconds = (scenario.durationMs / 1000).toFixed(1);
    rows.push(
      `| ${scenario.status} | \`${scenario.id}\` ${scenario.title} | ${seconds}s |`,
    );
    if (scenario.error != null) {
      errors.push(
        `### \`${scenario.id}\``,
        '',
        scenario.title,
        '',
        '```',
        scenario.error,
        '```',
        '',
      );
    }
  }
  const lines = [
    `<!-- e2e-recordings:${report.browser} -->`,
    '',
    `## E2E ${report.browser}`,
    '',
    `${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
    '',
    '| Result | Scenario | Time |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ];
  if (videoPath != null) {
    lines.push(`![${report.browser}](${videoPath})`, '');
  }
  lines.push(...errors);
  return `${lines.join('\n')}\n`;
}

function reportsIn(
  resultsDir: string,
): { report: BrowserReport; dir: string }[] {
  const found: { report: BrowserReport; dir: string }[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (entry.name !== 'report.json') {
        continue;
      }
      found.push({
        report: JSON.parse(readFileSync(path, 'utf8')) as BrowserReport,
        dir,
      });
    }
  };
  visit(resultsDir);
  return found;
}

function deleteOwnComments(pr: number, marker: string, login: string) {
  const raw = gh([
    'api',
    '--paginate',
    '--slurp',
    `repos/${process.env.GITHUB_REPOSITORY}/issues/${pr}/comments`,
  ]);
  const pages = JSON.parse(raw) as {
    id: number;
    body: string;
    user: { login: string } | null;
  }[][];
  for (const page of pages) {
    for (const comment of page) {
      if (comment.user?.login !== login || !comment.body.includes(marker)) {
        continue;
      }
      gh([
        'api',
        '-X',
        'DELETE',
        `repos/${process.env.GITHUB_REPOSITORY}/issues/comments/${comment.id}`,
      ]);
    }
  }
}

function main() {
  const pr = Number(flag('--pr'));
  const resultsDir = resolve(flag('--results') ?? 'test-results');
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error('Pass --pr <number>');
  }
  const login = gh(['api', 'user', '--jq', '.login']).trim();
  const reports = reportsIn(resultsDir);
  for (const { report, dir } of reports) {
    const marker = `<!-- e2e-recordings:${report.browser} -->`;
    const videoName = report.scenarios.find(
      (scenario) => scenario.video != null,
    )?.video;
    const videoPath = videoName == null ? null : join(dir, videoName);
    const bodyPath = join(
      mkdtempSync(join(tmpdir(), 'e2e-comment-')),
      'body.md',
    );
    writeFileSync(bodyPath, markdown(report, videoPath));
    deleteOwnComments(pr, marker, login);
    const args = ['pr', 'comment', String(pr), '--body-file', bodyPath];
    if (videoPath != null) {
      args.push('--attach', videoPath);
    }
    gh(args);
    console.log(`commented ${report.browser}`);
  }
}

main();
