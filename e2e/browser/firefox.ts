import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Browser, Builder, Button, type WebElement } from 'selenium-webdriver';
import {
  Context,
  Driver as FirefoxDriver,
  Options as FirefoxOptions,
  ServiceBuilder,
} from 'selenium-webdriver/firefox';
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

/** Stable internal UUID so the probe page URL does not change between runs. */
const FIREFOX_UUID = 'e2e00000-0000-4000-8000-000000000001';

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
      await this.waitFor(async () => {
        await this.rememberOptionsTab();
        return this.optionsHandle != null;
      }, 'options page did not open from about:addons');
    });
  }

  async readExtensionBadgeText(): Promise<string> {
    await this.preparePage();
    await this.firefox.setContext(Context.CHROME);
    try {
      return await this.firefox.executeScript<string>(
        `const button = document.getElementById(arguments[0]);
        if (!button) return '';
        const badge = button.getAttribute('badge')
          || button.querySelector('.toolbarbutton-badge')?.textContent
          || '';
        return badge`,
        this.actionWidgetId,
      );
    } finally {
      await this.firefox.setContext(Context.CONTENT);
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
    await this.firefox.switchTo().newWindow('tab');
    const addonsHandle = await this.firefox.getWindowHandle();
    try {
      await this.firefox.get('about:addons');
      await this.waitFor(
        async () => (await this.addonCard()) != null,
        'about:addons did not list the extension',
      );
      return await action();
    } finally {
      const handles = await this.firefox.getAllWindowHandles();
      if (handles.includes(addonsHandle)) {
        await this.firefox.switchTo().window(addonsHandle);
        const url = await this.firefox.getCurrentUrl();
        if (!this.isOptionsUrl(url)) {
          await this.firefox.close();
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
    if (direct != null) {
      await direct.click();
      return;
    }
    const more = await this.addonControl('.more-options-button');
    if (more == null) {
      throw new Error(`about:addons control not found: ${action}`);
    }
    await more.click();
    await this.waitFor(async () => {
      const item = await this.deepElement(`panel-item[action="${action}"]`);
      if (item == null) {
        return false;
      }
      await item.click();
      return true;
    }, `about:addons menu item not found: ${action}`);
  }

  private async addonCard(): Promise<WebElement | null> {
    return this.firefox.executeScript<WebElement | null>(
      "return document.querySelector('addon-card[addon-id=\"' + arguments[0] + '\"]')",
      this.extensionId,
    );
  }

  private async addonControl(selector: string): Promise<WebElement | null> {
    return this.firefox.executeScript<WebElement | null>(
      `const card = document.querySelector(
        'addon-card[addon-id="' + arguments[0] + '"]',
      );
      if (!card) return null;
      const root = card.shadowRoot || card;
      return root.querySelector(arguments[1])`,
      this.extensionId,
      selector,
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
}

export async function launchFirefox(input: {
  extensionDir: string;
  fixtureOrigin: string;
}): Promise<{ automation: FirefoxAutomation; close: () => Promise<void> }> {
  installProbePage(input.extensionDir);
  const extensionId = extensionIdFrom(input.extensionDir);
  const resolved = resolveBrowser('firefox');
  process.env.MOZ_DISABLE_CONTENT_SANDBOX = '1';
  const options = new FirefoxOptions();
  options.setBinary(resolved.browserPath);
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
      new ServiceBuilder(resolved.driverPath)
        .addArguments('--allow-system-access')
        .setStdio(process.env.E2E_DEBUG ? 'inherit' : 'pipe'),
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
