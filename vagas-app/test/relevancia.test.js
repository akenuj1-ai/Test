import test from 'node:test';
import assert from 'node:assert/strict';
import { distancia, casamento, relevancia, sinonimos, sugestoes } from '../src/core/relevancia.js';
import { buscar } from '../src/core/busca.js';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { HOJE } from './ajuda.js';

const vagas = vagasDeExemplo(HOJE);
const ids = (/** @type {string} */ texto) => buscar(vagas, { texto }, null, HOJE).map((i) => i.vaga.id);

test('distância de edição conta troca de letras vizinhas como um erro', () => {
  assert.equal(distancia('motorista', 'motorista', 2), 0);
  assert.equal(distancia('motorsita', 'motorista', 2), 1);
  assert.equal(distancia('eletrisista', 'eletricista', 2), 1);
  assert.equal(distancia('casa', 'motorista', 2), 3, 'passa do limite e para');
});

test('casamento: exato > sinônimo > prefixo > erro de digitação', () => {
  assert.equal(casamento('motorista', ['motorista']), 1);
  assert.equal(casamento('condutor', ['motorista']), 0.85);
  assert.equal(casamento('eletri', ['eletricista']), 0.75);
  assert.equal(casamento('motorsita', ['motorista']), 0.6);
  assert.equal(casamento('faxinera', ['limpeza']), 0.5);
  assert.equal(casamento('ab', ['abc']), 0, 'termo curto demais não usa prefixo nem erro');
});

test('sinônimos funcionam nos dois sentidos', () => {
  assert.ok(sinonimos('adm').includes('administrativo'));
  assert.ok(sinonimos('Faxineira').includes('limpeza'));
});

test('busca acha a vaga pelo jeito que o candidato escreve', () => {
  assert.ok(ids('faxineira').includes('v16'), 'faxineira → auxiliar de limpeza');
  assert.ok(ids('adm').includes('v05'), 'adm → auxiliar administrativo');
  assert.ok(ids('motorsita').includes('v01'), 'erro de digitação');
  assert.ok(ids('faxinera').includes('v16'), 'erro de digitação + sinônimo');
  assert.ok(ids('home office').includes('v06'), 'home office → remoto');
  assert.ok(ids('carteira assinada motorista').includes('v01'), 'carteira assinada → CLT');
  assert.ok(ids('primeiro emprego').includes('v09'), 'primeiro emprego → vaga com treinamento');
  assert.deepEqual(ids('xyzw'), []);
});

test('casar no título vem antes de casar só na descrição', () => {
  const r = ids('motorista');
  assert.match(/** @type {any} */ (vagas.find((v) => v.id === r[0])).titulo, /Motorista/);
  assert.ok(relevancia(/** @type {any} */ (vagas.find((v) => v.id === 'v01')), 'motorista') > relevancia(/** @type {any} */ (vagas.find((v) => v.id === 'v04')), 'motorista'));
});

test('sugestões completam pelo começo de qualquer palavra', () => {
  const s = sugestoes(vagas, 'mot');
  assert.ok(s.length > 0 && s.every((x) => /\bmot/i.test(x)));
  assert.ok(sugestoes(vagas, '').length === 6);
});
