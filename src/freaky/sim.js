/**
 * Simulador de Monte Carlo do Freaky Zoo.
 *
 * Devolve ACUMULADORES (somas, somas de quadrados, contagens) em vez de medias
 * prontas, para que varias threads possam rodar em paralelo e o resultado ser
 * somado sem perda — ver `mergeStats` e tools/freaky-sim.js.
 *
 * Tudo em multiplos da aposta base (x100 -> x). O RTP de um modo e
 * E[payout] / custo.
 */

import { createEngine } from './round.js';
import { createSeededRng } from '../engine/rng.js';
import { MODES, MAX_WIN_X100 } from './config.js';

/** Faixas do histograma, em multiplos da aposta base. */
export const WIN_BUCKETS = Object.freeze([0, 0.5, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, Infinity]);

/**
 * @typedef {object} SimStats
 * @property {import('./config.js').ModeName} mode
 * @property {number} rounds
 * @property {number} sum         soma dos ganhos (x)
 * @property {number} sumSq
 * @property {number} baseSum     parcela do giro base
 * @property {number} baseSumSq
 * @property {number} hits        rodadas com ganho > 0
 * @property {number} festa       gatilhos (ou compras) de Festa Freaky
 * @property {number} rave        gatilhos (ou compras) de Rave Sigma
 * @property {number} festaSum    ganho do bonus somado sobre as Festas
 * @property {number} festaSumSq
 * @property {number} raveSum
 * @property {number} raveSumSq
 * @property {number} freeSpins   rodadas gratis jogadas
 * @property {number} retriggers
 * @property {number} capped
 * @property {number} maxX
 * @property {number[]} buckets
 */

/**
 * @param {import('./config.js').ModeName} mode
 * @returns {SimStats}
 */
export function emptyStats(mode) {
  return {
    mode, rounds: 0, sum: 0, sumSq: 0, baseSum: 0, baseSumSq: 0, hits: 0,
    festa: 0, rave: 0, festaSum: 0, festaSumSq: 0, raveSum: 0, raveSumSq: 0,
    freeSpins: 0, retriggers: 0, capped: 0, maxX: 0,
    buckets: new Array(WIN_BUCKETS.length - 1).fill(0),
  };
}

/**
 * @param {object} opts
 * @param {number} opts.rounds
 * @param {import('./config.js').ModeName} [opts.mode]
 * @param {string|number} [opts.seed]
 * @param {import('./round.js').Engine} [opts.engine]
 * @param {number} [opts.freeSpins]  so em compra (ver round.js)
 * @returns {SimStats}
 */
export function simulate({ rounds, mode = 'base', seed = 'sim', engine = createEngine(), freeSpins }) {
  const rng = createSeededRng(seed);
  const st = emptyStats(mode);
  for (let i = 0; i < rounds; i++) {
    const r = engine.playRound({ rng, mode, freeSpins });
    const x = r.payoutX100 / 100;
    const b = r.baseWinX100 / 100;
    const f = r.freeWinX100 / 100;
    st.rounds += 1;
    st.sum += x;
    st.sumSq += x * x;
    st.baseSum += b;
    st.baseSumSq += b * b;
    if (x > 0) st.hits += 1;
    if (r.feature === 'festa') { st.festa += 1; st.festaSum += f; st.festaSumSq += f * f; }
    if (r.feature === 'rave') { st.rave += 1; st.raveSum += f; st.raveSumSq += f * f; }
    st.freeSpins += r.freeSpinsPlayed;
    st.retriggers += r.retriggers;
    if (r.capped) st.capped += 1;
    if (x > st.maxX) st.maxX = x;
    st.buckets[bucketIndex(x)] += 1;
  }
  return st;
}

/** @param {number} x */
function bucketIndex(x) {
  if (x === 0) return 0;
  for (let k = 1; k < WIN_BUCKETS.length; k++) if (x < WIN_BUCKETS[k]) return k - 1;
  return WIN_BUCKETS.length - 2;
}

/**
 * Soma acumuladores de varias execucoes do mesmo modo.
 * @param {SimStats[]} parts
 * @returns {SimStats}
 */
export function mergeStats(parts) {
  const out = emptyStats(parts[0].mode);
  for (const p of parts) {
    for (const key of /** @type {(keyof SimStats)[]} */ (Object.keys(out))) {
      if (key === 'mode' || key === 'buckets') continue;
      if (key === 'maxX') out.maxX = Math.max(out.maxX, p.maxX);
      else /** @type {any} */ (out)[key] += p[key];
    }
    p.buckets.forEach((n, k) => { out.buckets[k] += n; });
  }
  return out;
}

/**
 * Metricas derivadas, com intervalo de confianca de 95% (aproximacao normal).
 * @param {SimStats} st
 */
export function summarize(st) {
  const cost = MODES[st.mode].costX100 / 100;
  const n = st.rounds;
  const mean = st.sum / n;
  const variance = Math.max(0, st.sumSq / n - mean * mean);
  const sd = Math.sqrt(variance);
  const baseMean = st.baseSum / n;
  const baseSd = Math.sqrt(Math.max(0, st.baseSumSq / n - baseMean * baseMean));
  const meanOf = (/** @type {number} */ s, /** @type {number} */ k) => (k > 0 ? s / k : 0);
  const sdOf = (/** @type {number} */ s, /** @type {number} */ sq, /** @type {number} */ k) => {
    if (k < 2) return 0;
    const m = s / k;
    return Math.sqrt(Math.max(0, sq / k - m * m));
  };
  return {
    mode: st.mode,
    rounds: n,
    cost,
    rtp: mean / cost,
    rtpCi95: (1.96 * sd) / Math.sqrt(n) / cost,
    sdX: sd,
    volatility: sd / cost,
    hitRate: st.hits / n,
    baseRtp: baseMean / cost,
    baseRtpCi95: (1.96 * baseSd) / Math.sqrt(n) / cost,
    festaRate: st.festa / n,
    raveRate: st.rave / n,
    festaMean: meanOf(st.festaSum, st.festa),
    festaCi95: st.festa > 1 ? (1.96 * sdOf(st.festaSum, st.festaSumSq, st.festa)) / Math.sqrt(st.festa) : 0,
    raveMean: meanOf(st.raveSum, st.rave),
    raveCi95: st.rave > 1 ? (1.96 * sdOf(st.raveSum, st.raveSumSq, st.rave)) / Math.sqrt(st.rave) : 0,
    avgFreeSpins: meanOf(st.freeSpins, st.festa + st.rave),
    retriggerRate: meanOf(st.retriggers, st.festa + st.rave),
    capped: st.capped,
    cappedRate: st.capped / n,
    maxX: st.maxX,
    maxWinX: MAX_WIN_X100 / 100,
    buckets: st.buckets.map((count, k) => ({
      from: WIN_BUCKETS[k], to: WIN_BUCKETS[k + 1], count, share: count / n,
    })),
  };
}
