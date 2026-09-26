import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, toBook, solveWeights, integerWeights, tableStats, indexJson, gameConfigJson } from '../src/freaky/stake.js';
import { createEngine } from '../src/freaky/round.js';
import { createSeededRng } from '../src/engine/rng.js';
import { MODES, MAX_WIN_X100 } from '../src/freaky/config.js';
import { rgsParamsFromUrl, createRgsClient, eventsOfRound, RgsError } from '../src/freaky/ui/rgs.js';

const engine = createEngine();

test('index.json no formato exigido pelo RGS', () => {
  const idx = indexJson();
  assert.deepEqual(Object.keys(idx), ['modes']);
  assert.equal(idx.modes.length, Object.keys(MODES).length);
  for (const m of idx.modes) {
    assert.deepEqual(Object.keys(m), ['name', 'cost', 'events', 'weights']);
    assert.equal(typeof m.cost, 'number');
    assert.match(m.events, /^books_\w+\.jsonl\.zst$/);
    assert.match(m.weights, /^lookUpTable_\w+_0\.csv$/);
  }
  assert.equal(idx.modes.find((m) => m.name === 'base')?.cost, 1);
});

test('book tem os tres campos obrigatorios e termina em finalWin', () => {
  const rng = createSeededRng('book');
  for (let i = 0; i < 200; i++) {
    const r = engine.playRound({ rng, mode: 'hunt', trace: true });
    const b = toBook(i + 1, r);
    assert.equal(b.id, i + 1);
    assert.ok(Array.isArray(b.events));
    assert.ok(Number.isInteger(b.payoutMultiplier));
    assert.equal(b.events[b.events.length - 1].amount, b.payoutMultiplier);
    assert.equal(b.criteria, classify(r));
    // round-trip JSON sem perda
    assert.deepEqual(JSON.parse(JSON.stringify(b)), b);
  }
  assert.throws(() => toBook(1, engine.playRound({ rng, mode: 'base' })));
});

test('classificacao em baldes', () => {
  assert.equal(classify(/** @type {any} */ ({ capped: true, feature: 'festa' })), 'wincap');
  assert.equal(classify(/** @type {any} */ ({ capped: false, feature: 'rave' })), 'rave');
  assert.equal(classify(/** @type {any} */ ({ capped: false, feature: 'festa' })), 'festa');
  assert.equal(classify(/** @type {any} */ ({ capped: false, feature: null })), 'basegame');
});

/** Biblioteca sintetica com media conhecida. */
function syntheticLibrary() {
  const rng = createSeededRng('sint');
  /** @type {{ payoutMultiplier: number, criteria: any }[]} */
  const books = [];
  for (let i = 0; i < 5000; i++) books.push({ payoutMultiplier: rng.float() < 0.7 ? 0 : 10 * (1 + rng.int(40)), criteria: 'basegame' });
  for (let i = 0; i < 500; i++) books.push({ payoutMultiplier: 100 * (1 + rng.int(300)), criteria: 'festa' });
  for (let i = 0; i < 5; i++) books.push({ payoutMultiplier: MAX_WIN_X100, criteria: 'wincap' });
  return books;
}

test('reponderacao acerta o RTP e preserva a massa de cada balde', () => {
  const books = syntheticLibrary();
  const prob = { basegame: 0.99, festa: 0.00999, wincap: 0.00001 };
  for (const target of [80, 96.5, 120]) {
    const { weights, minFactor } = solveWeights(books, prob, target);
    assert.ok(minFactor > 0);
    const mass = { basegame: 0, festa: 0, wincap: 0 };
    let mean = 0;
    books.forEach((b, i) => { mass[/** @type {'basegame'} */ (b.criteria)] += weights[i]; mean += weights[i] * b.payoutMultiplier; });
    assert.ok(Math.abs(mean - target) < 1e-6, `media ${mean} x ${target}`);
    for (const [c, p] of Object.entries(prob)) assert.ok(Math.abs(mass[/** @type {'basegame'} */ (c)] - p) < 1e-12, c);
  }
});

