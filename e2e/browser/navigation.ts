/** Returns true when the browser location satisfies the navigation target. */
export function navigationUrlMatches(current: string, expected: string): boolean {
  if (current === expected) {
    return true;
  }
  const trimTrailingSlash = (url: string): string => url.replace(/\/$/, '');
  if (trimTrailingSlash(current) === trimTrailingSlash(expected)) {
    return true;
  }
  if (expected.startsWith('chrome://') || expected.startsWith('about:')) {
    return trimTrailingSlash(current).startsWith(trimTrailingSlash(expected));
  }
  try {
    const currentUrl = new URL(current);
    const expectedUrl = new URL(expected);
    if (
      currentUrl.origin !== expectedUrl.origin ||
      currentUrl.pathname !== expectedUrl.pathname ||
      currentUrl.search !== expectedUrl.search
    ) {
      return false;
    }
    if (expectedUrl.hash === '') {
      return currentUrl.hash === '';
    }
    return currentUrl.hash === expectedUrl.hash;
  } catch {
    return current.startsWith(expected);
  }
}

export type GotoInput =
  | { path: string }
  | { href: string }
  | { uninjectable: true };

export function resolveGotoUrl(
  input: GotoInput,
  fixtureOrigin: string,
  uninjectableHref: string,
): string {
  if ('uninjectable' in input) {
    return uninjectableHref;
  }
  if ('href' in input) {
    return input.href;
  }
  return `${fixtureOrigin}${input.path}`;
}
