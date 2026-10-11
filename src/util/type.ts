export const runtimeMessageType = {
  ping: 'ping',
  click: 'click',
  close: 'close',
  getConfig: 'get-config',
  setConfig: 'set-config',
  resetConfig: 'reset-config',
  newTab: 'new-tab',
  newWindow: 'new-window',
} as const;

export type RuntimeMessageType =
  (typeof runtimeMessageType)[keyof typeof runtimeMessageType];
