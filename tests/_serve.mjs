/* Tiny zero-deps static server for tests. Mirrors what Cloudflare Pages
   does in production: gzip text responses + long cache on hashed assets. */
import { createServer } from 'node:http';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
};

const COMPRESSIBLE = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt',
]);

export function startServer({ root, port = 0 } = {}) {
  const ROOT = resolve(root);
  const server = createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    const file = join(ROOT, url);
    if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end('forbidden'); }
    try {
      const st = statSync(file);
      if (st.isDirectory()) { res.statusCode = 403; return res.end('forbidden'); }
      const ext = extname(file).toLowerCase();
      let body = readFileSync(file);
      res.setHeader('content-type', MIME[ext] || 'application/octet-stream');
      // Production parity: long-cache static assets, short-cache html.
      res.setHeader('cache-control', ext === '.html'
        ? 'no-cache'
        : 'public, max-age=31536000, immutable');
      const accept = String(req.headers['accept-encoding'] || '');
      if (COMPRESSIBLE.has(ext)) {
        if (accept.includes('br')) {
          body = brotliCompressSync(body);
          res.setHeader('content-encoding', 'br');
        } else if (accept.includes('gzip')) {
          body = gzipSync(body);
          res.setHeader('content-encoding', 'gzip');
        }
      }
      res.setHeader('content-length', String(body.length));
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((resolveListen) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actualPort } = server.address();
      resolveListen({
        url: `http://127.0.0.1:${actualPort}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
