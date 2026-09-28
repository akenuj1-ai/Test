/**
 * Servidor do VagaCerta: app (PWA), API de vagas, alertas e funil.
 *
 * Rotas da API (detalhes em docs/API.md):
 *   GET  /api/saude                     está no ar? quais fontes?
 *   GET  /api/vagas?q=&onde=&pagina=    vagas (reais com chave, senão exemplo)
 *   GET  /api/sugestoes?q=              completar a busca
 *   POST /api/eventos                   clique do funil
 *   POST /api/alertas                   criar alerta de vagas no WhatsApp
 *   GET  /api/funil?chave=              funil de conversão (PAINEL_CHAVE)
 *   GET  /.well-known/assetlinks.json   prova de dono para o app da Play Store
 *
 * O app é servido na raiz: "/" é src/ui/index.html, "/core/..." é src/core.
 */

import { createServer } from 'node:http';
import { readFile, appendFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { vagasDeExemplo } from '../core/exemplos.js';
import { sugestoes } from '../core/relevancia.js';
import { criarAgregador } from '../sources/agregador.js';
import { validarEvento, registrar, funil } from '../core/metricas.js';
import { criarAlerta } from '../core/alertas.js';
import { criarLimitador } from './limite.js';

/** @typedef {import('../sources/agregador.js').Fonte} Fonte */

/**
 * @typedef {Object} Config
 * @property {string} raiz           pasta do projeto (contém src/)
 * @property {string} dados          pasta gravável para eventos e alertas
 * @property {Fonte[]} [fontes]      fontes de vagas reais; vazio = exemplo
 * @property {string} [painelChave]
 * @property {{ pacote: string, sha256: string } | null} [twa]  app Android (Play Store)
 * @property {string} [urlPublica]   endereço público (https://...), usado nas prévias de link
 * @property {() => Date} [agora]
 */

const TIPOS = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
});
const COMPRIMIVEL = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt', '.xml']);
const LIMITE_CORPO = 4 * 1024;

const SEGURANCA = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

/**
 * Caminho público → arquivo. null = fora do que pode ser servido.
 * @param {string} raiz
 * @param {string} caminho
 */
export function arquivoDe(raiz, caminho) {
  const src = resolve(raiz, 'src');
  let alvo;
  if (caminho === '/' || caminho === '/index.html') alvo = resolve(src, 'ui/index.html');
  else if (caminho.startsWith('/core/') || caminho.startsWith('/sources/')) alvo = resolve(src, `.${normalize(caminho)}`);
  else alvo = resolve(src, 'ui', `.${normalize(caminho)}`);
  // nada fora de src/, e nada de código do servidor ou integrações
  if (!alvo.startsWith(src + sep)) return null;
  if (alvo.startsWith(resolve(src, 'servidor')) || alvo.startsWith(resolve(src, 'integracoes'))) return null;
  return alvo;
}

/**
 * @param {Config} config
 */
