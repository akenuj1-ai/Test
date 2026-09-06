import test from 'node:test';
import assert from 'node:assert/strict';
import { idx, colOf, rowOf, tumble, countSymbols, toMatrix, drawGrid, createReelSampler } from '../src/engine/grid.js';
import { GRID, Sym, SYMBOL_COUNT, REEL_WEIGHTS } from '../src/engine/config.js';
import { createSeededRng } from '../src/engine/rng.js';

const { COLS, ROWS, CELLS } = GRID;

/** Sorteador falso que devolve sempre o mesmo simbolo — torna a cascata determinista. */
const constantSampler = (symbolId) => ({ pick: () => symbolId });

test('indexacao de grade e consistente nos dois sentidos', () => {
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const i = idx(col, row);
      assert.equal(colOf(i), col);
      assert.equal(rowOf(i), row);
    }
  }
  assert.equal(idx(COLS - 1, ROWS - 1), CELLS - 1);
});

test('cascata: sobreviventes caem para o fundo e o topo e repreenchido', () => {
  // coluna 0 = [A, B, C, D, E] de cima para baixo; removemos B e D
  const grid = new Int8Array(CELLS).fill(Sym.RED);
  grid[idx(0, 0)] = Sym.BLUE;
  grid[idx(0, 1)] = Sym.GREEN;   // removido
  grid[idx(0, 2)] = Sym.YELLOW;
  grid[idx(0, 3)] = Sym.PURPLE;  // removido
  grid[idx(0, 4)] = Sym.CUP;

  const mask = new Uint8Array(CELLS);
  mask[idx(0, 1)] = 1;
  mask[idx(0, 3)] = 1;

  const refilled = tumble(grid, mask, createSeededRng('x'), constantSampler(Sym.CROWN));

  // fundo -> topo: CUP, YELLOW, BLUE sobreviveram nessa ordem
  assert.equal(grid[idx(0, 4)], Sym.CUP);
  assert.equal(grid[idx(0, 3)], Sym.YELLOW);
  assert.equal(grid[idx(0, 2)], Sym.BLUE);
  // as duas de cima sao novas
  assert.equal(grid[idx(0, 1)], Sym.CROWN);
  assert.equal(grid[idx(0, 0)], Sym.CROWN);
  assert.deepEqual(refilled.sort((a, b) => a - b), [idx(0, 0), idx(0, 1)]);
});

test('cascata nao mexe em colunas sem remocao', () => {
  const grid = new Int8Array(CELLS);
  for (let i = 0; i < CELLS; i++) grid[i] = i % 9;
  const before = Array.from(grid);
  const mask = new Uint8Array(CELLS);
  mask[idx(2, 0)] = 1;

  tumble(grid, mask, createSeededRng('y'), constantSampler(Sym.CROWN));

  for (let col = 0; col < COLS; col++) {
    if (col === 2) continue;
    for (let row = 0; row < ROWS; row++) {
      assert.equal(grid[idx(col, row)], before[idx(col, row)], `coluna ${col} foi alterada`);
    }
  }
});

test('cascata leva o payload junto e zera as celulas repreenchidas', () => {
  const grid = new Int8Array(CELLS).fill(Sym.RED);
  grid[idx(3, 4)] = Sym.ORB;
  grid[idx(3, 2)] = Sym.GREEN;

  const payload = new Int32Array(CELLS);
  payload[idx(3, 4)] = 250; // valor do orbe no fundo

  const mask = new Uint8Array(CELLS);
  mask[idx(3, 2)] = 1;

  tumble(grid, mask, createSeededRng('z'), constantSampler(Sym.BLUE), payload);

  // o orbe estava no fundo e continua la, com o valor preservado
  assert.equal(grid[idx(3, 4)], Sym.ORB);
  assert.equal(payload[idx(3, 4)], 250);
  // a celula nova do topo tem payload zerado
  assert.equal(payload[idx(3, 0)], 0);
});

test('remover a coluna inteira repreenche as cinco posicoes', () => {
  const grid = new Int8Array(CELLS).fill(Sym.RED);
  const mask = new Uint8Array(CELLS);
  for (let row = 0; row < ROWS; row++) mask[idx(1, row)] = 1;

  const refilled = tumble(grid, mask, createSeededRng('w'), constantSampler(Sym.CROWN));
  const inCol1 = refilled.filter((i) => colOf(i) === 1);
  assert.equal(inCol1.length, ROWS);
  for (let row = 0; row < ROWS; row++) assert.equal(grid[idx(1, row)], Sym.CROWN);
});

test('contagem de simbolos soma o total de celulas', () => {
  const rng = createSeededRng('contagem');
  const sampler = createReelSampler({ reelWeights: REEL_WEIGHTS });
  for (let t = 0; t < 200; t++) {
    const grid = drawGrid(rng, sampler);
    const counts = countSymbols(grid);
    assert.equal(counts.reduce((a, b) => a + b, 0), CELLS);
    assert.equal(counts.length, SYMBOL_COUNT);
  }
});

test('countSymbols reutiliza o buffer sem vazar contagem antiga', () => {
  const buffer = new Int32Array(SYMBOL_COUNT);
  const a = new Int8Array(CELLS).fill(Sym.CROWN);
  const b = new Int8Array(CELLS).fill(Sym.BLUE);
  countSymbols(a, buffer);
  const second = countSymbols(b, buffer);
  assert.equal(second[Sym.CROWN], 0);
  assert.equal(second[Sym.BLUE], CELLS);
});

test('sorteador respeita as opcoes de modo', () => {
  const rng = createSeededRng('modo');
  const semScatter = createReelSampler({ reelWeights: REEL_WEIGHTS, allowScatter: false });
  for (let t = 0; t < 500; t++) {
    const grid = drawGrid(rng, semScatter);
    assert.equal(countSymbols(grid)[Sym.SCATTER], 0, 'scatter apareceu com allowScatter=false');
  }
});

test('createReelSampler valida o formato dos pesos', () => {
  assert.throws(() => createReelSampler({ reelWeights: [[1, 2, 3]] }), RangeError);
  assert.throws(
    () => createReelSampler({ reelWeights: REEL_WEIGHTS.map((r) => r.slice(0, 5)) }),
    RangeError,
  );
});

test('toMatrix devolve linhas x colunas na ordem visual', () => {
  const grid = new Int8Array(CELLS);
  grid[idx(0, 0)] = Sym.CROWN;
  grid[idx(5, 4)] = Sym.SCATTER;
  const m = toMatrix(grid);
  assert.equal(m.length, ROWS);
  assert.equal(m[0].length, COLS);
  assert.equal(m[0][0], Sym.CROWN);
  assert.equal(m[ROWS - 1][COLS - 1], Sym.SCATTER);
});
