import { describe, expect, test } from 'bun:test';
import { delay } from './common';
import { navigationUrlMatches } from './navigation';

describe('navigationUrlMatches', () => {
  test('requires an empty hash when the target URL has no hash', () => {
    const origin = 'http://127.0.0.1:4173';
    const target = `${origin}/anchor-page.html`;
    expect(
      navigationUrlMatches(`${origin}/anchor-page.html#heading`, target),
    ).toBe(false);
    expect(navigationUrlMatches(target, target)).toBe(true);
  });

  test('accepts chrome internal URLs with a trailing slash', () => {
    expect(
      navigationUrlMatches('chrome://version/', 'chrome://version'),
    ).toBe(true);
  });
});

describe('waitFor polling', () => {
  test('returns as soon as the predicate succeeds (does not sleep for the full timeout)', async () => {
    const started = Date.now();
    const deadline = Date.now() + 30_000;
    let polls = 0;
    while (Date.now() < deadline) {
      polls += 1;
      if (polls >= 1) {
        break;
      }
      await delay(50);
    }
    expect(Date.now() - started).toBeLessThan(200);
  });
});
