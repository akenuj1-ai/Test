import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, Mode, costOf } from '../src/engine/round.js';
import { createSeededRng } from '../src/engine/rng.js';
import {
  MAX_WIN_X100, FREE_SPINS_AWARDED, FREE_SPINS_RETRIGGER_AWARD, SCATTER_TRIGGER,
  SCATTER_RETRIGGER, BUY_PRICES_X100, ANTE_COST_X100, GRID, Sym, ORB_VALUES,
  MAX_TUMBLES_PER_SPIN,
} from '../src/engine/config.js';
import { payToCents } from '../src/engine/money.js';

const engine = createEngine();
const BET = 100;

/** Joga N rodadas e devolve todos os resultados. @param {number} n @param {any} [opts] */
function playMany(n, opts = {}) {
  const rng = createSeededRng(opts.seed ?? 'round-test');
  return Array.from({ length: n }, () => engine.playRound({ rng, betCents: BET, ...opts }));
}

test('custo por modo bate com a configuracao', () => {
  assert.equal(costOf(100, Mode.BASE), 100);
  assert.equal(costOf(100, Mode.ANTE), payToCents(100, ANTE_COST_X100));
  assert.equal(costOf(100, Mode.BUY_FREE_SPINS), payToCents(100, BUY_PRICES_X100.freeSpins));
  assert.equal(costOf(100, Mode.BUY_SUPER_FREE_SPINS), payToCents(100, BUY_PRICES_X100.superFreeSpins));
  assert.throws(() => costOf(100, /** @type {any} */ ('inexistente')), RangeError);
});

test('aposta invalida e recusada', () => {
  const rng = createSeededRng('x');
  assert.throws(() => engine.playRound({ rng, betCents: 0 }), RangeError);
  assert.throws(() => engine.playRound({ rng, betCents: -100 }), RangeError);
  assert.throws(() => engine.playRound({ rng, betCents: 1.5 }), TypeError);
});

test('a mesma semente reproduz a rodada exatamente', () => {
  const a = engine.playRound({ rng: createSeededRng('igual'), betCents: BET, trace: true });
  const b = engine.playRound({ rng: createSeededRng('igual'), betCents: BET, trace: true });
  assert.deepEqual(a, b);
});

test('todo valor monetario devolvido e inteiro nao negativo', () => {
  for (const r of playMany(3000)) {
    assert.ok(Number.isInteger(r.totalWinCents) && r.totalWinCents >= 0, `total invalido: ${r.totalWinCents}`);
    assert.equal(r.netCents, r.totalWinCents - r.costCents);
    for (const s of r.spins) {
      assert.ok(Number.isInteger(s.spinWinCents) && s.spinWinCents >= 0);
      assert.ok(Number.isInteger(s.rawWinCents) && s.rawWinCents >= 0);
      for (const d of s.drops) {
        assert.ok(Number.isInteger(d.winCents) && d.winCents >= 0);
      }
    }
  }
});

test('o ganho total e a soma dos giros, salvo quando o teto corta', () => {
  for (const r of playMany(4000)) {
    const soma = r.spins.reduce((a, s) => a + s.spinWinCents, 0);
    if (r.cappedAtMaxWin) {
      assert.equal(r.totalWinCents, payToCents(r.betCents, MAX_WIN_X100));
      assert.ok(soma >= r.totalWinCents, 'o teto deve cortar para baixo, nunca para cima');
    } else {
      assert.equal(r.totalWinCents, soma);
    }
  }
});

test('o teto de ganho maximo nunca e ultrapassado', () => {
  const teto = payToCents(BET, MAX_WIN_X100);
  // rodadas compradas no super sao as que mais se aproximam do teto
  for (const r of playMany(4000, { mode: Mode.BUY_SUPER_FREE_SPINS, seed: 'teto' })) {
    assert.ok(r.totalWinCents <= teto, `ganho ${r.totalWinCents} passou do teto ${teto}`);
  }
});

