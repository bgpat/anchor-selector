import {
  clickActionName,
  modifierKey,
  type ClickAction,
  type ModifierKey,
  type StoredConfig,
} from '@/util/config';
import variables from '@/util/variables';

export const defaultHue = variables.config.default.hue;

export const defaultClick: readonly ClickAction[] =
  variables.config.default.click;

/** Hue applied while a selection overlay is already open. */
export const hueWhileSelecting = 120;

/** Hue chosen from the options page and stored. */
export const hueFromOptions = 42;

/** Hue that the next selection session should paint. */
export const hueForNextSelection = 200;

export function clickPreset(
  action: ClickAction['action'],
  keys: readonly ModifierKey[],
): Pick<StoredConfig, 'click'> {
  return {
    click: [{ action, keys: [...keys] }],
  };
}

export const replaceAddressBarPreset = clickPreset(
  clickActionName.replaceAddressBar,
  [],
);

export const openNewTabCtrlPreset = clickPreset(clickActionName.openNewTab, [
  modifierKey.ctrl,
]);

export const openNewWindowPreset = clickPreset(
  clickActionName.openNewWindow,
  [],
);

export const copyUrlPreset = clickPreset(clickActionName.copyUrl, []);

export const copyHashPreset = clickPreset(clickActionName.copyHash, []);

/** Plain click replaces the address bar; shift copies the hash. */
export const modifierCopyHashPreset: Pick<StoredConfig, 'click'> = {
  click: [
    { action: clickActionName.replaceAddressBar, keys: [] },
    { action: clickActionName.copyHash, keys: [modifierKey.shift] },
  ],
};
