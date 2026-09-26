#!/usr/bin/env node
/**
 * Verificacao e calibragem do RTP do Freaky Zoo — todos os modos, em paralelo.
 *
 *   npm run freaky:tune                  verifica a configuracao atual
 *   npm run freaky:tune -- --precise     ~5x mais amostras
 *   npm run freaky:tune -- --solve       resolve as 5 constantes de calibragem
 *   npm run freaky:tune -- --json        saida legivel por maquina
 *
 * Estimador decomposto
 * --------------------
 * Simular o modo base direto e caro: o desvio padrao da rodada passa de 20x a
 * aposta, e +-0,1 p.p. exigiria centenas de milhoes de rodadas. Em vez disso:
 *
 *   RTP_base   = B0 + F0
 *   B0         = (1 - f) * B0[sem surto] + f * B0[com surto]       (Monte Carlo)
 *   F0         = sum_k P_k * E_k                                   (P exato)
 *   P_k        probabilidade EXATA de k scatters (convolucao das fitas)
 *   E_k        ganho medio do bonus disparado por k scatters       (Monte Carlo
 *              via compra: Festa 10, Rave 10, Rave 12, Rave 15 rodadas)
 *
 *   RTP_cacada = [(1-h)(B0 + F0) + h(BH + FH)] / 3     (mistura de fitas BR0/BRH)
 *   RTP_lingua = (BL + F0) / 2        (o camelo forcado nunca tira scatter,
 *                                      entao P_k da Lingua = P_k do base)
 *   RTP_compra = E_festa / 100   e   E_rave10 / 500
 *
 * f, fL e h entram de forma LINEAR — o surto e a escolha de fita sao moedas
 * independentes do resto do giro — entao, com as parcelas condicionais
 * medidas, a solucao e uma divisao, sem iteracao. Os `tilt` dos gorilas
 * entram de forma nao linear e sao resolvidos pelo metodo da secante.
 */

import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { createEngine } from '../src/freaky/round.js';
import { scatterDistribution } from '../src/freaky/reels.js';
import { mergeStats, summarize } from '../src/freaky/sim.js';
import { CALIBRATION, MODES, TARGET_RTP, FEATURE_TRIGGERS, MAX_WIN_X100 } from '../src/freaky/config.js';

const args = new Set(process.argv.slice(2));
const PRECISE = args.has('--precise');
const SOLVE = args.has('--solve');
const JSON_OUT = args.has('--json');
const SCALE = PRECISE ? 5 : 1;
const WORKERS = Math.max(1, Math.min(availableParallelism(), 16));

const N = {
  baseNoFrenzy: 24_000_000 * SCALE,
  baseFrenzy: 6_000_000 * SCALE,
  festa: 1_200_000 * SCALE,
  rave10: 600_000 * SCALE,
  rave12: 150_000 * SCALE,
  rave15: 60_000 * SCALE,
};

const log = (/** @type {string} */ s = '') => { if (!JSON_OUT) console.log(s); };
const pct = (/** @type {number} */ x, d = 3) => `${(x * 100).toFixed(d)}%`;
const pp = (/** @type {number} */ x) => `±${(x * 100).toFixed(3)} p.p.`;

/* ------------------------------------------------------------------ */
/* pool de threads                                                     */
/* ------------------------------------------------------------------ */

const pool = Array.from({ length: WORKERS }, () => new Worker(new URL('./freaky-worker.js', import.meta.url)));
/** @type {Map<number, (s: any) => void>} */
const pending = new Map();
let nextId = 0;
for (const w of pool) w.on('message', (m) => { pending.get(m.id)?.(m.stats); pending.delete(m.id); });

/**
 * Roda `rounds` rodadas divididas entre as threads e soma os acumuladores.
 * @param {object} t
 * @param {import('../src/freaky/config.js').ModeName} t.mode
 * @param {number} t.rounds
 * @param {string} t.seed
 * @param {any} [t.calibration]
 * @param {number} [t.freeSpins]
 * @returns {Promise<import('../src/freaky/sim.js').SimStats>}
 */
async function run({ mode, rounds, seed, calibration, freeSpins }) {
  const per = Math.ceil(rounds / WORKERS);
  const parts = await Promise.all(pool.map((w, k) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    w.postMessage({ id, mode, rounds: per, seed: `${seed}#${k}`, calibration, freeSpins });
  })));
  return mergeStats(/** @type {any} */ (parts));
}

