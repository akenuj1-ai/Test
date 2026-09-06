/**
 * Avaliacao de uma grade: quais simbolos formam combinacao, quanto pagam e
 * quais celulas devem explodir.
 *
 * Este modulo e puro: nao sorteia nada, nao muta a grade e nao conhece o
 * estado da rodada. Toda a aleatoriedade vive em rng.js/grid.js. Essa
 * separacao e o que permite testar o pagamento com grades montadas a mao.
 */

import { GRID, Sym, PAYING_FIRST, PAYING_LAST, MIN_CLUSTER, SYMBOL_COUNT } from './config.js';
import { buildPayLookup, buildScatterLookup, COUNT_SLOTS } from './paytable.js';
import { payToCents } from './money.js';
import { countSymbols } from './grid.js';

const { CELLS } = GRID;

/** Tabelas padrao, construidas uma unica vez no carregamento do modulo. */
export const DEFAULT_PAY_LOOKUP = buildPayLookup();
export const DEFAULT_SCATTER_LOOKUP = buildScatterLookup();

/**
 * @typedef {object} SymbolWin
 * @property {number} symbolId
 * @property {number} count
 * @property {number} payX100  premio em centesimos da aposta
 * @property {number} payCents
 * @property {number[]} [positions] indices na grade (so quando solicitado)
 */

/**
 * @typedef {object} Evaluation
 * @property {SymbolWin[]} wins
 * @property {number} winCents        soma das combinacoes (sem scatter)
 * @property {number} scatterCount
 * @property {number} scatterPayCents
 * @property {Uint8Array|null} removeMask  null quando nao ha combinacao
 */

/**
 * Premio de um simbolo para uma dada contagem, em centesimos da aposta.
 * @param {number} symbolId
 * @param {number} count
 * @param {Int32Array} [payLookup]
 * @returns {number}
 */
export function payoutX100(symbolId, count, payLookup = DEFAULT_PAY_LOOKUP) {
  if (symbolId < PAYING_FIRST || symbolId > PAYING_LAST) return 0;
  if (count < MIN_CLUSTER || count >= COUNT_SLOTS) return 0;
  return payLookup[symbolId * COUNT_SLOTS + count];
}

/**
 * @param {number} scatterCount
 * @param {Int32Array} [scatterLookup]
 * @returns {number} premio em centesimos da aposta
 */
export function scatterPayX100(scatterCount, scatterLookup = DEFAULT_SCATTER_LOOKUP) {
  if (scatterCount <= 0) return 0;
  return scatterLookup[Math.min(scatterCount, COUNT_SLOTS - 1)];
}

/**
 * Avalia uma grade.
 *
 * @param {Int8Array} grid
 * @param {number} betCents
 * @param {object} [opts]
 * @param {boolean} [opts.payScatter=false]  true apenas no sorteio inicial do giro.
 * @param {boolean} [opts.collectPositions=false] true na UI, false na simulacao.
 * @param {Int32Array} [opts.countBuffer] buffer reutilizavel de contagens.
 * @param {Int32Array} [opts.payLookup]
 * @param {Int32Array} [opts.scatterLookup]
 * @returns {Evaluation}
 */
export function evaluateGrid(grid, betCents, opts = {}) {
  const {
    payScatter = false,
    collectPositions = false,
    countBuffer,
    payLookup = DEFAULT_PAY_LOOKUP,
    scatterLookup = DEFAULT_SCATTER_LOOKUP,
  } = opts;

  const counts = countSymbols(grid, countBuffer ?? new Int32Array(SYMBOL_COUNT));

  /** @type {SymbolWin[]} */
  const wins = [];
  let winCents = 0;
  /** @type {Uint8Array|null} */
  let removeMask = null;

  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) {
    const count = counts[s];
    if (count < MIN_CLUSTER) continue;
    const payX100 = payLookup[s * COUNT_SLOTS + count];
    if (payX100 <= 0) continue;

    const payCents = payToCents(betCents, payX100);
    winCents += payCents;

    if (removeMask === null) removeMask = new Uint8Array(CELLS);
    /** @type {number[]|undefined} */
    let positions;
    if (collectPositions) positions = [];
    for (let i = 0; i < CELLS; i++) {
      if (grid[i] === s) {
        removeMask[i] = 1;
        positions?.push(i);
      }
    }
    wins.push(positions ? { symbolId: s, count, payX100, payCents, positions }
                        : { symbolId: s, count, payX100, payCents });
  }

  const scatterCount = counts[Sym.SCATTER];
  const scatterPayCents = payScatter
    ? payToCents(betCents, scatterPayX100(scatterCount, scatterLookup))
    : 0;

  return { wins, winCents, scatterCount, scatterPayCents, removeMask };
}
