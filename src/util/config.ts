export const clickActionName = {
  replaceAddressBar: 'replace-address-bar',
  openNewTab: 'open-new-tab',
  openNewWindow: 'open-new-window',
  copyUrl: 'copy-url',
  copyHash: 'copy-hash',
  /** Legacy value still handled in overlay */
  openCurrent: 'open-current',
  /** Legacy value still handled in overlay */
  openNew: 'open-new',
} as const;

export type ClickActionName =
  (typeof clickActionName)[keyof typeof clickActionName];

export const defaultClickAction = clickActionName.replaceAddressBar;

export const modifierKey = {
  shift: 'shift',
  ctrl: 'ctrl',
  alt: 'alt',
  meta: 'meta',
} as const;

export type ModifierKey = (typeof modifierKey)[keyof typeof modifierKey];

/** Order used when reading pressed modifier keys from a mouse event. */
export const MODIFIER_KEY_PRESS_ORDER: readonly ModifierKey[] = [
  modifierKey.alt,
  modifierKey.ctrl,
  modifierKey.meta,
  modifierKey.shift,
];

export type ClickAction = {
  action: ClickActionName;
  keys: ModifierKey[];
};

export const configKey = {
  hue: 'hue',
  click: 'click',
} as const;

export type ConfigKey = (typeof configKey)[keyof typeof configKey];

export const CONFIG_KEYS: readonly ConfigKey[] = [
  configKey.hue,
  configKey.click,
];

export type StoredConfig = {
  [configKey.hue]: number;
  [configKey.click]: ClickAction[];
};

export const CLICK_ACTIONS: { value: ClickActionName; label: string }[] = [
  { value: clickActionName.replaceAddressBar, label: 'Replace address bar' },
  { value: clickActionName.openNewTab, label: 'Open in new tab' },
  { value: clickActionName.openNewWindow, label: 'Open in new window' },
  { value: clickActionName.copyUrl, label: 'Copy full URL' },
  { value: clickActionName.copyHash, label: 'Copy only hash' },
];

export const MODIFIER_KEYS: { value: ModifierKey; label: string }[] = [
  { value: modifierKey.shift, label: 'shift ⇧' },
  { value: modifierKey.ctrl, label: 'ctrl ⌃' },
  { value: modifierKey.alt, label: 'alt ⌥' },
  { value: modifierKey.meta, label: 'meta ⌘' },
];

export function keySignature(keys: readonly string[]): string {
  return [...keys].sort().join('\0');
}

export function cloneStoredConfig(config: StoredConfig): StoredConfig {
  return {
    [configKey.hue]: config[configKey.hue],
    [configKey.click]: config[configKey.click].map((entry) => ({
      action: entry.action,
      keys: [...entry.keys],
    })),
  };
}
