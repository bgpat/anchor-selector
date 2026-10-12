import type { E2eAutomation } from './interface';
import type { E2eAssertion, E2eStep } from '../scenarios/types';

/** Step `kind` → `E2eAutomation` method the runner calls. */
export const stepKindMethod = {
  'extension.icon.click': 'clickExtensionIcon',
  'extension.setEnabled': 'setExtensionEnabled',
  'extension.options.open': 'openExtensionOptions',
  'extension.storage.sync.set': 'setSyncStorage',
  'page.goto': 'goto',
  'page.gotoUninjectable': 'gotoUninjectable',
  'page.element.click': 'clickElement',
  'page.element.hover': 'hoverElement',
  'page.pointer.move': 'movePointer',
  'page.keyboard.press': 'pressKey',
  'page.scroll.by': 'scrollBy',
  'page.navigate': 'navigate',
  'page.reload': 'reload',
  'page.history.back': 'historyBack',
  'page.history.forward': 'historyForward',
  'options.hue.set': 'setOptionsHue',
  'options.clickBinding.set': 'setOptionsClickBinding',
} as const satisfies Record<E2eStep['kind'], keyof E2eAutomation>;

/** Assertion `kind` → primary `E2eAutomation` query. */
export const assertionKindQuery = {
  'page.url.hash': 'readPageHash',
  'page.url.matches': 'readPageUrl',
  'page.element.visible': 'elementVisible',
  'page.element.count': 'elementCount',
  'page.heading.visible': 'headingVisible',
  'extension.badge.nonEmpty': 'readExtensionBadgeText',
  'extension.badge.text': 'readExtensionBadgeText',
  'extension.enabled': 'readExtensionEnabled',
  'extension.storage.sync.equals': 'readSyncStorage',
  'extension.storage.sync.clickIncludes': 'readSyncStorage',
  'clipboard.equals': 'readClipboardText',
  'clipboard.matches': 'readClipboardText',
  'tabs.delta': 'countTabs',
  'tabs.newest.url.matches': 'readNewestTabUrl',
  'windows.delta': 'countWindows',
  'windows.newest.url.matches': 'readNewestWindowUrl',
  'overlay.visible': 'isOverlayVisible',
  'overlay.root.count': 'overlayRootCount',
  'overlay.highlight.strokeChanged': 'overlayHighlightStroke',
  'overlay.highlight.alignsWithElement': 'overlayHighlightBox',
  'overlay.highlight.animating': 'overlayHighlightAnimating',
  'overlay.highlight.visible': 'isOverlayHighlightVisible',
  'overlay.highlight.hue': 'overlayHighlightMatchesHue',
  'overlay.label.text': 'readOverlayLabelText',
  'options.page.open': 'isOptionsPageOpen',
  'options.hue.value': 'readOptionsHue',
  'options.bindingList.contains': 'readOptionsBindingListText',
} as const satisfies Record<E2eAssertion['kind'], keyof E2eAutomation>;

/** Extra query used together with the primary assertion query. */
export const assertionKindExtraQuery = {
  'overlay.highlight.alignsWithElement': 'elementBoundingBox',
} as const satisfies Partial<Record<E2eAssertion['kind'], keyof E2eAutomation>>;

type MappedMethod =
  | (typeof stepKindMethod)[keyof typeof stepKindMethod]
  | (typeof assertionKindQuery)[keyof typeof assertionKindQuery]
  | (typeof assertionKindExtraQuery)[keyof typeof assertionKindExtraQuery];

/** Runner-only helpers are not scenario steps or assertions. */
type RunnerUtility = 'capturePng' | 'noteScenario';

/** `true` only when every `E2eAutomation` method is referenced by a step or assertion. */
export type E2eAutomationMethodsCovered =
  Exclude<keyof E2eAutomation, MappedMethod | RunnerUtility> extends never
    ? true
    : Exclude<keyof E2eAutomation, MappedMethod | RunnerUtility>;

export const e2eAutomationMethodsCovered: E2eAutomationMethodsCovered = true;
