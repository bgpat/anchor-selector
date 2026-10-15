import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { default as Color } from 'color';
import {
  By,
  error as seleniumError,
  Key,
  Origin,
  type WebDriver,
  type WebElement,
} from 'selenium-webdriver';
import type { ConfigKey, ModifierKey, StoredConfig } from '@/util/config';
import variables from '@/util/variables';
import type { DomBox, E2eAutomation } from '../automation/interface';
import { runAtspi } from './atspi-host';

const execFileAsync = promisify(execFile);

export const EXTENSION_NAME = 'Anchor Selector';

const OVERLAY = `.${variables.overlay.class}`;
const HIGHLIGHT = `${OVERLAY} > svg > .selecting > path`;
const LABEL = `${OVERLAY} .label-content`;

const browserDir = dirname(fileURLToPath(import.meta.url));

export type BrowserName = 'chrome' | 'firefox';

export function extensionOutput(browserName: BrowserName): string {
  return resolve(process.cwd(), '.output', browserName);
}

export function installProbePage(extensionDir: string): void {
  if (!existsSync(resolve(extensionDir, 'manifest.json'))) {
    throw new Error(
      `Extension build not found at ${extensionDir}. Run the browser build first.`,
    );
  }
  copyFileSync(
    resolve(browserDir, 'probe.html'),
    resolve(extensionDir, 'e2e-probe.html'),
  );
}

type PointerButton = 'left' | 'middle' | 'right';

type AtspiBox = {
  name: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** x11grab records the system pointer. WebDriver actions do not move it. */
export async function pointAtScreen(x: number, y: number): Promise<void> {
  await runAtspi([
    JSON.stringify({
      command: 'move',
      x: Math.round(x),
      y: Math.round(y),
    }),
  ]);
}

export async function typeAtKeyboard(
  text: string,
  options?: { submit?: boolean; selectAll?: boolean },
): Promise<void> {
  await runAtspi([
    JSON.stringify({
      command: 'type-text',
      text,
      submit: options?.submit ?? false,
      selectAll: options?.selectAll ?? false,
    }),
  ]);
}

export async function clickAtScreen(
  x: number,
  y: number,
  button: PointerButton = 'left',
): Promise<void> {
  await pointAtScreen(x, y);
  await delay(actionPauseMs);
  await runAtspi([
    JSON.stringify({
      command: 'press-at',
      x: Math.round(x),
      y: Math.round(y),
      button,
      pauseMs: actionPauseMs,
    }),
  ]);
}

export async function listAtspi(input: {
  app: string;
  role: string;
  name?: string;
  exact?: boolean;
}): Promise<AtspiBox[]> {
  const output = await runAtspi([
    JSON.stringify({
      command: 'list',
      app: input.app,
      role: input.role,
      name: input.name ?? '',
      exact: input.exact ?? false,
    }),
  ]);
  return JSON.parse(output) as AtspiBox[];
}

const screenPointScript = `const element = arguments[0];
const offsetX = arguments[1] ?? 0;
const offsetY = arguments[2] ?? 0;
const rect = element.getBoundingClientRect();
let x = rect.left + rect.width / 2 + offsetX;
let y = rect.top + rect.height / 2 + offsetY;
let view = element.ownerDocument.defaultView;
while (view !== view.parent && view.parent) {
  const frame = view.frameElement;
  if (!frame) break;
  const frameRect = frame.getBoundingClientRect();
  x += frameRect.left;
  y += frameRect.top;
  view = view.parent;
}
const borderX = Math.max(0, (view.outerWidth - view.innerWidth) / 2);
const originX = typeof view.mozInnerScreenX === 'number'
  ? view.mozInnerScreenX
  : view.screenX + borderX;
const originY = typeof view.mozInnerScreenY === 'number'
  ? view.mozInnerScreenY
  : view.screenY + Math.max(0, view.outerHeight - view.innerHeight - borderX);
return { x: originX + x, y: originY + y };`;

const screenPointViewportScript = `let x = arguments[0];
let y = arguments[1];
let view = window;
while (view !== view.parent && view.parent) {
  const frame = view.frameElement;
  if (!frame) break;
  const frameRect = frame.getBoundingClientRect();
  x += frameRect.left;
  y += frameRect.top;
  view = view.parent;
}
const borderX = Math.max(0, (view.outerWidth - view.innerWidth) / 2);
const originX = typeof view.mozInnerScreenX === 'number'
  ? view.mozInnerScreenX
  : view.screenX + borderX;
const originY = typeof view.mozInnerScreenY === 'number'
  ? view.mozInnerScreenY
  : view.screenY + Math.max(0, view.outerHeight - view.innerHeight - borderX);
return { x: originX + x, y: originY + y };`;

/** Hold each operation and tab switch in the recording. */
export const actionPauseMs = 500;

export function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

export async function configureDriver(driver: WebDriver): Promise<void> {
  await driver.manage().setTimeouts({
    implicit: 0,
    pageLoad: 20000,
    script: 15000,
  });
}

export async function fitWindow(driver: WebDriver): Promise<void> {
  await driver
    .manage()
    .window()
    .setRect({ x: 0, y: 0, width: 960, height: 600 });
}

export async function keepSingleTab(driver: WebDriver): Promise<string> {
  const handles = await driver.getAllWindowHandles();
  const [keep, ...rest] = handles;
  if (keep == null) {
    throw new Error('Browser opened without a window');
  }
  for (const handle of rest) {
    await driver.switchTo().window(handle);
    await driver.close();
  }
  await driver.switchTo().window(keep);
  return keep;
}

export async function prepareTabs(
  driver: WebDriver,
  probeUrl: string,
): Promise<{ fixtureHandle: string; probeHandle: string }> {
  const fixtureHandle = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  const probeHandle = await driver.getWindowHandle();
  await driver.get(probeUrl);
  await driver.switchTo().window(fixtureHandle);
  return { fixtureHandle, probeHandle };
}

const PROBE_PRELUDE = `
  const done = arguments[arguments.length - 1];
  const ext = globalThis.browser && globalThis.browser.storage
    ? globalThis.browser
    : globalThis.chrome;
`;

function probeScript(body: string): string {
  return `${PROBE_PRELUDE}\n${body}`;
}

const modifierSelenium: Record<ModifierKey, string> = {
  shift: Key.SHIFT,
  ctrl: Key.CONTROL,
  alt: Key.ALT,
  meta: Key.META,
};

const namedKeys: Record<string, string> = {
  Escape: Key.ESCAPE,
  Enter: Key.ENTER,
  Tab: Key.TAB,
};

function expectedHighlightRgb(hue: number): [number, number, number] {
  const stroke = variables.overlay.selecting.stroke;
  const [red, green, blue] = Color.hsl(hue, stroke.saturation, stroke.lightness)
    .rgb()
    .array();
  return [red ?? 0, green ?? 0, blue ?? 0];
}

function parseRgb(value: string): [number, number, number] | null {
  const channels = value.match(/rgba?\(([^)]+)\)/i);
  if (channels?.[1]) {
    const parts = channels[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
    }
  }
  const srgb = value.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if (srgb) {
    return [0, 1, 2].map((index) =>
      Math.round(Number(srgb[index + 1]) * 255),
    ) as [number, number, number];
  }
  return null;
}

