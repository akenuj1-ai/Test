/**
 * Pre-calculo das tabelas de premio.
 *
 * O laco de avaliacao roda dezenas de milhoes de vezes na simulacao, entao
 * varrer as faixas [min, max, premio] a cada simbolo e desperdicio. Aqui a
 * tabela e "achatada" uma unica vez em um Int32Array indexado por
 * `simbolo * (CELLS + 1) + contagem`, transformando a consulta em um acesso
 * direto.
 *
 * Como efeito colateral util, a tabela vira um parametro do motor: o
 * calibrador (tools/tune.js) escala a tabela sem tocar em config.js.
 */

import { GRID, PAYTABLE, SCATTER_PAYS, SYMBOL_COUNT, PAYING_FIRST, PAYING_LAST, MIN_CLUSTER } from './config.js';

/** Numero de contagens possiveis: 0..CELLS. */
export const COUNT_SLOTS = GRID.CELLS + 1;

/**
 * @param {readonly (readonly (readonly number[])[])[]} [paytable]
 * @returns {Int32Array} indexado por simbolo * COUNT_SLOTS + contagem
 */
export function buildPayLookup(paytable = PAYTABLE) {
  const table = new Int32Array(SYMBOL_COUNT * COUNT_SLOTS);
  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) {
    const tiers = paytable[s];
    if (!tiers || tiers.length === 0) {
      throw new RangeError(`Tabela de premios sem faixas para o simbolo ${s}.`);
    }
    for (let count = MIN_CLUSTER; count < COUNT_SLOTS; count++) {
      let pay = 0;
      for (const [min, max, value] of tiers) {
        if (count >= min && count <= max) { pay = value; break; }
      }
      // contagem acima do ultimo teto paga a faixa mais alta
      if (pay === 0 && count > tiers[tiers.length - 1][1]) pay = tiers[tiers.length - 1][2];
      table[s * COUNT_SLOTS + count] = pay;
    }
  }
  return table;
}

/**
 * @param {readonly number[]} [scatterPays]
 * @returns {Int32Array} indexado pela quantidade de scatters (0..CELLS)
 */
export function buildScatterLookup(scatterPays = SCATTER_PAYS) {
  const table = new Int32Array(COUNT_SLOTS);
  const last = scatterPays.length - 1;
  for (let n = 0; n < COUNT_SLOTS; n++) table[n] = scatterPays[Math.min(n, last)];
  return table;
}

/**
 * Multiplica todos os premios por um fator e arredonda para o multiplo de 5
 * mais proximo (mantendo a invariante de divisibilidade de money.js).
 * Usado apenas pelo calibrador.
 *
 * @param {readonly (readonly (readonly number[])[])[]} paytable
 * @param {number} scale
 * @returns {number[][][]}
 */
export function scalePaytable(paytable, scale) {
  return paytable.map((tiers) => tiers.map(([min, max, pay]) => {
    const scaled = Math.max(5, Math.round((pay * scale) / 5) * 5);
    return [min, max, scaled];
  }));
}

/**
 * @param {readonly number[]} scatterPays
 * @param {number} scale
 * @returns {number[]}
 */
export function scaleScatterPays(scatterPays, scale) {
  return scatterPays.map((p) => (p === 0 ? 0 : Math.max(5, Math.round((p * scale) / 5) * 5)));
}
