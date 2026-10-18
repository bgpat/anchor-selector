import { clickActionName, modifierKey } from '@/util/config';
import type { E2eScenario } from './types';
import { E2E_FIXTURE_PATH, headingSelector } from './fixture';
import { hueFromOptions, hueWhileSelecting } from './presets';

/** Matches `formatBinding` in `src/entrypoints/options/App.tsx`. */
const shiftCopyHashBindingLabel = '[shift ⇧]: Copy only hash';

export const optionsScenarios = [
  {
    id: 'options.opens-from-extension',
    title: 'Opening options from the extension shows the settings headings',
    description:
      'The options page opens and shows the title plus the Click and Color sections.',
    tags: ['options'],
    steps: [{ kind: 'extension.options.open' }],
    expect: [
      { kind: 'options.page.open' },
      { kind: 'page.heading.visible', name: 'Anchor Selector', level: 1 },
      { kind: 'page.heading.visible', name: 'Click', level: 2 },
      { kind: 'page.heading.visible', name: 'Color', level: 2 },
    ],
  },
  {
    id: 'options.click-binding-persists',
    title: 'Changing a click binding in options is saved',
    description:
      'Setting the shift action to copy the hash stores that binding in the list and in click storage.',
    tags: ['options'],
    steps: [
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
    id: 'options.hue-updates-while-selecting',
    title: 'Changing hue while selecting recolors the highlight',
    description:
      'Updating the stored hue while the overlay is open changes the visible highlight stroke.',
    tags: ['options', 'selection', 'overlay'],
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
    id: 'options.hue-persists',
    title: 'Changing the options color is saved and the next selection uses it',
    description:
      'Moving the Color slider stores that hue, and the next selection paints the highlight with it.',
    tags: ['options', 'selection'],
    steps: [
      {
        kind: 'options.hue.set',
        value: hueFromOptions,
        expect: [
          { kind: 'options.hue.value', value: hueFromOptions },
          {
            kind: 'extension.storage.sync.equals',
            key: 'hue',
            value: hueFromOptions,
          },
        ],
      },
      { kind: 'page.goto', path: E2E_FIXTURE_PATH },
      { kind: 'extension.icon.click', button: 'left' },
      { kind: 'page.pointer.move', selector: headingSelector },
    ],
    expect: [{ kind: 'overlay.highlight.hue', hue: hueFromOptions }],
  },
] as const satisfies readonly E2eScenario[];
