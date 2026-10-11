# E2E (Playwright)

End-to-end tests are **not** part of the modernization PR scope. The full implementation (specs, CI job, `fixture-host` content script, and Playwright config) lives on the [`e2e-test`](https://github.com/bgpat/anchor-selector/tree/e2e-test) branch.

When adding E2E here:

1. Merge or cherry-pick from `e2e-test`.
2. Restore devDependencies: `@playwright/test`, `playwright-webextext`.
3. Add `playwright.config.ts` and wire the `e2e` job in `.github/workflows/test.yml`.

Build output is already split as `.output/chrome` and `.output/firefox` (`outDirTemplate: '{{browser}}'` in `wxt.config.ts`).
