import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, costX100Of, tiltWeights } from '../src/freaky/round.js';
import { createSeededRng } from '../src/engine/rng.js';
import { MODES, MAX_WIN_X100, BUY_SPINS, RETRIGGER_SPINS, GORILLA_MULT_VALUES, FRENZY_WILD_MULT, GRID } from '../src/freaky/config.js';

const engine = createEngine();

/**
 * @param {number} n
 * @param {any} opts
 */
function playMany(n, opts) {
  const rng = createSeededRng(opts.seed ?? 'round');
  return Array.from({ length: n }, () => engine.playRound({ rng, ...opts }));
}

test('custo por modo', () => {
  assert.equal(costX100Of('base'), 100);
  assert.equal(costX100Of('hunt'), 300);
  assert.equal(costX100Of('lingua'), 200);
  assert.equal(costX100Of('festa'), 10000);
  assert.equal(costX100Of('rave'), 50000);
  assert.throws(() => costX100Of(/** @type {any} */ ('xyz')), RangeError);
  assert.throws(() => engine.playRound({ rng: createSeededRng(1), mode: /** @type {any} */ ('xyz') }), RangeError);
});

test('mesma semente, mesma rodada — e o trace nao muda o dinheiro', () => {
  for (const mode of Object.keys(MODES)) {
    for (let i = 0; i < 40; i++) {
      const a = engine.playRound({ rng: createSeededRng(`d${i}`), mode: /** @type {any} */ (mode), trace: true });
      const b = engine.playRound({ rng: createSeededRng(`d${i}`), mode: /** @type {any} */ (mode), trace: true });
      const c = engine.playRound({ rng: createSeededRng(`d${i}`), mode: /** @type {any} */ (mode) });
      assert.deepEqual(a, b);
      const { events, ...rest } = a;
      assert.deepEqual(rest, c, `${mode} #${i}`);
    }
  }
});

test('payout inteiro, dentro do teto, e parcelas fecham', () => {
  for (const mode of Object.keys(MODES)) {
    for (const r of playMany(mode === 'festa' || mode === 'rave' ? 400 : 4000, { mode, seed: `inv-${mode}` })) {
      assert.ok(Number.isInteger(r.payoutX100) && r.payoutX100 >= 0);
      assert.ok(r.payoutX100 <= MAX_WIN_X100);
      assert.equal(r.baseWinX100 + r.freeWinX100, r.payoutX100);
      assert.ok(r.freeSpinsPlayed <= r.freeSpinsAwarded);
      if (!r.capped) assert.equal(r.freeSpinsPlayed, r.freeSpinsAwarded);
    }
  }
});

test('compra: sem giro base, 10 rodadas + re-gatilhos', () => {
  for (const mode of /** @type {const} */ (['festa', 'rave'])) {
    for (const r of playMany(300, { mode, seed: `buy-${mode}` })) {
      assert.equal(r.feature, mode);
      assert.equal(r.bought, true);
      assert.equal(r.baseWinX100, 0);
      assert.equal(r.freeSpinsAwarded, BUY_SPINS + r.retriggers * RETRIGGER_SPINS);
    }
  }
});

test('gatilho natural: 3 globos = Festa, 4+ = Rave', () => {
  let seen = 0;
  for (const r of playMany(40_000, { mode: 'hunt', seed: 'gatilho' })) {
    if (r.scatters >= 3 && !r.capped) {
      seen += 1;
      assert.equal(r.feature, r.scatters === 3 ? 'festa' : 'rave');
    } else if (!r.capped) {
      assert.equal(r.feature, null);
    }
  }
  assert.ok(seen > 100);
});

/**
 * Todos os eventos de um tipo em N rodadas com trace.
 * @param {string} mode @param {number} n @param {string} type
 */
function eventsOf(mode, n, type) {
  return playMany(n, { mode, trace: true, seed: `ev-${mode}-${type}` })
    .flatMap((r) => /** @type {any[]} */ (r.events).filter((e) => e.type === type));
}

test('Rave Sigma: camelo nunca cospe e a lingua gruda', () => {
  const camels = eventsOf('rave', 300, 'camel');
  assert.ok(camels.length > 50);
  for (const ev of camels) {
    assert.ok(ev.camels.every((/** @type {any} */ c) => c.action === 'tongue'));
    assert.ok(ev.tongues.every((/** @type {any} */ t) => t.sticky));
  }
  assert.ok(eventsOf('rave', 300, 'stickyWilds').length > 0, 'rolos grudentos voltam nos giros seguintes');
});

test('rolo grudento volta todo wild (menos globo e gorila) em todo giro seguinte', () => {
  for (const r of playMany(200, { mode: 'rave', trace: true, seed: 'sticky' })) {
    /** @type {Set<number>} */
    const stuck = new Set();
    for (const ev of /** @type {any[]} */ (r.events)) {
      if (ev.type === 'stickyWilds') assert.deepEqual([...ev.reels].sort(), [...stuck].sort());
      if (ev.type === 'camel') for (const t of ev.tongues) stuck.add(t.reel);
    }
  }
});

