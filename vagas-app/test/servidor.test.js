import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarServidor, arquivoDe } from '../src/servidor/app.js';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** @param {Partial<import('../src/servidor/app.js').Config>} [extra] */
async function subir(extra = {}) {
  const dados = await mkdtemp(join(tmpdir(), 'vagacerta-'));
  const s = criarServidor({ raiz: RAIZ, dados, painelChave: 'segredo', twa: { pacote: 'app.vagacerta', sha256: 'AB:CD' }, ...extra });
  await s.pronto;
  await new Promise((ok) => s.servidor.listen(0, () => ok(null)));
  const porta = /** @type {any} */ (s.servidor.address()).port;
  const base = `http://127.0.0.1:${porta}`;
  return {
    base, dados,
    fim: async () => { await new Promise((ok) => s.servidor.close(ok)); await rm(dados, { recursive: true, force: true }); },
  };
}

test('arquivoDe mapeia o app na raiz e bloqueia fuga e código do servidor', () => {
  assert.equal(arquivoDe(RAIZ, '/'), join(RAIZ, 'src/ui/index.html'));
  assert.equal(arquivoDe(RAIZ, '/app.js'), join(RAIZ, 'src/ui/app.js'));
  assert.equal(arquivoDe(RAIZ, '/core/busca.js'), join(RAIZ, 'src/core/busca.js'));
  assert.equal(arquivoDe(RAIZ, '/../../package.json'), join(RAIZ, 'src/ui/package.json'), 'normalize não sobe além da raiz');
  assert.equal(arquivoDe(RAIZ, '/core/../servidor/app.js'), null);
  assert.equal(arquivoDe(RAIZ, '/core/../integracoes/whatsapp.js'), null);
});

test('app, módulos e ícones servidos com tipo, compressão e segurança', async () => {
  const s = await subir();
  try {
    const html = await fetch(`${s.base}/`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(html.headers.get('content-encoding'), 'gzip');
    assert.equal(html.headers.get('x-content-type-options'), 'nosniff');
    assert.match(html.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    const texto = await html.text();
    assert.match(texto, /<title>VagaCerta<\/title>/);
    assert.match(texto, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/marca\/og\.jpg"/, 'endereço absoluto na prévia de link');
    const mf = await fetch(`${s.base}/manifest.webmanifest`);
    assert.match(mf.headers.get('content-type') ?? '', /manifest\+json/);
    assert.equal((await mf.json()).short_name, 'VagaCerta');
    assert.equal((await fetch(`${s.base}/sw.js`)).headers.get('service-worker-allowed'), '/');
    assert.equal((await fetch(`${s.base}/core/busca.js`)).status, 200);
    const svg = await fetch(`${s.base}/marca/simbolo.svg`);
    assert.equal(svg.headers.get('cache-control'), 'public, max-age=604800');
    assert.equal((await fetch(`${s.base}/nada.js`)).status, 404);
  } finally { await s.fim(); }
});

test('API: saúde, vagas de exemplo, sugestões e 404', async () => {
  const s = await subir();
  try {
    assert.deepEqual(await (await fetch(`${s.base}/api/saude`)).json(), { ok: true, fontes: [], modo: 'exemplo' });
    const v = await (await fetch(`${s.base}/api/vagas`)).json();
    assert.equal(v.fonte, 'exemplo');
    assert.ok(v.vagas.length > 40);
    const sug = await (await fetch(`${s.base}/api/sugestoes?q=mot`)).json();
    assert.ok(sug.sugestoes.some((/** @type {string} */ x) => /Motorista/.test(x)));
    assert.equal((await fetch(`${s.base}/api/inexistente`)).status, 404);
  } finally { await s.fim(); }
});

test('API: vagas reais vêm das fontes configuradas', async () => {
  const vaga = { id: 'x1', titulo: 'Soldador', empresa: 'Metal', cidade: 'Joinville', uf: 'SC' };
  const s = await subir({ fontes: [{ nome: 'Falsa', buscar: async () => [/** @type {any} */ (vaga)] }] });
  try {
    const v = await (await fetch(`${s.base}/api/vagas?q=soldador`)).json();
    assert.equal(v.fonte, 'ao-vivo');
    assert.deepEqual(v.vagas.map((/** @type {any} */ x) => x.id), ['x1']);
    assert.deepEqual(v.fontes.map((/** @type {any} */ f) => [f.nome, f.ok]), [['Falsa', true]]);
  } finally { await s.fim(); }
});

test('API: eventos entram no funil, que exige a chave', async () => {
  const s = await subir();
  try {
    const post = (/** @type {any} */ corpo) => fetch(`${s.base}/api/eventos`, { method: 'POST', body: JSON.stringify(corpo) });
    assert.equal((await post({ nome: 'visita', sessao: 'abcdef123' })).status, 204);
    assert.equal((await post({ nome: 'hack', sessao: 'abcdef123' })).status, 400);
    assert.equal((await fetch(`${s.base}/api/eventos`, { method: 'POST', body: 'x'.repeat(10_000) }).catch(() => ({ status: 400 }))).status, 400);
    assert.equal((await fetch(`${s.base}/api/funil?chave=errada`)).status, 403);
    const f = await (await fetch(`${s.base}/api/funil?chave=segredo`)).json();
    assert.equal(f.funil[0].sessoes, 1);
    assert.match(await readFile(join(s.dados, 'eventos.jsonl'), 'utf8'), /"visita"/);
  } finally { await s.fim(); }
});

test('API: alertas validam, não duplicam e persistem', async () => {
  const s = await subir();
  try {
    const post = (/** @type {any} */ corpo) => fetch(`${s.base}/api/alertas`, { method: 'POST', body: JSON.stringify(corpo) });
    const ruim = await post({ telefone: '123', texto: 'motorista' });
    assert.equal(ruim.status, 400);
    assert.match((await ruim.json()).erro, /celular/);
    const a = await (await post({ telefone: '(11) 98765-4321', texto: 'motorista', uf: 'SP' })).json();
    const b = await (await post({ telefone: '11 98765 4321', texto: 'motorista', uf: 'SP' })).json();
    assert.equal(a.id, b.id);
    const salvos = JSON.parse(await readFile(join(s.dados, 'alertas.json'), 'utf8'));
    assert.equal(salvos.length, 1);
    assert.equal(salvos[0].telefone, '5511987654321');
  } finally { await s.fim(); }
});

test('API: limite de requisições devolve 429 com retry-after', async () => {
  const s = await subir();
  try {
    let ultimo;
    for (let i = 0; i < 12; i++) ultimo = await fetch(`${s.base}/api/alertas`, { method: 'POST', body: '{}' });
    assert.equal(ultimo?.status, 429);
    assert.ok(Number(ultimo?.headers.get('retry-after')) >= 1);
  } finally { await s.fim(); }
});

test('assetlinks.json prova o app Android', async () => {
  const s = await subir();
  try {
    const r = await (await fetch(`${s.base}/.well-known/assetlinks.json`)).json();
    assert.equal(r[0].target.package_name, 'app.vagacerta');
    assert.deepEqual(r[0].target.sha256_cert_fingerprints, ['AB:CD']);
  } finally { await s.fim(); }
});
