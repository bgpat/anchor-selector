import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Browser, Builder, Button, type WebElement } from 'selenium-webdriver';
import {
  Context,
  Driver as FirefoxDriver,
  Options as FirefoxOptions,
  ServiceBuilder,
} from 'selenium-webdriver/firefox';
import type { ModifierKey } from '@/util/config';
import type { ExtensionIconButton } from '../automation/interface';
import {
  EXTENSION_NAME,
  PageAutomation,
  actionPauseMs,
  clickAtScreen,
  pointAtScreen,
  closeDriver,
  configureDriver,
  delay,
  fitWindow,
  installProbePage,
  keepSingleTab,
  prepareTabs,
} from './common';

/** Stable internal UUID so the probe page URL does not change between runs. */
const FIREFOX_UUID = 'e2e00000-0000-4000-8000-000000000001';

const browserWindowsSource = `function browserWindows() {
  if (window.gBrowser) return [window];
  const services = window.Services;
  if (!services || !services.wm) return [];
  const found = [];
  const wins = services.wm.getEnumerator('navigator:browser');
  while (wins.hasMoreElements()) found.push(wins.getNext());
  return found;
}
function tabHandle(browser) {
  try {
    const { NavigableManager } = ChromeUtils.importESModule(
      'chrome://remote/content/shared/NavigableManager.sys.mjs',
    );
    const id = NavigableManager.getIdForBrowser(browser);
    if (id) return id;
  } catch (error) {}
  const context = browser.browsingContext;
  return context ? String(context.id) : String(browser.outerWindowID);
}`;

type AddonManifest = {
  browser_specific_settings?: { gecko?: { id?: string } };
};

function extensionIdFrom(extensionDir: string): string {
  const manifest = JSON.parse(
    readFileSync(resolve(extensionDir, 'manifest.json'), 'utf8'),
  ) as AddonManifest;
  const id = manifest.browser_specific_settings?.gecko?.id;
  if (id == null) {
    throw new Error('Firefox extension id is missing from the manifest');
  }
  return id;
}

function widgetId(extensionId: string): string {
  return `${extensionId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-browser-action`;
}

