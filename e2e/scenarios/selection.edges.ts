import { modifierKey } from '@/util/config';
import type { E2eScenario } from './types';
import {
  E2E_FIXTURE_PATH,
  E2E_FIXTURE_PATH_2,
  fixturePath2Pattern,
  fixturePathPattern,
  headingHash,
  headingSelector,
  innerHash,
  innerSelector,
  invisibleHash,
  legacyAnchorSelector,
  legacyHash,
  nearInvisibleSelector,
  plainSelector,
} from './fixture';
import { modifierCopyHashPreset } from './presets';
import { withRecording } from './record';

const selectionOff = [
  { kind: 'overlay.visible', visible: false },
  { kind: 'extension.badge.text', text: '' },
] as const;

const selectionTargetScenarios = [
  {
    id: 'selection.click-non-anchor',
    title: 'アンカーでない要素をクリックしても hash は変わらない',
    description:
      'id も name もない要素をクリックすると hash は空のまま選択モードが終わる。',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: plainSelector },
    ],
    expect: [
      { kind: 'page.url.hash', value: '' },
      { kind: 'overlay.visible', visible: false },
    ],
  },
  {
    id: 'selection.named-anchor',
    title: 'name 属性のアンカーをクリックするとその名前が hash になる',
    description: 'a[name="legacy"] を選ぶと hash は #legacy になる。',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: legacyAnchorSelector },
    ],
    expect: [
      { kind: 'page.url.hash', value: legacyHash },
      { kind: 'overlay.visible', visible: false },
    ],
  },
  {
    id: 'selection.nested-ids-picks-top',
    title: '重なった id 要素では手前の id が選ばれる',
    description: '入れ子の内側 #inner をクリックすると hash は #inner になる。',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: innerSelector },
    ],
    expect: [{ kind: 'page.url.hash', value: innerHash }],
  },
  {
    id: 'selection.invisible-id-near-pointer',
    title: '近くにある 0 サイズの id 要素を選べる',
    description:
      '表示サイズが 0 の #invisible-anchor の近くをクリックすると、その id が hash になる。',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: nearInvisibleSelector },
    ],
    expect: [{ kind: 'page.url.hash', value: invisibleHash }],
  },
  {
    id: 'selection.reopen-after-complete',
    title: '選択完了後にもう一度アイコンを左クリックすると選択を再開できる',
    description:
      '一度要素を選んでモードが終わったあと、アイコンの左クリックで overlay が再び開く。',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: headingSelector },
      { kind: 'extension.icon.click', button: 'left' },
    ],
    expect: [
      { kind: 'overlay.visible', visible: true },
      { kind: 'extension.badge.nonEmpty' },
      { kind: 'page.url.hash', value: headingHash },
    ],
  },
] as const satisfies readonly E2eScenario[];

const modifierActionScenarios = [
  {
    id: 'selection.modifier-resolves-action',
    title: '修飾キーに対応する click action が実行される',
    description:
      'shift の binding が hash のコピーのとき、shift 付きクリックは hash をコピーし、アドレスバーは変えない。',
    tags: ['selection', 'edge', 'action'],
    steps: [
      {
        kind: 'extension.storage.sync.set',
        values: modifierCopyHashPreset,
      },
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      {
        kind: 'page.element.click',
        selector: headingSelector,
        modifiers: [modifierKey.shift],
      },
    ],
    expect: [
      { kind: 'clipboard.equals', text: headingHash },
      { kind: 'page.url.hash', value: '' },
      { kind: 'overlay.visible', visible: false },
      { kind: 'tabs.delta', by: 0 },
    ],
  },
] as const satisfies readonly E2eScenario[];

const selectionSessionScenarios = [
  {
    id: 'selection.history-back-forward-clears',
    title: '別ページへの遷移と戻る/進むで選択が解除される',
    description:
      '選択中に別ドキュメントを開くと overlay とバッジが消え、履歴の戻ると進むのどちらでも overlay は残らない。',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      {
        kind: 'page.navigate',
        path: E2E_FIXTURE_PATH_2,
        expect: [
          ...selectionOff,
          { kind: 'page.url.matches', pattern: fixturePath2Pattern },
        ],
      },
      {
        kind: 'page.history.back',
        expect: [
          { kind: 'overlay.visible', visible: false },
          { kind: 'page.url.matches', pattern: fixturePathPattern },
        ],
      },
      {
        kind: 'page.history.forward',
        expect: [
          { kind: 'overlay.visible', visible: false },
          { kind: 'page.url.matches', pattern: fixturePath2Pattern },
        ],
      },
    ],
  },
  {
    id: 'extension.re-enable-no-duplicate',
    title: '無効化で選択が消え、再有効化しても overlay は重複しない',
    description:
      '選択モード中に無効化すると overlay とバッジが消える。再有効化してもう一度選択モードにすると overlay のルートは 1 つだけになる。',
    tags: ['selection', 'edge', 'extension'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      {
        kind: 'extension.setEnabled',
        enabled: false,
        expect: [
          { kind: 'extension.enabled', enabled: false },
          { kind: 'overlay.root.count', count: 0 },
          { kind: 'extension.badge.text', text: '' },
        ],
      },
      { kind: 'extension.setEnabled', enabled: true },
      { kind: 'extension.icon.click', button: 'left' },
    ],
    expect: [
      { kind: 'extension.enabled', enabled: true },
      { kind: 'overlay.root.count', count: 1 },
      { kind: 'overlay.visible', visible: true },
    ],
  },
  {
    id: 'selection.reload-clears',
    title: '選択中に再読み込みすると選択が解除される',
    description: '選択モードのままページを再読み込みすると overlay が消える。',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.reload' },
    ],
    expect: [...selectionOff],
  },
  {
    id: 'selection.uninjectable-page',
    title: 'スクリプトを注入できないページでは選択が始まらない',
    description:
      'コンテンツスクリプトを注入できないページでアイコンを左クリックしても overlay もバッジも出ない。',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'page.gotoUninjectable' },
      { kind: 'extension.icon.click', button: 'left' },
    ],
    expect: [
      { kind: 'overlay.visible', visible: false },
      { kind: 'extension.badge.text', text: '' },
    ],
  },
] as const satisfies readonly E2eScenario[];

export const selectionEdgeScenarios = [
  ...withRecording('selection', selectionTargetScenarios),
  ...withRecording('actions', modifierActionScenarios),
  ...withRecording('session', selectionSessionScenarios),
];
