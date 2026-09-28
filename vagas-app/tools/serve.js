#!/usr/bin/env node
/**
 * Servidor do protótipo: entrega a interface e a rota /api/vagas.
 *
 *   node tools/serve.js
 *   ADZUNA_APP_ID=... ADZUNA_APP_KEY=... node tools/serve.js   # vagas reais
 *
 * Sem as chaves, /api/vagas devolve as vagas de exemplo. Com as chaves,
 * devolve só vagas reais: vaga fictícia nunca se mistura com vaga real.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { buscarAdzuna } from '../src/sources/adzuna.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const INDEX = '/src/ui/index.html';
const { ADZUNA_APP_ID, ADZUNA_APP_KEY } = process.env;

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/**
 * @param {URL} url
 */
async function vagas(url) {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) return { fonte: 'exemplo', vagas: vagasDeExemplo() };
  const lista = await buscarAdzuna({
    what: url.searchParams.get('q') ?? '',
    where: url.searchParams.get('onde') ?? '',
    appId: ADZUNA_APP_ID,
    appKey: ADZUNA_APP_KEY,
  });
  return { fonte: 'adzuna', vagas: lista };
}

const server = createServer(
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/api/vagas') {
      try {
        res.writeHead(200, { 'content-type': TYPES['.json'] }).end(JSON.stringify(await vagas(url)));
      } catch (erro) {
        console.error(erro);
        res.writeHead(502, { 'content-type': TYPES['.json'] }).end(JSON.stringify({ erro: 'Fonte de vagas indisponível' }));
      }
      return;
    }

    // a página usa caminhos relativos (./app.js), então a raiz redireciona
    // em vez de servir o HTML direto — senão o navegador procura /app.js
    if (url.pathname === '/') {
      res.writeHead(302, { location: INDEX }).end();
      return;
    }

    try {
      const path = url.pathname;
      // impede escapar da raiz via ".." antes de qualquer acesso ao disco
      const target = resolve(ROOT, `.${normalize(path)}`);
      if (target !== ROOT && !target.startsWith(ROOT + sep)) {
        res.writeHead(403).end('403');
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
  },
);

server.listen(PORT, () => {
  const modo = ADZUNA_APP_ID ? 'vagas reais (Adzuna)' : 'vagas de exemplo';
  console.log(`VagaCerta em http://localhost:${PORT}${INDEX} — ${modo}`);
});
