/**
 * Regressao matematica do Freaky Zoo.
 *
 * Nao substitui `npm run freaky:tune` (que mede com dezenas de milhoes de
 * rodadas): aqui a amostra e pequena, entao os limites sao largos — o teste
 * pega uma quebra grosseira (tabela trocada, fita errada, bonus desligado),
 * nao um desvio de decimos de ponto.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/freaky/round.js';
import { simulate, summarize } from '../src/freaky/sim.js';
import { scatterDistribution } from '../src/freaky/reels.js';
import { TARGET_RTP, MODES } from '../src/freaky/config.js';

const engine = createEngine();

test('gatilhos exatos nas faixas de projeto', () => {
  const P0 = scatterDistribution(engine.reelSets.BR0);
  assert.ok(1 / P0[3] > 200 && 1 / P0[3] < 300, `Festa 1 em ${1 / P0[3]}`);
  const rave = P0[4] + P0[5] + P0[6];
  assert.ok(1 / rave > 3000 && 1 / rave < 8000, `Rave 1 em ${1 / rave}`);
});

test('RTP decomposto do modo base perto de 96,5%', () => {
  const base = summarize(simulate({ rounds: 1_500_000, mode: 'base', seed: 'math-base', engine }));
  const festa = summarize(simulate({ rounds: 60_000, mode: 'festa', seed: 'math-festa', engine }));
  const rave = summarize(simulate({ rounds: 30_000, mode: 'rave', seed: 'math-rave', engine }));
  const P0 = scatterDistribution(engine.reelSets.BR0);
  // parcela do giro base + gatilho exato x media do bonus comprado
  const rtp = base.baseRtp + P0[3] * festa.festaMean + (P0[4] + P0[5] + P0[6]) * rave.raveMean;
  assert.ok(Math.abs(rtp - TARGET_RTP) < 0.03, `RTP ${rtp}`);
  assert.ok(Math.abs(festa.rtp - TARGET_RTP) < 0.04, `compra Festa ${festa.rtp}`);
  assert.ok(Math.abs(rave.rtp - TARGET_RTP) < 0.04, `compra Rave ${rave.rtp}`);
  // perfil: volatilidade muito alta e acerto acima do minimo da Stake (1 em 20)
  assert.ok(base.hitRate > 0.2 && base.hitRate < 0.4, `acerto ${base.hitRate}`);
  assert.ok(festa.volatility > 2, 'Festa comprada precisa ser muito volatil');
});

test('modos de FeatureSpin custam o que dizem', () => {
  assert.equal(MODES.hunt.costX100 / MODES.base.costX100, 3);
  assert.equal(MODES.lingua.costX100 / MODES.base.costX100, 2);
});
