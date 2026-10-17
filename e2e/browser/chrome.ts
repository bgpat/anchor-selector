import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import {
  Browser,
  Builder,
  Key,
  type WebDriver,
  type WebElement,
} from 'selenium-webdriver';
import {
  Options as ChromeOptions,
  ServiceBuilder,
} from 'selenium-webdriver/chrome';
import type { ModifierKey } from '@/util/config';
import { capTimeoutSec, E2E_TIMEOUT_MS } from '../timeout';
import type { ExtensionIconButton } from '../automation/interface';
import { runAtspi } from './atspi-host';
import {
  EXTENSION_NAME,
  PageAutomation,
  pauseAfterOperation,
  clickAtScreen,
  closeDriver,
  configureDriver,
  delay,
  fitWindow,
  installProbePage,
  keepSingleTab,
  listAtspi,
  prepareTabs,
  probeExpression,
} from './common';

const execFileAsync = promisify(execFile);

async function activateChromeWindow(): Promise<void> {
  try {
    const { stdout } = await execFileAsync('xdotool', [
      'search',
      '--onlyvisible',
      '--classname',
      'google-chrome',
    ]);
    const windowId = stdout.trim().split('\n')[0];
    if (windowId !== '') {
      await execFileAsync('xdotool', ['windowactivate', windowId]);
      await delay(50);
    }
  } catch {
    // Best-effort: xdotool clicks still run if focus is already on Chrome.
  }
}

/** Survives for the browser session; set during pin/warmup before e2e steps run. */
let chromeToolbarButton: AtspiMatch | null = null;

