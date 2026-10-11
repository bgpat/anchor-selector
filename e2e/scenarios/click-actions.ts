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
    title: 'クリックでアドレスバーの hash を置き換える',
    description:
      'replace-address-bar の binding では、同じタブの hash だけが更新される。',
    preset: replaceAddressBarPreset,
    expect: [
      { kind: 'page.url.hash', value: headingHash },
      { kind: 'tabs.delta', by: 0 },
      { kind: 'windows.delta', by: 0 },
    ],
  }),
  actionScenario({
    id: 'action.open-new-tab',
    title: '修飾キー付きクリックで新しいタブに開く',
    description:
      'ctrl に open-new-tab を割り当てた状態で ctrl 付きクリックすると、タブが 1 つ増え、新しいタブの URL は選んだ hash を含む。',
    preset: openNewTabCtrlPreset,
    modifiers: [modifierKey.ctrl],
    expect: [
      { kind: 'page.url.hash', value: '' },
      { kind: 'tabs.delta', by: 1 },
      { kind: 'tabs.newest.url.matches', pattern: headingUrlPattern },
    ],
  }),
  actionScenario({
    id: 'action.open-new-window',
    title: 'クリックで新しいウィンドウに開く',
    description:
      'open-new-window の binding ではウィンドウが 1 つ増え、その URL は選んだ hash を含む。',
    preset: openNewWindowPreset,
    expect: [
      { kind: 'windows.delta', by: 1 },
      { kind: 'windows.newest.url.matches', pattern: headingUrlPattern },
    ],
  }),
  actionScenario({
    id: 'action.copy-url',
    title: 'クリックで完全な URL をコピーする',
    description:
      'copy-url の binding では、選んだ hash を含むページ URL がクリップボードに入る。',
    preset: copyUrlPreset,
    expect: [{ kind: 'clipboard.matches', pattern: headingUrlPattern }],
  }),
  actionScenario({
    id: 'action.copy-hash',
    title: 'クリックで hash だけをコピーする',
    description:
      'copy-hash の binding では、クリップボードの内容は hash だけになる。',
    preset: copyHashPreset,
    expect: [{ kind: 'clipboard.equals', text: headingHash }],
  }),
] as const satisfies readonly E2eScenario[];
