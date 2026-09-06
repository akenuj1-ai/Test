#!/usr/bin/env node
/**
 * Servidor estatico minimo para abrir a UI sem bundler.
 *
 * A UI e ESM puro e importa os modulos do motor por caminho relativo, entao
 * basta servir a raiz do repositorio. Sem dependencias: `node tools/serve.js`.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT ?? 8080);
const INDEX = '/src/ui/index.html';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname === '/' ? INDEX : url.pathname;

    // impede escapar da raiz via ".." antes de qualquer acesso ao disco
    const target = resolve(ROOT, `.${normalize(path)}`);
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      res.writeHead(403).end('403 — fora da raiz servida');
      return;
    }

    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404');
  }
});

server.listen(PORT, () => {
  console.log(`Fortuna Real em http://localhost:${PORT}${INDEX}`);
});
