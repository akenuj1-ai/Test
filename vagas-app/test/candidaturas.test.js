import test from 'node:test';
import assert from 'node:assert/strict';
import { moverPara, remover, resumoPorEtapa, precisamDeRetorno } from '../src/core/candidaturas.js';
import { HOJE } from './ajuda.js';

test('mover cria, atualiza e não duplica', () => {
  let l = moverPara([], 'v01', 'salva', HOJE);
  l = moverPara(l, 'v01', 'enviada', HOJE);
  l = moverPara(l, 'v02', 'salva', HOJE);
  assert.equal(l.length, 2);
  assert.equal(l[0].etapa, 'enviada');
  assert.deepEqual(resumoPorEtapa(l).salva, 1);
  assert.equal(remover(l, 'v01').length, 1);
});

test('etapa inválida é recusada', () => {
  assert.throws(() => moverPara([], 'v01', /** @type {any} */ ('sumiu'), HOJE), RangeError);
});

test('enviadas há 7 dias ou mais pedem retorno', () => {
  const antes = new Date(HOJE.getTime() - 8 * 86_400_000);
  let l = moverPara([], 'v01', 'enviada', antes);
  l = moverPara(l, 'v02', 'enviada', HOJE);
  l = moverPara(l, 'v03', 'entrevista', antes);
  assert.deepEqual(precisamDeRetorno(l, HOJE).map((c) => c.vagaId), ['v01']);
});
