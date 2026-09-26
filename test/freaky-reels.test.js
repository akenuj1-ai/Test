import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStrip, buildReelSets, spinReels, scatterDistribution, specialChancePerReel, reelSetToCsv } from '../src/freaky/reels.js';
import { GRID, Sym, REEL_COUNTS, SYMBOLS } from '../src/freaky/config.js';
import { createSeededRng } from '../src/engine/rng.js';

const { REELS, ROWS, CELLS } = GRID;
const sets = buildReelSets();

test('fita preserva a contagem de cada simbolo', () => {
  for (const [name, reels] of Object.entries(REEL_COUNTS)) {
    reels.forEach((counts, r) => {
      const strip = sets[name].strips[r];
      const got = new Array(counts.length).fill(0);
      for (const s of strip) got[s] += 1;
      assert.deepEqual(got, [...counts], `${name} rolo ${r + 1}`);
    });
  }
});

test('fita e deterministica pela semente', () => {
  const a = buildStrip(REEL_COUNTS.BR0[1], 'x');
  const b = buildStrip(REEL_COUNTS.BR0[1], 'x');
  const c = buildStrip(REEL_COUNTS.BR0[1], 'y');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('especiais a pelo menos 4 posicoes (circular): nunca 2 na mesma janela', () => {
  for (const set of Object.values(sets)) {
    for (const strip of set.strips) {
      const n = strip.length;
      for (let stop = 0; stop < n; stop++) {
        let specials = 0;
        for (let row = 0; row < ROWS; row++) {
          const s = strip[(stop + row) % n];
          if (s === Sym.SCATTER || s === Sym.CAMEL) specials += 1;
        }
        assert.ok(specials <= 1, `${set.name}: parada ${stop} mostra ${specials} especiais`);
      }
    }
  }
});

test('fita curta demais para os especiais e recusada', () => {
  assert.throws(() => buildStrip([2, 0, 0, 0, 0, 0, 0, 0, 1, 2], 'z'), RangeError);
});

test('distribuicao de scatters e exata: bate com a enumeracao de todas as paradas', () => {
  const set = sets.BR0;
  // enumeracao por rolo: P(scatter visivel) contando paradas uma a uma
  const perReel = set.strips.map((strip) => {
    let hits = 0;
    for (let stop = 0; stop < strip.length; stop++) {
      for (let row = 0; row < ROWS; row++) {
        if (strip[(stop + row) % strip.length] === Sym.SCATTER) { hits += 1; break; }
      }
    }
    return hits / strip.length;
  });
  const exact = specialChancePerReel(set, Sym.SCATTER);
  perReel.forEach((p, r) => assert.ok(Math.abs(p - exact[r]) < 1e-12));
  const dist = scatterDistribution(set);
  assert.equal(dist.length, REELS + 1);
  assert.ok(Math.abs(dist.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('distribuicao exata x Monte Carlo', () => {
  const set = sets.BR0;
  const dist = scatterDistribution(set);
  const rng = createSeededRng('mc-scatter');
  const board = new Int8Array(CELLS);
  const stops = new Int32Array(REELS);
  const N = 400_000;
  const count = new Array(REELS + 1).fill(0);
  for (let i = 0; i < N; i++) {
    spinReels(set, rng, board, stops);
    let k = 0;
    for (let c = 0; c < CELLS; c++) if (board[c] === Sym.SCATTER) k += 1;
    count[k] += 1;
  }
  for (const k of [0, 1, 2, 3]) {
    const sd = Math.sqrt((dist[k] * (1 - dist[k])) / N);
    assert.ok(Math.abs(count[k] / N - dist[k]) < 5 * sd + 1e-6, `k=${k}: ${count[k] / N} x ${dist[k]}`);
  }
});

test('janela visivel = 4 posicoes seguidas da fita a partir da parada', () => {
  const set = sets.FR0;
  const rng = createSeededRng('janela');
  const board = new Int8Array(CELLS);
  const stops = new Int32Array(REELS);
  for (let i = 0; i < 200; i++) {
    spinReels(set, rng, board, stops);
    for (let r = 0; r < REELS; r++) {
      const strip = set.strips[r];
      for (let row = 0; row < ROWS; row++) {
        assert.equal(board[r * ROWS + row], strip[(stops[r] + row) % strip.length]);
      }
    }
  }
});

test('CSV no formato da math-sdk: uma coluna por rolo, codigos de simbolo', () => {
  const csv = reelSetToCsv(sets.BR0).trim().split('\n');
  assert.equal(csv.length, Math.max(...sets.BR0.strips.map((s) => s.length)));
  const codes = new Set(SYMBOLS.map((s) => s.code));
  for (const line of csv) {
    const cols = line.split(',');
    assert.equal(cols.length, REELS);
    for (const c of cols) assert.ok(c === '' || codes.has(c), c);
  }
});
