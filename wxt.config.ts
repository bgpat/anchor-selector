import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
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