/**
 * Page, overlay, options, and extension-probe operations shared by both
 * browsers. Toolbar and extension-management UI stay in the adapters.
 */
export abstract class PageAutomation implements E2eAutomation {
  protected optionsHandle: string | null = null;

  /**
   * Marionette action events reach the page but not extension content scripts
   * until the page itself listens for them. Firefox replays the events after that.
   */
  protected relayPageEvents = false;

  /** Scenario id and title last written into `#e2e-note`. */
  private scenarioNote = '';

  private scenarioId = '';

  constructor(
    protected readonly driver: WebDriver,
    protected fixtureHandle: string,
    protected probeHandle: string,
    protected readonly probeUrl: string,
    protected readonly fixtureOrigin: string,
    private readonly uninjectableUrl: string,
  ) {}

  abstract clickExtensionIcon(
    input: Parameters<E2eAutomation['clickExtensionIcon']>[0],
  ): Promise<void>;

  abstract setExtensionEnabled(
    input: Parameters<E2eAutomation['setExtensionEnabled']>[0],
  ): Promise<void>;

  abstract openExtensionOptions(): Promise<void>;

  abstract readExtensionBadgeText(): Promise<string>;

  abstract readExtensionEnabled(): Promise<boolean>;

  protected abstract browserAtspiApp(): string;

  protected abstract addressBarEntryNames(): readonly string[];

  async windowRect(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    return this.driver.manage().window().getRect();
  }

  protected async preparePage(): Promise<void> {
    await this.focusFixture();
  }

  protected async focusFixture(): Promise<void> {
    await this.switchToWindow(this.fixtureHandle);
  }

  /**
   * Click the tab, then tell WebDriver to follow it. The click is what the
   * recording shows; WebDriver does not track a click on the tab strip.
   */
  protected async switchToWindow(handle: string): Promise<void> {
    let current: string | undefined;
    try {
      current = await this.driver.getWindowHandle();
    } catch {
      current = undefined;
    }
    if (current === handle) {
      return;
    }
    await this.clickTab(handle);
    await this.driver.switchTo().window(handle);
    await delay(actionPauseMs);
  }

  protected abstract clickTab(handle: string): Promise<void>;

  protected abstract openTabByMouse(): Promise<void>;

  protected abstract closeTabByMouse(handle: string): Promise<void>;

  protected abstract findOptionsHandle(): Promise<string | null>;

