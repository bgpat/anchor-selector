export type ScenarioStatus = 'passed' | 'failed' | 'skipped';

export type ScenarioReport = {
  id: string;
  title: string;
  status: ScenarioStatus;
  durationMs: number;
  /** File name next to report.json, or null when the scenario was skipped. */
  video: string | null;
  error: string | null;
  failureImage: string | null;
};

export type BrowserReport = {
  browser: 'chrome' | 'firefox';
  scenarios: ScenarioReport[];
};
