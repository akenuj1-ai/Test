import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWays } from '../src/freaky/ways.js';
import { GRID, Sym, PAYTABLE } from '../src/freaky/config.js';

const { REELS, ROWS, CELLS } = GRID;
const J = Sym.J, L = Sym.LION, W = Sym.WILD, S = Sym.SCATTER, K = Sym.K, Q = Sym.Q, A = Sym.A, T = Sym.TURTLE, M = Sym.MONKEY;

/**
 * Monta uma grade a partir de colunas (rolo a rolo, de cima para baixo).
 * @param {number[][]} cols
 * @param {Record<number, number>} [mults] indice de celula -> multiplicador
 */
function grid(cols, mults = {}) {
  const board = new Int8Array(CELLS);
  const mult = new Int32Array(CELLS).fill(1);
  cols.forEach((col, r) => col.forEach((s, row) => { board[r * ROWS + row] = s; }));
  for (const [i, m] of Object.entries(mults)) mult[Number(i)] = m;
  return { board, mult };
}
const idx = (/** @type {number} */ r, /** @type {number} */ row) => r * ROWS + row;

// preenchimento que nao forma nada: cada rolo com simbolos distintos entre si e do vizinho
/** @type {number[][]} */
const FILL = [
  [Q, K, A, T], [M, S, Q, K], [A, T, M, S], [Q, K, A, T], [M, S, Q, K], [A, T, M, S],
];

test('grade sem combinacao nao paga', () => {
  const { board, mult } = grid(FILL);
  assert.equal(evaluateWays(board, mult), 0);
});

test('3 leoes seguidos a partir do rolo 1: um way', () => {
  const cols = FILL.map((c) => [...c]);
  cols[0][0] = L; cols[1][2] = L; cols[2][3] = L;
  const { board, mult } = grid(cols);
  /** @type {any[]} */
  const wins = [];
  assert.equal(evaluateWays(board, mult, wins), PAYTABLE[Sym.LION][0]);
  assert.equal(wins.length, 1);
  assert.equal(wins[0].kind, 3);
  assert.equal(wins[0].ways, 1);
  assert.deepEqual(wins[0].positions.sort((/** @type {number} */ a, /** @type {number} */ b) => a - b), [idx(0, 0), idx(1, 2), idx(2, 3)]);
});

test('ways multiplicam: 2 x 3 x 1 leoes = 6 ways', () => {
  const cols = FILL.map((c) => [...c]);
  cols[0][0] = L; cols[0][1] = L;
  cols[1][0] = L; cols[1][1] = L; cols[1][2] = L;
  cols[2][3] = L;
  const { board, mult } = grid(cols);
  assert.equal(evaluateWays(board, mult), 6 * PAYTABLE[Sym.LION][0]);
});

test('combinacao para no primeiro rolo sem o simbolo', () => {
  const cols = FILL.map((c) => [...c]);
  cols[0][0] = L; cols[1][0] = L; cols[3][0] = L; cols[4][0] = L; // falta no rolo 3
  const { board, mult } = grid(cols);
  assert.equal(evaluateWays(board, mult), 0);
});

test('nao comeca no rolo 1 = nao paga', () => {
  const cols = FILL.map((c) => [...c]);
  cols[1][0] = L; cols[2][0] = L; cols[3][0] = L;
  const { board, mult } = grid(cols);
  assert.equal(evaluateWays(board, mult), 0);
});

test('6 rolos pagam o valor de 6', () => {
  const cols = FILL.map((c) => [...c]);
  for (let r = 0; r < REELS; r++) cols[r][1] = J;
  const { board, mult } = grid(cols);
  assert.equal(evaluateWays(board, mult), PAYTABLE[Sym.J][3]);
});

test('wild substitui, e multiplicadores SOMAM no rolo e MULTIPLICAM entre rolos', () => {
  const cols = FILL.map((c) => [...c]);
  cols[0][0] = L;
  cols[1][0] = L; cols[1][1] = W;         // rolo 2: 1 + 5 = 6
  cols[2][2] = W;                         // rolo 3: 10
  const { board, mult } = grid(cols, { [idx(1, 1)]: 5, [idx(2, 2)]: 10 });
  /** @type {any[]} */
  const wins = [];
  const total = evaluateWays(board, mult, wins);
  const lion = wins.find((w) => w.symbol === Sym.LION);
  assert.equal(lion.ways, 1 * 6 * 10);
  assert.equal(lion.plainWays, 1 * 2 * 1);
  assert.equal(lion.winX100, PAYTABLE[Sym.LION][0] * 60);
  assert.ok(total >= lion.winX100);
});

test('wild serve a varios simbolos ao mesmo tempo', () => {
  const cols = FILL.map((c) => [...c]);
  cols[0][0] = L; cols[0][1] = J;
  cols[1][0] = W;
  cols[2][0] = L; cols[2][1] = J;
  const { board, mult } = grid(cols);
  /** @type {any[]} */
  const wins = [];
  evaluateWays(board, mult, wins);
  assert.deepEqual(wins.map((w) => w.symbol).sort(), [J, L].sort());
});

test('rolo inteiro de wild (lingua) = 4 ways para cada simbolo que passa', () => {
  const cols = FILL.map((c) => [...c]);
  cols[0][0] = L;
  cols[1] = [W, W, W, W];
  cols[2][0] = L;
  const { board, mult } = grid(cols);
  /** @type {any[]} */
  const wins = [];
  evaluateWays(board, mult, wins);
  assert.equal(wins.find((w) => w.symbol === L).ways, 4);
});

test('scatter e camelo nao pagam em ways', () => {
  /** @type {number[][]} */
  const cols = FILL.map(() => [S, Sym.CAMEL, Sym.CAMEL, S]);
  const { board, mult } = grid(cols);
  assert.equal(evaluateWays(board, mult), 0);
});

test('produto enorme e travado sem perder a exatidao dos inteiros', () => {
  /** @type {number[][]} */
  const cols = FILL.map(() => [W, W, W, W]);
  cols[0] = [L, L, L, L];
  /** @type {Record<number, number>} */
  const mults = {};
  for (let r = 1; r < REELS; r++) for (let row = 0; row < ROWS; row++) mults[idx(r, row)] = 100;
  const { board, mult } = grid(cols, mults);
  const total = evaluateWays(board, mult);
  assert.ok(Number.isSafeInteger(total));
  assert.ok(total > 2_500_000);
});