/**
 * Media e erro padrao de uma parcela, em multiplos da aposta.
 * @param {import('../src/freaky/sim.js').SimStats} st
 * @param {'sum'|'baseSum'} which
 */
function meanSe(st, which) {
  const sum = which === 'sum' ? st.sum : st.baseSum;
  const sq = which === 'sum' ? st.sumSq : st.baseSumSq;
  const n = st.rounds;
  const m = sum / n;
  return { mean: m, se: Math.sqrt(Math.max(0, sq / n - m * m) / n) };
}

/* ------------------------------------------------------------------ */
/* medicoes                                                            */
/* ------------------------------------------------------------------ */

let cal = structuredClone(/** @type {any} */ (CALIBRATION));

/**
 * @param {'festa'|'rave'} feature
 * @param {number} tilt
 * @param {number} spins
 * @param {number} rounds
 * @param {string} seed
 */
async function measureFeature(feature, tilt, spins, rounds, seed) {
  const st = await run({
    mode: feature, rounds, seed, freeSpins: spins,
    calibration: { ...cal, tilt: { ...cal.tilt, [feature]: tilt } },
  });
  return { ...meanSe(st, 'sum'), capped: st.capped / st.rounds, stats: st };
}

/**
 * Resolve tilt tal que E[feature] = alvo, pelo metodo da secante.
 *
 * Todas as avaliacoes usam a MESMA semente (numeros aleatorios comuns): o
 * tilt so muda qual multiplicador sai de cada sorteio, nao quantos sorteios
 * acontecem, entao as trajetorias ficam acopladas e E(tilt) vira uma curva
 * lisa. Sem isso o ruido de Monte Carlo faz a secante oscilar. A medicao
 * final (em `main`) usa outra semente — o intervalo de confianca reportado e
 * honesto.
 * @param {'festa'|'rave'} feature
 * @param {number} target
 */
async function solveTilt(feature, target) {
  const rounds = N[feature === 'festa' ? 'festa' : 'rave10'];
  const seed = `solve-${feature}`;
  let x0 = cal.tilt[feature];
  let y0 = (await measureFeature(feature, x0, 10, rounds, seed)).mean - target;
  let x1 = x0 + (y0 > 0 ? -0.05 : 0.05);
  for (let it = 0; it < 10; it++) {
    const m = await measureFeature(feature, x1, 10, rounds, seed);
    const y1 = m.mean - target;
    log(`  ${feature}: tilt ${x1.toFixed(4)} -> E = ${m.mean.toFixed(2)}x (alvo ${target.toFixed(2)})`);
    if (Math.abs(y1) < 0.02 * m.se || y1 === y0) return x1;
    const next = x1 - (y1 * (x1 - x0)) / (y1 - y0);
    x0 = x1; y0 = y1;
    x1 = Math.max(-2, Math.min(2, next));
  }
  return x0;
}

