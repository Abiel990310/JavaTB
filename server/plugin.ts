import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { compileAndRun, takeToken } from './compile.ts';

const MAX_BODY = 128 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (body.length > MAX_BODY) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** Handles POST /api/compile for both the dev server and the standalone one. */
export async function handleCompile(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const client = req.socket.remoteAddress ?? 'unknown';
  const json = (status: number, payload: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!takeToken(client)) {
    return json(429, { error: 'Too many compilations. Give it a minute.' });
  }

  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    const result = await compileAndRun(body);
    json(200, result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    json(status, { error: error instanceof Error ? error.message : 'Compilation failed' });
  }
}

export function compilePlugin(): Plugin {
  return {
    name: 'cpptb:compile',
    configureServer(server) {
      server.middlewares.use('/api/compile', (req, res, next) => {
        handleCompile(req, res).catch(next);
      });
    },
  };
}
