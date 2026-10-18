import type { ClickAction, ClickActionName, ModifierKey } from '@/util/config';
import type { E2eAutomation } from '../automation/interface';

type IconClick = Parameters<E2eAutomation['clickExtensionIcon']>[0];
type SetEnabled = Parameters<E2eAutomation['setExtensionEnabled']>[0];
type Goto = Parameters<E2eAutomation['goto']>[0];
type ClickElement = Parameters<E2eAutomation['clickElement']>[0];
type HoverElement = Parameters<E2eAutomation['hoverElement']>[0];
type MovePointer = Parameters<E2eAutomation['movePointer']>[0];
type PressKey = Parameters<E2eAutomation['pressKey']>[0];
type ScrollBy = Parameters<E2eAutomation['scrollBy']>[0];
type SetHue = Parameters<E2eAutomation['setOptionsHue']>[0];
type SetBinding = Parameters<E2eAutomation['setOptionsClickBinding']>[0];
type SetStorage = Parameters<E2eAutomation['setSyncStorage']>[0];

/**
 * Checks evaluated by the runner via `E2eAutomation` queries.
 * Deltas compare against the count at the start of the scenario.
 * `overlay.highlight.strokeChanged` compares the stroke from immediately
 * before the step that carries the assertion with the stroke after it.
 */
export type E2eAssertion =
  | {
      /** `E2eAutomation.readPageHash` */
      kind: 'page.url.hash';
      value: string;
    }
  | {
      /** `E2eAutomation.readPageUrl` — `pattern` is a regular expression source. */
      kind: 'page.url.matches';
      pattern: string;
    }
  | {
      /** `E2eAutomation.elementVisible` */
      kind: 'page.element.visible';
      selector: string;
    }
  | {
      /** `E2eAutomation.elementCount` */
      kind: 'page.element.count';
      selector: string;
      count: number;
    }
  | {
      /** `E2eAutomation.headingVisible` */
      kind: 'page.heading.visible';
      name: string;
      level: number;
    }
  | {
      /** `E2eAutomation.readExtensionBadgeText` — text is non-empty. */
      kind: 'extension.badge.nonEmpty';
    }
  | {
      /** `E2eAutomation.readExtensionBadgeText` */
      kind: 'extension.badge.text';
      text: string;
    }
  | {
      /** `E2eAutomation.readExtensionEnabled` */
      kind: 'extension.enabled';
      enabled: boolean;
    }
  | {
      /** `E2eAutomation.readSyncStorage` for `hue`. */
      kind: 'extension.storage.sync.equals';
      key: 'hue';
      value: number;
    }
  | {
      /** `E2eAutomation.readSyncStorage` for `click`. */
      kind: 'extension.storage.sync.equals';
      key: 'click';
      value: readonly ClickAction[];
    }
  | {
      /**
       * `E2eAutomation.readSyncStorage` for `click`.
       * Passes when some binding has this action and the same key set.
       */
      kind: 'extension.storage.sync.clickIncludes';
      action: ClickActionName;
      keys: readonly ModifierKey[];
    }
  | {
      /** `E2eAutomation.readClipboardText` */
      kind: 'clipboard.equals';
      text: string;
    }
  | {
      /** `E2eAutomation.readClipboardText` — `pattern` is a regular expression source. */
      kind: 'clipboard.matches';
      pattern: string;
    }
  | {
      /** `E2eAutomation.countTabs` minus the count at scenario start. */
      kind: 'tabs.delta';
      by: number;
    }
  | {
      /** `E2eAutomation.readNewestTabUrl` */
      kind: 'tabs.newest.url.matches';
      pattern: string;
    }
  | {
      /** `E2eAutomation.countWindows` minus the count at scenario start. */
      kind: 'windows.delta';
      by: number;
    }
  | {
      /** `E2eAutomation.readNewestWindowUrl` */
      kind: 'windows.newest.url.matches';
      pattern: string;
    }
  | {
      /** `E2eAutomation.isOverlayVisible` */
      kind: 'overlay.visible';
      visible: boolean;
    }
  | {
      /** `E2eAutomation.overlayRootCount` */
      kind: 'overlay.root.count';
      count: number;
    }
  | {
      /** `E2eAutomation.overlayHighlightStroke` before and after the step. */
      kind: 'overlay.highlight.strokeChanged';
    }
  | {
      /**
       * `E2eAutomation.overlayHighlightBox` matches
       * `E2eAutomation.elementBoundingBox` within adapter tolerance.
       */
      kind: 'overlay.highlight.alignsWithElement';
      selector: string;
    }
  | {
      /** `E2eAutomation.overlayHighlightAnimating` */
      kind: 'overlay.highlight.animating';
    }
  | {
      /** `E2eAutomation.isOverlayHighlightVisible` */
      kind: 'overlay.highlight.visible';
      visible: boolean;
    }
  | {
      /** `E2eAutomation.overlayHighlightMatchesHue` */
      kind: 'overlay.highlight.hue';
      hue: number;
    }
  | {
      /** `E2eAutomation.readOverlayLabelText` */
      kind: 'overlay.label.text';
      text: string;
    }
  | {
      /** `E2eAutomation.isOptionsPageOpen` */
      kind: 'options.page.open';
    }
  | {
      /** `E2eAutomation.readOptionsHue` */
      kind: 'options.hue.value';
      value: number;
    }
  | {
      /** `E2eAutomation.readOptionsBindingListText` */
      kind: 'options.bindingList.contains';
      text: string;
    };

/**
 * One user-level operation. `kind` is the runner's dispatch key into
 * `E2eAutomation` (see `e2e/automation/contract.ts`).
 */
export type E2eStep = {
  /** Assertions evaluated immediately after this step. */
  expect?: readonly E2eAssertion[];
} & (
  | ({ kind: 'extension.icon.click' } & IconClick)
  | ({ kind: 'extension.setEnabled' } & SetEnabled)
  | { kind: 'extension.options.open' }
  | ({ kind: 'extension.storage.sync.set' } & SetStorage)
  | ({ kind: 'page.goto' } & Goto)
  | ({ kind: 'page.element.click' } & ClickElement)
  | ({ kind: 'page.element.hover' } & HoverElement)
  | ({ kind: 'page.pointer.move' } & MovePointer)
  | ({ kind: 'page.keyboard.press' } & PressKey)
  | ({ kind: 'page.scroll.by' } & ScrollBy)
  | { kind: 'page.reload' }
  | { kind: 'page.history.back' }
  | { kind: 'page.history.forward' }
  | ({ kind: 'options.hue.set' } & SetHue)
  | ({ kind: 'options.clickBinding.set' } & SetBinding)
);

/** Browser-independent end-to-end scenario. */
export type E2eScenario = {
  id: string;
  title: string;
  description?: string;
  tags?: readonly string[];
  steps: readonly E2eStep[];
  /** Assertions evaluated after every step. */
  expect?: readonly E2eAssertion[];
};
