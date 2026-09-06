/**
 * Resultados exatos, sem Monte Carlo.
 *
 * O modelo de sorteio do jogo (cada celula independente, com a distribuicao
 * de pesos do seu rolo) torna varias grandezas calculaveis em forma fechada.
 * A contagem de um simbolo na grade e a soma de 6 binomiais independentes
 * Bin(5, p_coluna); convoluindo essas binomiais obtem-se a distribuicao exata.
 *
 * Para que serve:
 *  1. Validar o simulador. Se o Monte Carlo diverge do valor exato do primeiro
 *     sorteio, ha um bug em algum dos dois — e o teste
 *     test/analytic.test.js trava essa concordancia.
 *  2. Calibrar sem ruido. A probabilidade de gatilho e o pagamento de scatter
 *     saem exatos, o que remove duas fontes de variancia da calibragem.
 *
 * O que NAO da para fechar analiticamente: cascatas e multiplicadores. A
 * grade pos-cascata deixa de ter celulas independentes (os sobreviventes
 * condicionam a proxima grade), entao o RTP total continua vindo do
 * simulador.
 */

import {
  GRID, Sym, SYMBOL_COUNT, PAYING_FIRST, PAYING_LAST,
  SCATTER_TRIGGER, SCATTER_RETRIGGER, REEL_WEIGHTS,
} from '../engine/config.js';
import { COUNT_SLOTS, buildPayLookup, buildScatterLookup } from '../engine/paytable.js';

const { COLS, ROWS, CELLS } = GRID;

/**
 * Aplica ao vetor de pesos as mesmas transformacoes que createReelSampler faz,
 * para que o calculo analitico enxergue exatamente a distribuicao usada em jogo.
 *
 * @param {readonly (readonly number[])[]} reelWeights
 * @param {object} [opts]
 * @param {number} [opts.orbFrequency]
 * @param {number} [opts.scatterMultiplier]
 * @param {boolean} [opts.allowScatter]
 * @returns {number[][]}
 */
export function effectiveWeights(reelWeights, opts = {}) {
  const { orbFrequency = 1, scatterMultiplier = 1, allowScatter = true } = opts;
  return reelWeights.map((w) => {
    const a = w.slice();
    a[Sym.ORB] = w[Sym.ORB] * orbFrequency;
    a[Sym.SCATTER] = allowScatter ? w[Sym.SCATTER] * scatterMultiplier : 0;
    return a;
  });
}

/**
 * Probabilidade de um simbolo por coluna.
 * @param {readonly (readonly number[])[]} weights
 * @param {number} symbolId
 * @returns {number[]} p por coluna
 */
export function symbolProbabilities(weights, symbolId) {
  return weights.map((w) => {
    const total = w.reduce((a, b) => a + b, 0);
    return total > 0 ? w[symbolId] / total : 0;
  });
}

/**
 * Distribuicao exata da contagem de um simbolo na grade inicial.
 * Convolucao de COLS binomiais Bin(ROWS, p_c).
 *
 * @param {readonly (readonly number[])[]} weights
 * @param {number} symbolId
 * @returns {Float64Array} indice = contagem (0..CELLS)
 */
export function countDistribution(weights, symbolId) {
  const ps = symbolProbabilities(weights, symbolId);
  let dist = new Float64Array(CELLS + 1);
  dist[0] = 1;

  for (let c = 0; c < COLS; c++) {
    const p = ps[c];
    // Bin(ROWS, p)
    const col = new Float64Array(ROWS + 1);
    for (let k = 0; k <= ROWS; k++) {
      col[k] = binomial(ROWS, k) * Math.pow(p, k) * Math.pow(1 - p, ROWS - k);
    }
    const next = new Float64Array(CELLS + 1);
    for (let a = 0; a <= CELLS; a++) {
      if (dist[a] === 0) continue;
      for (let k = 0; k <= ROWS && a + k <= CELLS; k++) {
        next[a + k] += dist[a] * col[k];
      }
    }
    dist = next;
  }
  return dist;
}

/** Coeficiente binomial para n pequeno (<= 30). @param {number} n @param {number} k */
function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/**
 * Ganho esperado do PRIMEIRO sorteio de um giro (sem cascatas e sem
 * multiplicadores), em centesimos da aposta.
 *
 * @param {readonly (readonly number[])[]} weights
 * @param {Int32Array} [payLookup]
 * @returns {{ totalX100: number, bySymbol: number[] }}
 */
export function expectedFirstDropWinX100(weights, payLookup = buildPayLookup()) {
  const bySymbol = new Array(SYMBOL_COUNT).fill(0);
  let totalX100 = 0;
  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) {
    const dist = countDistribution(weights, s);
    let e = 0;
    for (let k = 0; k <= CELLS; k++) {
      const pay = payLookup[s * COUNT_SLOTS + k];
      if (pay > 0) e += dist[k] * pay;
    }
    bySymbol[s] = e;
    totalX100 += e;
  }
  return { totalX100, bySymbol };
}

/**
 * Probabilidade de pelo menos um simbolo formar combinacao no primeiro
 * sorteio. Usa independencia aproximada entre simbolos (as contagens sao
 * levemente negativamente correlacionadas, pois somam 30) — por isso o valor
 * e um limite util, nao exato, e vem marcado como `approx`.
 *
 * @param {readonly (readonly number[])[]} weights
 * @returns {number}
 */
export function approxFirstDropHitProbability(weights) {
  let noHit = 1;
  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) {
    const dist = countDistribution(weights, s);
    let pHit = 0;
    for (let k = 8; k <= CELLS; k++) pHit += dist[k];
    noHit *= 1 - pHit;
  }
  return 1 - noHit;
}

/**
 * Distribuicao exata da quantidade de scatters e as probabilidades derivadas.
 *
 * @param {readonly (readonly number[])[]} weights
 * @param {Int32Array} [scatterLookup]
 * @returns {{
 *   distribution: Float64Array,
 *   triggerProbability: number,
 *   triggerOneIn: number,
 *   retriggerProbability: number,
 *   expectedPayX100: number,
 * }}
 */
export function scatterStatistics(weights, scatterLookup = buildScatterLookup()) {
  const dist = countDistribution(weights, Sym.SCATTER);
  let trigger = 0;
  let retrigger = 0;
  let expectedPayX100 = 0;
  for (let k = 0; k <= CELLS; k++) {
    if (k >= SCATTER_TRIGGER) trigger += dist[k];
    if (k >= SCATTER_RETRIGGER) retrigger += dist[k];
    expectedPayX100 += dist[k] * scatterLookup[Math.min(k, COUNT_SLOTS - 1)];
  }
  return {
    distribution: dist,
    triggerProbability: trigger,
    triggerOneIn: trigger > 0 ? 1 / trigger : Infinity,
    retriggerProbability: retrigger,
    expectedPayX100,
  };
}

/**
 * Relatorio analitico do jogo com a configuracao atual.
 * @param {readonly (readonly number[])[]} [reelWeights]
 */
export function analyticReport(reelWeights = REEL_WEIGHTS) {
  const base = effectiveWeights(reelWeights);
  const ante = effectiveWeights(reelWeights, { scatterMultiplier: 2 });
  return {
    base: {
      firstDropWinX: expectedFirstDropWinX100(base).totalX100 / 100,
      hitProbability: approxFirstDropHitProbability(base),
      scatter: scatterStatistics(base),
    },
    ante: { scatter: scatterStatistics(ante) },
  };
}
