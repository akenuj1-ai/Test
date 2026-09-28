import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANOS, podeUsar, registrarUso, restantes, economiaAnual, ehPago } from '../src/core/planos.js';
import { HOJE } from './ajuda.js';

test('grátis tem 1 currículo por dia; o segundo é bloqueado', () => {
  let uso = {};
  assert.ok(podeUsar('gratis', 'curriculo', uso, HOJE));
  uso = registrarUso('curriculo', uso, HOJE);
  assert.ok(!podeUsar('gratis', 'curriculo', uso, HOJE));
  assert.ok(podeUsar('gratis', 'carta', uso, HOJE), 'cotas são por recurso');
});

test('a cota zera no dia seguinte e o registro antigo é descartado', () => {
  const uso = registrarUso('curriculo', {}, HOJE);
  const amanha = new Date(HOJE.getTime() + 86_400_000);
  assert.ok(podeUsar('gratis', 'curriculo', uso, amanha));
  const novo = registrarUso('carta', uso, amanha);
  assert.deepEqual(Object.keys(novo), ['2026-09-29']);
});

test('Pro é ilimitado e custa R$ 19,90', () => {
  let uso = {};
  for (let i = 0; i < 50; i++) uso = registrarUso('curriculo', uso, HOJE);
  assert.ok(podeUsar('pro', 'curriculo', uso, HOJE));
  assert.equal(restantes('pro', 'curriculo', uso, HOJE), Infinity);
  assert.equal(PLANOS.pro.precoMensal, 1990);
});

test('alertas não existem no grátis', () => {
  assert.ok(!podeUsar('gratis', 'alerta', {}, HOJE));
});

test('anual é ilimitado e a economia anunciada é a conta real', () => {
  assert.ok(podeUsar('anual', 'curriculo', registrarUso('curriculo', {}, HOJE), HOJE));
  const e = economiaAnual();
  assert.equal(e.centavos, 1990 * 12 - 14900);
  assert.equal(e.porcento, 38);
  // o "equivalente mensal" exibido bate com o preço anual
  assert.ok(Math.abs(PLANOS.anual.precoMensal * 12 - /** @type {number} */ (PLANOS.anual.precoAnual)) < 12);
  assert.ok(ehPago('anual') && ehPago('pro') && !ehPago('gratis'));
});
