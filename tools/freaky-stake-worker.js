/**
 * Monta a biblioteca da Stake Engine de UM modo de aposta (roda como thread).
 *
 * Entrada (workerData): { mode, counts, capRates, seed, outDir }
 * Saida: books_<modo>.jsonl.zst, lookUpTable_<modo>_0.csv,
 *        lookUpTableIdToCriteria_<modo>.csv e um resumo via postMessage.
 *
 * Amostragem (ver src/freaky/stake.js para o porque):
 *  - basegame / festa / rave: varredura de rodadas com semente por rodada;
 *    cada rodada util e rejogada com trace (mesma semente = mesma rodada).
 *  - wincap: sorteia o tipo de gatilho k com peso P_k * c_k, acha um giro
 *    base com exatamente k scatters e repete SO o bonus (featureRng) ate
 *    bater o teto. Condicionar direto seria inviavel: no modo base o teto sai
 *    1 vez a cada ~1,9 milhao de rodadas.
 */

import { workerData, parentPort } from 'node:worker_threads';
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import zlib from 'node:zlib';
import { createEngine } from '../src/freaky/round.js';
import { createSeededRng } from '../src/engine/rng.js';
import { scatterDistribution } from '../src/freaky/reels.js';
import { classify, toBook, solveWeights, integerWeights, tableStats } from '../src/freaky/stake.js';
import { MODES, TARGET_RTP, FEATURE_TRIGGERS, MAX_WIN_X100 } from '../src/freaky/config.js';

const { mode, counts, features, seed, outDir } = /** @type {any} */ (workerData);
const engine = createEngine();
const costX100 = MODES[/** @type {keyof typeof MODES} */ (mode)].costX100;
const isBuy = mode === 'festa' || mode === 'rave';
const rngFor = (/** @type {string|number} */ tag) => createSeededRng(`${seed}:${mode}:${tag}`);

/* ---- massa exata de cada balde --------------------------------------- */

const P0 = scatterDistribution(engine.reelSets.BR0);
const PH = scatterDistribution(engine.reelSets.BRH);
const h = engine.calibration.huntMix;
const P = mode === 'hunt' ? P0.map((p, k) => (1 - h) * p + h * PH[k]) : P0;
/** Bonus disparado por k scatters: c_k = chance de teto, m_k = media fora do teto (x100). */
const featureOf = { 3: features.festa, 4: features.rave10, 5: features.rave12, 6: features.rave15 };
const cap = { 3: featureOf[3].cap, 4: featureOf[4].cap, 5: featureOf[5].cap, 6: featureOf[6].cap };
const buyFeature = mode === 'festa' ? features.festa : features.rave10;

/** @type {Partial<Record<import('../src/freaky/stake.js').Criteria, number>>} */
const bucketProb = isBuy
  ? { [mode]: 1 - buyFeature.cap, wincap: buyFeature.cap }
  : {
    basegame: 1 - (P[3] + P[4] + P[5] + P[6]),
    festa: P[3] * (1 - cap[3]),
    rave: P[4] * (1 - cap[4]) + P[5] * (1 - cap[5]) + P[6] * (1 - cap[6]),
    wincap: P[3] * cap[3] + P[4] * cap[4] + P[5] * cap[5] + P[6] * cap[6],
  };

/* ---- saida em streaming (books nunca ficam todos na memoria) ---------- */

const hasZstd = typeof zlib.createZstdCompress === 'function';
const booksName = `books_${mode}.jsonl${hasZstd ? '.zst' : ''}`;
const file = createWriteStream(join(outDir, booksName));
const sink = hasZstd ? zlib.createZstdCompress() : null;
if (sink) sink.pipe(file);
const out = sink ?? file;

/** @type {{ payoutMultiplier: number, criteria: import('../src/freaky/stake.js').Criteria }[]} */
const meta = [];
/** @param {import('../src/freaky/round.js').RoundResult} r */
async function write(r) {
  const book = toBook(meta.length + 1, r);
  meta.push({ payoutMultiplier: book.payoutMultiplier, criteria: book.criteria });
  if (!out.write(`${JSON.stringify(book)}\n`)) await once(out, 'drain');
}

/* ---- varredura: basegame / festa / rave -------------------------------- */

/** @type {Record<string, number>} */
const need = isBuy ? { [mode]: counts.feature } : { basegame: counts.basegame, festa: counts.festa, rave: counts.rave };
let scanned = 0;
const SCAN_LIMIT = 2_000_000_000;
// a varredura tambem mede, sem custo extra, a media do balde basegame e o
// ganho do giro base que disparou cada tipo de bonus (a parte do bonus vem
// das medicoes do processo principal)
const acc = { basegame: [0, 0], festa: [0, 0], rave: [0, 0] };
while (Object.values(need).some((n) => n > 0)) {
  if (scanned > SCAN_LIMIT) throw new Error(`${mode}: varredura passou do limite (${JSON.stringify(need)}).`);
  const i = scanned++;
  const r = engine.playRound({ rng: rngFor(i), mode });
  const c = classify(r);
  if (c !== 'wincap') {
    const a = acc[/** @type {'basegame'|'festa'|'rave'} */ (c)];
    a[0] += 1;
    a[1] += c === 'basegame' ? r.payoutX100 : r.baseWinX100;
  }
  if (!need[c]) continue;
  need[c] -= 1;
  await write(engine.playRound({ rng: rngFor(i), mode, trace: true }));
}

