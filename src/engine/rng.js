/**
 * Fontes de aleatoriedade do jogo.
 *
 * Tres implementacoes, todas expondo a mesma interface {@link Rng}:
 *
 *  - createSeededRng   : xoshiro128** — deterministico, rapido. Uso: simulacao
 *                        de RTP e testes. NAO usar para dinheiro real.
 *  - createSecureRng   : CSPRNG do ambiente (node:crypto / WebCrypto).
 *  - createProvablyFairRng : HMAC-SHA256(serverSeed, clientSeed:nonce:cursor),
 *                        deterministico e auditavel pelo jogador. Uso: producao.
 *
 * Todos os consumidores do motor recebem um Rng por injecao de dependencia;
 * nenhum modulo chama Math.random diretamente. Isso e o que torna cada rodada
 * reproduzivel a partir de uma semente.
 *
 * @typedef {object} Rng
 * @property {() => number} float      Retorna um numero em [0, 1).
 * @property {(n: number) => number} int Inteiro uniforme em [0, n).
 * @property {string} kind
 */

import { hmacSha256, utf8 } from './sha256.js';

/**
 * Mistura uma string em quatro palavras de 32 bits (variante de splitmix32).
 * @param {string} seed
 * @returns {Uint32Array}
 */
function seedState(seed) {
  let h = 1779033703 ^ seed.length;
  const state = new Uint32Array(4);
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    state[i] = (h ^= h >>> 16) >>> 0;
  }
  // xoshiro nao pode partir do estado zero
  if (!(state[0] | state[1] | state[2] | state[3])) state[0] = 0x9e3779b9;
  return state;
}

/**
 * PRNG xoshiro128** — periodo 2^128-1, passa em BigCrush. Deterministico.
 * @param {string|number} seed
 * @returns {Rng}
 */
export function createSeededRng(seed) {
  const s = seedState(String(seed));
  const next = () => {
    const r = (Math.imul((Math.imul(s[1], 5) >>> 0) << 7 | (Math.imul(s[1], 5) >>> 25), 9)) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t;
    s[3] = ((s[3] << 11) | (s[3] >>> 21)) >>> 0;
    return r;
  };
  return {
    kind: 'seeded',
    // 2^-32 mantem o resultado estritamente < 1
    float: () => next() * 2.3283064365386963e-10,
    int: (n) => Math.floor(next() * 2.3283064365386963e-10 * n),
  };
}

/**
 * CSPRNG do ambiente, com buffer para amortizar o custo por chamada.
 * @param {number} [bufferWords]
 * @returns {Rng}
 */
export function createSecureRng(bufferWords = 1024) {
  const getRandomValues = resolveCryptoSource();
  const buf = new Uint32Array(bufferWords);
  let i = buf.length;
  const next = () => {
    if (i >= buf.length) { getRandomValues(buf); i = 0; }
    return buf[i++];
  };
  return {
    kind: 'secure',
    float: () => next() * 2.3283064365386963e-10,
    int: (n) => Math.floor(next() * 2.3283064365386963e-10 * n),
  };
}

/** @returns {(a: Uint32Array) => void} */
function resolveCryptoSource() {
  const g = /** @type {any} */ (globalThis);
  if (g.crypto?.getRandomValues) return (a) => g.crypto.getRandomValues(a);
  throw new Error('Nenhuma fonte criptografica disponivel (globalThis.crypto ausente).');
}

/**
 * RNG "provably fair": o cassino publica sha256(serverSeed) antes da rodada,
 * o jogador escolhe o clientSeed, e o serverSeed e revelado depois. Com os
 * tres valores qualquer pessoa reconstroi a rodada bit a bit.
 *
 * Cada bloco HMAC rende 8 floats de 32 bits; o cursor avanca conforme o consumo.
 *
 * @param {object} opts
 * @param {string} opts.serverSeed
 * @param {string} opts.clientSeed
 * @param {number} opts.nonce  Indice da rodada; deve ser unico por serverSeed.
 * @returns {Rng & { cursor: () => number }}
 */
export function createProvablyFairRng({ serverSeed, clientSeed, nonce }) {
  const key = utf8(serverSeed);
  let block = -1;
  let word = 8;
  let consumed = 0;
  /** @type {DataView} */
  let view = new DataView(new ArrayBuffer(32));

  const next = () => {
    if (word >= 8) {
      block += 1;
      word = 0;
      const digest = hmacSha256(key, utf8(`${clientSeed}:${nonce}:${block}`));
      view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
    }
    consumed += 1;
    return view.getUint32(word++ * 4, false);
  };
  return {
    kind: 'provably-fair',
    float: () => next() * 2.3283064365386963e-10,
    int: (n) => Math.floor(next() * 2.3283064365386963e-10 * n),
    cursor: () => consumed,
  };
}

/**
 * Sorteio ponderado por busca binaria sobre a soma acumulada.
 * A tabela acumulada e pre-calculada uma unica vez por conjunto de pesos.
 *
 * @param {readonly number[]} weights
 * @returns {{ total: number, pick: (rng: Rng) => number }}
 */
export function weightedPicker(weights) {
  const cum = new Float64Array(weights.length);
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] < 0 || !Number.isFinite(weights[i])) {
      throw new RangeError(`Peso invalido no indice ${i}: ${weights[i]}`);
    }
    total += weights[i];
    cum[i] = total;
  }
  if (total <= 0) throw new RangeError('A soma dos pesos deve ser positiva.');

  return {
    total,
    pick(rng) {
      const target = rng.float() * total;
      let lo = 0;
      let hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (target < cum[mid]) hi = mid; else lo = mid + 1;
      }
      return lo;
    },
  };
}
