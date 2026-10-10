export type ClickActionName =
  | 'replace-address-bar'
  | 'open-new-tab'
  | 'open-new-window'
  | 'copy-url'
  | 'copy-hash'
  | 'open-current'
  | 'open-new';

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
  { value: 'replace-address-bar', label: 'Replace address bar' },
  { value: 'open-new-tab', label: 'Open in new tab' },
  { value: 'open-new-window', label: 'Open in new window' },
  { value: 'copy-url', label: 'Copy full URL' },
  { value: 'copy-hash', label: 'Copy only hash' },
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
