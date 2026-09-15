import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.map': 'application/json' };
export function createDemoServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') { res.writeHead(302, { Location: '/demo/' }); res.end(); return; }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = resolve(root, `.${pathname}`);
      const allowed = ['demo', 'dist'].some(dir => file.startsWith(resolve(root, dir) + sep));
      if (!allowed || !contentTypes[extname(file)]) { res.writeHead(404); res.end('Not found'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': contentTypes[extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.BASE2300_DEMO_PORT ?? 2300);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid BASE2300_DEMO_PORT.');
  const server = createDemoServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Base2300 playground: http://127.0.0.1:${server.address().port}/demo/`));
}
