import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID, Sym, SYMBOLS, SYMBOL_COUNT, PAYING_COUNT, PAYTABLE, REEL_COUNTS, MODES,
  FEATURE_TRIGGERS, CAMEL_TONGUE_CHANCE, GORILLA_MULT_VALUES, GORILLA_MULT_WEIGHTS,
  FRENZY_WILD_COUNTS, FRENZY_WILD_WEIGHTS, BET_LEVELS, MONEY_UNIT, MAX_WIN_X100,
  TARGET_RTP, CALIBRATION, SPIT_DOWNGRADE,
} from '../src/freaky/config.js';
import { SKINS } from '../src/freaky/ui/skins.js';

test('grade 6x4 com 4.096 ways', () => {
  assert.equal(GRID.REELS, 6);
  assert.equal(GRID.ROWS, 4);
  assert.equal(GRID.CELLS, 24);
  assert.equal(GRID.ROWS ** GRID.REELS, 4096);
});

test('simbolos: ids na ordem, codigos unicos, todo codigo tem aparencia', () => {
  assert.equal(SYMBOLS.length, SYMBOL_COUNT);
  SYMBOLS.forEach((s, i) => assert.equal(s.id, i));
  const codes = SYMBOLS.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const c of codes) assert.ok(SKINS[c], `sem skin para ${c}`);
  assert.equal(SYMBOLS.filter((s) => s.kind === 'low').length, 4, 'A, K, Q, J');
  assert.equal(SYMBOLS.filter((s) => s.kind === 'high').length, 3, 'macaco, leao, tartaruga');
});

test('aparencia nao mora no motor', () => {
  for (const s of SYMBOLS) {
    assert.deepEqual(Object.keys(s).sort(), ['code', 'id', 'key', 'kind']);
  }
});

test('tabela de premios: inteira, positiva, crescente com o comprimento e com o simbolo', () => {
  assert.equal(PAYTABLE.length, PAYING_COUNT);
  for (const pays of PAYTABLE) {
    assert.equal(pays.length, 4);
    for (let k = 0; k < 4; k++) {
      assert.ok(Number.isInteger(pays[k]) && pays[k] > 0);
      if (k > 0) assert.ok(pays[k] > pays[k - 1], 'premio cresce com o numero de rolos');
    }
  }
  // o Leao paga mais que todo mundo em qualquer comprimento
  for (let k = 0; k < 4; k++) {
    for (let s = 0; s < Sym.LION; s++) assert.ok(PAYTABLE[Sym.LION][k] >= PAYTABLE[s][k]);
  }
});

test('fitas: 6 rolos, sem wild/camelo no rolo 1, sem camelo no rolo 6', () => {
  for (const [name, reels] of Object.entries(REEL_COUNTS)) {
    assert.equal(reels.length, 6, name);
    for (const counts of reels) assert.equal(counts.length, SYMBOL_COUNT, name);
    assert.equal(reels[0][Sym.WILD], 0, `${name}: wild no rolo 1`);
    assert.equal(reels[0][Sym.CAMEL], 0, `${name}: camelo no rolo 1`);
    assert.equal(reels[5][Sym.CAMEL], 0, `${name}: camelo no rolo 6`);
    for (const counts of reels) assert.ok(counts[Sym.SCATTER] > 0, `${name}: todo rolo tem scatter`);
  }
});

test('cuspe rebaixa cada alto para uma carta', () => {
  for (const s of [Sym.LION, Sym.MONKEY, Sym.TURTLE, Sym.CAMEL]) {
    const to = SPIT_DOWNGRADE[s];
    assert.equal(SYMBOLS[to].kind, 'low');
  }
});

test('camelo: lingua mais provavel no bonus, e nunca cospe na Rave', () => {
  assert.ok(CAMEL_TONGUE_CHANCE.base < CAMEL_TONGUE_CHANCE.festa);
  assert.equal(CAMEL_TONGUE_CHANCE.rave, 1);
});

test('gatilhos: 3 = Festa, 4+ = Rave', () => {
  assert.equal(FEATURE_TRIGGERS[3].feature, 'festa');
  for (const k of [4, 5, 6]) assert.equal(FEATURE_TRIGGERS[k].feature, 'rave');
});

test('tabelas de sorteio coerentes', () => {
  assert.equal(GORILLA_MULT_VALUES.length, GORILLA_MULT_WEIGHTS.length);
  assert.equal(FRENZY_WILD_COUNTS.length, FRENZY_WILD_WEIGHTS.length);
  assert.ok(GORILLA_MULT_VALUES.every((v) => Number.isInteger(v) && v >= 2));
});

test('calibragem dentro dos limites', () => {
  for (const p of [CALIBRATION.frenzyChance, CALIBRATION.frenzyChanceLingua, CALIBRATION.huntMix]) {
    assert.ok(p > 0 && p < 1);
  }
});

test('regras da Stake Engine: RTP 90%-98%, custos inteiros x100, teto 25.000x', () => {
  assert.ok(TARGET_RTP >= 0.9 && TARGET_RTP <= 0.98);
  assert.equal(MAX_WIN_X100, 2_500_000);
  for (const m of Object.values(MODES)) assert.ok(Number.isInteger(m.costX100) && m.costX100 >= 100);
});

test('toda aposta vezes todo payout x100 da um inteiro de micro-unidades', () => {
  for (const bet of BET_LEVELS) {
    assert.ok(Number.isInteger(bet) && bet % 100 === 0, `aposta ${bet}`);
    assert.ok(bet >= 0.1 * MONEY_UNIT);
  }
});
