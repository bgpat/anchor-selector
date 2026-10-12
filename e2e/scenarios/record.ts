import type { E2eScenario } from './types';

/** Share one recording across scenarios that exercise the same kind of action. */
export function withRecording<const T extends readonly E2eScenario[]>(
  recording: string,
  scenarios: T,
): { [I in keyof T]: T[I] & { readonly recording: string } } {
  return scenarios.map((scenario) => ({
    ...scenario,
    recording,
  })) as { [I in keyof T]: T[I] & { readonly recording: string } };
}
