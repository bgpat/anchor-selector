export const runtimeMessageType = {
  ping: 'ping',
  click: 'click',
  close: 'close',
  getConfig: 'get-config',
  setConfig: 'set-config',
  resetConfig: 'reset-config',
  newTab: 'new-tab',
  newWindow: 'new-window',
  /** E2E fixture: open the options page in a normal tab */
  openOptionsE2e: 'open-options-e2e',
} as const;

export type RuntimeMessageType =
  (typeof runtimeMessageType)[keyof typeof runtimeMessageType];
