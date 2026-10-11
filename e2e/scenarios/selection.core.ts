import type { E2eScenario } from './types';
import {
  E2E_FIXTURE_PATH,
  headingHash,
  headingLabel,
  headingSelector,
  pointerOutside,
  scrollDeltaY,
  secondarySelector,
} from './fixture';
import { hueWhileSelecting } from './presets';

export const selectionCoreScenarios = [
  {
    id: 'selection.toolbar-opens-overlay',
    title: '拡張機能アイコンの左クリックで選択モードになる',
    description:
      'フィクスチャ上でツールバーアイコンを左クリックすると overlay が表示され、選択中バッジが付く。',
    tags: ['smoke', 'selection'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
    ],
    expect: [
      { kind: 'overlay.visible', visible: true },
      { kind: 'extension.badge.nonEmpty' },
    ],
  },
  {
    id: 'selection.toolbar-toggles-off',
    title: '選択中にもう一度アイコンを左クリックすると選択モードが終わる',
    description: '選択モード中の左クリックは overlay を閉じ、バッジを消す。',
    tags: ['smoke', 'selection'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'extension.icon.click', button: 'left' },
    ],
    expect: [
      { kind: 'overlay.visible', visible: false },
      { kind: 'extension.badge.text', text: '' },
    ],
  },
  {
    id: 'selection.click-heading-updates-hash',
    title: '見出しをクリックすると hash が更新されて選択が終わる',
    description:
      '選択モードで #heading をクリックするとアドレスバーの hash がその id になり、overlay が閉じる。',
    tags: ['smoke', 'selection'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: headingSelector },
    ],
    expect: [
      { kind: 'page.url.hash', value: headingHash },
      { kind: 'overlay.visible', visible: false },
    ],
  },
  {
    id: 'selection.escape-cancels',
    title: 'Escape で選択を中断する',
    description:
      '選択モード中に Escape を押すと overlay が閉じ、hash は変わらない。',
    tags: ['selection'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.keyboard.press', key: 'Escape' },
    ],
    expect: [
      { kind: 'overlay.visible', visible: false },
      { kind: 'page.url.hash', value: '' },
    ],
  },
  {
    id: 'selection.overlay-follows-pointer',
    title: 'マウス移動に合わせて overlay のハイライトが対象要素へ動く',
    description:
      'ポインタを別の id 要素へ移すと、ハイライト矩形がその要素の表示位置に合う。',
    tags: ['selection', 'overlay'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      {
        kind: 'page.pointer.move',
        selector: headingSelector,
        expect: [
          {
            kind: 'overlay.highlight.alignsWithElement',
            selector: headingSelector,
          },
        ],
      },
      {
        kind: 'page.pointer.move',
        selector: secondarySelector,
        expect: [
          {
            kind: 'overlay.highlight.alignsWithElement',
            selector: secondarySelector,
          },
        ],
      },
    ],
  },
  {
    id: 'selection.overlay-follows-scroll',
    title: 'スクロールに合わせて overlay のハイライトが動く',
    description:
      'ポインタを固定したままスクロールしても、ハイライトは同じ要素の新しい表示位置に合う。',
    tags: ['selection', 'overlay'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.pointer.move', selector: headingSelector },
      {
        kind: 'page.scroll.by',
        y: scrollDeltaY,
        expect: [
          {
            kind: 'overlay.highlight.alignsWithElement',
            selector: headingSelector,
          },
        ],
      },
    ],
  },
  {
    id: 'selection.overlay-animates-highlight',
    title: '対象が変わると overlay のハイライトがアニメーションする',
    description:
      'ポインタを別の id 要素へ移した直後、ハイライトの形状アニメーションが進行している。',
    tags: ['selection', 'overlay'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.pointer.move', selector: headingSelector },
      {
        kind: 'page.pointer.move',
        selector: secondarySelector,
        expect: [{ kind: 'overlay.highlight.animating' }],
      },
    ],
  },
  {
    id: 'selection.hue-updates-while-selecting',
    title: '選択中に hue を変えるとハイライトの色が変わる',
    description:
      '選択 overlay を開いたあと storage の hue を更新すると、表示中のハイライトの stroke が変わる。',
    tags: ['selection', 'overlay'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.pointer.move', selector: headingSelector },
      {
        kind: 'extension.storage.sync.set',
        values: { hue: hueWhileSelecting },
        expect: [{ kind: 'overlay.highlight.strokeChanged' }],
      },
    ],
  },
  {
    id: 'selection.badge-clears-after-select',
    title: '選択を完了するとバッジが消える',
    description:
      '要素を選んで選択モードが終わると、ツールバーの選択中バッジが空になる。',
    tags: ['selection'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: headingSelector },
    ],
    expect: [{ kind: 'extension.badge.text', text: '' }],
  },
  {
    id: 'selection.overlay-shows-target-label',
    title: 'ホバー中の要素 id が overlay のラベルに出る',
    description:
      '選択モードで #heading 上にポインタを置くと、ラベルは #heading になる。',
    tags: ['selection', 'overlay'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.hover', selector: headingSelector },
    ],
    expect: [{ kind: 'overlay.label.text', text: headingLabel }],
  },
  {
    id: 'selection.pointer-leave-clears-highlight',
    title: 'ポインタがページ外に出るとハイライトが消える',
    description:
      '選択モードのままポインタが viewport 外へ出るとハイライトは消え、選択モード自体は続く。',
    tags: ['selection', 'overlay'],
    steps: [
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      {
        kind: 'page.pointer.move',
        selector: headingSelector,
        expect: [{ kind: 'overlay.highlight.visible', visible: true }],
      },
      {
        kind: 'page.pointer.move',
        x: pointerOutside.x,
        y: pointerOutside.y,
        expect: [{ kind: 'overlay.highlight.visible', visible: false }],
      },
    ],
    expect: [{ kind: 'overlay.visible', visible: true }],
  },
] as const satisfies readonly E2eScenario[];
