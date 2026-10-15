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
import { assertRecording, ScreenRecorder } from './record';
import type { BrowserReport, ScenarioReport } from './report';
import './bun-globals';

const EVENTUAL_TIMEOUT_MS = 2500;
const ACTION_PAUSE_MS = 1000;
const SCENARIO_TIMEOUT_MS = 180000;

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
  const showScenario = () =>
    automation.noteScenario({ id: scenario.id, title: scenario.title });
  await showScenario();
  for (const [index, step] of scenario.steps.entries()) {
    if (index > 0) {
      await pause(ACTION_PAUSE_MS);
    }
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
  // Hold the screen the last step left behind. Later checks may switch back
  // to the fixture tab, which would hide a newly opened tab or window.
  await pause(ACTION_PAUSE_MS);
  // Scenario-level expectations describe the state after the last step.
  // Earlier steps, such as opening the fixture, do not satisfy them yet.
  await checkAll(scenario.expect, automation, baseline, 'scenario');
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function videoName(id: string): string {
  return `${id.replace(/[^a-z0-9._-]+/gi, '_')}.mp4`;
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
    for (const group of recordingsOf(selected)) {
      report.scenarios.push(
        ...(await runRecording(browserName, group, fixtureOrigin, resultsDir)),
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

function recordingsOf(scenarios: readonly E2eScenario[]): E2eScenario[][] {
  const order: string[] = [];
  const groups = new Map<string, E2eScenario[]>();
  for (const scenario of scenarios) {
    const id = scenario.recording ?? scenario.id;
    const group = groups.get(id);
    if (group == null) {
      groups.set(id, [scenario]);
      order.push(id);
      continue;
    }
    group.push(scenario);
  }
  return order.map((id) => groups.get(id) ?? []);
}

function skippedReport(scenario: E2eScenario): ScenarioReport {
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

async function runRecording(
  browserName: BrowserName,
  scenarios: readonly E2eScenario[],
  fixtureOrigin: string,
  resultsDir: string,
): Promise<ScenarioReport[]> {
  const recording = scenarios[0]?.recording ?? scenarios[0]?.id ?? 'e2e';
  const video = videoName(recording);
  const videoPath = join(resultsDir, video);
  const runnable = scenarios.some((scenario) => scenario.skipUntil == null);
  if (!runnable) {
    return scenarios.map((scenario) => skippedReport(scenario));
  }

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
    recorder.start(videoPath, await session.automation.windowRect());
    await recorder.assertStarted();
  } catch (error) {
    recordingError = errorMessage(error);
    console.error(recordingError);
  }

  for (const scenario of scenarios) {
    if (scenario.skipUntil != null) {
      reports.push(skippedReport(scenario));
      continue;
    }
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
      await pause(ACTION_PAUSE_MS);
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

  await recorder.stop().catch(() => undefined);
  await closeBrowser?.().catch(() => undefined);
  if (automation != null) {
    try {
      assertRecording(videoPath);
    } catch (error) {
      const message = `recording failed: ${errorMessage(error)}`;
      rmSync(videoPath, { force: true });
      for (const report of reports) {
        if (report.status === 'skipped') {
          continue;
        }
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
