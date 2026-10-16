import type { E2eScenario } from './types';
import {
  E2E_FIXTURE_PATH,
  headingLabel,
  headingSelector,
  pointerOutside,
  scrollDeltaY,
  secondarySelector,
} from './fixture';
export const selectionCoreScenarios = [
  {
    id: 'selection.toolbar-opens-overlay',
    title: 'Left-click the toolbar icon to start selecting',
    description:
      'On the fixture page, a left-click on the toolbar icon shows the overlay and a selecting badge.',
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
    id: 'selection.overlay-follows-pointer',
    title: 'Highlight follows the pointer and animates on arrival',
    description:
      'Moving the pointer to another id element aligns the highlight with that element, and the shape animation is in progress just after the move.',
    tags: ['selection', 'overlay'],
    steps: [
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
          { kind: 'overlay.highlight.animating' },
          {
            kind: 'overlay.highlight.alignsWithElement',
            selector: secondarySelector,
          },
        ],
      },
    ],
  },
  {
    id: 'selection.overlay-shows-target-label',
    title: 'Hovered element id appears in the overlay label',
    description:
      'In selection mode, placing the pointer on #heading sets the label to #heading.',
    tags: ['selection', 'overlay'],
    steps: [{ kind: 'page.element.hover', selector: headingSelector }],
    expect: [{ kind: 'overlay.label.text', text: headingLabel }],
  },
  {
    id: 'selection.overlay-follows-scroll',
    title: 'Highlight follows scrolling',
    description:
      'With the pointer held still, scrolling moves the highlight to the new position of that element.',
    tags: ['selection', 'overlay'],
    steps: [
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
    id: 'selection.pointer-leave-clears-highlight',
    title: 'Moving the pointer off the page clears the highlight',
    description:
      'Leaving the viewport while still selecting hides the highlight, and selection mode stays on.',
    tags: ['selection', 'overlay'],
    steps: [
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
  {
    id: 'selection.escape-cancels',
    title: 'Escape cancels selection',
    description:
      'Pressing Escape during selection closes the overlay and leaves the hash unchanged.',
    tags: ['selection'],
    steps: [{ kind: 'page.keyboard.press', key: 'Escape' }],
    expect: [
      { kind: 'overlay.visible', visible: false },
      { kind: 'page.url.hash', value: '' },
    ],
  },
  {
    id: 'selection.toolbar-toggles-off',
    title: 'Left-clicking the icon again ends selection',
    description:
      'A left-click during selection closes the overlay and clears the badge.',
    tags: ['smoke', 'selection'],
    steps: [
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'extension.icon.click', button: 'left' },
    ],
    expect: [
      { kind: 'overlay.visible', visible: false },
      { kind: 'extension.badge.text', text: '' },
    ],
  },
] as const satisfies readonly E2eScenario[];
