import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { resolveBrowser } from './selenium-manager';
import type { ModifierKey } from '@/util/config';
import type { ExtensionIconButton } from '../automation/interface';
import {
  EXTENSION_NAME,
  PageAutomation,
  closeDriver,
  configureDriver,
  delay,
  fitWindow,
  installProbePage,
  keepSingleTab,
  prepareTabs,
} from './common';

const atspiScript = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'atspi.py',
);

type AtspiMatch = {
  name: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function pythonBin(): string {
  if (process.env.E2E_PYTHON) {
    return process.env.E2E_PYTHON;
  }
  if (existsSync('/usr/bin/python3')) {
    return '/usr/bin/python3';
  }
  return 'python3';
}

async function atspi(args: string[]): Promise<string> {
  const proc = spawn(pythonBin(), [atspiScript, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const code = await new Promise<number>((resolveCode, reject) => {
    proc.once('error', reject);
    proc.once('close', (status) => resolveCode(status ?? 1));
  });
  const out = Buffer.concat(stdout).toString('utf8').trim();
  const err = Buffer.concat(stderr).toString('utf8').trim();
  if (code !== 0) {
    throw new Error(err || out || `atspi.py exited ${code}`);
  }
  return out;
}

async function atspiFind(input: {
  name: string;
  role?: string;
  exact?: boolean;
  exclude?: string;
  timeout?: number;
  prefer?: 'top' | 'bottom';
  app?: string;
}): Promise<AtspiMatch | null> {
  try {
    const output = await atspi([
      'find',
      '--app',
      input.app ?? 'testing',
      '--name',
      input.name,
      '--role',
      input.role ?? '',
      '--exclude',
      input.exclude ?? '',
      '--prefer',
      input.prefer ?? 'top',
      '--timeout',
      String(input.timeout ?? 3),
      ...(input.exact ? ['--exact'] : []),
    ]);
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
  await atspi([
    'click',
    '--app',
    input.app ?? 'testing',
    '--name',
    input.name,
    '--role',
    input.role ?? '',
    '--exclude',
    input.exclude ?? '',
    '--button',
    input.button ?? 'left',
    '--prefer',
    input.prefer ?? 'top',
    '--timeout',
    String(input.timeout ?? 3),
    ...(input.exact ? ['--exact'] : []),
  ]);
}

async function atspiDump(): Promise<string> {
  return atspi(['dump', '--app', 'testing']).catch((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  );
}

export class ChromeAutomation extends PageAutomation {
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

  async clickExtensionIcon(input: {
    button: ExtensionIconButton;
  }): Promise<void> {
    await this.preparePage();
    const button =
      input.button === 'right'
        ? 'right'
        : input.button === 'middle'
          ? 'middle'
          : 'left';
    const match = await this.toolbarExtensionButton(5);
    if (match == null) {
      const dump = await atspiDump();
      throw new Error(
        `${EXTENSION_NAME} toolbar button was not found\n${dump.slice(0, 2000)}`,
      );
    }
    const x = Math.round(match.x + match.width / 2);
    const y = Math.round(match.y + match.height / 2);
    await atspi([
      'click-xy',
      '--x',
      String(x),
      '--y',
      String(y),
      '--button',
      button,
    ]);
  }

  async setExtensionEnabled(input: { enabled: boolean }): Promise<void> {
    if ((await this.readExtensionEnabled()) === input.enabled) {
      return;
    }
    await this.withExtensionsPage(async () => {
      const toggle = await this.extensionToggle();
      await this.driver.actions().click(toggle).perform();
    });
    if (input.enabled) {
      await this.reopenProbe();
    }
  }

  async openExtensionOptions(): Promise<void> {
    await this.withExtensionsPage(async () => {
      const details = await this.extensionControl('#detailsButton');
      await this.driver.actions().click(details).perform();
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
        await this.driver.actions().click(options).perform();
        await delay(400);
        return false;
      }, 'options page did not open from chrome://extensions');
    });
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

  override async setOptionsHue(input: { value: number }): Promise<void> {
    await this.optionsPageEvaluate(
      `const slider = document.querySelector('input[type="range"]');
      if (!slider) throw new Error('hue slider not found');
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set;
      setter.call(slider, ${JSON.stringify(String(input.value))});
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));`,
    );
  }

  override async setOptionsClickBinding(input: {
    keys: readonly ModifierKey[];
    action: string;
  }): Promise<void> {
    await this.optionsPageEvaluate(
      `const keys = ${JSON.stringify(input.keys)};
      for (const key of keys) {
        const labels = [...document.querySelectorAll('fieldset label')];
        const label = labels.find((entry) =>
          (entry.textContent || '').includes(key),
        );
        const checkbox = label?.querySelector('input[type="checkbox"]');
        if (!checkbox) throw new Error('modifier checkbox not found: ' + key);
        if (!checkbox.checked) checkbox.click();
      }
      const select = document.getElementById('click-action');
      if (!select) throw new Error('click action select not found');
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value',
      ).set;
      setter.call(select, ${JSON.stringify(input.action)});
      select.dispatchEvent(new Event('change', { bubbles: true }));`,
    );
  }

  override async resetOptionsToDefaults(): Promise<void> {
    await this.optionsPageEvaluate(
      `const buttons = [...document.querySelectorAll('button')];
      const button = buttons.find((entry) =>
        /reset|default/i.test(entry.textContent || ''),
      );
      if (!button) throw new Error('options reset control is not available');
      button.click();`,
    );
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
        name: 'Extensions menu',
        role: 'push button',
        exact: true,
        timeout: 5,
      });
      await delay(400);
      await atspiClick({
        name: `See more options for ${EXTENSION_NAME}`,
        exact: true,
        timeout: 3,
      });
      await delay(300);
      await atspiClick({
        name: 'Pin',
        exclude: 'Unpin',
        prefer: 'top',
        timeout: 3,
      });
      await this.driver.actions().sendKeys(Key.ESCAPE).perform();
      await delay(200);
    } catch (error) {
      const dump = await atspiDump();
      writeFileSync('e2e-results/chrome/atspi-dump.txt', dump);
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
    if ((await this.toolbarExtensionButton(3)) == null) {
      const dump = await atspiDump();
      writeFileSync('e2e-results/chrome/atspi-dump.txt', dump);
      throw new Error(`Pinned ${EXTENSION_NAME} button was not found`);
    }
  }

  private async optionsPageEvaluate<T>(expression: string): Promise<T> {
    const capabilities = await this.driver.getCapabilities();
    const chromeOptions = capabilities.get('goog:chromeOptions') as
      { debuggerAddress?: string } | undefined;
    const address = chromeOptions?.debuggerAddress;
    if (address == null || address === '') {
      throw new Error('Chrome debugger address is missing');
    }
    const response = await fetch(`http://${address}/json/list`);
    const targets = (await response.json()) as {
      type: string;
      url: string;
      webSocketDebuggerUrl?: string;
    }[];
    const target = targets.find(
      (item) =>
        item.url.includes('options.html') && item.webSocketDebuggerUrl != null,
    );
    if (target?.webSocketDebuggerUrl == null) {
      throw new Error('options page target was not found');
    }
    return evaluateOnTarget<T>(target.webSocketDebuggerUrl, expression);
  }

  private async toolbarExtensionButton(
    timeout: number,
  ): Promise<AtspiMatch | null> {
    const rect = await this.windowRect();
    const names = [EXTENSION_NAME, 'jump to the anchored element'];
    for (const name of names) {
      const match = await atspiFind({
        name,
        role: 'push button',
        prefer: 'top',
        timeout,
      });
      if (match == null || match.y < rect.y || match.y >= rect.y + 160) {
        continue;
      }
      if (
        match.name.includes('See more options') ||
        match.name.includes('Ask on every visit') ||
        match.name.includes('is pinned')
      ) {
        continue;
      }
      return match;
    }
    return null;
  }

  private async withExtensionsPage<T>(action: () => Promise<T>): Promise<T> {
    await this.preparePage();
    await this.driver.switchTo().newWindow('tab');
    const extensionsHandle = await this.driver.getWindowHandle();
    try {
      await this.driver.get('chrome://extensions');
      await this.waitFor(
        async () => (await this.extensionItem()) != null,
        'chrome://extensions did not list the extension',
      );
      return await action();
    } finally {
      const handles = await this.driver.getAllWindowHandles();
      if (handles.includes(extensionsHandle)) {
        await this.driver.switchTo().window(extensionsHandle);
        const url = await this.driver.getCurrentUrl();
        if (!this.isOptionsUrl(url)) {
          await this.driver.close();
        }
      }
      await this.activateOpenWindow();
      await this.rememberOptionsTab();
      await this.focusFixture();
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
}

function evaluateOnTarget<T>(
  webSocketUrl: string,
  expression: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('CDP evaluate timed out'));
    }, 5000);
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

async function readExtensionId(driver: WebDriver): Promise<string> {
  await driver.get('chrome://extensions');
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const id = await driver.executeScript<string | null>(
      `const name = arguments[0];
      function visit(node) {
        for (const item of node.querySelectorAll?.('extensions-item') ?? []) {
          const label = item.shadowRoot?.querySelector('#name')?.textContent?.trim();
          if (label === name) return item.id || null;
        }
        for (const element of node.querySelectorAll?.('*') ?? []) {
          if (!element.shadowRoot) continue;
          const found = visit(element.shadowRoot);
          if (found) return found;
        }
        return null;
      }
      return visit(document)`,
      EXTENSION_NAME,
    );
    if (id) {
      return id;
    }
    await delay(100);
  }
  throw new Error(`${EXTENSION_NAME} was not listed on chrome://extensions`);
}

export async function launchChrome(input: {
  extensionDir: string;
  fixtureOrigin: string;
}): Promise<{ automation: ChromeAutomation; close: () => Promise<void> }> {
  installProbePage(input.extensionDir);
  process.env.ACCESSIBILITY_ENABLED = '1';
  process.env.LANG = 'en_US.UTF-8';
  process.env.LANGUAGE = 'en_US.UTF-8';

  const resolved = resolveBrowser('chrome');
  const options = new ChromeOptions();
  options.setChromeBinaryPath(resolved.browserPath);
  options.addArguments(
    `--load-extension=${input.extensionDir}`,
    '--force-renderer-accessibility',
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--lang=en-US',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--disable-dev-shm-usage',
    '--disable-search-engine-choice-screen',
    '--no-sandbox',
    '--window-size=1280,800',
  );

  const driver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .setChromeService(new ServiceBuilder(resolved.driverPath))
    .build();
  try {
    await configureDriver(driver);
    await fitWindow(driver);
    await keepSingleTab(driver);
    const extensionId = await readExtensionId(driver);
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
    return {
      automation,
      close: () => closeDriver(driver),
    };
  } catch (error) {
    await closeDriver(driver);
    throw error;
  }
}
