/**
 * Ponte com a Stake Engine: books, lookup tables e pesos.
 *
 * Na Stake Engine o servidor (RGS) nao roda o motor do jogo. Ele guarda uma
 * BIBLIOTECA de rodadas ja resolvidas ("books") e, a cada aposta, sorteia uma
 * delas pelo peso da lookup table. O RTP que o jogador recebe e, portanto, o
 * RTP da biblioteca: sum(peso * payout) / sum(peso) / custo — nao o do motor.
 *
 * Por isso a biblioteca e montada por AMOSTRAGEM ESTRATIFICADA:
 *
 *   baldes (criteria)      probabilidade do balde            origem
 *   ---------------------  --------------------------------  -----------------
 *   basegame               1 - sum_k P_k                     EXATA (fitas)
 *   festa                  P_3 * (1 - c_festa)               EXATA x medida
 *   rave                   sum_k>=4 P_k * (1 - c_k)          EXATA x medida
 *   wincap                 sum_k P_k * c_k                   EXATA x medida
 *
 * (P_k = probabilidade de k scatters, c_k = chance de o bonus bater o teto.)
 *
 * Dentro de cada balde as rodadas sao amostras do motor, com peso igual. O
 * sorteio das amostras tem ruido, entao a media da biblioteca nunca cai exata
 * no alvo. O ajuste e uma REPONDERACAO DE ENTROPIA MINIMA (inclinacao
 * exponencial), em dois passos:
 *
 *   1. cada balde e inclinado para a sua media VERDADEIRA, medida a parte com
 *      milhoes de rodadas sem trace (muito mais barato que gravar books):
 *        w_i = P_balde * exp(lambda_balde * x_i) / Z_balde
 *   2. um lambda comum a todos os baldes (menos `wincap`) absorve o erro que
 *      sobra, para o RTP da tabela cair EXATO no alvo.
 *
 * Entre todas as reponderacoes que acertam as medias, e a de menor divergencia
 * de Kullback-Leibler em relacao a amostra; nunca produz peso negativo; e
 * preserva a massa de cada balde — as taxas de gatilho e a frequencia do
 * ganho maximo continuam exatas. E o mesmo papel do otimizador da math-sdk.
 */

import { MAX_WIN_X100, MODES, GRID, SYMBOLS, PAYTABLE, REEL_COUNTS, FEATURE_TRIGGERS, TARGET_RTP } from './config.js';

/** @typedef {'basegame'|'festa'|'rave'|'wincap'} Criteria */

/**
 * @typedef {object} Book
 * @property {number} id
 * @property {Record<string, any>[]} events
 * @property {number} payoutMultiplier   inteiro, centesimos da aposta base
 * @property {Criteria} criteria
 * @property {number} baseGameWins       em x (float), como na math-sdk
 * @property {number} freeGameWins
 */

/**
 * Balde de uma rodada.
 * @param {import('./round.js').RoundResult} r
 * @returns {Criteria}
 */
export function classify(r) {
  if (r.capped && r.feature) return 'wincap';
  if (r.feature === 'festa') return 'festa';
  if (r.feature === 'rave') return 'rave';
  return 'basegame';
}

/**
 * Converte um resultado com trace em book.
 * @param {number} id
 * @param {import('./round.js').RoundResult} r
 * @returns {Book}
 */
export function toBook(id, r) {
  if (!r.events) throw new Error('toBook exige resultado com trace.');
  return {
    id,
    events: r.events,
    payoutMultiplier: r.payoutX100,
    criteria: classify(r),
    baseGameWins: r.baseWinX100 / 100,
    freeGameWins: r.freeWinX100 / 100,
  };
}

/**
 * Pesos com a reponderacao de entropia minima.
 *
 * @param {{ payoutMultiplier: number, criteria: Criteria }[]} books
 * @param {Partial<Record<Criteria, number>>} bucketProb  massa de cada balde (soma 1)
 * @param {number} targetMeanX100  media alvo do payout (custo x100 x RTP)
 * @param {Partial<Record<Criteria, number>>} [bucketMeans]  media verdadeira
 *   (x100) de cada balde, se conhecida — passo 1 da reponderacao
 * @returns {{ weights: number[], lambda: number, bucketLambda: Record<string, number>, rawMean: number, minFactor: number, maxFactor: number, ess: number }}
 */
