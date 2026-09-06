/**
 * Regressao matematica.
 *
 * Duas naturezas de teste convivem aqui:
 *
 *  1. Valores EXATOS (taxa de gatilho, premio de scatter, ganho esperado do
 *     primeiro sorteio). Sao deterministicos e travados com tolerancia
 *     apertada — qualquer mexida nos pesos dos rolos quebra estes testes de
 *     proposito, para que ninguem mude a matematica sem perceber.
 *
 *  2. RTP por Monte Carlo. Rapido o bastante para o CI, com tolerancia larga:
 *     pega regressoes graves (ordem de grandeza), nao afinacao fina. A
 *     verificacao seria e `npm run tune -- --precise`, que roda por minutos.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/sim/simulate.js';
import { createEngine, Mode } from '../src/engine/round.js';
import { effectiveWeights, scatterStatistics, expectedFirstDropWinX100 } from '../src/sim/analytic.js';
import {
  REEL_WEIGHTS, ORB_FREQUENCY, ANTE_SCATTER_MULTIPLIER, ANTE_COST_X100,
  BUY_PRICES_X100, TARGET_RTP, MAX_WIN_X100,
} from '../src/engine/config.js';

const wBase = effectiveWeights(REEL_WEIGHTS, { orbFrequency: ORB_FREQUENCY.base });
const engine = createEngine();

/* ---------------- valores exatos, travados ---------------- */

test('a taxa de gatilho esta na faixa de projeto (1 em ~215)', () => {
  const s = scatterStatistics(wBase);
  assert.ok(s.triggerOneIn > 205 && s.triggerOneIn < 225,
    `gatilho 1 em ${s.triggerOneIn.toFixed(1)} — fora da faixa de projeto`);
});

test('o premio de scatter contribui ~2% do RTP', () => {
  const s = scatterStatistics(wBase);
  const rtp = s.expectedPayX100 / 100;
  assert.ok(rtp > 0.018 && rtp < 0.022, `scatter contribui ${(rtp * 100).toFixed(3)}%`);
});

test('o ganho esperado do primeiro sorteio esta travado', () => {
  const x = expectedFirstDropWinX100(wBase).totalX100 / 100;
  assert.ok(x > 0.14 && x < 0.17,
    `primeiro sorteio paga ${x.toFixed(4)}x — a tabela ou os pesos mudaram`);
});

/* ---------------- RTP por Monte Carlo ---------------- */

test('RTP do jogo base fica proximo do alvo', { timeout: 120_000 }, () => {
  const sc = scatterStatistics(wBase);
  const base = simulate({ spins: 600_000, seed: 'reg-base', engine, mode: Mode.BASE });
  const fs = simulate({ spins: 80_000, seed: 'reg-fs', engine, mode: Mode.BUY_FREE_SPINS });

  const eFs = fs.rtp * (BUY_PRICES_X100.freeSpins / 100);
  const rtp = base.baseRtp + sc.expectedPayX100 / 100 + sc.triggerProbability * eFs;

  // tolerancia larga: com esta amostra o IC95 fica em torno de +-1,5 p.p.
  assert.ok(Math.abs(rtp - TARGET_RTP) < 0.03,
    `RTP estimado ${(rtp * 100).toFixed(2)}% vs alvo ${(TARGET_RTP * 100).toFixed(2)}%`);
});

test('a compra do bonus paga aproximadamente o RTP do jogo', { timeout: 120_000 }, () => {
  const r = simulate({ spins: 120_000, seed: 'reg-buy', engine, mode: Mode.BUY_FREE_SPINS });
  assert.ok(Math.abs(r.rtp - TARGET_RTP) < 0.03,
    `compra paga ${(r.rtp * 100).toFixed(2)}%`);
});

test('a compra do super paga aproximadamente o RTP do jogo', { timeout: 120_000 }, () => {
  const r = simulate({ spins: 80_000, seed: 'reg-super', engine, mode: Mode.BUY_SUPER_FREE_SPINS });
  assert.ok(Math.abs(r.rtp - TARGET_RTP) < 0.04,
    `super paga ${(r.rtp * 100).toFixed(2)}%`);
});

test('a aposta ante nao e melhor nem pior que a aposta normal', { timeout: 120_000 }, () => {
  const sc = scatterStatistics(effectiveWeights(REEL_WEIGHTS, {
    orbFrequency: ORB_FREQUENCY.base, scatterMultiplier: ANTE_SCATTER_MULTIPLIER,
  }));
  const ante = simulate({ spins: 400_000, seed: 'reg-ante', engine, mode: Mode.ANTE });
  const fs = simulate({ spins: 80_000, seed: 'reg-fs2', engine, mode: Mode.BUY_FREE_SPINS });
  const eFs = fs.rtp * (BUY_PRICES_X100.freeSpins / 100);
  const custo = ANTE_COST_X100 / 100;

  // ante.baseRtp ja usa o custo do ante no denominador; voltamos para a aposta
  const b = ante.baseRtp * custo;
  const rtp = (b + sc.expectedPayX100 / 100 + sc.triggerProbability * eFs) / custo;

  assert.ok(Math.abs(rtp - TARGET_RTP) < 0.035,
    `ante paga ${(rtp * 100).toFixed(2)}% — deveria empatar com o jogo base`);
});

/* ---------------- propriedades estruturais ---------------- */

test('o teto de ganho e alcancavel, mas raro', { timeout: 120_000 }, () => {
  const r = simulate({ spins: 200_000, seed: 'reg-teto', engine, mode: Mode.BUY_SUPER_FREE_SPINS });
  assert.ok(r.maxWinHits > 0, 'o teto nunca foi atingido — ele e inalcancavel?');
  assert.ok(r.maxWinOneIn > 500, `o teto sai 1 em ${r.maxWinOneIn.toFixed(0)} — frequente demais`);
  assert.equal(r.maxWinX, MAX_WIN_X100 / 100);
});

test('a frequencia de acerto fica na faixa do genero (20% a 35%)', { timeout: 120_000 }, () => {
  const r = simulate({ spins: 300_000, seed: 'reg-hit', engine, mode: Mode.BASE });
  assert.ok(r.hitFrequency > 0.20 && r.hitFrequency < 0.35,
    `frequencia de acerto ${(r.hitFrequency * 100).toFixed(1)}%`);
});

test('a soma da distribuicao de ganhos fecha em 100%', { timeout: 120_000 }, () => {
  const r = simulate({ spins: 200_000, seed: 'reg-dist', engine, mode: Mode.BASE });
  const soma = r.distribution.reduce((a, b) => a + b.share, 0);
  assert.ok(Math.abs(soma - 1) < 1e-9, `distribuicao soma ${soma}`);
  assert.equal(r.distribution.reduce((a, b) => a + b.count, 0), r.spins);
});

test('semente igual reproduz a simulacao inteira', () => {
  const a = simulate({ spins: 20_000, seed: 'determinismo', engine, mode: Mode.BASE });
  const b = simulate({ spins: 20_000, seed: 'determinismo', engine, mode: Mode.BASE });
  assert.equal(a.rtp, b.rtp);
  assert.equal(a.maxWinX, b.maxWinX);
  assert.deepEqual(a.distribution, b.distribution);
});
