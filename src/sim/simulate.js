/**
 * Simulador de Monte Carlo.
 *
 * Mede RTP, volatilidade, frequencia de acerto, taxa de gatilho e a
 * distribuicao de ganhos de um motor. E a unica fonte de verdade sobre o RTP
 * do jogo: a tabela de premios e os pesos dos rolos sao calibrados contra os
 * numeros que saem daqui.
 *
 * Notas de precisao:
 *  - O acumulador de ganho usa dois niveis (lote + total) para nao perder
 *    precisao ao somar milhoes de inteiros grandes em double.
 *  - O intervalo de confianca do RTP e o erro padrao da media dos ganhos por
 *    rodada dividido pela aposta (aproximacao normal, valida para N grande).
 */

import { createEngine, Mode, costOf } from '../engine/round.js';
import { createSeededRng } from '../engine/rng.js';
import { MAX_WIN_X100 } from '../engine/config.js';

/** Faixas de ganho (em multiplos da aposta) usadas no histograma. */
const WIN_BUCKETS = [0, 0.5, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 2500, 5000, Infinity];

/**
 * @typedef {object} SimResult
 * @property {import('../engine/round.js').ModeName} mode
 * @property {number} spins
 * @property {number} rtp
 * @property {number} rtpStdError
 * @property {number} rtpCi95
 * @property {number} hitFrequency        fracao de rodadas com ganho > 0
 * @property {number} volatilityIndex     desvio padrao do ganho, em multiplos do custo da rodada
 * @property {number} triggerRate         fracao de rodadas que entraram em rodadas gratis
 * @property {number} triggerOneIn
 * @property {number} baseRtp             parcela do RTP vinda do giro base
 * @property {number} baseRtpStdError     erro padrao da parcela do giro base
 * @property {number} baseRtpCi95         meia-largura do IC 95% dessa parcela
 * @property {number} featureRtp          parcela vinda das rodadas gratis
 * @property {number} scatterRtp          parcela vinda do premio de scatter
 * @property {number} maxWinX             maior ganho observado, em multiplos da aposta
 * @property {number} maxWinHits          rodadas que bateram o teto
 * @property {number} maxWinOneIn
 * @property {number} avgFreeSpinWinX     ganho medio de uma sessao de rodadas gratis
 * @property {number} avgFreeSpins
 * @property {{ label: string, count: number, share: number }[]} distribution
 */

/**
 * @param {object} opts
 * @param {number} opts.spins
 * @param {import('../engine/round.js').ModeName} [opts.mode]
 * @param {number} [opts.betCents]
 * @param {string|number} [opts.seed]
 * @param {ReturnType<typeof createEngine>} [opts.engine]
 * @param {(done: number, total: number) => void} [opts.onProgress]
 * @returns {SimResult}
 */