test('ao bater o teto a rodada para imediatamente', () => {
  let verificados = 0;
  for (const r of playMany(20000, { mode: Mode.BUY_SUPER_FREE_SPINS, seed: 'parada' })) {
    if (!r.cappedAtMaxWin) continue;
    verificados += 1;
    // menos giros jogados do que concedidos: o resto foi descartado
    assert.ok(r.freeSpinsPlayed <= r.freeSpinsAwarded);
    assert.equal(r.totalWinCents, payToCents(BET, MAX_WIN_X100));
  }
  assert.ok(verificados > 0, 'nenhuma rodada bateu o teto — aumente a amostra');
});

test(`${SCATTER_TRIGGER}+ scatters disparam ${FREE_SPINS_AWARDED} rodadas gratis`, () => {
  let disparos = 0;
  for (const r of playMany(30000, { seed: 'gatilho' })) {
    const base = r.spins[0];
    const deveria = base.scatterCount >= SCATTER_TRIGGER;
    assert.equal(r.featureTriggered, deveria,
      `${base.scatterCount} scatters mas featureTriggered=${r.featureTriggered}`);
    if (!deveria) {
      assert.equal(r.freeSpinsPlayed, 0);
      assert.equal(r.spins.length, 1);
      continue;
    }
    disparos += 1;
    assert.equal(r.freeSpinsAwarded, FREE_SPINS_AWARDED + r.retriggers * FREE_SPINS_RETRIGGER_AWARD);
    // todos os giros apos o base sao rodadas gratis
    assert.ok(r.spins.slice(1).every((s) => s.kind === 'free'));
  }
  assert.ok(disparos > 50, `poucos disparos na amostra: ${disparos}`);
});

test('re-gatilho concede rodadas extras e so ocorre com scatters suficientes', () => {
  let reGatilhos = 0;
  for (const r of playMany(6000, { mode: Mode.BUY_FREE_SPINS, seed: 'regatilho' })) {
    for (const s of r.spins) {
      if (s.kind !== 'free') continue;
      assert.equal(s.retriggered, s.scatterCount >= SCATTER_RETRIGGER);
      if (s.retriggered) reGatilhos += 1;
    }
    // quando o teto nao corta, os giros jogados batem com os concedidos
    if (!r.cappedAtMaxWin) assert.equal(r.freeSpinsPlayed, r.freeSpinsAwarded);
  }
  assert.ok(reGatilhos > 0, 'nenhum re-gatilho na amostra');
});

test('a compra pula o giro base e entra direto nas rodadas gratis', () => {
  for (const mode of [Mode.BUY_FREE_SPINS, Mode.BUY_SUPER_FREE_SPINS]) {
    for (const r of playMany(300, { mode, seed: 'compra' })) {
      assert.ok(r.featureTriggered);
      assert.ok(r.spins.every((s) => s.kind === 'free'), 'a compra nao deve ter giro base');
      assert.ok(r.freeSpinsPlayed >= 1);
      assert.equal(r.costCents, costOf(BET, mode));
      // sem giro base nao ha premio de scatter
      assert.equal(r.spins.reduce((a, s) => a + s.scatterPayCents, 0), 0);
    }
  }
});

test('scatter so paga no giro base, nunca durante as rodadas gratis', () => {
  for (const r of playMany(20000, { seed: 'scatter-pay' })) {
    for (const s of r.spins) {
      if (s.kind === 'free') assert.equal(s.scatterPayCents, 0);
    }
  }
});

test('o multiplicador global das rodadas gratis nunca diminui', () => {
  for (const r of playMany(2000, { mode: Mode.BUY_SUPER_FREE_SPINS, seed: 'mult' })) {
    let anterior = 0;
    for (const s of r.spins) {
      assert.ok(s.globalMultiplier >= anterior,
        `multiplicador global caiu de ${anterior} para ${s.globalMultiplier}`);
      anterior = s.globalMultiplier;
      assert.ok(s.multiplierApplied >= 1);
      assert.equal(s.multiplierApplied, Math.max(1, s.globalMultiplier));
    }
    assert.equal(r.finalGlobalMultiplier, anterior);
  }
});