async function main() {
  const t0 = Date.now();
  log(`Freaky Zoo — verificacao de RTP (alvo ${pct(TARGET_RTP, 2)}) · ${WORKERS} threads${PRECISE ? ' · precisa' : ''}`);

  const probe = createEngine({ calibration: cal });
  const P0 = scatterDistribution(probe.reelSets.BR0);
  const PH = scatterDistribution(probe.reelSets.BRH);

  if (SOLVE) {
    log('\nResolvendo os multiplicadores dos gorilas (secante)...');
    cal.tilt.festa = await solveTilt('festa', (MODES.festa.costX100 / 100) * TARGET_RTP);
    cal.tilt.rave = await solveTilt('rave', (MODES.rave.costX100 / 100) * TARGET_RTP);
  }

  // bonus: 10 rodadas (compra e gatilho de 3/4), 12 e 15 (gatilho de 5 e 6)
  const [festa, rave10, rave12, rave15] = await Promise.all([
    measureFeature('festa', cal.tilt.festa, 10, N.festa, 'verify-festa'),
    measureFeature('rave', cal.tilt.rave, 10, N.rave10, 'verify-rave10'),
    measureFeature('rave', cal.tilt.rave, 12, N.rave12, 'verify-rave12'),
    measureFeature('rave', cal.tilt.rave, 15, N.rave15, 'verify-rave15'),
  ]);
  /** @type {Record<number, {mean:number,se:number,capped:number}>} */
  const E = { 3: festa, 4: rave10, 5: rave12, 6: rave15 };
  for (const k of Object.keys(FEATURE_TRIGGERS)) {
    const t = FEATURE_TRIGGERS[/** @type {any} */ (k)];
    if (!E[Number(k)] || (Number(k) === 3) !== (t.feature === 'festa')) throw new Error('FEATURE_TRIGGERS mudou; ajuste o tuner.');
  }

  /** @param {number[]} P */
  const featurePart = (P) => {
    let mean = 0, varSum = 0, cap = 0;
    for (const k of [3, 4, 5, 6]) {
      mean += (P[k] ?? 0) * E[k].mean;
      varSum += ((P[k] ?? 0) * E[k].se) ** 2;
      cap += (P[k] ?? 0) * E[k].capped;
    }
    return { mean, se: Math.sqrt(varSum), cap };
  };
  const F0 = featurePart(P0);
  const FH = featurePart(PH);

  // parcelas condicionais do giro base (so a parcela do giro base importa)
  /** @param {import('../src/freaky/config.js').ModeName} mode @param {any} over @param {number} rounds @param {string} seed */
  const baseOnly = async (mode, over, rounds, seed) => meanSe(await run({ mode, rounds, seed, calibration: { ...cal, ...over } }), 'baseSum');
  const [b0n, b0f, bhn, bhf, bln, blf] = await Promise.all([
    baseOnly('base', { frenzyChance: 0 }, N.baseNoFrenzy, 'tune-b0n'),
    baseOnly('base', { frenzyChance: 1 }, N.baseFrenzy, 'tune-b0f'),
    baseOnly('hunt', { frenzyChance: 0, huntMix: 1 }, N.baseNoFrenzy / 4, 'tune-bhn'),
    baseOnly('hunt', { frenzyChance: 1, huntMix: 1 }, N.baseFrenzy / 4, 'tune-bhf'),
    baseOnly('lingua', { frenzyChanceLingua: 0 }, N.baseNoFrenzy / 4, 'tune-bln'),
    baseOnly('lingua', { frenzyChanceLingua: 1 }, N.baseFrenzy / 4, 'tune-blf'),
  ]);

  const T = TARGET_RTP;
  if (SOLVE) {
    cal.frenzyChance = (T - F0.mean - b0n.mean) / (b0f.mean - b0n.mean);
    cal.frenzyChanceLingua = ((MODES.lingua.costX100 / 100) * T - F0.mean - bln.mean) / (blf.mean - bln.mean);
  }
  const mix = (/** @type {{mean:number,se:number}} */ n, /** @type {{mean:number,se:number}} */ f, /** @type {number} */ p) => ({
    mean: (1 - p) * n.mean + p * f.mean,
    se: Math.hypot((1 - p) * n.se, p * f.se),
  });
  const B0 = mix(b0n, b0f, cal.frenzyChance);
  const BH = mix(bhn, bhf, cal.frenzyChance);
  const BL = mix(bln, blf, cal.frenzyChanceLingua);
  const huntCost = MODES.hunt.costX100 / 100;
  if (SOLVE) {
    cal.huntMix = (huntCost * T - (B0.mean + F0.mean)) / (BH.mean + FH.mean - (B0.mean + F0.mean));
  }
  const h = cal.huntMix;

  const rtp = {
    base: { mean: B0.mean + F0.mean, se: Math.hypot(B0.se, F0.se) },
    hunt: {
      mean: ((1 - h) * (B0.mean + F0.mean) + h * (BH.mean + FH.mean)) / huntCost,
      se: Math.hypot((1 - h) * Math.hypot(B0.se, F0.se), h * Math.hypot(BH.se, FH.se)) / huntCost,
    },
    lingua: {
      mean: (BL.mean + F0.mean) / (MODES.lingua.costX100 / 100),
      se: Math.hypot(BL.se, F0.se) / (MODES.lingua.costX100 / 100),
    },
    festa: { mean: festa.mean / (MODES.festa.costX100 / 100), se: festa.se / (MODES.festa.costX100 / 100) },
    rave: { mean: rave10.mean / (MODES.rave.costX100 / 100), se: rave10.se / (MODES.rave.costX100 / 100) },
  };

  const trig = {
    base: { festa: P0[3], rave: P0[4] + P0[5] + P0[6] },
    hunt: {
      festa: (1 - h) * P0[3] + h * PH[3],
      rave: (1 - h) * (P0[4] + P0[5] + P0[6]) + h * (PH[4] + PH[5] + PH[6]),
    },
  };
  const maxWin = {
    base: F0.cap,
    hunt: (1 - h) * F0.cap + h * FH.cap,
    festa: festa.capped,
    rave: rave10.capped,
  };

  const spread = Math.max(...Object.values(rtp).map((r) => r.mean)) - Math.min(...Object.values(rtp).map((r) => r.mean));

  if (JSON_OUT) {
    console.log(JSON.stringify({ target: T, calibration: cal, rtp, trig, maxWin, spread, parts: { B0, BH, BL, F0, FH, E } }, null, 2));
  } else {
    log('\nParcelas');
    log(`  B0 jogo base (sem bonus)   ${pct(B0.mean)} ${pp(1.96 * B0.se)}   [sem surto ${b0n.mean.toFixed(4)}x · com surto ${b0f.mean.toFixed(3)}x]`);
    log(`  F0 bonus no jogo base      ${pct(F0.mean)} ${pp(1.96 * F0.se)}`);
    log(`  E[Festa Freaky]            ${festa.mean.toFixed(2)}x ±${(1.96 * festa.se).toFixed(2)}   teto 1 em ${(1 / festa.capped).toFixed(0)}`);
    log(`  E[Rave Sigma 10]           ${rave10.mean.toFixed(2)}x ±${(1.96 * rave10.se).toFixed(2)}   teto 1 em ${(1 / rave10.capped).toFixed(0)}`);
    log(`  E[Rave Sigma 12 / 15]      ${rave12.mean.toFixed(1)}x / ${rave15.mean.toFixed(1)}x`);
    log(`  BH fita de cacada          ${BH.mean.toFixed(4)}x   FH ${FH.mean.toFixed(3)}x`);
    log(`  BL lingua garantida        ${BL.mean.toFixed(4)}x   [sem surto ${bln.mean.toFixed(4)}x · com surto ${blf.mean.toFixed(3)}x]`);

    log('\nRTP por modo (IC 95%)');
    for (const [mode, r] of Object.entries(rtp)) {
      const cost = MODES[/** @type {keyof typeof MODES} */ (mode)].costX100 / 100;
      log(`  ${mode.padEnd(7)} ${String(cost).padStart(4)}x   ${pct(r.mean)} ${pp(1.96 * r.se)}`);
    }
    log(`  diferenca entre modos: ${(spread * 100).toFixed(3)} p.p. (Stake Engine exige <= 0,5)`);

    log('\nGatilhos (exatos)');
    log(`  base    Festa 1 em ${(1 / trig.base.festa).toFixed(1)} · Rave 1 em ${(1 / trig.base.rave).toFixed(0)}`);
    log(`  cacada  Festa 1 em ${(1 / trig.hunt.festa).toFixed(1)} · Rave 1 em ${(1 / trig.hunt.rave).toFixed(0)}`);
    log('\nGanho maximo (25.000x)');
    for (const [mode, p] of Object.entries(maxWin)) log(`  ${mode.padEnd(7)} 1 em ${Math.round(1 / p).toLocaleString('pt-BR')}`);

    if (SOLVE) {
      log('\nConstantes resolvidas — cole em CALIBRATION (src/freaky/config.js):');
      log(`  frenzyChance: ${cal.frenzyChance.toFixed(5)},`);
      log(`  frenzyChanceLingua: ${cal.frenzyChanceLingua.toFixed(5)},`);
      log(`  tilt: Object.freeze({ festa: ${cal.tilt.festa.toFixed(4)}, rave: ${cal.tilt.rave.toFixed(4)} }),`);
      log(`  huntMix: ${cal.huntMix.toFixed(5)},`);
    }
    log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s · teto ${(MAX_WIN_X100 / 100).toLocaleString('pt-BR')}x`);
  }
  await Promise.all(pool.map((w) => w.terminate()));
}

await main();
