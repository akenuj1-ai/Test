import test from 'node:test';
import assert from 'node:assert/strict';
import { payToCents, applyMultiplier, assertInt, formatCents, formatMultiplier } from '../src/engine/money.js';
import { BET_LEVELS_CENTS, PAYTABLE, SCATTER_PAYS, PAYING_FIRST, PAYING_LAST } from '../src/engine/config.js';

test('conversao de premio para centavos e exata para toda aposta e todo premio', () => {
  const pays = [];
  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) for (const [, , p] of PAYTABLE[s]) pays.push(p);
  pays.push(...SCATTER_PAYS.filter((p) => p > 0));

  for (const bet of BET_LEVELS_CENTS) {
    for (const pay of pays) {
      const cents = payToCents(bet, pay);
      assert.ok(Number.isInteger(cents), `nao inteiro: ${bet} x ${pay}`);
      // exatidao: o produto tem de ser divisivel por 100, sem arredondamento
      assert.equal(cents * 100, bet * pay, `arredondou: ${bet} x ${pay}`);
    }
  }
});

test('invariante de divisibilidade: apostas multiplas de 20, premios multiplos de 5', () => {
  for (const bet of BET_LEVELS_CENTS) assert.equal(bet % 20, 0, `aposta ${bet} nao e multipla de 20`);
  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) {
    for (const [, , pay] of PAYTABLE[s]) assert.equal(pay % 5, 0, `premio ${pay} nao e multiplo de 5`);
  }
  for (const p of SCATTER_PAYS) assert.equal(p % 5, 0, `premio de scatter ${p} nao e multiplo de 5`);
});

test('multiplicador preserva inteiros e recusa valores abaixo de 1', () => {
  assert.equal(applyMultiplier(2500, 7), 17500);
  assert.equal(applyMultiplier(0, 500), 0);
  assert.throws(() => applyMultiplier(100, 0), RangeError);
  assert.throws(() => applyMultiplier(100, -3), RangeError);
});

test('overflow monetario e detectado em vez de silenciosamente impreciso', () => {
  assert.throws(() => applyMultiplier(Number.MAX_SAFE_INTEGER, 2), RangeError);
  assert.throws(() => payToCents(Number.MAX_SAFE_INTEGER, 500), RangeError);
});

test('assertInt rejeita fracionarios e negativos', () => {
  assert.throws(() => assertInt(1.5, 'x'), TypeError);
  assert.throws(() => assertInt(-1, 'x'), RangeError);
  assert.doesNotThrow(() => assertInt(0, 'x'));
});

test('formatacao monetaria e de multiplo', () => {
  assert.match(formatCents(123456), /1\.234,56/);
  assert.equal(formatMultiplier(500, 100), '5,00x');
  assert.equal(formatMultiplier(0, 0), '0x');
});