export function criarServidor(config) {
  const agora = config.agora ?? (() => new Date());
  const fontes = config.fontes ?? [];
  const agregador = criarAgregador({ fontes });
  const limiteApi = criarLimitador({ capacidade: 30, porSegundo: 1 });
  const limiteEscrita = criarLimitador({ capacidade: 10, porSegundo: 0.2 });
  const arqEventos = resolve(config.dados, 'eventos.jsonl');
  const arqAlertas = resolve(config.dados, 'alertas.json');
  /** @type {Map<string, { corpo: Buffer, gz: Buffer | null, tipo: string }>} */
  const cacheArquivos = new Map();

  /** @type {import('../core/metricas.js').Evento[]} */
  let eventos = [];
  /** @type {import('../core/alertas.js').Alerta[]} */
  let alertas = [];
  const pronto = (async () => {
    await mkdir(config.dados, { recursive: true });
    try {
      for (const linha of (await readFile(arqEventos, 'utf8')).split('\n')) if (linha) eventos = registrar(eventos, JSON.parse(linha));
    } catch { /* primeiro uso */ }
    try { alertas = JSON.parse(await readFile(arqAlertas, 'utf8')); } catch { /* primeiro uso */ }
  })();

  /** @param {URL} url */
  async function vagas(url) {
    if (fontes.length === 0) return { fonte: 'exemplo', fontes: [], vagas: vagasDeExemplo(agora()) };
    const r = await agregador.buscar({
      what: (url.searchParams.get('q') ?? '').slice(0, 100),
      where: (url.searchParams.get('onde') ?? '').slice(0, 60),
      pagina: Math.min(10, Math.max(1, Number(url.searchParams.get('pagina')) || 1)),
    });
    return { fonte: 'ao-vivo', ...r };
  }

  /** @param {string} recebida */
  function chaveConfere(recebida) {
    if (!config.painelChave) return false;
    const a = Buffer.from(recebida);
    const b = Buffer.from(config.painelChave);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** @param {import('node:http').IncomingMessage} req */
  function lerCorpo(req) {
    return new Promise((ok, falha) => {
      let tamanho = 0;
      /** @type {Buffer[]} */
      const partes = [];
      req.on('data', (/** @type {Buffer} */ c) => {
        tamanho += c.length;
        if (tamanho > LIMITE_CORPO) { falha(new Error('grande demais')); req.destroy(); return; }
        partes.push(c);
      });
      req.on('end', () => ok(Buffer.concat(partes).toString('utf8')));
      req.on('error', falha);
    });
  }

  /** @param {import('node:http').IncomingMessage} req */
  const ipDe = (req) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {number} status
   * @param {unknown} corpo
   */
  function json(req, res, status, corpo) {
    enviar(req, res, status, Buffer.from(JSON.stringify(corpo)), '.json', 'no-store');
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {number} status
   * @param {Buffer} corpo
   * @param {string} ext
   * @param {string} cache
   * @param {Buffer | null} [gz]
   */
  function enviar(req, res, status, corpo, ext, cache, gz = null) {
    const aceitaGz = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    const comprimir = aceitaGz && COMPRIMIVEL.has(ext) && corpo.length > 1024;
    const saida = comprimir ? (gz ?? gzipSync(corpo)) : corpo;
    res.writeHead(status, {
      ...SEGURANCA,
      'content-type': TIPOS[ext] ?? 'application/octet-stream',
      'cache-control': cache,
      vary: 'accept-encoding',
      ...(comprimir ? { 'content-encoding': 'gzip' } : {}),
      'content-length': saida.length,
    });
    res.end(req.method === 'HEAD' ? undefined : saida);
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {URL} url
   */
  async function api(req, res, url) {
    const rota = `${req.method} ${url.pathname}`;
    const escrita = req.method === 'POST';
    const limite = (escrita && url.pathname === '/api/alertas' ? limiteEscrita : limiteApi).consumir(`${ipDe(req)}|${escrita ? 'w' : 'r'}`);
    if (!limite.ok) {
      res.setHeader('retry-after', String(limite.tenteEm));
      json(req, res, 429, { erro: 'Muitas requisições. Tente de novo em instantes.' });
      return;
    }

    switch (rota) {
      case 'GET /api/saude':
        json(req, res, 200, { ok: true, fontes: fontes.map((f) => f.nome), modo: fontes.length ? 'ao-vivo' : 'exemplo' });
        return;
      case 'GET /api/vagas':
        try {
          json(req, res, 200, await vagas(url));
        } catch (erro) {
          console.error(erro);
          json(req, res, 502, { erro: 'Fonte de vagas indisponível' });
        }
        return;
      case 'GET /api/sugestoes': {
        const { vagas: lista } = await vagas(new URL('/api/vagas', url));
        json(req, res, 200, { sugestoes: sugestoes(lista, (url.searchParams.get('q') ?? '').slice(0, 40), 8) });
        return;
      }
      case 'POST /api/eventos':
        try {
          const evento = validarEvento(JSON.parse(await lerCorpo(req)), agora().getTime());
          if (!evento) { json(req, res, 400, { erro: 'evento inválido' }); return; }
          eventos = registrar(eventos, evento);
          await appendFile(arqEventos, `${JSON.stringify(evento)}\n`);
          res.writeHead(204, SEGURANCA).end();
        } catch {
          json(req, res, 400, { erro: 'evento inválido' });
        }
        return;
      case 'POST /api/alertas':
        try {
          const r = criarAlerta(JSON.parse(await lerCorpo(req)), agora(), randomUUID());
          if ('erro' in r) { json(req, res, 400, r); return; }
          // um alerta por telefone e busca: pedir de novo não duplica
          const igual = alertas.find((a) => a.telefone === r.alerta.telefone && a.texto === r.alerta.texto && a.uf === r.alerta.uf);
          if (!igual) {
            alertas = [...alertas, r.alerta].slice(-20_000);
            await writeFile(arqAlertas, JSON.stringify(alertas));
          }
          json(req, res, 201, { id: (igual ?? r.alerta).id });
        } catch {
          json(req, res, 400, { erro: 'pedido inválido' });
        }
        return;
      case 'GET /api/funil':
        if (!chaveConfere(url.searchParams.get('chave') ?? '')) {
          json(req, res, 403, { erro: 'Defina PAINEL_CHAVE no servidor e passe ?chave=' });
          return;
        }
        json(req, res, 200, { total: eventos.length, alertas: alertas.length, funil: funil(eventos) });
        return;
      default:
        json(req, res, 404, { erro: 'rota não encontrada' });
    }
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {URL} url
   */
  async function estatico(req, res, url) {
    if (url.pathname === '/.well-known/assetlinks.json') {
      if (!config.twa) { json(req, res, 404, { erro: 'app Android não configurado' }); return; }
      json(req, res, 200, [{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: config.twa.pacote, sha256_cert_fingerprints: [config.twa.sha256] },
      }]);
      return;
    }
    const arquivo = arquivoDe(config.raiz, decodeURIComponent(url.pathname));
    if (!arquivo) { res.writeHead(403, SEGURANCA).end('403'); return; }
    try {
      let item = cacheArquivos.get(arquivo);
      if (!item) {
        const corpo = await readFile(arquivo);
        const ext = extname(arquivo);
        item = { corpo, gz: COMPRIMIVEL.has(ext) && corpo.length > 1024 ? gzipSync(corpo) : null, tipo: ext };
        if (process.env.NODE_ENV === 'production') cacheArquivos.set(arquivo, item);
      }
      // a marca e os ícones mudam raramente; o resto revalida sempre (o
      // service worker cuida do uso offline)
      const cache = url.pathname.startsWith('/marca/') ? 'public, max-age=604800' : 'no-cache';
      if (item.tipo === '.html') {
        // prévia de link (WhatsApp, redes) exige endereço absoluto da imagem
        const base = (config.urlPublica || `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host ?? 'localhost'}`).replace(/\/$/, '');
        const html = Buffer.from(item.corpo.toString('utf8').replaceAll('%URL_PUBLICA%', base.replace(/["<>]/g, '')));
        enviar(req, res, 200, html, '.html', cache);
        return;
      }
      if (url.pathname === '/sw.js') res.setHeader('service-worker-allowed', '/');
      enviar(req, res, 200, item.corpo, item.tipo, cache, item.gz);
    } catch {
      res.writeHead(404, { ...SEGURANCA, 'content-type': 'text/plain; charset=utf-8' }).end('404');
    }
  }

  const servidor = createServer(async (req, res) => {
    await pronto;
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') await estatico(req, res, url);
    else res.writeHead(405, SEGURANCA).end();
  });

  return { servidor, pronto, alertas: () => alertas };
}
