import {
  modifierKey,
  type ModifierKey,
  type StoredConfig,
} from '@/util/config';
import type { E2eAssertion, E2eScenario } from './types';
import {
  E2E_FIXTURE_PATH,
  headingHash,
  headingSelector,
  headingUrlPattern,
} from './fixture';
import {
  copyHashPreset,
  copyUrlPreset,
  openNewTabCtrlPreset,
  openNewWindowPreset,
  replaceAddressBarPreset,
} from './presets';

function actionScenario(input: {
  id: string;
  title: string;
  description: string;
  preset: Pick<StoredConfig, 'click'>;
  modifiers?: readonly ModifierKey[];
  expect: readonly E2eAssertion[];
}): E2eScenario {
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    tags: ['action'],
    recording: 'actions',
    steps: [
      { kind: 'extension.storage.sync.set', values: input.preset },
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      {
        kind: 'page.element.click',
        selector: headingSelector,
        ...(input.modifiers == null ? {} : { modifiers: input.modifiers }),
      },
    ],
    expect: [{ kind: 'overlay.visible', visible: false }, ...input.expect],
  };
}

export const clickActionScenarios = [
  actionScenario({
    id: 'action.replace-address-bar',
    title: 'A click replaces the address-bar hash',
    description:
      'The replace-address-bar binding updates only the hash in the same tab.',
    preset: replaceAddressBarPreset,
    expect: [
      { kind: 'page.url.hash', value: headingHash },
      { kind: 'tabs.delta', by: 0 },
      { kind: 'windows.delta', by: 0 },
    ],
  }),
  actionScenario({
    id: 'action.open-new-tab',
    title: 'A modified click opens a new tab',
    description:
      'With ctrl bound to open-new-tab, a ctrl-click adds one tab whose URL includes the chosen hash.',
    preset: openNewTabCtrlPreset,
    modifiers: [modifierKey.ctrl],
    expect: [
      { kind: 'page.url.hash', value: '' },
      { kind: 'tabs.delta', by: 1 },
      { kind: 'tabs.newest.url.matches', pattern: headingUrlPattern },
    ],
  }),
  actionScenario({
    id: 'action.copy-url',
    title: 'A click copies the full URL',
    description:
      'The copy-url binding puts the page URL, including the chosen hash, on the clipboard.',
    preset: copyUrlPreset,
    expect: [{ kind: 'clipboard.matches', pattern: headingUrlPattern }],
  }),
  actionScenario({
    id: 'action.copy-hash',
    title: 'A click copies only the hash',
    description: 'The copy-hash binding puts only the hash on the clipboard.',
    preset: copyHashPreset,
    expect: [{ kind: 'clipboard.equals', text: headingHash }],
  }),
  actionScenario({
    id: 'action.open-new-window',
    title: 'A click opens a new window',
    description:
      'The open-new-window binding adds one window whose URL includes the chosen hash.',
    preset: openNewWindowPreset,
    expect: [
      { kind: 'windows.delta', by: 1 },
      { kind: 'windows.newest.url.matches', pattern: headingUrlPattern },
    ],
  }),
] as const satisfies readonly E2eScenario[];
