import test from 'node:test';
import assert from 'node:assert/strict';
import { funil, validarEvento, registrar, projetarReceita, novaSessao, LIMITE_EVENTOS, ETAPAS_FUNIL } from '../src/core/metricas.js';

/** @param {string} sessao @param {string[]} nomes */
const ev = (sessao, nomes) => nomes.map((nome) => ({ nome, sessao, quando: 0 }));

test('funil conta sessões únicas que passaram por todas as etapas anteriores', () => {
  const eventos = [
    ...ev('aaaaaa1', ['visita', 'abrir_vaga', 'gerar', 'ver_oferta', 'clique_assinar', 'assinou']),
    ...ev('aaaaaa2', ['visita', 'abrir_vaga', 'abrir_vaga', 'gerar']),
    ...ev('aaaaaa3', ['visita']),
    ...ev('aaaaaa4', ['visita', 'ver_oferta']), // pulou etapas: não conta em ver_oferta
  ];
  const f = funil(eventos);
  assert.deepEqual(f.map((e) => e.sessoes), [4, 2, 2, 1, 1, 1]);
  assert.equal(f[1].doTopo, 50);
  assert.equal(f[3].daAnterior, 50);
  assert.equal(f[0].daAnterior, null);
  assert.equal(f.length, ETAPAS_FUNIL.length);
});

test('funil vazio não divide por zero', () => {
  assert.ok(funil([]).every((e) => e.sessoes === 0 && e.doTopo === 0));
});

test('validarEvento descarta nomes e sessões inválidos e limita dados', () => {
  assert.equal(validarEvento({ nome: 'hackear', sessao: 'abcdef12' }, 1), null);
  assert.equal(validarEvento({ nome: 'visita', sessao: '<script>' }, 1), null);
  assert.equal(validarEvento(null, 1), null);
  const e = validarEvento({ nome: 'gerar', sessao: 'abcdef12', dados: { recurso: 'curriculo', n: 2, lixo: { a: 1 }, longo: 'x'.repeat(200) } }, 5);
  assert.deepEqual(e, { nome: 'gerar', sessao: 'abcdef12', quando: 5, dados: { recurso: 'curriculo', n: 2, longo: 'x'.repeat(80) } });
});

test('registrar mantém só os eventos mais recentes', () => {
  let l = /** @type {any[]} */ (Array.from({ length: LIMITE_EVENTOS }, (_, i) => ({ nome: 'visita', sessao: 'abcdef', quando: i })));
  l = registrar(l, { nome: 'visita', sessao: 'abcdef', quando: -1 });
  assert.equal(l.length, LIMITE_EVENTOS);
  assert.equal(l[0].quando, 1);
  assert.equal(l.at(-1).quando, -1);
});

test('projeção de receita: 100 mil usuários, 4% assinam, 30% no anual', () => {
  const r = projetarReceita({ usuarios: 100_000, conversao: 0.04, fracaoAnual: 0.3, precoMensal: 1990, precoAnual: 14900 });
  assert.equal(r.assinantes, 4000);
  assert.equal(r.anuais, 1200);
  assert.equal(r.mensais, 2800);
  assert.equal(r.porMes, 2800 * 1990 + 1200 * 14900 / 12);
  assert.equal(r.porAno, r.porMes * 12);
});

test('novaSessao gera ids válidos e diferentes', () => {
  const a = novaSessao();
  assert.match(a, /^[a-z0-9]{16}$/);
  assert.notEqual(a, novaSessao());
});
