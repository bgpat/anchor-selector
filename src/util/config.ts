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

export type ModifierKey = 'shift' | 'ctrl' | 'alt' | 'meta';

export type ClickAction = {
  action: ClickActionName;
  keys: ModifierKey[];
};

export type StoredConfig = {
  hue: number;
  click: ClickAction[];
};

export type ConfigKey = keyof StoredConfig;

export const CLICK_ACTIONS: { value: ClickActionName; label: string }[] = [
  { value: clickActionName.replaceAddressBar, label: 'Replace address bar' },
  { value: clickActionName.openNewTab, label: 'Open in new tab' },
  { value: clickActionName.openNewWindow, label: 'Open in new window' },
  { value: clickActionName.copyUrl, label: 'Copy full URL' },
  { value: clickActionName.copyHash, label: 'Copy only hash' },
];

export const MODIFIER_KEYS: { value: ModifierKey; label: string }[] = [
  { value: 'shift', label: 'shift ⇧' },
  { value: 'ctrl', label: 'ctrl ⌃' },
  { value: 'alt', label: 'alt ⌥' },
  { value: 'meta', label: 'meta ⌘' },
];

export function keySignature(keys: readonly string[]): string {
  return [...keys].sort().join('\0');
}

export function cloneStoredConfig(config: StoredConfig): StoredConfig {
  return {
    hue: config.hue,
    click: config.click.map((entry) => ({
      action: entry.action,
      keys: [...entry.keys],
    })),
  };
}
