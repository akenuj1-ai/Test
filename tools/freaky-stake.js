#!/usr/bin/env node
/**
 * Exporta o Freaky Zoo no formato de matematica da Stake Engine.
 *
 *   npm run freaky:stake                 biblioteca completa (>= 100 mil books por modo)
 *   npm run freaky:stake -- --quick      biblioteca pequena, para testar o fluxo
 *   npm run freaky:stake -- --out DIR    pasta de saida (padrao out/stake/freaky_zoo)
 *
 * Saida — exatamente o que o upload de math da Stake Engine pede:
 *
 *   index.json                          modos, custo e nomes dos arquivos
 *   books_<modo>.jsonl.zst              uma rodada por linha: id, events, payoutMultiplier
 *   lookUpTable_<modo>_0.csv            id, peso (uint64), payoutMultiplier
 *   lookUpTableIdToCriteria_<modo>.csv  id, balde (basegame/festa/rave/wincap)
 *   reels/*.csv                         fitas no formato da math-sdk
 *   config.json                         descricao do jogo (simbolos, tabela, modos)
 *   stats.json                          RTP, acerto e ganho maximo de cada tabela
 *
 * Depois de escrever, o proprio script faz a checagem que o RGS faz no upload:
 * cada id do CSV existe no book, o payoutMultiplier do CSV bate com o do book,
 * e o RTP de todos os modos fica dentro de 0,5 p.p. entre si e em 90%-98%.
 */

import { Worker } from 'node:worker_threads';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { mergeStats } from '../src/freaky/sim.js';
import { createEngine } from '../src/freaky/round.js';
import { reelSetToCsv } from '../src/freaky/reels.js';
import { indexJson, gameConfigJson, tableStats } from '../src/freaky/stake.js';
import { MODES, TARGET_RTP, MAX_WIN_X100 } from '../src/freaky/config.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const outArg = argv.indexOf('--out');
const OUT = resolve(ROOT, outArg >= 0 ? argv[outArg + 1] : 'out/stake/freaky_zoo');
const SEED = 'freaky-zoo-stake-v1';
const div = QUICK ? 50 : 1;

/** Books por balde. A Stake recomenda 100 mil a 1 milhao de simulacoes por modo. */
const COUNTS = {
  baseLike: { basegame: 100_000 / div, festa: 20_000 / div, rave: 10_000 / div, wincap: Math.max(10, 100 / div) },
  buy: { feature: 100_000 / div, wincap: Math.max(10, 200 / div) },
};

const pct = (/** @type {number} */ x, d = 3) => `${(x * 100).toFixed(d)}%`;

/**
 * Chance de teto e media (fora do teto) de cada tipo de bonus, medidas em
 * paralelo e sem trace — milhoes de bonus custam segundos, contra minutos
 * para gravar o mesmo tanto de books.
 * @returns {Promise<Record<'festa'|'rave10'|'rave12'|'rave15', { cap: number, meanNoCap: number, rounds: number }>>}
 */
async function measureFeatures() {
  const jobs = [
    { key: 'festa', mode: 'festa', rounds: 3_000_000 / div, freeSpins: 10 },
    { key: 'rave10', mode: 'rave', rounds: 1_500_000 / div, freeSpins: 10 },
    { key: 'rave12', mode: 'rave', rounds: 400_000 / div, freeSpins: 12 },
    { key: 'rave15', mode: 'rave', rounds: 200_000 / div, freeSpins: 15 },
  ];
  const threads = 4;
  /** @type {Record<string, { cap: number, meanNoCap: number, rounds: number }>} */
  const rates = {};
  for (const job of jobs) {
    const parts = await Promise.all(Array.from({ length: threads }, (_, k) => new Promise((ok, fail) => {
      const w = new Worker(new URL('./freaky-worker.js', import.meta.url));
      w.once('message', (m) => { ok(m.stats); w.terminate(); });
      w.once('error', fail);
      w.postMessage({ id: 0, mode: job.mode, rounds: Math.ceil(job.rounds / threads), seed: `${SEED}:cap:${job.key}:${k}`, freeSpins: job.freeSpins });
    })));
    const st = mergeStats(/** @type {any} */ (parts));
    rates[job.key] = {
      // pelo menos uma ocorrencia "virtual" para nunca zerar um balde que existe
      cap: Math.max(st.capped, 1) / st.rounds,
      meanNoCap: (st.sum * 100 - st.capped * MAX_WIN_X100) / (st.rounds - st.capped),
      rounds: st.rounds,
    };
  }
  return /** @type {any} */ (rates);
}

/**
 * @param {string} mode
 * @param {any} features
 * @returns {Promise<any>}
 */
function buildMode(mode, features) {
  const counts = mode === 'festa' || mode === 'rave' ? COUNTS.buy : COUNTS.baseLike;
  return new Promise((ok, fail) => {
    const w = new Worker(new URL('./freaky-stake-worker.js', import.meta.url), {
      workerData: { mode, counts, features, seed: SEED, outDir: OUT },
    });
    w.once('message', ok);
    w.once('error', fail);
  });
}

/**
 * Refaz a checagem do RGS a partir dos arquivos gravados.
 * @param {string} mode
 * @param {string} booksFile
 */
