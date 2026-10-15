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

const marker = '<!-- e2e-recordings -->';

const commentsQuery = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      comments(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id body isMinimized author { login } }
      }
    }
  }
}`;

const minimizeQuery = `mutation($id: ID!) {
  minimizeComment(input: {subjectId: $id, classifier: OUTDATED}) {
    minimizedComment { isMinimized }
  }
}`;

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

function section(report: BrowserReport, videoPath: string | null): string {
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

type CommentNode = {
  id: string;
  body: string;
  isMinimized: boolean;
  author: { login: string } | null;
};

function hideOwnComments(pr: number, login: string) {
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const [owner, name] = repository.split('/');
  let cursor: string | null = null;
  const comments: CommentNode[] = [];
  for (;;) {
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${commentsQuery}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
      '-F',
      `number=${pr}`,
    ];
    if (cursor != null) {
      args.push('-f', `cursor=${cursor}`);
    }
    const raw = gh(args);
    const page = JSON.parse(raw) as {
      data: {
        repository: {
          pullRequest: {
            comments: {
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
              nodes: CommentNode[];
            };
          };
        };
      };
    };
    const connection = page.data.repository.pullRequest.comments;
    comments.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) {
      break;
    }
    cursor = connection.pageInfo.endCursor;
  }
  for (const comment of comments) {
    if (
      comment.isMinimized ||
      comment.author?.login !== login ||
      !comment.body.includes('<!-- e2e-recordings')
    ) {
      continue;
    }
    gh([
      'api',
      'graphql',
      '-f',
      `query=${minimizeQuery}`,
      '-f',
      `id=${comment.id}`,
    ]);
  }
}

function main() {
  const pr = Number(flag('--pr'));
  const resultsDir = resolve(flag('--results') ?? 'test-results');
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error('Pass --pr <number>');
  }
  const reports = reportsIn(resultsDir).sort((left, right) =>
    left.report.browser.localeCompare(right.report.browser),
  );
  if (reports.length === 0) {
    return;
  }
  const login = gh(['api', 'user', '--jq', '.login']).trim();
  const sections: string[] = [];
  const videos: string[] = [];
  for (const { report, dir } of reports) {
    const videoName = report.scenarios.find(
      (scenario) => scenario.video != null,
    )?.video;
    const videoPath = videoName == null ? null : join(dir, videoName);
    if (videoPath != null) {
      videos.push(videoPath);
    }
    sections.push(section(report, videoPath));
  }
  const bodyPath = join(mkdtempSync(join(tmpdir(), 'e2e-comment-')), 'body.md');
  writeFileSync(bodyPath, `${marker}\n\n${sections.join('\n')}`);
  hideOwnComments(pr, login);
  const args = ['pr', 'comment', String(pr), '--body-file', bodyPath];
  for (const video of videos) {
    args.push('--attach', video);
  }
  gh(args);
  console.log(
    `commented ${reports.map((item) => item.report.browser).join(', ')}`,
  );
}

main();
