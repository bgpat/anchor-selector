import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stepKindMethod } from '../automation/contract';
import { launchChrome } from '../browser/chrome';
import { extensionOutput, type BrowserName } from '../browser/common';
import { launchFirefox } from '../browser/firefox';
import { e2eScenarios } from '../scenarios/index';
import type { E2eAssertion, E2eScenario, E2eStep } from '../scenarios/types';
import type { E2eAutomation } from '../automation/interface';
import { explainAssertion, type AssertionBaseline } from './assertions';
import { ScreenRecorder, saveLastFrame, transcodeWebm } from './record';
import type { BrowserReport, ScenarioReport } from './report';
import './bun-globals';

const EVENTUAL_TIMEOUT_MS = 2500;
const SCENARIO_TIMEOUT_MS = Number(
  process.env.E2E_SCENARIO_TIMEOUT_MS ?? 180000,
);

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

async function dispatch(
  automation: E2eAutomation,
  step: E2eStep,
): Promise<void> {
  const method = stepKindMethod[step.kind];
  const input: Record<string, unknown> = { ...step };
  delete input.kind;
  delete input.expect;
  const fn = automation[method] as (value?: object) => Promise<void>;
  if (Object.keys(input).length === 0) {
    await fn.call(automation);
    return;
  }
  await fn.call(automation, input);
}

async function checkEventually(
  assertion: E2eAssertion,
  automation: E2eAutomation,
  baseline: AssertionBaseline,
): Promise<string | null> {
  if (assertion.kind === 'overlay.highlight.animating') {
    const first = await explainAssertion(assertion, automation, baseline);
    if (first == null) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
    return explainAssertion(assertion, automation, baseline);
  }
  const deadline = Date.now() + EVENTUAL_TIMEOUT_MS;
  let explanation = await explainAssertion(assertion, automation, baseline);
  while (explanation != null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    explanation = await explainAssertion(assertion, automation, baseline).catch(
      (error: unknown) => errorMessage(error),
    );
  }
  return explanation;
}

async function checkAll(
  assertions: readonly E2eAssertion[] | undefined,
  automation: E2eAutomation,
  baseline: AssertionBaseline,
  label: string,
): Promise<void> {
  for (const assertion of assertions ?? []) {
    const explanation = await checkEventually(assertion, automation, baseline);
    if (explanation != null) {
      throw new Error(`${label} ${assertion.kind}: ${explanation}`);
    }
  }
}

async function runScenario(
  automation: E2eAutomation,
  scenario: E2eScenario,
): Promise<void> {
  const baseline: AssertionBaseline = {
    tabs: await automation.countTabs(),
    windows: await automation.countWindows(),
    strokeBefore: null,
  };
  for (const [index, step] of scenario.steps.entries()) {
    const watchesStroke = step.expect?.some(
      (assertion) => assertion.kind === 'overlay.highlight.strokeChanged',
    );
    if (watchesStroke) {
      baseline.strokeBefore = await automation.overlayHighlightStroke();
    }
    await dispatch(automation, step);
    await checkAll(
      step.expect,
      automation,
      baseline,
      `step ${index + 1} (${step.kind})`,
    );
  }
  // Scenario-level expectations describe the state after the last step.
  // Earlier steps, such as opening the fixture, do not satisfy them yet.
  await checkAll(scenario.expect, automation, baseline, 'scenario');
}

function videoName(id: string): string {
  return `${id.replace(/[^a-z0-9._-]+/gi, '_')}.webm`;
}

