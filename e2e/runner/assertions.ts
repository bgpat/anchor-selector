import { keySignature, type ClickAction } from '@/util/config';
import type { E2eAutomation } from '../automation/interface';
import type { E2eAssertion } from '../scenarios/types';

export type AssertionBaseline = {
  tabs: number;
  windows: number;
  strokeBefore: string | null;
};

const ALIGN_TOLERANCE_PX = 6;

function sameClick(
  actual: readonly ClickAction[],
  expected: readonly ClickAction[],
): boolean {
  const normalize = (entries: readonly ClickAction[]) =>
    entries
      .map((entry) => `${entry.action}:${[...entry.keys].sort().join('+')}`)
      .sort();
  return (
    JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected))
  );
}

/** Returns null when the assertion holds, otherwise a short explanation. */
export async function explainAssertion(
  assertion: E2eAssertion,
  automation: E2eAutomation,
  baseline: AssertionBaseline,
): Promise<string | null> {
  switch (assertion.kind) {
    case 'page.url.hash': {
      const hash = await automation.readPageHash();
      return hash === assertion.value
        ? null
        : `hash is ${JSON.stringify(hash)}`;
    }
    case 'page.url.matches': {
      const url = await automation.readPageUrl();
      return new RegExp(assertion.pattern).test(url) ? null : `url is ${url}`;
    }
    case 'page.element.visible': {
      const visible = await automation.elementVisible({
        selector: assertion.selector,
      });
      return visible ? null : `${assertion.selector} is not visible`;
    }
    case 'page.element.count': {
      const count = await automation.elementCount({
        selector: assertion.selector,
      });
      return count === assertion.count
        ? null
        : `${assertion.selector} count is ${count}`;
    }
    case 'page.heading.visible': {
      const visible = await automation.headingVisible({
        name: assertion.name,
        level: assertion.level,
      });
      return visible
        ? null
        : `h${assertion.level} ${JSON.stringify(assertion.name)} is missing`;
    }
    case 'extension.badge.nonEmpty': {
      const text = await automation.readExtensionBadgeText();
      return text !== '' ? null : 'badge text is empty';
    }
    case 'extension.badge.text': {
      const text = await automation.readExtensionBadgeText();
      return text === assertion.text
        ? null
        : `badge text is ${JSON.stringify(text)}`;
    }
    case 'extension.enabled': {
      const enabled = await automation.readExtensionEnabled();
      return enabled === assertion.enabled
        ? null
        : `extension enabled is ${enabled}`;
    }
    case 'extension.storage.sync.equals': {
      if (assertion.key === 'hue') {
        const hue = await automation.readSyncStorage({ key: 'hue' });
        return hue === assertion.value ? null : `stored hue is ${hue}`;
      }
      const click = await automation.readSyncStorage({ key: 'click' });
      return sameClick(click, assertion.value)
        ? null
        : `stored click is ${JSON.stringify(click)}`;
    }
    case 'extension.storage.sync.clickIncludes': {
      const click = await automation.readSyncStorage({ key: 'click' });
      const signature = keySignature(assertion.keys);
      const found = click.some(
        (entry) =>
          entry.action === assertion.action &&
          keySignature(entry.keys) === signature,
      );
      return found ? null : `stored click is ${JSON.stringify(click)}`;
    }
    case 'clipboard.equals': {
      const text = await automation.readClipboardText();
      return text === assertion.text
        ? null
        : `clipboard is ${JSON.stringify(text)}`;
    }
    case 'clipboard.matches': {
      const text = await automation.readClipboardText();
      return new RegExp(assertion.pattern).test(text)
        ? null
        : `clipboard is ${JSON.stringify(text)}`;
    }
    case 'tabs.delta': {
      const count = await automation.countTabs();
      const delta = count - baseline.tabs;
      return delta === assertion.by
        ? null
        : `tab delta is ${delta} (${count} tabs)`;
    }
    case 'tabs.newest.url.matches': {
      const url = await automation.readNewestTabUrl();
      return new RegExp(assertion.pattern).test(url)
        ? null
        : `newest tab url is ${url}`;
    }
    case 'windows.delta': {
      const count = await automation.countWindows();
      const delta = count - baseline.windows;
      return delta === assertion.by
        ? null
        : `window delta is ${delta} (${count} windows)`;
    }
    case 'windows.newest.url.matches': {
      const url = await automation.readNewestWindowUrl();
      return new RegExp(assertion.pattern).test(url)
        ? null
        : `newest window url is ${url}`;
    }
    case 'overlay.visible': {
      const visible = await automation.isOverlayVisible();
      return visible === assertion.visible
        ? null
        : `overlay visible is ${visible}`;
    }
    case 'overlay.root.count': {
      const count = await automation.overlayRootCount();
      return count === assertion.count
        ? null
        : `overlay root count is ${count}`;
    }
    case 'overlay.highlight.strokeChanged': {
      const stroke = await automation.overlayHighlightStroke();
      if (stroke == null || stroke === baseline.strokeBefore) {
        return `highlight stroke is still ${stroke}`;
      }
      return null;
    }
    case 'overlay.highlight.alignsWithElement': {
      const highlight = await automation.overlayHighlightBox();
      const element = await automation.elementBoundingBox({
        selector: assertion.selector,
      });
      if (highlight == null || element == null) {
        return 'highlight or element box is missing';
      }
      const edges = ['x', 'y', 'width', 'height'] as const;
      const mismatch = edges.find(
        (edge) =>
          Math.abs(highlight[edge] - element[edge]) > ALIGN_TOLERANCE_PX,
      );
      return mismatch == null
        ? null
        : `highlight ${mismatch} is ${highlight[mismatch]}, element is ${element[mismatch]}`;
    }
    case 'overlay.highlight.animating': {
      const animating = await automation.overlayHighlightAnimating();
      return animating ? null : 'highlight is not animating';
    }
    case 'overlay.highlight.visible': {
      const visible = await automation.isOverlayHighlightVisible();
      return visible === assertion.visible
        ? null
        : `highlight visible is ${visible}`;
    }
    case 'overlay.highlight.hue': {
      const matches = await automation.overlayHighlightMatchesHue({
        hue: assertion.hue,
      });
      return matches ? null : `highlight does not match hue ${assertion.hue}`;
    }
    case 'overlay.label.text': {
      const text = await automation.readOverlayLabelText();
      return text === assertion.text
        ? null
        : `overlay label is ${JSON.stringify(text)}`;
    }
    case 'options.page.open': {
      const open = await automation.isOptionsPageOpen();
      return open ? null : 'options page is not open';
    }
    case 'options.hue.value': {
      const hue = await automation.readOptionsHue();
      return hue === assertion.value ? null : `options hue is ${hue}`;
    }
    case 'options.bindingList.contains': {
      const text = await automation.readOptionsBindingListText();
      return text.includes(assertion.text)
        ? null
        : `binding list is ${JSON.stringify(text)}`;
    }
  }
}
