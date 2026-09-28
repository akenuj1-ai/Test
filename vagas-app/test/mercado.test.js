import test from 'node:test';
import assert from 'node:assert/strict';
import { medianasPorArea, comparacaoSalarial, salarioMedioDaVaga, AMOSTRA_MINIMA } from '../src/core/mercado.js';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { HOJE } from './ajuda.js';

const base = vagasDeExemplo(HOJE)[0];
const v = (/** @type {number | null} */ min, /** @type {number | null} */ max, area = 'X') => ({ ...base, salarioMin: min, salarioMax: max, area });

test('salário médio da vaga aceita lados ausentes', () => {
  assert.equal(salarioMedioDaVaga(v(100, 300)), 200);
  assert.equal(salarioMedioDaVaga(v(100, null)), 100);
  assert.equal(salarioMedioDaVaga(v(null, null)), null);
});

test('mediana só existe com amostra mínima', () => {
  const poucas = Array.from({ length: AMOSTRA_MINIMA - 1 }, () => v(100, 100));
  assert.equal(medianasPorArea(poucas).size, 0);
  const m = medianasPorArea([v(100, 100), v(200, 200), v(300, 300), v(1000, 1000)]);
  assert.equal(m.get('X'), 250);
});

test('comparação em porcentagem, ou null sem dado', () => {
  const m = new Map([['X', 200]]);
  assert.equal(comparacaoSalarial(v(240, 240), m), 20);
  assert.equal(comparacaoSalarial(v(null, null), m), null);
  assert.equal(comparacaoSalarial(v(240, 240, 'Y'), m), null);
});