export class FirefoxAutomation extends PageAutomation {
  constructor(
    driver: FirefoxDriver,
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
      'about:robots',
    );
    this.firefox = driver;
    this.relayPageEvents = true;
  }

  private readonly firefox: FirefoxDriver;

  private get actionWidgetId(): string {
    return widgetId(this.extensionId);
  }

  protected override async relayToContentScript(
    event: {
      type: string;
      selector?: string;
      x?: number;
      y?: number;
      key?: string;
    },
    modifiers?: readonly ModifierKey[],
  ): Promise<void> {
    await this.firefox.setContext(Context.CONTENT);
    const closesOverlay = event.type === 'click' || event.type === 'keydown';
    const attempts = closesOverlay ? 6 : 3;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await super.relayToContentScript(event, modifiers);
      if (!closesOverlay) {
        await delay(40);
        continue;
      }
      await delay(200);
      const overlayOpen = await this.driver.executeScript<boolean>(
        "return document.querySelector('.--anchor-selector-overlay') != null",
      );
      if (!overlayOpen) {
        return;
      }
    }
  }

  protected override async preparePage(): Promise<void> {
    await this.firefox.setContext(Context.CONTENT);
    await this.focusFixture();
  }

  async clickExtensionIcon(input: {
    button: ExtensionIconButton;
  }): Promise<void> {
    await this.preparePage();
    await this.firefox.setContext(Context.CHROME);
    try {
      const button = await this.toolbarButton();
      await this.pointAt(button);
      const actions = this.firefox.actions();
      if (input.button === 'right') {
        await actions.contextClick(button).perform();
      } else if (input.button === 'middle') {
        await actions
          .move({ origin: button, duration: 0 })
          .press(Button.MIDDLE)
          .release(Button.MIDDLE)
          .perform();
      } else {
        await actions.click(button).perform();
      }
    } finally {
      await this.firefox.setContext(Context.CONTENT);
    }
  }

  async setExtensionEnabled(input: { enabled: boolean }): Promise<void> {
    if ((await this.readExtensionEnabled()) === input.enabled) {
      return;
    }
    await this.withAddonsPage(async () => {
      await this.clickAddonAction('toggle-disabled');
    });
    if (input.enabled) {
      await this.reopenProbe();
    }
  }

  async openExtensionOptions(): Promise<void> {
    await this.withAddonsPage(async () => {
      await this.clickAddonAction('preferences');
    });
    // about:addons hosts options in a remote XUL browser Marionette cannot
    // enter. The preferences action reveals that page; drive the same URL.
    const optionsUrl = await this.readAddonOptionsUrl();
    await this.openBrowserTab();
    await this.firefox.get(optionsUrl);
    await delay(actionPauseMs);
    await this.waitFor(async () => {
      await this.rememberOptionsTab();
      return this.optionsHandle != null;
    }, 'options page did not open from about:addons', 60000);
  }

  async readExtensionBadgeText(): Promise<string> {
    await this.preparePage();
    const url = await this.driver.getCurrentUrl();
    try {
      return await this.probe<string>(
        `const done = arguments[arguments.length - 1];
        const url = arguments[0];
        const ext = globalThis.browser && globalThis.browser.tabs
          ? globalThis.browser
          : globalThis.chrome;
        ext.tabs.query({}).then((tabs) => {
          const match = tabs.find((tab) => tab.url === url);
          if (!match || match.id == null) {
            done('');
            return;
          }
          const action = ext.action || ext.browserAction;
          return action.getBadgeText({ tabId: match.id }).then(
            (text) => done(text || ''),
            (error) => done({ error: String(error) }),
          );
        }).catch((error) => done({ error: String(error) }));`,
        url,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'extension background was not found') {
        return '';
      }
      throw error;
    }
  }

  async readExtensionEnabled(): Promise<boolean> {
    await this.firefox.setContext(Context.CHROME);
    try {
      const enabled = await this.firefox.executeAsyncScript<
        boolean | { error: string }
      >(
        `const done = arguments[arguments.length - 1];
        const id = arguments[0];
        const { AddonManager } = ChromeUtils.importESModule(
          'resource://gre/modules/AddonManager.sys.mjs',
        );
        AddonManager.getAddonByID(id)
          .then((addon) => done(!!addon && addon.isActive))
          .catch((error) => done({ error: String(error) }));`,
        this.extensionId,
      );
      if (typeof enabled === 'object') {
        throw new Error(enabled.error);
      }
      return enabled;
    } finally {
      await this.firefox.setContext(Context.CONTENT);
    }
  }

  private async readAddonOptionsUrl(): Promise<string> {
    await this.firefox.setContext(Context.CHROME);
    try {
      const url = await this.firefox.executeAsyncScript<
        string | { error: string }
      >(
        `const done = arguments[arguments.length - 1];
        const id = arguments[0];
        const { AddonManager } = ChromeUtils.importESModule(
          'resource://gre/modules/AddonManager.sys.mjs',
        );
        AddonManager.getAddonByID(id)
          .then((addon) => done(addon && addon.optionsURL ? addon.optionsURL : ''))
          .catch((error) => done({ error: String(error) }));`,
        this.extensionId,
      );
      if (typeof url === 'object') {
        throw new Error(url.error);
      }
      if (url === '') {
        throw new Error('extension has no options URL');
      }
      return url;
    } finally {
      await this.firefox.setContext(Context.CONTENT);
    }
  }

  async pinActionButton(): Promise<void> {
    await this.firefox.setContext(Context.CHROME);
    try {
      const pinned = await this.firefox.executeScript<string>(
        `const widgetId = arguments[0];
        const urls = [
          'moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs',
        ];
        const errors = [];
        for (const url of urls) {
          try {
            const { CustomizableUI } = ChromeUtils.importESModule(url);
            CustomizableUI.addWidgetToArea(
              widgetId,
              CustomizableUI.AREA_NAVBAR,
            );
            return 'ok';
          } catch (error) {
            errors.push(url + ': ' + (error && error.message ? error.message : error));
          }
        }
        return errors.join('\\n');`,
        this.actionWidgetId,
      );
      if (pinned !== 'ok') {
        console.error(pinned);
        throw new Error(`Failed to pin the toolbar button: ${pinned}`);
      }
      await this.toolbarButton();
    } finally {
      await this.firefox.setContext(Context.CONTENT);
    }
  }

  private async inChrome<T>(script: string, ...args: unknown[]): Promise<T> {
    await this.firefox.setContext(Context.CHROME);
    try {
      return await this.firefox.executeScript<T>(script, ...args);
    } finally {
      await this.firefox.setContext(Context.CONTENT);
    }
  }

  private async tabPoint(
    handle: string,
    part: 'tab' | 'close',
  ): Promise<{ x: number; y: number } | null> {
    return this.inChrome<{ x: number; y: number } | null>(
      `const handle = arguments[0];
      const part = arguments[1];
      ${browserWindowsSource}
      function pointOf(element, win) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return {
          x: win.mozInnerScreenX + rect.left + rect.width / 2,
          y: win.mozInnerScreenY + rect.top + rect.height / 2,
        };
      }
      for (const win of browserWindows()) {
        for (const tab of win.gBrowser.tabs) {
          if (tabHandle(tab.linkedBrowser) !== handle) continue;
          if (part === 'close') {
            const close = tab.querySelector('.tab-close-button');
            const point = close && pointOf(close, win);
            if (point) return point;
          }
          return pointOf(tab, win);
        }
      }
      return null;`,
      handle,
      part,
    );
  }

  private async tabUrl(handle: string): Promise<string | null> {
    return this.inChrome<string | null>(
      `const handle = arguments[0];
      ${browserWindowsSource}
      for (const win of browserWindows()) {
        for (const tab of win.gBrowser.tabs) {
          const browser = tab.linkedBrowser;
          if (tabHandle(browser) === handle) return browser.currentURI.spec;
        }
      }
      return null;`,
      handle,
    );
  }

  protected override async findOptionsHandle(): Promise<string | null> {
    return this.inChrome<string | null>(
      `${browserWindowsSource}
      for (const win of browserWindows()) {
        for (const tab of win.gBrowser.tabs) {
          const spec = tab.linkedBrowser.currentURI.spec;
          if (spec.includes('options.html') || /[?&]options=/.test(spec)) {
            return tabHandle(tab.linkedBrowser);
          }
        }
      }
      return null;`,
    );
  }

  protected override async clickTab(handle: string): Promise<void> {
    const point = await this.tabPoint(handle, 'tab');
    if (point == null) {
      throw new Error(`Firefox tab was not found: ${handle}`);
    }
    await clickAtScreen(point.x, point.y);
  }

  protected override async openTabByMouse(): Promise<void> {
    const point = await this.inChrome<{ x: number; y: number } | null>(
      `function pointOf(button) {
        if (!button || button.hidden) return null;
        const rect = button.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) return null;
        return {
          x: window.mozInnerScreenX + rect.left + rect.width / 2,
          y: window.mozInnerScreenY + rect.top + rect.height / 2,
        };
      }
      return pointOf(document.getElementById('tabs-newtab-button'))
        || pointOf(document.getElementById('new-tab-button'));`,
    );
    if (point == null) {
      throw new Error('Firefox new-tab button was not found');
    }
    await pointAtScreen(point.x, point.y);
    await this.inChrome(
      `function visible(id) {
        const button = document.getElementById(id);
        if (!button || button.hidden) return null;
        const rect = button.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) return null;
        return button;
      }
      const button = visible('tabs-newtab-button') || visible('new-tab-button');
      if (button) button.doCommand();`,
    );
  }

  protected override async closeTabByMouse(handle: string): Promise<void> {
    const point = await this.tabPoint(handle, 'close');
    if (point == null) {
      throw new Error(`Firefox tab close button was not found: ${handle}`);
    }
    await clickAtScreen(point.x, point.y);
  }

  private async toolbarButton(): Promise<WebElement> {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const button = await this.firefox.executeScript<WebElement | null>(
        `return document.getElementById(arguments[0])
          || document.querySelector('toolbarbutton[label="' + ${JSON.stringify(EXTENSION_NAME)} + '"]')`,
        this.actionWidgetId,
      );
      if (button != null) {
        return button;
      }
      await delay(100);
    }
    const dump = await this.firefox.executeScript<string>(
      `return [...document.querySelectorAll('toolbarbutton')]
        .map((button) => button.id + ' ' + (button.getAttribute('label') || ''))
        .join('\\n')`,
    );
    throw new Error(`Firefox toolbar button not found\n${dump}`);
  }

  private async withAddonsPage<T>(action: () => Promise<T>): Promise<T> {
    await this.preparePage();
    const addonsHandle = await this.openBrowserTab();
    try {
      await this.firefox.get('about:addons');
      try {
        await this.waitFor(
          async () => (await this.addonCard()) != null,
          'about:addons did not list the extension',
        );
      } catch (error) {
        const dump = await this.addonsTreeDump();
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}\n${dump}`);
      }
      await delay(actionPauseMs);
      return await action();
    } finally {
      const handles = await this.firefox.getAllWindowHandles();
      if (handles.includes(addonsHandle)) {
        const url = await this.tabUrl(addonsHandle);
        if (url != null && !this.isOptionsUrl(url)) {
          await this.closeBrowserTab(addonsHandle);
        }
      }
      await this.activateOpenWindow();
      await this.rememberOptionsTab();
      await this.focusFixture();
    }
  }

  private async clickAddonAction(
    action: 'preferences' | 'toggle-disabled',
  ): Promise<void> {
    const direct = await this.addonControl(`[action="${action}"]`);
    if (direct != null && (await direct.isDisplayed())) {
      await this.pointAt(direct);
      await direct.click();
      return;
    }
    const more = await this.addonControl('.more-options-button');
    if (more == null) {
      throw new Error(`about:addons control not found: ${action}`);
    }
    await this.pointAt(more);
    await more.click();
    await this.waitFor(async () => {
      const item = await this.deepElement(`panel-item[action="${action}"]`);
      if (item == null) {
        return false;
      }
      await this.pointAt(item);
      await item.click();
      return true;
    }, `about:addons menu item not found: ${action}`);
  }

  private async addonCard(): Promise<WebElement | null> {
    const selector = `addon-card[addon-id="${this.extensionId}"]`;
    const card = await this.deepElement(selector);
    if (card != null) {
      return card;
    }
    await this.firefox.executeScript(
      `if (document.querySelector('addon-list[type="extension"]')) return;
      if (document.documentElement.dataset.e2eExtensions === '1') return;
      const button = document.getElementById('category-extension')
        || document.querySelector('button[name="extension"]');
      if (!button) return;
      document.documentElement.dataset.e2eExtensions = '1';
      if (typeof button.activate === 'function') button.activate();
      else button.click();`,
    );
    return this.deepElement(selector);
  }

  private async addonControl(selector: string): Promise<WebElement | null> {
    const card = await this.addonCard();
    if (card == null) {
      return null;
    }
    return this.firefox.executeScript<WebElement | null>(
      `const root = arguments[0].shadowRoot || arguments[0];
      return root.querySelector(arguments[1])`,
      card,
      selector,
    );
  }

  private async addonsTreeDump(): Promise<string> {
    return this.firefox.executeScript<string>(
      `const lines = [];
      function visit(node, depth) {
        if (depth > 4 || lines.length > 60) return;
        for (const element of node.children ?? []) {
          const view = element.view || element.getAttribute?.('view') || '';
          const l10n = element.getAttribute?.('data-l10n-id') || '';
          const name = element.getAttribute?.('name') || '';
          lines.push(
            '  '.repeat(depth)
              + element.localName
              + (element.id ? '#' + element.id : '')
              + (view ? ' view=' + view : '')
              + (name ? ' name=' + name : '')
              + (l10n ? ' l10n=' + l10n : ''),
          );
          if (element.shadowRoot) visit(element.shadowRoot, depth + 1);
          visit(element, depth + 1);
        }
      }
      visit(document.body || document.documentElement, 0);
      return lines.join('\\n');`,
    );
  }

  private async deepElement(selector: string): Promise<WebElement | null> {
    return this.firefox.executeScript<WebElement | null>(
      `const selector = arguments[0];
      function visit(node) {
        const found = node.querySelector?.(selector);
        if (found) return found;
        for (const element of node.querySelectorAll?.('*') ?? []) {
          if (!element.shadowRoot) continue;
          const inner = visit(element.shadowRoot);
          if (inner) return inner;
        }
        return null;
      }
      return visit(document)`,
      selector,
    );
  }

  /**
   * Run the probe script in the extension background. That page is not a tab,
   * so the selected tab stays where the pointer left it.
   */
  protected override async evaluateProbe<T>(
    script: string,
    ...args: unknown[]
  ): Promise<T> {
    await this.firefox.setContext(Context.CHROME);
    try {
      const result = (await this.firefox.executeAsyncScript(
        `const done = arguments[arguments.length - 1];
        const extensionId = arguments[0];
        const source = arguments[1];
        const payload = arguments[2];
        const { ExtensionParent } = ChromeUtils.importESModule(
          'resource://gre/modules/ExtensionParent.sys.mjs',
        );
        const extension = ExtensionParent.GlobalManager.getExtension(extensionId);
        const view = extension && [...extension.views].find((item) =>
          item.viewType === 'background' && item.browsingContext?.currentWindowGlobal,
        );
        if (!view) {
          done({ error: 'extension background was not found' });
          return;
        }
        const actor = view.browsingContext.currentWindowGlobal.getActor(
          'MarionetteCommands',
        );
        actor.executeScript(source, payload, {
          timeout: 15000,
          sandboxName: null,
          newSandbox: false,
          file: '',
          line: 0,
          async: true,
        }).then(
          (value) => done(value ?? null),
          (error) => done({
            error: String(error && error.message ? error.message : error),
          }),
        );`,
        this.extensionId,
        script,
        args,
      )) as T | { error: string };
      if (
        result != null &&
        typeof result === 'object' &&
        'error' in result &&
        typeof result.error === 'string'
      ) {
        throw new Error(result.error);
      }
      return result as T;
    } finally {
      await this.firefox.setContext(Context.CONTENT);
    }
  }
}

export async function launchFirefox(input: {
  extensionDir: string;
  fixtureOrigin: string;
}): Promise<{ automation: FirefoxAutomation; close: () => Promise<void> }> {
  installProbePage(input.extensionDir);
  const extensionId = extensionIdFrom(input.extensionDir);
  process.env.MOZ_DISABLE_CONTENT_SANDBOX = '1';
  const options = new FirefoxOptions();
  options.setBinary('/usr/bin/firefox');
  options.setPreference('security.sandbox.content.level', 0);
  options.setPreference('intl.locale.requested', 'en-US');
  options.setPreference('browser.startup.page', 0);
  options.setPreference('browser.aboutwelcome.enabled', false);
  options.setPreference('toolkit.startup.max_resumed_crashes', -1);
  options.setPreference('browser.sessionstore.max_resumed_crashes', -1);
  options.setPreference('datareporting.policy.dataSubmissionEnabled', false);
  options.setPreference('browser.shell.checkDefaultBrowser', false);
  options.setPreference('dom.events.testing.asyncClipboard', true);
  options.setPreference(
    'extensions.webextensions.uuids',
    JSON.stringify({ [extensionId]: FIREFOX_UUID }),
  );

  const driver = (await new Builder()
    .forBrowser(Browser.FIREFOX)
    .setFirefoxOptions(options)
    .setFirefoxService(
      new ServiceBuilder('/usr/local/share/gecko_driver/geckodriver')
        .addArguments('--allow-system-access')
        .setStdio('pipe'),
    )
    .build()) as FirefoxDriver;
  try {
    await configureDriver(driver);
    await fitWindow(driver);
    await keepSingleTab(driver);
    await driver.installAddon(input.extensionDir, true);
    const probeUrl = `moz-extension://${FIREFOX_UUID}/e2e-probe.html`;
    const tabs = await prepareTabs(driver, probeUrl);
    const automation = new FirefoxAutomation(
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
