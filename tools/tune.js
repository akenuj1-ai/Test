#!/usr/bin/env node
/**
 * Verificacao e calibragem do RTP.
 *
 *   npm run tune                 -> verifica a configuracao atual (rapido)
 *   npm run tune -- --precise    -> mesma coisa com ~10x mais amostras
 *   npm run tune -- --solve      -> sugere os proximos valores das constantes
 *
 * Por que nao medir o RTP com um simulador direto e pronto?
 * ---------------------------------------------------------
 * O desvio padrao do ganho por rodada e da ordem de 20x a aposta. Para um
 * intervalo de confianca de +-0,1 p.p. seriam necessarias ~150 milhoes de
 * rodadas. Em vez disso decompomos:
 *
 *     RTP = B  +  S  +  P x E[bonus]
 *
 *     B         ganho do giro base (Monte Carlo, variancia moderada)
 *     S         premio de scatter          (EXATO, via analytic.js)
 *     P         probabilidade de gatilho   (EXATO, via analytic.js)
 *     E[bonus]  ganho medio da sessao de rodadas gratis (Monte Carlo)
 *
 * Duas das quatro parcelas saem sem erro nenhum, e as outras duas sao medidas
 * separadamente com o numero de amostras que cada uma precisa. O resultado tem
 * cerca de um decimo do erro de um simulador direto pelo mesmo custo de CPU.
 */

import { simulate } from '../src/sim/simulate.js';
import { createEngine, Mode } from '../src/engine/round.js';
import { effectiveWeights, scatterStatistics } from '../src/sim/analytic.js';
import {
  REEL_WEIGHTS, ORB_FREQUENCY, ANTE_SCATTER_MULTIPLIER, ANTE_COST_X100,
  BUY_PRICES_X100, TARGET_RTP,
} from '../src/engine/config.js';

const args = new Set(process.argv.slice(2));
const precise = args.has('--precise');
const N = precise
  ? { base: 40_000_000, fs: 3_000_000, sfs: 2_000_000 }
  : { base: 4_000_000, fs: 400_000, sfs: 300_000 };

