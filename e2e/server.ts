const port = Number(process.env.E2E_PORT ?? 4173);

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/anchor-page.html') {
      return new Response(Bun.file(new URL('./fixtures/anchor-page.html', import.meta.url)));
    }
    return new Response('Not found', { status: 404 });
  },
});

console.log(`E2E fixture server listening on http://127.0.0.1:${port}`);
