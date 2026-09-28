#!/usr/bin/env node
/**
 * Servidor do protótipo: interface, busca de vagas e funil de conversão.
 *
 *   node tools/serve.js                        # vagas de exemplo
 *   ADZUNA_APP_ID=.. ADZUNA_APP_KEY=.. \
 *   JOOBLE_KEY=.. CAREERJET_AFFID=.. \
 *   PAINEL_CHAVE=segredo node tools/serve.js    # vagas reais + painel protegido
 *
 * Rotas:
 *   GET  /api/vagas?q=&onde=&pagina=   vagas (reais se houver chave, senão exemplo)
 *   POST /api/eventos                  registra um clique do funil
 *   GET  /api/funil?chave=             funil de conversão (exige PAINEL_CHAVE)
 *
 * Sem chave nenhuma, /api/vagas devolve só as vagas de exemplo. Com chave,
 * devolve só vagas reais: vaga fictícia nunca se mistura com vaga real.
 */

import { createServer } from 'node:http';
import { readFile, stat, appendFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { buscarAdzuna } from '../src/sources/adzuna.js';
import { buscarJooble } from '../src/sources/jooble.js';
import { buscarCareerjet } from '../src/sources/careerjet.js';
import { criarAgregador } from '../src/sources/agregador.js';
import { validarEvento, registrar, funil } from '../src/core/metricas.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DADOS = resolve(ROOT, 'dados');
const ARQ_EVENTOS = resolve(DADOS, 'eventos.jsonl');
const PORT = Number(process.env.PORT ?? 8080);
const INDEX = '/src/ui/index.html';
const LIMITE_CORPO = 4 * 1024;
const env = process.env;

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/* --- fontes de vagas -------------------------------------------------- */

/** @type {import('../src/sources/agregador.js').Fonte[]} */
const fontes = [];
if (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY) {
  const appId = env.ADZUNA_APP_ID;
  const appKey = env.ADZUNA_APP_KEY;
  fontes.push({ nome: 'Adzuna', buscar: (p) => buscarAdzuna({ ...p, appId, appKey }) });
}
if (env.JOOBLE_KEY) {
  const chave = env.JOOBLE_KEY;
  fontes.push({ nome: 'Jooble', buscar: (p) => buscarJooble({ ...p, chave }) });
}
if (env.CAREERJET_AFFID) {
  const affid = env.CAREERJET_AFFID;
  fontes.push({ nome: 'Careerjet', buscar: (p) => buscarCareerjet({ ...p, affid }) });
}
const agregador = criarAgregador({ fontes });

/** @param {URL} url */
async function vagas(url) {
  if (fontes.length === 0) return { fonte: 'exemplo', fontes: [], vagas: vagasDeExemplo() };
  const r = await agregador.buscar({
    what: (url.searchParams.get('q') ?? '').slice(0, 100),
    where: (url.searchParams.get('onde') ?? '').slice(0, 60),
    pagina: Math.min(10, Math.max(1, Number(url.searchParams.get('pagina')) || 1)),
  });
  return { fonte: 'ao-vivo', ...r };
}

/* --- eventos do funil ------------------------------------------------- */

/** @type {import('../src/core/metricas.js').Evento[]} */
let eventos = [];
try {
  const texto = await readFile(ARQ_EVENTOS, 'utf8');
  for (const linha of texto.split('\n')) if (linha) eventos = registrar(eventos, JSON.parse(linha));
} catch {
  // primeiro uso: ainda não há arquivo
}

/** @param {import('node:http').IncomingMessage} req */
function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let tamanho = 0;
    /** @type {Buffer[]} */
    const partes = [];
    req.on('data', (/** @type {Buffer} */ c) => {
      tamanho += c.length;
      if (tamanho > LIMITE_CORPO) { falha(new Error('corpo grande demais')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => ok(Buffer.concat(partes).toString('utf8')));
    req.on('error', falha);
  });
}

/** @param {string} recebida */
function chaveDoPainelConfere(recebida) {
  const certa = env.PAINEL_CHAVE;
  if (!certa) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(certa);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* --- servidor ----------------------------------------------------------- */

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} corpo
 */
const json = (res, status, corpo) => res.writeHead(status, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' }).end(JSON.stringify(corpo));

const server = createServer(
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/api/vagas' && req.method === 'GET') {
      try {
        json(res, 200, await vagas(url));
      } catch (erro) {
        console.error(erro);
        json(res, 502, { erro: 'Fonte de vagas indisponível' });
      }
      return;
    }

    if (url.pathname === '/api/eventos' && req.method === 'POST') {
      try {
        const evento = validarEvento(JSON.parse(await lerCorpo(req)), Date.now());
        if (!evento) { json(res, 400, { erro: 'evento inválido' }); return; }
        eventos = registrar(eventos, evento);
        await mkdir(DADOS, { recursive: true });
        await appendFile(ARQ_EVENTOS, `${JSON.stringify(evento)}\n`);
        res.writeHead(204).end();
      } catch {
        json(res, 400, { erro: 'evento inválido' });
      }
      return;
    }

    if (url.pathname === '/api/funil' && req.method === 'GET') {
      if (!chaveDoPainelConfere(url.searchParams.get('chave') ?? '')) {
        json(res, 403, { erro: 'Defina PAINEL_CHAVE no servidor e passe ?chave=' });
        return;
      }
      json(res, 200, { total: eventos.length, funil: funil(eventos) });
      return;
    }

    // a página usa caminhos relativos (./app.js), então a raiz redireciona
    // em vez de servir o HTML direto — senão o navegador procura /app.js
    if (url.pathname === '/') {
      res.writeHead(302, { location: INDEX }).end();
      return;
    }

    try {
      // impede escapar da raiz via ".." e esconde a pasta de dados
      const target = resolve(ROOT, `.${normalize(url.pathname)}`);
      if ((target !== ROOT && !target.startsWith(ROOT + sep)) || target.startsWith(DADOS)) {
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
  const modo = fontes.length ? `vagas reais (${fontes.map((f) => f.nome).join(', ')})` : 'vagas de exemplo';
  console.log(`VagaCerta em http://localhost:${PORT}${INDEX} — ${modo}`);
  if (!env.PAINEL_CHAVE) console.log('Painel do funil desligado: defina PAINEL_CHAVE para ver /api/funil.');
});
