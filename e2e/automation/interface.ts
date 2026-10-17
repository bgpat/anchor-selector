import type {
  ClickActionName,
  ConfigKey,
  ModifierKey,
  StoredConfig,
} from '@/util/config';
import type { GotoInput } from '../browser/navigation';

/** Toolbar button on the extension icon. Browser-agnostic. */
export type ExtensionIconButton = 'left' | 'right' | 'middle';

/** Viewport rectangle in CSS pixels. */
export type DomBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Browser operations and reads that e2e scenarios assume.
 * Adapters implement this; scenarios never mention a browser or a driver.
 *
 * `page.*` targets the fixture tab. `options.*` targets the options tab.
 * Extension-management actions go through the browser UI inside the adapter.
 */
export interface E2eAutomation {
  /** Toolbar (browser action) icon click. */
  clickExtensionIcon(input: { button: ExtensionIconButton }): Promise<void>;

  /**
   * Enable or disable this extension from the browser's extension
   * management UI.
   */
  setExtensionEnabled(input: { enabled: boolean }): Promise<void>;

  /**
   * Open the options page from the extension UI.
   * Scenarios do not pass an options URL.
   */
  openExtensionOptions(): Promise<void>;

  /**
   * Navigate the fixture tab.
   * `path` is on the fixture origin; `href` is an absolute URL;
   * `uninjectable` opens the adapter's non-injectable page.
   */
  goto(input: GotoInput): Promise<void>;

  /**
   * Click an element in the fixture tab.
   * `modifiers` are extension `ModifierKey` values; the adapter maps them
   * to the pointing-device event.
   */
  clickElement(input: {
    selector: string;
    modifiers?: readonly ModifierKey[];
  }): Promise<void>;

  /**
   * Move the pointer to the element's center and dispatch the movement
   * the page uses for hit-testing.
   */
  hoverElement(input: { selector: string }): Promise<void>;

  /**
   * Move the pointer to an element center or to viewport coordinates.
   * Coordinates outside the viewport must produce `mouseleave`.
   */
  movePointer(
    input: { selector: string } | { x: number; y: number },
  ): Promise<void>;

  pressKey(input: { key: string }): Promise<void>;

  /**
   * Scroll the fixture viewport. The pointer stays at the same viewport
   * position.
   */
  scrollBy(input: { x?: number; y?: number }): Promise<void>;

  reload(): Promise<void>;

  historyBack(): Promise<void>;

  historyForward(): Promise<void>;

  /** Change hue from the options page UI. */
  setOptionsHue(input: { value: number }): Promise<void>;

  /** Change the click binding for `keys` from the options page UI. */
  setOptionsClickBinding(input: {
    keys: readonly ModifierKey[];
    action: ClickActionName;
  }): Promise<void>;

  /** Test setup: write `storage.sync` without using the options form. */
  setSyncStorage(input: { values: Partial<StoredConfig> }): Promise<void>;

  readPageHash(): Promise<string>;

  readPageUrl(): Promise<string>;

  elementVisible(input: { selector: string }): Promise<boolean>;

  elementCount(input: { selector: string }): Promise<number>;

  headingVisible(input: { name: string; level: number }): Promise<boolean>;

  readExtensionBadgeText(): Promise<string>;

  readExtensionEnabled(): Promise<boolean>;

  readSyncStorage<K extends ConfigKey>(input: {
    key: K;
  }): Promise<StoredConfig[K]>;

  readClipboardText(): Promise<string>;

  countTabs(): Promise<number>;

  countWindows(): Promise<number>;

  /** URL of the most recently opened tab. */
  readNewestTabUrl(): Promise<string>;

  /** URL of the most recently opened window. */
  readNewestWindowUrl(): Promise<string>;

  isOverlayVisible(): Promise<boolean>;

  /** Count of overlay root nodes in the fixture document. */
  overlayRootCount(): Promise<number>;

  /** Computed highlight stroke, or null when no highlight is painted. */
  overlayHighlightStroke(): Promise<string | null>;

  /** Highlight box in viewport coordinates, or null when it is hidden. */
  overlayHighlightBox(): Promise<DomBox | null>;

  /** Whether the highlight path animation is in progress. */
  overlayHighlightAnimating(): Promise<boolean>;

  isOverlayHighlightVisible(): Promise<boolean>;

  /** Whether the painted highlight matches `hue`. */
  overlayHighlightMatchesHue(input: { hue: number }): Promise<boolean>;

  /** Label text for the hovered target, including the leading `#`. */
  readOverlayLabelText(): Promise<string | null>;

  elementBoundingBox(input: { selector: string }): Promise<DomBox | null>;

  readOptionsHue(): Promise<number>;

  /** Visible text of the click-binding list on the options page. */
  readOptionsBindingListText(): Promise<string>;

  isOptionsPageOpen(): Promise<boolean>;

  /** Write a PNG of the current window. */
  capturePng(path: string): Promise<void>;

  /**
   * Show the running scenario in `#e2e-note` on the fixture page.
   * Pages without that field keep their current document.
   */
  noteScenario(input: { id: string; title: string }): Promise<void>;
}
