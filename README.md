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

### Debug

```bash
bun run dev              # Firefox (3001) + Chrome (3000)
bun run dev:firefox
bun run dev:chrome
```

Non-default Firefox installs can set `webExt.binaries.firefox` in [`wxt.config.ts`](wxt.config.ts) (path or web-ext alias such as `flatpak:org.mozilla.firefox`).

### Build

```bash
bun run build            # Chrome + Firefox
bun run build:chrome
bun run build:firefox
```

### Package for stores

```bash
bun run zip              # Chrome + Firefox
bun run zip:chrome       # one browser only
bun run zip:firefox
```
