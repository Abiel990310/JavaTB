/**
 * Serves the built site plus the /api/compile endpoint.
 *
 *   npm run build && npm run serve
 *
 * Only needed if you want reader code compiled by your own machine. A site
 * deployed to static hosting works without this: the client falls back to a
 * hosted compiler (see src/lib/compile-client.ts).
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { handleCompile } from './plugin.ts';

const ROOT = join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT ?? 4173);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function resolveFile(urlPath: string): Promise<string | null> {
  // normalize() collapses any ../ before it can escape ROOT.
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidates = clean.endsWith('/')
    ? [join(ROOT, clean, 'index.html')]
    : [join(ROOT, clean), join(ROOT, clean, 'index.html')];

  for (const candidate of candidates) {
    if (!candidate.startsWith(ROOT)) continue;
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/api/compile')) {
    handleCompile(req, res).catch(() => {
      res.statusCode = 500;
      res.end('{"error":"internal"}');
    });
    return;
  }

  resolveFile(url)
    .then((file) => {
      if (!file) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<h1>404</h1><p><a href="/">Back to the book</a></p>');
        return;
      }
      res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
      if (/-[A-Za-z0-9_]{8}\.(js|css)$/.test(file)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      createReadStream(file).pipe(res);
    })
    .catch(() => {
      res.statusCode = 500;
      res.end('internal error');
    });
});

server.listen(PORT, () => {
  console.log(`The Java Textbook is serving on http://localhost:${PORT}`);
});
