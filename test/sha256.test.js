import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { sha256, hmacSha256, utf8, toHex } from '../src/engine/sha256.js';

test('sha256 bate com os vetores oficiais do NIST', () => {
  assert.equal(toHex(sha256(utf8(''))),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(toHex(sha256(utf8('abc'))),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(toHex(sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});

test('sha256 concorda com node:crypto em todo comprimento ate 3 blocos', () => {
  // Teste diferencial: em vez de vetores decorados, comparamos com a
  // implementacao da plataforma. Cobre todos os casos de padding, incluindo
  // os limites de 55/56 e 119/120 bytes onde o bloco extra aparece.
  for (let len = 0; len <= 200; len++) {
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = (i * 31 + len) & 0xff;
    const mine = toHex(sha256(bytes));
    const theirs = createHash('sha256').update(bytes).digest('hex');
    assert.equal(mine, theirs, `divergiu no comprimento ${len}`);
  }
});

test('sha256 concorda com node:crypto em entradas grandes e aleatorias', () => {
  for (let i = 0; i < 50; i++) {
    const bytes = randomBytes(1 + Math.floor(Math.random() * 5000));
    assert.equal(toHex(sha256(bytes)), createHash('sha256').update(bytes).digest('hex'));
  }
});

test('hmac-sha256 concorda com node:crypto para chaves curtas, exatas e longas', () => {
  for (const keyLen of [0, 1, 32, 63, 64, 65, 200]) {
    for (const msgLen of [0, 1, 55, 64, 500]) {
      const key = randomBytes(keyLen);
      const msg = randomBytes(msgLen);
      const mine = toHex(hmacSha256(key, msg));
      const theirs = createHmac('sha256', key).update(msg).digest('hex');
      assert.equal(mine, theirs, `divergiu com chave ${keyLen} / msg ${msgLen}`);
    }
  }
});

test('hmac-sha256 bate com os vetores da RFC 4231', () => {
  assert.equal(
    toHex(hmacSha256(new Uint8Array(20).fill(0x0b), utf8('Hi There'))),
    'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
  );
  assert.equal(
    toHex(hmacSha256(utf8('Jefe'), utf8('what do ya want for nothing?'))),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  );
});

test('hmac aceita chave maior que o bloco (a chave e reduzida por hash)', () => {
  assert.equal(
    toHex(hmacSha256(new Uint8Array(131).fill(0xaa), utf8('Test Using Larger Than Block-Size Key - Hash Key First'))),
    '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
  );
});
