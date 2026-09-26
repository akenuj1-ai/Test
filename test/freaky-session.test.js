import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, moneyOf, formatMoney } from '../src/freaky/session.js';
import { createEngine } from '../src/freaky/round.js';
import { createProvablyFairRng } from '../src/engine/rng.js';
import { BET_LEVELS, MONEY_UNIT } from '../src/freaky/config.js';

const engine = createEngine();

test('moneyOf e exato e recusa aposta fora da grade de 100 micro-unidades', () => {
  assert.equal(moneyOf(MONEY_UNIT, 150), 1_500_000);
  assert.equal(moneyOf(200_000, 1), 2000);
  assert.throws(() => moneyOf(150, 1), RangeError);
  assert.throws(() => moneyOf(1.5, 1), TypeError);
});

test('formatMoney trunca nos centavos', () => {
  assert.match(formatMoney(1_999_999), /1,99/);
  assert.match(formatMoney(2_000_000), /2,00/);
});

test('contabilidade fecha ao centesimo de micro-unidade em todos os modos', () => {
  const start = 1_000_000 * MONEY_UNIT;
  const s = createSession({ engine, balance: start, serverSeed: 'a'.repeat(64) });
  for (const [i, mode] of ['base', 'hunt', 'lingua', 'festa', 'rave', 'base'].entries()) {
    s.setBet(BET_LEVELS[i]);
    for (let k = 0; k < (mode === 'festa' || mode === 'rave' ? 20 : 300); k++) {
      const out = s.play({ mode: /** @type {any} */ (mode) });
      assert.equal(out.balanceAfter, out.balanceBefore - out.cost + out.win);
      assert.ok(Number.isInteger(out.win) && out.win >= 0);
    }
  }
  const st = s.getStats();
  assert.equal(s.balance, start - st.wagered + st.won);
});

test('sem saldo, a rodada e recusada sem mexer em nada', () => {
  const s = createSession({ engine, balance: 50 * MONEY_UNIT });
  assert.equal(s.canAfford('festa'), false);
  assert.throws(() => s.play({ mode: 'festa' }), RangeError);
  assert.equal(s.balance, 50 * MONEY_UNIT);
  assert.equal(s.nonce, 0);
});

test('provably fair: a rodada se reconstroi com as sementes reveladas', () => {
  const s = createSession({ engine, serverSeed: 'semente-servidor', clientSeed: 'cliente' });
  const out = s.play({ mode: 'base' });
  const again = engine.playRound({
    rng: createProvablyFairRng({ serverSeed: 'semente-servidor', clientSeed: 'cliente', nonce: out.proof.nonce }),
    mode: 'base', trace: true,
  });
  assert.deepEqual(again, out.result);
  const revealed = s.rotateServerSeed();
  assert.equal(revealed.serverSeed, 'semente-servidor');
  assert.equal(revealed.hash, out.proof.serverSeedHash);
  assert.equal(s.nonce, 0);
});

test('aposta so nos niveis permitidos', () => {
  const s = createSession({ engine });
  assert.throws(() => s.setBet(123), RangeError);
  const top = BET_LEVELS[BET_LEVELS.length - 1];
  s.setBet(top);
  assert.equal(s.bet, top);
});
