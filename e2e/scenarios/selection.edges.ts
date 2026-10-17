import { modifierKey } from '@/util/config';
import type { E2eScenario } from './types';
import {
  E2E_FIXTURE_PATH,
  E2E_FIXTURE_PATH_2,
  fixturePath2Pattern,
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

const selectionOff = [
  { kind: 'overlay.visible', visible: false },
  { kind: 'extension.badge.text', text: '' },
] as const;

const selectionTargetScenarios = [
  {
    id: 'selection.click-non-anchor',
    title: 'Clicking a non-anchor leaves the hash unchanged',
    description:
      'Clicking an element with no id or name ends selection and leaves the hash empty.',
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
    id: 'selection.click-heading-updates-hash',
    title: 'Clicking the heading updates the hash and ends selection',
    description:
      'Clicking #heading while selecting sets the address-bar hash to that id and clears the overlay and the selecting badge.',
    tags: ['smoke', 'selection'],
    steps: [
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: headingSelector },
    ],
    expect: [
      { kind: 'page.url.hash', value: headingHash },
      { kind: 'overlay.visible', visible: false },
      { kind: 'extension.badge.text', text: '' },
    ],
  },
  {
    id: 'selection.reopen-after-complete',
    title: 'Left-clicking the icon after a completed selection starts again',
    description:
      'After choosing an element ends selection, a left-click on the icon opens the overlay again.',
    tags: ['selection', 'edge'],
    steps: [{ kind: 'extension.icon.click', button: 'left' }],
    expect: [
      { kind: 'overlay.visible', visible: true },
      { kind: 'extension.badge.nonEmpty' },
      { kind: 'page.url.hash', value: headingHash },
    ],
  },
  {
    id: 'selection.named-anchor',
    title: 'Clicking a named anchor sets the hash to that name',
    description: 'Choosing a[name="legacy"] sets the hash to #legacy.',
    tags: ['selection', 'edge'],
    steps: [{ kind: 'page.element.click', selector: legacyAnchorSelector }],
    expect: [
      { kind: 'page.url.hash', value: legacyHash },
      { kind: 'overlay.visible', visible: false },
    ],
  },
  {
    id: 'selection.nested-ids-picks-top',
    title: 'Overlapping id elements select the topmost id',
    description: 'Clicking the nested inner #inner sets the hash to #inner.',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: innerSelector },
    ],
    expect: [{ kind: 'page.url.hash', value: innerHash }],
  },
  {
    id: 'selection.invisible-id-near-pointer',
    title: 'A nearby zero-size id element can be selected',
    description:
      'Clicking near the zero-size #invisible-anchor sets the hash to that id.',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.element.click', selector: nearInvisibleSelector },
    ],
    expect: [{ kind: 'page.url.hash', value: invisibleHash }],
  },
] as const satisfies readonly E2eScenario[];

const modifierActionScenarios = [
  {
    id: 'selection.modifier-resolves-action',
    title: 'The modifier key runs its click action',
    description:
      'When shift is bound to copying the hash, a shift-click copies the hash and leaves the address bar unchanged.',
    tags: ['selection', 'edge', 'action'],
    steps: [
      {
        kind: 'extension.storage.sync.set',
        values: modifierCopyHashPreset,
      },
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

/** Runs right after core scenarios while the fixture tab is still active. */
export const selectionHistorySessionScenarios = [
  {
    id: 'selection.history-back-forward-clears',
    title: 'Navigating and history back or forward clear selection',
    description:
      'Opening another document while selecting clears the overlay and badge, and neither back nor forward leaves the overlay up.',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'extension.icon.click', button: 'left' },
      {
        kind: 'page.goto',
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
          {
            kind: 'page.url.matches',
            pattern: '/anchor-page\\.html(?:#.*)?$',
          },
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
] as const satisfies readonly E2eScenario[];

export const selectionSessionScenarios = [
  {
    id: 'extension.re-enable-no-duplicate',
    title: 'Disabling clears selection and re-enabling does not duplicate the overlay',
    description:
      'Disabling the extension during selection removes the overlay and badge. Enabling it and selecting again leaves a single overlay root.',
    tags: ['selection', 'edge', 'extension'],
    steps: [
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
    title: 'Reloading while selecting clears selection',
    description: 'Reloading the page during selection removes the overlay.',
    tags: ['selection', 'edge'],
    steps: [
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.reload' },
    ],
    expect: [...selectionOff],
  },
] as const satisfies readonly E2eScenario[];

export const selectionUninjectableScenario = {
  id: 'selection.uninjectable-page',
  title: 'Selection does not start on a page that cannot be injected',
  description:
    'A left-click on the icon on a page where the content script cannot run shows neither the overlay nor the badge.',
  tags: ['selection', 'edge'],
  steps: [
    { kind: 'page.goto', uninjectable: true },
    { kind: 'extension.icon.click', button: 'left' },
  ],
  expect: [
    { kind: 'overlay.visible', visible: false },
    { kind: 'extension.badge.text', text: '' },
  ],
} as const satisfies E2eScenario;

const [nonAnchorScenario, ...selectionHashScenarios] = selectionTargetScenarios;

/** Clicks that stay on the fixture. Actions run before the session leaves it. */
export const selectionBeforeActionScenarios = [
  nonAnchorScenario,
  ...modifierActionScenarios,
  ...selectionHashScenarios,
];
