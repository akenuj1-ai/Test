#!/usr/bin/env node
/**
 * Simulacao direta do Freaky Zoo, em paralelo, com histograma de ganhos.
 *
 *   npm run freaky:sim                              modo base, 20 milhoes de rodadas
 *   npm run freaky:sim -- --mode festa --rounds 2000000
 *   npm run freaky:sim -- --all                     todos os modos
 *   npm run freaky:sim -- --json
 *
 * Para o RTP use `npm run freaky:tune` (estimador decomposto, erro ~10x
 * menor). Este script existe para o que so a simulacao direta mostra: forma
 * da distribuicao, acerto, volatilidade e frequencia real dos gatilhos.
 */

import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mergeStats, summarize } from '../src/freaky/sim.js';
import { MODES } from '../src/freaky/config.js';

const argv = process.argv.slice(2);
const arg = (/** @type {string} */ name, /** @type {string} */ fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const JSON_OUT = argv.includes('--json');
const modes = argv.includes('--all') ? Object.keys(MODES) : [arg('--mode', 'base')];
const THREADS = Math.max(1, Math.min(availableParallelism(), 16));

/** Rodadas padrao por modo: bonus comprado e ~100x mais lento por rodada. */
const DEFAULT_ROUNDS = { base: 20_000_000, hunt: 10_000_000, lingua: 10_000_000, festa: 1_000_000, rave: 500_000 };

/**
 * @param {string} mode
 * @param {number} rounds
 */
async function run(mode, rounds) {
  const per = Math.ceil(rounds / THREADS);
  const parts = await Promise.all(Array.from({ length: THREADS }, (_, k) => new Promise((ok, fail) => {
    const w = new Worker(new URL('./freaky-worker.js', import.meta.url));
    w.once('message', (m) => { ok(m.stats); w.terminate(); });
    w.once('error', fail);
    w.postMessage({ id: 0, mode, rounds: per, seed: `sim-${mode}-${k}` });
  })));
  return summarize(mergeStats(/** @type {any} */ (parts)));
}

const pct = (/** @type {number} */ x, d = 2) => `${(x * 100).toFixed(d)}%`;
const oneIn = (/** @type {number} */ p) => (p > 0 ? `1 em ${Math.round(1 / p).toLocaleString('pt-BR')}` : '—');

/** @type {any[]} */
const reports = [];
for (const mode of modes) {
  if (!(mode in MODES)) throw new Error(`Modo desconhecido: ${mode}`);
  const rounds = Number(arg('--rounds', String(DEFAULT_ROUNDS[/** @type {keyof typeof DEFAULT_ROUNDS} */ (mode)])));
  const t0 = Date.now();
  const s = await run(mode, rounds);
  reports.push(s);
  if (JSON_OUT) continue;
  console.log(`\n${mode.toUpperCase()} · ${s.rounds.toLocaleString('pt-BR')} rodadas · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`  RTP ${pct(s.rtp, 3)} ±${(s.rtpCi95 * 100).toFixed(2)} p.p. (direto — use freaky:tune para precisao)`);
  console.log(`  acerto ${pct(s.hitRate)} · desvio padrao ${s.volatility.toFixed(1)}x o custo`);
  if (mode !== 'festa' && mode !== 'rave') {
    console.log(`  parcela do giro base ${pct(s.baseRtp)} · Festa ${oneIn(s.festaRate)} · Rave ${oneIn(s.raveRate)}`);
  } else {
    console.log(`  rodadas gratis medias ${s.avgFreeSpins.toFixed(2)} · re-gatilho ${pct(s.retriggerRate)} por bonus`);
  }
  console.log(`  maior ganho ${s.maxX.toLocaleString('pt-BR')}x · teto ${oneIn(s.cappedRate)}`);
  console.log('  distribuicao (multiplos da aposta base):');
  for (const b of s.buckets) {
    if (!b.count) continue;
    const label = b.from === 0 && b.to === 0.5 ? 'zero ou < 0,5x' : `${b.from.toLocaleString('pt-BR')}x – ${b.to === Infinity ? '∞' : `${b.to.toLocaleString('pt-BR')}x`}`;
    const bar = '█'.repeat(Math.max(1, Math.round(Math.sqrt(b.share) * 30)));
    console.log(`    ${label.padEnd(20)} ${pct(b.share, 4).padStart(9)}  ${bar}`);
  }
}
if (JSON_OUT) console.log(JSON.stringify(reports, null, 2));
