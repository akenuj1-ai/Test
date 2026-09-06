#!/usr/bin/env node
/**
 * CLI do simulador.
 *
 *   npm run sim                          -> 200.000 rodadas no modo base
 *   npm run sim -- --spins 2000000       -> mais rodadas
 *   npm run sim -- --all                 -> todos os modos + precos de compra
 *   npm run sim -- --mode buyFreeSpins
 *   npm run sim -- --json                -> saida legivel por maquina
 */

import { simulate, fairBuyPrice } from './simulate.js';
import { Mode, costOf } from '../engine/round.js';
import { TARGET_RTP, BUY_PRICES_X100, ANTE_COST_X100 } from '../engine/config.js';

const args = parseArgs(process.argv.slice(2));
const spins = Number(args.spins ?? 200000);
const seed = String(args.seed ?? 'fortuna-real');
const json = Boolean(args.json);

const modes = args.all
  ? [Mode.BASE, Mode.ANTE, Mode.BUY_FREE_SPINS, Mode.BUY_SUPER_FREE_SPINS]
  : [String(args.mode ?? Mode.BASE)];

/** @type {Record<string, any>} */
const results = {};
for (const mode of modes) {
  const started = Date.now();
  const r = simulate({ spins, mode: /** @type {any} */ (mode), seed, betCents: 100 });
  results[mode] = r;
  if (!json) report(r, Date.now() - started);
}

if (!json && args.all) {
  const fs = results[Mode.BUY_FREE_SPINS];
  const sfs = results[Mode.BUY_SUPER_FREE_SPINS];
  /** @param {string} label @param {import('./simulate.js').SimResult} r @param {number} priceX100 */
  const line = (label, r, priceX100) => {
    const price = priceX100 / 100;
    const fair = fairBuyPrice(r.rtp * price, TARGET_RTP);
    console.log(
      `  ${label.padEnd(22)} preco ${String(price).padStart(6)}x` +
      `  RTP ${(r.rtp * 100).toFixed(2)}%` +
      `  preco justo ${fair.toFixed(1)}x`,
    );
  };
  console.log('\n=== Precos de compra ===');
  line('Rodadas Gratis', fs, BUY_PRICES_X100.freeSpins);
  line('Super Rodadas Gratis', sfs, BUY_PRICES_X100.superFreeSpins);
  console.log(`  aposta ante custa ${ANTE_COST_X100 / 100}x (${costOf(100, Mode.ANTE)} centavos sobre 100)`);
}

if (json) console.log(JSON.stringify(results, null, 2));

/** @param {import('./simulate.js').SimResult} r @param {number} ms */
function report(r, ms) {
  const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(2)}%`;
  console.log(`\n=== ${r.mode} — ${r.spins.toLocaleString('pt-BR')} rodadas (${(ms / 1000).toFixed(1)}s) ===`);
  console.log(`  RTP total          ${pct(r.rtp)}  (+-${(r.rtpCi95 * 100).toFixed(2)} p.p. IC95%)`);
  console.log(`    giro base        ${pct(r.baseRtp)}`);
  console.log(`    rodadas gratis   ${pct(r.featureRtp)}`);
  console.log(`    premio scatter   ${pct(r.scatterRtp)}`);
  console.log(`  freq. de acerto    ${pct(r.hitFrequency)}`);
  console.log(`  volatilidade (dp)  ${r.volatilityIndex.toFixed(2)}`);
  console.log(`  gatilho do bonus   ${pct(r.triggerRate)}  (1 em ${r.triggerOneIn.toFixed(0)})`);
  console.log(`  rodadas gratis med.${r.avgFreeSpins.toFixed(1)}  ganho medio ${r.avgFreeSpinWinX.toFixed(1)}x`);
  console.log(`  maior ganho        ${r.maxWinX.toFixed(1)}x   teto batido ${r.maxWinHits}x (1 em ${fmt(r.maxWinOneIn)})`);
  console.log('  distribuicao:');
  for (const b of r.distribution) {
    if (b.count === 0) continue;
    const bar = '#'.repeat(Math.min(40, Math.round(b.share * 200)));
    console.log(`    ${b.label.padEnd(18)} ${pct(b.share).padStart(7)} ${bar}`);
  }
}

/** @param {number} x */
function fmt(/** @type {number} */ x) {
  return Number.isFinite(x) ? x.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : 'nunca';
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}
