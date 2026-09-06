/**
 * SHA-256 e HMAC-SHA256 sincronos em JS puro.
 *
 * Motivo de existir: o esquema "provably fair" precisa produzir exatamente o
 * mesmo resultado no Node (servidor / simulador) e no navegador (cliente).
 * A WebCrypto do navegador so expoe API assincrona, o que impediria usar o
 * hash dentro do laco sincrono do motor. Esta implementacao e pequena,
 * auditavel e testada contra vetores conhecidos (ver test/sha256.test.js).
 *
 * Nao use este modulo para criptografia de producao: ele nao e resistente a
 * ataques de canal lateral (timing). Aqui serve apenas para verificacao de
 * integridade das rodadas, onde a chave e revelada ao final de qualquer forma.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const BLOCK_BYTES = 64;

/** @param {number} x @param {number} n */
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

/**
 * Digest SHA-256.
 * @param {Uint8Array} message
 * @returns {Uint8Array} 32 bytes
 */
export function sha256(message) {
  const bitLen = message.length * 8;
  // Padding: byte 0x80, zeros, e 8 bytes com o comprimento em bits (big-endian).
  // Sao necessarios len + 1 + 8 bytes arredondados para cima ao proximo bloco.
  // O arredondamento tem de ser `ceil`: usar `floor + 1` acrescenta um bloco
  // inteiro de zeros quando len + 9 ja e multiplo de 64 (len = 55, 119, ...),
  // o que muda o digest.
  const paddedLen = Math.ceil((message.length + 9) / BLOCK_BYTES) * BLOCK_BYTES;
  const buf = new Uint8Array(paddedLen);
  buf.set(message);
  buf[message.length] = 0x80;
  const view = new DataView(buf.buffer);
  // comprimento cabe em 53 bits com seguranca; escrevemos os 64 bits em duas metades
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let off = 0; off < paddedLen; off += BLOCK_BYTES) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i], false);
  return out;
}

/**
 * HMAC-SHA256 (RFC 2104).
 * @param {Uint8Array} key
 * @param {Uint8Array} message
 * @returns {Uint8Array} 32 bytes
 */
export function hmacSha256(key, message) {
  let k = key;
  if (k.length > BLOCK_BYTES) k = sha256(k);
  const pad = new Uint8Array(BLOCK_BYTES);
  pad.set(k);

  const inner = new Uint8Array(BLOCK_BYTES + message.length);
  const outer = new Uint8Array(BLOCK_BYTES + 32);
  for (let i = 0; i < BLOCK_BYTES; i++) {
    inner[i] = pad[i] ^ 0x36;
    outer[i] = pad[i] ^ 0x5c;
  }
  inner.set(message, BLOCK_BYTES);
  outer.set(sha256(inner), BLOCK_BYTES);
  return sha256(outer);
}

/** @param {string} str @returns {Uint8Array} */
export function utf8(str) {
  return new TextEncoder().encode(str);
}

/** @param {Uint8Array} bytes @returns {string} */
export function toHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}
