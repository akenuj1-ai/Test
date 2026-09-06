import test from 'node:test';
import assert from 'node:assert/strict';
import { revealSchedule } from '../src/ui/reveal.js';
import { GRID, Sym, SCATTER_TRIGGER } from '../src/engine/config.js';

const OPCOES = {
  cols: GRID.COLS, rows: GRID.ROWS,
  scatterId: Sym.SCATTER, trigger: SCATTER_TRIGGER,
  step: 50, anticipation: 400, rowStep: 25, tile: 260,
};

/** Grade sem moeda nenhuma. */
const vazia = () => new Array(GRID.CELLS).fill(Sym.RED);

/** Põe `n` moedas na coluna `col`. */
function comMoedas(grid, col, n) {
  for (let row = 0; row < n; row++) grid[col * GRID.ROWS + row] = Sym.SCATTER;
  return grid;
}

/** Atraso da primeira célula de cada coluna. */
const porColuna = (r) => Array.from({ length: GRID.COLS }, (_, c) => r.delays[c * GRID.ROWS]);

test('sem moedas, as colunas aparecem em ritmo constante', () => {
  const r = revealSchedule(vazia(), OPCOES);
  assert.equal(r.anticipated, false);
  assert.deepEqual(porColuna(r), [0, 50, 100, 150, 200, 250]);
  assert.equal(r.total, 300 + 4 * 25 + 260);
});

test('dentro de uma coluna, as linhas de cima assentam depois', () => {
  const r = revealSchedule(vazia(), OPCOES);
  for (let col = 0; col < GRID.COLS; col++) {
    for (let row = 1; row < GRID.ROWS; row++) {
      assert.ok(r.delays[col * GRID.ROWS + row] > r.delays[col * GRID.ROWS + row - 1]);
    }
  }
});

test('com 3 moedas nas duas primeiras colunas, as demais são seguradas', () => {
  const grid = comMoedas(comMoedas(vazia(), 0, 2), 1, 1);
  const r = revealSchedule(grid, OPCOES);
  assert.equal(r.anticipated, true);
  // A terceira moeda fecha na coluna 1, então a espera já vale para a coluna 2:
  // é o instante em que o jogador percebe que falta uma. Segurar só a partir
  // da 3 desperdiçaria a melhor coluna da rodada.
  assert.deepEqual(porColuna(r), [0, 50, 450, 850, 1250, 1650]);
});

test('duas moedas não seguram nada — ainda faltam duas para o gatilho', () => {
  const r = revealSchedule(comMoedas(vazia(), 0, 2), OPCOES);
  assert.equal(r.anticipated, false);
  assert.deepEqual(porColuna(r), [0, 50, 100, 150, 200, 250]);
});

test('moedas só na última coluna não geram espera — não há o que esperar', () => {
  const r = revealSchedule(comMoedas(vazia(), GRID.COLS - 1, 3), OPCOES);
  assert.equal(r.anticipated, false);
});

test('a antecipação continua depois do gatilho já garantido', () => {
  // 4 moedas na primeira coluna: o bônus já está fechado, mas segurar o resto
  // é justamente o que faz a rodada valer a pena de assistir
  const r = revealSchedule(comMoedas(vazia(), 0, 4), OPCOES);
  assert.equal(r.anticipated, true);
  const d = porColuna(r);
  for (let c = 1; c < GRID.COLS; c++) assert.equal(d[c] - d[c - 1], 400);
});

test('os atrasos nunca voltam atrás e o total cobre a última peça', () => {
  const grid = comMoedas(comMoedas(vazia(), 1, 2), 2, 1);
  const r = revealSchedule(grid, OPCOES);
  const d = porColuna(r);
  for (let c = 1; c < GRID.COLS; c++) assert.ok(d[c] > d[c - 1]);
  assert.ok(r.total >= Math.max(...r.delays) + OPCOES.tile);
});

test('a revelação não depende de nada além das moedas já mostradas', () => {
  // trocar símbolos que não são moeda não pode mudar o cronograma
  const a = vazia();
  const b = vazia().map((_, i) => (i % 3 === 0 ? Sym.CROWN : Sym.BLUE));
  assert.deepEqual(revealSchedule(a, OPCOES).delays, revealSchedule(b, OPCOES).delays);
});