  /** Open a tab from the tab strip and return its WebDriver handle. */
  protected async openBrowserTab(): Promise<string> {
    const before = new Set(await this.driver.getAllWindowHandles());
    await this.openTabByMouse();
    const deadline = Date.now() + 8000;
    let created: string | undefined;
    while (Date.now() < deadline) {
      const handles = await this.driver.getAllWindowHandles();
      created = handles.find((handle) => !before.has(handle));
      if (created != null) {
        break;
      }
      await delay(50);
    }
    if (created == null) {
      throw new Error('Clicking the new-tab button did not open a tab');
    }
    await this.driver.switchTo().window(created);
    await delay(actionPauseMs);
    return created;
  }

  /** Close a tab from its close button. */
  protected async closeBrowserTab(handle: string): Promise<void> {
    await this.closeTabByMouse(handle);
    await delay(actionPauseMs);
  }

  /** Selenium keeps the closed tab selected after `driver.close()`. */
  protected async activateOpenWindow(): Promise<void> {
    const handles = await this.driver.getAllWindowHandles();
    try {
      const current = await this.driver.getWindowHandle();
      if (handles.includes(current)) {
        return;
      }
    } catch {
      // The selected tab was closed.
    }
    const next = handles[0];
    if (next == null) {
      throw new Error('Browser has no open windows');
    }
    await this.switchToWindow(next);
  }

  /**
   * Run an extension API in the probe page without selecting its tab.
   * Selecting it would be a tab switch, and on Firefox that fires `pagehide`.
   */
  protected async probe<T>(script: string, ...args: unknown[]): Promise<T> {
    const result = await this.evaluateProbe<T | { error: string }>(
      script,
      ...args,
    );
    if (
      result != null &&
      typeof result === 'object' &&
      'error' in result &&
      typeof result.error === 'string'
    ) {
      throw new Error(result.error);
    }
    return result as T;
  }

  protected abstract evaluateProbe<T>(
    script: string,
    ...args: unknown[]
  ): Promise<T>;

  protected async reopenProbe(): Promise<void> {
    const handles = await this.driver.getAllWindowHandles();
    if (!handles.includes(this.probeHandle)) {
      this.probeHandle = await this.openBrowserTab();
    } else {
      await this.switchToWindow(this.probeHandle);
    }
    await this.driver.get(this.probeUrl);
    await delay(actionPauseMs);
    await this.focusFixture();
  }

  protected isOptionsUrl(url: string): boolean {
    return url.includes('options.html') || /[?&]options=/.test(url);
  }

  protected async rememberOptionsTab(): Promise<void> {
    this.optionsHandle = await this.findOptionsHandle();
  }

  private async optionsHeadingPresent(): Promise<boolean> {
    return this.driver.executeScript<boolean>(
      "return document.querySelector('h1')?.textContent === arguments[0]",
      EXTENSION_NAME,
    );
  }

  private async optionFrames(): Promise<WebElement[]> {
    return this.driver.executeScript<WebElement[]>(
      `function visit(node, found) {
        for (const frame of node.querySelectorAll?.('iframe, webview, embed') ?? []) {
          found.push(frame);
        }
        for (const element of node.querySelectorAll?.('*') ?? []) {
          if (element.shadowRoot) visit(element.shadowRoot, found);
        }
        return found;
      }
      return visit(document, [])`,
    );
  }

  protected async enterOptionsFrame(): Promise<boolean> {
    await this.driver.switchTo().defaultContent();
    if (await this.optionsHeadingPresent()) {
      return true;
    }
    const frames = await this.optionFrames();
    for (const frame of frames) {
      try {
        await this.driver.switchTo().defaultContent();
        await this.driver.switchTo().frame(frame);
        if (await this.optionsHeadingPresent()) {
          return true;
        }
      } catch {
        // Some guest views cannot be selected.
      }
    }
    await this.driver.switchTo().defaultContent();
    return false;
  }

  private async focusOptions(): Promise<void> {
    await this.rememberOptionsTab();
    if (this.optionsHandle == null) {
      throw new Error('Options page is not open');
    }
    await this.switchToWindow(this.optionsHandle);
    await this.waitFor(async () => {
      if (!(await this.enterOptionsFrame())) {
        return false;
      }
      return (
        (await this.driver.executeScript(
          "return document.querySelector('h1')?.textContent ?? ''",
        )) === EXTENSION_NAME
      );
    }, 'options page did not render');
  }

  private async waitForReady(): Promise<void> {
    await this.waitFor(async () => {
      const state = await this.driver.executeScript(
        'return document.readyState',
      );
      return state === 'complete';
    }, 'document did not finish loading');
  }

