/**
 * Representacao e manipulacao da grade 6x5.
 *
 * A grade e um Int8Array de 30 posicoes. O indice e `col * ROWS + row`, com
 * row 0 no topo. Layout por coluna (e nao por linha) porque toda a mecanica
 * de cascata opera dentro de uma coluna: manter a coluna contigua na memoria
 * torna a queda uma operacao local e barata.
 *
 *   indice = col * 5 + row
 *   col    = (indice / 5) | 0
 *   row    = indice % 5
 */

import { GRID, Sym, SYMBOL_COUNT } from './config.js';
import { weightedPicker } from './rng.js';

const { COLS, ROWS, CELLS } = GRID;

/** @typedef {Int8Array} Grid */

/**
 * @param {number} col
 * @param {number} row
 * @returns {number}
 */
export const idx = (col, row) => col * ROWS + row;

/** @param {number} i */
export const colOf = (i) => (i / ROWS) | 0;
/** @param {number} i */
export const rowOf = (i) => i % ROWS;

/**
 * Fabrica de sorteadores de coluna.
 *
 * Constroi um sorteador ponderado por rolo, aplicando as transformacoes do
 * modo de jogo: multiplicador de frequencia do orbe, multiplicador de scatter
 * da aposta ante, e supressao do scatter nos refis de cascata.
 *
 * Os pesos sao pre-calculados uma unica vez por modo, nao a cada giro.
 *
 * @param {object} opts
 * @param {readonly (readonly number[])[]} opts.reelWeights
 * @param {number} [opts.orbFrequency]     Multiplicador do peso do orbe.
 * @param {number} [opts.scatterMultiplier] Multiplicador do peso do scatter.
 * @param {boolean} [opts.allowScatter]    false zera o peso do scatter.
 * @returns {{ pick: (rng: import('./rng.js').Rng, col: number) => number }}
 */
export function createReelSampler({
  reelWeights,
  orbFrequency = 1,
  scatterMultiplier = 1,
  allowScatter = true,
}) {
  if (reelWeights.length !== COLS) {
    throw new RangeError(`reelWeights precisa ter ${COLS} rolos, recebeu ${reelWeights.length}.`);
  }
  const pickers = reelWeights.map((weights, col) => {
    if (weights.length !== SYMBOL_COUNT) {
      throw new RangeError(`Rolo ${col} precisa de ${SYMBOL_COUNT} pesos, recebeu ${weights.length}.`);
    }
    const adjusted = weights.slice();
    adjusted[Sym.ORB] = weights[Sym.ORB] * orbFrequency;
    adjusted[Sym.SCATTER] = allowScatter ? weights[Sym.SCATTER] * scatterMultiplier : 0;
    return weightedPicker(adjusted);
  });
  return {
    pick: (rng, col) => pickers[col].pick(rng),
  };
}

/**
 * Sorteia uma grade completa.
 * @param {import('./rng.js').Rng} rng
 * @param {ReturnType<typeof createReelSampler>} sampler
 * @returns {Grid}
 */
export function drawGrid(rng, sampler) {
  const grid = new Int8Array(CELLS);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      grid[idx(col, row)] = sampler.pick(rng, col);
    }
  }
  return grid;
}

/**
 * Aplica a cascata: remove as posicoes marcadas, faz os simbolos restantes
 * cairem para o fundo da coluna e preenche o topo com novos sorteios.
 *
 * Muta `grid` no lugar — o chamador guarda copias quando precisa do historico.
 *
 * `payload` (opcional) e um array paralelo movido em sincronia com a grade —
 * usado para carregar o valor de cada orbe junto com a peca quando ela cai.
 * As celulas repreenchidas recebem 0 no payload.
 *
 * @param {Grid} grid
 * @param {Uint8Array} removeMask  1 = remover, 0 = manter. Tamanho CELLS.
 * @param {import('./rng.js').Rng} rng
 * @param {ReturnType<typeof createReelSampler>} refillSampler
 * @param {Int32Array} [payload]
 * @returns {number[]} indices das celulas recem-preenchidas
 */
export function tumble(grid, removeMask, rng, refillSampler, payload) {
  /** @type {number[]} */
  const refilled = [];
  for (let col = 0; col < COLS; col++) {
    let write = ROWS - 1; // escreve de baixo para cima
    for (let row = ROWS - 1; row >= 0; row--) {
      const i = idx(col, row);
      if (!removeMask[i]) {
        const dst = idx(col, write);
        grid[dst] = grid[i];
        if (payload) payload[dst] = payload[i];
        write -= 1;
      }
    }
    // as posicoes que sobraram no topo recebem novos simbolos
    for (let row = write; row >= 0; row--) {
      const i = idx(col, row);
      grid[i] = refillSampler.pick(rng, col);
      if (payload) payload[i] = 0;
      refilled.push(i);
    }
  }
  return refilled;
}

/**
 * Conta cada simbolo da grade.
 * @param {Grid} grid
 * @param {Int32Array} [into] buffer reutilizavel (evita alocacao no laco quente)
 * @returns {Int32Array} contagens indexadas por Sym
 */
export function countSymbols(grid, into) {
  const counts = into ?? new Int32Array(SYMBOL_COUNT);
  counts.fill(0);
  for (let i = 0; i < CELLS; i++) counts[grid[i]] += 1;
  return counts;
}

/**
 * @param {Grid} grid
 * @returns {number[][]} matriz [row][col] de ids de simbolo, para depuracao/UI
 */
export function toMatrix(grid) {
  const out = [];
  for (let row = 0; row < ROWS; row++) {
    const line = [];
    for (let col = 0; col < COLS; col++) line.push(grid[idx(col, row)]);
    out.push(line);
  }
  return out;
}
