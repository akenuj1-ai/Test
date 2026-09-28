import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCelular, criarAlerta, vagasNovasDoAlerta, mensagemDoAlerta } from '../src/core/alertas.js';
import { enviarTexto, enviarModelo } from '../src/integracoes/whatsapp.js';
import { criarLimitador } from '../src/servidor/limite.js';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { HOJE } from './ajuda.js';

test('normalizarCelular aceita formatos comuns e recusa o resto', () => {
  assert.equal(normalizarCelular('(11) 98765-4321'), '5511987654321');
  assert.equal(normalizarCelular('+55 21 99876 5432'), '5521998765432');
  assert.equal(normalizarCelular('011987654321'), '5511987654321');
  assert.equal(normalizarCelular('(11) 3876-5432'), null, 'fixo não tem WhatsApp');
  assert.equal(normalizarCelular('(20) 98765-4321'), null, 'DDD inexistente');
  assert.equal(normalizarCelular('abc'), null);
});

test('criarAlerta valida telefone, estado e busca', () => {
  assert.match(/** @type {any} */ (criarAlerta({ telefone: '123' }, HOJE, 'a')).erro, /celular/);
  assert.match(/** @type {any} */ (criarAlerta({ telefone: '11987654321', uf: 'XYZ' }, HOJE, 'a')).erro, /Estado/);
  assert.match(/** @type {any} */ (criarAlerta({ telefone: '11987654321' }, HOJE, 'a')).erro, /buscar/);
  const r = /** @type {any} */ (criarAlerta({ telefone: '11987654321', texto: ' motorista ', uf: 'sp' }, HOJE, 'a1'));
  assert.deepEqual(r.alerta, { id: 'a1', telefone: '5511987654321', texto: 'motorista', uf: 'SP', criadoEm: '2026-09-28', ultimoEnvio: '' });
});

test('vagasNovasDoAlerta: só depois do último envio, sem golpe, com limite', () => {
  const vagas = vagasDeExemplo(HOJE);
  const alerta = { id: 'a', telefone: '5511987654321', texto: 'motorista', uf: 'SP', criadoEm: '2026-09-20', ultimoEnvio: '2026-09-26' };
  const novas = vagasNovasDoAlerta(alerta, vagas, HOJE);
  assert.ok(novas.length > 0);
  assert.ok(novas.every((v) => v.publicadaEm > '2026-09-26' && (v.uf === 'SP' || v.modalidade === 'remoto')));
  assert.equal(vagasNovasDoAlerta({ ...alerta, ultimoEnvio: '2026-09-28' }, vagas, HOJE).length, 0);
  const golpe = vagasNovasDoAlerta({ ...alerta, texto: 'digitador', uf: '' , ultimoEnvio: '2026-01-01' }, vagas, HOJE);
  assert.ok(golpe.every((v) => !v.id.startsWith('g')));
});

test('mensagem do alerta traz vagas, link e como sair', () => {
  const vagas = vagasDeExemplo(HOJE).slice(0, 2);
  const m = mensagemDoAlerta({ id: 'a', telefone: '', texto: 'motorista', uf: 'SP', criadoEm: '', ultimoEnvio: '' }, vagas, 'https://vagacerta.app');
  assert.match(m, /2 vagas novas para "motorista em SP"/);
  assert.match(m, /Motorista Entregador — Rota Sul Logística, São Paulo\/SP/);
  assert.match(m, /https:\/\/vagacerta\.app/);
  assert.match(m, /SAIR/);
});

test('WhatsApp: texto e modelo no formato da Cloud API, erro legível', async () => {
  /** @type {any[]} */
  const chamadas = [];
  /** @type {any} */
  const ok = async (/** @type {string} */ url, /** @type {any} */ init) => { chamadas.push([url, init]); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) }; };
  assert.equal(await enviarTexto({ token: 't', numeroId: '123', para: '5511987654321', texto: 'oi' }, ok), 'wamid.1');
  assert.match(chamadas[0][0], /graph\.facebook\.com\/v\d+\.\d+\/123\/messages$/);
  assert.equal(chamadas[0][1].headers.authorization, 'Bearer t');
  assert.deepEqual(JSON.parse(chamadas[0][1].body), { messaging_product: 'whatsapp', to: '5511987654321', type: 'text', text: { body: 'oi', preview_url: true } });

  await enviarModelo({ token: 't', numeroId: '123', para: '55', modelo: 'vagas_novas', parametros: ['3', 'motorista'] }, ok);
  const corpo = JSON.parse(chamadas[1][1].body);
  assert.equal(corpo.template.name, 'vagas_novas');
  assert.equal(corpo.template.language.code, 'pt_BR');
  assert.deepEqual(corpo.template.components[0].parameters, [{ type: 'text', text: '3' }, { type: 'text', text: 'motorista' }]);

  /** @type {any} */
  const falha = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'token inválido' } }) });
  await assert.rejects(enviarTexto({ token: 't', numeroId: '1', para: '5', texto: 'x' }, falha), /401: token inválido/);
});

test('limitador: gasta fichas, bloqueia e recupera com o tempo', () => {
  let t = 0;
  const l = criarLimitador({ capacidade: 3, porSegundo: 1, agora: () => t });
  assert.ok(l.consumir('ip').ok && l.consumir('ip').ok && l.consumir('ip').ok);
  const bloqueio = l.consumir('ip');
  assert.equal(bloqueio.ok, false);
  assert.equal(bloqueio.tenteEm, 1);
  assert.ok(l.consumir('outro-ip').ok, 'cada cliente tem seu balde');
  t = 1000;
  assert.ok(l.consumir('ip').ok);
  assert.equal(l.consumir('ip').ok, false);
});