  protected async waitFor(
    predicate: () => Promise<boolean>,
    message: string,
    timeoutMs = 8000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        if (await predicate()) {
          return;
        }
      } catch (error) {
        lastError = error;
      }
      await delay(50);
    }
    const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
    throw new Error(`${message}${detail}`);
  }

  async goto(input: { path: string }): Promise<void> {
    await this.openUrlInAddressBar(`${this.fixtureOrigin}${input.path}`);
  }

  async navigate(input: { path: string }): Promise<void> {
    await this.goto(input);
  }

  async gotoUninjectable(): Promise<void> {
    await this.openUrlInAddressBar(this.uninjectableUrl);
  }

  async reload(): Promise<void> {
    await this.preparePage();
    await this.clickBrowserReload();
    await this.waitForReady();
  }

  async historyBack(): Promise<void> {
    await this.preparePage();
    await this.clickBrowserBack();
    await this.waitForReady();
  }

  async historyForward(): Promise<void> {
    await this.preparePage();
    await this.clickBrowserForward();
    await this.waitForReady();
  }

  protected async openUrlInAddressBar(url: string): Promise<void> {
    await this.preparePage();
    await this.clickAddressBar();
    await delay(actionPauseMs);
    await typeAtKeyboard(url, { submit: true, selectAll: true });
    await delay(actionPauseMs);
    await this.waitFor(
      async () => (await this.driver.getCurrentUrl()).startsWith(url),
      'address bar navigation did not finish',
      30000,
    );
    await this.waitForReady();
  }

  protected async clickBrowserBack(): Promise<void> {
    await this.clickAtspiToolbar({
      names: ['Back'],
      roles: ['push button'],
    });
  }

  protected async clickBrowserForward(): Promise<void> {
    await this.clickAtspiToolbar({
      names: ['Forward'],
      roles: ['push button'],
    });
  }

  protected async clickBrowserReload(): Promise<void> {
    await this.clickAtspiToolbar({
      names: ['Reload', 'Reload current page', 'Reload this page'],
      roles: ['push button'],
    });
  }

  protected async clickAddressBar(): Promise<void> {
    await this.clickAtspiToolbar({
      names: this.addressBarEntryNames(),
      roles: ['combo box', 'entry', 'text'],
    });
  }

  protected async clickAtspiToolbar(input: {
    names: readonly string[];
    roles: readonly string[];
    exact?: boolean;
  }): Promise<void> {
    const rect = await this.windowRect();
    const top = rect.y;
    const bottom = rect.y + 200;
    for (const name of input.names) {
      for (const role of input.roles) {
        const matches = await listAtspi({
          app: this.browserAtspiApp(),
          role,
          name,
          exact: input.exact ?? false,
        });
        const match = matches.find(
          (item) =>
            item.y >= top &&
            item.y < bottom &&
            item.width > 0 &&
            item.height > 0,
        );
        if (match == null) {
          continue;
        }
        const x = Math.round(match.x + match.width / 2);
        const y = Math.round(match.y + match.height / 2);
        await runAtspi([
          JSON.stringify({
            command: 'click',
            app: this.browserAtspiApp(),
            role,
            name,
            exact: input.exact ?? false,
            pauseMs: actionPauseMs,
            x,
            y,
          }),
        ]);
        return;
      }
    }
    const widest = (
      await Promise.all(
        input.roles.map((role) =>
          listAtspi({ app: this.browserAtspiApp(), role }),
        ),
      )
    )
      .flat()
      .filter(
        (item) =>
          item.y >= top &&
          item.y < bottom &&
          item.width >= 200 &&
          item.height > 0,
      )
      .sort((left, right) => right.width - left.width)[0];
    if (widest != null) {
      await clickAtScreen(
        widest.x + widest.width / 2,
        widest.y + widest.height / 2,
      );
      return;
    }
    throw new Error(
      `Toolbar control not found: ${input.names.join(', ')} (${input.roles.join(', ')})`,
    );
  }

  async clickElement(input: {
    selector: string;
    modifiers?: readonly ModifierKey[];
  }): Promise<void> {
    await this.preparePage();
    const element = await this.driver.findElement(By.css(input.selector));
    await this.movePointerToElement(element);
    await delay(actionPauseMs);
    const actions = this.driver.actions();
    for (const modifier of input.modifiers ?? []) {
      actions.keyDown(modifierSelenium[modifier]);
    }
    actions.click(element);
    for (const modifier of input.modifiers ?? []) {
      actions.keyUp(modifierSelenium[modifier]);
    }
    await actions.perform();
    await delay(actionPauseMs);
    if (this.relayPageEvents) {
      await this.relayToContentScript(
        { type: 'click', selector: input.selector },
        input.modifiers,
      );
    }
  }

  async hoverElement(input: { selector: string }): Promise<void> {
    await this.movePointer(input);
  }

  /**
   * Geckodriver throws MoveTargetOutOfBoundsError instead of scrolling.
   * Its action viewport can also be shorter than window.innerHeight.
   */
  /** Keep the recorded pointer traveling with the WebDriver move, then surface its error. */
  private async withPointerTravel(
    travel: Promise<void>,
    perform: () => Promise<void>,
  ): Promise<void> {
    const moving = travel.then(
      () => null,
      (error: unknown) => error,
    );
    let performError: unknown;
    try {
      await perform();
    } catch (error) {
      performError = error;
    }
    const travelError = await moving;
    if (performError) {
      throw performError;
    }
    if (travelError) {
      throw travelError;
    }
  }

  protected async clickWebElement(element: WebElement): Promise<void> {
    await this.clickWebElementAtOffset(element, 0, 0);
  }

  protected async clickWebElementAtOffset(
    element: WebElement,
    offsetX: number,
    offsetY: number,
  ): Promise<void> {
    await this.movePointerToElement(element, offsetX, offsetY);
    await delay(actionPauseMs);
    await this.driver
      .actions()
      .move({ origin: element, x: offsetX, y: offsetY, duration: 0 })
      .click()
      .perform();
    await delay(actionPauseMs);
  }

  private async clickViewport(x: number, y: number): Promise<void> {
    await this.movePointerToViewport(x, y);
    await delay(actionPauseMs);
    await this.driver
      .actions()
      .move({
        x,
        y,
        origin: Origin.VIEWPORT,
        duration: 0,
      })
      .click()
      .perform();
    await delay(actionPauseMs);
  }

  private async movePointerToElement(
    element: WebElement,
    offsetX = 0,
    offsetY = 0,
  ): Promise<void> {
    await this.revealElement(element);
    const move = () =>
      this.withPointerTravel(this.pointAt(element, offsetX, offsetY), () =>
        this.driver
          .actions()
          .move({
            origin: element,
            x: offsetX,
            y: offsetY,
            duration: 250,
          })
          .perform(),
      );
    try {
      await move();
    } catch (caught) {
      if (!(caught instanceof seleniumError.MoveTargetOutOfBoundsError)) {
        throw caught;
      }
      await this.scrollElementIntoView(element);
      await move();
    }
  }

  private async movePointerToViewport(x: number, y: number): Promise<void> {
    await this.withPointerTravel(this.pointAtViewport(x, y), () =>
      this.driver
        .actions()
        .move({
          x,
          y,
          origin: Origin.VIEWPORT,
          duration: 250,
        })
        .perform(),
    );
  }

  private async runPointerAction(
    element: WebElement,
    perform: () => Promise<void>,
  ): Promise<void> {
    await this.movePointerToElement(element);
    await perform();
  }

  protected async pointAt(
    element: WebElement,
    offsetX = 0,
    offsetY = 0,
  ): Promise<void> {
    const point = await this.driver.executeScript<{ x: number; y: number }>(
      screenPointScript,
      element,
      offsetX,
      offsetY,
    );
    await pointAtScreen(point.x, point.y);
  }

  protected async pointAtViewport(x: number, y: number): Promise<void> {
    const point = await this.driver.executeScript<{ x: number; y: number }>(
      screenPointViewportScript,
      x,
      y,
    );
    await pointAtScreen(point.x, point.y);
  }

  private async revealElement(element: WebElement): Promise<void> {
    const outside = await this.driver.executeScript<boolean>(
      `const rect = arguments[0].getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight`,
      element,
    );
    if (outside) {
      await this.scrollElementIntoView(element);
    }
  }

  private async scrollElementIntoView(element: WebElement): Promise<void> {
    await this.driver.executeScript(
      'arguments[0].scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })',
      element,
    );
  }

  async movePointer(
    input: { selector: string } | { x: number; y: number },
  ): Promise<void> {
    await this.preparePage();
    await this.noteHighlightAnimation();
    if ('selector' in input) {
      const element = await this.driver.findElement(By.css(input.selector));
      await this.runPointerAction(element, async () => {
        await this.driver
          .actions()
          .move({ origin: element, duration: 250 })
          .perform();
      });
      if (this.relayPageEvents) {
        await this.relayToContentScript({
          type: 'mousemove',
          selector: input.selector,
        });
      }
      await delay(actionPauseMs);
      return;
    }
    const inside = await this.driver.executeScript<boolean>(
      `return arguments[0] >= 0 && arguments[1] >= 0
        && arguments[0] < window.innerWidth
        && arguments[1] < window.innerHeight`,
      input.x,
      input.y,
    );
    if (!inside) {
      await this.pointAtViewport(input.x, input.y);
      if (this.relayPageEvents) {
        await this.relayToContentScript({ type: 'mouseleave' });
      } else {
        await this.driver.executeScript(
          `window.dispatchEvent(new MouseEvent('mouseleave', {
            bubbles: false,
            view: window,
          }))`,
        );
      }
      await delay(actionPauseMs);
      return;
    }
    await this.withPointerTravel(this.pointAtViewport(input.x, input.y), () =>
      this.driver
        .actions()
        .move({
          x: input.x,
          y: input.y,
          origin: Origin.VIEWPORT,
          duration: 250,
        })
        .perform(),
    );
    if (this.relayPageEvents) {
      await this.relayToContentScript({
        type: 'mousemove',
        x: input.x,
        y: input.y,
      });
    }
    await delay(actionPauseMs);
  }

  async pressKey(input: { key: string }): Promise<void> {
    await this.preparePage();
    const key = namedKeys[input.key] ?? input.key;
    await this.driver.actions().sendKeys(key).perform();
    if (this.relayPageEvents) {
      await this.relayToContentScript({ type: 'keydown', key: input.key });
    }
  }

  /**
   * Marionette action events reach the page but not extension content scripts
   * until the page itself is listening. Prime those listeners, then replay.
   */
  protected async relayToContentScript(
    event: {
      type: string;
      selector?: string;
      x?: number;
      y?: number;
      key?: string;
    },
    modifiers?: readonly ModifierKey[],
  ): Promise<void> {
    const pressed = new Set(modifiers ?? []);
    await this.driver.executeScript(
      `if (!window.__e2eRelayListeners) {
        window.__e2eRelayListeners = true;
        window.addEventListener('click', () => {}, true);
        window.addEventListener('mousemove', () => {}, true);
        window.addEventListener('mouseleave', () => {}, true);
        window.addEventListener('keydown', () => {}, true);
      }`,
    );
    if (event.type === 'keydown') {
      await this.driver.executeScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', {
          key: arguments[0],
          bubbles: true,
          cancelable: true,
        }))`,
        event.key ?? '',
      );
      return;
    }
    if (event.type === 'mouseleave') {
      await this.driver.executeScript(
        `window.dispatchEvent(new MouseEvent('mouseleave', {
          bubbles: false,
          view: window,
        }))`,
      );
      return;
    }
    if (event.selector) {
      await this.driver.executeScript(
        `const element = document.querySelector(arguments[0]);
        if (!element) throw new Error('relay target not found');
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(new MouseEvent(arguments[1], {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          ${pressed.has('shift') ? 'shiftKey: true,' : ''}
          ${pressed.has('ctrl') ? 'ctrlKey: true,' : ''}
          ${pressed.has('alt') ? 'altKey: true,' : ''}
          ${pressed.has('meta') ? 'metaKey: true,' : ''}
        }));`,
        event.selector,
        event.type,
      );
      return;
    }
    await this.driver.executeScript(
      `const element = document.elementFromPoint(arguments[0], arguments[1]) || document.body;
      element.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: arguments[0],
        clientY: arguments[1],
      }))`,
      event.x ?? 0,
      event.y ?? 0,
    );
  }

  async scrollBy(input: { x?: number; y?: number }): Promise<void> {
    await this.preparePage();
    await this.driver.executeAsyncScript(
      `const dx = arguments[0];
      const dy = arguments[1];
      const duration = arguments[2];
      const done = arguments[arguments.length - 1];
      const x0 = window.scrollX;
      const y0 = window.scrollY;
      const started = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - started) / duration);
        window.scrollTo(x0 + dx * t, y0 + dy * t);
        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }
        const pointer = window.__e2ePointer;
        if (pointer) {
          window.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: pointer.x,
            clientY: pointer.y,
          }));
        }
        done();
      };
      requestAnimationFrame(step);`,
      input.x ?? 0,
      input.y ?? 0,
      1000,
    );
  }

  async setOptionsHue(input: { value: number }): Promise<void> {
    await this.focusOptions();
    const slider = await this.driver.findElement(By.css('input[type="range"]'));
    const offset = await this.driver.executeScript<{ x: number; y: number }>(
      `const slider = arguments[0];
      const rect = slider.getBoundingClientRect();
      const min = Number(slider.min || 0);
      const max = Number(slider.max || 359);
      const ratio = (arguments[1] - min) / (max - min);
      return {
        x: rect.width * ratio - rect.width / 2,
        y: 0,
      };`,
      slider,
      input.value,
    );
    await this.clickWebElementAtOffset(slider, offset.x, offset.y);
  }

  async setOptionsClickBinding(input: {
    keys: readonly ModifierKey[];
    action: string;
  }): Promise<void> {
    await this.focusOptions();
    for (const key of input.keys) {
      const checkbox = await this.modifierCheckbox(key);
      if (!(await checkbox.isSelected())) {
        await this.clickWebElement(checkbox);
      }
    }
    const select = await this.driver.findElement(By.id('click-action'));
    const steps = await this.driver.executeScript<number>(
      `const select = arguments[0];
      const value = arguments[1];
      const target = [...select.options].findIndex((option) => option.value === value);
      if (target < 0) {
        throw new Error('click action option not found: ' + value);
      }
      return target - select.selectedIndex;`,
      select,
      input.action,
    );
    await this.clickWebElement(select);
    if (steps !== 0) {
      const arrow = steps > 0 ? Key.ARROW_DOWN : Key.ARROW_UP;
      for (let index = 0; index < Math.abs(steps); index += 1) {
        await delay(actionPauseMs);
        await this.driver.actions().sendKeys(arrow).perform();
      }
      await delay(actionPauseMs);
      await this.driver.actions().sendKeys(Key.ENTER).perform();
      await delay(actionPauseMs);
    }
  }

  async setSyncStorage(input: {
    values: Partial<StoredConfig>;
  }): Promise<void> {
    await this.probe(
      probeScript(`
        ext.storage.sync
          .set(arguments[0])
          .then(() => done(true))
          .catch((error) => done({ error: String(error) }));
      `),
      input.values,
    );
  }

  async readPageHash(): Promise<string> {
    await this.preparePage();
    return this.driver.executeScript('return location.hash');
  }

  async readPageUrl(): Promise<string> {
    await this.preparePage();
    return this.driver.getCurrentUrl();
  }

  async elementVisible(input: { selector: string }): Promise<boolean> {
    await this.preparePage();
    return this.driver.executeScript(
      `const element = document.querySelector(arguments[0]);
      if (!element) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden'`,
      input.selector,
    );
  }

  async elementCount(input: { selector: string }): Promise<number> {
    await this.preparePage();
    return this.driver.executeScript(
      'return document.querySelectorAll(arguments[0]).length',
      input.selector,
    );
  }

  async headingVisible(input: {
    name: string;
    level: number;
  }): Promise<boolean> {
    await this.rememberOptionsTab();
    const handles = [this.optionsHandle, this.fixtureHandle].filter(
      (handle): handle is string => handle != null,
    );
    const seen = new Set<string>();
    for (const handle of handles) {
      if (seen.has(handle)) {
        continue;
      }
      seen.add(handle);
      await this.switchToWindow(handle);
      if (handle === this.optionsHandle) {
        if (!(await this.enterOptionsFrame())) {
          continue;
        }
      }
      const visible = await this.driver.executeScript<boolean>(
        `const headings = [...document.querySelectorAll('h' + arguments[1])];
        return headings.some(
          (heading) => (heading.textContent || '').trim() === arguments[0],
        )`,
        input.name,
        input.level,
      );
      if (visible) {
        return true;
      }
    }
    return false;
  }

  async readSyncStorage<K extends ConfigKey>(input: {
    key: K;
  }): Promise<StoredConfig[K]> {
    return this.probe<StoredConfig[K]>(
      probeScript(`
        ext.storage.sync
          .get(arguments[0])
          .then((stored) => done(stored[arguments[0]] ?? null))
          .catch((error) => done({ error: String(error) }));
      `),
      input.key,
    );
  }

  async noteScenario(input: { id: string; title: string }): Promise<void> {
    this.scenarioId = input.id;
    this.scenarioNote = `${input.id}\n${input.title}`;
    await this.writeScenarioNote(this.scenarioNote);
  }

  async readClipboardText(): Promise<string> {
    const { stdout } = await execFileAsync('xclip', [
      '-o',
      '-selection',
      'clipboard',
    ]).catch(() => ({ stdout: '' }));
    const text =
      this.scenarioNote === '' ? stdout : `${this.scenarioNote}\n${stdout}`;
    await this.writeScenarioNote(text);
    return stdout;
  }

  /**
   * `#e2e-note` exists only on fixture pages. The tab title still carries
   * the scenario id when the document can be scripted.
   */
  private async writeScenarioNote(text: string): Promise<void> {
    await this.driver
      .executeScript(
        `const note = document.querySelector('#e2e-note');
        if (note) note.value = arguments[0];
        if (arguments[1]) document.title = arguments[1];`,
        text,
        this.scenarioId,
      )
      .catch(() => undefined);
  }

  async countTabs(): Promise<number> {
    return this.probe(
      probeScript(`
        ext.tabs
          .query({})
          .then((tabs) => done(tabs.length))
          .catch((error) => done({ error: String(error) }));
      `),
    );
  }

  async countWindows(): Promise<number> {
    return this.probe(
      probeScript(`
        ext.windows
          .getAll()
          .then((windows) => done(windows.length))
          .catch((error) => done({ error: String(error) }));
      `),
    );
  }

  async readNewestTabUrl(): Promise<string> {
    return this.probe(
      probeScript(`
        ext.tabs
          .query({})
          .then((tabs) => {
            const newest = tabs.reduce((best, tab) =>
              (tab.id ?? 0) > (best.id ?? 0) ? tab : best,
            );
            done(newest?.url ?? '');
          })
          .catch((error) => done({ error: String(error) }));
      `),
    );
  }

  async readNewestWindowUrl(): Promise<string> {
    return this.probe(
      probeScript(`
        ext.windows
          .getAll({ populate: true })
          .then((windows) => {
            const newest = windows.reduce((best, item) =>
              (item.id ?? 0) > (best.id ?? 0) ? item : best,
            );
            done(newest?.tabs?.[0]?.url ?? '');
          })
          .catch((error) => done({ error: String(error) }));
      `),
    );
  }

  async isOverlayVisible(): Promise<boolean> {
    const count = await this.overlayRootCount();
    return count > 0;
  }

  async overlayRootCount(): Promise<number> {
    await this.preparePage();
    return this.driver.executeScript(
      'return document.querySelectorAll(arguments[0]).length',
      OVERLAY,
    );
  }

  async overlayHighlightStroke(): Promise<string | null> {
    await this.preparePage();
    return this.driver.executeScript(highlightScript('stroke'));
  }

  async overlayHighlightBox(): Promise<DomBox | null> {
    await this.preparePage();
    return this.driver.executeScript(highlightScript('box'));
  }

  async overlayHighlightAnimating(): Promise<boolean> {
    await this.preparePage();
    return this.driver.executeScript(`
      const beganAt = window.__e2eHighlightBeganAt || 0;
      if (beganAt > 0 && performance.now() - beganAt < 3000) return true;
      const path = document.querySelector(${JSON.stringify(HIGHLIGHT)});
      const animation = path?.querySelector('animate');
      if (animation == null) return false;
      try {
        const start = animation.getStartTime();
        const now = animation.getCurrentTime();
        return now >= start && now - start < animation.getSimpleDuration();
      } catch {
        return false;
      }
    `);
  }

  /** The highlight SMIL animation lasts 150ms, shorter than a CI round trip. */
  private async noteHighlightAnimation(): Promise<void> {
    await this.driver.executeScript(`
      window.__e2eHighlightBeganAt = 0;
      if (window.__e2eHighlightWatch) return;
      window.__e2eHighlightWatch = true;
      document.addEventListener('beginEvent', (event) => {
        const target = event.target;
        if (target && target.localName === 'animate') {
          window.__e2eHighlightBeganAt = performance.now();
        }
      }, true);
      if (!window.__e2ePointerWatch) {
        window.__e2ePointerWatch = true;
        document.addEventListener('mousemove', (event) => {
          window.__e2ePointer = { x: event.clientX, y: event.clientY };
        }, true);
      }
    `);
  }

  async isOverlayHighlightVisible(): Promise<boolean> {
    const box = await this.overlayHighlightBox();
    return box != null;
  }

  async overlayHighlightMatchesHue(input: { hue: number }): Promise<boolean> {
    const stroke = await this.overlayHighlightStroke();
    if (stroke == null) {
      return false;
    }
    const actual = parseRgb(stroke);
    if (actual == null) {
      return false;
    }
    const expected = expectedHighlightRgb(input.hue);
    return expected.every(
      (channel, index) => Math.abs(channel - (actual[index] ?? 0)) <= 2,
    );
  }

  async readOverlayLabelText(): Promise<string | null> {
    await this.preparePage();
    return this.driver.executeScript(`
      const labels = [...document.querySelectorAll(${JSON.stringify(LABEL)})];
      for (const label of labels) {
        if (Number(getComputedStyle(label).opacity) === 0) continue;
        const text = label.querySelector('.text-fg')?.textContent ?? '';
        if (text) return text;
      }
      return null;
    `);
  }

  async elementBoundingBox(input: {
    selector: string;
  }): Promise<DomBox | null> {
    await this.preparePage();
    return this.driver.executeScript(
      `const element = document.querySelector(arguments[0]);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }`,
      input.selector,
    );
  }

  async readOptionsHue(): Promise<number> {
    await this.focusOptions();
    const value = await this.driver.executeScript<string>(
      "return document.querySelector('input[type=\"range\"]')?.value ?? ''",
    );
    return Number(value);
  }

  async readOptionsBindingListText(): Promise<string> {
    await this.focusOptions();
    return this.driver.executeScript(
      "return document.querySelector('ul')?.innerText ?? ''",
    );
  }

  async isOptionsPageOpen(): Promise<boolean> {
    await this.rememberOptionsTab();
    return this.optionsHandle != null;
  }

  async capturePng(path: string): Promise<void> {
    const png = await this.driver.takeScreenshot();
    writeFileSync(path, Buffer.from(png, 'base64'));
  }

  private async modifierCheckbox(key: ModifierKey): Promise<WebElement> {
    const checkbox = await this.driver.executeScript<WebElement | null>(
      `const labels = [...document.querySelectorAll('fieldset label')];
      const label = labels.find((entry) =>
        (entry.textContent || '').includes(arguments[0]),
      );
      return label?.querySelector('input[type="checkbox"]') ?? null`,
      key,
    );
    if (checkbox == null) {
      throw new Error(`modifier checkbox not found: ${key}`);
    }
    return checkbox;
  }
}

export function probeExpression(script: string, args: readonly unknown[]): string {
  return `new Promise((resolveProbe) => {
    const arguments = ${JSON.stringify(args)};
    arguments.push((value) => resolveProbe(JSON.stringify(value ?? null)));
    ${script}
  })`;
}

function highlightScript(mode: 'stroke' | 'box'): string {
  return `
    const path = document.querySelector(${JSON.stringify(HIGHLIGHT)});
    if (!path) return null;
    const style = getComputedStyle(path);
    if (${JSON.stringify(mode)} === 'stroke') return style.stroke || null;
    if (Number(style.opacity) === 0 || !path.getAttribute('d')) return null;
    const box = path.getBBox();
    const matrix = path.getScreenCTM();
    if (matrix == null) return null;
    const origin = new DOMPoint(box.x, box.y).matrixTransform(matrix);
    const corner = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix);
    return {
      x: origin.x,
      y: origin.y,
      width: corner.x - origin.x,
      height: corner.y - origin.y,
    };
  `;
}

export async function closeDriver(driver: WebDriver): Promise<void> {
  await Promise.race([driver.quit(), delay(10000)]);
}
