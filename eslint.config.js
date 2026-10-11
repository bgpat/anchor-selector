import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import wxtAutoImports from './.wxt/eslint-auto-imports.mjs';

export default [
  {
    ignores: ['.output/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.webextensions,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      indent: 'off',
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '_', varsIgnorePattern: '_' },
      ],
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'no-console': ['warn'],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: wxtAutoImports.languageOptions.globals,
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      globals: {
        Bun: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
