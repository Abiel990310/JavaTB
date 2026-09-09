import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { loadBook, toNav } from './content.ts';
import { renderChapter, renderPart, type Assets } from './render.ts';
import {
  renderHome,
  renderPractice,
  renderExercisePage,
  renderReference,
  renderStatus,
} from './pages.ts';
import type { Book, Exercise } from './types.ts';
import { BASE, url } from './base.ts';

const DEV_ASSETS: Assets = { js: ['/src/main.ts'], css: ['/src/styles/index.css'] };

/** Everything the client needs that is not baked into the HTML. */
function clientData(book: Book) {
  const nav = toNav(book);
  const search = book.parts.flatMap((part) =>
    part.chapters.map((ch) => ({
      slug: ch.slug,
      title: ch.title,
      part: part.title,
      url: `/${part.slug}/${ch.slug}/`,
      summary: ch.summary,
      headings: ch.headings.map((h) => ({ id: h.id, text: h.text })),
      // Trimmed: enough for useful matching without shipping the whole book twice.
      text: ch.text.slice(0, 4000),
    })),
  );
  const problems = book.exercises.map((e) => ({
    id: e.id,
    title: e.title,
    difficulty: e.difficulty,
    chapter: e.chapter,
    topics: e.topics,
  }));
  return { nav, search, problems };
}

function exercisePayload(e: Exercise) {
  return {
    id: e.id,
    title: e.title,
    difficulty: e.difficulty,
    chapter: e.chapter,
    topics: e.topics,
    standard: e.standard,
    check: e.check,
    stdin: e.stdin,
    cases: e.cases,
    timeLimitMs: e.timeLimitMs,
    promptHtml: e.promptHtml,
    starter: e.starter,
    tests: e.tests,
    hints: e.hints,
    solution: e.solution,
    solutionNotesHtml: e.solutionNotesHtml,
  };
}

/** Resolve a URL path to rendered HTML, or null if nothing matches. */
function routeToHtml(book: Book, assets: Assets, path: string): string | null {
  const nav = toNav(book);
  const clean = path.replace(/\/+$/, '') || '/';

  if (clean === '/') return renderHome(book, assets);
  if (clean === '/practice') return renderPractice(book, assets);
  if (clean === '/reference') return renderReference(book, assets);
  if (clean === '/progress') return renderStatus(book, assets);

  const practiceMatch = /^\/practice\/([^/]+)$/.exec(clean);
  if (practiceMatch) {
    const ex = book.exercises.find((e) => e.id === practiceMatch[1]);
    return ex ? renderExercisePage(book, ex, assets) : null;
  }

  const segments = clean.split('/').filter(Boolean);
  const part = book.parts.find((p) => p.slug === segments[0]);
  if (!part) return null;
  if (segments.length === 1) return renderPart(book, part, assets);

  const chapter = part.chapters.find((c) => c.slug === segments[1]);
  return chapter ? renderChapter(book, nav, part, chapter, assets) : null;
}

async function writePage(outDir: string, urlPath: string, html: string): Promise<void> {
  const rel = urlPath === '/' ? 'index.html' : join(urlPath.replace(/^\//, ''), 'index.html');
  const file = join(outDir, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html, 'utf8');
}

export function bookPlugin(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  let cached: Book | null = null;

  const book = async (): Promise<Book> => {
    cached ??= await loadBook(root);
    return cached;
  };

  return {
    name: 'tb:book',

    config(config) {
      root = config.root ?? process.cwd();
      outDir = config.build?.outDir ?? 'dist';
      return { build: { manifest: true } };
    },

    configureServer(server: ViteDevServer) {
      // Rebuild the content model whenever a Markdown file changes.
      server.watcher.add(join(root, 'content'));
      const invalidate = (file: string) => {
        if (file.includes(`${join(root, 'content')}`)) {
          cached = null;
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.on('change', invalidate);
      server.watcher.on('add', invalidate);
      server.watcher.on('unlink', invalidate);

      return () => {
        server.middlewares.use(async (req, res, next) => {
          const raw = (req.url ?? '/').split('?')[0];
          if (raw.startsWith('/@') || raw.startsWith('/src/') || raw.startsWith('/node_modules')) {
            return next();
          }
          // Strip the deployment base so dev and production resolve alike.
          const url =
            BASE !== '/' && raw.startsWith(BASE.slice(0, -1))
              ? raw.slice(BASE.length - 1) || '/'
              : raw;

          try {
            const b = await book();

            if (url === '/data/book.json') {
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify(clientData(b)));
            }
            const exMatch = /^\/data\/exercises\/([^/]+)\.json$/.exec(url);
            if (exMatch) {
              const ex = b.exercises.find((e) => e.id === exMatch[1]);
              if (!ex) {
                res.statusCode = 404;
                return res.end('{}');
              }
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify(exercisePayload(ex)));
            }

            const html = routeToHtml(b, DEV_ASSETS, url);
            if (html === null) return next();

            const transformed = await server.transformIndexHtml(url, html);
            res.setHeader('Content-Type', 'text/html');
            return res.end(transformed);
          } catch (error) {
            return next(error);
          }
        });
      };
    },

    async closeBundle() {
      const dist = join(root, outDir);
      // Vite has emitted the hashed JS/CSS; read the manifest to reference them.
      const manifestPath = join(dist, '.vite', 'manifest.json');
      let assets: Assets = DEV_ASSETS;
      try {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<
          string,
          { file: string; css?: string[]; isEntry?: boolean }
        >;
        const entry = Object.values(manifest).find((v) => v.isEntry);
        if (entry) {
          assets = {
            js: [url(entry.file)],
            css: (entry.css ?? []).map((c) => url(c)),
          };
        }
      } catch {
        this.warn('No Vite manifest found; generated pages reference dev asset paths.');
      }

      const b = await book();
      const nav = toNav(b);

      await writePage(dist, '/', renderHome(b, assets));
      await writePage(dist, '/practice', renderPractice(b, assets));
      await writePage(dist, '/reference', renderReference(b, assets));
      await writePage(dist, '/progress', renderStatus(b, assets));

      for (const part of b.parts) {
        await writePage(dist, `/${part.slug}`, renderPart(b, part, assets));
        for (const chapter of part.chapters) {
          await writePage(
            dist,
            `/${part.slug}/${chapter.slug}`,
            renderChapter(b, nav, part, chapter, assets),
          );
        }
      }
      for (const ex of b.exercises) {
        await writePage(dist, `/practice/${ex.id}`, renderExercisePage(b, ex, assets));
      }

      await mkdir(join(dist, 'data', 'exercises'), { recursive: true });
      await writeFile(join(dist, 'data', 'book.json'), JSON.stringify(clientData(b)), 'utf8');
      for (const ex of b.exercises) {
        await writeFile(
          join(dist, 'data', 'exercises', `${ex.id}.json`),
          JSON.stringify(exercisePayload(ex)),
          'utf8',
        );
      }

      const pages = 4 + b.parts.length + nav.length + b.exercises.length;
      this.info(`Generated ${pages} static pages into ${outDir}/`);
    },
  };
}