async function verify(mode, booksFile) {
  const csv = (await readFile(join(OUT, `lookUpTable_${mode}_0.csv`), 'utf8')).trim().split('\n');
  // streaming: uma biblioteca de bonus descomprimida passa facil de 512 MB,
  // o limite de uma string no V8
  const input = createReadStream(join(OUT, booksFile));
  const lines = createInterface({
    input: booksFile.endsWith('.zst') ? input.pipe(zlib.createZstdDecompress()) : input,
    crlfDelay: Infinity,
  });
  /** @type {bigint[]} */
  const weights = [];
  /** @type {number[]} */
  const payouts = [];
  let i = 0;
  for await (const line of lines) {
    if (!line) continue;
    if (i >= csv.length) throw new Error(`${mode}: mais books que linhas no CSV.`);
    const [id, w, p] = csv[i].split(',');
    const book = JSON.parse(line);
    for (const key of ['id', 'events', 'payoutMultiplier']) {
      if (!(key in book)) throw new Error(`${mode}: book ${i + 1} sem "${key}".`);
    }
    if (String(book.id) !== id) throw new Error(`${mode}: id ${book.id} no book x ${id} no CSV.`);
    if (String(book.payoutMultiplier) !== p) throw new Error(`${mode}: payout ${book.payoutMultiplier} no book ${id} x ${p} no CSV.`);
    if (!/^\d+$/.test(w) || !/^\d+$/.test(p)) throw new Error(`${mode}: linha ${i + 1} nao e uint64.`);
    const final = book.events.at(-1);
    if (final?.type !== 'finalWin' || final.amount !== book.payoutMultiplier) {
      throw new Error(`${mode}: book ${id} nao termina com finalWin = payoutMultiplier.`);
    }
    if (book.payoutMultiplier > MAX_WIN_X100) throw new Error(`${mode}: book ${id} passa do teto.`);
    weights.push(BigInt(w));
    payouts.push(Number(p));
    i += 1;
  }
  if (i !== csv.length) throw new Error(`${mode}: ${i} books x ${csv.length} linhas no CSV.`);
  if (weights.reduce((a, b) => a + b, 0n) >= 2n ** 64n) throw new Error(`${mode}: soma dos pesos estoura uint64.`);
  return tableStats(weights, payouts, MODES[/** @type {keyof typeof MODES} */ (mode)].costX100);
}

async function main() {
  const t0 = Date.now();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'reels'), { recursive: true });
  console.log(`Freaky Zoo -> Stake Engine ${QUICK ? '(rapido)' : ''}\nsaida: ${OUT}\n`);

  const engine = createEngine();
  for (const [name, set] of Object.entries(engine.reelSets)) {
    await writeFile(join(OUT, 'reels', `${name}.csv`), reelSetToCsv(set));
  }
  await writeFile(join(OUT, 'index.json'), `${JSON.stringify(indexJson(), null, 4)}\n`);
  await writeFile(join(OUT, 'config.json'), `${JSON.stringify(gameConfigJson(), null, 2)}\n`);

  process.stdout.write('medindo os bonus (teto e media)... ');
  const features = await measureFeatures();
  console.log(Object.entries(features).map(([k, v]) => `${k} ${(v.meanNoCap / 100).toFixed(1)}x, teto 1/${Math.round(1 / v.cap)}`).join(' · '));

  // dois modos por vez: cada um usa uma thread e bastante memoria de trace
  const modes = Object.keys(MODES);
  /** @type {any[]} */
  const results = [];
  for (let i = 0; i < modes.length; i += 2) {
    const batch = await Promise.all(modes.slice(i, i + 2).map((m) => buildMode(m, features)));
    results.push(...batch);
    for (const r of batch) {
      console.log(`  ${r.mode.padEnd(7)} ${String(r.books).padStart(7)} books · amostra ${pct(r.rawRtp)} · modelo ${pct(r.modelRtp)} -> tabela ${pct(r.rtp, 4)} (fatores ${r.factorRange.map((/** @type {number} */ f) => f.toFixed(3)).join('..')})`);
    }
  }

  console.log('\nverificacao (a mesma do upload do RGS):');
  /** @type {Record<string, any>} */
  const stats = {};
  for (const r of results) {
    const v = await verify(r.mode, r.booksFile);
    stats[r.mode] = { ...r, verified: { rtp: v.rtp, hitRate: v.hitRate, maxWinProb: v.maxWinProb, maxPayoutX: v.maxPayoutX100 / 100 } };
    const mw = v.maxWinProb > 0 ? `1 em ${Math.round(1 / v.maxWinProb).toLocaleString('pt-BR')}` : 'nunca';
    console.log(`  ${r.mode.padEnd(7)} RTP ${pct(v.rtp, 4)} · acerto ${pct(v.hitRate, 2)} · ganho max ${(v.maxPayoutX100 / 100).toLocaleString('pt-BR')}x (${mw})`);
  }
  const rtps = Object.values(stats).map((s) => s.verified.rtp);
  const spread = Math.max(...rtps) - Math.min(...rtps);
  const problems = [];
  if (spread > 0.005) problems.push(`diferenca entre modos ${pct(spread)} > 0,5 p.p.`);
  for (const [m, s] of Object.entries(stats)) {
    if (s.verified.rtp < 0.9 || s.verified.rtp > 0.98) problems.push(`${m}: RTP fora de 90%-98%`);
    if (s.verified.maxPayoutX < MAX_WIN_X100 / 100) problems.push(`${m}: ganho maximo nao aparece na biblioteca`);
  }
  if ((stats.base?.verified.hitRate ?? 1) < 0.05) problems.push('base: acerto abaixo de 1 em 20');

  await writeFile(join(OUT, 'stats.json'), `${JSON.stringify({ target: TARGET_RTP, spread, features, modes: stats }, null, 2)}\n`);
  console.log(`\ndiferenca entre modos: ${(spread * 100).toFixed(4)} p.p. · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (problems.length) {
    console.error(`\nPROBLEMAS:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log('tudo dentro das regras de aprovacao de math da Stake Engine.');
  }
}

await main();
