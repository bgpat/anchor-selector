import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stepKindMethod } from '../automation/contract';
import { launchChrome } from '../browser/chrome';
import {
  extensionOutput,
  pauseAfterOperation,
  type BrowserName,
} from '../browser/common';
import { launchFirefox } from '../browser/firefox';
import { e2eScenarios } from '../scenarios/index';
import type { E2eAssertion, E2eScenario, E2eStep } from '../scenarios/types';
import type { E2eAutomation } from '../automation/interface';
import { explainAssertion, type AssertionBaseline } from './assertions';
import { assertRecording, ScreenRecorder } from './record';
import type { BrowserReport, ScenarioReport } from './report';
import {
  showScenarioOsd,
  startScenarioOsd,
  stopScenarioOsd,
} from './scenario-osd';
import './bun-globals';
import { logE2eOp, timeE2eOp } from '../op-log';

const EVENTUAL_TIMEOUT_MS = 2500;
const SCENARIO_TIMEOUT_MS = 300000;

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

function stepSummary(step: E2eStep): string {
  const copy = { ...step } as Record<string, unknown>;
  delete copy.kind;
  delete copy.expect;
  const keys = Object.keys(copy);
  if (keys.length === 0) {
    return step.kind;
  }
  const brief = keys
    .slice(0, 3)
    .map((key) => `${key}=${JSON.stringify(copy[key])}`)
    .join(' ');
  return `${step.kind} ${brief}`;
}

async function dispatch(
  automation: E2eAutomation,
  step: E2eStep,
): Promise<void> {
  await timeE2eOp(`step.${step.kind}`, async () => {
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
  }, { detail: stepSummary(step) });
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
  const started = Date.now();
  const deadline = started + EVENTUAL_TIMEOUT_MS;
  let explanation = await explainAssertion(assertion, automation, baseline);
  let polls = 1;
  while (explanation != null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    polls += 1;
    explanation = await explainAssertion(assertion, automation, baseline).catch(
      (error: unknown) => errorMessage(error),
    );
  }
  const durationMs = Date.now() - started;
  if (durationMs >= 150 || polls > 1) {
    logE2eOp(explanation == null ? 'assert.ok' : 'assert.timeout', {
      kind: assertion.kind,
      durationMs,
      polls,
      limitMs: EVENTUAL_TIMEOUT_MS,
      ...(explanation == null ? {} : { detail: explanation }),
    });
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
  await timeE2eOp('scenario', async () => {
  const baseline: AssertionBaseline = {
    tabs: await automation.countTabs(),
    windows: await automation.countWindows(),
    strokeBefore: null,
  };
  const showScenario = () => {
    showScenarioOsd({ id: scenario.id, title: scenario.title });
    return automation.noteScenario({ id: scenario.id, title: scenario.title });
  };
  await showScenario();
  for (const [index, step] of scenario.steps.entries()) {
    const watchesStroke = step.expect?.some(
      (assertion) => assertion.kind === 'overlay.highlight.strokeChanged',
    );
    if (watchesStroke) {
      baseline.strokeBefore = await automation.overlayHighlightStroke();
    }
    await dispatch(automation, step);
    await showScenario();
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
  }, { id: scenario.id });
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
  const resultsDir = resolve(process.cwd(), 'test-results', browserName);
  mkdirSync(resultsDir, { recursive: true });
  const report: BrowserReport = { browser: browserName, scenarios: [] };

  const writeReport = () => {
    writeFileSync(
      join(resultsDir, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  };

  try {
    report.scenarios.push(
      ...(await runRecording(browserName, selected, fixtureOrigin, resultsDir)),
    );
  } finally {
    writeReport();
    server.stop(true);
  }

  const failed = report.scenarios.filter(
    (scenario) => scenario.status === 'failed',
  );
  for (const scenario of report.scenarios) {
    console.log(
      `${scenario.status}\t${scenario.id}\t${scenario.durationMs}ms`,
    );
    logE2eOp('scenario.summary', {
      id: scenario.id,
      status: scenario.status,
      durationMs: scenario.durationMs,
    });
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function runRecording(
  browserName: BrowserName,
  scenarios: readonly E2eScenario[],
  fixtureOrigin: string,
  resultsDir: string,
): Promise<ScenarioReport[]> {
  const video = `${browserName}.mp4`;
  const videoPath = join(resultsDir, video);

  const reports: ScenarioReport[] = [];
  let closeBrowser: (() => Promise<void>) | null = null;
  let automation: E2eAutomation | null = null;
  const recorder = new ScreenRecorder();
  let recordingError: string | null = null;
  try {
    const session = await Promise.race([
      launch(browserName, fixtureOrigin),
      timeout(SCENARIO_TIMEOUT_MS, 'browser launch'),
    ]);
    closeBrowser = session.close;
    automation = session.automation;
    const windowRect = await session.automation.windowRect();
    recorder.start(videoPath, windowRect);
    startScenarioOsd(windowRect);
    await recorder.assertStarted();
  } catch (error) {
    recordingError = errorMessage(error);
    console.error(recordingError);
  }

  for (const scenario of scenarios) {
    if (automation == null) {
      reports.push({
        id: scenario.id,
        title: scenario.title,
        status: 'failed',
        durationMs: 0,
        video: null,
        error: recordingError,
        failureImage: null,
      });
      continue;
    }
    const started = Date.now();
    let failure: string | null = null;
    let failureImage: string | null = null;
    try {
      await Promise.race([
        runScenario(automation, scenario),
        timeout(SCENARIO_TIMEOUT_MS, scenario.id),
      ]);
    } catch (error) {
      failure = errorMessage(error);
      console.error(failure);
      await pauseAfterOperation();
      const pngPath = join(resultsDir, `${scenario.id}.png`);
      try {
        await automation.capturePng(pngPath);
        failureImage = `${scenario.id}.png`;
      } catch {
        failureImage = null;
      }
    }
    reports.push({
      id: scenario.id,
      title: scenario.title,
      status: failure == null ? 'passed' : 'failed',
      durationMs: Date.now() - started,
      video,
      error: failure,
      failureImage,
    });
  }

  stopScenarioOsd();
  await recorder.stop().catch(() => undefined);
  await closeBrowser?.().catch(() => undefined);
  if (automation != null) {
    try {
      assertRecording(videoPath);
    } catch (error) {
      const message = `recording failed: ${errorMessage(error)}`;
      rmSync(videoPath, { force: true });
      for (const report of reports) {
        report.status = 'failed';
        report.error ??= message;
        report.video = null;
      }
    }
  }

  return reports;
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
