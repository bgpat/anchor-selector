export const runtimeMessageType = {
  getState: 'get-state',
  setSelection: 'set-selection',
  contentScriptReady: 'content-script-ready',
  selectionEnded: 'selection-ended',
  getConfig: 'get-config',
  setConfig: 'set-config',
  newTab: 'new-tab',
  newWindow: 'new-window',
  toggleSelectionTab: 'toggle-selection-tab',
} as const;

export type RuntimeMessageType =
  (typeof runtimeMessageType)[keyof typeof runtimeMessageType];
