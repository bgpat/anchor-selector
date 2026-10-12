import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserReport } from '../e2e/runner/report';

const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const REENCODE_CRF = [50, 58, 63];

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

function fitVideo(path: string): string | null {
  if (statSync(path).size <= MAX_VIDEO_BYTES) {
    return path;
  }
  const dir = mkdtempSync(join(tmpdir(), 'e2e-video-'));
  let current = path;
  for (const crf of REENCODE_CRF) {
    const next = join(dir, `crf-${crf}.webm`);
    const encoded = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        current,
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
        next,
      ],
      { encoding: 'utf8' },
    );
    if (encoded.status !== 0 || !statSync(next, { throwIfNoEntry: false })) {
      continue;
    }
    current = next;
    if (statSync(next).size <= MAX_VIDEO_BYTES) {
      return next;
    }
  }
  return null;
}

function markdown(
  report: BrowserReport,
  attachments: Map<string, string>,
): string {
  const counts = {
    passed: 0,
    failed: 0,
    skipped: 0,
  };
  for (const scenario of report.scenarios) {
    counts[scenario.status] += 1;
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
  ];
  for (const scenario of report.scenarios) {
    const seconds = (scenario.durationMs / 1000).toFixed(1);
    lines.push(
      `| ${scenario.status} | \`${scenario.id}\` ${scenario.title} | ${seconds}s |`,
    );
  }
  lines.push('');
  const shown = new Set<string>();
  for (const scenario of report.scenarios) {
    if (scenario.video == null || shown.has(scenario.video)) {
      continue;
    }
    shown.add(scenario.video);
    const covered = report.scenarios.filter(
      (item) => item.video === scenario.video,
    );
    const heading = scenario.video.replace(/\.webm$/, '');
    lines.push(`### \`${heading}\``, '');
    for (const item of covered) {
      lines.push(`- ${item.status} \`${item.id}\` ${item.title}`);
      if (item.error) {
        lines.push('', '```', item.error, '```', '');
      }
    }
    lines.push('');
    const attachment = attachments.get(scenario.video);
    if (attachment) {
      lines.push(`![${heading}](${attachment})`, '');
    } else {
      lines.push(
        `Video exceeded the 10MB attachment limit. See the \`e2e-${report.browser}\` Actions artifact.`,
        '',
      );
    }
  }
  for (const scenario of report.scenarios) {
    if (scenario.video != null || scenario.error == null) {
      continue;
    }
    lines.push(
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

function deleteOwnComments(
  repo: string,
  pr: number,
  marker: string,
  login: string,
) {
  const raw = gh([
    'api',
    '--paginate',
    '--slurp',
    `repos/${repo}/issues/${pr}/comments`,
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
        `repos/${repo}/issues/comments/${comment.id}`,
      ]);
    }
  }
}

function main() {
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.warn('PR_COMMENT_TOKEN is not set; skipping the e2e comment');
    return;
  }
  const pr = Number(flag('--pr'));
  const resultsDir = resolve(flag('--results') ?? 'e2e-results');
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error('Pass --pr <number>');
  }
  const repo = gh([
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ]).trim();
  const login = gh(['api', 'user', '--jq', '.login']).trim();
  const reports = reportsIn(resultsDir);
  if (reports.length === 0) {
    console.warn(`No e2e reports under ${resultsDir}`);
    return;
  }
  for (const { report, dir } of reports) {
    const marker = `<!-- e2e-recordings:${report.browser} -->`;
    const attachments = new Map<string, string>();
    for (const scenario of report.scenarios) {
      if (scenario.video == null) {
        continue;
      }
      const source = join(dir, scenario.video);
      const fitted = fitVideo(source);
      if (fitted) {
        attachments.set(scenario.video, fitted);
      }
    }
    const bodyPath = join(
      mkdtempSync(join(tmpdir(), 'e2e-comment-')),
      'body.md',
    );
    writeFileSync(bodyPath, markdown(report, attachments));
    deleteOwnComments(repo, pr, marker, login);
    const args = ['pr', 'comment', String(pr), '--body-file', bodyPath];
    for (const path of attachments.values()) {
      args.push('--attach', path);
    }
    gh(args);
    console.log(`commented ${report.browser} (${attachments.size} videos)`);
  }
}

main();