export function simulate({
  spins,
  mode = Mode.BASE,
  betCents = 100,
  seed = 'sim',
  engine = createEngine(),
  onProgress,
}) {
  const rng = createSeededRng(seed);
  const cost = costOf(betCents, mode);

  let batchWin = 0;
  let totalWin = 0;
  let batchBase = 0, totalBase = 0;
  let batchFeature = 0, totalFeature = 0;
  let batchScatter = 0, totalScatter = 0;

  // acumuladores de Welford para desvio padrao, em multiplos do CUSTO da
  // rodada (assim modos com precos diferentes ficam comparaveis).
  // `base*` acompanha so a parcela do giro base, que e a unica medida por
  // Monte Carlo no estimador decomposto de tools/tune.js — o intervalo de
  // confianca dela precisa ser proprio, nao uma fracao chutada do total.
  let n = 0, mean = 0, m2 = 0;
  let baseMean = 0, baseM2 = 0;

  let hits = 0;
  let triggers = 0;
  let maxWinCents = 0;
  let maxWinHits = 0;
  let freeSpinSessions = 0;
  let freeSpinWinTotal = 0;
  let freeSpinCount = 0;

  const buckets = new Array(WIN_BUCKETS.length - 1).fill(0);
  const BATCH = 4096;
  const progressEvery = Math.max(1, Math.floor(spins / 100));

  for (let i = 0; i < spins; i++) {
    const r = engine.playRound({ rng, betCents, mode });

    batchWin += r.totalWinCents;
    if (r.totalWinCents > 0) hits += 1;
    if (r.featureTriggered) triggers += 1;
    if (r.cappedAtMaxWin) maxWinHits += 1;
    if (r.totalWinCents > maxWinCents) maxWinCents = r.totalWinCents;

    // decomposicao: giro base x rodadas gratis x scatter
    let baseCents = 0, featureCents = 0, scatterCents = 0;
    for (const s of r.spins) {
      scatterCents += s.scatterPayCents;
      const body = s.spinWinCents - s.scatterPayCents;
      if (s.kind === 'base') baseCents += body; else featureCents += body;
    }
    // se o teto cortou a rodada, redistribui proporcionalmente para nao
    // superestimar as parcelas
    const rawTotal = baseCents + featureCents + scatterCents;
    if (rawTotal > 0 && rawTotal !== r.totalWinCents) {
      const k = r.totalWinCents / rawTotal;
      baseCents *= k; featureCents *= k; scatterCents *= k;
    }
    batchBase += baseCents;
    batchFeature += featureCents;
    batchScatter += scatterCents;

    if (r.featureTriggered) {
      freeSpinSessions += 1;
      freeSpinWinTotal += featureCents;
      freeSpinCount += r.freeSpinsPlayed;
    }

    n += 1;
    const x = r.totalWinCents / cost;
    const delta = x - mean;
    mean += delta / n;
    m2 += delta * (x - mean);

    const xb = baseCents / cost;
    const deltaB = xb - baseMean;
    baseMean += deltaB / n;
    baseM2 += deltaB * (xb - baseMean);

    buckets[bucketIndex(r.totalWinCents / betCents)] += 1;

    if ((i & (BATCH - 1)) === BATCH - 1) {
      totalWin += batchWin; batchWin = 0;
      totalBase += batchBase; batchBase = 0;
      totalFeature += batchFeature; batchFeature = 0;
      totalScatter += batchScatter; batchScatter = 0;
    }
    if (onProgress && i % progressEvery === 0) onProgress(i, spins);
  }
  totalWin += batchWin;
  totalBase += batchBase;
  totalFeature += batchFeature;
  totalScatter += batchScatter;

  const wagered = spins * cost;
  const variance = n > 1 ? m2 / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const stdError = stdDev / Math.sqrt(n);
  const baseStdError = Math.sqrt(n > 1 ? baseM2 / (n - 1) : 0) / Math.sqrt(n);

  return {
    mode,
    spins,
    rtp: totalWin / wagered,
    rtpStdError: stdError,
    rtpCi95: 1.96 * stdError,
    hitFrequency: hits / spins,
    volatilityIndex: stdDev,
    triggerRate: triggers / spins,
    triggerOneIn: triggers > 0 ? spins / triggers : Infinity,
    baseRtp: totalBase / wagered,
    baseRtpStdError: baseStdError,
    baseRtpCi95: 1.96 * baseStdError,
    featureRtp: totalFeature / wagered,
    scatterRtp: totalScatter / wagered,
    maxWinX: maxWinCents / betCents,
    maxWinHits,
    maxWinOneIn: maxWinHits > 0 ? spins / maxWinHits : Infinity,
    avgFreeSpinWinX: freeSpinSessions > 0 ? freeSpinWinTotal / freeSpinSessions / betCents : 0,
    avgFreeSpins: freeSpinSessions > 0 ? freeSpinCount / freeSpinSessions : 0,
    distribution: buckets.map((count, i) => ({
      label: bucketLabel(i),
      count,
      share: count / spins,
    })),
  };
}

/** @param {number} x ganho em multiplos da aposta */
function bucketIndex(x) {
  for (let i = 1; i < WIN_BUCKETS.length; i++) {
    if (x < WIN_BUCKETS[i]) return i - 1;
  }
  return WIN_BUCKETS.length - 2;
}

/** @param {number} i */
function bucketLabel(i) {
  const lo = WIN_BUCKETS[i];
  const hi = WIN_BUCKETS[i + 1];
  if (lo === 0) return 'sem ganho / < 0,5x';
  if (hi === Infinity) return `>= ${lo}x`;
  return `${lo}x - ${hi}x`;
}

/**
 * Estima o preco justo de uma compra de bonus: o valor esperado do recurso
 * dividido pelo RTP alvo.
 *
 * @param {number} expectedWinX  ganho medio da feature, em multiplos da aposta
 * @param {number} targetRtp
 * @returns {number} preco em multiplos da aposta
 */
export function fairBuyPrice(expectedWinX, targetRtp) {
  return expectedWinX / targetRtp;
}

export { MAX_WIN_X100, WIN_BUCKETS };
