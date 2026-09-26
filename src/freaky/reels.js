/**
 * Fitas de rolo (reel strips).
 *
 * Um cassino de verdade — e a math-sdk da Stake Engine — sorteia uma PARADA
 * por rolo numa fita fixa, e a janela visivel sao as 4 posicoes a partir dela.
 * Aqui as fitas nao sao digitadas a mao: sao montadas a partir das contagens de
 * config.js por um embaralhamento com semente fixa. Resultado deterministico,
 * exportavel como CSV (formato da math-sdk) e com duas garantias estruturais:
 *
 *  - especiais (scatter e camelo) ficam a >= ROWS posicoes um do outro, de
 *    forma circular, entao nenhuma janela mostra dois especiais no mesmo rolo;
 *  - cada especial e visto em exatamente ROWS paradas, o que torna a
 *    probabilidade de ele aparecer EXATA: ROWS * contagem / comprimento.
 */

import { GRID, Sym, SYMBOLS, REEL_COUNTS, REEL_SEED, STACK_WEIGHTS } from './config.js';
import { createSeededRng } from '../engine/rng.js';

const { REELS, ROWS } = GRID;

/**
 * @typedef {object} ReelSet
 * @property {string} name
 * @property {Int8Array[]} strips
 */

/**
 * Monta uma fita a partir das contagens de simbolo.
 *
 * @param {readonly number[]} counts contagem por simbolo (ordem de `Sym`)
 * @param {string} seed
 * @returns {Int8Array}
 */
export function buildStrip(counts, seed) {
  const rng = createSeededRng(seed);
  const length = counts.reduce((a, b) => a + b, 0);

  /** @type {number[]} */
  const specials = [];
  /** @type {number[][]} */
  const blocks = [];
  counts.forEach((n, sym) => {
    if (sym === Sym.SCATTER || sym === Sym.CAMEL) {
      for (let i = 0; i < n; i++) specials.push(sym);
      return;
    }
    // simbolos normais entram em PILHAS de 1 a 4 iguais: a janela mostra
    // menos simbolos diferentes, o acerto cai e o ganho grande (pilhas
    // alinhadas) fica maior — e a alavanca classica de volatilidade em ways
    const weights = stackWeightsFor(sym);
    let left = n;
    while (left > 0) {
      const size = Math.min(left, pickIndex(weights, rng) + 1);
      blocks.push(new Array(size).fill(sym));
      left -= size;
    }
  });

  const spacing = specials.length ? length / specials.length : length;
  if (specials.length && spacing < ROWS) {
    throw new RangeError(`Fita curta demais: ${specials.length} especiais em ${length} posicoes.`);
  }

  shuffle(specials, rng);
  shuffle(blocks, rng);
  const normals = blocks.flat();

  const strip = new Int8Array(length).fill(-1);
  // especiais espalhados de forma uniforme; a folga (spacing - ROWS) vira um
  // deslocamento aleatorio que nunca viola a distancia minima
  const slack = Math.max(0, Math.floor(spacing) - ROWS);
  const start = rng.int(length);
  specials.forEach((sym, k) => {
    const jitter = slack > 0 ? rng.int(slack + 1) - (slack >> 1) : 0;
    const base = Math.round(k * spacing) + (k === 0 ? 0 : jitter);
    strip[(start + base + length) % length] = sym;
  });
  assertSpecialSpacing(strip);

  let j = 0;
  for (let i = 0; i < length; i++) {
    if (strip[i] === -1) strip[i] = normals[j++];
  }
  return strip;
}

/**
 * Pesos do tamanho de pilha (indice 0 = pilha de 1) para um simbolo.
 * @param {number} sym
 */
function stackWeightsFor(sym) {
  if (sym === Sym.WILD) return STACK_WEIGHTS.wild;
  return SYMBOLS[sym].kind === 'high' ? STACK_WEIGHTS.high : STACK_WEIGHTS.low;
}

/**
 * Sorteio ponderado simples (so usado na montagem das fitas).
 * @param {readonly number[]} weights
 * @param {import('../engine/rng.js').Rng} rng
 */