export function solveWeights(books, bucketProb, targetMeanX100, bucketMeans = {}) {
  /** @type {Map<string, number[]>} indices por balde */
  const byBucket = new Map();
  books.forEach((b, i) => {
    if (!byBucket.has(b.criteria)) byBucket.set(b.criteria, []);
    /** @type {number[]} */ (byBucket.get(b.criteria)).push(i);
  });
  let mass = 0;
  for (const [c, p] of Object.entries(bucketProb)) {
    if ((p ?? 0) > 0 && !byBucket.has(c)) throw new Error(`Balde "${c}" tem massa ${p} mas nenhuma rodada amostrada.`);
    mass += p ?? 0;
  }
  for (const c of byBucket.keys()) {
    if (!((bucketProb[/** @type {Criteria} */ (c)] ?? 0) > 0)) throw new Error(`Rodadas no balde "${c}", que nao tem massa.`);
  }
  if (Math.abs(mass - 1) > 1e-9) throw new Error(`Massa dos baldes soma ${mass}, esperado 1.`);

  const x = books.map((b) => b.payoutMultiplier);
  /** @type {Record<string, number>} */
  const bucketLambda = {};
  for (const c of byBucket.keys()) bucketLambda[c] = 0;

  /**
   * Pesos para um lambda comum (somado ao lambda de cada balde). O expoente e
   * deslocado pelo extremo do balde para nunca estourar: exp(...) <= 1.
   * @param {number} lambda
   * @param {string|null} [only]  calcula so este balde (os outros ficam 0)
   */
  const weightsFor = (lambda, only = null) => {
    const w = new Array(books.length).fill(0);
    for (const [c, idx] of byBucket) {
      if (only && c !== only) continue;
      const p = /** @type {number} */ (bucketProb[/** @type {Criteria} */ (c)]);
      const tilt = c !== 'wincap' ? bucketLambda[c] + lambda : 0;
      let ref = x[idx[0]];
      for (const i of idx) ref = tilt >= 0 ? Math.max(ref, x[i]) : Math.min(ref, x[i]);
      let z = 0;
      for (const i of idx) { w[i] = Math.exp(tilt * (x[i] - ref)); z += w[i]; }
      for (const i of idx) w[i] *= p / z;
    }
    return w;
  };
  /** @param {number[]} w */
  const meanOf = (w) => w.reduce((acc, wi, i) => acc + wi * x[i], 0);

  /**
   * Bisseccao de uma media crescente em lambda.
   * @param {(l: number) => number} f  media para um lambda
   * @param {number} target
   */
  const bisect = (f, target) => {
    let lo = -1e-3, hi = 1e-3;
    for (let k = 0; f(lo) > target; k++) { lo *= 2; if (k > 60) throw new Error('Alvo de RTP inalcancavel com estas amostras.'); }
    for (let k = 0; f(hi) < target; k++) { hi *= 2; if (k > 60) throw new Error('Alvo de RTP inalcancavel com estas amostras.'); }
    for (let it = 0; it < 200; it++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const w0 = weightsFor(0);
  const rawMean = meanOf(w0);

  // passo 1: cada balde para a sua media verdadeira
  for (const [c, mean] of Object.entries(bucketMeans)) {
    if (c === 'wincap' || mean === undefined || !byBucket.has(c)) continue;
    const idx = /** @type {number[]} */ (byBucket.get(c));
    const lo = Math.min(...idx.map((i) => x[i]));
    const hi = Math.max(...idx.map((i) => x[i]));
    if (!(mean > lo && mean < hi)) throw new Error(`Media ${mean} do balde "${c}" fora da amostra [${lo}, ${hi}].`);
    const p = /** @type {number} */ (bucketProb[/** @type {Criteria} */ (c)]);
    bucketLambda[c] = bisect((l) => {
      bucketLambda[c] = l;
      return meanOf(weightsFor(0, c)) / p;
    }, mean);
  }

  // passo 2: o resto do erro num lambda comum
  const lambda = bisect((l) => meanOf(weightsFor(l)), targetMeanX100);
  const weights = weightsFor(lambda);

  let minFactor = Infinity, maxFactor = -Infinity;
  weights.forEach((w, i) => {
    const f = w / w0[i];
    if (f < minFactor) minFactor = f;
    if (f > maxFactor) maxFactor = f;
  });
  // tamanho efetivo de amostra (Kish) relativo ao da estratificacao pura:
  // 1 = a reponderacao nao custou nada
  const kish = (/** @type {number[]} */ w) => {
    let a = 0, b = 0;
    for (const v of w) { a += v; b += v * v; }
    return (a * a) / b;
  };
  const ess = kish(weights) / kish(w0);
  return { weights, lambda, bucketLambda, rawMean, minFactor, maxFactor, ess };
}

/**
 * Pesos inteiros (uint64 na lookup table). A soma fica perto de 1e15: abaixo
 * de 2^53, entao o arredondamento em double e exato, e com resolucao de
 * sobra para as rodadas mais raras.
 * @param {number[]} weights  somam 1
 * @returns {bigint[]}
 */
export function integerWeights(weights, total = 1e15) {
  return weights.map((w) => {
    const n = Math.round(w * total);
    if (n < 1) throw new Error(`Peso ${w} arredonda para zero; aumente a escala.`);
    return BigInt(n);
  });
}

/**
 * Estatisticas exatas de uma lookup table (aritmetica inteira).
 * @param {bigint[]} weights
 * @param {number[]} payouts  x100
 * @param {number} costX100
 */
export function tableStats(weights, payouts, costX100) {
  let W = 0n, WP = 0n, hitW = 0n, capW = 0n;
  let maxPay = 0;
  weights.forEach((w, i) => {
    const p = payouts[i];
    W += w;
    WP += w * BigInt(p);
    if (p > 0) hitW += w;
    if (p >= MAX_WIN_X100) capW += w;
    if (p > maxPay) maxPay = p;
  });
  // RTP = WP / (W * custo): divisao inteira com 12 casas antes de virar double
  const scale = 10n ** 12n;
  const rtp = Number((WP * scale) / (W * BigInt(costX100))) / 1e12;
  return {
    rtp,
    hitRate: Number((hitW * scale) / W) / 1e12,
    maxWinProb: Number((capW * scale) / W) / 1e12,
    maxPayoutX100: maxPay,
    totalWeight: W,
  };
}

/** index.json no formato exigido pelo RGS. */
export function indexJson() {
  return {
    modes: Object.entries(MODES).map(([name, m]) => ({
      name,
      cost: m.costX100 / 100,
      events: `books_${name}.jsonl.zst`,
      weights: `lookUpTable_${name}_0.csv`,
    })),
  };
}

/** Configuracao descritiva do jogo (equivalente ao config de front da math-sdk). */
export function gameConfigJson() {
  const kinds = [3, 4, 5, 6];
  return {
    gameId: 'freaky_zoo',
    name: 'Freaky Zoo',
    winType: 'ways',
    ways: GRID.ROWS ** GRID.REELS,
    numReels: GRID.REELS,
    numRows: Array(GRID.REELS).fill(GRID.ROWS),
    rtp: TARGET_RTP,
    wincap: MAX_WIN_X100 / 100,
    symbols: SYMBOLS.map((s) => ({ name: s.code, key: s.key, kind: s.kind })),
    paytable: Object.fromEntries(PAYTABLE.flatMap((pays, s) => kinds.map((k, j) => [`${k}_${SYMBOLS[s].code}`, pays[j] / 100]))),
    freespinTriggers: FEATURE_TRIGGERS,
    reelSets: Object.keys(REEL_COUNTS),
    betModes: Object.entries(MODES).map(([name, m]) => ({
      name,
      cost: m.costX100 / 100,
      isBuyBonus: name === 'festa' || name === 'rave',
      isFeature: name === 'base' || name === 'hunt' || name === 'lingua',
    })),
  };
}
