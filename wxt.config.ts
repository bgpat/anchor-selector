import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';
import { resolveFirefoxBinary } from './scripts/resolve-firefox';

const firefoxBinary = resolveFirefoxBinary();
const projectRoot = dirname(fileURLToPath(import.meta.url));
const chromeProfile = resolve(projectRoot, '.wxt/chrome-profile');
const firefoxProfile = resolve(projectRoot, '.wxt/firefox-profile');

mkdirSync(chromeProfile, { recursive: true });
mkdirSync(firefoxProfile, { recursive: true });

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  /** Match pre-WXT Firefox builds (MV3 + scripting/action APIs). WXT defaults Firefox to MV2. */
  manifestVersion: 3,
  /** Per-browser build dirs: `.output/chrome`, `.output/firefox` (MV is in manifestVersion). */
  outDirTemplate: '{{browser}}',
  webExt: {
    ...(firefoxBinary ? { binaries: { firefox: firefoxBinary } } : {}),
    chromiumProfile: chromeProfile,
    firefoxProfile: firefoxProfile,
    keepProfileChanges: true,
    firefoxPref: {
      /** Avoid the post-crash troubleshooting / safe-mode dialog during dev restarts. */
      'toolkit.startup.max_resumed_crashes': -1,
      'browser.sessionstore.max_resumed_crashes': -1,
    },
  },
  manifest: {
    name: 'Anchor Selector',
    description: 'Select link anchor element',
    homepage_url: 'https://github.com/bgpat/anchor-selector',
    permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
    browser_specific_settings: {
      gecko: {
        id: '{22a2fd71-5ac1-46c9-88e8-fe65a41bad62}',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
      gecko_android: {
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
    icons: {
      256: 'icons/anchor-selector.png',
    },
    action: {
      default_title: 'Anchor Selector',
      default_icon: {
        48: 'icons/anchor-selector.png',
      },
    },
    web_accessible_resources: [
      {
        resources: ['icons/anchor-selector.svg'],
        matches: ['*://*/*'],
      },
    ],
  },
});
