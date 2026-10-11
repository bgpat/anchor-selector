import variables from '@/util/variables';

/** Fixture document served by the e2e origin. */
export const E2E_FIXTURE_PATH = '/anchor-page.html';

/** Second document used for navigation and history scenarios. */
export const E2E_FIXTURE_PATH_2 = '/anchor-page-2.html';

/** Regular expression source matched against the fixture tab URL. */
export const fixturePathPattern = '/anchor-page\\.html$';

/** Regular expression source matched against the second fixture URL. */
export const fixturePath2Pattern = '/anchor-page-2\\.html$';

/** Regular expression source for a heading selection on the fixture page. */
export const headingUrlPattern = '/anchor-page\\.html#heading$';

export const headingSelector = '#heading';
export const secondarySelector = '#secondary';
export const innerSelector = '#inner';
export const plainSelector = '[data-e2e="plain"]';
export const legacyAnchorSelector = 'a[name="legacy"]';
export const nearInvisibleSelector = '[data-e2e="near-invisible"]';

export const overlaySelector = `.${variables.overlay.class}`;

export const headingHash = '#heading';
export const innerHash = '#inner';
export const legacyHash = '#legacy';
export const invisibleHash = '#invisible-anchor';
export const headingLabel = '#heading';

/** Scroll distance that keeps a tall `#heading` under a stationary pointer. */
export const scrollDeltaY = 80;

/** Viewport coordinates outside the page, used to fire `mouseleave`. */
export const pointerOutside = { x: -20, y: -20 } as const;
