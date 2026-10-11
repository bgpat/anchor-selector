import { E2E_FIXTURE_PATH, E2E_PORT } from './constants';

Bun.serve({
  port: E2E_PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === E2E_FIXTURE_PATH) {
      return new Response(Bun.file(new URL('./fixtures/anchor-page.html', import.meta.url)));
    }
    return new Response('Not found', { status: 404 });
  },
});

console.log(`E2E fixture server listening on http://127.0.0.1:${E2E_PORT}`);