test('reponderacao por balde acerta a media de cada balde antes do ajuste global', () => {
  const books = syntheticLibrary();
  const prob = { basegame: 0.99, festa: 0.00999, wincap: 0.00001 };
  const bucketMeans = { basegame: 70, festa: 16000 };
  const target = 0.99 * 70 + 0.00999 * 16000 + 0.00001 * MAX_WIN_X100;
  const { weights, lambda } = solveWeights(books, prob, target, bucketMeans);
  assert.ok(Math.abs(lambda) < 1e-9, 'com as medias certas nao sobra erro para o ajuste global');
  for (const [c, m] of Object.entries(bucketMeans)) {
    let w = 0, wx = 0;
    books.forEach((b, i) => { if (b.criteria === c) { w += weights[i]; wx += weights[i] * b.payoutMultiplier; } });
    assert.ok(Math.abs(wx / w - m) < 1e-6, c);
  }
});

test('balde com massa e sem amostra e erro', () => {
  assert.throws(() => solveWeights([{ payoutMultiplier: 0, criteria: 'basegame' }], { basegame: 0.9, rave: 0.1 }, 1));
});

test('pesos inteiros e estatisticas exatas da tabela', () => {
  const books = syntheticLibrary();
  const prob = { basegame: 0.99, festa: 0.00999, wincap: 0.00001 };
  const { weights } = solveWeights(books, prob, 96.5);
  const ints = integerWeights(weights);
  assert.ok(ints.every((w) => typeof w === 'bigint' && w >= 1n));
  const st = tableStats(ints, books.map((b) => b.payoutMultiplier), 100);
  assert.ok(Math.abs(st.rtp - 0.965) < 1e-9);
  assert.ok(Math.abs(st.maxWinProb - 0.00001) < 1e-9);
  assert.equal(st.maxPayoutX100, MAX_WIN_X100);
});

test('config do jogo descreve modos e tabela', () => {
  const cfg = gameConfigJson();
  assert.equal(cfg.ways, 4096);
  assert.equal(cfg.wincap, 25000);
  assert.equal(cfg.betModes.filter((m) => m.isBuyBonus).length, 2);
  assert.equal(cfg.paytable['6_H1'], 0.8);
});

test('RGS: parametros da URL', () => {
  assert.equal(rgsParamsFromUrl('https://x.test/index.html'), null);
  const p = rgsParamsFromUrl('https://x.test/index.html?sessionID=abc&rgs_url=rgs.test&lang=pt&device=mobile');
  assert.deepEqual(p, { sessionID: 'abc', rgsUrl: 'rgs.test', lang: 'pt', device: 'mobile' });
});

test('RGS: cliente fala o protocolo e traduz erros', async () => {
  /** @type {any[]} */
  const calls = [];
  /** @type {any} */
  const fakeFetch = async (/** @type {string} */ url, /** @type {any} */ init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (url.endsWith('/wallet/play') && JSON.parse(init.body).amount > 10) {
      return { ok: false, status: 400, json: async () => ({ code: 'ERR_IPB' }) };
    }
    return { ok: true, status: 200, json: async () => ({ balance: { amount: 5, currency: 'USD' }, round: { state: [{ type: 'finalWin', amount: 0 }] } }) };
  };
  const client = createRgsClient({ sessionID: 's1', rgsUrl: 'rgs.test', lang: 'pt', device: 'desktop' }, fakeFetch);
  await client.authenticate();
  const res = await client.play(1, 'festa');
  assert.deepEqual(eventsOfRound(res.round), [{ type: 'finalWin', amount: 0 }]);
  assert.equal(calls[0].url, 'https://rgs.test/wallet/authenticate');
  assert.deepEqual(calls[1].body, { sessionID: 's1', amount: 1, mode: 'FESTA' });
  await assert.rejects(client.play(100, 'base'), (/** @type {any} */ e) => e instanceof RgsError && e.code === 'ERR_IPB');
  assert.throws(() => eventsOfRound({}), RgsError);
});