test('gorila do bonus tem multiplicador da tabela; no base, so o surto traz x2', () => {
  for (const ev of eventsOf('festa', 200, 'gorillaMultipliers')) {
    for (const w of ev.wilds) assert.ok(GORILLA_MULT_VALUES.includes(w.multiplier));
  }
  // no modo base so conta o giro base: rodadas que disparam bonus tem gorilas com multi
  for (const r of playMany(3000, { mode: 'base', trace: true, seed: 'gorila-base' })) {
    let gameType = '';
    for (const ev of /** @type {any[]} */ (r.events)) {
      if (ev.type === 'reveal') gameType = ev.gameType;
      if (ev.type === 'gorillaMultipliers') assert.equal(gameType, 'freegame');
    }
  }
  const frenzies = eventsOf('base', 20_000, 'freakyFrenzy');
  assert.ok(frenzies.length > 100);
  for (const ev of frenzies) {
    assert.ok(ev.wilds.length >= 2 && ev.wilds.length <= 5);
    for (const w of ev.wilds) {
      assert.equal(w.multiplier, FRENZY_WILD_MULT);
      assert.ok(w.reel >= 1, 'surto nunca no rolo 1');
    }
  }
});

test('cuspe rebaixa todos os altos da grade', () => {
  let spits = 0;
  for (const r of playMany(20_000, { mode: 'base', trace: true, seed: 'cuspe' })) {
    for (const ev of /** @type {any[]} */ (r.events)) {
      if (ev.type !== 'camel' || !ev.spit?.length) continue;
      spits += 1;
      for (const s of ev.spit) assert.ok(['L1', 'L2', 'L3', 'L4'].includes(s.to));
    }
  }
  assert.ok(spits > 100);
});

test('Lingua Garantida: todo giro base tem camelo lambendo (salvo 4 globos nos rolos 2-5)', () => {
  for (const r of playMany(3000, { mode: 'lingua', trace: true, seed: 'lingua' })) {
    const reveal = /** @type {any[]} */ (r.events).find((e) => e.type === 'reveal');
    const camel = /** @type {any[]} */ (r.events).find((e) => e.type === 'camel');
    const scattersMid = reveal.board.slice(1, 5).filter((/** @type {any[]} */ col) => col.some((c) => c.name === 'S')).length;
    if (scattersMid === 4) continue;
    assert.ok(camel, 'giro sem camelo');
    assert.ok(camel.camels.every((/** @type {any} */ c) => c.action === 'tongue'));
  }
});

test('teto: trava em 25.000x e descarta o resto do bonus', () => {
  const small = createEngine({ maxWinX100: 5000 });
  const rng = createSeededRng('teto');
  let capped = 0;
  for (let i = 0; i < 400; i++) {
    const r = small.playRound({ rng, mode: 'rave', trace: true });
    assert.ok(r.payoutX100 <= 5000);
    if (r.capped) {
      capped += 1;
      assert.equal(r.payoutX100, 5000);
      const types = /** @type {any[]} */ (r.events).map((e) => e.type);
      assert.equal(types.at(-2), 'wincap');
      assert.equal(types.at(-1), 'finalWin');
    }
  }
  assert.ok(capped > 20);
});

test('eventos: indices em ordem e finalWin = payout', () => {
  for (const mode of Object.keys(MODES)) {
    for (const r of playMany(200, { mode, trace: true, seed: `idx-${mode}` })) {
      const events = /** @type {any[]} */ (r.events);
      events.forEach((e, i) => assert.equal(e.index, i));
      assert.equal(events.at(-1).type, 'finalWin');
      assert.equal(events.at(-1).amount, r.payoutX100);
      for (const e of events.filter((x) => x.type === 'reveal')) {
        assert.equal(e.board.length, GRID.REELS);
        for (const col of e.board) assert.equal(col.length, GRID.ROWS);
      }
    }
  }
});

test('featureRng separado so muda o bonus, nao o giro base', () => {
  for (let i = 0; i < 2000; i++) {
    const a = engine.playRound({ rng: createSeededRng(`f${i}`), mode: 'hunt', featureRng: createSeededRng('A') });
    const b = engine.playRound({ rng: createSeededRng(`f${i}`), mode: 'hunt', featureRng: createSeededRng('B') });
    assert.equal(a.baseWinX100, b.baseWinX100);
    assert.equal(a.scatters, b.scatters);
    assert.equal(a.feature, b.feature);
  }
});

test('inclinacao dos pesos: theta 0 nao muda nada, theta > 0 sobe a media', () => {
  const w = [4, 3, 2, 1];
  const v = [2, 5, 10, 100];
  assert.deepEqual(tiltWeights(w, v, 0), w);
  const mean = (/** @type {number[]} */ ws) => ws.reduce((s, x, i) => s + x * v[i], 0) / ws.reduce((a, b) => a + b, 0);
  assert.ok(mean(tiltWeights(w, v, 0.3)) > mean(w));
  assert.ok(mean(tiltWeights(w, v, -0.3)) < mean(w));
});
