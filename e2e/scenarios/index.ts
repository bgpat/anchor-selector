import { clickActionScenarios, openNewWindowScenario } from './click-actions';
import { optionsScenarios } from './options';
import { selectionCoreScenarios } from './selection.core';
import { selectionEdgeScenarios } from './selection.edges';
import type { E2eScenario } from './types';

export const e2eScenarios = [
  ...selectionCoreScenarios,
  ...selectionEdgeScenarios,
  ...clickActionScenarios,
  ...optionsScenarios,
  openNewWindowScenario,
] as const satisfies readonly E2eScenario[];

const ids = e2eScenarios.map((scenario) => scenario.id);
if (new Set(ids).size !== ids.length) {
  throw new Error('Duplicate e2e scenario id');
}

export const e2eScenarioById = Object.fromEntries(
  e2eScenarios.map((scenario) => [scenario.id, scenario]),
) as {
  [Scenario in (typeof e2eScenarios)[number] as Scenario['id']]: Scenario;
};

export type E2eScenarioId = keyof typeof e2eScenarioById;