type AtspiMatch = {
  name: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function atspi(command: {
  command: 'find' | 'click' | 'dump' | 'click-xy' | 'list';
  name?: string;
  role?: string;
  exact?: boolean;
  exclude?: string;
  timeout?: number;
  prefer?: 'top' | 'bottom';
  app?: string;
  button?: 'left' | 'middle' | 'right';
  x?: number;
  y?: number;
  pauseMs?: number;
  maxNodes?: number;
}): Promise<string> {
  return runAtspi([JSON.stringify(command)]);
}

async function atspiFind(input: {
  name: string;
  role?: string;
  exact?: boolean;
  exclude?: string;
  timeout?: number;
  prefer?: 'top' | 'bottom';
  app?: string;
  maxNodes?: number;
}): Promise<AtspiMatch | null> {
  try {
    const output = await atspi({
      command: 'find',
      app: input.app ?? 'chrom',
      name: input.name,
      role: input.role,
      exclude: input.exclude,
      prefer: input.prefer,
      timeout: input.timeout,
      exact: input.exact,
      maxNodes: input.maxNodes,
    });
    const parsed = JSON.parse(output) as { match: AtspiMatch };
    return parsed.match;
  } catch {
    return null;
  }
}

async function atspiClick(input: {
  name: string;
  role?: string;
  exact?: boolean;
  exclude?: string;
  button?: 'left' | 'middle' | 'right';
  timeout?: number;
  prefer?: 'top' | 'bottom';
  app?: string;
}): Promise<void> {
  await atspi({
    command: 'click',
    app: input.app ?? 'chrom',
    name: input.name,
    role: input.role,
    exclude: input.exclude,
    button: input.button,
    prefer: input.prefer,
    timeout: input.timeout,
    exact: input.exact,
    pauseMs: 0,
  });
  await pauseAfterOperation();
}

async function atspiDump(): Promise<string> {
  return atspi({ command: 'dump', app: 'chrom' }).catch((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  );
}

export class ChromeAutomation extends PageAutomation {
  private toolbarButtonCache: AtspiMatch | null = null;

  protected override browserAtspiApp(): string {
    return 'chrom';
  }

  protected override addressBarEntryNames(): readonly string[] {
    return ['Address and search bar'];
  }

  protected override async clickAddressBar(): Promise<void> {
    try {
      await atspiClick({
        name: 'Address and search bar',
        role: 'combo box',
        exact: false,
        timeout: 3,
      });
    } catch {
      await super.clickAddressBar();
    }
  }

  constructor(
    driver: WebDriver,
    fixtureHandle: string,
    probeHandle: string,
    probeUrl: string,
    fixtureOrigin: string,
    private readonly extensionId: string,
  ) {
    super(
      driver,
      fixtureHandle,
      probeHandle,
      probeUrl,
      fixtureOrigin,
      'chrome://version',
    );
  }

  protected override async switchToWindow(handle: string): Promise<void> {
    if (this.activeWebDriverWindow === handle) {
      return;
    }
    await this.driver.switchTo().window(handle);
    this.markActiveWindow(handle);
    await pauseAfterOperation();
  }

  async clickExtensionIcon(input: {
    button: ExtensionIconButton;
  }): Promise<void> {
    const button =
      input.button === 'right'
        ? 'right'
        : input.button === 'middle'
          ? 'middle'
          : 'left';
    const cached = chromeToolbarButton ?? this.toolbarButtonCache;
    if (button === 'left' && cached != null) {
      const x = Math.round(cached.x + cached.width / 2);
      const y = Math.round(cached.y + cached.height / 2);
      await activateChromeWindow();
      await clickAtScreen(x, y, 'left', { pause: false });
      await pauseAfterOperation('extension.icon.click');
      return;
    }
    await this.switchToWindow(this.fixtureHandle);
    let match = cached;
    if (match == null) {
      match = await this.locateToolbarExtensionButton(capTimeoutSec(5));
    }
    if (match == null) {
      const dump = await atspiDump();
      throw new Error(
        `${EXTENSION_NAME} toolbar button was not found\n${dump.slice(0, 2000)}`,
      );
    }
    const x = Math.round(match.x + match.width / 2);
    const y = Math.round(match.y + match.height / 2);
    if (button === 'left') {
      await activateChromeWindow();
      await clickAtScreen(x, y, 'left', { pause: false });
      await pauseAfterOperation('extension.icon.click');
      return;
    }
    await clickAtScreen(x, y, button);
  }

  async setExtensionEnabled(input: { enabled: boolean }): Promise<void> {
    if ((await this.readExtensionEnabled()) === input.enabled) {
      return;
    }
    const result = await this.probe<null | { error: string }>(
      `const done = arguments[arguments.length - 1];
      const id = arguments[0];
      const enabled = arguments[1];
      const ext = globalThis.chrome;
      ext.management.setEnabled(id, enabled, () => {
        const err = ext.runtime?.lastError;
        if (err) {
          done({ error: String(err.message ?? err) });
          return;
        }
        done(null);
      });`,
      this.extensionId,
      input.enabled,
    );
    if (result != null && typeof result === 'object' && 'error' in result) {
      throw new Error(result.error);
    }
    if (input.enabled) {
      await this.reopenProbe();
      const fixtureUrl = await this.driver.getCurrentUrl();
      await this.probe<void>(
        `const done = arguments[arguments.length - 1];
        const url = arguments[0];
        const ext = globalThis.chrome;
        ext.tabs.query({}).then((tabs) => {
          const tab = tabs.find((item) => item.url === url);
          if (!tab || tab.id == null) {
            done({ error: 'fixture tab was not found' });
            return;
          }
          return ext.tabs.reload(tab.id).then(
            () => done(null),
            (error) => done({ error: String(error) }),
          );
        }).catch((error) => done({ error: String(error) }));`,
        fixtureUrl,
      );
      await this.waitForReady();
      if (chromeToolbarButton == null) {
        await this.locateToolbarExtensionButton(capTimeoutSec(3));
      }
    } else {
      chromeToolbarButton = null;
      this.toolbarButtonCache = null;
    }
    await pauseAfterOperation('extension.setEnabled');
  }

  protected override async reopenProbe(): Promise<void> {
    const handles = await this.driver.getAllWindowHandles();
    if (!handles.includes(this.probeHandle)) {
      this.probeHandle = await this.openBrowserTab();
    }
    const targets = await this.pageTargets();
    let probeTarget = targets.find((item) => item.id === this.probeHandle);
    if (probeTarget?.webSocketDebuggerUrl == null) {
      probeTarget = targets.find(
        (item) =>
          item.url.includes('e2e-probe.html') &&
          item.webSocketDebuggerUrl != null,
      );
      if (probeTarget != null) {
        this.probeHandle = probeTarget.id;
      }
    }
    if (probeTarget?.webSocketDebuggerUrl != null) {
      await evaluateOnTarget(
        probeTarget.webSocketDebuggerUrl,
        `location.replace(${JSON.stringify(this.probeUrl)})`,
      );
    } else {
      await this.driver.switchTo().window(this.probeHandle);
      await this.driver.get(this.probeUrl);
    }
    await this.driver.switchTo().window(this.fixtureHandle);
    this.markActiveWindow(this.fixtureHandle);
    await pauseAfterOperation('reopenProbe');
  }

  override async pressKey(input: { key: string }): Promise<void> {
    await this.preparePage();
    const url = await this.driver.getCurrentUrl();
    const socket = await this.pageSocket(url);
    const code = input.key === 'Escape' ? 27 : 0;
    for (const type of ['keyDown', 'keyUp']) {
      await cdpCommand(socket, 'Input.dispatchKeyEvent', {
        type,
        key: input.key,
        code: input.key,
        windowsVirtualKeyCode: code,
        nativeVirtualKeyCode: code,
      });
    }
  }

  async openExtensionOptions(): Promise<void> {
    await this.withExtensionsPageInNewTab(async () => {
      const details = await this.extensionControl('#detailsButton');
      await this.clickWebElement(details);
      await this.waitFor(async () => {
        await this.rememberOptionsTab().catch(() => undefined);
        if (this.optionsHandle != null) {
          return true;
        }
        const options = await this.deepElementByText('Extension options');
        if (options == null) {
          return false;
        }
        await this.driver.executeScript(
          'arguments[0].scrollIntoView({block: "center"})',
          options,
        );
        await this.clickWebElement(options);
        await pauseAfterOperation('extension.options.link');
        return false;
      }, 'options page did not open from chrome://extensions', E2E_TIMEOUT_MS);
    });
    await pauseAfterOperation('extension.options.open');
  }

  async readExtensionBadgeText(): Promise<string> {
    try {
      await this.preparePage();
      const url = await this.driver.getCurrentUrl();
      return await this.probe<string>(
        `const done = arguments[arguments.length - 1];
        const url = arguments[0];
        const ext = globalThis.browser?.tabs ? globalThis.browser : globalThis.chrome;
        ext.tabs.query({}).then((tabs) => {
          const match = tabs.find((tab) => tab.url === url);
          if (!match) {
            done('');
            return;
          }
          return ext.action.getBadgeText({ tabId: match.id }).then(
            (text) => done(text || ''),
            (error) => done({ error: String(error) }),
          );
        }).catch((error) => done({ error: String(error) }));`,
        url,
      );
    } catch {
      return '';
    }
  }

  override async headingVisible(input: {
    name: string;
    level: number;
  }): Promise<boolean> {
    try {
      const visible = await this.optionsPageEvaluate<boolean>(
        `[...document.querySelectorAll('h' + ${input.level})].some(
          (heading) => (heading.textContent || '').trim() === ${JSON.stringify(input.name)},
        )`,
      );
      if (visible) {
        return true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('options page target was not found')) {
        throw error;
      }
    }
    return super.headingVisible(input);
  }

  override async readOptionsHue(): Promise<number> {
    const value = await this.optionsPageEvaluate<string>(
      "document.querySelector('input[type=\"range\"]')?.value ?? ''",
    );
    return Number(value);
  }

  override async readOptionsBindingListText(): Promise<string> {
    return this.optionsPageEvaluate<string>(
      "document.querySelector('ul')?.innerText ?? ''",
    );
  }

  protected override async focusOptions(): Promise<void> {
    await this.rememberOptionsTab();
    if (this.optionsHandle == null) {
      await this.openExtensionOptions();
      await this.rememberOptionsTab();
    }
    if (this.optionsHandle == null) {
      throw new Error('Options page is not open');
    }
    await this.driver.switchTo().window(this.optionsHandle);
    await this.waitFor(async () => {
      try {
        return await this.optionsPageEvaluate<boolean>(
          `document.querySelector('h1')?.textContent === ${JSON.stringify(EXTENSION_NAME)}`,
        );
      } catch {
        return false;
      }
    }, 'options page did not render', E2E_TIMEOUT_MS);
    await pauseAfterOperation('focusOptions');
  }

  override async setOptionsHue(input: { value: number }): Promise<void> {
    await this.focusOptions();
    await this.optionsPageEvaluate<void>(
      `(() => {
        const slider = document.querySelector('input[type="range"]');
        if (!slider) throw new Error('hue slider missing');
        const target = String(${input.value});
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        if (setter) setter.call(slider, target);
        else slider.value = target;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      })()`,
    );
    await this.waitFor(
      async () => (await this.readOptionsHue()) === input.value,
      'options hue slider did not reach target value',
      E2E_TIMEOUT_MS,
    );
    await pauseAfterOperation('options.hue.set');
  }

  override async setOptionsClickBinding(input: {
    keys: readonly ModifierKey[];
    action: string;
  }): Promise<void> {
    await this.focusOptions();
    for (const key of input.keys) {
      await this.optionsPageEvaluate<void>(
        `(() => {
          const labels = [...document.querySelectorAll('fieldset label')];
          const label = labels.find((entry) =>
            (entry.textContent || '').includes(${JSON.stringify(key)}),
          );
          const checkbox = label?.querySelector('input[type="checkbox"]');
          if (!checkbox) {
            throw new Error('modifier checkbox not found: ${key}');
          }
          if (!checkbox.checked) {
            checkbox.click();
          }
        })()`,
      );
      await this.waitFor(
        async () =>
          this.optionsPageEvaluate<boolean>(
            `(() => {
              const labels = [...document.querySelectorAll('fieldset label')];
              const label = labels.find((entry) =>
                (entry.textContent || '').includes(${JSON.stringify(key)}),
              );
              return label?.querySelector('input[type="checkbox"]')?.checked === true;
            })()`,
          ),
        `modifier checkbox did not select: ${key}`,
        E2E_TIMEOUT_MS,
      );
      await pauseAfterOperation(`options.modifier.${key}`);
    }
    await this.optionsPageEvaluate<void>(
      `(() => {
        const select = document.getElementById('click-action');
        if (!select) throw new Error('click-action missing');
        select.value = ${JSON.stringify(input.action)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`,
    );
    await pauseAfterOperation('options.clickBinding.set');
  }

  async readExtensionEnabled(): Promise<boolean> {
    try {
      return await this.probe<boolean>(
        `const done = arguments[arguments.length - 1];
        const ext = globalThis.browser?.management
          ? globalThis.browser
          : globalThis.chrome;
        ext.management.getSelf()
          .then((self) => done(self.enabled !== false))
          .catch((error) => done({ error: String(error) }));`,
      );
    } catch {
      return false;
    }
  }

  async pinActionButton(): Promise<void> {
    if ((await this.toolbarExtensionButton(1)) != null) {
      return;
    }
    await this.driver
      .actions()
      .sendKeys(Key.ESCAPE)
      .perform()
      .catch(() => undefined);
    await delay(200);
    try {
      await atspiClick({
        name: 'Extensions',
        role: 'push button',
        exact: true,
        timeout: 5,
      });
      await delay(400);
      await atspiClick({
        name: `See more options for ${EXTENSION_NAME}`,
        exact: true,
        timeout: 2,
      }).catch(() => undefined);
      await delay(300);
      await atspiClick({
        name: 'Pin',
        exclude: 'Unpin',
        prefer: 'top',
        timeout: 3,
      });
      await this.driver.actions().sendKeys(Key.ESCAPE).perform();
      await delay(200);
      // The extensions menu can stay open and report the pinned icon at 0x0.
      if ((await this.toolbarExtensionButton(1)) == null) {
        await atspiClick({
          name: 'Extensions',
          role: 'push button',
          exact: true,
          timeout: 2,
        }).catch(() => undefined);
        await delay(300);
      }
    } catch (error) {
      const dump = await atspiDump();
      writeFileSync('test-results/chrome/atspi-dump.txt', dump);
      const message = error instanceof Error ? error.message : String(error);
      const buttons = dump
        .split('\n')
        .filter((line) => /push button|toggle button|menu item/.test(line))
        .filter((line) => !line.includes(' 0x0'))
        .slice(0, 80)
        .join('\n');
      throw new Error(
        `Could not pin ${EXTENSION_NAME}\n${message}\n${buttons}`,
      );
    }
    if ((await this.locateToolbarExtensionButton(30)) == null) {
      const dump = await atspiDump();
      writeFileSync('test-results/chrome/atspi-dump.txt', dump);
      throw new Error(`Pinned ${EXTENSION_NAME} button was not found`);
    }
  }

  private async debuggerAddress(): Promise<string> {
    const capabilities = await this.driver.getCapabilities();
    const chromeOptions = capabilities.get('goog:chromeOptions') as
      { debuggerAddress?: string } | undefined;
    const address = chromeOptions?.debuggerAddress;
    if (address == null || address === '') {
      throw new Error('Chrome debugger address is missing');
    }
    return address;
  }

  private async pageTargets(): Promise<
    {
      id: string;
      type: string;
      title: string;
      url: string;
      webSocketDebuggerUrl?: string;
    }[]
  > {
    const response = await fetch(
      `http://${await this.debuggerAddress()}/json/list`,
    );
    return (await response.json()) as {
      id: string;
      type: string;
      title: string;
      url: string;
      webSocketDebuggerUrl?: string;
    }[];
  }

  protected override async findOptionsHandle(): Promise<string | null> {
    for (const handle of await this.driver.getAllWindowHandles()) {
      await this.driver.switchTo().window(handle);
      const url = await this.driver.getCurrentUrl();
      if (this.isOptionsUrl(url)) {
        return handle;
      }
    }
    return null;
  }

  private async chromeTabBox(
    handle: string,
  ): Promise<{ x: number; y: number; width: number; height: number }> {
    const target = (await this.pageTargets()).find((item) => item.id === handle);
    if (target?.webSocketDebuggerUrl == null) {
      throw new Error(`Chrome tab was not found: ${handle}`);
    }
    const tabs = [
      ...(await listAtspi({ app: 'chrom', role: 'page tab' })),
      ...(await listAtspi({ app: 'chrom', role: 'tab' })),
    ];
    const titled = tabs.filter(
      (tab) => tab.name === target.title || tab.name.startsWith(`${target.title} -`),
    );
    if (titled.length === 1 && target.title !== '') {
      return titled[0];
    }
    const label = `e2e-tab-${handle.slice(-8)}`;
    await evaluateOnTarget(
      target.webSocketDebuggerUrl,
      `document.title = ${JSON.stringify(label)}`,
    );
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const labeled = [
        ...(await listAtspi({ app: 'chrom', role: 'page tab', name: label })),
        ...(await listAtspi({ app: 'chrom', role: 'tab', name: label })),
      ];
      const match = labeled.find((tab) => tab.name.includes(label));
      if (match != null) {
        return match;
      }
      await delay(100);
    }
    throw new Error(`Chrome tab ${label} was not on the tab strip`);
  }

  protected override async clickTab(handle: string): Promise<void> {
    const box = await this.chromeTabBox(handle);
    await clickAtScreen(box.x + box.width / 2, box.y + box.height / 2);
  }

  protected override async openTabByMouse(): Promise<void> {
    const rect = await this.windowRect();
    const names = ['New Tab', 'New tab'];
    for (const name of names) {
      const buttons = await listAtspi({
        app: 'chrom',
        role: 'push button',
        name,
        exact: true,
      });
      const button = buttons.find(
        (item) => item.y >= rect.y && item.y < rect.y + 160,
      );
      if (button == null) {
        continue;
      }
      await atspi({
        command: 'click',
        app: 'chrom',
        role: 'push button',
        name,
        exact: true,
        x: Math.round(button.x + button.width / 2),
        y: Math.round(button.y + button.height / 2),
      });
      return;
    }
    throw new Error('Chrome new-tab button was not found');
  }

  protected override async closeTabByMouse(handle: string): Promise<void> {
    const box = await this.chromeTabBox(handle);
    const closes = await listAtspi({
      app: 'chrom',
      role: 'push button',
      name: 'Close',
      exact: true,
    });
    const close = closes.find((item) => {
      const x = item.x + item.width / 2;
      const y = item.y + item.height / 2;
      return (
        x >= box.x &&
        x <= box.x + box.width &&
        y >= box.y &&
        y <= box.y + box.height
      );
    });
    if (close != null) {
      await clickAtScreen(close.x + close.width / 2, close.y + close.height / 2);
      return;
    }
    await clickAtScreen(box.x + box.width / 2, box.y + box.height / 2, 'middle');
  }

  private async pageSocket(url: string): Promise<string> {
    const target = (await this.pageTargets()).find(
      (item) => item.url === url && item.webSocketDebuggerUrl != null,
    );
    if (target?.webSocketDebuggerUrl == null) {
      throw new Error(`page target was not found: ${url}`);
    }
    return target.webSocketDebuggerUrl;
  }

  private async optionsPageEvaluate<T>(expression: string): Promise<T> {
    const target = (await this.pageTargets()).find(
      (item) =>
        item.url.includes('options.html') && item.webSocketDebuggerUrl != null,
    );
    if (target?.webSocketDebuggerUrl == null) {
      throw new Error('options page target was not found');
    }
    return evaluateOnTarget<T>(target.webSocketDebuggerUrl, expression);
  }

  private toolbarButtonInChromeBar(
    match: AtspiMatch,
    rect: { y: number },
  ): boolean {
    return (
      match.y >= rect.y &&
      match.y < rect.y + 160 &&
      !match.name.includes('See more options') &&
      !match.name.includes('Ask on every visit') &&
      !match.name.includes('is pinned')
    );
  }

  /** Slow AT-SPI lookup; run during launch, not inside a 10s e2e step. */
  private async locateToolbarExtensionButton(
    timeout: number,
  ): Promise<AtspiMatch | null> {
    const rect = await this.windowRect();
    const names = ['jump to the anchored element', EXTENSION_NAME];
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      for (const name of names) {
        const match = await atspiFind({
          name,
          role: 'push button',
          prefer: 'top',
          timeout: 0,
          maxNodes: 800,
        });
        if (match != null && this.toolbarButtonInChromeBar(match, rect)) {
          this.toolbarButtonCache = match;
          chromeToolbarButton = match;
          return match;
        }
      }
      await delay(200);
    }
    return null;
  }

  private async toolbarExtensionButton(
    timeout: number,
  ): Promise<AtspiMatch | null> {
    if (this.toolbarButtonCache != null) {
      return this.toolbarButtonCache;
    }
    return this.locateToolbarExtensionButton(timeout);
  }

  private async withExtensionsPage<T>(action: () => Promise<T>): Promise<T> {
    await this.driver.switchTo().window(this.fixtureHandle);
    const returnUrl = await this.driver.getCurrentUrl();
    try {
      await this.driver.get('chrome://extensions');
      await this.waitFor(
        async () => (await this.extensionItem()) != null,
        'chrome://extensions did not list the extension',
      );
      return await action();
    } finally {
      try {
        await this.driver.switchTo().window(this.fixtureHandle);
        const current = await this.driver.getCurrentUrl();
        if (current.startsWith('chrome://')) {
          await this.driver.get(returnUrl);
          await this.waitFor(
            async () =>
              (await this.driver.executeScript('return document.readyState')) ===
              'complete',
            'document did not finish loading',
          );
        }
      } catch {
        await this.activateOpenWindow();
      }
      await this.rememberOptionsTab();
      try {
        await this.driver.switchTo().window(this.fixtureHandle);
      } catch {
        await this.activateOpenWindow();
      }
      await pauseAfterOperation('extension.extensionsPage');
    }
  }

  /** Options flow opens another tab; keep the fixture on the test page. */
  private async withExtensionsPageInNewTab<T>(
    action: () => Promise<T>,
  ): Promise<T> {
    await this.driver.switchTo().window(this.fixtureHandle);
    const extensionsHandle = await this.openBrowserTab();
    try {
      await this.driver.switchTo().window(extensionsHandle);
      await this.driver.get('chrome://extensions');
      await this.waitFor(
        async () => (await this.extensionItem()) != null,
        'chrome://extensions did not list the extension',
      );
      return await action();
    } finally {
      const handles = await this.driver.getAllWindowHandles();
      if (handles.includes(extensionsHandle)) {
        const target = (await this.pageTargets()).find(
          (item) => item.id === extensionsHandle,
        );
        if (target != null && !this.isOptionsUrl(target.url)) {
          await this.driver.switchTo().window(extensionsHandle);
          await this.driver.close();
        }
      }
      await this.activateOpenWindow();
      await this.rememberOptionsTab();
      await this.driver.switchTo().window(this.fixtureHandle);
      await pauseAfterOperation('extension.extensionsPage');
    }
  }

  private async extensionToggle(): Promise<WebElement> {
    return this.extensionControl('#enableToggle');
  }

  private async extensionControl(selector: string): Promise<WebElement> {
    const element = await this.driver.executeScript<WebElement | null>(
      `const extensionId = arguments[0];
      const selector = arguments[1];
      function visit(node) {
        for (const item of node.querySelectorAll?.('extensions-item') ?? []) {
          if (item.id === extensionId && item.shadowRoot) {
            return item.shadowRoot.querySelector(selector);
          }
        }
        for (const element of node.querySelectorAll?.('*') ?? []) {
          if (!element.shadowRoot) continue;
          const found = visit(element.shadowRoot);
          if (found) return found;
        }
        return null;
      }
      return visit(document)`,
      this.extensionId,
      selector,
    );
    if (element == null) {
      throw new Error(`chrome://extensions control not found: ${selector}`);
    }
    return element;
  }

  private async extensionItem(): Promise<WebElement | null> {
    return this.driver
      .executeScript<WebElement | null>(
        `const extensionId = arguments[0];
        function visit(node) {
          for (const item of node.querySelectorAll?.('extensions-item') ?? []) {
            if (item.id === extensionId) return item;
          }
          for (const element of node.querySelectorAll?.('*') ?? []) {
            if (!element.shadowRoot) continue;
            const found = visit(element.shadowRoot);
            if (found) return found;
          }
          return null;
        }
        return visit(document)`,
        this.extensionId,
      )
      .catch(() => null);
  }

  private async deepElementByText(text: string): Promise<WebElement | null> {
    return this.driver.executeScript<WebElement | null>(
      `const text = arguments[0];
      function visit(node) {
        for (const element of node.querySelectorAll?.('*') ?? []) {
          if (element.shadowRoot) {
            const inner = visit(element.shadowRoot);
            if (inner) return inner;
          }
          const label = (element.innerText || element.textContent || '').trim();
          if (label === text) return element;
        }
        return null;
      }
      return visit(document)`,
      text,
    );
  }

  protected override async evaluateProbe<T>(
    script: string,
    ...args: unknown[]
  ): Promise<T> {
    const target = (await this.pageTargets()).find(
      (item) =>
        item.url.includes('e2e-probe.html') && item.webSocketDebuggerUrl != null,
    );
    if (target?.webSocketDebuggerUrl == null) {
      throw new Error('probe target was not found');
    }
    const encoded = await evaluateOnTarget<string>(
      target.webSocketDebuggerUrl,
      probeExpression(script, args),
      true,
    );
    if (typeof encoded !== 'string') {
      throw new Error('probe script did not return JSON');
    }
    return JSON.parse(encoded) as T;
  }
}

