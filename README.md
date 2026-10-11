# anchor-selector

[![publish](https://github.com/bgpat/anchor-selector/actions/workflows/publish.yml/badge.svg)](https://github.com/bgpat/anchor-selector/actions/workflows/publish.yml)

**anchor-selector** is the web browser extension to jump with selecting the HTML element which has `id` attribute.

[![demo movie](http://img.youtube.com/vi/FfGpJnQZBbI/0.jpg)](https://youtu.be/FfGpJnQZBbI?si=r4g3nFtivvrA_OBh)

## Installation

### Firefox

Go to https://addons.mozilla.org/firefox/addon/anchor-selector/ and install to your browser.

### Google Chrome

Go to https://chrome.google.com/webstore/detail/anchor-selector/ejnjjcpllmekfiiiamofdgpiaipanpge/ and install to your browser.

## Development

Built with [WXT](https://wxt.dev/), TypeScript 7, and React (options page).

### Debug with Firefox

```bash
bun run dev:firefox
```

### Debug with Chrome

```bash
bun run dev:chrome
```

### Build

```bash
bun run build:chrome
bun run build:firefox
```

### Package for stores

```bash
bun run zip:chrome
bun run zip:firefox
```

### End-to-end tests (Chrome & Firefox)

```bash
bun run build:chrome && bun run build:firefox
xvfb-run -a bun run test:e2e
```

CI uploads browser-viewable E2E reports as the **`e2e-report`** artifact (open `index.html` in a browser).