test('no jogo base o multiplicador so se aplica quando houve ganho', () => {
  for (const r of playMany(20000, { seed: 'mult-base' })) {
    const s = r.spins[0];
    if (s.rawWinCents === 0) {
      assert.equal(s.multiplierApplied, 1, 'multiplicou uma sequencia sem ganho');
      assert.equal(s.spinWinCents, s.scatterPayCents);
    } else {
      assert.equal(s.spinWinCents, s.rawWinCents * s.multiplierApplied + s.scatterPayCents);
    }
  }
});

test('cada cascata termina e respeita o limite defensivo', () => {
  for (const r of playMany(3000, { mode: Mode.BUY_SUPER_FREE_SPINS, seed: 'cascata', trace: true })) {
    for (const s of r.spins) {
      assert.ok(s.drops.length <= MAX_TUMBLES_PER_SPIN);
      // a ultima queda de uma sequencia terminada naturalmente nao tem ganho
      if (s.drops.length < MAX_TUMBLES_PER_SPIN) {
        assert.equal(s.drops[s.drops.length - 1].wins.length, 0);
      }
    }
  }
});

test('o trace da UI e coerente com a grade', () => {
  const r = engine.playRound({ rng: createSeededRng('trace'), betCents: BET, mode: Mode.BUY_FREE_SPINS, trace: true });
  for (const s of r.spins) {
    for (const d of s.drops) {
      assert.equal(d.grid?.length, GRID.CELLS);
      assert.equal(d.orbValues?.length, GRID.CELLS);
      for (let i = 0; i < GRID.CELLS; i++) {
        // orbValues so e diferente de zero exatamente onde ha um orbe
        if (d.grid[i] === Sym.ORB) assert.ok(ORB_VALUES.includes(d.orbValues[i]), `orbe com valor ${d.orbValues[i]}`);
        else assert.equal(d.orbValues[i], 0, `valor de orbe em celula ${d.grid[i]}`);
      }
      // as posicoes removidas correspondem aos simbolos vencedores
      const vencedores = new Set(d.wins.flatMap((w) => w.positions ?? []));
      assert.deepEqual(new Set(d.removed), vencedores);
    }
  }
});

test('sem trace o motor nao aloca grades (caminho da simulacao)', () => {
  const r = engine.playRound({ rng: createSeededRng('sem-trace'), betCents: BET, mode: Mode.BUY_FREE_SPINS });
  for (const s of r.spins) for (const d of s.drops) {
    assert.equal(d.grid, undefined);
    assert.equal(d.removed, undefined);
  }
});

test('trace ligado e desligado produzem o mesmo dinheiro', () => {
  const a = engine.playRound({ rng: createSeededRng('paridade'), betCents: BET, mode: Mode.BUY_SUPER_FREE_SPINS, trace: true });
  const b = engine.playRound({ rng: createSeededRng('paridade'), betCents: BET, mode: Mode.BUY_SUPER_FREE_SPINS, trace: false });
  assert.equal(a.totalWinCents, b.totalWinCents);
  assert.equal(a.freeSpinsPlayed, b.freeSpinsPlayed);
  assert.equal(a.finalGlobalMultiplier, b.finalGlobalMultiplier);
});

test('o ganho escala linearmente com a aposta', () => {
  for (const seed of ['e1', 'e2', 'e3', 'e4', 'e5']) {
    const pequena = engine.playRound({ rng: createSeededRng(seed), betCents: 20, mode: Mode.BUY_FREE_SPINS });
    const grande = engine.playRound({ rng: createSeededRng(seed), betCents: 200, mode: Mode.BUY_FREE_SPINS });
    assert.equal(grande.totalWinCents, pequena.totalWinCents * 10, `semente ${seed}`);
  }
});
