/**
 * Avaliacao de 4.096 ways com multiplicadores.
 *
 * Para cada simbolo pagante s:
 *
 *     W_r = soma dos multiplicadores das celulas do rolo r que servem a s
 *           (o proprio s vale 1; um wild vale o multiplicador dele)
 *     comprimento L = rolos seguidos, a partir do primeiro, com W_r > 0
 *     premio = PAYTABLE[s][L] * W_0 * W_1 * ... * W_(L-1)      (se L >= 3)
 *
 * Sem multiplicador, o produto dos W_r e exatamente o numero de ways. Com
 * multiplicador, e a soma, sobre todos os ways, do produto dos multiplicadores
 * de cada way — a definicao usual de "multiplicadores se multiplicam no way".
 *
 * Como o rolo 1 nunca tem wild, cada way pertence a um unico simbolo e nao ha
 * contagem dupla.
 */

import { GRID, Sym, PAYING_COUNT, PAYTABLE, MIN_KIND, SYMBOLS } from './config.js';

const { REELS, ROWS } = GRID;

/**
 * Teto do produto de ways. Acima disso qualquer premio ja passa do ganho
 * maximo (menor premio 5 x 1e9 >> 2.500.000), entao o valor exato nao importa —
 * e travar aqui mantem a conta dentro dos inteiros exatos do double.
 */
const PRODUCT_GUARD = 1e9;

/**
 * @typedef {object} WayWin
 * @property {number} symbol
 * @property {string} code
 * @property {number} kind         quantidade de rolos (3..6)
 * @property {number} ways         produto dos W_r (ways ponderados pelo multiplicador)
 * @property {number} plainWays    numero de ways sem multiplicador
 * @property {number} payX100      premio por way
 * @property {number} winX100      payX100 * ways
 * @property {number[]} positions  indices de celula (reel * ROWS + row)
 */

/**
 * Tabela de premio achatada: indice symbol * (REELS + 1) + L.
 * @param {readonly (readonly number[])[]} [paytable]
 */
export function buildPayLookup(paytable = PAYTABLE) {
  const lookup = new Int32Array(PAYING_COUNT * (REELS + 1));
  for (let s = 0; s < PAYING_COUNT; s++) {
    for (let L = MIN_KIND; L <= REELS; L++) {
      lookup[s * (REELS + 1) + L] = paytable[s][L - MIN_KIND];
    }
  }
  return lookup;
}

const DEFAULT_LOOKUP = buildPayLookup();

/**
 * Avalia a grade. Laco quente do simulador: sem alocacao quando `wins` e null.
 *
 * @param {Int8Array} board
 * @param {Int32Array} mult  multiplicador por celula (so e lido em wilds)
 * @param {WayWin[]|null} [wins]  se dado, recebe o detalhe de cada ganho
 * @param {Int32Array} [payLookup]
 * @returns {number} ganho total em centesimos da aposta
 */
export function evaluateWays(board, mult, wins = null, payLookup = DEFAULT_LOOKUP) {
  let total = 0;
  for (let s = 0; s < PAYING_COUNT; s++) {
    // rolo 1: sem wild por construcao
    let first = 0;
    for (let row = 0; row < ROWS; row++) if (board[row] === s) first += 1;
    if (first === 0) continue;

    let product = first;
    let plain = first;
    let L = 1;
    for (let r = 1; r < REELS; r++) {
      const base = r * ROWS;
      let w = 0;
      let c = 0;
      for (let row = 0; row < ROWS; row++) {
        const cell = board[base + row];
        if (cell === s) { w += 1; c += 1; } else if (cell === Sym.WILD) { w += mult[base + row]; c += 1; }
      }
      if (w === 0) break;
      product *= w;
      if (product > PRODUCT_GUARD) product = PRODUCT_GUARD;
      plain *= c;
      L += 1;
    }
    if (L < MIN_KIND) continue;

    const pay = payLookup[s * (REELS + 1) + L];
    const win = pay * product;
    total += win;

    if (wins) {
      /** @type {number[]} */
      const positions = [];
      for (let r = 0; r < L; r++) {
        for (let row = 0; row < ROWS; row++) {
          const i = r * ROWS + row;
          if (board[i] === s || (r > 0 && board[i] === Sym.WILD)) positions.push(i);
        }
      }
      wins.push({
        symbol: s, code: SYMBOLS[s].code, kind: L, ways: product, plainWays: plain,
        payX100: pay, winX100: win, positions,
      });
    }
  }
  return total;
}
