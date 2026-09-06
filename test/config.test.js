import test from 'node:test';
import assert from 'node:assert/strict';
import * as cfg from '../src/engine/config.js';

test('a grade e coerente', () => {
  assert.equal(cfg.GRID.CELLS, cfg.GRID.COLS * cfg.GRID.ROWS);
  assert.equal(cfg.REEL_WEIGHTS.length, cfg.GRID.COLS);
});

test('todo simbolo tem metadado e o indice bate com a posicao', () => {
  assert.equal(cfg.SYMBOLS.length, cfg.SYMBOL_COUNT);
  cfg.SYMBOLS.forEach((meta, i) => {
    assert.equal(meta.id, i, `simbolo ${meta.key} com id fora de ordem`);
    assert.ok(meta.key, `simbolo ${i} sem chave`);
    assert.ok(['low', 'high', 'scatter', 'orb'].includes(meta.kind));
  });
  assert.equal(cfg.SYMBOLS[cfg.Sym.SCATTER].kind, 'scatter');
  assert.equal(cfg.SYMBOLS[cfg.Sym.ORB].kind, 'orb');
});

test('a configuracao do motor nao carrega nada de aparencia', () => {
  // Se um destes campos voltar para config.js, a aparencia deixou de ser
  // separavel da matematica e um tema novo passa a poder mover o RTP.
  for (const meta of cfg.SYMBOLS) {
    for (const campo of ['name', 'glyph', 'color', 'art']) {
      assert.equal(campo in meta, false,
        `"${campo}" e aparencia e pertence a src/ui/themes.js, nao a config.js`);
    }
  }
});

test('cada rolo tem um peso por simbolo, todos positivos', () => {
  for (const [i, rolo] of cfg.REEL_WEIGHTS.entries()) {
    assert.equal(rolo.length, cfg.SYMBOL_COUNT, `rolo ${i} com tamanho errado`);
    for (const [s, w] of rolo.entries()) {
      assert.ok(Number.isFinite(w) && w > 0, `rolo ${i} simbolo ${s}: peso ${w}`);
    }
  }
});

test('as faixas da tabela de premios sao contiguas e cobrem ate a grade cheia', () => {
  for (let s = cfg.PAYING_FIRST; s <= cfg.PAYING_LAST; s++) {
    const tiers = cfg.PAYTABLE[s];
    assert.equal(tiers[0][0], cfg.MIN_CLUSTER, `simbolo ${s} nao comeca em ${cfg.MIN_CLUSTER}`);
    for (let t = 1; t < tiers.length; t++) {
      assert.equal(tiers[t][0], tiers[t - 1][1] + 1, `lacuna entre faixas do simbolo ${s}`);
    }
    assert.ok(tiers[tiers.length - 1][1] >= cfg.GRID.CELLS, `simbolo ${s} nao cobre a grade cheia`);
  }
});

test('a tabela de scatter cobre do zero ate o gatilho', () => {
  assert.ok(cfg.SCATTER_PAYS.length > cfg.SCATTER_TRIGGER);
  for (let n = 0; n < cfg.SCATTER_TRIGGER; n++) {
    assert.equal(cfg.SCATTER_PAYS[n], 0, `${n} scatters nao pode pagar`);
  }
  assert.ok(cfg.SCATTER_PAYS[cfg.SCATTER_TRIGGER] > 0);
  assert.ok(cfg.SCATTER_RETRIGGER <= cfg.SCATTER_TRIGGER);
});

test('valores e pesos dos orbes tem o mesmo tamanho e sao crescentes', () => {
  for (const tabela of Object.values(cfg.ORB_WEIGHTS)) {
    assert.equal(tabela.length, cfg.ORB_VALUES.length);
    for (const w of tabela) assert.ok(w > 0);
  }
  for (let i = 1; i < cfg.ORB_VALUES.length; i++) {
    assert.ok(cfg.ORB_VALUES[i] > cfg.ORB_VALUES[i - 1], 'valores de orbe fora de ordem');
  }
  // valores maiores tem de ser mais raros
  for (const tabela of Object.values(cfg.ORB_WEIGHTS)) {
    for (let i = 1; i < tabela.length; i++) {
      assert.ok(tabela[i] <= tabela[i - 1], 'peso de orbe cresceu com o valor');
    }
  }
});

test('as rodadas gratis tem orbes mais generosos que o jogo base', () => {
  assert.ok(cfg.ORB_FREQUENCY.free > cfg.ORB_FREQUENCY.base);
  assert.ok(cfg.ORB_FREQUENCY.superFree > cfg.ORB_FREQUENCY.free);
  const media = (/** @type {readonly number[]} */ pesos) => {
    const total = pesos.reduce((a, b) => a + b, 0);
    return cfg.ORB_VALUES.reduce((a, v, i) => a + v * pesos[i], 0) / total;
  };
  assert.ok(media(cfg.ORB_WEIGHTS.super) > media(cfg.ORB_WEIGHTS.base),
    'os orbes do super deveriam valer mais em media');
});

test('niveis de aposta sao crescentes e o padrao esta na lista', () => {
  for (let i = 1; i < cfg.BET_LEVELS_CENTS.length; i++) {
    assert.ok(cfg.BET_LEVELS_CENTS[i] > cfg.BET_LEVELS_CENTS[i - 1]);
  }
  assert.ok(cfg.BET_LEVELS_CENTS.includes(cfg.DEFAULT_BET_CENTS));
});

test('a configuracao e imutavel (congelada)', () => {
  assert.ok(Object.isFrozen(cfg.PAYTABLE));
  assert.ok(Object.isFrozen(cfg.REEL_WEIGHTS));
  assert.ok(Object.isFrozen(cfg.REEL_WEIGHTS[0]));
  assert.ok(Object.isFrozen(cfg.ORB_WEIGHTS));
  assert.throws(() => { /** @type {any} */ (cfg.REEL_WEIGHTS[0])[0] = 1; }, TypeError);
});

test('parametros de negocio estao em faixas sensatas', () => {
  assert.ok(cfg.TARGET_RTP > 0.8 && cfg.TARGET_RTP < 1, 'RTP alvo fora da faixa de mercado');
  assert.ok(cfg.MAX_WIN_X100 >= 100000, 'teto de ganho baixo demais para o genero');
  assert.ok(cfg.ANTE_COST_X100 > 100, 'a aposta ante tem de custar mais que a base');
  assert.ok(cfg.ANTE_SCATTER_MULTIPLIER > 1);
  assert.ok(cfg.BUY_PRICES_X100.superFreeSpins > cfg.BUY_PRICES_X100.freeSpins);
  assert.ok(cfg.MAX_TUMBLES_PER_SPIN >= 20);
});