function cdpCommand(
  webSocketUrl: string,
  method: string,
  params: object,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`CDP ${method} timed out`));
    }, E2E_TIMEOUT_MS);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method, params }));
    });
    socket.addEventListener('message', (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        error?: { message?: string };
      };
      if (message.id !== 1) {
        return;
      }
      clearTimeout(timer);
      socket.close();
      if (message.error) {
        reject(new Error(message.error.message || `CDP ${method} failed`));
        return;
      }
      resolve();
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`CDP ${method} websocket failed`));
    });
  });
}

function evaluateOnTarget<T>(
  webSocketUrl: string,
  expression: string,
  awaitPromise = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('CDP evaluate timed out'));
    }, E2E_TIMEOUT_MS);
    const finish = (error: Error | null, value?: T) => {
      clearTimeout(timer);
      socket.close();
      if (error) {
        reject(error);
        return;
      }
      resolve(value as T);
    };
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression,
            awaitPromise,
            returnByValue: true,
          },
        }),
      );
    });
    socket.addEventListener('message', (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: {
          result?: { value?: T };
          exceptionDetails?: {
            text?: string;
            exception?: { description?: string };
          };
        };
      };
      if (message.id !== 1) {
        return;
      }
      const details = message.result?.exceptionDetails;
      if (details) {
        finish(
          new Error(
            details.exception?.description ||
              details.text ||
              'CDP evaluate failed',
          ),
        );
        return;
      }
      finish(null, message.result?.result?.value);
    });
    socket.addEventListener('error', () => {
      finish(new Error('CDP websocket failed'));
    });
  });
}

