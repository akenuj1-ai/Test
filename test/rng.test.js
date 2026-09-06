import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeededRng, createSecureRng, createProvablyFairRng, weightedPicker,
} from '../src/engine/rng.js';

test('rng com semente e deterministico e reprodutivel', () => {
  const a = createSeededRng('semente-x');
  const b = createSeededRng('semente-x');
  const c = createSeededRng('semente-y');
  const seqA = Array.from({ length: 32 }, () => a.float());
  const seqB = Array.from({ length: 32 }, () => b.float());
  const seqC = Array.from({ length: 32 }, () => c.float());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
});

test('float fica em [0, 1) e int em [0, n)', () => {
  const rng = createSeededRng('faixa');
  for (let i = 0; i < 200000; i++) {
    const f = rng.float();
    assert.ok(f >= 0 && f < 1, `float fora da faixa: ${f}`);
    const n = rng.int(7);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 7, `int fora da faixa: ${n}`);
  }
});

test('rng seguro produz valores na faixa e nao repete a sequencia', () => {
  const rng = createSecureRng(64);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const f = rng.float();
    assert.ok(f >= 0 && f < 1);
    seen.add(f);
  }
  // colisoes sao possiveis mas raras; exigimos ao menos 99% de valores unicos
  assert.ok(seen.size > 4950, `poucos valores unicos: ${seen.size}`);
});

test('sorteio ponderado respeita os pesos', () => {
  const picker = weightedPicker([1, 3, 6]);
  assert.equal(picker.total, 10);
  const rng = createSeededRng('pesos');
  const counts = [0, 0, 0];
  const N = 400000;
  for (let i = 0; i < N; i++) counts[picker.pick(rng)] += 1;
  const observed = counts.map((c) => c / N);
  const expected = [0.1, 0.3, 0.6];
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(observed[i] - expected[i]) < 0.005,
      `peso ${i}: esperado ${expected[i]}, obtido ${observed[i]}`);
  }
});

test('peso zero nunca e sorteado', () => {
  const picker = weightedPicker([0, 5, 0, 5]);
  const rng = createSeededRng('zeros');
  for (let i = 0; i < 20000; i++) {
    const k = picker.pick(rng);
    assert.ok(k === 1 || k === 3, `sorteou indice de peso zero: ${k}`);
  }
});

test('pesos invalidos sao rejeitados', () => {
  assert.throws(() => weightedPicker([1, -1]), RangeError);
  assert.throws(() => weightedPicker([0, 0]), RangeError);
  assert.throws(() => weightedPicker([1, Number.NaN]), RangeError);
});

test('rng provably fair e reproduzivel a partir das tres sementes', () => {
  const args = { serverSeed: 'servidor-secreto', clientSeed: 'jogador-1', nonce: 42 };
  const a = createProvablyFairRng(args);
  const b = createProvablyFairRng(args);
  // mais de 8 valores forca a virada de bloco do HMAC
  const seqA = Array.from({ length: 40 }, () => a.float());
  const seqB = Array.from({ length: 40 }, () => b.float());
  assert.deepEqual(seqA, seqB);
  assert.equal(a.cursor(), 40);
});

test('nonces diferentes produzem rodadas diferentes', () => {
  const base = { serverSeed: 's', clientSeed: 'c' };
  const a = createProvablyFairRng({ ...base, nonce: 1 });
  const b = createProvablyFairRng({ ...base, nonce: 2 });
  assert.notDeepEqual(
    Array.from({ length: 16 }, () => a.float()),
    Array.from({ length: 16 }, () => b.float()),
  );
});
