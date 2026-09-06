import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveWeights, symbolProbabilities, countDistribution,
  expectedFirstDropWinX100, scatterStatistics,
} from '../src/sim/analytic.js';
import { createSeededRng } from '../src/engine/rng.js';
import { createReelSampler, drawGrid, countSymbols } from '../src/engine/grid.js';
import { evaluateGrid } from '../src/engine/evaluate.js';
import {
  REEL_WEIGHTS, GRID, Sym, ORB_FREQUENCY, ANTE_SCATTER_MULTIPLIER,
  SCATTER_TRIGGER, PAYING_FIRST, PAYING_LAST,
} from '../src/engine/config.js';

const { CELLS } = GRID;
const wBase = effectiveWeights(REEL_WEIGHTS, { orbFrequency: ORB_FREQUENCY.base });

test('effectiveWeights aplica as mesmas transformacoes do sorteador', () => {
  const w = effectiveWeights(REEL_WEIGHTS, { orbFrequency: 2, scatterMultiplier: 3 });
  assert.equal(w[0][Sym.ORB], REEL_WEIGHTS[0][Sym.ORB] * 2);
  assert.equal(w[0][Sym.SCATTER], REEL_WEIGHTS[0][Sym.SCATTER] * 3);
  assert.equal(w[0][Sym.CROWN], REEL_WEIGHTS[0][Sym.CROWN], 'simbolos normais nao mudam');
  assert.equal(effectiveWeights(REEL_WEIGHTS, { allowScatter: false })[0][Sym.SCATTER], 0);
});

test('as distribuicoes de contagem somam 1 e tem a media correta', () => {
  for (let s = 0; s < 11; s++) {
    const dist = countDistribution(wBase, s);
    const soma = dist.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(soma - 1) < 1e-9, `simbolo ${s}: soma ${soma}`);

    // E[contagem] = 5 x soma das probabilidades por coluna
    const media = dist.reduce((a, p, k) => a + p * k, 0);
    const esperada = symbolProbabilities(wBase, s).reduce((a, p) => a + p * GRID.ROWS, 0);
    assert.ok(Math.abs(media - esperada) < 1e-9, `simbolo ${s}: media ${media} vs ${esperada}`);
  }
});

test('a distribuicao exata de contagem bate com o sorteio real', () => {
  const rng = createSeededRng('analitico-vs-mc');
  const sampler = createReelSampler({ reelWeights: REEL_WEIGHTS, orbFrequency: ORB_FREQUENCY.base });
  const N = 400_000;
  /** @type {number[][]} */
  const observado = Array.from({ length: 11 }, () => new Array(CELLS + 1).fill(0));

  for (let i = 0; i < N; i++) {
    const counts = countSymbols(drawGrid(rng, sampler));
    for (let s = 0; s < 11; s++) observado[s][counts[s]] += 1;
  }

  for (let s = 0; s < 11; s++) {
    const esperado = countDistribution(wBase, s);
    for (let k = 0; k <= CELLS; k++) {
      const p = esperado[k];
      if (p * N < 50) continue; // so comparamos celulas com amostra suficiente
      const obs = observado[s][k] / N;
      const erro = 4 * Math.sqrt((p * (1 - p)) / N); // ~4 sigma
      assert.ok(Math.abs(obs - p) < erro,
        `simbolo ${s}, contagem ${k}: observado ${obs.toFixed(5)} vs exato ${p.toFixed(5)}`);
    }
  }
});

test('o ganho esperado do primeiro sorteio bate com o Monte Carlo', () => {
  const exato = expectedFirstDropWinX100(wBase).totalX100;
  const rng = createSeededRng('primeiro-sorteio');
  const sampler = createReelSampler({ reelWeights: REEL_WEIGHTS, orbFrequency: ORB_FREQUENCY.base });
  const N = 600_000;
  const BET = 100;

  let soma = 0;
  let soma2 = 0;
  for (let i = 0; i < N; i++) {
    // sem cascata e sem multiplicador: exatamente o que a formula calcula
    const x = evaluateGrid(drawGrid(rng, sampler), BET, {}).winCents;
    soma += x;
    soma2 += x * x;
  }
  const media = soma / N;                       // em centavos, aposta de 100
  const dp = Math.sqrt(soma2 / N - media * media);
  const erroPadrao = dp / Math.sqrt(N);

  // media em centavos com aposta 100 == premio em centesimos da aposta
  const desvio = Math.abs(media - exato);
  assert.ok(desvio < 4 * erroPadrao,
    `exato ${exato.toFixed(4)} vs MC ${media.toFixed(4)} (erro padrao ${erroPadrao.toFixed(4)})`);
});

test('a taxa de gatilho exata bate com a observada', () => {
  const exato = scatterStatistics(wBase);
  const rng = createSeededRng('gatilho-mc');
  const sampler = createReelSampler({ reelWeights: REEL_WEIGHTS, orbFrequency: ORB_FREQUENCY.base });
  const N = 1_500_000;

  let gatilhos = 0;
  for (let i = 0; i < N; i++) {
    if (countSymbols(drawGrid(rng, sampler))[Sym.SCATTER] >= SCATTER_TRIGGER) gatilhos += 1;
  }
  const p = exato.triggerProbability;
  const obs = gatilhos / N;
  const erro = 4 * Math.sqrt((p * (1 - p)) / N);
  assert.ok(Math.abs(obs - p) < erro,
    `gatilho exato 1 em ${(1 / p).toFixed(1)} vs observado 1 em ${(1 / obs).toFixed(1)}`);
});

test('a aposta ante aumenta o gatilho na proporcao calibrada', () => {
  const base = scatterStatistics(wBase);
  const ante = scatterStatistics(effectiveWeights(REEL_WEIGHTS, {
    orbFrequency: ORB_FREQUENCY.base, scatterMultiplier: ANTE_SCATTER_MULTIPLIER,
  }));
  const razao = ante.triggerProbability / base.triggerProbability;
  assert.ok(razao > 1.4 && razao < 1.65,
    `o ante deveria disparar ~1,5x mais; obteve ${razao.toFixed(2)}x`);

  // documenta o efeito nao linear: o gatilho cresce muito mais que o peso
  assert.ok(razao > ANTE_SCATTER_MULTIPLIER,
    'com 4+ scatters o gatilho cresce mais rapido que o peso — se isso falhar, a premissa mudou');
});

test('o ganho esperado por simbolo cresce com o valor do simbolo', () => {
  const { bySymbol } = expectedFirstDropWinX100(wBase);
  const totalBaixos = bySymbol.slice(PAYING_FIRST, Sym.CUP).reduce((a, b) => a + b, 0);
  const totalAltos = bySymbol.slice(Sym.CUP, PAYING_LAST + 1).reduce((a, b) => a + b, 0);
  assert.ok(totalBaixos > 0 && totalAltos > 0);
  // os baixos aparecem muito mais, entao devem dominar o ganho do primeiro sorteio
  assert.ok(totalBaixos > totalAltos, 'os simbolos baixos deveriam carregar o jogo base');
});