const engine = createEngine();
const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(3)}%`;

console.log(`Fortuna Real — verificacao de RTP (alvo ${pct(TARGET_RTP)})`);
console.log(`amostras: base ${N.base.toLocaleString('pt-BR')} · bonus ${N.fs.toLocaleString('pt-BR')} · super ${N.sfs.toLocaleString('pt-BR')}\n`);

/* ---- parcelas exatas ---------------------------------------------------- */
const wBase = effectiveWeights(REEL_WEIGHTS, { orbFrequency: ORB_FREQUENCY.base });
const wAnte = effectiveWeights(REEL_WEIGHTS, {
  orbFrequency: ORB_FREQUENCY.base, scatterMultiplier: ANTE_SCATTER_MULTIPLIER,
});
const scBase = scatterStatistics(wBase);
const scAnte = scatterStatistics(wAnte);

/* ---- parcelas medidas --------------------------------------------------- */
const t0 = Date.now();
const simBase = simulate({ spins: N.base, seed: 'verify-base', engine, mode: Mode.BASE });
const simAnte = simulate({ spins: Math.floor(N.base / 4), seed: 'verify-ante', engine, mode: Mode.ANTE });
const simFs = simulate({ spins: N.fs, seed: 'verify-fs', engine, mode: Mode.BUY_FREE_SPINS });
const simSfs = simulate({ spins: N.sfs, seed: 'verify-sfs', engine, mode: Mode.BUY_SUPER_FREE_SPINS });

const priceFs = BUY_PRICES_X100.freeSpins / 100;
const priceSfs = BUY_PRICES_X100.superFreeSpins / 100;
const eFs = simFs.rtp * priceFs;            // ganho medio do bonus, em x aposta
const eFsErr = simFs.rtpCi95 * priceFs;
const eSfs = simSfs.rtp * priceSfs;
const eSfsErr = simSfs.rtpCi95 * priceSfs;

// IC da parcela do giro base, medido diretamente pelo simulador (Welford
// sobre o ganho do giro base por rodada) — nao uma fracao estimada do total.
const bErr = simBase.baseRtpCi95;
const anteBErr = simAnte.baseRtpCi95 * (ANTE_COST_X100 / 100);

const rtpBase = simBase.baseRtp + scBase.expectedPayX100 / 100 + scBase.triggerProbability * eFs;
const rtpBaseErr = Math.hypot(bErr, scBase.triggerProbability * eFsErr);

const anteB = simAnte.baseRtp * (ANTE_COST_X100 / 100); // simAnte.baseRtp usa o custo do ante no denominador
const rtpAnte = (anteB + scAnte.expectedPayX100 / 100 + scAnte.triggerProbability * eFs) / (ANTE_COST_X100 / 100);
const rtpAnteErr = Math.hypot(anteBErr, scAnte.triggerProbability * eFsErr) / (ANTE_COST_X100 / 100);

/* ---- relatorio ---------------------------------------------------------- */
row('Jogo base', rtpBase, rtpBaseErr);
console.log(`    B  ganho do giro base        ${pct(simBase.baseRtp)}  +-${(bErr * 100).toFixed(3)} (MC)`);
console.log(`    S  premio de scatter         ${pct(scBase.expectedPayX100 / 100)}  exato`);
console.log(`    P  gatilho do bonus          1 em ${scBase.triggerOneIn.toFixed(1)}  exato`);
console.log(`       E[bonus]                  ${eFs.toFixed(2)}x  +-${eFsErr.toFixed(2)} (MC)`);
console.log(`       P x E[bonus]              ${pct(scBase.triggerProbability * eFs)}`);
console.log(`    frequencia de acerto         ${pct(simBase.hitFrequency)}`);
console.log(`    volatilidade (dp por rodada) ${simBase.volatilityIndex.toFixed(2)}`);
console.log(`    maior ganho observado        ${simBase.maxWinX.toFixed(0)}x`);

row('\nAposta ante (custo 1,25x)', rtpAnte, rtpAnteErr);
console.log(`    gatilho                      1 em ${scAnte.triggerOneIn.toFixed(1)}` +
            `  (${(scBase.triggerOneIn / scAnte.triggerOneIn).toFixed(2)}x mais que o base)`);

row(`\nCompra do bonus (${priceFs}x)`, eFs / priceFs, eFsErr / priceFs);
console.log(`    E[bonus] ${eFs.toFixed(2)}x  ·  preco justo a ${pct(TARGET_RTP)}: ${(eFs / TARGET_RTP).toFixed(1)}x`);
console.log(`    rodadas gratis medias ${simFs.avgFreeSpins.toFixed(1)}  ·  teto atingido 1 em ${fmt(simFs.maxWinOneIn)}`);

row(`\nCompra do super (${priceSfs}x)`, eSfs / priceSfs, eSfsErr / priceSfs);
console.log(`    E[super] ${eSfs.toFixed(2)}x  ·  preco justo a ${pct(TARGET_RTP)}: ${(eSfs / TARGET_RTP).toFixed(1)}x`);
console.log(`    teto atingido 1 em ${fmt(simSfs.maxWinOneIn)}  ·  volatilidade ${simSfs.volatilityIndex.toFixed(1)}`);

console.log(`\nconcluido em ${((Date.now() - t0) / 1000).toFixed(0)}s`);

if (args.has('--solve')) {
  console.log('\n=== sugestao de calibragem ===');
  console.log('Alvos: E[bonus] = 96,5x · E[super] = 289,5x · B = 96,5% - S - P x 96,5');
  const targetB = TARGET_RTP - scBase.expectedPayX100 / 100 - scBase.triggerProbability * 96.5;
  // sensibilidade empirica medida na calibragem inicial (ver docs/MATH.md)
  suggest('ORB_FREQUENCY.base', ORB_FREQUENCY.base, simBase.baseRtp * 100, targetB * 100, 20.3);
  suggest('ORB_FREQUENCY.free', ORB_FREQUENCY.free, eFs, 96.5, 37.0);
  suggest('ORB_FREQUENCY.superFree', ORB_FREQUENCY.superFree, eSfs, 289.5, 27.5);
  console.log('\nANTE_SCATTER_MULTIPLIER: resolva com bisseccao exata (analytic.js),');
  console.log('  procurando m tal que (B + S(m) + P(m) x E[bonus]) / 1,25 = alvo.');
}

/** @param {string} label @param {number} value @param {number} err */
function row(label, value, err) {
  const delta = (value - TARGET_RTP) * 100;
  const ok = Math.abs(delta) <= 1.96 * err * 100 || Math.abs(delta) < 0.15;
  console.log(`${label}: ${pct(value)}  +-${(err * 100).toFixed(3)} p.p.   ` +
              `desvio do alvo ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} p.p.  ${ok ? 'OK' : '<-- AJUSTAR'}`);
}

/**
 * @param {string} name @param {number} current @param {number} measured
 * @param {number} target @param {number} slope variacao da medida por unidade do parametro
 */
function suggest(name, current, measured, target, slope) {
  const next = current + (target - measured) / slope;
  console.log(`  ${name.padEnd(24)} ${current} -> ${next.toFixed(4)}   ` +
              `(medido ${measured.toFixed(2)}, alvo ${target.toFixed(2)})`);
}

/** @param {number} x */
function fmt(x) {
  return Number.isFinite(x) ? Math.round(x).toLocaleString('pt-BR') : 'nunca observado';
}