/* ---- wincap ------------------------------------------------------------ */

const pickRng = rngFor('cap-pick');
const kWeights = isBuy ? [] : [3, 4, 5, 6].map((k) => P[k] * cap[/** @type {3|4|5|6} */ (k)]);
let capAttempts = 0;
for (let n = 0; n < counts.wincap; n++) {
  if (isBuy) {
    for (let j = 0; ; j++) {
      const tag = `cap:${n}:${j}`;
      capAttempts += 1;
      if (!engine.playRound({ rng: rngFor(tag), mode }).capped) continue;
      await write(engine.playRound({ rng: rngFor(tag), mode, trace: true }));
      break;
    }
    continue;
  }
  // tipo de gatilho k ~ P_k * c_k
  const total = kWeights.reduce((a, b) => a + b, 0);
  let x = pickRng.float() * total;
  let k = 3;
  for (let j = 0; j < 4; j++) { x -= kWeights[j]; if (x < 0) { k = 3 + j; break; } }
  if (!FEATURE_TRIGGERS[k]) throw new Error(`k=${k} sem gatilho`);
  // giro base com exatamente k scatters
  let t = 0;
  for (;; t++) {
    const r = engine.playRound({ rng: rngFor(`cb:${n}:${t}`), mode, featureRng: rngFor(`cf:${n}:${t}:0`) });
    if (r.scatters === k && r.feature) break;
  }
  // bonus repetido ate bater o teto
  for (let j = 0; ; j++) {
    capAttempts += 1;
    const args = { rng: rngFor(`cb:${n}:${t}`), mode, featureRng: rngFor(`cf:${n}:${t}:${j}`) };
    if (!engine.playRound(/** @type {any} */ (args)).capped) continue;
    await write(engine.playRound({ ...args, rng: rngFor(`cb:${n}:${t}`), featureRng: rngFor(`cf:${n}:${t}:${j}`), trace: true }));
    break;
  }
}

out.end();
await once(file, 'close');

/* ---- pesos e lookup table ---------------------------------------------- */

const target = costX100 * TARGET_RTP;
const avg = (/** @type {number[]} */ a) => (a[0] > 0 ? a[1] / a[0] : 0);
/** @type {Partial<Record<import('../src/freaky/stake.js').Criteria, number>>} */
let bucketMeans;
if (isBuy) {
  bucketMeans = { [mode]: buyFeature.meanNoCap };
} else {
  const raveMass = [4, 5, 6].map((k) => P[k] * (1 - cap[/** @type {4|5|6} */ (k)]));
  const raveMean = [4, 5, 6].reduce((s, k, j) => s + raveMass[j] * featureOf[/** @type {4|5|6} */ (k)].meanNoCap, 0)
    / raveMass.reduce((a, b) => a + b, 0);
  bucketMeans = {
    basegame: avg(acc.basegame),
    festa: avg(acc.festa) + featureOf[3].meanNoCap,
    rave: avg(acc.rave) + raveMean,
  };
}
const solved = solveWeights(meta, bucketProb, target, bucketMeans);
const weights = integerWeights(solved.weights);
const csv = meta.map((m, i) => `${i + 1},${weights[i]},${m.payoutMultiplier}`).join('\n');
await writeFile(join(outDir, `lookUpTable_${mode}_0.csv`), `${csv}\n`);
await writeFile(join(outDir, `lookUpTableIdToCriteria_${mode}.csv`), `${meta.map((m, i) => `${i + 1},${m.criteria}`).join('\n')}\n`);

const stats = tableStats(weights, meta.map((m) => m.payoutMultiplier), costX100);
/** @type {Record<string, number>} */
const perBucket = {};
for (const m of meta) perBucket[m.criteria] = (perBucket[m.criteria] ?? 0) + 1;

parentPort?.postMessage({
  mode,
  books: meta.length,
  booksFile: booksName,
  perBucket,
  bucketProb,
  scanned,
  capAttempts,
  rawRtp: solved.rawMean / costX100,
  lambda: solved.lambda,
  bucketLambda: solved.bucketLambda,
  bucketMeans,
  modelRtp: Object.entries(bucketMeans).reduce(
    (s, [c, m]) => s + (bucketProb[/** @type {import('../src/freaky/stake.js').Criteria} */ (c)] ?? 0) * (m ?? 0),
    (bucketProb.wincap ?? 0) * MAX_WIN_X100,
  ) / costX100,
  ess: solved.ess,
  factorRange: [solved.minFactor, solved.maxFactor],
  rtp: stats.rtp,
  hitRate: stats.hitRate,
  maxWinProb: stats.maxWinProb,
  maxPayoutX100: stats.maxPayoutX100,
});