function pickIndex(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rng.float() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Garante a distancia minima circular entre especiais.
 * @param {Int8Array} strip  pode conter -1 (posicao ainda vazia)
 */
function assertSpecialSpacing(strip) {
  /** @type {number[]} */
  const at = [];
  strip.forEach((s, i) => { if (s === Sym.SCATTER || s === Sym.CAMEL) at.push(i); });
  for (let k = 0; k < at.length; k++) {
    const next = k + 1 < at.length ? at[k + 1] : at[0] + strip.length;
    if (at.length > 1 && next - at[k] < ROWS) {
      throw new Error(`Especiais a menos de ${ROWS} posicoes na fita (indices ${at[k]} e ${next % strip.length}).`);
    }
  }
}

/**
 * Fisher-Yates.
 * @template T
 * @param {T[]} arr
 * @param {import('../engine/rng.js').Rng} rng
 */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const k = rng.int(i + 1);
    const tmp = arr[i]; arr[i] = arr[k]; arr[k] = tmp;
  }
}

/**
 * Monta todos os conjuntos de fitas.
 * @param {Readonly<Record<string, readonly (readonly number[])[]>>} [counts]
 * @param {string} [seed]
 * @returns {Record<string, ReelSet>}
 */
export function buildReelSets(counts = REEL_COUNTS, seed = REEL_SEED) {
  /** @type {Record<string, ReelSet>} */
  const sets = {};
  for (const [name, reels] of Object.entries(counts)) {
    if (reels.length !== REELS) throw new RangeError(`${name}: esperava ${REELS} rolos.`);
    sets[name] = { name, strips: reels.map((c, r) => buildStrip(c, `${seed}:${name}:${r}`)) };
  }
  return sets;
}

/**
 * Sorteia as paradas e escreve a janela visivel em `board`.
 * Indice de celula: reel * ROWS + row (row 0 = topo).
 *
 * @param {ReelSet} set
 * @param {import('../engine/rng.js').Rng} rng
 * @param {Int8Array} board  saida, CELLS posicoes
 * @param {Int32Array} stops saida, REELS posicoes
 */
export function spinReels(set, rng, board, stops) {
  for (let r = 0; r < REELS; r++) {
    const strip = set.strips[r];
    const n = strip.length;
    const stop = rng.int(n);
    stops[r] = stop;
    const base = r * ROWS;
    for (let row = 0; row < ROWS; row++) {
      const p = stop + row;
      board[base + row] = strip[p < n ? p : p - n];
    }
  }
}

/**
 * Probabilidade EXATA de cada rolo mostrar um especial.
 * @param {ReelSet} set
 * @param {number} sym  Sym.SCATTER ou Sym.CAMEL
 * @returns {number[]}
 */
export function specialChancePerReel(set, sym) {
  return set.strips.map((strip) => {
    let count = 0;
    for (const s of strip) if (s === sym) count += 1;
    return (ROWS * count) / strip.length;
  });
}

/**
 * Distribuicao EXATA do numero de scatters visiveis: convolucao de Bernoullis
 * independentes (um especial por rolo, no maximo).
 * @param {ReelSet} set
 * @returns {number[]} indice = quantidade de scatters (0..REELS)
 */
export function scatterDistribution(set) {
  let dist = [1];
  for (const p of specialChancePerReel(set, Sym.SCATTER)) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - p);
      next[k + 1] += q * p;
    });
    dist = next;
  }
  return dist;
}

/**
 * Exporta um conjunto de fitas no formato CSV da math-sdk: uma linha por
 * posicao, uma coluna por rolo, codigos de simbolo (L4, H1, W, S...).
 * Fitas de comprimentos diferentes deixam a celula vazia.
 * @param {ReelSet} set
 */
export function reelSetToCsv(set) {
  const longest = Math.max(...set.strips.map((s) => s.length));
  const lines = [];
  for (let i = 0; i < longest; i++) {
    lines.push(set.strips.map((s) => (i < s.length ? SYMBOLS[s[i]].code : '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}
