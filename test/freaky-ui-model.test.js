import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, splitSpins, stopPlan, winTier } from '../src/freaky/ui/board-model.js';
import { createEngine } from '../src/freaky/round.js';
import { evaluateWays } from '../src/freaky/ways.js';
import { createSeededRng } from '../src/engine/rng.js';
import { GRID, SYMBOLS, MODES } from '../src/freaky/config.js';

const engine = createEngine();
const idOf = Object.fromEntries(SYMBOLS.map((s) => [s.code, s.id]));

/**
 * Converte a grade da interface para o formato do motor.
 * @param {import('../src/freaky/ui/board-model.js').Board} board
 */
function toEngine(board) {
  const b = new Int8Array(GRID.CELLS);
  const m = new Int32Array(GRID.CELLS).fill(1);
  board.forEach((col, r) => col.forEach((c, row) => {
    b[r * GRID.ROWS + row] = idOf[c.name];
    if (c.multiplier) m[r * GRID.ROWS + row] = c.multiplier;
  }));
  return { b, m };
}

test('a grade reconstruida pela interface e a grade que o motor avaliou', () => {
  let spins = 0, wins = 0;
  for (const mode of Object.keys(MODES)) {
    const rng = createSeededRng(`ui-${mode}`);
    const n = mode === 'festa' || mode === 'rave' ? 250 : 5000;
    for (let i = 0; i < n; i++) {
      const r = engine.playRound({ rng, mode: /** @type {any} */ (mode), trace: true });
      /** @type {any} */
      let board = null;
      for (const spin of splitSpins(/** @type {any[]} */ (r.events))) {
        let win = 0;
        for (const ev of spin) {
          board = applyEvent(board, ev);
          if (ev.type === 'winInfo') {
            win = ev.totalWin;
            wins += 1;
            for (const w of ev.wins) {
              for (const p of w.positions) {
                const cell = board[p.reel][p.row];
                assert.ok(cell.name === w.symbol || (cell.name === 'W' && p.reel > 0), `${mode}: ${cell.name} em ganho de ${w.symbol}`);
              }
            }
          }
        }
        if (board && spin[0].type === 'reveal') {
          spins += 1;
          const { b, m } = toEngine(board);
          assert.equal(evaluateWays(b, m), win, `${mode}: ganho recalculado difere`);
        }
      }
    }
  }
  assert.ok(spins > 20_000 && wins > 5000);
});

test('splitSpins: cada reveal abre um giro; gatilho de compra fica antes', () => {
  const r = engine.playRound({ rng: createSeededRng('split'), mode: 'festa', trace: true });
  const spins = splitSpins(/** @type {any[]} */ (r.events));
  assert.equal(spins[0][0].type, 'freeSpinTrigger');
  assert.equal(spins.filter((s) => s[0].type === 'reveal').length, r.freeSpinsPlayed);
});

test('antecipacao so depois de 2 globos', () => {
  const col = (/** @type {string} */ n) => [{ name: n }, { name: 'L4' }, { name: 'L3' }, { name: 'L2' }];
  const plan = stopPlan([col('S'), col('L1'), col('S'), col('L1'), col('S'), col('L1')]);
  assert.deepEqual(plan.map((p) => p.anticipation), [false, false, false, true, true, true]);
});

test('faixas de celebracao', () => {
  assert.equal(winTier(5), null);
  assert.equal(winTier(20)?.key, 'big');
  assert.equal(winTier(150)?.key, 'mega');
  assert.equal(winTier(600)?.key, 'freaky');
  assert.equal(winTier(3000)?.key, 'sigma');
  assert.equal(winTier(1, true)?.key, 'max');
});