async function main(): Promise<void> {
  const browserName = flag('--browser');
  if (browserName !== 'chrome' && browserName !== 'firefox') {
    throw new Error('Pass --browser firefox or --browser chrome');
  }
  const grep = flag('--grep');
  const tag = flag('--tag');
  const selected = e2eScenarios.filter((scenario) => {
    if (grep != null && !scenario.id.includes(grep)) {
      return false;
    }
    if (tag != null && !scenario.tags?.some((item) => item === tag)) {
      return false;
    }
    return true;
  });
  if (selected.length === 0) {
    throw new Error('No e2e scenarios matched the filter');
  }

  const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (relative.includes('..') || relative === '') {
        return new Response('not found', { status: 404 });
      }
      const file = Bun.file(join(fixturesDir, relative));
      if (!(await file.exists())) {
        return new Response('not found', { status: 404 });
      }
      return new Response(file);
    },
  });
  const fixtureOrigin = `http://127.0.0.1:${server.port}`;
  const resultsDir = resolve(process.cwd(), 'e2e-results', browserName);
  mkdirSync(resultsDir, { recursive: true });
  const report: BrowserReport = { browser: browserName, scenarios: [] };

  const writeReport = () => {
    writeFileSync(
      join(resultsDir, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  };

  try {
    for (const scenario of selected) {
      report.scenarios.push(
        await runOne(browserName, scenario, fixtureOrigin, resultsDir),
      );
      writeReport();
    }
  } finally {
    writeReport();
    server.stop(true);
  }

  const failed = report.scenarios.filter(
    (scenario) => scenario.status === 'failed',
  );
  for (const scenario of report.scenarios) {
    console.log(`${scenario.status}\t${scenario.id}`);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function runOne(
  browserName: BrowserName,
  scenario: E2eScenario,
  fixtureOrigin: string,
  resultsDir: string,
): Promise<ScenarioReport> {
  if (scenario.skipUntil != null) {
    console.log(`skipped\t${scenario.id}\t${scenario.skipUntil}`);
    return {
      id: scenario.id,
      title: scenario.title,
      status: 'skipped',
      durationMs: 0,
      video: null,
      error: null,
      failureImage: null,
    };
  }

  const started = Date.now();
  const video = videoName(scenario.id);
  const mkvPath = join(resultsDir, `${scenario.id}.mkv`);
  const webmPath = join(resultsDir, video);
  const pngPath = join(resultsDir, `${scenario.id}.png`);
  const recorder = new ScreenRecorder();
  let failure: string | null = null;
  let closeBrowser: (() => Promise<void>) | null = null;
  try {
    const session = await Promise.race([
      launch(browserName, fixtureOrigin),
      timeout(SCENARIO_TIMEOUT_MS, 'browser launch'),
    ]);
    closeBrowser = session.close;
    recorder.start(mkvPath, await session.automation.windowRect());
    await recorder.assertStarted();
    await Promise.race([
      runScenario(session.automation, scenario),
      timeout(SCENARIO_TIMEOUT_MS, scenario.id),
    ]);
  } catch (error) {
    failure = errorMessage(error);
    console.error(failure);
  } finally {
    await recorder.stop().catch(() => undefined);
    await closeBrowser?.().catch(() => undefined);
  }

  let failureImage: string | null = null;
  try {
    if (failure != null) {
      saveLastFrame(mkvPath, pngPath);
      failureImage = `${scenario.id}.png`;
    }
    transcodeWebm(mkvPath, webmPath);
  } catch (error) {
    failure ??= `recording failed: ${errorMessage(error)}`;
  } finally {
    rmSync(mkvPath, { force: true });
  }

  return {
    id: scenario.id,
    title: scenario.title,
    status: failure == null ? 'passed' : 'failed',
    durationMs: Date.now() - started,
    video: failure == null || failureImage != null ? video : null,
    error: failure,
    failureImage,
  };
}

function launch(browserName: BrowserName, fixtureOrigin: string) {
  const extensionDir = extensionOutput(browserName);
  if (browserName === 'firefox') {
    return launchFirefox({ extensionDir, fixtureOrigin });
  }
  return launchChrome({ extensionDir, fixtureOrigin });
}

function timeout(ms: number, label: string): Promise<never> {
  return new Promise((_resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    timer.unref();
  });
}

await main();
