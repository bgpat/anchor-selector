import { clickActionName, modifierKey } from '@/util/config';
import type { E2eScenario } from './types';
import { E2E_FIXTURE_PATH, headingSelector } from './fixture';
import {
  defaultClick,
  defaultHue,
  hueForNextSelection,
  hueFromOptions,
} from './presets';

/** Matches `formatBinding` in `src/entrypoints/options/App.tsx`. */
const shiftCopyHashBindingLabel = '[shift ⇧]: Copy only hash';

export const optionsScenarios = [
  {
    id: 'options.opens-from-extension',
    title: '拡張機能の UI からオプションページを開く',
    description: '拡張機能の UI 操作でオプションページが開く。',
    tags: ['options'],
    steps: [{ kind: 'extension.options.open' }],
    expect: [{ kind: 'options.page.open' }],
  },
  {
    id: 'options.renders-sections',
    title: 'オプションページに設定の見出しが出る',
    description: 'オプションページにタイトルと Click / Color の節が見える。',
    tags: ['options'],
    steps: [{ kind: 'extension.options.open' }],
    expect: [
      { kind: 'page.heading.visible', name: 'Anchor Selector', level: 1 },
      { kind: 'page.heading.visible', name: 'Click', level: 2 },
      { kind: 'page.heading.visible', name: 'Color', level: 2 },
    ],
  },
  {
    id: 'options.hue-persists',
    title: 'オプションの色を変えると保存される',
    description:
      'Color のスライダーを動かすと、画面上の値と storage の hue が一致する。',
    tags: ['options'],
    steps: [
      { kind: 'extension.options.open' },
      { kind: 'options.hue.set', value: hueFromOptions },
    ],
    expect: [
      { kind: 'options.hue.value', value: hueFromOptions },
      {
        kind: 'extension.storage.sync.equals',
        key: 'hue',
        value: hueFromOptions,
      },
    ],
  },
  {
    id: 'options.click-binding-persists',
    title: 'オプションのクリック設定を変えると保存される',
    description:
      'shift の action を hash のコピーにすると、一覧の文言と storage の click にその binding が入る。',
    tags: ['options'],
    steps: [
      { kind: 'extension.options.open' },
      {
        kind: 'options.clickBinding.set',
        keys: [modifierKey.shift],
        action: clickActionName.copyHash,
      },
    ],
    expect: [
      {
        kind: 'options.bindingList.contains',
        text: shiftCopyHashBindingLabel,
      },
      {
        kind: 'extension.storage.sync.clickIncludes',
        action: clickActionName.copyHash,
        keys: [modifierKey.shift],
      },
    ],
  },
  {
    id: 'options.reset-restores-defaults',
    title: '初期設定に戻すと hue とクリック設定が既定値になる',
    description:
      'hue を変えたあと初期設定へ戻すと、画面と storage が既定の hue と click に戻る。',
    tags: ['options'],
    skipUntil: 'options-reset-ui',
    steps: [
      { kind: 'extension.options.open' },
      { kind: 'options.hue.set', value: hueFromOptions },
      { kind: 'options.resetDefaults' },
    ],
    expect: [
      { kind: 'options.hue.value', value: defaultHue },
      {
        kind: 'extension.storage.sync.equals',
        key: 'hue',
        value: defaultHue,
      },
      {
        kind: 'extension.storage.sync.equals',
        key: 'click',
        value: defaultClick,
      },
    ],
  },
  {
    id: 'options.hue-applies-on-next-selection',
    title: 'オプションで変えた色は次の選択に反映される',
    description:
      'オプションで hue を保存してから選択モードに入ると、新しいハイライトがその hue になる。',
    tags: ['options', 'selection'],
    steps: [
      { kind: 'extension.options.open' },
      { kind: 'options.hue.set', value: hueForNextSelection },
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.pointer.move', selector: headingSelector },
    ],
    expect: [{ kind: 'overlay.highlight.hue', hue: hueForNextSelection }],
  },
] as const satisfies readonly E2eScenario[];