async function installWebExtension(
  driver: WebDriver,
  extensionDir: string,
): Promise<string> {
  const installed = await (
    driver as WebDriver & {
      installWebExtension(extension: string): Promise<{ id: string }>;
    }
  ).installWebExtension(extensionDir);
  return installed.id;
}

export async function launchChrome(input: {
  extensionDir: string;
  fixtureOrigin: string;
}): Promise<{ automation: ChromeAutomation; close: () => Promise<void> }> {
  installProbePage(input.extensionDir);
  process.env.ACCESSIBILITY_ENABLED = '1';
  process.env.LANG = 'en_US.UTF-8';
  process.env.LANGUAGE = 'en_US.UTF-8';

  const options = new ChromeOptions();
  options.enableBidi();
  options.setChromeBinaryPath('/usr/bin/google-chrome');
  options.addArguments(
    '--enable-unsafe-extension-debugging',
    '--force-renderer-accessibility',
    '--lang=en-US',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--disable-dev-shm-usage',
    '--disable-search-engine-choice-screen',
    '--no-sandbox',
    '--window-size=960,600',
  );

  const driver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .setChromeService(
      new ServiceBuilder('/usr/local/share/chromedriver-linux64/chromedriver'),
    )
    .build();
  try {
    await configureDriver(driver);
    await fitWindow(driver);
    await keepSingleTab(driver);
    const extensionId = await installWebExtension(driver, input.extensionDir);
    await driver.get('about:blank');
    const probeUrl = `chrome-extension://${extensionId}/e2e-probe.html`;
    const tabs = await prepareTabs(driver, probeUrl);
    const automation = new ChromeAutomation(
      driver,
      tabs.fixtureHandle,
      tabs.probeHandle,
      probeUrl,
      input.fixtureOrigin,
      extensionId,
    );
    await automation.pinActionButton();
    if (chromeToolbarButton == null) {
      throw new Error(`${EXTENSION_NAME} toolbar button was not cached for e2e`);
    }
    return {
      automation,
      close: () => {
        chromeToolbarButton = null;
        return closeDriver(driver);
      },
    };
  } catch (error) {
    await closeDriver(driver);
    throw error;
  }
}
